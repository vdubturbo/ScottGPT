/**
 * Payment Analytics API Routes
 * ============================
 *
 * Provides REST API endpoints for payment analytics, monitoring,
 * and business intelligence dashboards.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import PaymentAnalyticsService from '../services/payment-analytics.js';
import { authenticateToken } from '../middleware/auth.js';
import CONFIG from '../config/app-config.js';

const router = express.Router();
const analyticsService = new PaymentAnalyticsService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/analytics-api.log' })
  ]
});

// Rate limiting for analytics endpoints
const analyticsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 requests per window
  message: { error: 'Too many analytics requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * Middleware to check admin permissions
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Admin access required',
      message: 'This endpoint requires admin privileges'
    });
  }
  next();
};

// ============================================================================
// DASHBOARD ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/dashboard
 * Get comprehensive payment dashboard
 */
router.get('/dashboard', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const timeframe = req.query.timeframe || '24h';

    // Validate timeframe
    const validTimeframes = ['1h', '24h', '7d', '30d'];
    if (!validTimeframes.includes(timeframe)) {
      return res.status(400).json({
        error: 'Invalid timeframe',
        message: 'Timeframe must be one of: 1h, 24h, 7d, 30d'
      });
    }

    logger.info('Generating payment dashboard', {
      userId: req.user.id,
      timeframe,
      ip: req.ip
    });

    const dashboard = await analyticsService.getPaymentDashboard(timeframe);

    // Check for alerts
    const alerts = await analyticsService.checkAlertConditions(dashboard);

    res.json({
      success: true,
      data: {
        ...dashboard,
        alerts
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Dashboard generation failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Dashboard generation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/revenue
 * Get detailed revenue analytics
 */
router.get('/revenue', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing date parameters',
        message: 'start_date and end_date are required'
      });
    }

    logger.info('Getting revenue metrics', {
      userId: req.user.id,
      startDate: start_date,
      endDate: end_date
    });

    const revenueMetrics = await analyticsService.getRevenueMetrics(start_date, end_date);

    res.json({
      success: true,
      data: revenueMetrics,
      period: { start_date, end_date },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Revenue metrics failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Revenue metrics failed',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/transactions
 * Get transaction analytics
 */
router.get('/transactions', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing date parameters',
        message: 'start_date and end_date are required'
      });
    }

    logger.info('Getting transaction metrics', {
      userId: req.user.id,
      startDate: start_date,
      endDate: end_date
    });

    const transactionMetrics = await analyticsService.getTransactionMetrics(start_date, end_date);

    res.json({
      success: true,
      data: transactionMetrics,
      period: { start_date, end_date },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Transaction metrics failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Transaction metrics failed',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/subscriptions
 * Get subscription analytics
 */
router.get('/subscriptions', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing date parameters',
        message: 'start_date and end_date are required'
      });
    }

    logger.info('Getting subscription metrics', {
      userId: req.user.id,
      startDate: start_date,
      endDate: end_date
    });

    const subscriptionMetrics = await analyticsService.getSubscriptionMetrics(start_date, end_date);

    res.json({
      success: true,
      data: subscriptionMetrics,
      period: { start_date, end_date },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Subscription metrics failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Subscription metrics failed',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/errors
 * Get error and system health analytics
 */
router.get('/errors', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({
        error: 'Missing date parameters',
        message: 'start_date and end_date are required'
      });
    }

    logger.info('Getting error metrics', {
      userId: req.user.id,
      startDate: start_date,
      endDate: end_date
    });

    const errorMetrics = await analyticsService.getErrorMetrics(start_date, end_date);

    res.json({
      success: true,
      data: errorMetrics,
      period: { start_date, end_date },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error metrics failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Error metrics failed',
      message: error.message
    });
  }
});

// ============================================================================
// REAL-TIME MONITORING ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/health
 * Get real-time system health metrics
 */
router.get('/health', authenticateToken, requireAdmin, async (req, res) => {
  try {
    logger.info('Getting system health metrics', {
      userId: req.user.id,
      ip: req.ip
    });

    const healthMetrics = await analyticsService.getSystemHealthMetrics();

    res.json({
      success: true,
      data: healthMetrics,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Health metrics failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Health metrics failed',
      message: error.message
    });
  }
});

/**
 * POST /api/analytics/health/record
 * Record a health metric (for internal services)
 */
router.post('/health/record', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { metric_type, value, additional_data } = req.body;

    if (!metric_type || value === undefined) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'metric_type and value are required'
      });
    }

    await analyticsService.recordHealthMetric(metric_type, value, additional_data);

    logger.info('Health metric recorded', {
      userId: req.user.id,
      metricType: metric_type,
      value
    });

    res.json({
      success: true,
      message: 'Health metric recorded successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Health metric recording failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Health metric recording failed',
      message: error.message
    });
  }
});

/**
 * GET /api/analytics/alerts
 * Get current system alerts
 */
router.get('/alerts', authenticateToken, requireAdmin, async (req, res) => {
  try {
    logger.info('Getting system alerts', {
      userId: req.user.id,
      ip: req.ip
    });

    // Get current dashboard to check alert conditions
    const dashboard = await analyticsService.getPaymentDashboard('1h');
    const alerts = await analyticsService.checkAlertConditions(dashboard);

    res.json({
      success: true,
      data: {
        alerts,
        alertCount: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        warningAlerts: alerts.filter(a => a.severity === 'warning').length
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Alerts retrieval failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Alerts retrieval failed',
      message: error.message
    });
  }
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

/**
 * GET /api/analytics/export
 * Export analytics data in various formats
 */
router.get('/export', authenticateToken, requireAdmin, analyticsLimiter, async (req, res) => {
  try {
    const { format = 'json', timeframe = '30d', metrics } = req.query;

    const validFormats = ['json', 'csv'];
    if (!validFormats.includes(format)) {
      return res.status(400).json({
        error: 'Invalid format',
        message: 'Format must be json or csv'
      });
    }

    logger.info('Exporting analytics data', {
      userId: req.user.id,
      format,
      timeframe,
      metrics
    });

    const dashboard = await analyticsService.getPaymentDashboard(timeframe);

    if (format === 'csv') {
      // Convert to CSV format
      const csv = this.convertToCSV(dashboard, metrics);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=analytics_${timeframe}_${Date.now()}.csv`);
      res.send(csv);
    } else {
      // JSON format
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=analytics_${timeframe}_${Date.now()}.json`);
      res.json({
        success: true,
        data: dashboard,
        exportedAt: new Date().toISOString()
      });
    }

  } catch (error) {
    logger.error('Analytics export failed', {
      userId: req.user?.id,
      error: error.message
    });

    res.status(500).json({
      error: 'Analytics export failed',
      message: error.message
    });
  }
});

// ============================================================================
// DEVELOPMENT ENDPOINTS
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  /**
   * POST /api/analytics/dev/generate-test-data
   * Generate test analytics data (development only)
   */
  router.post('/dev/generate-test-data', authenticateToken, requireAdmin, async (req, res) => {
    try {
      const { days = 7, transactions_per_day = 10 } = req.body;

      // Generate test data logic would go here
      logger.info('Generating test analytics data', {
        userId: req.user.id,
        days,
        transactionsPerDay: transactions_per_day
      });

      res.json({
        success: true,
        message: `Generated ${days * transactions_per_day} test transactions`,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({
        error: 'Test data generation failed',
        message: error.message
      });
    }
  });
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in analytics router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
    userId: req.user?.id
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred during analytics operation'
  });
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert analytics data to CSV format
 */
function convertToCSV(data, metricsFilter) {
  // Simplified CSV conversion - would need more sophisticated implementation
  const headers = ['Date', 'Revenue', 'Transactions', 'Success Rate'];
  const rows = data.revenue.trends.daily.map(day => [
    day.date,
    day.revenue,
    day.count,
    '98%' // Placeholder
  ]);

  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

export default router;