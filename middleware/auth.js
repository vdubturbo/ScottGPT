// middleware/auth.js
// Authentication and authorization middleware for ScottGPT SaaS platform

import AuthService from '../services/auth.js';
import { supabase } from '../config/database.js';

/**
 * Authentication Middleware
 * 
 * Provides various middleware functions for:
 * - Session verification
 * - Role-based access control
 * - Profile ownership verification
 * - Multi-tenant data isolation
 */

// =========================================================================
// AUTHENTICATION MIDDLEWARE
// =========================================================================

/**
 * Verify JWT token and extract user information
 * Sets req.user with user data if authenticated
 */
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      req.user = null;
      return next(); // Continue without user (for public endpoints)
    }

    // Verify token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      req.user = null;
      return next(); // Continue without user
    }

    // Get user profile
    const profile = await AuthService.getUserProfile(user.id);
    
    req.user = {
      ...user,
      profile
    };

    // Update last active timestamp (non-blocking)
    AuthService.updateLastActive(user.id).catch(err => 
      console.warn('Failed to update last active:', err)
    );

    next();

  } catch (error) {
    console.error('Authentication middleware error:', error);
    req.user = null;
    next();
  }
};

/**
 * Require authentication - block if not authenticated
 */
export const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ 
      error: 'Authentication required',
      message: 'Please log in to access this resource'
    });
  }
  
  next();
};

/**
 * Optional authentication - continue regardless of auth status
 * (authenticateToken should be used before this)
 */
export const optionalAuth = (req, res, next) => {
  // Just continue - req.user will be set by authenticateToken if logged in
  next();
};

// =========================================================================
// ROLE-BASED ACCESS CONTROL
// =========================================================================

/**
 * Require specific role
 * @param {string|string[]} roles - Required role(s)
 */
export const requireRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return (req, res, next) => {
    if (!req.user || !req.user.profile) {
      return res.status(401).json({ 
        error: 'Authentication required',
        message: 'Please log in to access this resource'
      });
    }

    if (!roleArray.includes(req.user.profile.role)) {
      return res.status(403).json({ 
        error: 'Insufficient privileges',
        message: `This resource requires one of the following roles: ${roleArray.join(', ')}`,
        userRole: req.user.profile.role
      });
    }

    next();
  };
};

/**
 * Require admin role
 */
export const requireAdmin = requireRole('admin');

/**
 * Require recruiter or admin role
 */
export const requireRecruiter = requireRole(['recruiter', 'admin']);

/**
 * Require job poster or admin role
 */
export const requireJobPoster = requireRole(['job_poster', 'admin']);

// =========================================================================
// OWNERSHIP AND ACCESS CONTROL
// =========================================================================

/**
 * Require ownership of resource or admin privileges
 * Checks if req.user.id matches req.params.userId or user is admin
 */
export const requireOwnership = (req, res, next) => {
  if (!req.user || !req.user.profile) {
    return res.status(401).json({ 
      error: 'Authentication required'
    });
  }

  const resourceUserId = req.params.userId || req.params.id;
  const isOwner = req.user.id === resourceUserId;
  const isAdmin = req.user.profile.role === 'admin';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'You can only access your own resources'
    });
  }

  next();
};

/**
 * Check profile visibility access
 * Verifies if current user can access target profile based on visibility settings
 */
export const checkProfileAccess = async (req, res, next) => {
  try {
    const targetSlug = req.params.slug || req.params.urlSlug;
    const targetUserId = req.params.userId;

    let profileUser;

    // Get target profile either by slug or userId
    if (targetSlug) {
      profileUser = await AuthService.getUserProfileBySlug(targetSlug);
    } else if (targetUserId) {
      profileUser = await AuthService.getUserProfile(targetUserId);
    } else {
      return res.status(400).json({ 
        error: 'Profile identifier required',
        message: 'Please provide either slug or userId parameter'
      });
    }

    if (!profileUser) {
      return res.status(404).json({ 
        error: 'Profile not found',
        message: 'The requested profile does not exist'
      });
    }

    // Check if current user can access this profile
    const canAccess = await AuthService.canAccessProfile(
      req.user?.id || null, 
      profileUser.id
    );

    if (!canAccess) {
      return res.status(403).json({ 
        error: 'Profile access denied',
        message: 'This profile is private or restricted'
      });
    }

    // Add profile to request for downstream handlers
    req.targetProfile = profileUser;
    next();

  } catch (error) {
    console.error('Profile access check error:', error);
    res.status(500).json({ 
      error: 'Access check failed',
      message: 'Unable to verify profile access'
    });
  }
};

// =========================================================================
// SUBSCRIPTION AND LIMITS MIDDLEWARE
// =========================================================================

/**
 * Check subscription tier and enforce limits
 * @param {string} requiredTier - Minimum required subscription tier
 */
export const requireSubscription = (requiredTier = 'free') => {
  const tierHierarchy = { free: 0, premium: 1, enterprise: 2 };

  return (req, res, next) => {
    if (!req.user || !req.user.profile) {
      return res.status(401).json({ 
        error: 'Authentication required'
      });
    }

    const userTier = req.user.profile.subscription_tier;
    const userTierLevel = tierHierarchy[userTier] || 0;
    const requiredTierLevel = tierHierarchy[requiredTier] || 0;

    if (userTierLevel < requiredTierLevel) {
      return res.status(402).json({ 
        error: 'Subscription upgrade required',
        message: `This feature requires ${requiredTier} subscription or higher`,
        currentTier: userTier,
        requiredTier: requiredTier
      });
    }

    next();
  };
};

/**
 * Check if subscription is active (not expired)
 */
export const requireActiveSubscription = (req, res, next) => {
  if (!req.user || !req.user.profile) {
    return res.status(401).json({ 
      error: 'Authentication required'
    });
  }

  const profile = req.user.profile;
  
  // Free tier is always active
  if (profile.subscription_tier === 'free') {
    return next();
  }

  // Check if subscription is expired
  if (profile.subscription_end_date) {
    const endDate = new Date(profile.subscription_end_date);
    const now = new Date();
    
    if (endDate < now) {
      return res.status(402).json({ 
        error: 'Subscription expired',
        message: 'Your subscription has expired. Please renew to continue using premium features.',
        expiredDate: profile.subscription_end_date
      });
    }
  }

  next();
};

// =========================================================================
// RATE LIMITING AND SECURITY
// =========================================================================

/**
 * Rate limiting per user (not per IP)
 * @param {Object} options - Rate limit options
 * @param {number} options.requests - Number of requests allowed
 * @param {number} options.window - Time window in minutes
 */
export const rateLimitPerUser = (options = { requests: 100, window: 15 }) => {
  const userRequests = new Map();
  const windowMs = options.window * 60 * 1000;

  return (req, res, next) => {
    if (!req.user) {
      // Apply IP-based rate limiting for non-authenticated users
      return next();
    }

    const userId = req.user.id;
    const now = Date.now();
    
    if (!userRequests.has(userId)) {
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    const userLimit = userRequests.get(userId);
    
    if (now > userLimit.resetTime) {
      // Reset window
      userRequests.set(userId, { count: 1, resetTime: now + windowMs });
      return next();
    }

    if (userLimit.count >= options.requests) {
      return res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Too many requests. Limit: ${options.requests} requests per ${options.window} minutes`,
        retryAfter: Math.ceil((userLimit.resetTime - now) / 1000)
      });
    }

    userLimit.count++;
    next();
  };
};

// =========================================================================
// ANALYTICS AND TRACKING MIDDLEWARE
// =========================================================================

/**
 * Track profile views for analytics
 */
export const trackProfileView = async (req, res, next) => {
  try {
    if (req.targetProfile) {
      // Record the profile view (non-blocking)
      const metadata = {
        userAgent: req.headers['user-agent'],
        referrer: req.headers.referer
      };

      AuthService.recordProfileView(
        req.targetProfile.id,
        req.user?.id || null,
        req.ip,
        metadata
      ).catch(err => 
        console.warn('Failed to record profile view:', err)
      );
    }

    next();

  } catch (error) {
    console.warn('Profile view tracking error:', error);
    next(); // Continue regardless of tracking failure
  }
};

// =========================================================================
// ERROR HANDLING MIDDLEWARE
// =========================================================================

/**
 * Handle authentication-related errors
 */
export const handleAuthError = (error, req, res, next) => {
  console.error('Authentication error:', error);

  // Token expired
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'Token expired',
      message: 'Your session has expired. Please log in again.'
    });
  }

  // Invalid token
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Invalid token',
      message: 'Authentication token is invalid.'
    });
  }

  // Supabase auth errors
  if (error.message && error.message.includes('JWT')) {
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired authentication token.'
    });
  }

  // Generic auth error
  if (error.status >= 400 && error.status < 500) {
    return res.status(error.status).json({
      error: 'Authentication error',
      message: error.message || 'Authentication failed'
    });
  }

  // Pass non-auth errors to general error handler
  next(error);
};

// =========================================================================
// UTILITY FUNCTIONS
// =========================================================================

/**
 * Extract user context for multi-tenant operations
 * Adds req.userContext with user info for database queries
 */
export const addUserContext = (req, res, next) => {
  req.userContext = {
    userId: req.user?.id || null,
    role: req.user?.profile?.role || 'anonymous',
    subscriptionTier: req.user?.profile?.subscription_tier || 'free',
    isAuthenticated: !!req.user,
    isAdmin: req.user?.profile?.role === 'admin',
    isRecruiter: req.user?.profile?.role === 'recruiter',
    isJobPoster: req.user?.profile?.role === 'job_poster'
  };
  
  next();
};

/**
 * CORS middleware with authentication awareness
 */
export const corsWithAuth = (req, res, next) => {
  const origin = req.headers.origin;
  
  // Allow all origins for public profiles
  // Restrict origins for authenticated operations
  if (req.user && origin) {
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3005', 
      process.env.FRONTEND_URL
    ].filter(Boolean);

    if (allowedOrigins.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }

  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
};

export default {
  authenticateToken,
  requireAuth,
  optionalAuth,
  requireRole,
  requireAdmin,
  requireRecruiter,
  requireJobPoster,
  requireOwnership,
  checkProfileAccess,
  requireSubscription,
  requireActiveSubscription,
  rateLimitPerUser,
  trackProfileView,
  handleAuthError,
  addUserContext,
  corsWithAuth
};