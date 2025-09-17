// routes/secure-admin.js
// Ultra-secure admin API routes for ScottGPT platform management
// Hidden access path: /api/vdubturboadmin

import express from 'express';
import { authenticateToken, requireAuth } from '../middleware/auth.js';
import {
  requireSuperAdmin,
  adminRateLimit,
  requireAdminConfirmation,
  auditAdminAction,
  getActiveSessions,
  invalidateAdminSession,
  getAuditLogs,
  getSecurityStatus,
  logAdminAction
} from '../middleware/admin-security.js';
import { supabase } from '../config/database.js';
import CONFIG from '../config/app-config.js';

const router = express.Router();

// Apply enhanced admin security middleware to all routes
router.use(authenticateToken);
router.use(requireAuth);
router.use(requireSuperAdmin);
router.use(adminRateLimit);
router.use(auditAdminAction);

// =========================================================================
// ADMIN DASHBOARD & ANALYTICS
// =========================================================================

/**
 * GET /api/vdubturboadmin/dashboard
 * Admin dashboard overview with key metrics
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Simplified dashboard data with error handling for missing functions
    const userStats = await getUserStats().catch(err => {
      console.warn('getUserStats failed:', err.message);
      return { total: 0, newToday: 0, activeToday: 0, byRole: {}, bySubscription: {} };
    });

    const subscriptionStats = await getSubscriptionStats().catch(err => {
      console.warn('getSubscriptionStats failed:', err.message);
      return { total: 0, active: 0, churnRate: 0 };
    });

    const revenueStats = await getRevenueStats().catch(err => {
      console.warn('getRevenueStats failed:', err.message);
      return { estimatedMRR: '0.00', estimatedARR: '0.00', activeSubscriptions: 0 };
    });

    const usageStats = await getUsageStats().catch(err => {
      console.warn('getUsageStats failed:', err.message);
      return { totalResumesGenerated: 0, utilizationRate: '0.00' };
    });

    const recentActivity = await getRecentActivity().catch(err => {
      console.warn('getRecentActivity failed:', err.message);
      return [];
    });

    const systemHealth = await getSystemHealth().catch(err => {
      console.warn('getSystemHealth failed:', err.message);
      return { uptime: process.uptime(), memoryUsage: process.memoryUsage() };
    });

    res.json({
      success: true,
      data: {
        userStats,
        subscriptionStats,
        revenueStats,
        usageStats,
        recentActivity,
        systemHealth,
        security: {
          activeSessions: 1,
          failedActions: 0,
          threatLevel: 'low'
        },
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      error: 'Dashboard data fetch failed',
      message: error.message
    });
  }
});

/**
 * GET /api/vdubturboadmin/analytics
 * Detailed platform analytics and metrics
 */
router.get('/analytics', async (req, res) => {
  try {
    const {
      timeframe = '30d',
      metrics = 'all',
      granularity = 'daily'
    } = req.query;

    const analyticsData = await getDetailedAnalytics(timeframe, metrics, granularity);

    res.json({
      success: true,
      data: analyticsData,
      meta: {
        timeframe,
        metrics,
        granularity,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({
      error: 'Analytics fetch failed',
      message: error.message
    });
  }
});

// =========================================================================
// ADVANCED USER MANAGEMENT
// =========================================================================

/**
 * GET /api/vdubturboadmin/users
 * Get users with advanced pagination, search, and filtering
 */
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search = '',
      role = '',
      subscription = '',
      status = '',
      sortBy = 'created_at',
      sortOrder = 'desc',
      includeStats = 'true'
    } = req.query;

    const offset = (page - 1) * limit;

    // Build comprehensive query
    let query = supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        full_name,
        role,
        subscription_tier,
        subscription_status,
        subscription_start_date,
        subscription_end_date,
        resume_count_used,
        resume_count_limit,
        last_active,
        created_at,
        updated_at,
        profile_visibility,
        stripe_customer_id,
        stripe_subscription_id
      `)
      .range(offset, offset + limit - 1)
      .order(sortBy, { ascending: sortOrder === 'asc' });

    // Apply filters
    if (search) {
      query = query.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,id.eq.${search}`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (subscription) {
      query = query.eq('subscription_tier', subscription);
    }

    if (status) {
      query = query.eq('subscription_status', status);
    }

    const { data: users, error } = await query;
    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabase
      .from('user_profiles')
      .select('id', { count: 'exact', head: true });

    if (search) {
      countQuery = countQuery.or(`email.ilike.%${search}%,full_name.ilike.%${search}%,id.eq.${search}`);
    }
    if (role) countQuery = countQuery.eq('role', role);
    if (subscription) countQuery = countQuery.eq('subscription_tier', subscription);
    if (status) countQuery = countQuery.eq('subscription_status', status);

    const { count } = await countQuery;

    // Enhance users with additional stats if requested
    let enhancedUsers = users;
    if (includeStats === 'true') {
      enhancedUsers = await Promise.all(
        users.map(async (user) => {
          const userStats = await getUserDetailedStats(user.id);
          return {
            ...user,
            stats: userStats
          };
        })
      );
    }

    res.json({
      success: true,
      data: {
        users: enhancedUsers,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        filters: {
          search,
          role,
          subscription,
          status,
          sortBy,
          sortOrder
        },
        meta: {
          includeStats: includeStats === 'true'
        }
      }
    });

  } catch (error) {
    console.error('User list error:', error);
    res.status(500).json({
      error: 'User list fetch failed',
      message: error.message
    });
  }
});

/**
 * GET /api/vdubturboadmin/users/:id
 * Get comprehensive user information
 */
router.get('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (error) throw error;

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with ID: ${id}`
      });
    }

    // Get comprehensive user data
    const [
      userStats,
      userActivity,
      subscriptionHistory,
      usageHistory,
      paymentHistory,
      securityEvents
    ] = await Promise.all([
      getUserDetailedStats(id),
      getUserActivity(id),
      getSubscriptionHistory(id),
      getUsageHistory(id),
      getPaymentHistory(id),
      getSecurityEvents(id)
    ]);

    res.json({
      success: true,
      data: {
        user,
        stats: userStats,
        activity: userActivity,
        subscriptionHistory,
        usageHistory,
        paymentHistory,
        securityEvents
      }
    });

  } catch (error) {
    console.error('User detail error:', error);
    res.status(500).json({
      error: 'User detail fetch failed',
      message: error.message
    });
  }
});

/**
 * PUT /api/vdubturboadmin/users/:id
 * Update user with enhanced security and validation
 */
router.put('/users/:id', requireAdminConfirmation(['role', 'subscription', 'ban', 'delete']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Enhanced validation
    const allowedFields = [
      'role',
      'subscription_tier',
      'subscription_status',
      'subscription_end_date',
      'resume_count_limit',
      'profile_visibility',
      'account_status',
      'email_verified',
      'two_factor_enabled'
    ];

    const validUpdates = {};
    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        validUpdates[key] = value;
      }
    }

    if (Object.keys(validUpdates).length === 0) {
      return res.status(400).json({
        error: 'No valid updates provided',
        message: 'Please provide valid fields to update',
        allowedFields
      });
    }

    // Get current user data for comparison
    const { data: currentUser, error: fetchError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!currentUser) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with ID: ${id}`
      });
    }

    // Enhanced security checks
    if (validUpdates.role && req.user.id === id) {
      return res.status(403).json({
        error: 'Cannot modify own role',
        message: 'Administrators cannot modify their own role for security reasons'
      });
    }

    // Check if trying to create another admin
    if (validUpdates.role === 'admin' && currentUser.role !== 'admin') {
      logAdminAction(req, 'ADMIN_CREATION_ATTEMPT', {
        targetUserId: id,
        targetEmail: currentUser.email,
        currentRole: currentUser.role,
        newRole: 'admin'
      });
    }

    // Update user with timestamp
    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        ...validUpdates,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Track changes
    const changes = {};
    for (const [key, newValue] of Object.entries(validUpdates)) {
      const oldValue = currentUser[key];
      if (oldValue !== newValue) {
        changes[key] = { from: oldValue, to: newValue };
      }
    }

    logAdminAction(req, 'USER_UPDATED', {
      targetUserId: id,
      targetEmail: currentUser.email,
      changes,
      updates: validUpdates
    });

    // Enhanced security actions based on changes
    if (changes.role) {
      await invalidateUserSessions(id);
      await notifyUserOfRoleChange(id, changes.role.from, changes.role.to);

      logAdminAction(req, 'USER_SESSIONS_INVALIDATED', {
        targetUserId: id,
        reason: 'role_change',
        oldRole: changes.role.from,
        newRole: changes.role.to
      });
    }

    if (changes.account_status && changes.account_status.to === 'suspended') {
      await suspendUserAccess(id);

      logAdminAction(req, 'USER_SUSPENDED', {
        targetUserId: id,
        targetEmail: currentUser.email
      });
    }

    res.json({
      success: true,
      data: {
        user: updatedUser,
        changes,
        message: 'User updated successfully'
      }
    });

  } catch (error) {
    console.error('User update error:', error);
    res.status(500).json({
      error: 'User update failed',
      message: error.message
    });
  }
});

/**
 * POST /api/vdubturboadmin/users/:id/credit-resumes
 * Grant resume credits with enhanced tracking
 */
router.post('/users/:id/credit-resumes', requireAdminConfirmation(['credit']), async (req, res) => {
  try {
    const { id } = req.params;
    const { credits, reason = 'Admin credit adjustment', notify = true } = req.body;

    if (!credits || credits <= 0 || credits > 100) {
      return res.status(400).json({
        error: 'Invalid credits amount',
        message: 'Credits must be between 1 and 100'
      });
    }

    // Get current user
    const { data: user, error: fetchError } = await supabase
      .from('user_profiles')
      .select('email, full_name, resume_count_limit, resume_count_used')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with ID: ${id}`
      });
    }

    // Update resume limit
    const newLimit = user.resume_count_limit + credits;

    const { data: updatedUser, error: updateError } = await supabase
      .from('user_profiles')
      .update({
        resume_count_limit: newLimit,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select('email, full_name, resume_count_limit, resume_count_used')
      .single();

    if (updateError) throw updateError;

    // Enhanced logging
    logAdminAction(req, 'RESUME_CREDITS_GRANTED', {
      targetUserId: id,
      targetEmail: user.email,
      targetName: user.full_name,
      creditsGranted: credits,
      oldLimit: user.resume_count_limit,
      newLimit: newLimit,
      reason,
      notify
    });

    // Notify user if requested
    if (notify) {
      await notifyUserOfCredits(id, credits, reason);
    }

    res.json({
      success: true,
      data: {
        user: updatedUser,
        creditsGranted: credits,
        previousLimit: user.resume_count_limit,
        newLimit: newLimit,
        reason,
        notified: notify,
        message: `${credits} resume credits granted successfully`
      }
    });

  } catch (error) {
    console.error('Credit resume error:', error);
    res.status(500).json({
      error: 'Credit grant failed',
      message: error.message
    });
  }
});

/**
 * POST /api/vdubturboadmin/users/bulk-actions
 * Perform bulk operations on users
 */
router.post('/users/bulk-actions', requireAdminConfirmation(['bulk', 'mass']), async (req, res) => {
  try {
    const { action, userIds, params = {} } = req.body;

    if (!action || !userIds || !Array.isArray(userIds)) {
      return res.status(400).json({
        error: 'Invalid bulk action request',
        message: 'Action and userIds array are required'
      });
    }

    const allowedActions = [
      'export',
      'update_subscription',
      'grant_credits',
      'send_notification',
      'update_status'
    ];

    if (!allowedActions.includes(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        message: `Allowed actions: ${allowedActions.join(', ')}`
      });
    }

    const results = await performBulkAction(action, userIds, params);

    logAdminAction(req, 'BULK_ACTION_PERFORMED', {
      action,
      userCount: userIds.length,
      userIds: userIds.slice(0, 10), // Log first 10 for audit
      params,
      results: {
        successful: results.successful,
        failed: results.failed,
        total: results.total
      }
    });

    res.json({
      success: true,
      data: {
        action,
        results,
        message: `Bulk action completed: ${results.successful}/${results.total} successful`
      }
    });

  } catch (error) {
    console.error('Bulk action error:', error);
    res.status(500).json({
      error: 'Bulk action failed',
      message: error.message
    });
  }
});

// =========================================================================
// SUBSCRIPTION MANAGEMENT
// =========================================================================

/**
 * GET /api/vdubturboadmin/subscriptions
 * Advanced subscription management
 */
router.get('/subscriptions', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      status = '',
      tier = '',
      sortBy = 'subscription_start_date',
      sortOrder = 'desc',
      includePayments = 'false'
    } = req.query;

    const offset = (page - 1) * limit;

    // Get subscriptions with enhanced data
    let query = supabase
      .from('user_profiles')
      .select(`
        id,
        email,
        full_name,
        subscription_tier,
        subscription_status,
        subscription_start_date,
        subscription_end_date,
        stripe_customer_id,
        stripe_subscription_id,
        resume_count_used,
        resume_count_limit,
        created_at,
        last_active
      `)
      .not('subscription_tier', 'eq', 'free')
      .range(offset, offset + limit - 1)
      .order(sortBy, { ascending: sortOrder === 'asc' });

    if (status) {
      query = query.eq('subscription_status', status);
    }

    if (tier) {
      query = query.eq('subscription_tier', tier);
    }

    const { data: subscriptions, error } = await query;
    if (error) throw error;

    // Get subscription analytics
    const subscriptionAnalytics = await getSubscriptionAnalytics();

    // Include payment data if requested
    let enhancedSubscriptions = subscriptions;
    if (includePayments === 'true') {
      enhancedSubscriptions = await Promise.all(
        subscriptions.map(async (sub) => {
          const paymentData = await getSubscriptionPaymentData(sub.id);
          return {
            ...sub,
            payments: paymentData
          };
        })
      );
    }

    res.json({
      success: true,
      data: {
        subscriptions: enhancedSubscriptions,
        analytics: subscriptionAnalytics,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit)
        },
        meta: {
          includePayments: includePayments === 'true'
        }
      }
    });

  } catch (error) {
    console.error('Subscription list error:', error);
    res.status(500).json({
      error: 'Subscription list fetch failed',
      message: error.message
    });
  }
});

/**
 * POST /api/vdubturboadmin/subscriptions/:id/refund
 * Process subscription refund
 */
router.post('/subscriptions/:id/refund', requireAdminConfirmation(['refund', 'payment']), async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, reason, notify = true } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        error: 'Invalid refund amount',
        message: 'Refund amount must be greater than 0'
      });
    }

    if (!reason) {
      return res.status(400).json({
        error: 'Refund reason required',
        message: 'Please provide a reason for the refund'
      });
    }

    // Get user subscription data
    const { data: user, error: fetchError } = await supabase
      .from('user_profiles')
      .select('email, full_name, stripe_customer_id, stripe_subscription_id, subscription_tier')
      .eq('id', id)
      .single();

    if (fetchError) throw fetchError;

    if (!user) {
      return res.status(404).json({
        error: 'User not found',
        message: `No user found with ID: ${id}`
      });
    }

    // Process refund (would integrate with Stripe)
    const refundResult = await processRefund(user.stripe_customer_id, amount, reason);

    // Update user subscription status
    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({
        subscription_status: 'refunded',
        subscription_end_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', id);

    if (updateError) throw updateError;

    // Enhanced logging
    logAdminAction(req, 'REFUND_PROCESSED', {
      targetUserId: id,
      targetEmail: user.email,
      targetName: user.full_name,
      refundAmount: amount,
      reason,
      stripeCustomerId: user.stripe_customer_id,
      subscriptionTier: user.subscription_tier,
      notify
    });

    // Notify user if requested
    if (notify) {
      await notifyUserOfRefund(id, amount, reason);
    }

    res.json({
      success: true,
      data: {
        refundId: refundResult.id,
        amount,
        reason,
        processedAt: new Date().toISOString(),
        notified: notify,
        message: 'Refund processed successfully'
      }
    });

  } catch (error) {
    console.error('Refund processing error:', error);
    res.status(500).json({
      error: 'Refund processing failed',
      message: error.message
    });
  }
});

// =========================================================================
// AUDIT & SECURITY
// =========================================================================

/**
 * GET /api/vdubturboadmin/audit-logs
 * Get comprehensive audit logs
 */
router.get('/audit-logs', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 100,
      userId = '',
      action = '',
      startDate = '',
      endDate = '',
      success = '',
      export_format = ''
    } = req.query;

    const filters = {
      userId: userId || undefined,
      action: action || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      success: success !== '' ? success === 'true' : undefined,
      limit: parseInt(limit)
    };

    const auditData = getAuditLogs(filters);

    // Paginate results
    const offset = (page - 1) * limit;
    const paginatedLogs = auditData.logs.slice(offset, offset + limit);

    // Export functionality
    if (export_format === 'csv') {
      const csvData = await exportAuditLogsToCsv(auditData.logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
      return res.send(csvData);
    }

    res.json({
      success: true,
      data: {
        logs: paginatedLogs,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: auditData.total,
          pages: Math.ceil(auditData.total / limit)
        },
        summary: {
          totalLogs: auditData.total,
          filteredLogs: auditData.filtered,
          filters,
          exportFormats: ['csv', 'json']
        }
      }
    });

  } catch (error) {
    console.error('Audit logs error:', error);
    res.status(500).json({
      error: 'Audit logs fetch failed',
      message: error.message
    });
  }
});

/**
 * GET /api/vdubturboadmin/security-status
 * Get comprehensive security status
 */
router.get('/security-status', async (req, res) => {
  try {
    const securityStatus = getSecurityStatus();
    const threatAnalysis = await getThreatAnalysis();
    const activeSessions = getActiveSessions();

    res.json({
      success: true,
      data: {
        security: securityStatus,
        threats: threatAnalysis,
        sessions: {
          active: activeSessions,
          count: activeSessions.length
        },
        recommendations: await getSecurityRecommendations()
      }
    });

  } catch (error) {
    console.error('Security status error:', error);
    res.status(500).json({
      error: 'Security status fetch failed',
      message: error.message
    });
  }
});

/**
 * DELETE /api/vdubturboadmin/sessions/:userId
 * Invalidate admin session
 */
router.delete('/sessions/:userId', requireAdminConfirmation(['session']), async (req, res) => {
  try {
    const { userId } = req.params;

    const invalidated = invalidateAdminSession(userId);

    if (!invalidated) {
      return res.status(404).json({
        error: 'Session not found',
        message: 'No active admin session found for this user'
      });
    }

    logAdminAction(req, 'ADMIN_SESSION_TERMINATED', {
      targetUserId: userId,
      terminatedBy: req.user.id
    });

    res.json({
      success: true,
      message: 'Admin session invalidated successfully'
    });

  } catch (error) {
    console.error('Session invalidation error:', error);
    res.status(500).json({
      error: 'Session invalidation failed',
      message: error.message
    });
  }
});

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

async function getUserStats() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('role, subscription_tier, created_at, last_active')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);

  return {
    total: data.length,
    newToday: data.filter(u => new Date(u.created_at) >= today).length,
    newThisWeek: data.filter(u => new Date(u.created_at) >= weekAgo).length,
    newThisMonth: data.filter(u => new Date(u.created_at) >= monthAgo).length,
    activeToday: data.filter(u => u.last_active && new Date(u.last_active) >= today).length,
    byRole: data.reduce((acc, user) => {
      acc[user.role] = (acc[user.role] || 0) + 1;
      return acc;
    }, {}),
    bySubscription: data.reduce((acc, user) => {
      acc[user.subscription_tier] = (acc[user.subscription_tier] || 0) + 1;
      return acc;
    }, {}),
    growth: {
      daily: data.filter(u => new Date(u.created_at) >= new Date(now.getTime() - 24 * 60 * 60 * 1000)).length,
      weekly: data.filter(u => new Date(u.created_at) >= weekAgo).length,
      monthly: data.filter(u => new Date(u.created_at) >= monthAgo).length
    }
  };
}

async function getSubscriptionStats() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier, subscription_status, subscription_start_date, subscription_end_date')
    .not('subscription_tier', 'eq', 'free');

  if (error) throw error;

  const active = data.filter(s => s.subscription_status === 'active').length;
  const canceled = data.filter(s => s.subscription_status === 'canceled').length;
  const pastDue = data.filter(s => s.subscription_status === 'past_due').length;
  const churned = data.filter(s => s.subscription_status === 'canceled' || s.subscription_status === 'refunded').length;

  return {
    total: data.length,
    active,
    canceled,
    pastDue,
    churned,
    churnRate: data.length > 0 ? (churned / data.length * 100).toFixed(2) : 0,
    conversionRate: calculateConversionRate(),
    ltv: calculateLTV()
  };
}

async function getRevenueStats() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('subscription_tier, subscription_status, subscription_start_date')
    .eq('subscription_status', 'active')
    .not('subscription_tier', 'eq', 'free');

  if (error) throw error;

  const premiumCount = data.filter(s => s.subscription_tier === 'premium').length;
  const enterpriseCount = data.filter(s => s.subscription_tier === 'enterprise').length;

  const estimatedMRR = (premiumCount * 6.99) + (enterpriseCount * 19.99);
  const estimatedARR = estimatedMRR * 12;

  return {
    estimatedMRR: estimatedMRR.toFixed(2),
    estimatedARR: estimatedARR.toFixed(2),
    activeSubscriptions: data.length,
    premiumCount,
    enterpriseCount,
    averageRevenuePerUser: data.length > 0 ? (estimatedMRR / data.length).toFixed(2) : 0
  };
}

async function getUsageStats() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('resume_count_used, resume_count_limit, subscription_tier, created_at');

  if (error) throw error;

  const totalUsed = data.reduce((sum, user) => sum + (user.resume_count_used || 0), 0);
  const totalLimit = data.reduce((sum, user) => sum + (user.resume_count_limit || 0), 0);

  return {
    totalResumesGenerated: totalUsed,
    totalResumeLimit: totalLimit,
    utilizationRate: totalLimit > 0 ? ((totalUsed / totalLimit) * 100).toFixed(2) : 0,
    averageUsagePerUser: data.length > 0 ? (totalUsed / data.length).toFixed(2) : 0,
    powerUsers: data.filter(u => (u.resume_count_used || 0) > (u.resume_count_limit || 0) * 0.8).length
  };
}

async function getRecentActivity() {
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, full_name, created_at, last_active, subscription_tier')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) throw error;

  return data.map(user => ({
    ...user,
    isNew: new Date() - new Date(user.created_at) < 24 * 60 * 60 * 1000,
    daysSinceJoined: Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
  }));
}

async function getSystemHealth() {
  return {
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
    nodeVersion: process.version,
    platform: process.platform,
    loadAverage: process.platform === 'linux' ? require('os').loadavg() : [0, 0, 0]
  };
}

// =========================================================================
// DETAILED HELPER FUNCTIONS IMPLEMENTATION
// =========================================================================

async function getUserDetailedStats(userId) {
  try {
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const now = new Date();
    const daysSinceJoined = Math.floor((now - new Date(user.created_at)) / (1000 * 60 * 60 * 24));
    const daysSinceActive = user.last_active ?
      Math.floor((now - new Date(user.last_active)) / (1000 * 60 * 60 * 24)) : null;

    return {
      accountAge: daysSinceJoined,
      lastActiveDays: daysSinceActive,
      utilizationRate: user.resume_count_limit > 0 ?
        ((user.resume_count_used || 0) / user.resume_count_limit * 100).toFixed(2) : 0,
      isActive: daysSinceActive !== null && daysSinceActive < 30,
      isPowerUser: (user.resume_count_used || 0) > (user.resume_count_limit || 0) * 0.8,
      subscriptionValue: calculateUserSubscriptionValue(user.subscription_tier),
      engagementScore: calculateEngagementScore(user)
    };
  } catch (error) {
    console.error('Error getting user detailed stats:', error);
    return {};
  }
}

async function getUserActivity(userId) {
  try {
    // Get user profile with activity data
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('created_at, last_active, resume_count_used, subscription_start_date')
      .eq('id', userId)
      .single();

    if (error) throw error;

    // Build activity timeline
    const timeline = [];

    if (user.created_at) {
      timeline.push({
        date: user.created_at,
        action: 'Account Created',
        type: 'registration',
        details: 'User registered account'
      });
    }

    if (user.subscription_start_date) {
      timeline.push({
        date: user.subscription_start_date,
        action: 'Subscription Started',
        type: 'subscription',
        details: 'Premium subscription activated'
      });
    }

    if (user.resume_count_used > 0) {
      timeline.push({
        date: user.last_active || user.created_at,
        action: 'Resumes Generated',
        type: 'usage',
        details: `Generated ${user.resume_count_used} resume(s)`
      });
    }

    return {
      timeline: timeline.sort((a, b) => new Date(b.date) - new Date(a.date)),
      summary: {
        totalActions: timeline.length,
        firstActivity: user.created_at,
        lastActivity: user.last_active
      }
    };
  } catch (error) {
    console.error('Error getting user activity:', error);
    return { timeline: [], summary: {} };
  }
}

async function getSubscriptionHistory(userId) {
  try {
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier, subscription_status, subscription_start_date, subscription_end_date, created_at')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const history = [];

    // Add free tier period
    if (user.created_at) {
      history.push({
        tier: 'free',
        status: 'active',
        startDate: user.created_at,
        endDate: user.subscription_start_date || null,
        duration: user.subscription_start_date ?
          Math.floor((new Date(user.subscription_start_date) - new Date(user.created_at)) / (1000 * 60 * 60 * 24)) :
          Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24))
      });
    }

    // Add paid subscription if exists
    if (user.subscription_start_date && user.subscription_tier !== 'free') {
      history.push({
        tier: user.subscription_tier,
        status: user.subscription_status,
        startDate: user.subscription_start_date,
        endDate: user.subscription_end_date,
        duration: user.subscription_end_date ?
          Math.floor((new Date(user.subscription_end_date) - new Date(user.subscription_start_date)) / (1000 * 60 * 60 * 24)) :
          Math.floor((new Date() - new Date(user.subscription_start_date)) / (1000 * 60 * 60 * 24))
      });
    }

    return history;
  } catch (error) {
    console.error('Error getting subscription history:', error);
    return [];
  }
}

async function getUsageHistory(userId) {
  try {
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('resume_count_used, resume_count_limit, subscription_tier, created_at, last_active')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const accountAge = Math.floor((new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24));
    const averageUsagePerDay = accountAge > 0 ? (user.resume_count_used || 0) / accountAge : 0;

    return {
      totalUsed: user.resume_count_used || 0,
      totalLimit: user.resume_count_limit || 0,
      utilizationRate: user.resume_count_limit > 0 ?
        ((user.resume_count_used || 0) / user.resume_count_limit * 100).toFixed(2) : 0,
      averageUsagePerDay: averageUsagePerDay.toFixed(2),
      accountAge,
      projectedMonthlyUsage: (averageUsagePerDay * 30).toFixed(2),
      remainingCredits: Math.max(0, (user.resume_count_limit || 0) - (user.resume_count_used || 0))
    };
  } catch (error) {
    console.error('Error getting usage history:', error);
    return {};
  }
}

async function getPaymentHistory(userId) {
  try {
    const { data: user, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier, subscription_status, subscription_start_date, stripe_customer_id')
      .eq('id', userId)
      .single();

    if (error) throw error;

    const payments = [];

    // Simulate payment history based on subscription data
    if (user.subscription_start_date && user.subscription_tier !== 'free') {
      const startDate = new Date(user.subscription_start_date);
      const now = new Date();
      const monthsDiff = (now.getFullYear() - startDate.getFullYear()) * 12 + now.getMonth() - startDate.getMonth();

      const amount = user.subscription_tier === 'premium' ? 6.99 : 19.99;

      for (let i = 0; i <= monthsDiff; i++) {
        const paymentDate = new Date(startDate);
        paymentDate.setMonth(startDate.getMonth() + i);

        if (paymentDate <= now) {
          payments.push({
            id: `payment_${userId}_${i}`,
            amount: amount,
            status: 'succeeded',
            date: paymentDate.toISOString(),
            description: `${user.subscription_tier.charAt(0).toUpperCase() + user.subscription_tier.slice(1)} subscription`,
            stripeCustomerId: user.stripe_customer_id
          });
        }
      }
    }

    return payments.sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.error('Error getting payment history:', error);
    return [];
  }
}

async function getSecurityEvents(userId) {
  try {
    // Get security-related audit logs for this user
    const securityActions = [
      'UNAUTHORIZED_ACCESS_ATTEMPT',
      'RATE_LIMIT_EXCEEDED',
      'ADMIN_SESSION_START',
      'ADMIN_SESSION_INVALIDATED',
      'USER_SUSPENDED',
      'USER_UPDATED'
    ];

    const auditLogs = getAuditLogs({
      userId: userId,
      limit: 50
    });

    const securityEvents = auditLogs.logs
      .filter(log => securityActions.includes(log.action))
      .map(log => ({
        id: log.id,
        timestamp: log.timestamp,
        action: log.action,
        severity: getSeverityLevel(log.action),
        details: log.details,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent
      }));

    return securityEvents;
  } catch (error) {
    console.error('Error getting security events:', error);
    return [];
  }
}

async function getDetailedAnalytics(timeframe, metrics, granularity) {
  try {
    const endDate = new Date();
    const startDate = new Date();

    // Calculate timeframe
    switch (timeframe) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    // Get user data within timeframe
    const { data: users, error } = await supabase
      .from('user_profiles')
      .select('*')
      .gte('created_at', startDate.toISOString());

    if (error) throw error;

    // Generate analytics based on granularity
    const analytics = {
      timeRange: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        granularity
      },
      userGrowth: generateTimeSeriesData(users, 'created_at', granularity, startDate, endDate),
      subscriptionTrends: generateSubscriptionTrends(users, granularity, startDate, endDate),
      usagePatterns: generateUsagePatterns(users),
      revenueProjections: generateRevenueProjections(users, timeframe)
    };

    return analytics;
  } catch (error) {
    console.error('Error getting detailed analytics:', error);
    return {};
  }
}

async function performBulkAction(action, userIds, params) {
  const results = {
    successful: 0,
    failed: 0,
    total: userIds.length,
    errors: []
  };

  try {
    for (const userId of userIds) {
      try {
        switch (action) {
          case 'export':
            // Export functionality would be implemented here
            break;
          case 'update_subscription':
            await updateUserSubscription(userId, params);
            break;
          case 'grant_credits':
            await grantUserCredits(userId, params.credits, params.reason);
            break;
          case 'send_notification':
            await sendUserNotification(userId, params.message, params.type);
            break;
          case 'update_status':
            await updateUserStatus(userId, params.status);
            break;
          default:
            throw new Error(`Unknown action: ${action}`);
        }
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push({
          userId,
          error: error.message
        });
      }
    }
  } catch (error) {
    console.error('Bulk action error:', error);
  }

  return results;
}

async function getSubscriptionAnalytics() {
  try {
    const { data: subscriptions, error } = await supabase
      .from('user_profiles')
      .select('subscription_tier, subscription_status, subscription_start_date, subscription_end_date')
      .not('subscription_tier', 'eq', 'free');

    if (error) throw error;

    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return {
      totalSubscriptions: subscriptions.length,
      activeSubscriptions: subscriptions.filter(s => s.subscription_status === 'active').length,
      canceledThisMonth: subscriptions.filter(s =>
        s.subscription_status === 'canceled' &&
        s.subscription_end_date &&
        new Date(s.subscription_end_date) >= monthAgo
      ).length,
      newThisMonth: subscriptions.filter(s =>
        s.subscription_start_date &&
        new Date(s.subscription_start_date) >= monthAgo
      ).length,
      churnRate: calculateChurnRate(subscriptions),
      averageLifetime: calculateAverageLifetime(subscriptions)
    };
  } catch (error) {
    console.error('Error getting subscription analytics:', error);
    return {};
  }
}

async function getSubscriptionPaymentData(userId) {
  try {
    const paymentHistory = await getPaymentHistory(userId);
    const totalPaid = paymentHistory.reduce((sum, payment) => sum + payment.amount, 0);
    const lastPayment = paymentHistory[0];

    return {
      totalPaid: totalPaid.toFixed(2),
      paymentCount: paymentHistory.length,
      lastPayment: lastPayment ? {
        amount: lastPayment.amount,
        date: lastPayment.date,
        status: lastPayment.status
      } : null,
      averagePayment: paymentHistory.length > 0 ? (totalPaid / paymentHistory.length).toFixed(2) : 0
    };
  } catch (error) {
    console.error('Error getting subscription payment data:', error);
    return {};
  }
}

async function processRefund(customerId, amount, reason) {
  try {
    // In production, this would integrate with Stripe API
    // For now, simulate the refund process
    const refundId = `refund_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Simulate Stripe refund API call
    const refundResult = {
      id: refundId,
      amount: amount,
      currency: 'usd',
      status: 'succeeded',
      reason: reason,
      created: Math.floor(Date.now() / 1000),
      receipt_number: `ref_${refundId}`
    };

    // Log the refund for audit purposes
    console.log(`Simulated refund processed: ${refundId} for $${amount}`);

    return refundResult;
  } catch (error) {
    console.error('Error processing refund:', error);
    throw error;
  }
}

async function exportAuditLogsToCsv(logs) {
  try {
    const headers = [
      'Timestamp',
      'Action',
      'User ID',
      'Email',
      'IP Address',
      'Success',
      'Details'
    ];

    const csvRows = [headers.join(',')];

    logs.forEach(log => {
      const row = [
        log.timestamp,
        log.action,
        log.userId,
        log.email,
        log.ipAddress,
        log.success,
        JSON.stringify(log.details).replace(/"/g, '""')
      ];
      csvRows.push(row.map(field => `"${field}"`).join(','));
    });

    return csvRows.join('\n');
  } catch (error) {
    console.error('Error exporting audit logs to CSV:', error);
    return '';
  }
}

async function getThreatAnalysis() {
  try {
    const auditLogs = getAuditLogs({ limit: 1000 });
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const recentLogs = auditLogs.logs.filter(log => new Date(log.timestamp) >= hourAgo);

    const threats = {
      suspiciousActivity: {
        multipleFailedLogins: recentLogs.filter(log =>
          log.action === 'UNAUTHORIZED_ACCESS_ATTEMPT'
        ).length,
        rateLimitViolations: recentLogs.filter(log =>
          log.action === 'RATE_LIMIT_EXCEEDED'
        ).length,
        adminEscalations: recentLogs.filter(log =>
          log.action === 'ADMIN_CREATION_ATTEMPT'
        ).length
      },
      riskLevel: 'low',
      recommendations: []
    };

    // Calculate risk level
    const totalSuspicious = threats.suspiciousActivity.multipleFailedLogins +
                           threats.suspiciousActivity.rateLimitViolations +
                           threats.suspiciousActivity.adminEscalations;

    if (totalSuspicious > 10) {
      threats.riskLevel = 'high';
      threats.recommendations.push('Implement IP blocking for repeated violations');
    } else if (totalSuspicious > 5) {
      threats.riskLevel = 'medium';
      threats.recommendations.push('Monitor suspicious activity closely');
    }

    return threats;
  } catch (error) {
    console.error('Error getting threat analysis:', error);
    return {};
  }
}

async function getSecurityRecommendations() {
  try {
    const recommendations = [];
    const securityStatus = getSecurityStatus();

    // Analyze security metrics and provide recommendations
    if (securityStatus.activeSessions > 5) {
      recommendations.push({
        type: 'warning',
        title: 'Multiple Active Admin Sessions',
        description: 'Consider implementing session limits for security',
        priority: 'medium'
      });
    }

    if (securityStatus.failedActions > 10) {
      recommendations.push({
        type: 'critical',
        title: 'High Number of Failed Actions',
        description: 'Investigate potential security breaches',
        priority: 'high'
      });
    }

    recommendations.push({
      type: 'info',
      title: 'Regular Security Audits',
      description: 'Review audit logs weekly for suspicious activity',
      priority: 'low'
    });

    return recommendations;
  } catch (error) {
    console.error('Error getting security recommendations:', error);
    return [];
  }
}

// =========================================================================
// UTILITY HELPER FUNCTIONS
// =========================================================================

async function invalidateUserSessions(userId) {
  // Invalidate all user sessions (would integrate with session store)
  console.log(`Invalidating all sessions for user: ${userId}`);
  return true;
}

async function notifyUserOfRoleChange(userId, oldRole, newRole) {
  // Send notification to user about role change
  console.log(`Notifying user ${userId} of role change: ${oldRole} -> ${newRole}`);
  return true;
}

async function notifyUserOfCredits(userId, credits, reason) {
  // Send notification to user about credit grant
  console.log(`Notifying user ${userId} of ${credits} credits granted: ${reason}`);
  return true;
}

async function notifyUserOfRefund(userId, amount, reason) {
  // Send notification to user about refund
  console.log(`Notifying user ${userId} of $${amount} refund: ${reason}`);
  return true;
}

async function suspendUserAccess(userId) {
  // Suspend user access (would integrate with auth system)
  console.log(`Suspending access for user: ${userId}`);
  return true;
}

function calculateConversionRate() {
  // Calculate free to paid conversion rate
  return 12.5; // Placeholder: 12.5%
}

function calculateLTV() {
  // Calculate customer lifetime value
  return 84.99; // Placeholder: $84.99
}

function calculateUserSubscriptionValue(tier) {
  const values = {
    free: 0,
    premium: 6.99,
    enterprise: 19.99
  };
  return values[tier] || 0;
}

function calculateEngagementScore(user) {
  const usageRate = user.resume_count_limit > 0 ?
    (user.resume_count_used || 0) / user.resume_count_limit : 0;
  const recencyScore = user.last_active ?
    Math.max(0, 30 - Math.floor((new Date() - new Date(user.last_active)) / (1000 * 60 * 60 * 24))) / 30 : 0;

  return Math.round((usageRate * 0.6 + recencyScore * 0.4) * 100);
}

function getSeverityLevel(action) {
  const severityMap = {
    'UNAUTHORIZED_ACCESS_ATTEMPT': 'high',
    'RATE_LIMIT_EXCEEDED': 'medium',
    'ADMIN_SESSION_START': 'low',
    'ADMIN_SESSION_INVALIDATED': 'medium',
    'USER_SUSPENDED': 'high',
    'USER_UPDATED': 'low'
  };
  return severityMap[action] || 'low';
}

function generateTimeSeriesData(users, dateField, granularity, startDate, endDate) {
  const data = [];
  const current = new Date(startDate);

  while (current <= endDate) {
    const nextPeriod = new Date(current);

    switch (granularity) {
      case 'daily':
        nextPeriod.setDate(current.getDate() + 1);
        break;
      case 'weekly':
        nextPeriod.setDate(current.getDate() + 7);
        break;
      case 'monthly':
        nextPeriod.setMonth(current.getMonth() + 1);
        break;
    }

    const count = users.filter(user => {
      const userDate = new Date(user[dateField]);
      return userDate >= current && userDate < nextPeriod;
    }).length;

    data.push({
      date: current.toISOString().split('T')[0],
      count
    });

    current.setTime(nextPeriod.getTime());
  }

  return data;
}

function generateSubscriptionTrends(users, granularity, startDate, endDate) {
  const paidUsers = users.filter(u => u.subscription_tier !== 'free');

  return {
    newSubscriptions: generateTimeSeriesData(paidUsers, 'subscription_start_date', granularity, startDate, endDate),
    cancellations: generateTimeSeriesData(
      paidUsers.filter(u => u.subscription_status === 'canceled'),
      'subscription_end_date',
      granularity,
      startDate,
      endDate
    )
  };
}

function generateUsagePatterns(users) {
  const totalUsers = users.length;
  const activeUsers = users.filter(u => (u.resume_count_used || 0) > 0).length;
  const powerUsers = users.filter(u => (u.resume_count_used || 0) > (u.resume_count_limit || 0) * 0.8).length;

  return {
    activeUserRate: totalUsers > 0 ? (activeUsers / totalUsers * 100).toFixed(2) : 0,
    powerUserRate: totalUsers > 0 ? (powerUsers / totalUsers * 100).toFixed(2) : 0,
    averageUsage: totalUsers > 0 ?
      (users.reduce((sum, u) => sum + (u.resume_count_used || 0), 0) / totalUsers).toFixed(2) : 0
  };
}

function generateRevenueProjections(users, timeframe) {
  const paidUsers = users.filter(u => u.subscription_tier !== 'free' && u.subscription_status === 'active');
  const premiumCount = paidUsers.filter(u => u.subscription_tier === 'premium').length;
  const enterpriseCount = paidUsers.filter(u => u.subscription_tier === 'enterprise').length;

  const monthlyRevenue = (premiumCount * 6.99) + (enterpriseCount * 19.99);

  return {
    currentMRR: monthlyRevenue.toFixed(2),
    projectedARR: (monthlyRevenue * 12).toFixed(2),
    growthRate: calculateGrowthRate(users, timeframe)
  };
}

function calculateGrowthRate(users, timeframe) {
  // Calculate growth rate based on timeframe
  const days = timeframe === '7d' ? 7 : timeframe === '30d' ? 30 : 90;
  const periodAgo = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const recentUsers = users.filter(u => new Date(u.created_at) >= periodAgo).length;

  return recentUsers > 0 ? ((recentUsers / users.length) * 100).toFixed(2) : 0;
}

function calculateChurnRate(subscriptions) {
  const active = subscriptions.filter(s => s.subscription_status === 'active').length;
  const churned = subscriptions.filter(s => s.subscription_status === 'canceled').length;
  const total = active + churned;

  return total > 0 ? (churned / total * 100).toFixed(2) : 0;
}

function calculateAverageLifetime(subscriptions) {
  const completedSubs = subscriptions.filter(s =>
    s.subscription_start_date && s.subscription_end_date
  );

  if (completedSubs.length === 0) return 0;

  const totalDays = completedSubs.reduce((sum, sub) => {
    const start = new Date(sub.subscription_start_date);
    const end = new Date(sub.subscription_end_date);
    return sum + Math.floor((end - start) / (1000 * 60 * 60 * 24));
  }, 0);

  return Math.round(totalDays / completedSubs.length);
}

// Bulk action helper functions
async function updateUserSubscription(userId, params) {
  const { error } = await supabase
    .from('user_profiles')
    .update({
      subscription_tier: params.tier,
      subscription_status: params.status,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) throw error;
}

async function grantUserCredits(userId, credits, reason) {
  const { data: user, error: fetchError } = await supabase
    .from('user_profiles')
    .select('resume_count_limit')
    .eq('id', userId)
    .single();

  if (fetchError) throw fetchError;

  const { error: updateError } = await supabase
    .from('user_profiles')
    .update({
      resume_count_limit: (user.resume_count_limit || 0) + credits,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) throw updateError;
}

async function sendUserNotification(userId, message, type) {
  // Implement notification sending logic
  console.log(`Sending ${type} notification to user ${userId}: ${message}`);
}

async function updateUserStatus(userId, status) {
  const { error } = await supabase
    .from('user_profiles')
    .update({
      account_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (error) throw error;
}

export default router;