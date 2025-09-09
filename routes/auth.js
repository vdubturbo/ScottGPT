// routes/auth.js
// Authentication routes for ScottGPT SaaS platform

import express from 'express';
import AuthService from '../services/auth.js';
import { 
  authenticateToken, 
  requireAuth, 
  requireAdmin,
  requireOwnership,
  checkProfileAccess,
  trackProfileView,
  rateLimitPerUser,
  addUserContext
} from '../middleware/auth.js';

const router = express.Router();

// Apply middleware to all auth routes
router.use(addUserContext);

// =========================================================================
// USER REGISTRATION AND LOGIN
// =========================================================================

/**
 * POST /api/auth/register
 * Register new user account
 */
router.post('/register', rateLimitPerUser({ requests: 5, window: 15 }), async (req, res) => {
  try {
    const { email, password, fullName, displayName, role, urlSlug } = req.body;

    // Validate required fields
    if (!email || !password || !fullName) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'Email, password, and full name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        error: 'Invalid email format',
        message: 'Please provide a valid email address'
      });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({
        error: 'Weak password',
        message: 'Password must be at least 8 characters long'
      });
    }

    // Validate role
    const validRoles = ['job_seeker', 'recruiter', 'job_poster'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: `Role must be one of: ${validRoles.join(', ')}`
      });
    }

    // Check if URL slug is available (if provided)
    if (urlSlug) {
      const isAvailable = await AuthService.isSlugAvailable(urlSlug);
      if (!isAvailable) {
        return res.status(400).json({
          error: 'URL slug not available',
          message: 'The requested URL slug is already taken or reserved'
        });
      }
    }

    // Register user
    const result = await AuthService.registerUser({
      email,
      password,
      fullName,
      displayName,
      role: role || 'job_seeker',
      urlSlug
    });

    if (result.success) {
      res.status(201).json({
        success: true,
        message: result.message,
        user: {
          id: result.user.id,
          email: result.user.email
        },
        profile: {
          url_slug: result.profile.url_slug,
          role: result.profile.role,
          subscription_tier: result.profile.subscription_tier
        }
      });
    } else {
      res.status(400).json({
        error: 'Registration failed',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Registration route error:', error);
    res.status(500).json({
      error: 'Registration failed',
      message: 'An unexpected error occurred during registration'
    });
  }
});

/**
 * POST /api/auth/login
 * User login
 */
router.post('/login', rateLimitPerUser({ requests: 10, window: 15 }), async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Missing credentials',
        message: 'Email and password are required'
      });
    }

    const result = await AuthService.loginUser(email, password);

    console.log('🔍 Auth Route Debug: Service returned result:', { 
      success: result.success, 
      hasUser: !!result.user,
      hasProfile: !!result.profile,
      error: result.error
    });

    if (result.success) {
      const responseData = {
        success: true,
        user: {
          id: result.user.id,
          email: result.user.email
        },
        profile: {
          url_slug: result.profile.url_slug,
          role: result.profile.role,
          subscription_tier: result.profile.subscription_tier,
          display_name: result.profile.display_name
        },
        session: {
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
          expires_at: result.session.expires_at
        }
      };

      console.log('🔍 Auth Route Debug: Sending response:', { 
        success: responseData.success,
        userId: responseData.user?.id,
        profileSlug: responseData.profile?.url_slug
      });

      res.json(responseData);
    } else {
      res.status(401).json({
        error: 'Login failed',
        message: result.error
      });
    }

  } catch (error) {
    console.error('🔍 Auth Route Debug: Login route error:', error.message);
    console.error('🔍 Auth Route Debug: Full error:', error);
    
    // Handle auth-specific errors differently
    if (error.message.includes('Invalid login credentials') || error.message.includes('Login failed')) {
      res.status(401).json({
        error: 'Authentication failed',
        message: error.message
      });
    } else {
      res.status(500).json({
        error: 'Login failed',
        message: 'An unexpected error occurred during login'
      });
    }
  }
});

/**
 * POST /api/auth/logout
 * User logout
 */
router.post('/logout', authenticateToken, async (req, res) => {
  try {
    const result = await AuthService.logoutUser();

    if (result.success) {
      res.json({
        success: true,
        message: result.message
      });
    } else {
      res.status(400).json({
        error: 'Logout failed',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Logout route error:', error);
    res.status(500).json({
      error: 'Logout failed',
      message: 'An unexpected error occurred during logout'
    });
  }
});

// =========================================================================
// SESSION AND USER MANAGEMENT
// =========================================================================

/**
 * GET /api/auth/me
 * Get current user profile (optional authentication)
 */
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // If no user is authenticated, return success with null user
    if (!req.user) {
      return res.json({
        success: true,
        authenticated: false,
        user: null
      });
    }

    // User is authenticated, return user profile
    res.json({
      success: true,
      authenticated: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        profile: req.user.profile
      }
    });

  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({
      error: 'Failed to get user profile',
      message: 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/auth/session
 * Get current session information
 */
router.get('/session', authenticateToken, async (req, res) => {
  try {
    const session = await AuthService.getCurrentSession();

    if (session) {
      res.json({
        success: true,
        authenticated: true,
        session: {
          expires_at: session.expires_at,
          user: {
            id: session.user.id,
            email: session.user.email
          }
        }
      });
    } else {
      res.json({
        success: true,
        authenticated: false,
        session: null
      });
    }

  } catch (error) {
    console.error('Session route error:', error);
    res.status(500).json({
      error: 'Session check failed',
      message: 'Unable to verify session status'
    });
  }
});

// =========================================================================
// PROFILE MANAGEMENT
// =========================================================================

/**
 * GET /api/auth/profile/:userId
 * Get user profile by ID (admin only)
 */
router.get('/profile/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const profile = await AuthService.getUserProfile(userId);

    if (!profile) {
      return res.status(404).json({
        error: 'Profile not found',
        message: 'User profile not found'
      });
    }

    res.json({
      success: true,
      profile
    });

  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An unexpected error occurred'
    });
  }
});

/**
 * PUT /api/auth/profile/:userId
 * Update user profile
 */
router.put('/profile/:userId', authenticateToken, requireOwnership, async (req, res) => {
  try {
    const { userId } = req.params;
    const updates = req.body;

    // Validate URL slug if being updated
    if (updates.url_slug) {
      const isAvailable = await AuthService.isSlugAvailable(updates.url_slug, userId);
      if (!isAvailable) {
        return res.status(400).json({
          error: 'URL slug not available',
          message: 'The requested URL slug is already taken or reserved'
        });
      }
    }

    const updatedProfile = await AuthService.updateUserProfile(userId, updates);

    res.json({
      success: true,
      profile: updatedProfile
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      error: 'Failed to update profile',
      message: error.message || 'An unexpected error occurred'
    });
  }
});

// =========================================================================
// PUBLIC PROFILE ACCESS
// =========================================================================

/**
 * GET /api/auth/public/:slug
 * Get public profile by URL slug
 */
router.get('/public/:slug', authenticateToken, checkProfileAccess, trackProfileView, async (req, res) => {
  try {
    // Profile is available in req.targetProfile from checkProfileAccess middleware
    const profile = req.targetProfile;

    // Remove sensitive information for public access
    const publicProfile = {
      id: profile.id,
      display_name: profile.display_name,
      full_name: profile.full_name,
      url_slug: profile.url_slug,
      bio: profile.bio,
      location: profile.location,
      website_url: profile.website_url,
      linkedin_url: profile.linkedin_url,
      github_url: profile.github_url,
      portfolio_url: profile.portfolio_url,
      job_title: profile.job_title,
      industry: profile.industry,
      experience_level: profile.experience_level,
      availability_status: profile.availability_status,
      created_at: profile.created_at,
      profile_views: profile.profile_views
    };

    res.json({
      success: true,
      profile: publicProfile
    });

  } catch (error) {
    console.error('Public profile route error:', error);
    res.status(500).json({
      error: 'Failed to get profile',
      message: 'An unexpected error occurred'
    });
  }
});

// =========================================================================
// URL SLUG MANAGEMENT
// =========================================================================

/**
 * GET /api/auth/check-slug/:slug
 * Check if URL slug is available
 */
router.get('/check-slug/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    
    // Basic slug format validation
    const slugPattern = /^[a-z0-9-]+$/;
    if (!slugPattern.test(slug) || slug.length < 3 || slug.length > 50) {
      return res.status(400).json({
        error: 'Invalid slug format',
        message: 'Slug must be 3-50 characters, lowercase letters, numbers, and hyphens only'
      });
    }

    const isAvailable = await AuthService.isSlugAvailable(slug);

    res.json({
      success: true,
      slug,
      available: isAvailable
    });

  } catch (error) {
    console.error('Slug check error:', error);
    res.status(500).json({
      error: 'Slug check failed',
      message: 'Unable to check slug availability'
    });
  }
});

// =========================================================================
// ADMIN ROUTES
// =========================================================================

/**
 * PUT /api/auth/admin/role/:userId
 * Update user role (admin only)
 */
router.put('/admin/role/:userId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        error: 'Missing role',
        message: 'New role is required'
      });
    }

    const validRoles = ['job_seeker', 'recruiter', 'job_poster', 'admin'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
        message: `Role must be one of: ${validRoles.join(', ')}`
      });
    }

    const result = await AuthService.updateUserRole(req.user.id, userId, role);

    if (result.success) {
      res.json({
        success: true,
        profile: result.profile
      });
    } else {
      res.status(400).json({
        error: 'Role update failed',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({
      error: 'Role update failed',
      message: 'An unexpected error occurred'
    });
  }
});

/**
 * GET /api/auth/admin/users
 * List all users (admin only, with pagination)
 */
router.get('/admin/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100 per page
    const offset = (page - 1) * limit;

    const { data: users, error, count } = await AuthService.supabase
      .from('user_profiles')
      .select('id, email, full_name, display_name, role, subscription_tier, url_slug, created_at, last_active_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      users,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (error) {
    console.error('List users error:', error);
    res.status(500).json({
      error: 'Failed to list users',
      message: 'An unexpected error occurred'
    });
  }
});

// =========================================================================
// ERROR HANDLING
// =========================================================================

// Handle 404 for auth routes
router.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested authentication endpoint does not exist'
  });
});

export default router;