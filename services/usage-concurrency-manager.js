/**
 * Usage Concurrency Manager
 * ==========================
 *
 * Handles concurrent resume generation requests to prevent race conditions
 * and ensure accurate usage tracking even under high load.
 */

import winston from 'winston';
import { supabase } from '../config/database.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'usage-concurrency' },
  transports: [
    new winston.transports.File({ filename: 'logs/usage-concurrency.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

export class UsageConcurrencyManager {
  constructor() {
    this.activeSessions = new Map(); // userId -> { requestId, startTime, timeout }
    this.requestQueue = new Map(); // userId -> [requests]
    this.maxConcurrentPerUser = 1;
    this.requestTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Acquire a session for resume generation
   * Returns a session token if successful, null if blocked
   */
  async acquireSession(userId, requestId = null) {
    const sessionId = requestId || this.generateRequestId();

    try {
      // Check if user already has an active session
      if (this.activeSessions.has(userId)) {
        const session = this.activeSessions.get(userId);

        // Check if session has timed out
        if (Date.now() - session.startTime > this.requestTimeout) {
          logger.warn('Session timed out, releasing', {
            userId,
            sessionId: session.requestId,
            duration: Date.now() - session.startTime
          });
          this.releaseSession(userId);
        } else {
          logger.warn('Concurrent request blocked', {
            userId,
            requestId: sessionId,
            activeSession: session.requestId
          });
          return null;
        }
      }

      // Create new session
      const session = {
        requestId: sessionId,
        startTime: Date.now(),
        timeout: setTimeout(() => {
          this.timeoutSession(userId, sessionId);
        }, this.requestTimeout)
      };

      this.activeSessions.set(userId, session);

      logger.info('Session acquired', {
        userId,
        sessionId,
        activeSessions: this.activeSessions.size
      });

      return sessionId;

    } catch (error) {
      logger.error('Failed to acquire session', {
        userId,
        requestId: sessionId,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Release a session after completion
   */
  releaseSession(userId, sessionId = null) {
    try {
      const session = this.activeSessions.get(userId);

      if (!session) {
        logger.debug('No active session to release', { userId, sessionId });
        return;
      }

      // Verify session ID if provided
      if (sessionId && session.requestId !== sessionId) {
        logger.warn('Session ID mismatch on release', {
          userId,
          provided: sessionId,
          active: session.requestId
        });
        return;
      }

      // Clear timeout
      if (session.timeout) {
        clearTimeout(session.timeout);
      }

      this.activeSessions.delete(userId);

      logger.info('Session released', {
        userId,
        sessionId: session.requestId,
        duration: Date.now() - session.startTime,
        activeSessions: this.activeSessions.size
      });

    } catch (error) {
      logger.error('Failed to release session', {
        userId,
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Handle session timeout
   */
  timeoutSession(userId, sessionId) {
    logger.warn('Session timed out', {
      userId,
      sessionId,
      timeout: this.requestTimeout
    });

    this.releaseSession(userId, sessionId);
  }

  /**
   * Check if user has an active session
   */
  hasActiveSession(userId) {
    return this.activeSessions.has(userId);
  }

  /**
   * Get active session info
   */
  getSessionInfo(userId) {
    const session = this.activeSessions.get(userId);
    if (!session) return null;

    return {
      requestId: session.requestId,
      startTime: session.startTime,
      duration: Date.now() - session.startTime,
      remainingTime: Math.max(0, this.requestTimeout - (Date.now() - session.startTime))
    };
  }

  /**
   * Atomic usage check and increment with session management
   */
  async checkAndIncrementUsageAtomic(userId, sessionId) {
    try {
      // Verify session is still active and valid
      const session = this.activeSessions.get(userId);
      if (!session || session.requestId !== sessionId) {
        throw new Error('Invalid or expired session');
      }

      // Use database function for atomic operation
      const { data, error } = await supabase
        .rpc('check_and_increment_resume_usage', { user_id: userId });

      if (error) {
        throw new Error(`Database operation failed: ${error.message}`);
      }

      if (!data) {
        logger.warn('Usage limit reached during atomic operation', {
          userId,
          sessionId
        });
        return false;
      }

      logger.info('Usage incremented atomically', {
        userId,
        sessionId
      });

      return true;

    } catch (error) {
      logger.error('Atomic usage increment failed', {
        userId,
        sessionId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get comprehensive usage status with concurrency info
   */
  async getUsageStatusWithConcurrency(userId) {
    try {
      // Get usage status from database
      const { data, error } = await supabase
        .rpc('get_user_usage_status', { user_id: userId });

      if (error) {
        throw new Error(`Failed to get usage status: ${error.message}`);
      }

      const usageStatus = JSON.parse(data);

      // Add concurrency information
      const sessionInfo = this.getSessionInfo(userId);

      return {
        ...usageStatus,
        concurrency: {
          hasActiveSession: this.hasActiveSession(userId),
          sessionInfo,
          canStartNewRequest: !this.hasActiveSession(userId) && usageStatus.usage.canGenerateResume
        }
      };

    } catch (error) {
      logger.error('Failed to get usage status with concurrency', {
        userId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate unique request ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Cleanup expired sessions (run periodically)
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [userId, session] of this.activeSessions.entries()) {
      if (now - session.startTime > this.requestTimeout) {
        expiredSessions.push(userId);
      }
    }

    for (const userId of expiredSessions) {
      this.releaseSession(userId);
    }

    if (expiredSessions.length > 0) {
      logger.info('Cleaned up expired sessions', {
        count: expiredSessions.length,
        remaining: this.activeSessions.size
      });
    }
  }

  /**
   * Get statistics about active sessions
   */
  getStatistics() {
    const now = Date.now();
    const sessions = Array.from(this.activeSessions.values());

    return {
      totalActiveSessions: sessions.length,
      averageSessionDuration: sessions.length > 0
        ? sessions.reduce((sum, s) => sum + (now - s.startTime), 0) / sessions.length
        : 0,
      oldestSessionAge: sessions.length > 0
        ? Math.max(...sessions.map(s => now - s.startTime))
        : 0,
      sessionsNearTimeout: sessions.filter(s =>
        (now - s.startTime) > (this.requestTimeout * 0.8)
      ).length
    };
  }

  /**
   * Force release all sessions (emergency cleanup)
   */
  forceReleaseAllSessions() {
    logger.warn('Force releasing all sessions', {
      count: this.activeSessions.size
    });

    for (const [userId, session] of this.activeSessions.entries()) {
      if (session.timeout) {
        clearTimeout(session.timeout);
      }
    }

    this.activeSessions.clear();
  }
}

// Create singleton instance
const usageConcurrencyManager = new UsageConcurrencyManager();

// Cleanup expired sessions every minute
setInterval(() => {
  usageConcurrencyManager.cleanupExpiredSessions();
}, 60 * 1000);

export default usageConcurrencyManager;