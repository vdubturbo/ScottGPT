/**
 * Billing Service - Stripe Integration for ScottGPT
 * ================================================
 *
 * Handles all Stripe billing operations including:
 * - Customer creation and management
 * - Subscription lifecycle (create, update, cancel)
 * - One-time purchases for additional resume credits
 * - Usage tracking and limit enforcement
 * - Webhook event processing
 * - Payment retry logic and error handling
 */

import Stripe from 'stripe';
import { supabase } from '../config/database.js';
import CONFIG from '../config/app-config.js';
import winston from 'winston';

// Initialize Stripe with configuration (if credentials are available)
const stripe = CONFIG.billing.stripe.secretKey
  ? new Stripe(CONFIG.billing.stripe.secretKey, {
      apiVersion: CONFIG.billing.stripe.apiVersion,
      timeout: CONFIG.billing.stripe.timeout,
      maxNetworkRetries: CONFIG.billing.stripe.maxNetworkRetries
    })
  : null;

// Helper function to check if Stripe is configured
const isStripeConfigured = () => {
  return stripe !== null && CONFIG.billing.stripe.secretKey && CONFIG.billing.stripe.publishableKey;
};

// Setup logging for billing operations
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'billing' },
  transports: [
    new winston.transports.File({ filename: 'logs/billing-error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/billing.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class BillingService {
  /**
   * Check if Stripe is configured and throw error if not
   */
  _ensureStripeConfigured() {
    if (!isStripeConfigured()) {
      throw new Error('Stripe not configured: missing API keys in environment variables');
    }
  }

  /**
   * Create or retrieve Stripe customer for user
   */
  async createCustomer(userId, userEmail, userMetadata = {}) {
    this._ensureStripeConfigured();

    try {
      logger.info('Creating Stripe customer', { userId, userEmail });

      // Check if customer already exists
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      if (profile?.stripe_customer_id) {
        // Verify customer exists in Stripe
        try {
          const customer = await stripe.customers.retrieve(profile.stripe_customer_id);
          logger.info('Existing Stripe customer found', {
            userId,
            customerId: profile.stripe_customer_id
          });
          return customer;
        } catch (error) {
          logger.warn('Stripe customer not found, creating new one', {
            userId,
            oldCustomerId: profile.stripe_customer_id
          });
        }
      }

      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: {
          userId,
          ...userMetadata
        }
      });

      // Update user profile with customer ID
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          stripe_customer_id: customer.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        logger.error('Failed to update user profile with customer ID', {
          userId,
          customerId: customer.id,
          error: updateError
        });
        throw new Error('Failed to link Stripe customer to user profile');
      }

      logger.info('Stripe customer created successfully', {
        userId,
        customerId: customer.id
      });

      return customer;

    } catch (error) {
      logger.error('Failed to create Stripe customer', {
        userId,
        userEmail,
        error: error.message
      });
      throw new Error(`Customer creation failed: ${error.message}`);
    }
  }

  /**
   * Create premium subscription
   */
  async createSubscription(userId, priceId, paymentMethodId = null) {
    try {
      logger.info('Creating subscription', { userId, priceId });

      // Get user profile and ensure customer exists
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id, email, subscription_status')
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Check if user already has active subscription
      if (profile.subscription_status === 'active') {
        throw new Error('User already has an active subscription');
      }

      let customerId = profile.stripe_customer_id;

      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await this.createCustomer(userId, profile.email);
        customerId = customer.id;
      }

      const subscriptionData = {
        customer: customerId,
        items: [{ price: priceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          plan: 'premium'
        }
      };

      // Attach payment method if provided
      if (paymentMethodId) {
        subscriptionData.default_payment_method = paymentMethodId;
      }

      const subscription = await stripe.subscriptions.create(subscriptionData);

      // Update user profile with subscription info
      await this.updateSubscriptionStatus(
        userId,
        subscription.id,
        subscription.status,
        'premium',
        new Date(subscription.created * 1000),
        new Date(subscription.current_period_end * 1000)
      );

      // Log transaction
      await this.logTransaction(
        userId,
        subscription.latest_invoice?.payment_intent?.id || null,
        subscription.latest_invoice?.id || null,
        'subscription',
        CONFIG.billing.plans.premium.price,
        subscription.status === 'active' ? 'succeeded' : 'pending',
        'Premium subscription created'
      );

      logger.info('Subscription created successfully', {
        userId,
        subscriptionId: subscription.id,
        status: subscription.status
      });

      return {
        subscription,
        clientSecret: subscription.latest_invoice?.payment_intent?.client_secret,
        requiresAction: subscription.status === 'incomplete'
      };

    } catch (error) {
      logger.error('Failed to create subscription', {
        userId,
        priceId,
        error: error.message
      });
      throw new Error(`Subscription creation failed: ${error.message}`);
    }
  }

  /**
   * Purchase additional resume credits (one-time)
   */
  async purchaseResumeCredits(userId, credits = 1) {
    try {
      logger.info('Processing resume credits purchase', { userId, credits });

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_customer_id, email, subscription_tier')
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Only allow one-time purchases for free tier users
      if (profile.subscription_tier !== 'free') {
        throw new Error('One-time purchases are only available for free tier users');
      }

      let customerId = profile.stripe_customer_id;

      // Create customer if doesn't exist
      if (!customerId) {
        const customer = await this.createCustomer(userId, profile.email);
        customerId = customer.id;
      }

      const amount = CONFIG.billing.oneTimePurchases.additionalResume.price * credits;

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: CONFIG.billing.stripe.currency,
        customer: customerId,
        metadata: {
          userId,
          type: 'resume_credits',
          credits: credits.toString()
        },
        description: `${credits} additional resume generation${credits > 1 ? 's' : ''}`
      });

      // Log transaction
      await this.logTransaction(
        userId,
        paymentIntent.id,
        null,
        'one_time_purchase',
        amount,
        'pending',
        `Purchase of ${credits} resume credit${credits > 1 ? 's' : ''}`,
        credits
      );

      logger.info('Resume credits purchase initiated', {
        userId,
        paymentIntentId: paymentIntent.id,
        amount,
        credits
      });

      return {
        paymentIntent,
        clientSecret: paymentIntent.client_secret
      };

    } catch (error) {
      logger.error('Failed to process resume credits purchase', {
        userId,
        credits,
        error: error.message
      });
      throw new Error(`Resume credits purchase failed: ${error.message}`);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId, cancelAtPeriodEnd = true) {
    try {
      logger.info('Canceling subscription', { userId, cancelAtPeriodEnd });

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('stripe_subscription_id, subscription_status')
        .eq('id', userId)
        .single();

      if (!profile?.stripe_subscription_id) {
        throw new Error('No active subscription found');
      }

      let subscription;

      if (cancelAtPeriodEnd) {
        // Cancel at period end (downgrade at next billing cycle)
        subscription = await stripe.subscriptions.update(profile.stripe_subscription_id, {
          cancel_at_period_end: true
        });

        await supabase
          .from('user_profiles')
          .update({
            subscription_cancel_at_period_end: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

      } else {
        // Cancel immediately
        subscription = await stripe.subscriptions.cancel(profile.stripe_subscription_id);

        await this.updateSubscriptionStatus(
          userId,
          subscription.id,
          'canceled',
          'free',
          null,
          null,
          false
        );
      }

      logger.info('Subscription canceled successfully', {
        userId,
        subscriptionId: subscription.id,
        cancelAtPeriodEnd
      });

      return subscription;

    } catch (error) {
      logger.error('Failed to cancel subscription', {
        userId,
        error: error.message
      });
      throw new Error(`Subscription cancellation failed: ${error.message}`);
    }
  }

  /**
   * Get subscription and usage status for user
   */
  async getSubscriptionStatus(userId) {
    try {
      const { data: profile } = await supabase
        .from('user_profiles')
        .select(`
          stripe_customer_id,
          stripe_subscription_id,
          subscription_status,
          subscription_tier,
          subscription_start_date,
          subscription_end_date,
          subscription_cancel_at_period_end,
          resume_count_used,
          resume_count_limit,
          resume_count_reset_date,
          total_lifetime_resumes,
          last_payment_date,
          last_payment_amount
        `)
        .eq('id', userId)
        .single();

      if (!profile) {
        throw new Error('User profile not found');
      }

      // Check if usage needs to be reset
      const now = new Date();
      const resetDate = new Date(profile.resume_count_reset_date);
      const needsReset = resetDate <= now;

      if (needsReset && profile.subscription_status === 'active') {
        await this.resetMonthlyUsage(userId);
        // Refresh profile data after reset
        const { data: updatedProfile } = await supabase
          .from('user_profiles')
          .select('resume_count_used, resume_count_reset_date')
          .eq('id', userId)
          .single();

        profile.resume_count_used = updatedProfile.resume_count_used;
        profile.resume_count_reset_date = updatedProfile.resume_count_reset_date;
      }

      const planInfo = profile.subscription_tier === 'premium'
        ? CONFIG.billing.plans.premium
        : CONFIG.billing.plans.free;

      return {
        subscription: {
          status: profile.subscription_status,
          tier: profile.subscription_tier,
          startDate: profile.subscription_start_date,
          endDate: profile.subscription_end_date,
          cancelAtPeriodEnd: profile.subscription_cancel_at_period_end,
          stripePriceId: planInfo.stripePriceId
        },
        usage: {
          resumeCountUsed: profile.resume_count_used,
          resumeCountLimit: profile.resume_count_limit,
          resumeCountRemaining: profile.resume_count_limit - profile.resume_count_used,
          resetDate: profile.resume_count_reset_date,
          totalLifetimeResumes: profile.total_lifetime_resumes,
          canGenerateResume: profile.resume_count_used < profile.resume_count_limit
        },
        billing: {
          lastPaymentDate: profile.last_payment_date,
          lastPaymentAmount: profile.last_payment_amount
        },
        plan: planInfo
      };

    } catch (error) {
      logger.error('Failed to get subscription status', {
        userId,
        error: error.message
      });
      throw new Error(`Failed to retrieve subscription status: ${error.message}`);
    }
  }

  /**
   * Check if user can generate resume and increment usage
   */
  async checkAndIncrementUsage(userId) {
    try {
      // Use database function for atomic operation
      const { data, error } = await supabase
        .rpc('increment_resume_usage', { p_user_id: userId });

      if (error) {
        logger.error('Failed to increment resume usage', { userId, error });
        throw new Error('Failed to check usage limits');
      }

      const canGenerate = data === true;

      if (canGenerate) {
        logger.info('Resume usage incremented', { userId });
      } else {
        logger.warn('Resume generation blocked - limit exceeded', { userId });
      }

      return canGenerate;

    } catch (error) {
      logger.error('Failed to check and increment usage', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Reset monthly usage for a user
   */
  async resetMonthlyUsage(userId) {
    try {
      const nextResetDate = new Date();
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);

      const { error } = await supabase
        .from('user_profiles')
        .update({
          resume_count_used: 0,
          resume_count_reset_date: nextResetDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      logger.info('Monthly usage reset for user', { userId, nextResetDate });

    } catch (error) {
      logger.error('Failed to reset monthly usage', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Update subscription status in database
   */
  async updateSubscriptionStatus(userId, subscriptionId, status, tier, startDate, endDate, cancelAtPeriodEnd = false) {
    try {
      const resumeLimit = tier === 'premium' ?
        CONFIG.billing.plans.premium.resumeLimit :
        CONFIG.billing.plans.free.resumeLimit;

      const { error } = await supabase
        .from('user_profiles')
        .update({
          stripe_subscription_id: subscriptionId,
          subscription_status: status,
          subscription_tier: tier,
          subscription_start_date: startDate?.toISOString(),
          subscription_end_date: endDate?.toISOString(),
          subscription_cancel_at_period_end: cancelAtPeriodEnd,
          resume_count_limit: resumeLimit,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      logger.info('Subscription status updated', {
        userId,
        subscriptionId,
        status,
        tier
      });

    } catch (error) {
      logger.error('Failed to update subscription status', {
        userId,
        subscriptionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Log billing transaction
   */
  async logTransaction(userId, paymentIntentId, invoiceId, type, amount, status, description, resumeCredits = 0, metadata = {}) {
    try {
      const { error } = await supabase
        .from('billing_transactions')
        .insert({
          user_id: userId,
          stripe_payment_intent_id: paymentIntentId,
          stripe_invoice_id: invoiceId,
          transaction_type: type,
          amount,
          currency: CONFIG.billing.stripe.currency,
          status,
          description,
          resume_credits_added: resumeCredits,
          metadata
        });

      if (error) {
        logger.error('Failed to log transaction', {
          userId,
          paymentIntentId,
          error
        });
        throw error;
      }

      logger.info('Transaction logged', {
        userId,
        paymentIntentId,
        type,
        amount,
        status
      });

    } catch (error) {
      logger.error('Failed to log transaction', {
        userId,
        paymentIntentId,
        error: error.message
      });
      // Don't throw here - transaction logging shouldn't break main flow
    }
  }

  /**
   * Process Stripe webhook events
   */
  async processWebhook(event) {
    try {
      logger.info('Processing webhook event', {
        eventId: event.id,
        type: event.type
      });

      // Check if event already processed
      const { data: existingEvent } = await supabase
        .from('subscription_events')
        .select('id')
        .eq('stripe_event_id', event.id)
        .single();

      if (existingEvent) {
        logger.info('Event already processed', { eventId: event.id });
        return { processed: true, reason: 'already_processed' };
      }

      // Log event
      await supabase
        .from('subscription_events')
        .insert({
          stripe_event_id: event.id,
          event_type: event.type,
          event_data: event.data,
          processed: false
        });

      let result = { processed: false };

      switch (event.type) {
        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          result = await this.handleSubscriptionUpdated(event.data.object);
          break;

        case 'customer.subscription.deleted':
          result = await this.handleSubscriptionDeleted(event.data.object);
          break;

        case 'invoice.payment_succeeded':
          result = await this.handlePaymentSucceeded(event.data.object);
          break;

        case 'invoice.payment_failed':
          result = await this.handlePaymentFailed(event.data.object);
          break;

        case 'payment_intent.succeeded':
          result = await this.handlePaymentIntentSucceeded(event.data.object);
          break;

        case 'payment_intent.payment_failed':
          result = await this.handlePaymentIntentFailed(event.data.object);
          break;

        default:
          logger.info('Unhandled webhook event type', { type: event.type });
          result = { processed: true, reason: 'unhandled_event_type' };
      }

      // Mark event as processed
      await supabase
        .from('subscription_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString()
        })
        .eq('stripe_event_id', event.id);

      logger.info('Webhook event processed successfully', {
        eventId: event.id,
        type: event.type,
        result
      });

      return result;

    } catch (error) {
      logger.error('Failed to process webhook event', {
        eventId: event.id,
        type: event.type,
        error: error.message
      });

      // Log error in event record
      await supabase
        .from('subscription_events')
        .update({
          processing_error: error.message
        })
        .eq('stripe_event_id', event.id);

      throw error;
    }
  }

  /**
   * Handle subscription created/updated webhook
   */
  async handleSubscriptionUpdated(subscription) {
    try {
      const userId = subscription.metadata?.userId;
      if (!userId) {
        throw new Error('No userId in subscription metadata');
      }

      const status = subscription.status;
      const tier = subscription.metadata?.plan || 'premium';
      const startDate = new Date(subscription.created * 1000);
      const endDate = new Date(subscription.current_period_end * 1000);

      await this.updateSubscriptionStatus(
        userId,
        subscription.id,
        status,
        tier,
        startDate,
        endDate,
        subscription.cancel_at_period_end
      );

      return { processed: true, userId, subscriptionId: subscription.id };

    } catch (error) {
      logger.error('Failed to handle subscription updated', {
        subscriptionId: subscription.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle subscription deleted webhook
   */
  async handleSubscriptionDeleted(subscription) {
    try {
      const userId = subscription.metadata?.userId;
      if (!userId) {
        throw new Error('No userId in subscription metadata');
      }

      await this.updateSubscriptionStatus(
        userId,
        subscription.id,
        'canceled',
        'free',
        null,
        null,
        false
      );

      return { processed: true, userId, subscriptionId: subscription.id };

    } catch (error) {
      logger.error('Failed to handle subscription deleted', {
        subscriptionId: subscription.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle successful payment webhook
   */
  async handlePaymentSucceeded(invoice) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = subscription.metadata?.userId;

      if (!userId) {
        throw new Error('No userId in subscription metadata');
      }

      // Update payment information
      await supabase
        .from('user_profiles')
        .update({
          last_payment_date: new Date().toISOString(),
          last_payment_amount: invoice.amount_paid / 100,
          billing_cycle_start: new Date(invoice.period_start * 1000).toISOString(),
          billing_cycle_end: new Date(invoice.period_end * 1000).toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Log successful payment
      await this.logTransaction(
        userId,
        invoice.payment_intent,
        invoice.id,
        'subscription',
        invoice.amount_paid / 100,
        'succeeded',
        'Subscription payment succeeded'
      );

      return { processed: true, userId, invoiceId: invoice.id };

    } catch (error) {
      logger.error('Failed to handle payment succeeded', {
        invoiceId: invoice.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle failed payment webhook
   */
  async handlePaymentFailed(invoice) {
    try {
      const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
      const userId = subscription.metadata?.userId;

      if (!userId) {
        throw new Error('No userId in subscription metadata');
      }

      // Update subscription status to past_due
      await this.updateSubscriptionStatus(
        userId,
        subscription.id,
        'past_due',
        'premium', // Keep premium tier but mark as past due
        new Date(subscription.created * 1000),
        new Date(subscription.current_period_end * 1000)
      );

      // Log failed payment
      await this.logTransaction(
        userId,
        invoice.payment_intent,
        invoice.id,
        'subscription',
        invoice.amount_due / 100,
        'failed',
        'Subscription payment failed'
      );

      return { processed: true, userId, invoiceId: invoice.id };

    } catch (error) {
      logger.error('Failed to handle payment failed', {
        invoiceId: invoice.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle successful payment intent (one-time purchases)
   */
  async handlePaymentIntentSucceeded(paymentIntent) {
    try {
      const userId = paymentIntent.metadata?.userId;
      const credits = parseInt(paymentIntent.metadata?.credits || '1', 10);

      if (!userId) {
        throw new Error('No userId in payment intent metadata');
      }

      // Add resume credits to user account
      const { error } = await supabase
        .from('user_profiles')
        .update({
          resume_count_limit: supabase.raw('resume_count_limit + ?', [credits]),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        throw error;
      }

      // Update transaction status
      await supabase
        .from('billing_transactions')
        .update({
          status: 'succeeded',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      return { processed: true, userId, paymentIntentId: paymentIntent.id, credits };

    } catch (error) {
      logger.error('Failed to handle payment intent succeeded', {
        paymentIntentId: paymentIntent.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Handle failed payment intent
   */
  async handlePaymentIntentFailed(paymentIntent) {
    try {
      // Update transaction status
      await supabase
        .from('billing_transactions')
        .update({
          status: 'failed',
          updated_at: new Date().toISOString()
        })
        .eq('stripe_payment_intent_id', paymentIntent.id);

      return { processed: true, paymentIntentId: paymentIntent.id };

    } catch (error) {
      logger.error('Failed to handle payment intent failed', {
        paymentIntentId: paymentIntent.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload, signature) {
    try {
      if (!CONFIG.billing.stripe.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      return stripe.webhooks.constructEvent(
        payload,
        signature,
        CONFIG.billing.stripe.webhookSecret
      );

    } catch (error) {
      logger.error('Webhook signature verification failed', { error: error.message });
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Get billing history for user
   */
  async getBillingHistory(userId, limit = 20, offset = 0) {
    try {
      const { data, error } = await supabase
        .from('billing_transactions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return data;

    } catch (error) {
      logger.error('Failed to get billing history', {
        userId,
        error: error.message
      });
      throw error;
    }
  }
}

export default BillingService;