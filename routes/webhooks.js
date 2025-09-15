/**
 * Stripe Webhooks Route
 * =====================
 *
 * Secure endpoint for receiving and processing Stripe webhooks.
 * Handles signature verification and event processing.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import WebhookHandler from '../services/webhook-handler.js';

const router = express.Router();
const webhookHandler = new WebhookHandler();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'webhooks-route' },
  transports: [
    new winston.transports.File({ filename: 'logs/webhook-routes.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

// Rate limiting for webhook endpoints
const webhookRateLimit = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute (Stripe can send many events)
  message: { error: 'Too many webhook requests' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Use Stripe signature as key to allow legitimate webhooks
    return req.get('stripe-signature') || req.ip;
  }
});

// Raw body parser middleware for webhook signature verification
const rawBodyParser = express.raw({
  type: 'application/json',
  limit: '10mb',
  verify: (req, res, buf, encoding) => {
    // Store raw body for signature verification
    req.rawBody = buf;
  }
});

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 */
router.post('/stripe', webhookRateLimit, rawBodyParser, async (req, res) => {
  const signature = req.get('stripe-signature');

  try {
    logger.info('Webhook received', {
      signature: signature ? 'present' : 'missing',
      bodySize: req.rawBody?.length || 0,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    // Verify webhook signature and extract event
    const event = await webhookHandler.verifyWebhookSignature(req.rawBody, signature);

    // Process the event
    const result = await webhookHandler.processEvent(event);

    logger.info('Webhook processed successfully', {
      eventId: event.id,
      eventType: event.type,
      result
    });

    // Respond with 200 to acknowledge receipt
    res.status(200).json({
      received: true,
      eventId: event.id,
      eventType: event.type,
      processed: !result.skipped
    });

  } catch (error) {
    logger.error('Webhook processing failed', {
      error: error.message,
      signature: signature ? 'present' : 'missing',
      ip: req.ip,
      stack: error.stack
    });

    // Respond with appropriate error status
    if (error.message.includes('signature verification failed')) {
      res.status(400).json({
        error: 'Invalid signature',
        message: 'Webhook signature verification failed'
      });
    } else {
      res.status(500).json({
        error: 'Processing failed',
        message: 'Internal server error processing webhook'
      });
    }
  }
});

/**
 * GET /api/webhooks/stats
 * Get webhook processing statistics (admin only)
 */
router.get('/stats', async (req, res) => {
  try {
    // In production, add authentication/authorization here
    const stats = await webhookHandler.getProcessingStats(24);

    if (!stats) {
      return res.status(500).json({
        error: 'Failed to retrieve stats'
      });
    }

    res.json({
      success: true,
      data: stats,
      period: '24 hours'
    });

  } catch (error) {
    logger.error('Failed to get webhook stats', {
      error: error.message
    });

    res.status(500).json({
      error: 'Failed to retrieve webhook statistics'
    });
  }
});

/**
 * POST /api/webhooks/test
 * Test webhook endpoint (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/test', express.json(), async (req, res) => {
    try {
      const { eventType, eventData } = req.body;

      logger.info('Test webhook received', {
        eventType,
        hasData: !!eventData
      });

      // Create a mock Stripe event
      const mockEvent = {
        id: `evt_test_${Date.now()}`,
        type: eventType,
        created: Math.floor(Date.now() / 1000),
        data: {
          object: eventData
        }
      };

      // Process the mock event
      const result = await webhookHandler.processEvent(mockEvent);

      res.json({
        success: true,
        result,
        eventId: mockEvent.id
      });

    } catch (error) {
      logger.error('Test webhook failed', {
        error: error.message
      });

      res.status(500).json({
        error: 'Test webhook processing failed',
        message: error.message
      });
    }
  });
}

// Error handling middleware for webhook routes
router.use((error, req, res, next) => {
  logger.error('Webhook route error', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Webhook processing error',
    message: 'An unexpected error occurred'
  });
});

export default router;