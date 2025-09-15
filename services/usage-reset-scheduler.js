/**
 * Usage Reset Scheduler Service
 * =============================
 *
 * Handles monthly usage resets for all users based on their subscription tiers.
 * Supports both calendar month resets (free tier) and subscription anniversary resets (premium).
 */

import cron from 'node-cron';
import { supabase } from '../config/database.js';
import winston from 'winston';
import CONFIG from '../config/app-config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'usage-reset-scheduler' },
  transports: [
    new winston.transports.File({ filename: 'logs/usage-reset.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class UsageResetScheduler {
  constructor() {
    this.tasks = [];
    this.isRunning = false;
  }

  /**
   * Start the scheduler with all reset tasks
   */
  start() {
    if (this.isRunning) {
      logger.warn('Usage reset scheduler is already running');
      return;
    }

    logger.info('Starting usage reset scheduler');

    // Daily check for users who need reset (runs at 02:00 every day)
    const dailyResetTask = cron.schedule('0 2 * * *', async () => {
      await this.runDailyResetCheck();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Monthly reset for free tier users (1st of every month at 02:00)
    const monthlyResetTask = cron.schedule('0 2 1 * *', async () => {
      await this.resetFreeUserUsage();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    // Hourly cleanup of expired subscriptions
    const cleanupTask = cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredSubscriptions();
    }, {
      scheduled: false,
      timezone: 'UTC'
    });

    this.tasks = [dailyResetTask, monthlyResetTask, cleanupTask];

    // Start all tasks
    this.tasks.forEach(task => task.start());

    this.isRunning = true;
    logger.info('Usage reset scheduler started successfully');
  }

  /**
   * Stop the scheduler
   */
  stop() {
    if (!this.isRunning) {
      logger.warn('Usage reset scheduler is not running');
      return;
    }

    logger.info('Stopping usage reset scheduler');

    this.tasks.forEach(task => {
      if (task) {
        task.stop();
      }
    });

    this.tasks = [];
    this.isRunning = false;
    logger.info('Usage reset scheduler stopped');
  }

  /**
   * Daily check for users who need their usage reset
   * Handles both subscription anniversaries and calendar month resets
   */
  async runDailyResetCheck() {
    try {
      logger.info('Running daily usage reset check');

      const today = new Date();
      today.setHours(0, 0, 0, 0); // Start of day

      // Get users whose reset date has passed
      const { data: usersToReset, error } = await supabase
        .from('user_profiles')
        .select('id, subscription_tier, subscription_start_date, resume_count_reset_date')
        .lte('resume_count_reset_date', today.toISOString());

      if (error) {
        throw new Error(`Failed to fetch users for reset: ${error.message}`);
      }

      logger.info(`Found ${usersToReset.length} users to reset`);

      let freeUsersReset = 0;
      let premiumUsersReset = 0;

      for (const user of usersToReset) {
        try {
          await this.resetUserUsage(user);

          if (user.subscription_tier === 'free') {
            freeUsersReset++;
          } else {
            premiumUsersReset++;
          }
        } catch (error) {
          logger.error(`Failed to reset usage for user ${user.id}`, {
            userId: user.id,
            error: error.message
          });
        }
      }

      logger.info('Daily usage reset check completed', {
        totalReset: usersToReset.length,
        freeUsersReset,
        premiumUsersReset
      });

      // Log to system logs
      await this.logResetEvent('daily_reset', {
        totalReset: usersToReset.length,
        freeUsersReset,
        premiumUsersReset,
        date: today.toISOString()
      });

    } catch (error) {
      logger.error('Daily usage reset check failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Reset usage for free tier users (calendar month)
   */
  async resetFreeUserUsage() {
    try {
      logger.info('Running monthly reset for free tier users');

      const { data: freeUsers, error } = await supabase
        .from('user_profiles')
        .select('id')
        .eq('subscription_tier', 'free');

      if (error) {
        throw new Error(`Failed to fetch free users: ${error.message}`);
      }

      logger.info(`Resetting usage for ${freeUsers.length} free tier users`);

      const nextResetDate = new Date();
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      nextResetDate.setDate(1);
      nextResetDate.setHours(0, 0, 0, 0);

      const { error: updateError } = await supabase
        .from('user_profiles')
        .update({
          resume_count_used: 0,
          resume_count_reset_date: nextResetDate.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('subscription_tier', 'free');

      if (updateError) {
        throw new Error(`Failed to reset free users: ${updateError.message}`);
      }

      logger.info(`Successfully reset ${freeUsers.length} free tier users`);

      await this.logResetEvent('monthly_free_reset', {
        usersReset: freeUsers.length,
        nextResetDate: nextResetDate.toISOString()
      });

    } catch (error) {
      logger.error('Monthly free user reset failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Reset usage for an individual user
   */
  async resetUserUsage(user) {
    const { id, subscription_tier, subscription_start_date } = user;

    let nextResetDate;
    let resumeLimit;

    if (subscription_tier === 'premium' && subscription_start_date) {
      // Premium users reset on subscription anniversary
      const startDate = new Date(subscription_start_date);
      nextResetDate = new Date(startDate);
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      resumeLimit = CONFIG.billing.plans.premium.resumeLimit;
    } else {
      // Free users reset on calendar month
      nextResetDate = new Date();
      nextResetDate.setMonth(nextResetDate.getMonth() + 1);
      nextResetDate.setDate(1);
      nextResetDate.setHours(0, 0, 0, 0);
      resumeLimit = CONFIG.billing.plans.free.resumeLimit;
    }

    const { error } = await supabase
      .from('user_profiles')
      .update({
        resume_count_used: 0,
        resume_count_limit: resumeLimit,
        resume_count_reset_date: nextResetDate.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      throw new Error(`Failed to reset user ${id}: ${error.message}`);
    }

    logger.debug(`Reset usage for user ${id}`, {
      userId: id,
      tier: subscription_tier,
      nextResetDate: nextResetDate.toISOString(),
      resumeLimit
    });
  }

  /**
   * Cleanup expired subscriptions
   */
  async cleanupExpiredSubscriptions() {
    try {
      logger.debug('Running subscription cleanup');

      const now = new Date();

      // Find expired premium subscriptions
      const { data: expiredSubs, error } = await supabase
        .from('user_profiles')
        .select('id, subscription_end_date')
        .eq('subscription_tier', 'premium')
        .eq('subscription_status', 'active')
        .lt('subscription_end_date', now.toISOString());

      if (error) {
        throw new Error(`Failed to fetch expired subscriptions: ${error.message}`);
      }

      if (expiredSubs.length === 0) {
        logger.debug('No expired subscriptions found');
        return;
      }

      logger.info(`Found ${expiredSubs.length} expired subscriptions to cleanup`);

      // Downgrade expired users to free tier
      for (const sub of expiredSubs) {
        try {
          await this.downgradeToFreeTier(sub.id);
        } catch (error) {
          logger.error(`Failed to downgrade user ${sub.id}`, {
            userId: sub.id,
            error: error.message
          });
        }
      }

      logger.info(`Cleaned up ${expiredSubs.length} expired subscriptions`);

    } catch (error) {
      logger.error('Subscription cleanup failed', { error: error.message });
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

    const { error } = await supabase
      .from('user_profiles')
      .update({
        subscription_tier: 'free',
        subscription_status: 'inactive',
        subscription_start_date: null,
        subscription_end_date: null,
        stripe_subscription_id: null,
        resume_count_limit: CONFIG.billing.plans.free.resumeLimit,
        resume_count_reset_date: nextResetDate.toISOString(),
        subscription_cancel_at_period_end: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);

    if (error) {
      throw new Error(`Failed to downgrade user ${userId}: ${error.message}`);
    }

    logger.info(`Downgraded user ${userId} to free tier`);
  }

  /**
   * Log reset events to system logs
   */
  async logResetEvent(eventType, metadata) {
    try {
      await supabase
        .from('system_logs')
        .insert({
          event_type: eventType,
          message: `Usage reset completed: ${eventType}`,
          metadata,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      logger.error('Failed to log reset event', { error: error.message });
    }
  }

  /**
   * Manually trigger reset for all users (admin function)
   */
  async manualResetAllUsers() {
    try {
      logger.info('Manual reset triggered for all users');

      const { error } = await supabase.rpc('reset_monthly_resume_usage');

      if (error) {
        throw new Error(`Manual reset failed: ${error.message}`);
      }

      logger.info('Manual reset completed successfully');

      await this.logResetEvent('manual_reset_all', {
        triggeredAt: new Date().toISOString(),
        triggeredBy: 'admin'
      });

    } catch (error) {
      logger.error('Manual reset failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Get scheduler status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeTasks: this.tasks.length,
      nextRuns: this.tasks.map(task => ({
        next: task.getStatus()?.next,
        status: task.getStatus()?.status
      }))
    };
  }
}

// Create singleton instance
const usageResetScheduler = new UsageResetScheduler();

export default usageResetScheduler;