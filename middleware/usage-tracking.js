/**
 * Usage Tracking Middleware
 * =========================
 *
 * Middleware to enforce subscription limits and track resume generation usage.
 * Integrates with Stripe billing system to check and enforce tier-based limits.
 */

import winston from 'winston';
import BillingService from '../services/billing.js';
import usageConcurrencyManager from '../services/usage-concurrency-manager.js';
import CONFIG from '../config/app-config.js';

const billingService = new BillingService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'usage-tracking' },
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/usage-tracking.log' })
  ]
});

/**
 * Middleware to check resume generation limits before allowing API access
 * Use this on resume generation endpoints
 */
export const checkResumeGenerationLimit = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      logger.error('No user ID found in request');
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to generate resumes'
      });
    }

    logger.info('Checking resume generation limit', { userId, ip: req.ip });

    // Check for concurrent requests
    if (usageConcurrencyManager.hasActiveSession(userId)) {
      const sessionInfo = usageConcurrencyManager.getSessionInfo(userId);
      logger.warn('Concurrent request blocked', {
        userId,
        activeSession: sessionInfo?.requestId,
        sessionDuration: sessionInfo?.duration
      });

      return res.status(429).json({
        error: 'Concurrent request blocked',
        message: 'Another resume generation is already in progress. Please wait for it to complete.',
        data: {
          remainingTime: sessionInfo?.remainingTime,
          sessionDuration: sessionInfo?.duration
        },
        code: 'CONCURRENT_REQUEST_BLOCKED'
      });
    }

    // Get comprehensive usage status with concurrency info
    const status = await usageConcurrencyManager.getUsageStatusWithConcurrency(userId);

    // Check if user can generate resume
    if (!status.usage.canGenerateResume) {
      logger.warn('Resume generation blocked - limit exceeded', {
        userId,
        tier: status.subscription.tier,
        used: status.usage.resumeCountUsed,
        limit: status.usage.resumeCountLimit,
        resetDate: status.usage.resetDate
      });

      return res.status(429).json({
        error: 'Resume generation limit exceeded',
        message: `You have reached your ${status.subscription.tier} plan limit of ${status.usage.resumeCountLimit} resumes`,
        data: {
          tier: status.subscription.tier,
          resumeCountUsed: status.usage.resumeCountUsed,
          resumeCountLimit: status.usage.resumeCountLimit,
          resetDate: status.usage.resetDate,
          upgradeOptions: status.subscription.tier === 'free' ? {
            premium: CONFIG.billing.plans.premium,
            oneTime: CONFIG.billing.oneTimePurchases.additionalResume
          } : null
        },
        code: 'RESUME_LIMIT_EXCEEDED'
      });
    }

    // Acquire session for this request
    const sessionId = await usageConcurrencyManager.acquireSession(userId);
    if (!sessionId) {
      return res.status(429).json({
        error: 'Unable to start resume generation',
        message: 'Server is busy. Please try again in a moment.',
        code: 'SESSION_ACQUISITION_FAILED'
      });
    }

    // Attach usage info and session to request for use in the handler
    req.userUsage = status.usage;
    req.subscription = status.subscription;
    req.sessionId = sessionId;

    logger.info('Resume generation limit check passed', {
      userId,
      sessionId,
      tier: status.subscription.tier,
      remaining: status.usage.resumeCountRemaining
    });

    next();

  } catch (error) {
    logger.error('Failed to check resume generation limit', {
      userId: req.user?.id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Unable to verify usage limits',
      message: 'Please try again later'
    });
  }
};

/**
 * Middleware to increment usage after successful resume generation
 * Use this after resume generation is complete
 */
export const incrementResumeUsage = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const sessionId = req.sessionId;

    if (!userId) {
      logger.error('No user ID found for usage increment');
      return next(); // Don't block the response, but log the issue
    }

    if (!sessionId) {
      logger.error('No session ID found for usage increment', { userId });
      return next();
    }

    logger.info('Incrementing resume usage', { userId, sessionId });

    // Use atomic increment with session verification
    const success = await usageConcurrencyManager.checkAndIncrementUsageAtomic(userId, sessionId);

    if (!success) {
      logger.error('Failed to increment usage - this should not happen after limit check', {
        userId,
        sessionId
      });
    } else {
      logger.info('Resume usage incremented successfully', { userId, sessionId });
    }

    // Continue regardless of increment result to avoid blocking the response
    next();

  } catch (error) {
    logger.error('Failed to increment resume usage', {
      userId: req.user?.id,
      sessionId: req.sessionId,
      error: error.message
    });

    // Don't block the response for usage tracking errors
    next();
  } finally {
    // Always release the session, even if increment fails
    if (req.user?.id && req.sessionId) {
      usageConcurrencyManager.releaseSession(req.user.id, req.sessionId);
    }
  }
};

/**
 * Middleware to add usage information to responses
 * Use this to include usage data in API responses
 */
export const addUsageToResponse = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return next();
    }

    // Get current usage status
    const status = await billingService.getSubscriptionStatus(userId);

    // Store usage info for response
    req.usageInfo = {
      tier: status.subscription.tier,
      resumeCountUsed: status.usage.resumeCountUsed,
      resumeCountLimit: status.usage.resumeCountLimit,
      resumeCountRemaining: status.usage.resumeCountRemaining,
      resetDate: status.usage.resetDate,
      canGenerateResume: status.usage.canGenerateResume
    };

    next();

  } catch (error) {
    logger.error('Failed to get usage info for response', {
      userId: req.user?.id,
      error: error.message
    });

    // Don't block the request for usage info errors
    next();
  }
};

/**
 * Wrapper function to create usage-aware response
 * Use this to send responses that include usage information
 */
export const sendUsageAwareResponse = (req, res, data, statusCode = 200) => {
  const response = {
    success: true,
    data,
    timestamp: new Date().toISOString()
  };

  // Add usage information if available
  if (req.usageInfo) {
    response.usage = req.usageInfo;
  }

  res.status(statusCode).json(response);
};

/**
 * Function to check if user is on premium tier
 */
export const isPremiumUser = async (userId) => {
  try {
    const status = await billingService.getSubscriptionStatus(userId);
    return status.subscription.tier === 'premium' &&
           status.subscription.status === 'active';
  } catch (error) {
    logger.error('Failed to check premium status', { userId, error: error.message });
    return false;
  }
};

/**
 * Middleware to require premium subscription
 * Use this on premium-only endpoints
 */
export const requirePremiumSubscription = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated'
      });
    }

    const status = await billingService.getSubscriptionStatus(userId);

    if (status.subscription.tier !== 'premium' || status.subscription.status !== 'active') {
      logger.warn('Premium access denied', {
        userId,
        tier: status.subscription.tier,
        status: status.subscription.status
      });

      return res.status(403).json({
        error: 'Premium subscription required',
        message: 'This feature requires an active premium subscription',
        data: {
          currentTier: status.subscription.tier,
          upgradeOptions: CONFIG.billing.plans.premium
        },
        code: 'PREMIUM_REQUIRED'
      });
    }

    logger.info('Premium access granted', { userId });
    next();

  } catch (error) {
    logger.error('Failed to check premium subscription', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Unable to verify subscription',
      message: 'Please try again later'
    });
  }
};

/**
 * Get usage statistics for admin endpoints
 */
export const getUsageStatistics = async () => {
  try {
    // This would be implemented to provide admin insights
    // For now, return basic structure
    return {
      totalUsers: 0,
      activeSubscriptions: 0,
      monthlyRevenue: 0,
      resumesGenerated: 0
    };
  } catch (error) {
    logger.error('Failed to get usage statistics', { error: error.message });
    throw error;
  }
};

/**
 * Function to reset usage for all users (admin function)
 */
export const resetAllUsage = async () => {
  try {
    // Call the database function to reset monthly usage
    await supabase.rpc('reset_monthly_resume_usage');

    logger.info('Monthly usage reset completed for all users');
    return { success: true, message: 'Usage reset completed' };

  } catch (error) {
    logger.error('Failed to reset monthly usage', { error: error.message });
    throw error;
  }
};

/**
 * Utility function to format usage info for display
 */
export const formatUsageInfo = (usage) => {
  const resetDate = new Date(usage.resetDate);
  const now = new Date();
  const daysUntilReset = Math.ceil((resetDate - now) / (1000 * 60 * 60 * 24));

  return {
    ...usage,
    daysUntilReset: Math.max(0, daysUntilReset),
    utilizationPercent: Math.round((usage.resumeCountUsed / usage.resumeCountLimit) * 100),
    formattedResetDate: resetDate.toLocaleDateString(),
    status: usage.canGenerateResume ? 'active' : 'limit_reached'
  };
};

/**
 * Error handler for usage-related errors
 */
export const handleUsageError = (error, req, res, next) => {
  if (error.code === 'RESUME_LIMIT_EXCEEDED') {
    return res.status(429).json({
      error: 'Resume limit exceeded',
      message: error.message,
      code: error.code
    });
  }

  if (error.code === 'PREMIUM_REQUIRED') {
    return res.status(403).json({
      error: 'Premium subscription required',
      message: error.message,
      code: error.code
    });
  }

  // Pass to general error handler
  next(error);
};

export default {
  checkResumeGenerationLimit,
  incrementResumeUsage,
  addUsageToResponse,
  sendUsageAwareResponse,
  isPremiumUser,
  requirePremiumSubscription,
  getUsageStatistics,
  resetAllUsage,
  formatUsageInfo,
  handleUsageError
};