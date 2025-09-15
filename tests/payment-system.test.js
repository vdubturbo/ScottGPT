/**
 * Payment System End-to-End Tests
 * ===============================
 *
 * Comprehensive test suite for the complete payment processing system
 * including webhooks, security, reconciliation, and error handling.
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { createClient } from '@supabase/supabase-js';
import express from 'express';
import CONFIG from '../config/app-config.js';

// Import services for testing
import OneTimePaymentService from '../services/one-time-payment.js';
import SubscriptionManager from '../services/subscription-manager.js';
import WebhookHandler from '../services/webhook-handler.js';
import PaymentAnalyticsService from '../services/payment-analytics.js';
import PaymentReconciliationService from '../services/payment-reconciliation.js';
import ErrorRecoveryService from '../services/error-recovery.js';

// Mock Stripe for testing
const mockStripe = {
  paymentIntents: {
    create: jest.fn(),
    retrieve: jest.fn(),
    cancel: jest.fn()
  },
  customers: {
    create: jest.fn(),
    retrieve: jest.fn()
  },
  subscriptions: {
    create: jest.fn(),
    retrieve: jest.fn(),
    cancel: jest.fn()
  },
  webhooks: {
    constructEvent: jest.fn()
  }
};

// Mock Supabase client
const mockSupabase = createClient(
  'https://mock.supabase.co',
  'mock-anon-key'
);

describe('Payment System End-to-End Tests', () => {
  let app;
  let testUser;
  let testAdmin;
  let authToken;
  let adminToken;

  beforeAll(async () => {
    // Setup test application
    app = express();
    app.use(express.json());

    // Mock authentication middleware
    app.use((req, res, next) => {
      if (req.headers.authorization === 'Bearer test-user-token') {
        req.user = testUser;
      } else if (req.headers.authorization === 'Bearer test-admin-token') {
        req.user = testAdmin;
      }
      next();
    });

    // Setup test users
    testUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      full_name: 'Test User',
      role: 'job_seeker',
      subscription_tier: 'free'
    };

    testAdmin = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      email: 'admin@example.com',
      full_name: 'Test Admin',
      role: 'admin'
    };

    authToken = 'test-user-token';
    adminToken = 'test-admin-token';
  });

  describe('One-Time Payment Processing', () => {
    let paymentService;

    beforeEach(() => {
      paymentService = new OneTimePaymentService();
      jest.clearAllMocks();
    });

    test('should create payment intent for resume credits', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret',
        amount: 999,
        currency: 'usd',
        status: 'requires_payment_method',
        metadata: {
          user_id: testUser.id,
          credit_count: '3',
          purchase_type: 'resume_credits'
        }
      };

      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test_123',
        email: testUser.email
      });

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      const result = await paymentService.createResumePaymentIntent(
        testUser.id,
        3,
        { idempotency_key: 'test-key-123' }
      );

      expect(result).toEqual({
        paymentIntent: mockPaymentIntent,
        clientSecret: 'pi_test_123_secret',
        amount: 999,
        creditCount: 3,
        description: expect.stringContaining('Resume Credit')
      });

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 999,
        currency: 'usd',
        customer: 'cus_test_123',
        description: '3 Resume Credits - ScottGPT',
        metadata: expect.objectContaining({
          user_id: testUser.id,
          credit_count: '3',
          purchase_type: 'resume_credits'
        }),
        automatic_payment_methods: { enabled: true },
        statement_descriptor: 'SCOTTGPT CREDITS'
      });
    });

    test('should confirm payment and add credits', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_123',
        status: 'succeeded',
        amount: 999,
        currency: 'usd',
        metadata: {
          user_id: testUser.id,
          credit_count: '3'
        }
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);

      // Mock database operations
      const mockSupabaseSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest.fn().mockResolvedValue({
            data: { resume_credits: 2 },
            error: null
          })
        })
      });

      const mockSupabaseUpdate = jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          error: null
        })
      });

      // Mock Supabase client methods
      jest.spyOn(paymentService, 'logPaymentAttempt').mockResolvedValue();
      jest.spyOn(paymentService, 'logRevenueEvent').mockResolvedValue();
      jest.spyOn(paymentService, 'getUserEmail').mockResolvedValue(testUser.email);
      jest.spyOn(paymentService, 'getUserName').mockResolvedValue(testUser.full_name);

      const result = await paymentService.confirmPaymentAndAddCredits('pi_test_123');

      expect(result).toEqual({
        success: true,
        creditsAdded: 3,
        newCreditTotal: 5,
        amount: 9.99,
        currency: 'USD'
      });
    });

    test('should handle payment failures gracefully', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_failed',
        status: 'failed',
        metadata: {
          user_id: testUser.id,
          credit_count: '1'
        },
        last_payment_error: {
          message: 'Card was declined'
        }
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);
      jest.spyOn(paymentService, 'getUserEmail').mockResolvedValue(testUser.email);
      jest.spyOn(paymentService, 'getUserName').mockResolvedValue(testUser.full_name);

      await paymentService.handleFailedPayment('pi_test_failed', 'Card was declined');

      // Verify that failure was logged and user was notified
      expect(paymentService.logPaymentAttempt).toHaveBeenCalledWith(
        testUser.id,
        expect.objectContaining({
          stripe_payment_intent_id: 'pi_test_failed',
          status: 'failed',
          failure_reason: 'Card was declined'
        })
      );
    });
  });

  describe('Subscription Management', () => {
    let subscriptionManager;

    beforeEach(() => {
      subscriptionManager = new SubscriptionManager();
      jest.clearAllMocks();
    });

    test('should create premium subscription', async () => {
      const mockSubscription = {
        id: 'sub_test_123',
        status: 'active',
        customer: 'cus_test_123',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60
      };

      mockStripe.customers.create.mockResolvedValue({
        id: 'cus_test_123',
        email: testUser.email
      });

      mockStripe.subscriptions.create.mockResolvedValue(mockSubscription);

      const result = await subscriptionManager.createSubscription(
        testUser.id,
        'premium',
        'pm_test_123'
      );

      expect(result).toEqual({
        success: true,
        subscription: mockSubscription,
        requiresAction: false
      });

      expect(mockStripe.subscriptions.create).toHaveBeenCalledWith({
        customer: 'cus_test_123',
        items: [{ price: expect.any(String) }],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
        metadata: expect.objectContaining({
          user_id: testUser.id,
          plan_id: 'premium'
        })
      });
    });

    test('should cancel subscription', async () => {
      const mockSubscription = {
        id: 'sub_test_123',
        status: 'canceled',
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 15 * 24 * 60 * 60
      };

      mockStripe.subscriptions.cancel.mockResolvedValue(mockSubscription);

      const result = await subscriptionManager.cancelSubscription(
        testUser.id,
        true
      );

      expect(result).toEqual(mockSubscription);
      expect(mockStripe.subscriptions.cancel).toHaveBeenCalled();
    });
  });

  describe('Webhook Processing', () => {
    let webhookHandler;

    beforeEach(() => {
      webhookHandler = new WebhookHandler();
      jest.clearAllMocks();
    });

    test('should verify webhook signature', async () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded'
          }
        }
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = await webhookHandler.verifyWebhookSignature(
        'raw_body',
        'stripe_signature'
      );

      expect(result).toEqual(mockEvent);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'raw_body',
        'stripe_signature',
        expect.any(String)
      );
    });

    test('should process payment_intent.succeeded event', async () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_123',
            status: 'succeeded',
            amount: 999,
            metadata: {
              user_id: testUser.id,
              credit_count: '3',
              purchase_type: 'resume_credits'
            }
          }
        }
      };

      jest.spyOn(webhookHandler, 'isEventProcessed').mockResolvedValue(false);
      jest.spyOn(webhookHandler, 'markEventProcessed').mockResolvedValue();
      jest.spyOn(webhookHandler.oneTimePaymentService, 'confirmPaymentAndAddCredits')
        .mockResolvedValue({
          creditsAdded: 3,
          newCreditTotal: 5
        });

      const result = await webhookHandler.processEvent(mockEvent);

      expect(result).toEqual({
        success: true,
        action: 'credits_added',
        credits: 3,
        userId: testUser.id
      });
    });

    test('should handle webhook processing failures', async () => {
      const mockEvent = {
        id: 'evt_test_failed',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test_failed',
            metadata: {
              user_id: testUser.id,
              purchase_type: 'resume_credits'
            }
          }
        }
      };

      jest.spyOn(webhookHandler, 'isEventProcessed').mockResolvedValue(false);
      jest.spyOn(webhookHandler.oneTimePaymentService, 'confirmPaymentAndAddCredits')
        .mockRejectedValue(new Error('Database connection failed'));

      const result = await webhookHandler.processEvent(mockEvent);

      expect(result).toEqual({
        success: true,
        action: 'manual_review_required',
        error: 'Database connection failed'
      });
    });
  });

  describe('Payment Security', () => {
    test('should apply rate limiting', async () => {
      // Mock multiple rapid requests
      const requests = Array(15).fill().map(() =>
        request(app)
          .post('/api/billing/purchase-resume')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ credits: 1, idempotencyKey: 'test-key' })
      );

      const responses = await Promise.all(requests);

      // Should have some rate limited responses
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should validate payment amounts', async () => {
      const invalidAmounts = [-100, 0, 1000000]; // negative, zero, too large

      for (const amount of invalidAmounts) {
        const response = await request(app)
          .post('/api/billing/purchase-resume')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ credits: amount });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid');
      }
    });

    test('should require idempotency keys', async () => {
      const response = await request(app)
        .post('/api/billing/purchase-resume')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ credits: 1 }); // Missing idempotencyKey

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('idempotency');
    });
  });

  describe('Error Recovery', () => {
    let errorRecoveryService;

    beforeEach(() => {
      errorRecoveryService = new ErrorRecoveryService();
      jest.clearAllMocks();
    });

    test('should classify and handle payment intent failures', async () => {
      const error = new Error('Payment not successful. Status: failed');
      const context = {
        paymentIntentId: 'pi_test_failed',
        userId: testUser.id,
        operation: 'confirm_payment'
      };

      const result = await errorRecoveryService.handleError(error, context);

      expect(result.recovered).toBe(true);
      expect(result.action).toBe('payment_marked_failed');
    });

    test('should handle credit update failures with recovery', async () => {
      const error = new Error('Failed to update user credits');
      const context = {
        userId: testUser.id,
        creditsToAdd: 3,
        paymentIntentId: 'pi_test_123',
        operation: 'credit_update'
      };

      // Mock successful recovery
      jest.spyOn(errorRecoveryService, 'handleCreditUpdateFailure')
        .mockResolvedValue({
          recovered: true,
          action: 'credits_added',
          creditsAdded: 3,
          newTotal: 5
        });

      const result = await errorRecoveryService.handleError(error, context);

      expect(result.recovered).toBe(true);
      expect(result.creditsAdded).toBe(3);
    });

    test('should escalate to manual review after max retries', async () => {
      const error = new Error('Persistent database error');
      const context = {
        operation: 'payment_processing',
        recoveryAttempt: 4 // Exceeds max retries
      };

      const result = await errorRecoveryService.handleError(error, context);

      expect(result.recovered).toBe(false);
      expect(result.action).toBe('escalated_to_manual_review');
      expect(result.reviewRequired).toBe(true);
    });
  });

  describe('Payment Analytics', () => {
    let analyticsService;

    beforeEach(() => {
      analyticsService = new PaymentAnalyticsService();
      jest.clearAllMocks();
    });

    test('should generate payment dashboard', async () => {
      // Mock database responses
      jest.spyOn(analyticsService, 'getRevenueMetrics').mockResolvedValue({
        total: 1500.00,
        subscription: 1200.00,
        oneTime: 300.00,
        averageTransaction: 25.00,
        uniqueCustomers: 60,
        totalTransactions: 75
      });

      jest.spyOn(analyticsService, 'getTransactionMetrics').mockResolvedValue({
        total: 100,
        successful: 95,
        failed: 5,
        successRate: 95.0,
        failureReasons: { 'card_declined': 3, 'insufficient_funds': 2 }
      });

      const dashboard = await analyticsService.getPaymentDashboard('24h');

      expect(dashboard).toHaveProperty('revenue');
      expect(dashboard).toHaveProperty('transactions');
      expect(dashboard).toHaveProperty('subscriptions');
      expect(dashboard).toHaveProperty('errors');
      expect(dashboard.revenue.total).toBe(1500.00);
      expect(dashboard.transactions.successRate).toBe(95.0);
    });

    test('should generate alerts for high error rates', async () => {
      const mockDashboard = {
        errors: { errorRate: 12.5 }, // Above 5% threshold
        transactions: { successRate: 85.0 }, // Below 95% threshold
        subscriptions: { churnRate: 15.0 } // Above 10% threshold
      };

      const alerts = await analyticsService.checkAlertConditions(mockDashboard);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(alert => alert.type === 'error_rate_high')).toBe(true);
      expect(alerts.some(alert => alert.type === 'success_rate_low')).toBe(true);
      expect(alerts.some(alert => alert.type === 'churn_rate_high')).toBe(true);
    });
  });

  describe('Payment Reconciliation', () => {
    let reconciliationService;

    beforeEach(() => {
      reconciliationService = new PaymentReconciliationService();
      jest.clearAllMocks();
    });

    test('should identify missing payments in database', async () => {
      const stripePayments = [
        { id: 'pi_1', amount: 999, status: 'succeeded' },
        { id: 'pi_2', amount: 1999, status: 'succeeded' }
      ];

      const dbPayments = [
        { stripe_payment_intent_id: 'pi_1', amount: 999, status: 'succeeded' }
        // pi_2 is missing from database
      ];

      jest.spyOn(reconciliationService, 'getStripePayments').mockResolvedValue(stripePayments);
      jest.spyOn(reconciliationService, 'getDatabasePayments').mockResolvedValue(dbPayments);

      const report = await reconciliationService.reconcilePayments(
        '2024-01-01',
        '2024-01-02',
        { autoFix: false, dryRun: true }
      );

      expect(report.summary.missingInDb).toBe(1);
      expect(report.discrepancies).toHaveLength(1);
      expect(report.discrepancies[0].type).toBe('missing_in_database');
      expect(report.discrepancies[0].stripePaymentId).toBe('pi_2');
    });

    test('should process manual payments', async () => {
      const paymentData = {
        userId: testUser.id,
        amount: 500, // $5.00
        reason: 'Refund for failed delivery',
        credits: 2,
        refund: true
      };

      // Mock database operations
      jest.spyOn(reconciliationService, 'sendManualPaymentNotification').mockResolvedValue();

      const result = await reconciliationService.processManualPayment(
        paymentData,
        testAdmin.id
      );

      expect(result.success).toBe(true);
      expect(result.refund).toBe(true);
      expect(result.amount).toBe(500);
    });

    test('should generate audit reports', async () => {
      const period = {
        startDate: '2024-01-01T00:00:00Z',
        endDate: '2024-01-31T23:59:59Z'
      };

      // Mock audit data
      jest.spyOn(reconciliationService, 'getRevenueAuditData').mockResolvedValue({
        total_revenue: 5000,
        subscription_revenue: 4000,
        one_time_revenue: 1000
      });

      jest.spyOn(reconciliationService, 'getPaymentAuditData').mockResolvedValue({
        total: 200,
        successful: 190,
        failed: 10,
        totalAmount: 500000 // cents
      });

      const auditReport = await reconciliationService.generateAuditReport(period);

      expect(auditReport.period).toEqual(period);
      expect(auditReport.summary.totalRevenue).toBe(5000);
      expect(auditReport.summary.totalTransactions).toBe(200);
      expect(auditReport.summary.successfulTransactions).toBe(190);
    });
  });

  describe('Integration Tests', () => {
    test('should process complete payment flow', async () => {
      // Step 1: Create payment intent
      const createResponse = await request(app)
        .post('/api/billing/purchase-resume')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          credits: 2,
          idempotencyKey: 'integration-test-123'
        });

      expect(createResponse.status).toBe(200);
      expect(createResponse.body.success).toBe(true);
      expect(createResponse.body.data.credits).toBe(2);

      const paymentIntentId = createResponse.body.data.paymentIntentId;

      // Step 2: Simulate successful payment webhook
      const webhookEvent = {
        id: 'evt_integration_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: paymentIntentId,
            status: 'succeeded',
            amount: 598, // 2 credits * $2.99
            metadata: {
              user_id: testUser.id,
              credit_count: '2',
              purchase_type: 'resume_credits'
            }
          }
        }
      };

      const webhookResponse = await request(app)
        .post('/api/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(webhookEvent);

      expect(webhookResponse.status).toBe(200);
      expect(webhookResponse.body.success).toBe(true);

      // Step 3: Verify payment status
      const statusResponse = await request(app)
        .get(`/api/billing/payment-status/${paymentIntentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.status).toBe('succeeded');
    });

    test('should handle subscription lifecycle', async () => {
      // Create subscription
      const createSubResponse = await request(app)
        .post('/api/billing/create-subscription')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          priceId: 'price_premium_monthly',
          paymentMethodId: 'pm_test_123'
        });

      expect(createSubResponse.status).toBe(200);
      expect(createSubResponse.body.success).toBe(true);

      const subscriptionId = createSubResponse.body.data.subscriptionId;

      // Get subscription status
      const statusResponse = await request(app)
        .get('/api/billing/status')
        .set('Authorization', `Bearer ${authToken}`);

      expect(statusResponse.status).toBe(200);
      expect(statusResponse.body.data.subscription.tier).toBe('premium');

      // Cancel subscription
      const cancelResponse = await request(app)
        .post('/api/billing/cancel-subscription')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cancelAtPeriodEnd: true });

      expect(cancelResponse.status).toBe(200);
      expect(cancelResponse.body.data.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('Performance Tests', () => {
    test('should handle concurrent payment requests', async () => {
      const concurrentRequests = 10;
      const requests = Array(concurrentRequests).fill().map((_, index) =>
        request(app)
          .post('/api/billing/purchase-resume')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            credits: 1,
            idempotencyKey: `concurrent-test-${index}`
          })
      );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const endTime = Date.now();

      // All requests should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(5000); // 5 seconds

      // All requests should succeed or be properly rate limited
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });

    test('should handle webhook processing efficiently', async () => {
      const webhookEvents = Array(20).fill().map((_, index) => ({
        id: `evt_perf_test_${index}`,
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: `pi_perf_test_${index}`,
            status: 'succeeded',
            metadata: {
              user_id: testUser.id,
              purchase_type: 'resume_credits'
            }
          }
        }
      }));

      const startTime = Date.now();

      const webhookPromises = webhookEvents.map(event =>
        request(app)
          .post('/api/webhooks/stripe')
          .set('stripe-signature', 'test_signature')
          .send(event)
      );

      const responses = await Promise.all(webhookPromises);
      const endTime = Date.now();

      // Webhooks should process quickly
      expect(endTime - startTime).toBeLessThan(3000); // 3 seconds

      // All webhooks should be processed successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Cleanup test data if needed
  });
});

// Helper functions for testing
export const createTestPaymentIntent = (overrides = {}) => ({
  id: 'pi_test_123',
  status: 'succeeded',
  amount: 999,
  currency: 'usd',
  metadata: {
    user_id: '123e4567-e89b-12d3-a456-426614174000',
    credit_count: '3',
    purchase_type: 'resume_credits'
  },
  ...overrides
});

export const createTestSubscription = (overrides = {}) => ({
  id: 'sub_test_123',
  status: 'active',
  customer: 'cus_test_123',
  current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
  ...overrides
});

export const createTestWebhookEvent = (type, data, overrides = {}) => ({
  id: `evt_test_${Date.now()}`,
  type,
  created: Math.floor(Date.now() / 1000),
  data: { object: data },
  ...overrides
});