/**
 * Payment Reconciliation Service
 * ==============================
 *
 * Provides admin tools for payment reconciliation, dispute resolution,
 * manual payment processing, and financial auditing capabilities.
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import winston from 'winston';
import CONFIG from '../config/app-config.js';
import EmailService from './email-service.js';
import ErrorRecoveryService from './error-recovery.js';

const stripe = CONFIG.billing.stripe.secretKey ? new Stripe(CONFIG.billing.stripe.secretKey) : null;
const supabase = createClient(CONFIG.database.supabaseUrl, CONFIG.database.supabaseAnonKey);

class PaymentReconciliationService {
  constructor() {
    this.emailService = new EmailService();
    this.errorRecoveryService = new ErrorRecoveryService();
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      defaultMeta: { service: 'payment-reconciliation' },
      transports: [
        new winston.transports.File({ filename: 'logs/payment-reconciliation.log' }),
        new winston.transports.Console()
      ]
    });
  }

  /**
   * Reconcile payments between Stripe and database
   */
  async reconcilePayments(startDate, endDate, options = {}) {
    const { autoFix = false, dryRun = true } = options;

    this.logger.info('Starting payment reconciliation', {
      startDate,
      endDate,
      autoFix,
      dryRun
    });

    try {
      const reconciliationReport = {
        period: { startDate, endDate },
        summary: {
          totalStripePayments: 0,
          totalDbPayments: 0,
          matchedPayments: 0,
          missingInDb: 0,
          missingInStripe: 0,
          amountDiscrepancies: 0
        },
        discrepancies: [],
        fixes: [],
        errors: []
      };

      // Get Stripe payments
      const stripePayments = await this.getStripePayments(startDate, endDate);
      reconciliationReport.summary.totalStripePayments = stripePayments.length;

      // Get database payments
      const dbPayments = await this.getDatabasePayments(startDate, endDate);
      reconciliationReport.summary.totalDbPayments = dbPayments.length;

      // Create lookup maps
      const stripeMap = new Map(stripePayments.map(p => [p.id, p]));
      const dbMap = new Map(dbPayments.map(p => [p.stripe_payment_intent_id, p]));

      // Find discrepancies
      await this.findDiscrepancies(stripeMap, dbMap, reconciliationReport);

      // Apply fixes if enabled
      if (autoFix && !dryRun) {
        await this.applyFixes(reconciliationReport);
      }

      this.logger.info('Payment reconciliation completed', {
        summary: reconciliationReport.summary,
        discrepanciesFound: reconciliationReport.discrepancies.length
      });

      return reconciliationReport;

    } catch (error) {
      this.logger.error('Payment reconciliation failed', {
        error: error.message,
        startDate,
        endDate
      });
      throw error;
    }
  }

  /**
   * Get payments from Stripe API
   */
  async getStripePayments(startDate, endDate) {
    const payments = [];
    let hasMore = true;
    let startingAfter = null;

    try {
      while (hasMore) {
        const params = {
          limit: 100,
          created: {
            gte: Math.floor(new Date(startDate).getTime() / 1000),
            lte: Math.floor(new Date(endDate).getTime() / 1000)
          }
        };

        if (startingAfter) {
          params.starting_after = startingAfter;
        }

        const stripeResponse = await stripe.paymentIntents.list(params);

        payments.push(...stripeResponse.data);
        hasMore = stripeResponse.has_more;

        if (hasMore && stripeResponse.data.length > 0) {
          startingAfter = stripeResponse.data[stripeResponse.data.length - 1].id;
        }
      }

      this.logger.info('Retrieved Stripe payments', {
        count: payments.length,
        period: { startDate, endDate }
      });

      return payments;

    } catch (error) {
      this.logger.error('Failed to retrieve Stripe payments', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get payments from database
   */
  async getDatabasePayments(startDate, endDate) {
    try {
      const { data: payments, error } = await supabase
        .from('payment_attempts')
        .select('*')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .not('stripe_payment_intent_id', 'is', null);

      if (error) throw error;

      this.logger.info('Retrieved database payments', {
        count: payments.length,
        period: { startDate, endDate }
      });

      return payments;

    } catch (error) {
      this.logger.error('Failed to retrieve database payments', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Find discrepancies between Stripe and database
   */
  async findDiscrepancies(stripeMap, dbMap, report) {
    // Check for payments in Stripe but not in DB
    for (const [stripeId, stripePayment] of stripeMap) {
      if (!dbMap.has(stripeId)) {
        report.discrepancies.push({
          type: 'missing_in_database',
          stripePaymentId: stripeId,
          amount: stripePayment.amount,
          status: stripePayment.status,
          created: new Date(stripePayment.created * 1000),
          severity: stripePayment.status === 'succeeded' ? 'high' : 'medium'
        });
        report.summary.missingInDb++;
      }
    }

    // Check for payments in DB but not in Stripe
    for (const [paymentIntentId, dbPayment] of dbMap) {
      if (!stripeMap.has(paymentIntentId)) {
        report.discrepancies.push({
          type: 'missing_in_stripe',
          dbPaymentId: dbPayment.id,
          stripePaymentId: paymentIntentId,
          amount: dbPayment.amount,
          status: dbPayment.status,
          created: new Date(dbPayment.created_at),
          severity: 'medium'
        });
        report.summary.missingInStripe++;
      }
    }

    // Check for amount discrepancies
    for (const [stripeId, stripePayment] of stripeMap) {
      const dbPayment = dbMap.get(stripeId);
      if (dbPayment && stripePayment.amount !== dbPayment.amount) {
        report.discrepancies.push({
          type: 'amount_mismatch',
          stripePaymentId: stripeId,
          dbPaymentId: dbPayment.id,
          stripeAmount: stripePayment.amount,
          dbAmount: dbPayment.amount,
          difference: stripePayment.amount - dbPayment.amount,
          severity: 'high'
        });
        report.summary.amountDiscrepancies++;
      }
    }

    // Check for status discrepancies
    for (const [stripeId, stripePayment] of stripeMap) {
      const dbPayment = dbMap.get(stripeId);
      if (dbPayment && stripePayment.status !== dbPayment.status) {
        report.discrepancies.push({
          type: 'status_mismatch',
          stripePaymentId: stripeId,
          dbPaymentId: dbPayment.id,
          stripeStatus: stripePayment.status,
          dbStatus: dbPayment.status,
          severity: 'medium'
        });
      }
    }

    report.summary.matchedPayments = Math.max(0,
      Math.min(stripeMap.size, dbMap.size) - report.summary.amountDiscrepancies
    );
  }

  /**
   * Apply automatic fixes for discrepancies
   */
  async applyFixes(report) {
    for (const discrepancy of report.discrepancies) {
      try {
        let fix = null;

        switch (discrepancy.type) {
          case 'missing_in_database':
            fix = await this.fixMissingDatabasePayment(discrepancy);
            break;

          case 'amount_mismatch':
            fix = await this.fixAmountMismatch(discrepancy);
            break;

          case 'status_mismatch':
            fix = await this.fixStatusMismatch(discrepancy);
            break;

          default:
            this.logger.warn('No automatic fix available', {
              discrepancyType: discrepancy.type
            });
            continue;
        }

        if (fix) {
          report.fixes.push(fix);
        }

      } catch (error) {
        this.logger.error('Failed to apply fix', {
          discrepancy,
          error: error.message
        });

        report.errors.push({
          discrepancy,
          error: error.message
        });
      }
    }
  }

  /**
   * Fix missing payment in database
   */
  async fixMissingDatabasePayment(discrepancy) {
    try {
      // Get full payment details from Stripe
      const stripePayment = await stripe.paymentIntents.retrieve(discrepancy.stripePaymentId);

      // Extract user ID from metadata
      const userId = stripePayment.metadata?.user_id;
      if (!userId) {
        throw new Error('No user ID in payment metadata');
      }

      // Create database record
      const { error } = await supabase.rpc('log_payment_attempt', {
        p_user_id: userId,
        p_ip_address: null,
        p_user_agent: 'reconciliation-service',
        p_amount: stripePayment.amount,
        p_currency: stripePayment.currency,
        p_status: stripePayment.status,
        p_stripe_payment_intent_id: stripePayment.id
      });

      if (error) throw error;

      // If payment succeeded, ensure credits were added
      if (stripePayment.status === 'succeeded' && stripePayment.metadata?.purchase_type === 'resume_credits') {
        const creditCount = parseInt(stripePayment.metadata.credit_count);
        if (creditCount > 0) {
          await this.ensureCreditsAdded(userId, creditCount, stripePayment.id);
        }
      }

      return {
        type: 'missing_payment_added',
        stripePaymentId: discrepancy.stripePaymentId,
        action: 'Created database record',
        success: true
      };

    } catch (error) {
      throw new Error(`Failed to fix missing database payment: ${error.message}`);
    }
  }

  /**
   * Fix amount mismatch
   */
  async fixAmountMismatch(discrepancy) {
    try {
      // Update database with Stripe amount (Stripe is source of truth)
      const { error } = await supabase
        .from('payment_attempts')
        .update({
          amount: discrepancy.stripeAmount,
          updated_at: new Date().toISOString()
        })
        .eq('id', discrepancy.dbPaymentId);

      if (error) throw error;

      return {
        type: 'amount_corrected',
        dbPaymentId: discrepancy.dbPaymentId,
        oldAmount: discrepancy.dbAmount,
        newAmount: discrepancy.stripeAmount,
        action: 'Updated database amount to match Stripe',
        success: true
      };

    } catch (error) {
      throw new Error(`Failed to fix amount mismatch: ${error.message}`);
    }
  }

  /**
   * Fix status mismatch
   */
  async fixStatusMismatch(discrepancy) {
    try {
      // Update database with Stripe status (Stripe is source of truth)
      const { error } = await supabase
        .from('payment_attempts')
        .update({
          status: discrepancy.stripeStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', discrepancy.dbPaymentId);

      if (error) throw error;

      return {
        type: 'status_corrected',
        dbPaymentId: discrepancy.dbPaymentId,
        oldStatus: discrepancy.dbStatus,
        newStatus: discrepancy.stripeStatus,
        action: 'Updated database status to match Stripe',
        success: true
      };

    } catch (error) {
      throw new Error(`Failed to fix status mismatch: ${error.message}`);
    }
  }

  /**
   * Ensure credits were properly added for successful payment
   */
  async ensureCreditsAdded(userId, creditCount, paymentIntentId) {
    try {
      // Check if credits were already added by looking at revenue events
      const { data: revenueEvent } = await supabase
        .from('revenue_events')
        .select('id')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .eq('user_id', userId)
        .single();

      if (revenueEvent) {
        // Credits were already processed
        return;
      }

      // Add credits and create revenue event
      const { data: currentProfile } = await supabase
        .from('user_profiles')
        .select('resume_credits')
        .eq('id', userId)
        .single();

      if (!currentProfile) {
        throw new Error('User profile not found');
      }

      const newCreditTotal = (currentProfile.resume_credits || 0) + creditCount;

      // Update credits
      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          resume_credits: newCreditTotal,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (updateError) throw updateError;

      // Log revenue event
      const { error: revenueError } = await supabase
        .from('revenue_events')
        .insert({
          event_type: 'one_time_purchase',
          user_id: userId,
          amount: creditCount * CONFIG.billing.oneTimePurchases.resumeCredits.pricePerCredit,
          currency: 'usd',
          stripe_payment_intent_id: paymentIntentId,
          metadata: {
            credit_count: creditCount,
            new_credit_total: newCreditTotal,
            reconciliation_fix: true
          }
        });

      if (revenueError) throw revenueError;

      this.logger.info('Credits added during reconciliation', {
        userId,
        paymentIntentId,
        creditsAdded: creditCount,
        newTotal: newCreditTotal
      });

    } catch (error) {
      this.logger.error('Failed to ensure credits added', {
        userId,
        paymentIntentId,
        creditCount,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Manual payment processing for failed transactions
   */
  async processManualPayment(paymentData, adminUserId) {
    const {
      userId,
      amount,
      currency = 'usd',
      reason,
      description,
      credits,
      refund = false
    } = paymentData;

    this.logger.info('Processing manual payment', {
      userId,
      amount,
      reason,
      refund,
      adminUserId
    });

    try {
      // Validate input
      if (!userId || !amount || !reason) {
        throw new Error('Missing required fields: userId, amount, reason');
      }

      // Create manual payment record
      const { data: manualPayment, error: paymentError } = await supabase
        .from('manual_payments')
        .insert({
          user_id: userId,
          amount: refund ? -Math.abs(amount) : Math.abs(amount),
          currency,
          reason,
          description,
          processed_by: adminUserId,
          status: 'completed',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Handle credits for non-refund transactions
      if (!refund && credits && credits > 0) {
        const { data: currentProfile } = await supabase
          .from('user_profiles')
          .select('resume_credits')
          .eq('id', userId)
          .single();

        if (currentProfile) {
          const newCreditTotal = (currentProfile.resume_credits || 0) + credits;

          const { error: creditError } = await supabase
            .from('user_profiles')
            .update({
              resume_credits: newCreditTotal,
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);

          if (creditError) throw creditError;

          // Log revenue event
          await supabase
            .from('revenue_events')
            .insert({
              event_type: 'manual_payment',
              user_id: userId,
              amount: Math.abs(amount),
              currency,
              metadata: {
                manual_payment_id: manualPayment.id,
                credit_count: credits,
                new_credit_total: newCreditTotal,
                reason,
                processed_by: adminUserId
              }
            });
        }
      }

      // Send notification to user
      try {
        const { data: user } = await supabase
          .from('user_profiles')
          .select('email, full_name')
          .eq('id', userId)
          .single();

        if (user) {
          await this.sendManualPaymentNotification(user, {
            amount: Math.abs(amount) / 100,
            currency: currency.toUpperCase(),
            reason,
            refund,
            credits
          });
        }
      } catch (emailError) {
        this.logger.warn('Failed to send manual payment notification', {
          userId,
          error: emailError.message
        });
      }

      this.logger.info('Manual payment processed successfully', {
        manualPaymentId: manualPayment.id,
        userId,
        amount,
        refund
      });

      return {
        success: true,
        manualPaymentId: manualPayment.id,
        userId,
        amount,
        credits: credits || 0,
        refund
      };

    } catch (error) {
      this.logger.error('Manual payment processing failed', {
        userId,
        amount,
        reason,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get reconciliation history and audit trail
   */
  async getReconciliationHistory(limit = 50, offset = 0) {
    try {
      const { data: history, error } = await supabase
        .from('reconciliation_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      return {
        history,
        pagination: {
          limit,
          offset,
          count: history.length,
          hasMore: history.length === limit
        }
      };

    } catch (error) {
      this.logger.error('Failed to get reconciliation history', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate financial audit report
   */
  async generateAuditReport(period) {
    const { startDate, endDate } = period;

    this.logger.info('Generating audit report', { startDate, endDate });

    try {
      const [
        revenueData,
        paymentAttempts,
        subscriptionMetrics,
        manualPayments,
        discrepancies
      ] = await Promise.all([
        this.getRevenueAuditData(startDate, endDate),
        this.getPaymentAuditData(startDate, endDate),
        this.getSubscriptionAuditData(startDate, endDate),
        this.getManualPaymentData(startDate, endDate),
        this.getDiscrepancyData(startDate, endDate)
      ]);

      const auditReport = {
        period: { startDate, endDate },
        summary: {
          totalRevenue: revenueData.total || 0,
          totalTransactions: paymentAttempts.total || 0,
          successfulTransactions: paymentAttempts.successful || 0,
          failedTransactions: paymentAttempts.failed || 0,
          manualPayments: manualPayments.count || 0,
          discrepancies: discrepancies.count || 0
        },
        revenue: revenueData,
        payments: paymentAttempts,
        subscriptions: subscriptionMetrics,
        manualPayments: manualPayments,
        discrepancies: discrepancies,
        generatedAt: new Date().toISOString(),
        generatedBy: 'payment-reconciliation-service'
      };

      this.logger.info('Audit report generated', {
        period: auditReport.period,
        summary: auditReport.summary
      });

      return auditReport;

    } catch (error) {
      this.logger.error('Audit report generation failed', {
        error: error.message,
        period
      });
      throw error;
    }
  }

  /**
   * Helper methods for audit data collection
   */
  async getRevenueAuditData(startDate, endDate) {
    const { data, error } = await supabase
      .rpc('get_revenue_analytics', {
        p_start_date: startDate,
        p_end_date: endDate
      });

    if (error) throw error;
    return data[0] || {};
  }

  async getPaymentAuditData(startDate, endDate) {
    const { data, error } = await supabase
      .from('payment_attempts')
      .select('status, amount')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) throw error;

    return {
      total: data.length,
      successful: data.filter(p => p.status === 'succeeded').length,
      failed: data.filter(p => p.status === 'failed').length,
      totalAmount: data.reduce((sum, p) => sum + (p.amount || 0), 0)
    };
  }

  async getSubscriptionAuditData(startDate, endDate) {
    const { data, error } = await supabase
      .from('subscription_history')
      .select('action')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) throw error;

    return {
      total: data.length,
      created: data.filter(s => s.action === 'created').length,
      canceled: data.filter(s => s.action === 'canceled').length,
      updated: data.filter(s => s.action === 'updated').length
    };
  }

  async getManualPaymentData(startDate, endDate) {
    const { data, error } = await supabase
      .from('manual_payments')
      .select('amount, reason')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (error) throw error;

    return {
      count: data.length,
      totalAmount: data.reduce((sum, p) => sum + (p.amount || 0), 0),
      reasons: this.groupBy(data, 'reason')
    };
  }

  async getDiscrepancyData(startDate, endDate) {
    // This would query reconciliation reports or discrepancy logs
    return {
      count: 0,
      types: {},
      resolved: 0
    };
  }

  async sendManualPaymentNotification(user, paymentData) {
    const { amount, currency, reason, refund, credits } = paymentData;

    const subject = refund ? 'Refund Processed - ScottGPT' : 'Payment Adjustment - ScottGPT';
    const content = `
Hi ${user.full_name},

${refund ? 'A refund has been processed' : 'A payment adjustment has been made'} for your ScottGPT account.

Amount: ${currency} $${amount.toFixed(2)}
${credits ? `Credits ${refund ? 'removed' : 'added'}: ${credits}` : ''}
Reason: ${reason}

If you have any questions about this ${refund ? 'refund' : 'adjustment'}, please contact our support team.

Best regards,
The ScottGPT Team
    `.trim();

    await this.emailService.sendEmail(user.email, subject, content, 'manual_payment');
  }

  groupBy(array, key) {
    return array.reduce((result, item) => {
      const group = item[key] || 'unknown';
      result[group] = (result[group] || 0) + 1;
      return result;
    }, {});
  }
}

export default PaymentReconciliationService;