/**
 * One-Time Payment Service
 * ========================
 *
 * Handles secure processing of one-time purchases for resume credits
 * including Payment Intent creation, confirmation, credit updates,
 * and transaction logging.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import CONFIG from '../config/app-config.js';
import EmailService from './email-service.js';
import ErrorRecoveryService from './error-recovery.js';

const stripe = CONFIG.billing.stripe.secretKey ? new Stripe(CONFIG.billing.stripe.secretKey) : null;
const supabase = createClient(CONFIG.database.supabaseUrl, CONFIG.database.supabaseAnonKey);

class OneTimePaymentService {
  constructor() {
    this.emailService = new EmailService();
    this.errorRecoveryService = new ErrorRecoveryService();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'one-time-payment' },
      transports: [
        new winston.transports.File({ filename: 'logs/one-time-payment.log' }),
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Create Payment Intent for resume credits purchase
   */
  async createResumePaymentIntent(userId, creditCount, metadata = {}) {
    try {
      // Validate input
      if (!userId || !creditCount || creditCount < 1 || creditCount > 10) {
        throw new Error('Invalid user ID or credit count (must be 1-10)');
      }

      // Get user profile for customer information
      const { data: userProfile, error: userError } = await supabase
        .from('user_profiles')
        .select('email, full_name, stripe_customer_id')
        .eq('id', userId)
        .single();

      if (userError || !userProfile) {
        throw new Error('User not found');
      }

      // Calculate amount
      const creditPrice = CONFIG.billing.oneTimePurchases.resumeCredits.pricePerCredit;
      const amount = creditCount * creditPrice; // Amount in cents

      // Get or create Stripe customer
      let customerId = userProfile.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: userProfile.email,
          name: userProfile.full_name,
          metadata: {
            user_id: userId,
            platform: 'scottgpt'
          }
        });

        customerId = customer.id;

        // Update user profile with customer ID
        await supabase
          .from('user_profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', userId);
      }

      // Create Payment Intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: CONFIG.billing.stripe.currency,
        customer: customerId,
        description: `${creditCount} Resume Credit${creditCount > 1 ? 's' : ''} - ScottGPT`,
        metadata: {
          user_id: userId,
          credit_count: creditCount.toString(),
          purchase_type: 'resume_credits',
          ...metadata
        },
        automatic_payment_methods: {
          enabled: true
        },
        statement_descriptor: 'SCOTTGPT CREDITS'
      });

      // Log payment attempt
      await this.logPaymentAttempt(userId, {
        stripe_payment_intent_id: paymentIntent.id,
        amount,
        currency: CONFIG.billing.stripe.currency,
        credit_count: creditCount,
        status: 'created'
      });

      this.logger.info('Payment Intent created for resume credits', {
        userId,
        paymentIntentId: paymentIntent.id,
        amount,
        creditCount
      });

      return {
        paymentIntent,
        clientSecret: paymentIntent.client_secret,
        amount,
        creditCount,
        description: paymentIntent.description
      };

    } catch (error) {
      this.logger.error('Failed to create resume payment intent', {
        userId,
        creditCount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Confirm payment and add credits to user account
   */
  async confirmPaymentAndAddCredits(paymentIntentId) {
    const context = {
      paymentIntentId,
      operation: 'confirm_payment_and_add_credits'
    };

    try {
      // Get payment intent from Stripe
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      if (paymentIntent.status !== 'succeeded') {
        const error = new Error(`Payment not successful. Status: ${paymentIntent.status}`);
        return await this.errorRecoveryService.handleError(error, {
          ...context,
          paymentStatus: paymentIntent.status,
          userId: paymentIntent.metadata?.user_id
        });
      }

      const userId = paymentIntent.metadata.user_id;
      const creditCount = parseInt(paymentIntent.metadata.credit_count);

      if (!userId || !creditCount) {
        const error = new Error('Invalid payment metadata');
        return await this.errorRecoveryService.handleError(error, {
          ...context,
          missingUserId: !userId,
          missingCreditCount: !creditCount
        });
      }

      context.userId = userId;
      context.creditsToAdd = creditCount;

      // Start database transaction
      const { data: currentProfile, error: profileError } = await supabase
        .from('user_profiles')
        .select('resume_credits')
        .eq('id', userId)
        .single();

      if (profileError) {
        const error = new Error('Failed to get user profile');
        return await this.errorRecoveryService.handleError(error, {
          ...context,
          dbError: profileError.message
        });
      }

      const newCreditCount = (currentProfile.resume_credits || 0) + creditCount;

      // Update user credits with error handling
      try {
        const { error: updateError } = await supabase
          .from('user_profiles')
          .update({
            resume_credits: newCreditCount,
            updated_at: new Date().toISOString()
          })
          .eq('id', userId);

        if (updateError) {
          throw updateError;
        }
      } catch (updateError) {
        return await this.errorRecoveryService.handleError(updateError, {
          ...context,
          currentCredits: currentProfile.resume_credits,
          newCreditCount
        });
      }

      // Log successful payment with error handling
      try {
        await this.logPaymentAttempt(userId, {
          stripe_payment_intent_id: paymentIntentId,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          credit_count: creditCount,
          status: 'succeeded',
          credits_added: creditCount,
          new_credit_total: newCreditCount
        });

        // Log revenue event
        await this.logRevenueEvent(userId, {
          event_type: 'one_time_purchase',
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          stripe_payment_intent_id: paymentIntentId,
          metadata: {
            credit_count: creditCount,
            new_credit_total: newCreditCount
          }
        });
      } catch (loggingError) {
        // Log but don't fail the transaction for logging errors
        this.logger.warn('Failed to log payment attempt', {
          userId,
          paymentIntentId,
          error: loggingError.message
        });
      }

      // Send confirmation email with error handling
      try {
        await this.emailService.sendPurchaseConfirmation({
          userEmail: paymentIntent.receipt_email || await this.getUserEmail(userId),
          userName: await this.getUserName(userId),
          creditCount,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          newCreditTotal: newCreditCount
        });
      } catch (emailError) {
        // Handle email failure through error recovery service
        await this.errorRecoveryService.handleError(emailError, {
          ...context,
          emailType: 'purchase_confirmation',
          emailData: {
            creditCount,
            amount: paymentIntent.amount / 100,
            currency: paymentIntent.currency.toUpperCase(),
            newCreditTotal: newCreditCount
          }
        });
      }

      this.logger.info('Payment confirmed and credits added', {
        userId,
        paymentIntentId,
        creditCount,
        newCreditTotal: newCreditCount
      });

      return {
        success: true,
        creditsAdded: creditCount,
        newCreditTotal: newCreditCount,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency.toUpperCase()
      };

    } catch (error) {
      this.logger.error('Failed to confirm payment and add credits', {
        paymentIntentId,
        error: error.message,
        context
      });

      // Use error recovery service for unhandled errors
      const recoveryResult = await this.errorRecoveryService.handleError(error, context);

      if (recoveryResult.recovered) {
        return recoveryResult;
      }

      throw error;
    }
  }

  /**
   * Handle failed payment
   */
  async handleFailedPayment(paymentIntentId, failureReason) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      const userId = paymentIntent.metadata.user_id;
      const creditCount = parseInt(paymentIntent.metadata.credit_count);

      // Log failed payment
      await this.logPaymentAttempt(userId, {
        stripe_payment_intent_id: paymentIntentId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        credit_count: creditCount,
        status: 'failed',
        failure_reason: failureReason
      });

      // Send failure notification email
      try {
        await this.emailService.sendPaymentFailure({
          userEmail: await this.getUserEmail(userId),
          userName: await this.getUserName(userId),
          creditCount,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency.toUpperCase(),
          failureReason
        });
      } catch (emailError) {
        this.logger.warn('Failed to send payment failure email', {
          userId,
          paymentIntentId,
          error: emailError.message
        });
      }

      this.logger.info('Failed payment handled', {
        userId,
        paymentIntentId,
        failureReason
      });

    } catch (error) {
      this.logger.error('Failed to handle payment failure', {
        paymentIntentId,
        error: error.message
      });
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      return {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        creditCount: parseInt(paymentIntent.metadata.credit_count || '0'),
        description: paymentIntent.description,
        created: new Date(paymentIntent.created * 1000)
      };

    } catch (error) {
      this.logger.error('Failed to get payment status', {
        paymentIntentId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Cancel payment intent
   */
  async cancelPayment(paymentIntentId, userId) {
    try {
      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

      // Log cancellation
      await this.logPaymentAttempt(userId, {
        stripe_payment_intent_id: paymentIntentId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        credit_count: parseInt(paymentIntent.metadata.credit_count || '0'),
        status: 'canceled'
      });

      this.logger.info('Payment canceled', {
        userId,
        paymentIntentId
      });

      return {
        success: true,
        status: paymentIntent.status
      };

    } catch (error) {
      this.logger.error('Failed to cancel payment', {
        paymentIntentId,
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get user's purchase history
   */
  async getPurchaseHistory(userId, limit = 20, offset = 0) {
    try {
      const { data: payments, error } = await supabase
        .from('payment_attempts')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'succeeded')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw error;
      }

      return payments.map(payment => ({
        id: payment.id,
        stripePaymentIntentId: payment.stripe_payment_intent_id,
        amount: payment.amount / 100,
        currency: payment.currency.toUpperCase(),
        creditCount: payment.metadata?.credit_count || 0,
        creditsAdded: payment.metadata?.credits_added || 0,
        date: payment.created_at,
        status: payment.status
      }));

    } catch (error) {
      this.logger.error('Failed to get purchase history', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Helper methods
   */
  async logPaymentAttempt(userId, data) {
    try {
      await supabase.rpc('log_payment_attempt', {
        p_user_id: userId,
        p_ip_address: null, // Would be passed from request
        p_user_agent: 'one-time-payment-service',
        p_amount: data.amount,
        p_currency: data.currency,
        p_status: data.status,
        p_failure_reason: data.failure_reason || null,
        p_risk_score: null,
        p_stripe_payment_intent_id: data.stripe_payment_intent_id,
        p_idempotency_key: data.idempotency_key || null
      });
    } catch (error) {
      this.logger.error('Failed to log payment attempt', { error: error.message });
    }
  }

  async logRevenueEvent(userId, data) {
    try {
      const { error } = await supabase
        .from('revenue_events')
        .insert({
          event_type: data.event_type,
          user_id: userId,
          amount: data.amount,
          currency: data.currency,
          stripe_payment_intent_id: data.stripe_payment_intent_id,
          metadata: data.metadata
        });

      if (error) {
        throw error;
      }
    } catch (error) {
      this.logger.error('Failed to log revenue event', { error: error.message });
    }
  }

  async getUserEmail(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('email')
      .eq('id', userId)
      .single();
    return data?.email || 'unknown@example.com';
  }

  async getUserName(userId) {
    const { data } = await supabase
      .from('user_profiles')
      .select('full_name')
      .eq('id', userId)
      .single();
    return data?.full_name || 'User';
  }
}

export default OneTimePaymentService;