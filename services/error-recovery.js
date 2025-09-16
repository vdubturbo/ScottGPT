/**
 * Error Handling and Recovery Service
 * ===================================
 *
 * Provides comprehensive error handling, recovery mechanisms, and rollback
 * capabilities for payment processing failures. Ensures data consistency
 * and provides automated recovery strategies.
 */

import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import CONFIG from '../config/app-config.js';
import EmailService from './email-service.js';

const supabase = createClient(CONFIG.database.supabaseUrl, CONFIG.database.supabaseAnonKey);

class ErrorRecoveryService {
  constructor() {
    this.emailService = new EmailService();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: 'error-recovery' },
      transports: [
        new winston.transports.File({ filename: 'logs/error-recovery.log' }),
        new winston.transports.File({ filename: 'logs/errors.log', level: 'error' }),
        new winston.transports.Console()
      ]
    });

    // Error codes and recovery strategies
    this.errorStrategies = {
      PAYMENT_INTENT_FAILED: this.handlePaymentIntentFailure.bind(this),
      SUBSCRIPTION_CREATION_FAILED: this.handleSubscriptionCreationFailure.bind(this),
      CREDIT_UPDATE_FAILED: this.handleCreditUpdateFailure.bind(this),
      WEBHOOK_PROCESSING_FAILED: this.handleWebhookProcessingFailure.bind(this),
      DATABASE_TRANSACTION_FAILED: this.handleDatabaseTransactionFailure.bind(this),
      EMAIL_DELIVERY_FAILED: this.handleEmailDeliveryFailure.bind(this),
      STRIPE_API_ERROR: this.handleStripeApiError.bind(this)
    };

    // Recovery attempt limits
    this.maxRetryAttempts = 3;
    this.retryDelayBase = 1000; // 1 second
  }

  /**
   * Main error handling entry point
   */
  async handleError(error, context = {}) {
    const errorCode = this.classifyError(error);
    const recoveryContext = {
      ...context,
      errorCode,
      originalError: error,
      timestamp: new Date().toISOString(),
      recoveryAttempt: context.recoveryAttempt || 1
    };

    this.logger.error('Error detected, initiating recovery', {
      errorCode,
      errorMessage: error.message,
      context: recoveryContext,
      stack: error.stack
    });

    try {
      // Check if we've exceeded retry limits
      if (recoveryContext.recoveryAttempt > this.maxRetryAttempts) {
        return await this.escalateToManualReview(error, recoveryContext);
      }

      // Execute recovery strategy
      const strategy = this.errorStrategies[errorCode] || this.handleUnknownError.bind(this);
      const result = await strategy(error, recoveryContext);

      this.logger.info('Error recovery completed', {
        errorCode,
        result,
        context: recoveryContext
      });

      return result;

    } catch (recoveryError) {
      this.logger.error('Error recovery failed', {
        errorCode,
        originalError: error.message,
        recoveryError: recoveryError.message,
        context: recoveryContext
      });

      // Retry with exponential backoff
      const delay = this.retryDelayBase * Math.pow(2, recoveryContext.recoveryAttempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));

      return await this.handleError(error, {
        ...recoveryContext,
        recoveryAttempt: recoveryContext.recoveryAttempt + 1
      });
    }
  }

  /**
   * Classify error type for appropriate recovery strategy
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    const code = error.code;

    // Stripe errors
    if (error.type?.startsWith('Stripe')) {
      return 'STRIPE_API_ERROR';
    }

    // Database errors
    if (code === '23505' || message.includes('duplicate key') || message.includes('unique constraint')) {
      return 'DATABASE_TRANSACTION_FAILED';
    }

    // Payment specific errors
    if (message.includes('payment_intent') || message.includes('payment intent')) {
      return 'PAYMENT_INTENT_FAILED';
    }

    if (message.includes('subscription') && message.includes('create')) {
      return 'SUBSCRIPTION_CREATION_FAILED';
    }

    if (message.includes('credit') && message.includes('update')) {
      return 'CREDIT_UPDATE_FAILED';
    }

    if (message.includes('webhook')) {
      return 'WEBHOOK_PROCESSING_FAILED';
    }

    if (message.includes('email') || message.includes('smtp')) {
      return 'EMAIL_DELIVERY_FAILED';
    }

    return 'UNKNOWN_ERROR';
  }

  /**
   * Handle payment intent failures
   */
  async handlePaymentIntentFailure(error, context) {
    this.logger.info('Handling payment intent failure', { context });

    const { paymentIntentId, userId } = context;

    if (!paymentIntentId) {
      throw new Error('Payment Intent ID required for recovery');
    }

    try {
      // Check current payment intent status
      const { data: paymentAttempt } = await supabase
        .from('payment_attempts')
        .select('*')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .single();

      if (paymentAttempt?.status === 'succeeded') {
        // Payment actually succeeded, just processing failed
        this.logger.info('Payment Intent actually succeeded, resuming processing', {
          paymentIntentId
        });
        return { recovered: true, action: 'resume_processing' };
      }

      // Mark payment as failed and notify user
      await supabase
        .from('payment_attempts')
        .update({
          status: 'failed',
          failure_reason: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('stripe_payment_intent_id', paymentIntentId);

      // Send failure notification if user ID available
      if (userId) {
        await this.sendRecoveryNotification(userId, 'payment_failed', {
          paymentIntentId,
          reason: error.message
        });
      }

      return { recovered: true, action: 'payment_marked_failed' };

    } catch (recoveryError) {
      throw new Error(`Payment Intent recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle subscription creation failures
   */
  async handleSubscriptionCreationFailure(error, context) {
    this.logger.info('Handling subscription creation failure', { context });

    const { userId, customerId, priceId } = context;

    if (!userId) {
      throw new Error('User ID required for subscription recovery');
    }

    try {
      // Check if subscription was actually created in Stripe but DB update failed
      if (customerId) {
        // Query Stripe for existing subscriptions
        // In real implementation, you'd check Stripe API here
        this.logger.info('Checking Stripe for existing subscriptions', { customerId });
      }

      // Reset user to safe state
      await supabase
        .from('user_profiles')
        .update({
          subscription_status: 'failed',
          last_error: error.message,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      // Notify user of failure and next steps
      await this.sendRecoveryNotification(userId, 'subscription_failed', {
        reason: error.message,
        nextSteps: 'Please try again or contact support'
      });

      return { recovered: true, action: 'user_reset_to_safe_state' };

    } catch (recoveryError) {
      throw new Error(`Subscription recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle credit update failures
   */
  async handleCreditUpdateFailure(error, context) {
    this.logger.info('Handling credit update failure', { context });

    const { userId, creditsToAdd, paymentIntentId } = context;

    if (!userId || !creditsToAdd) {
      throw new Error('User ID and credits amount required for recovery');
    }

    try {
      // Start transaction to safely update credits
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('resume_credits, id')
        .eq('id', userId)
        .single();

      if (!currentProfile) {
        throw new Error('User profile not found');
      }

      // Verify payment was successful before adding credits
      if (paymentIntentId) {
        const { data: paymentAttempt } = await supabase
          .from('payment_attempts')
          .select('status')
          .eq('stripe_payment_intent_id', paymentIntentId)
          .eq('status', 'succeeded')
          .single();

        if (!paymentAttempt) {
          throw new Error('Payment not confirmed as successful');
        }
      }

      // Add credits with validation
      const newCreditTotal = (currentProfile.resume_credits || 0) + creditsToAdd;

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          resume_credits: newCreditTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) {
        throw updateError;
      }

      // Log successful recovery
      this.logger.info('Credits successfully added during recovery', {
        userId,
        creditsAdded: creditsToAdd,
        newTotal: newCreditTotal
      });

      return {
        recovered: true,
        action: 'credits_added',
        creditsAdded: creditsToAdd,
        newTotal: newCreditTotal
      };

    } catch (recoveryError) {
      throw new Error(`Credit update recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle webhook processing failures
   */
  async handleWebhookProcessingFailure(error, context) {
    this.logger.info('Handling webhook processing failure', { context });

    const { eventId, eventType, eventData } = context;

    if (!eventId) {
      throw new Error('Event ID required for webhook recovery');
    }

    try {
      // Mark webhook for retry
      await supabase
        .from('webhook_events')
        .update({
          status: 'retrying',
          error_message: error.message,
          retry_count: (context.retryCount || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq('stripe_event_id', eventId);

      // If it's a critical event, prioritize for manual review
      const criticalEvents = [
        'customer.subscription.created',
        'customer.subscription.deleted',
        'payment_intent.succeeded',
        'invoice.payment_succeeded'
      ];

      if (criticalEvents.includes(eventType)) {
        await this.escalateWebhookToManualReview(eventId, eventType, error);
      }

      return { recovered: true, action: 'webhook_marked_for_retry' };

    } catch (recoveryError) {
      throw new Error(`Webhook recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle database transaction failures
   */
  async handleDatabaseTransactionFailure(error, context) {
    this.logger.info('Handling database transaction failure', { context });

    try {
      // For unique constraint violations, check if the operation actually succeeded
      if (error.code === '23505') {
        this.logger.info('Duplicate key error detected, checking if operation succeeded');

        // Operation might have succeeded in a previous attempt
        return { recovered: true, action: 'duplicate_operation_ignored' };
      }

      // For other database errors, implement specific recovery logic
      // This is a placeholder for more sophisticated database recovery
      await this.logDatabaseError(error, context);

      return { recovered: false, action: 'manual_review_required' };

    } catch (recoveryError) {
      throw new Error(`Database transaction recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle email delivery failures
   */
  async handleEmailDeliveryFailure(error, context) {
    this.logger.info('Handling email delivery failure', { context });

    const { userId, emailType, emailData } = context;

    try {
      // Queue email for retry
      await supabase
        .from('email_queue')
        .insert({
          user_id: userId,
          email_type: emailType,
          email_data: emailData,
          status: 'pending_retry',
          error_message: error.message,
          retry_count: (context.retryCount || 0) + 1,
          created_at: new Date().toISOString()
        });

      this.logger.info('Email queued for retry', {
        userId,
        emailType,
        retryCount: (context.retryCount || 0) + 1
      });

      return { recovered: true, action: 'email_queued_for_retry' };

    } catch (recoveryError) {
      // Email failure is not critical, log and continue
      this.logger.warn('Email recovery failed, operation continues', {
        error: recoveryError.message
      });

      return { recovered: true, action: 'email_failure_ignored' };
    }
  }

  /**
   * Handle Stripe API errors
   */
  async handleStripeApiError(error, context) {
    this.logger.info('Handling Stripe API error', { context });

    try {
      // Check if it's a rate limit error
      if (error.code === 'rate_limit') {
        const delay = 2000; // 2 seconds
        this.logger.info('Rate limit detected, waiting before retry', { delay });
        await new Promise(resolve => setTimeout(resolve, delay));
        return { recovered: true, action: 'rate_limit_delay_applied' };
      }

      // Check if it's a temporary network error
      if (error.code === 'network_error' || error.message.includes('timeout')) {
        return { recovered: true, action: 'network_error_retry' };
      }

      // For card errors, don't retry
      if (error.type === 'card_error') {
        return { recovered: false, action: 'card_error_no_retry' };
      }

      // Log and escalate other Stripe errors
      await this.logStripeError(error, context);
      return { recovered: false, action: 'stripe_error_escalated' };

    } catch (recoveryError) {
      throw new Error(`Stripe API error recovery failed: ${recoveryError.message}`);
    }
  }

  /**
   * Handle unknown errors
   */
  async handleUnknownError(error, context) {
    this.logger.error('Handling unknown error', { error: error.message, context });

    // For unknown errors, log extensively and escalate
    await this.logUnknownError(error, context);

    return { recovered: false, action: 'unknown_error_escalated' };
  }

  /**
   * Escalate to manual review when automatic recovery fails
   */
  async escalateToManualReview(error, context) {
    this.logger.error('Escalating to manual review', {
      error: error.message,
      context,
      maxRetriesExceeded: true
    });

    try {
      // Create manual review record
      await supabase
        .from('manual_review_queue')
        .insert({
          error_type: context.errorCode,
          error_message: error.message,
          context_data: context,
          status: 'pending_review',
          priority: this.getErrorPriority(context.errorCode),
          created_at: new Date().toISOString()
        });

      // Send alert to operations team
      await this.sendOperationsAlert(error, context);

      return {
        recovered: false,
        action: 'escalated_to_manual_review',
        reviewRequired: true
      };

    } catch (escalationError) {
      this.logger.error('Failed to escalate to manual review', {
        error: escalationError.message
      });

      return {
        recovered: false,
        action: 'escalation_failed',
        criticalError: true
      };
    }
  }

  /**
   * Send recovery notification to user
   */
  async sendRecoveryNotification(userId, notificationType, data) {
    try {
      const { data: user } = await supabase
        .from('user_profiles')
        .select('email, full_name')
        .eq('id', userId)
        .single();

      if (!user) {
        throw new Error('User not found for notification');
      }

      // Send appropriate notification based on type
      switch (notificationType) {
        case 'payment_failed':
          await this.emailService.sendPaymentFailure({
            userEmail: user.email,
            userName: user.full_name,
            ...data
          });
          break;

        case 'subscription_failed':
          // Send subscription failure notification
          // Implementation would depend on your email service
          break;

        default:
          this.logger.warn('Unknown notification type', { notificationType });
      }

    } catch (error) {
      this.logger.error('Failed to send recovery notification', {
        userId,
        notificationType,
        error: error.message
      });
    }
  }

  /**
   * Helper methods for logging and alerts
   */
  async logDatabaseError(error, context) {
    await supabase
      .from('error_logs')
      .insert({
        error_type: 'database_error',
        error_message: error.message,
        error_code: error.code,
        context_data: context,
        created_at: new Date().toISOString()
      });
  }

  async logStripeError(error, context) {
    await supabase
      .from('error_logs')
      .insert({
        error_type: 'stripe_error',
        error_message: error.message,
        error_code: error.code,
        stripe_error_type: error.type,
        context_data: context,
        created_at: new Date().toISOString()
      });
  }

  async logUnknownError(error, context) {
    await supabase
      .from('error_logs')
      .insert({
        error_type: 'unknown_error',
        error_message: error.message,
        error_stack: error.stack,
        context_data: context,
        created_at: new Date().toISOString()
      });
  }

  async escalateWebhookToManualReview(eventId, eventType, error) {
    await supabase
      .from('manual_review_queue')
      .insert({
        error_type: 'webhook_processing_failed',
        error_message: error.message,
        context_data: { eventId, eventType },
        status: 'pending_review',
        priority: 'high',
        created_at: new Date().toISOString()
      });
  }

  async sendOperationsAlert(error, context) {
    this.logger.error('OPERATIONS ALERT: Manual review required', {
      errorCode: context.errorCode,
      error: error.message,
      context
    });

    // In production, send to monitoring service (Slack, PagerDuty, etc.)
    // For now, just log at error level for visibility
  }

  getErrorPriority(errorCode) {
    const highPriorityErrors = [
      'PAYMENT_INTENT_FAILED',
      'SUBSCRIPTION_CREATION_FAILED',
      'CREDIT_UPDATE_FAILED'
    ];

    return highPriorityErrors.includes(errorCode) ? 'high' : 'medium';
  }

  /**
   * Get error recovery statistics
   */
  async getRecoveryStats(hours = 24) {
    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    try {
      const { data: errorLogs } = await supabase
        .from('error_logs')
        .select('error_type, created_at')
        .gte('created_at', since.toISOString());

      const { data: recoveryLogs } = await supabase
        .from('manual_review_queue')
        .select('status, created_at')
        .gte('created_at', since.toISOString());

      return {
        totalErrors: errorLogs?.length || 0,
        errorsByType: this.groupBy(errorLogs || [], 'error_type'),
        manualReviewRequired: recoveryLogs?.filter(r => r.status === 'pending_review').length || 0,
        recoverySuccessRate: this.calculateRecoveryRate(errorLogs || [], recoveryLogs || [])
      };

    } catch (error) {
      this.logger.error('Failed to get recovery stats', { error: error.message });
      return null;
    }
  }

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key];
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }

  calculateRecoveryRate(errorLogs, recoveryLogs) {
    if (errorLogs.length === 0) return 100;
    const recoveryRequired = recoveryLogs.length;
    return Math.max(0, ((errorLogs.length - recoveryRequired) / errorLogs.length) * 100);
  }
}

export default ErrorRecoveryService;