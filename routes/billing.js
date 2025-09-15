/**
 * Billing API Routes - Stripe Integration
 * =====================================
 *
 * Provides REST API endpoints for Stripe billing operations:
 * - Subscription management (create, cancel, status)
 * - One-time purchases for resume credits
 * - Webhook handling for Stripe events
 * - Billing history and usage tracking
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import BillingService from '../services/billing.js';
import OneTimePaymentService from '../services/one-time-payment.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  paymentSecurityStack,
  subscriptionSecurityStack,
  validatePaymentAmount,
  validateSubscriptionPlan
} from '../middleware/payment-security.js';
import CONFIG from '../config/app-config.js';

const router = express.Router();
const billingService = new BillingService();
const oneTimePaymentService = new OneTimePaymentService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/billing-api.log' })
  ]
});

// Rate limiting for billing endpoints
const billingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per window
  message: { error: 'Too many billing requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 webhook requests per minute (Stripe can send many)
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// SUBSCRIPTION MANAGEMENT ENDPOINTS
// ============================================================================

/**
 * POST /api/billing/create-subscription
 * Create a new premium subscription
 */
router.post('/create-subscription', authenticateToken, ...subscriptionSecurityStack, async (req, res) => {
  try {
    const { priceId, paymentMethodId } = req.body;
    const userId = req.user.id;

    // Validate input
    if (!priceId) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'priceId is required'
      });
    }

    // Verify priceId matches our premium plan
    if (priceId !== CONFIG.billing.plans.premium.stripePriceId) {
      return res.status(400).json({
        error: 'Invalid price ID',
        message: 'Price ID does not match any available plans'
      });
    }

    logger.info('Creating subscription', {
      userId,
      priceId,
      hasPaymentMethod: !!paymentMethodId,
      ip: req.ip
    });

    const result = await billingService.createSubscription(
      userId,
      priceId,
      paymentMethodId
    );

    logger.info('Subscription creation completed', {
      userId,
      subscriptionId: result.subscription.id,
      status: result.subscription.status,
      requiresAction: result.requiresAction
    });

    res.json({
      success: true,
      data: {
        subscriptionId: result.subscription.id,
        status: result.subscription.status,
        clientSecret: result.clientSecret,
        requiresAction: result.requiresAction,
        currentPeriodEnd: new Date(result.subscription.current_period_end * 1000)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Subscription creation failed', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Subscription creation failed',
      message: error.message
    });
  }
});

/**
 * POST /api/billing/cancel-subscription
 * Cancel user's subscription
 */
router.post('/cancel-subscription', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const { cancelAtPeriodEnd = true } = req.body;
    const userId = req.user.id;

    logger.info('Canceling subscription', {
      userId,
      cancelAtPeriodEnd,
      ip: req.ip
    });

    const subscription = await billingService.cancelSubscription(
      userId,
      cancelAtPeriodEnd
    );

    logger.info('Subscription cancellation completed', {
      userId,
      subscriptionId: subscription.id,
      cancelAtPeriodEnd: subscription.cancel_at_period_end
    });

    res.json({
      success: true,
      data: {
        subscriptionId: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000)
      },
      message: cancelAtPeriodEnd
        ? 'Subscription will be canceled at the end of the current billing period'
        : 'Subscription has been canceled immediately',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Subscription cancellation failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Subscription cancellation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/status
 * Get current subscription and usage status
 */
router.get('/status', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const userId = req.user.id;

    logger.info('Fetching subscription status', { userId, ip: req.ip });

    const status = await billingService.getSubscriptionStatus(userId);

    logger.info('Subscription status retrieved', {
      userId,
      tier: status.subscription.tier,
      status: status.subscription.status,
      resumesRemaining: status.usage.resumeCountRemaining
    });

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get subscription status', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve subscription status',
      message: error.message
    });
  }
});

// ============================================================================
// ONE-TIME PURCHASE ENDPOINTS
// ============================================================================

/**
 * POST /api/billing/purchase-resume
 * Purchase additional resume credits (one-time)
 */
router.post('/purchase-resume', authenticateToken, ...paymentSecurityStack, async (req, res) => {
  try {
    const { credits = 1, idempotencyKey } = req.body;
    const userId = req.user.id;

    // Validate credits amount
    if (!Number.isInteger(credits) || credits < 1 || credits > 10) {
      return res.status(400).json({
        error: 'Invalid credits amount',
        message: 'Credits must be an integer between 1 and 10'
      });
    }

    logger.info('Processing resume purchase', {
      userId,
      credits,
      idempotencyKey,
      ip: req.ip,
      riskScore: req.riskScore
    });

    const result = await oneTimePaymentService.createResumePaymentIntent(
      userId,
      credits,
      {
        idempotency_key: idempotencyKey,
        ip_address: req.ip,
        user_agent: req.get('user-agent')
      }
    );

    logger.info('Resume purchase payment intent created', {
      userId,
      paymentIntentId: result.paymentIntent.id,
      credits,
      amount: result.amount / 100
    });

    res.json({
      success: true,
      data: {
        paymentIntentId: result.paymentIntent.id,
        clientSecret: result.clientSecret,
        amount: result.amount / 100,
        currency: result.paymentIntent.currency,
        credits: result.creditCount,
        description: result.description
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Resume purchase failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Resume purchase failed',
      message: error.message
    });
  }
});

/**
 * POST /api/billing/confirm-payment
 * Confirm payment and add credits to user account
 */
router.post('/confirm-payment', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'Missing payment intent ID',
        message: 'Payment intent ID is required'
      });
    }

    logger.info('Confirming payment', {
      userId,
      paymentIntentId,
      ip: req.ip
    });

    const result = await oneTimePaymentService.confirmPaymentAndAddCredits(paymentIntentId);

    logger.info('Payment confirmed successfully', {
      userId,
      paymentIntentId,
      creditsAdded: result.creditsAdded,
      newTotal: result.newCreditTotal
    });

    res.json({
      success: true,
      data: result,
      message: `${result.creditsAdded} credit${result.creditsAdded > 1 ? 's' : ''} added to your account`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Payment confirmation failed', {
      userId: req.user?.id,
      paymentIntentId: req.body.paymentIntentId,
      error: error.message
    });

    res.status(500).json({
      error: 'Payment confirmation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/payment-status/:paymentIntentId
 * Get payment status
 */
router.get('/payment-status/:paymentIntentId', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const { paymentIntentId } = req.params;
    const userId = req.user.id;

    logger.info('Getting payment status', {
      userId,
      paymentIntentId,
      ip: req.ip
    });

    const status = await oneTimePaymentService.getPaymentStatus(paymentIntentId);

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get payment status', {
      userId: req.user?.id,
      paymentIntentId: req.params.paymentIntentId,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to get payment status',
      message: error.message
    });
  }
});

/**
 * POST /api/billing/cancel-payment
 * Cancel a payment intent
 */
router.post('/cancel-payment', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const { paymentIntentId } = req.body;
    const userId = req.user.id;

    if (!paymentIntentId) {
      return res.status(400).json({
        error: 'Missing payment intent ID',
        message: 'Payment intent ID is required'
      });
    }

    logger.info('Canceling payment', {
      userId,
      paymentIntentId,
      ip: req.ip
    });

    const result = await oneTimePaymentService.cancelPayment(paymentIntentId, userId);

    logger.info('Payment canceled successfully', {
      userId,
      paymentIntentId
    });

    res.json({
      success: true,
      data: result,
      message: 'Payment canceled successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Payment cancellation failed', {
      userId: req.user?.id,
      paymentIntentId: req.body.paymentIntentId,
      error: error.message
    });

    res.status(500).json({
      error: 'Payment cancellation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/billing/purchase-history
 * Get user's purchase history
 */
router.get('/purchase-history', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    logger.info('Fetching purchase history', {
      userId,
      limit,
      offset,
      ip: req.ip
    });

    const purchases = await oneTimePaymentService.getPurchaseHistory(userId, limit, offset);

    res.json({
      success: true,
      data: {
        purchases,
        pagination: {
          limit,
          offset,
          count: purchases.length,
          hasMore: purchases.length === limit
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get purchase history', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve purchase history',
      message: error.message
    });
  }
});

// ============================================================================
// BILLING HISTORY ENDPOINTS
// ============================================================================

/**
 * GET /api/billing/history
 * Get user's billing transaction history
 */
router.get('/history', authenticateToken, billingLimiter, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const offset = Math.max(parseInt(req.query.offset || '0', 10), 0);

    logger.info('Fetching billing history', {
      userId,
      limit,
      offset,
      ip: req.ip
    });

    const transactions = await billingService.getBillingHistory(userId, limit, offset);

    res.json({
      success: true,
      data: {
        transactions,
        pagination: {
          limit,
          offset,
          count: transactions.length,
          hasMore: transactions.length === limit
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get billing history', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve billing history',
      message: error.message
    });
  }
});

// ============================================================================
// PLAN INFORMATION ENDPOINTS
// ============================================================================

/**
 * GET /api/billing/plans
 * Get available subscription plans and pricing
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = {
      free: CONFIG.billing.plans.free,
      premium: CONFIG.billing.plans.premium
    };

    const oneTimePurchases = CONFIG.billing.oneTimePurchases;

    res.json({
      success: true,
      data: {
        plans,
        oneTimePurchases,
        currency: CONFIG.billing.stripe.currency
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to get plans', { error: error.message });

    res.status(500).json({
      error: 'Failed to retrieve plans',
      message: error.message
    });
  }
});

// ============================================================================
// WEBHOOK ENDPOINT (NO AUTH REQUIRED)
// ============================================================================

/**
 * POST /api/billing/webhook
 * Handle Stripe webhook events
 */
router.post('/webhook', webhookLimiter, express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];

    if (!signature) {
      logger.error('Webhook missing signature');
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }

    // Verify webhook signature
    const event = billingService.verifyWebhookSignature(req.body, signature);

    logger.info('Webhook received', {
      eventId: event.id,
      type: event.type,
      ip: req.ip
    });

    // Process the event
    const result = await billingService.processWebhook(event);

    logger.info('Webhook processed successfully', {
      eventId: event.id,
      type: event.type,
      result
    });

    res.json({
      success: true,
      eventId: event.id,
      processed: result.processed
    });

  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error.message,
      headers: req.headers,
      ip: req.ip
    });

    res.status(400).json({
      error: 'Webhook processing failed',
      message: error.message
    });
  }
});

// ============================================================================
// USAGE TRACKING ENDPOINTS
// ============================================================================

/**
 * POST /api/billing/check-usage
 * Check if user can generate resume (for frontend validation)
 */
router.post('/check-usage', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const status = await billingService.getSubscriptionStatus(userId);

    res.json({
      success: true,
      data: {
        canGenerateResume: status.usage.canGenerateResume,
        resumesRemaining: status.usage.resumeCountRemaining,
        tier: status.subscription.tier,
        resetDate: status.usage.resetDate
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Failed to check usage', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to check usage',
      message: error.message
    });
  }
});

// ============================================================================
// DEVELOPMENT ENDPOINTS (DEVELOPMENT ONLY)
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  /**
   * POST /api/billing/dev/reset-usage
   * Reset usage for testing (development only)
   */
  router.post('/dev/reset-usage', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id;

      await billingService.resetMonthlyUsage(userId);

      res.json({
        success: true,
        message: 'Usage reset successfully',
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        error: 'Failed to reset usage',
        message: error.message
      });
    }
  });

  /**
   * POST /api/billing/dev/simulate-webhook
   * Simulate webhook events for testing
   */
  router.post('/dev/simulate-webhook', async (req, res) => {
    try {
      const { eventType, eventData } = req.body;

      const mockEvent = {
        id: `evt_test_${Date.now()}`,
        type: eventType,
        data: {
          object: eventData
        }
      };

      const result = await billingService.processWebhook(mockEvent);

      res.json({
        success: true,
        result,
        message: 'Webhook simulation completed'
      });

    } catch (error) {
      res.status(500).json({
        error: 'Webhook simulation failed',
        message: error.message
      });
    }
  });
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in billing router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred during billing operation'
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Validate Stripe price ID format
 */
function isValidPriceId(priceId) {
  return typeof priceId === 'string' && (
    priceId.startsWith('price_') || priceId.startsWith('plan_')
  );
}

/**
 * Sanitize billing data for response
 */
function sanitizeBillingData(data) {
  // Remove sensitive fields before sending to client
  if (data.stripe_customer_id) delete data.stripe_customer_id;
  if (data.stripe_subscription_id) delete data.stripe_subscription_id;
  return data;
}

export default router;