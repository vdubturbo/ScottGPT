/**
 * Stripe Webhook Handler Service
 * ==============================
 *
 * Secure webhook processing system for Stripe payment events.
 * Handles signature verification, idempotency, and real-time subscription updates.
 */

import Stripe from 'stripe';
import crypto from 'crypto';
import winston from 'winston';
import { supabase } from '../config/database.js';
import CONFIG from '../config/app-config.js';
import EmailService from './email-service.js';
import OneTimePaymentService from './one-time-payment.js';

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
  defaultMeta: { service: 'webhook-handler' },
  transports: [
    new winston.transports.File({ filename: 'logs/webhooks.log' }),
    new winston.transports.File({ filename: 'logs/webhook-errors.log', level: 'error' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

export class WebhookHandler {
  constructor() {
    this.webhookSecret = CONFIG.billing.stripe.webhookSecret;
    this.processedEvents = new Map(); // In-memory cache for recent events
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second base delay
    this.emailService = new EmailService();
    this.oneTimePaymentService = new OneTimePaymentService();
  }

  /**
   * Verify webhook signature and extract event
   */
  async verifyWebhookSignature(rawBody, signature) {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    try {
      const event = stripe.webhooks.constructEvent(
        rawBody,
        signature,
        this.webhookSecret
      );

      logger.info('Webhook signature verified', {
        eventId: event.id,
        eventType: event.type,
        created: event.created
      });

      return event;
    } catch (error) {
      logger.error('Webhook signature verification failed', {
        error: error.message,
        signature: signature ? 'present' : 'missing'
      });
      throw new Error(`Webhook signature verification failed: ${error.message}`);
    }
  }

  /**
   * Check if event has already been processed (idempotency)
   */
  async isEventProcessed(eventId) {
    // Check in-memory cache first
    if (this.processedEvents.has(eventId)) {
      return true;
    }

    // Check database for persistent storage
    const { data, error } = await supabase
      .from('webhook_events')
      .select('id')
      .eq('stripe_event_id', eventId)
      .eq('status', 'processed')
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logger.error('Failed to check event processing status', {
        eventId,
        error: error.message
      });
    }

    return !!data;
  }

  /**
   * Mark event as processed
   */
  async markEventProcessed(event) {
    // Add to in-memory cache
    this.processedEvents.set(event.id, {
      processedAt: new Date(),
      eventType: event.type
    });

    // Clean up old entries (keep last 1000)
    if (this.processedEvents.size > 1000) {
      const entries = Array.from(this.processedEvents.entries());
      const toDelete = entries.slice(0, entries.length - 1000);
      toDelete.forEach(([key]) => this.processedEvents.delete(key));
    }

    // Store in database for persistence
    try {
      await supabase
        .from('webhook_events')
        .upsert({
          stripe_event_id: event.id,
          event_type: event.type,
          status: 'processed',
          data: event.data,
          processed_at: new Date().toISOString(),
          created_at: new Date(event.created * 1000).toISOString()
        });
    } catch (error) {
      logger.error('Failed to mark event as processed in database', {
        eventId: event.id,
        error: error.message
      });
    }
  }

  /**
   * Process webhook event with retry logic
   */
  async processEvent(event, attempt = 1) {
    try {
      logger.info('Processing webhook event', {
        eventId: event.id,
        eventType: event.type,
        attempt
      });

      // Check idempotency
      if (await this.isEventProcessed(event.id)) {
        logger.info('Event already processed, skipping', {
          eventId: event.id,
          eventType: event.type
        });
        return { success: true, skipped: true };
      }

      // Process based on event type
      const result = await this.handleEventType(event);

      // Mark as processed on success
      if (result.success) {
        await this.markEventProcessed(event);
        logger.info('Event processed successfully', {
          eventId: event.id,
          eventType: event.type,
          result
        });
      }

      return result;

    } catch (error) {
      logger.error('Event processing failed', {
        eventId: event.id,
        eventType: event.type,
        attempt,
        error: error.message,
        stack: error.stack
      });

      // Retry logic
      if (attempt < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.info('Retrying event processing', {
          eventId: event.id,
          attempt: attempt + 1,
          delayMs: delay
        });

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.processEvent(event, attempt + 1);
      }

      // Mark as failed after all retries
      await this.markEventFailed(event, error);
      throw error;
    }
  }

  /**
   * Handle specific event types
   */
  async handleEventType(event) {
    switch (event.type) {
      case 'customer.subscription.created':
        return await this.handleSubscriptionCreated(event);

      case 'customer.subscription.updated':
        return await this.handleSubscriptionUpdated(event);

      case 'customer.subscription.deleted':
        return await this.handleSubscriptionDeleted(event);

      case 'invoice.payment_succeeded':
        return await this.handlePaymentSucceeded(event);

      case 'invoice.payment_failed':
        return await this.handlePaymentFailed(event);

      case 'payment_intent.succeeded':
        return await this.handleOneTimePaymentSucceeded(event);

      case 'payment_intent.payment_failed':
        return await this.handleOneTimePaymentFailed(event);

      case 'customer.created':
        return await this.handleCustomerCreated(event);

      case 'customer.updated':
        return await this.handleCustomerUpdated(event);

      default:
        logger.info('Unhandled event type', {
          eventId: event.id,
          eventType: event.type
        });
        return { success: true, handled: false };
    }
  }

  /**
   * Handle subscription created
   */
  async handleSubscriptionCreated(event) {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    logger.info('Processing subscription created', {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status
    });

    // Get user by Stripe customer ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      throw new Error(`User not found for customer ${customerId}`);
    }

    // Update user subscription
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_tier: 'premium',
        subscription_status: subscription.status,
        subscription_start_date: new Date(subscription.created * 1000).toISOString(),
        subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
        subscription_cancel_at_period_end: subscription.cancel_at_period_end,
        resume_count_limit: CONFIG.billing.plans.premium.resumeLimit,
        resume_count_reset_date: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Failed to update user subscription: ${updateError.message}`);
    }

    // Send welcome email
    await this.emailService.sendSubscriptionWelcome(user.email, {
      planType: 'premium',
      resumeLimit: CONFIG.billing.plans.premium.resumeLimit,
      billingPeriod: 'monthly'
    });

    // Log revenue event
    await this.logRevenueEvent('subscription_created', {
      userId: user.id,
      subscriptionId: subscription.id,
      amount: subscription.items.data[0]?.price?.unit_amount || 0,
      currency: subscription.currency
    });

    return { success: true, userId: user.id, action: 'subscription_activated' };
  }

  /**
   * Handle subscription updated
   */
  async handleSubscriptionUpdated(event) {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    logger.info('Processing subscription updated', {
      subscriptionId: subscription.id,
      customerId,
      status: subscription.status
    });

    // Get user by Stripe customer ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      throw new Error(`User not found for customer ${customerId}`);
    }

    // Determine subscription tier based on status
    let subscriptionTier = 'free';
    let resumeLimit = CONFIG.billing.plans.free.resumeLimit;

    if (subscription.status === 'active') {
      subscriptionTier = 'premium';
      resumeLimit = CONFIG.billing.plans.premium.resumeLimit;
    }

    // Update user subscription
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_tier: subscriptionTier,
        subscription_status: subscription.status,
        subscription_end_date: new Date(subscription.current_period_end * 1000).toISOString(),
        subscription_cancel_at_period_end: subscription.cancel_at_period_end,
        resume_count_limit: resumeLimit,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Failed to update user subscription: ${updateError.message}`);
    }

    // Handle status changes
    if (subscription.status === 'canceled') {
      await this.emailService.sendSubscriptionCanceled(user.email, {
        effectiveDate: new Date(subscription.canceled_at * 1000)
      });
    } else if (subscription.status === 'past_due') {
      await this.emailService.sendPaymentFailed(user.email, {
        amount: subscription.items.data[0]?.price?.unit_amount || 0,
        currency: subscription.currency
      });
    }

    return { success: true, userId: user.id, action: 'subscription_updated', status: subscription.status };
  }

  /**
   * Handle subscription deleted
   */
  async handleSubscriptionDeleted(event) {
    const subscription = event.data.object;
    const customerId = subscription.customer;

    logger.info('Processing subscription deleted', {
      subscriptionId: subscription.id,
      customerId
    });

    // Get user by Stripe customer ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('stripe_customer_id', customerId)
      .single();

    if (userError || !user) {
      throw new Error(`User not found for customer ${customerId}`);
    }

    // Downgrade user to free tier
    const nextResetDate = new Date();
    nextResetDate.setMonth(nextResetDate.getMonth() + 1);
    nextResetDate.setDate(1);
    nextResetDate.setHours(0, 0, 0, 0);

    const { error: updateError } = await supabase
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
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(`Failed to downgrade user: ${updateError.message}`);
    }

    // Send cancellation confirmation
    await this.emailService.sendSubscriptionCanceled(user.email, {
      effectiveDate: new Date()
    });

    return { success: true, userId: user.id, action: 'subscription_canceled' };
  }

  /**
   * Handle payment succeeded (for subscriptions)
   */
  async handlePaymentSucceeded(event) {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;

    logger.info('Processing payment succeeded', {
      invoiceId: invoice.id,
      subscriptionId,
      amount: invoice.amount_paid
    });

    if (!subscriptionId) {
      // One-time payment, handle separately
      return { success: true, handled: false };
    }

    // Get user by subscription ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('stripe_subscription_id', subscriptionId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for subscription payment', { subscriptionId });
      return { success: true, handled: false };
    }

    // Update last payment info
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        last_payment_date: new Date(invoice.created * 1000).toISOString(),
        last_payment_amount: invoice.amount_paid,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateError) {
      logger.error('Failed to update payment info', {
        userId: user.id,
        error: updateError.message
      });
    }

    // Log revenue event
    await this.logRevenueEvent('subscription_payment', {
      userId: user.id,
      subscriptionId,
      invoiceId: invoice.id,
      amount: invoice.amount_paid,
      currency: invoice.currency
    });

    // Send payment confirmation
    await this.emailService.sendPaymentConfirmation(user.email, {
      amount: invoice.amount_paid,
      currency: invoice.currency,
      invoiceUrl: invoice.hosted_invoice_url
    });

    return { success: true, userId: user.id, action: 'payment_processed' };
  }

  /**
   * Handle payment failed
   */
  async handlePaymentFailed(event) {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;

    logger.warn('Processing payment failed', {
      invoiceId: invoice.id,
      subscriptionId,
      amount: invoice.amount_due
    });

    if (!subscriptionId) {
      return { success: true, handled: false };
    }

    // Get user by subscription ID
    const { data: user, error: userError } = await supabase
      .from('user_profiles')
      .select('id, email')
      .eq('stripe_subscription_id', subscriptionId)
      .single();

    if (userError || !user) {
      logger.warn('User not found for failed payment', { subscriptionId });
      return { success: true, handled: false };
    }

    // Send payment failure notification
    await this.emailService.sendPaymentFailed(user.email, {
      amount: invoice.amount_due,
      currency: invoice.currency,
      attemptCount: invoice.attempt_count,
      nextPaymentAttempt: invoice.next_payment_attempt
    });

    // Log event for monitoring
    await this.logRevenueEvent('payment_failed', {
      userId: user.id,
      subscriptionId,
      invoiceId: invoice.id,
      amount: invoice.amount_due,
      currency: invoice.currency,
      attemptCount: invoice.attempt_count
    });

    return { success: true, userId: user.id, action: 'payment_failed' };
  }

  /**
   * Handle one-time payment succeeded
   */
  async handleOneTimePaymentSucceeded(event) {
    const paymentIntent = event.data.object;

    logger.info('Processing one-time payment succeeded via webhook', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      metadata: paymentIntent.metadata
    });

    // Check if this is a resume credits purchase
    if (paymentIntent.metadata?.purchase_type === 'resume_credits') {
      try {
        const result = await this.oneTimePaymentService.confirmPaymentAndAddCredits(paymentIntent.id);

        logger.info('One-time payment processed successfully', {
          paymentIntentId: paymentIntent.id,
          creditsAdded: result.creditsAdded,
          newTotal: result.newCreditTotal
        });

        return {
          success: true,
          action: 'credits_added',
          credits: result.creditsAdded,
          userId: paymentIntent.metadata.user_id
        };

      } catch (error) {
        // Log the error but don't fail the webhook - payment already succeeded
        logger.error('Failed to process one-time payment in webhook', {
          paymentIntentId: paymentIntent.id,
          error: error.message
        });

        // Mark for manual review
        return {
          success: true,
          action: 'manual_review_required',
          error: error.message
        };
      }
    }

    // Not a resume credits purchase or missing metadata
    logger.info('One-time payment succeeded but not for resume credits', {
      paymentIntentId: paymentIntent.id,
      purchaseType: paymentIntent.metadata?.purchase_type || 'unknown'
    });

    return { success: true, handled: false };
  }

  /**
   * Handle one-time payment failed
   */
  async handleOneTimePaymentFailed(event) {
    const paymentIntent = event.data.object;

    logger.warn('One-time payment failed via webhook', {
      paymentIntentId: paymentIntent.id,
      amount: paymentIntent.amount,
      lastPaymentError: paymentIntent.last_payment_error?.message,
      metadata: paymentIntent.metadata
    });

    // Check if this is a resume credits purchase
    if (paymentIntent.metadata?.purchase_type === 'resume_credits') {
      try {
        const failureReason = paymentIntent.last_payment_error?.message || 'Payment processing failed';

        await this.oneTimePaymentService.handleFailedPayment(paymentIntent.id, failureReason);

        logger.info('One-time payment failure handled', {
          paymentIntentId: paymentIntent.id,
          failureReason
        });

        return {
          success: true,
          action: 'payment_failure_handled',
          userId: paymentIntent.metadata.user_id
        };

      } catch (error) {
        logger.error('Failed to handle one-time payment failure', {
          paymentIntentId: paymentIntent.id,
          error: error.message
        });

        return {
          success: true,
          action: 'failure_handling_failed',
          error: error.message
        };
      }
    }

    return { success: true, action: 'payment_failed_logged' };
  }

  /**
   * Handle customer created
   */
  async handleCustomerCreated(event) {
    const customer = event.data.object;

    logger.info('Customer created', {
      customerId: customer.id,
      email: customer.email
    });

    return { success: true, action: 'customer_created' };
  }

  /**
   * Handle customer updated
   */
  async handleCustomerUpdated(event) {
    const customer = event.data.object;

    logger.info('Customer updated', {
      customerId: customer.id,
      email: customer.email
    });

    return { success: true, action: 'customer_updated' };
  }

  /**
   * Mark event as failed
   */
  async markEventFailed(event, error) {
    try {
      await supabase
        .from('webhook_events')
        .upsert({
          stripe_event_id: event.id,
          event_type: event.type,
          status: 'failed',
          error_message: error.message,
          data: event.data,
          processed_at: new Date().toISOString(),
          created_at: new Date(event.created * 1000).toISOString()
        });

      // Alert on critical failures
      if (this.isCriticalEvent(event.type)) {
        await this.sendCriticalEventAlert(event, error);
      }
    } catch (dbError) {
      logger.error('Failed to mark event as failed in database', {
        eventId: event.id,
        error: dbError.message
      });
    }
  }

  /**
   * Check if event type is critical
   */
  isCriticalEvent(eventType) {
    const criticalEvents = [
      'customer.subscription.created',
      'customer.subscription.deleted',
      'invoice.payment_succeeded',
      'payment_intent.succeeded'
    ];
    return criticalEvents.includes(eventType);
  }

  /**
   * Send alert for critical event failures
   */
  async sendCriticalEventAlert(event, error) {
    logger.error('CRITICAL: Webhook processing failed', {
      eventId: event.id,
      eventType: event.type,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    // In production, send to monitoring service (Slack, PagerDuty, etc.)
    // For now, log at error level for visibility
  }

  /**
   * Log revenue events for analytics
   */
  async logRevenueEvent(eventType, data) {
    try {
      await supabase
        .from('revenue_events')
        .insert({
          event_type: eventType,
          user_id: data.userId,
          amount: data.amount,
          currency: data.currency || 'usd',
          metadata: data,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Failed to log revenue event', {
        eventType,
        error: error.message
      });
    }
  }

  /**
   * Get webhook processing statistics
   */
  async getProcessingStats(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      const { data, error } = await supabase
        .from('webhook_events')
        .select('status, event_type')
        .gte('created_at', since.toISOString());

      if (error) {
        throw error;
      }

      const stats = {
        total: data.length,
        processed: data.filter(e => e.status === 'processed').length,
        failed: data.filter(e => e.status === 'failed').length,
        byType: {}
      };

      data.forEach(event => {
        if (!stats.byType[event.event_type]) {
          stats.byType[event.event_type] = { total: 0, processed: 0, failed: 0 };
        }
        stats.byType[event.event_type].total++;
        stats.byType[event.event_type][event.status]++;
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get processing stats', { error: error.message });
      return null;
    }
  }
}

export default WebhookHandler;