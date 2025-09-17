// middleware/admin-security.js
// Enhanced security middleware specifically for admin operations

import crypto from 'crypto';
import CONFIG from '../config/app-config.js';

// Admin session tracking
const adminSessions = new Map();
const adminActionLog = new Map();

// Security constants
const ADMIN_SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes
const ADMIN_RATE_LIMIT = { requests: 50, window: 15 }; // 50 requests per 15 minutes
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

// =========================================================================
// ADMIN SESSION MANAGEMENT
// =========================================================================

/**
 * Enhanced admin authentication with session tracking
 */
export const requireSuperAdmin = (req, res, next) => {
  try {
    // Check basic authentication first
    if (!req.user || !req.user.profile) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Admin access requires authentication'
      });
    }

    // Verify admin role
    if (req.user.profile.role !== 'admin') {
      // Log unauthorized access attempt
      logAdminAction(req, 'UNAUTHORIZED_ACCESS_ATTEMPT', {
        userId: req.user.id,
        email: req.user.email,
        attemptedRole: req.user.profile.role,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return res.status(403).json({
        error: 'Access denied',
        message: 'Super admin privileges required for this operation'
      });
    }

    // Check for account lockout
    const lockoutKey = `lockout_${req.user.id}`;
    const lockoutData = adminSessions.get(lockoutKey);
    if (lockoutData && Date.now() < lockoutData.unlockTime) {
      return res.status(423).json({
        error: 'Account temporarily locked',
        message: 'Too many failed admin operations. Try again later.',
        unlockTime: lockoutData.unlockTime
      });
    }

    // Create or update admin session
    const sessionKey = `admin_${req.user.id}`;
    const sessionData = adminSessions.get(sessionKey);
    const now = Date.now();

    if (!sessionData || now - sessionData.lastActivity > ADMIN_SESSION_TIMEOUT) {
      // Create new session
      const sessionId = crypto.randomUUID();
      adminSessions.set(sessionKey, {
        sessionId,
        userId: req.user.id,
        email: req.user.email,
        startTime: now,
        lastActivity: now,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent']
      });

      // Log session start
      logAdminAction(req, 'ADMIN_SESSION_START', {
        sessionId,
        userId: req.user.id,
        email: req.user.email,
        ip: req.ip
      });
    } else {
      // Update existing session
      sessionData.lastActivity = now;
      sessionData.ipAddress = req.ip; // Track IP changes
    }

    // Add session info to request
    req.adminSession = adminSessions.get(sessionKey);

    // Clean up expired sessions periodically
    if (Math.random() < 0.1) { // 10% chance
      cleanupExpiredSessions();
    }

    next();

  } catch (error) {
    console.error('Admin authentication error:', error);
    res.status(500).json({
      error: 'Authentication error',
      message: 'Failed to verify admin privileges'
    });
  }
};

/**
 * Admin rate limiting with enhanced tracking
 */
export const adminRateLimit = (req, res, next) => {
  const userId = req.user?.id;
  if (!userId) {
    return next();
  }

  const rateLimitKey = `rate_${userId}`;
  const now = Date.now();
  const windowMs = ADMIN_RATE_LIMIT.window * 60 * 1000;

  let userData = adminActionLog.get(rateLimitKey);

  if (!userData) {
    userData = {
      count: 1,
      resetTime: now + windowMs,
      actions: [{ time: now, action: req.path }]
    };
    adminActionLog.set(rateLimitKey, userData);
    return next();
  }

  // Reset window if expired
  if (now > userData.resetTime) {
    userData.count = 1;
    userData.resetTime = now + windowMs;
    userData.actions = [{ time: now, action: req.path }];
    return next();
  }

  // Check rate limit
  if (userData.count >= ADMIN_RATE_LIMIT.requests) {
    // Log rate limit violation
    logAdminAction(req, 'RATE_LIMIT_EXCEEDED', {
      userId,
      requestCount: userData.count,
      timeWindow: ADMIN_RATE_LIMIT.window,
      recentActions: userData.actions.slice(-10)
    });

    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: `Admin operations limited to ${ADMIN_RATE_LIMIT.requests} requests per ${ADMIN_RATE_LIMIT.window} minutes`,
      retryAfter: Math.ceil((userData.resetTime - now) / 1000),
      requestCount: userData.count
    });
  }

  // Increment and track
  userData.count++;
  userData.actions.push({ time: now, action: req.path });

  // Keep only recent actions (last 50)
  if (userData.actions.length > 50) {
    userData.actions = userData.actions.slice(-50);
  }

  next();
};

/**
 * Validate admin action with confirmation for destructive operations
 */
export const requireAdminConfirmation = (destructiveActions = []) => {
  return (req, res, next) => {
    const action = req.path.toLowerCase();
    const method = req.method.toLowerCase();
    const isDestructive = destructiveActions.some(pattern =>
      action.includes(pattern.toLowerCase()) ||
      (pattern.includes(method) && action.includes(pattern.split('_')[1]?.toLowerCase()))
    );

    if (isDestructive) {
      const confirmation = req.headers['x-admin-confirm'];
      const expectedConfirm = `CONFIRM_${req.user.id}_${Date.now().toString().slice(-6)}`;

      if (!confirmation || !confirmation.startsWith('CONFIRM_')) {
        return res.status(400).json({
          error: 'Confirmation required',
          message: 'This destructive operation requires explicit confirmation',
          confirmationFormat: 'X-Admin-Confirm: CONFIRM_{userId}_{timestamp}',
          action: action,
          destructive: true
        });
      }

      // Log destructive action attempt
      logAdminAction(req, 'DESTRUCTIVE_ACTION_ATTEMPT', {
        action: action,
        method: method,
        confirmation: confirmation,
        userId: req.user.id
      });
    }

    next();
  };
};

// =========================================================================
// AUDIT LOGGING SYSTEM
// =========================================================================

/**
 * Log admin actions for audit trail
 */
export const logAdminAction = (req, action, details = {}) => {
  const logEntry = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: action,
    userId: req.user?.id || 'anonymous',
    email: req.user?.email || 'unknown',
    ipAddress: req.ip || 'unknown',
    userAgent: req.headers['user-agent'] || 'unknown',
    sessionId: req.adminSession?.sessionId || 'no-session',
    path: req.path,
    method: req.method,
    details: details,
    success: true // Will be updated if action fails
  };

  // Store in memory (in production, use database)
  const auditKey = `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  adminActionLog.set(auditKey, logEntry);

  // Emit for real-time monitoring
  process.emit('adminAction', logEntry);

  // Clean up old logs periodically
  if (Math.random() < 0.05) { // 5% chance
    cleanupOldLogs();
  }

  return logEntry.id;
};

/**
 * Middleware to automatically log admin actions
 */
export const auditAdminAction = (req, res, next) => {
  const originalSend = res.send;
  const startTime = Date.now();

  // Log the start of the action
  const logId = logAdminAction(req, 'ADMIN_ACTION_START', {
    body: req.method !== 'GET' ? req.body : undefined,
    query: req.query,
    params: req.params
  });

  // Override response to capture success/failure
  res.send = function(data) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const success = res.statusCode < 400;

    // Update the log entry
    const auditEntry = Array.from(adminActionLog.values())
      .find(entry => entry.id === logId);

    if (auditEntry) {
      auditEntry.success = success;
      auditEntry.statusCode = res.statusCode;
      auditEntry.duration = duration;
      auditEntry.responseSize = data ? JSON.stringify(data).length : 0;

      if (!success) {
        auditEntry.errorDetails = {
          statusCode: res.statusCode,
          response: typeof data === 'string' ? data : JSON.stringify(data)
        };
      }
    }

    // Log completion
    logAdminAction(req, success ? 'ADMIN_ACTION_SUCCESS' : 'ADMIN_ACTION_FAILURE', {
      originalLogId: logId,
      statusCode: res.statusCode,
      duration: duration,
      success: success
    });

    originalSend.call(this, data);
  };

  next();
};

// =========================================================================
// SESSION MANAGEMENT
// =========================================================================

/**
 * Get active admin sessions
 */
export const getActiveSessions = () => {
  const now = Date.now();
  const activeSessions = [];

  for (const [key, session] of adminSessions.entries()) {
    if (key.startsWith('admin_') && now - session.lastActivity < ADMIN_SESSION_TIMEOUT) {
      activeSessions.push({
        sessionId: session.sessionId,
        userId: session.userId,
        email: session.email,
        startTime: session.startTime,
        lastActivity: session.lastActivity,
        duration: now - session.startTime,
        ipAddress: session.ipAddress
      });
    }
  }

  return activeSessions;
};

/**
 * Invalidate admin session
 */
export const invalidateAdminSession = (userId) => {
  const sessionKey = `admin_${userId}`;
  const session = adminSessions.get(sessionKey);

  if (session) {
    logAdminAction({ user: { id: userId }, ip: 'system' }, 'ADMIN_SESSION_INVALIDATED', {
      sessionId: session.sessionId,
      reason: 'manual_invalidation'
    });

    adminSessions.delete(sessionKey);
    return true;
  }

  return false;
};

/**
 * Get audit logs with filtering
 */
export const getAuditLogs = (filters = {}) => {
  const logs = Array.from(adminActionLog.values())
    .filter(entry => entry.id && entry.timestamp) // Valid audit entries
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Apply filters
  let filteredLogs = logs;

  if (filters.userId) {
    filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
  }

  if (filters.action) {
    filteredLogs = filteredLogs.filter(log =>
      log.action.toLowerCase().includes(filters.action.toLowerCase())
    );
  }

  if (filters.startDate) {
    const startDate = new Date(filters.startDate);
    filteredLogs = filteredLogs.filter(log =>
      new Date(log.timestamp) >= startDate
    );
  }

  if (filters.endDate) {
    const endDate = new Date(filters.endDate);
    filteredLogs = filteredLogs.filter(log =>
      new Date(log.timestamp) <= endDate
    );
  }

  if (filters.success !== undefined) {
    filteredLogs = filteredLogs.filter(log => log.success === filters.success);
  }

  return {
    logs: filteredLogs.slice(0, filters.limit || 100),
    total: filteredLogs.length,
    filtered: logs.length
  };
};

// =========================================================================
// CLEANUP FUNCTIONS
// =========================================================================

/**
 * Clean up expired sessions
 */
const cleanupExpiredSessions = () => {
  const now = Date.now();
  let cleanedCount = 0;

  for (const [key, session] of adminSessions.entries()) {
    if (key.startsWith('admin_') && now - session.lastActivity > ADMIN_SESSION_TIMEOUT) {
      adminSessions.delete(key);
      cleanedCount++;
    }

    // Also cleanup lockouts
    if (key.startsWith('lockout_') && now > session.unlockTime) {
      adminSessions.delete(key);
      cleanedCount++;
    }
  }

  if (cleanedCount > 0) {
    console.log(`Cleaned up ${cleanedCount} expired admin sessions`);
  }
};

/**
 * Clean up old audit logs (keep last 10,000)
 */
const cleanupOldLogs = () => {
  const auditEntries = Array.from(adminActionLog.entries())
    .filter(([key, entry]) => entry.id && entry.timestamp)
    .sort(([, a], [, b]) => new Date(b.timestamp) - new Date(a.timestamp));

  if (auditEntries.length > 10000) {
    const toDelete = auditEntries.slice(10000);
    toDelete.forEach(([key]) => adminActionLog.delete(key));
    console.log(`Cleaned up ${toDelete.length} old audit log entries`);
  }
};

/**
 * Security health check
 */
export const getSecurityStatus = () => {
  const now = Date.now();
  const activeSessions = getActiveSessions();
  const recentLogs = getAuditLogs({
    startDate: new Date(now - 24 * 60 * 60 * 1000) // Last 24 hours
  });

  return {
    activeSessions: activeSessions.length,
    sessionDetails: activeSessions,
    auditLogsCount: recentLogs.total,
    failedActions: recentLogs.logs.filter(log => !log.success).length,
    unauthorizedAttempts: recentLogs.logs.filter(log =>
      log.action === 'UNAUTHORIZED_ACCESS_ATTEMPT'
    ).length,
    rateLimitViolations: recentLogs.logs.filter(log =>
      log.action === 'RATE_LIMIT_EXCEEDED'
    ).length,
    systemHealth: {
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      lastCleanup: now
    }
  };
};

// Initialize cleanup interval
setInterval(cleanupExpiredSessions, 5 * 60 * 1000); // Every 5 minutes
setInterval(cleanupOldLogs, 60 * 60 * 1000); // Every hour

export default {
  requireSuperAdmin,
  adminRateLimit,
  requireAdminConfirmation,
  logAdminAction,
  auditAdminAction,
  getActiveSessions,
  invalidateAdminSession,
  getAuditLogs,
  getSecurityStatus
};