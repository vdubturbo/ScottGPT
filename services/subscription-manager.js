/**
 * Subscription Lifecycle Manager
 * ==============================
 *
 * Comprehensive subscription management service handling:
 * - Subscription creation and activation
 * - Plan changes and upgrades/downgrades
 * - Cancellation and reactivation
 * - Grace periods and dunning management
 * - Failed payment recovery
 */

import Stripe from 'stripe';
import winston from 'winston';
import { supabase } from '../config/database.js';
import CONFIG from '../config/app-config.js';
import EmailService from './email-service.js';

const stripe = CONFIG.billing.stripe.secretKey
  ? new Stripe(CONFIG.billing.stripe.secretKey, {
      apiVersion: CONFIG.billing.stripe.apiVersion
    })
  : null;

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'subscription-manager' },
  transports: [
    new winston.transports.File({ filename: 'logs/subscription-manager.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class SubscriptionManager {
  constructor() {
    this.emailService = new EmailService();
    this.gracePeriodDays = CONFIG.billing.gracePeriodDays || 7;
    this.maxRetryAttempts = CONFIG.billing.maxRetryAttempts || 4;
  }

  /**
   * Create new subscription for user
   */
  async createSubscription(userId, planId, paymentMethodId) {
    try {
      logger.info('Creating subscription', {
        userId,
        planId,
        paymentMethodId: paymentMethodId ? 'provided' : 'missing'
      });

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('id, email, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error(`User not found: ${userId}`);
      }

      // Ensure user has Stripe customer
      let customerId = user.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: user.email,
          metadata: { userId }
        });
        customerId = customer.id;

        // Update user with customer ID
        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);
      }

      // Get plan configuration
      const planConfig = CONFIG.billing.plans[planId];
      if (!planConfig) {
        throw new Error(`Invalid plan: ${planId}`);
      }

      // Attach payment method if provided
      if (paymentMethodId) {
        await stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId
        });

        // Set as default payment method
        await stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId
          }
        });
      }

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: planConfig.stripePriceId }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          planId
        }
      });

      // Log subscription creation
      await this.logSubscriptionChange(userId, subscription.id, 'created', {
        planId,
        customerId,
        subscriptionStatus: subscription.status
      });

      logger.info('Subscription created successfully', {
        userId,
        subscriptionId: subscription.id,
        status: subscription.status
      });

      return {
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          clientSecret: subscription.latest_invoice.payment_intent.client_secret,
          currentPeriodEnd: subscription.current_period_end
        }
      };

    } catch (error) {
      logger.error('Subscription creation failed', {
        userId,
        planId,
        error: error.message,
        stack: error.stack
      });

      throw new Error(`Failed to create subscription: ${error.message}`);
    }
  }

  /**
   * Update subscription (plan change)
   */
  async updateSubscription(userId, newPlanId, options = {}) {
    try {
      logger.info('Updating subscription', {
        userId,
        newPlanId,
        options
      });

      // Get current subscription
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('stripe_subscription_id, subscription_tier')
        .eq('id', userId)
        .single();

      if (userError || !user?.stripe_subscription_id) {
        throw new Error('No active subscription found');
      }

      const currentSubscription = await stripe.subscriptions.retrieve(
        user.stripe_subscription_id
      );

      const newPlanConfig = CONFIG.billing.plans[newPlanId];
      if (!newPlanConfig) {
        throw new Error(`Invalid plan: ${newPlanId}`);
      }

      // Determine proration behavior
      const prorationBehavior = options.prorationBehavior || 'create_prorations';

      // Update subscription
      const updatedSubscription = await stripe.subscriptions.update(
        user.stripe_subscription_id,
        {
          items: [{
            id: currentSubscription.items.data[0].id,
            price: newPlanConfig.stripePriceId
          }],
          proration_behavior: prorationBehavior,
          metadata: {
            ...currentSubscription.metadata,
            planId: newPlanId,
            updatedAt: new Date().toISOString()
          }
        }
      );

      // Log subscription change
      await this.logSubscriptionChange(userId, user.stripe_subscription_id, 'updated', {
        oldPlan: user.subscription_tier,
        newPlan: newPlanId,
        prorationBehavior
      });

      logger.info('Subscription updated successfully', {
        userId,
        subscriptionId: user.stripe_subscription_id,
        oldPlan: user.subscription_tier,
        newPlan: newPlanId
      });

      return {
        success: true,
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          currentPeriodEnd: updatedSubscription.current_period_end
        }
      };

    } catch (error) {
      logger.error('Subscription update failed', {
        userId,
        newPlanId,
        error: error.message
      });

      throw new Error(`Failed to update subscription: ${error.message}`);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId, options = {}) {
    try {
      const {
        cancelAtPeriodEnd = true,
        reason = 'user_requested',
        feedback = null
      } = options;

      logger.info('Canceling subscription', {
        userId,
        cancelAtPeriodEnd,
        reason
      });

      // Get current subscription
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('stripe_subscription_id, email')
        .eq('id', userId)
        .single();

      if (userError || !user?.stripe_subscription_id) {
        throw new Error('No active subscription found');
      }

      let canceledSubscription;

      if (cancelAtPeriodEnd) {
        // Cancel at period end
        canceledSubscription = await stripe.subscriptions.update(
          user.stripe_subscription_id,
          {
            cancel_at_period_end: true,
            metadata: {
              cancellation_reason: reason,
              canceled_at: new Date().toISOString(),
              feedback: feedback || ''
            }
          }
        );
      } else {
        // Cancel immediately
        canceledSubscription = await stripe.subscriptions.cancel(
          user.stripe_subscription_id,
          {
            metadata: {
              cancellation_reason: reason,
              feedback: feedback || ''
            }
          }
        );
      }

      // Log cancellation
      await this.logSubscriptionChange(userId, user.stripe_subscription_id, 'canceled', {
        cancelAtPeriodEnd,
        reason,
        feedback,
        effectiveDate: cancelAtPeriodEnd
          ? new Date(canceledSubscription.current_period_end * 1000)
          : new Date()
      });

      // Send cancellation email
      const effectiveDate = cancelAtPeriodEnd
        ? new Date(canceledSubscription.current_period_end * 1000)
        : new Date();

      await this.emailService.sendSubscriptionCanceled(user.email, {
        effectiveDate,
        reason,
        reactivationUrl: `${CONFIG.app.baseUrl}/billing`
      });

      logger.info('Subscription canceled successfully', {
        userId,
        subscriptionId: user.stripe_subscription_id,
        cancelAtPeriodEnd,
        effectiveDate
      });

      return {
        success: true,
        cancellation: {
          cancelAtPeriodEnd,
          effectiveDate,
          subscriptionId: user.stripe_subscription_id
        }
      };

    } catch (error) {
      logger.error('Subscription cancellation failed', {
        userId,
        error: error.message
      });

      throw new Error(`Failed to cancel subscription: ${error.message}`);
    }
  }

  /**
   * Reactivate canceled subscription
   */
  async reactivateSubscription(userId) {
    try {
      logger.info('Reactivating subscription', { userId });

      // Get current subscription
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('stripe_subscription_id, email')
        .eq('id', userId)
        .single();

      if (userError || !user?.stripe_subscription_id) {
        throw new Error('No subscription found');
      }

      const subscription = await stripe.subscriptions.retrieve(
        user.stripe_subscription_id
      );

      if (!subscription.cancel_at_period_end) {
        throw new Error('Subscription is not scheduled for cancellation');
      }

      // Remove cancellation
      const reactivatedSubscription = await stripe.subscriptions.update(
        user.stripe_subscription_id,
        {
          cancel_at_period_end: false,
          metadata: {
            ...subscription.metadata,
            reactivated_at: new Date().toISOString()
          }
        }
      );

      // Log reactivation
      await this.logSubscriptionChange(userId, user.stripe_subscription_id, 'reactivated', {
        reactivatedAt: new Date(),
        previousCancellationDate: new Date(subscription.current_period_end * 1000)
      });

      logger.info('Subscription reactivated successfully', {
        userId,
        subscriptionId: user.stripe_subscription_id
      });

      return {
        success: true,
        subscription: {
          id: reactivatedSubscription.id,
          status: reactivatedSubscription.status,
          currentPeriodEnd: reactivatedSubscription.current_period_end
        }
      };

    } catch (error) {
      logger.error('Subscription reactivation failed', {
        userId,
        error: error.message
      });

      throw new Error(`Failed to reactivate subscription: ${error.message}`);
    }
  }

  /**
   * Handle failed payment recovery
   */
  async handleFailedPayment(subscriptionId, invoice) {
    try {
      logger.info('Handling failed payment', {
        subscriptionId,
        invoiceId: invoice.id,
        attemptCount: invoice.attempt_count
      });

      // Get user by subscription
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('id, email, subscription_tier')
        .eq('stripe_subscription_id', subscriptionId)
        .single();

      if (userError || !user) {
        logger.warn('User not found for failed payment', { subscriptionId });
        return;
      }

      // Determine recovery strategy based on attempt count
      if (invoice.attempt_count <= this.maxRetryAttempts) {
        // Within retry window - send payment reminder
        await this.emailService.sendPaymentFailed(user.email, {
          amount: invoice.amount_due,
          currency: invoice.currency,
          attemptCount: invoice.attempt_count,
          nextPaymentAttempt: invoice.next_payment_attempt,
          updatePaymentUrl: `${CONFIG.app.baseUrl}/billing`
        });

        logger.info('Payment failure email sent', {
          userId: user.id,
          attemptCount: invoice.attempt_count
        });
      } else {
        // Max retries exceeded - handle dunning
        await this.handleDunning(user.id, subscriptionId, invoice);
      }

      // Log the failed payment
      await supabase
        .from('payment_attempts')
        .insert({
          user_id: user.id,
          amount: invoice.amount_due,
          currency: invoice.currency,
          status: 'failed',
          failure_reason: 'payment_failed',
          stripe_payment_intent_id: invoice.payment_intent,
          created_at: new Date().toISOString()
        });

    } catch (error) {
      logger.error('Failed payment handling error', {
        subscriptionId,
        error: error.message
      });
    }
  }

  /**
   * Handle dunning process for failed payments
   */
  async handleDunning(userId, subscriptionId, invoice) {
    try {
      logger.info('Starting dunning process', {
        userId,
        subscriptionId,
        invoiceId: invoice.id
      });

      // Get user data
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('email, subscription_tier')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        throw new Error('User not found for dunning');
      }

      // Start grace period
      const gracePeriodEnd = new Date();
      gracePeriodEnd.setDate(gracePeriodEnd.getDate() + this.gracePeriodDays);

      // Update subscription to reflect grace period
      await supabase
        .from('user_profiles')
        .update({
          subscription_status: 'past_due',
          grace_period_end: gracePeriodEnd.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Send final payment notice
      await this.emailService.sendFinalPaymentNotice(user.email, {
        amount: invoice.amount_due,
        currency: invoice.currency,
        gracePeriodEnd,
        updatePaymentUrl: `${CONFIG.app.baseUrl}/billing`
      });

      // Schedule grace period expiration check
      setTimeout(() => {
        this.checkGracePeriodExpiration(userId, subscriptionId);
      }, this.gracePeriodDays * 24 * 60 * 60 * 1000);

      logger.info('Dunning process initiated', {
        userId,
        gracePeriodEnd
      });

    } catch (error) {
      logger.error('Dunning process failed', {
        userId,
        subscriptionId,
        error: error.message
      });
    }
  }

  /**
   * Check if grace period has expired
   */
  async checkGracePeriodExpiration(userId, subscriptionId) {
    try {
      // Get current user status
      const { data: user, error: userError } = await supabase
        .from('user_profiles')
        .select('subscription_status, grace_period_end, email')
        .eq('id', userId)
        .single();

      if (userError || !user) {
        return;
      }

      // Check if still in grace period
      const now = new Date();
      const gracePeriodEnd = new Date(user.grace_period_end);

      if (now <= gracePeriodEnd || user.subscription_status === 'active') {
        // Grace period not expired or subscription reactivated
        return;
      }

      // Grace period expired - cancel subscription
      await stripe.subscriptions.cancel(subscriptionId);

      // Downgrade user to free tier
      await this.downgradeToFreeTier(userId);

      // Send account suspended email
      await this.emailService.sendAccountSuspended(user.email, {
        suspensionDate: now,
        reactivationUrl: `${CONFIG.app.baseUrl}/billing`
      });

      logger.info('Grace period expired, subscription canceled', {
        userId,
        subscriptionId
      });

    } catch (error) {
      logger.error('Grace period expiration check failed', {
        userId,
        subscriptionId,
        error: error.message
      });
    }
  }

  /**
   * Downgrade user to free tier
   */
  async downgradeToFreeTier(userId) {
    const nextResetDate = new Date();
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    nextResetDate.setDate(1);
    nextResetDate.setHours(0, 0, 0, 0);

    await supabase
      .from('user_profiles')
      .update({
        subscription_tier: 'free',
        subscription_status: 'inactive',
        subscription_start_date: null,
        subscription_end_date: null,
        stripe_subscription_id: null,
        subscription_cancel_at_period_end: false,
        resume_count_limit: CONFIG.billing.plans.free.resumeLimit,
        resume_count_reset_date: nextResetDate.toISOString(),
        grace_period_end: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    logger.info('User downgraded to free tier', { userId });
  }

  /**
   * Log subscription lifecycle changes
   */
  async logSubscriptionChange(userId, subscriptionId, action, metadata = {}) {
    try {
      await supabase
        .from('subscription_history')
        .insert({
          user_id: userId,
          stripe_subscription_id: subscriptionId,
          action,
          metadata,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Failed to log subscription change', {
        userId,
        subscriptionId,
        action,
        error: error.message
      });
    }
  }

  /**
   * Get subscription analytics
   */
  async getSubscriptionAnalytics(days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const { data, error } = await supabase
        .from('subscription_history')
        .select('action, created_at, metadata')
        .gte('created_at', since.toISOString());

      if (error) {
        throw error;
      }

      const analytics = {
        totalEvents: data.length,
        created: data.filter(e => e.action === 'created').length,
        updated: data.filter(e => e.action === 'updated').length,
        canceled: data.filter(e => e.action === 'canceled').length,
        reactivated: data.filter(e => e.action === 'reactivated').length,
        churnRate: 0,
        avgLifetime: 0
      };

      // Calculate churn rate
      if (analytics.created > 0) {
        analytics.churnRate = (analytics.canceled / analytics.created) * 100;
      }

      return analytics;
    } catch (error) {
      logger.error('Failed to get subscription analytics', {
        error: error.message
      });
      return null;
    }
  }
}

export default SubscriptionManager;