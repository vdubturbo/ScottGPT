// routes/admin.js
// Admin interface routes for ScottGPT SaaS platform

import express from 'express';
import AuthService from '../services/auth.js';
import { supabase } from '../config/database.js';
import {
  authenticateToken,
  requireAdmin,
  rateLimitPerUser,
  addUserContext
} from '../middleware/auth.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);
router.use(addUserContext);
router.use(rateLimitPerUser({ requests: 100, window: 15 })); // Higher limits for admins

// =========================================================================
// DASHBOARD AND ANALYTICS
// =========================================================================

/**
 * GET /api/admin/dashboard
 * Admin dashboard statistics
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get platform statistics
    const [userStats, contentStats, analyticsStats] = await Promise.all([
      // User statistics
      supabase
        .from('user_profiles')
        .select('role, subscription_tier, created_at')
        .then(({ data, error }) => {
          if (error) throw error;
          
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          
          return {
            total: data.length,
            byRole: data.reduce((acc, user) => {
              acc[user.role] = (acc[user.role] || 0) + 1;
              return acc;
            }, {}),
            byTier: data.reduce((acc, user) => {
              acc[user.subscription_tier] = (acc[user.subscription_tier] || 0) + 1;
              return acc;
            }, {}),
            newUsersLast30Days: data.filter(user => 
              new Date(user.created_at) > thirtyDaysAgo
            ).length
          };
        }),

      // Content statistics
      supabase
        .from('sources')
        .select('type, created_at, user_id')
        .then(({ data, error }) => {
          if (error) throw error;
          
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          
          return {
            totalContent: data.length,
            byType: data.reduce((acc, content) => {
              acc[content.type] = (acc[content.type] || 0) + 1;
              return acc;
            }, {}),
            newContentLast30Days: data.filter(content => 
              content.created_at && new Date(content.created_at) > thirtyDaysAgo
            ).length,
            uniqueContentCreators: new Set(data.map(c => c.user_id)).size
          };
        }),

      // Analytics statistics
      supabase
        .from('profile_views')
        .select('viewed_at, profile_id, viewer_id')
        .then(({ data, error }) => {
          if (error) throw error;
          
          const now = new Date();
          const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
          const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
          
          return {
            totalViews: data.length,
            viewsLast30Days: data.filter(view => 
              new Date(view.viewed_at) > thirtyDaysAgo
            ).length,
            viewsLast7Days: data.filter(view => 
              new Date(view.viewed_at) > sevenDaysAgo
            ).length,
            uniqueViewers: new Set(data.map(v => v.viewer_id).filter(Boolean)).size
          };
        })
    ]);

    res.json({
      success: true,
      dashboard: {
        users: userStats,
        content: contentStats,
        analytics: analyticsStats,
        generatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      error: 'Dashboard failed',
      message: 'Unable to generate dashboard statistics'
    });
  }
});

// =========================================================================
// USER MANAGEMENT
// =========================================================================

/**
 * GET /api/admin/users
 * List all users with advanced filtering and pagination
 */
router.get('/users', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      subscription_tier,
      search,
      sort_by = 'created_at',
      sort_order = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const maxLimit = Math.min(parseInt(limit), 100);

    // Build query
    let query = supabase
      .from('user_profiles')
      .select(`
        id, email, full_name, display_name, role, subscription_tier, 
        url_slug, visibility, created_at, last_active_at, 
        onboarding_completed, profile_views, bio, job_title,
        subscription_start_date, subscription_end_date
      `, { count: 'exact' });

    // Apply filters
    if (role) {
      query = query.eq('role', role);
    }
    if (subscription_tier) {
      query = query.eq('subscription_tier', subscription_tier);
    }
    if (search) {
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,display_name.ilike.%${search}%`);
    }

    // Apply sorting
    const validSortFields = ['created_at', 'last_active_at', 'email', 'full_name', 'profile_views'];
    const sortField = validSortFields.includes(sort_by) ? sort_by : 'created_at';
    const sortAscending = sort_order === 'asc';

    query = query
      .order(sortField, { ascending: sortAscending })
      .range(offset, offset + maxLimit - 1);

    const { data: users, error, count } = await query;

    if (error) throw error;

    res.json({
      success: true,
      users,
      pagination: {
        page: parseInt(page),
        limit: maxLimit,
        total: count,
        totalPages: Math.ceil(count / maxLimit)
      },
      filters: {
        role,
        subscription_tier,
        search,
        sort_by: sortField,
        sort_order
      }
    });

  } catch (error) {
    console.error('Admin users list error:', error);
    res.status(500).json({
      error: 'Users list failed',
      message: 'Unable to retrieve users list'
    });
  }
});

/**
 * GET /api/admin/users/:userId
 * Get detailed user information
 */
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Get user profile with content statistics
    const [profileResult, contentResult, viewsResult, contactsResult] = await Promise.all([
      // User profile
      supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single(),

      // Content statistics
      supabase
        .from('sources')
        .select('id, type, title, created_at')
        .eq('user_id', userId),

      // Profile views
      supabase
        .from('profile_views')
        .select('viewed_at, viewer_id')
        .eq('profile_id', userId)
        .order('viewed_at', { ascending: false })
        .limit(10),

      // Recruiter contacts (if job seeker)
      supabase
        .from('recruiter_contacts')
        .select('id, subject, status, created_at, recruiter_id')
        .eq('profile_id', userId)
        .order('created_at', { ascending: false })
        .limit(10)
    ]);

    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data) {
      return res.status(404).json({
        error: 'User not found',
        message: 'The requested user does not exist'
      });
    }

    const profile = profileResult.data;
    const content = contentResult.data || [];
    const recentViews = viewsResult.data || [];
    const recentContacts = contactsResult.data || [];

    res.json({
      success: true,
      user: {
        profile,
        statistics: {
          contentCount: content.length,
          contentByType: content.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1;
            return acc;
          }, {}),
          totalViews: profile.profile_views || 0,
          recentViews: recentViews.length,
          contactsReceived: recentContacts.length
        },
        recentActivity: {
          views: recentViews,
          contacts: recentContacts,
          content: content.slice(0, 5)
        }
      }
    });

  } catch (error) {
    console.error('Admin user detail error:', error);
    res.status(500).json({
      error: 'User detail failed',
      message: 'Unable to retrieve user details'
    });
  }
});

/**
 * PUT /api/admin/users/:userId/role
 * Update user role
 */
router.put('/users/:userId/role', async (req, res) => {
  try {
    const { userId } = req.params;
    const { role } = req.body;

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
        message: `User role updated to ${role}`,
        profile: result.profile
      });
    } else {
      res.status(400).json({
        error: 'Role update failed',
        message: result.error
      });
    }

  } catch (error) {
    console.error('Admin role update error:', error);
    res.status(500).json({
      error: 'Role update failed',
      message: 'Unable to update user role'
    });
  }
});

/**
 * PUT /api/admin/users/:userId/subscription
 * Update user subscription tier
 */
router.put('/users/:userId/subscription', async (req, res) => {
  try {
    const { userId } = req.params;
    const { subscription_tier, subscription_end_date } = req.body;

    const validTiers = ['free', 'premium', 'enterprise'];
    if (!validTiers.includes(subscription_tier)) {
      return res.status(400).json({
        error: 'Invalid subscription tier',
        message: `Tier must be one of: ${validTiers.join(', ')}`
      });
    }

    const updates = {
      subscription_tier,
      subscription_start_date: new Date().toISOString()
    };

    if (subscription_end_date) {
      updates.subscription_end_date = subscription_end_date;
    } else if (subscription_tier !== 'free') {
      // Set default 1-year subscription for paid tiers
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);
      updates.subscription_end_date = oneYearFromNow.toISOString();
    }

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;

    console.log(`✅ Admin ${req.user.id} updated subscription for user ${userId} to ${subscription_tier}`);

    res.json({
      success: true,
      message: `Subscription updated to ${subscription_tier}`,
      profile
    });

  } catch (error) {
    console.error('Admin subscription update error:', error);
    res.status(500).json({
      error: 'Subscription update failed',
      message: 'Unable to update user subscription'
    });
  }
});

// =========================================================================
// CONTENT MANAGEMENT
// =========================================================================

/**
 * GET /api/admin/content
 * List all content with filtering
 */
router.get('/content', async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      user_id,
      visibility,
      search
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const maxLimit = Math.min(parseInt(limit), 100);

    let query = supabase
      .from('sources')
      .select(`
        id, title, org, type, visibility, created_at, updated_at,
        user_id, date_start, date_end, skills,
        user_profiles!sources_user_id_fkey (
          full_name, email, url_slug
        )
      `, { count: 'exact' });

    // Apply filters
    if (type) query = query.eq('type', type);
    if (user_id) query = query.eq('user_id', user_id);
    if (visibility) query = query.eq('visibility', visibility);
    if (search) {
      query = query.or(`title.ilike.%${search}%,org.ilike.%${search}%`);
    }

    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + maxLimit - 1);

    const { data: content, error, count } = await query;
    if (error) throw error;

    res.json({
      success: true,
      content,
      pagination: {
        page: parseInt(page),
        limit: maxLimit,
        total: count,
        totalPages: Math.ceil(count / maxLimit)
      }
    });

  } catch (error) {
    console.error('Admin content list error:', error);
    res.status(500).json({
      error: 'Content list failed',
      message: 'Unable to retrieve content list'
    });
  }
});

// =========================================================================
// SYSTEM MANAGEMENT
// =========================================================================

/**
 * GET /api/admin/system/health
 * System health check
 */
router.get('/system/health', async (req, res) => {
  try {
    const healthChecks = await Promise.allSettled([
      // Database connectivity
      supabase.from('user_profiles').select('count', { count: 'exact', head: true }),
      
      // Auth service check
      AuthService.getCurrentSession(),
      
      // Check critical tables
      supabase.from('sources').select('count', { count: 'exact', head: true }),
      supabase.from('content_chunks').select('count', { count: 'exact', head: true }),
      supabase.from('skills').select('count', { count: 'exact', head: true })
    ]);

    const results = {
      database: healthChecks[0].status === 'fulfilled',
      auth: healthChecks[1].status === 'fulfilled',
      sources: healthChecks[2].status === 'fulfilled',
      content_chunks: healthChecks[3].status === 'fulfilled', 
      skills: healthChecks[4].status === 'fulfilled'
    };

    const isHealthy = Object.values(results).every(Boolean);

    res.status(isHealthy ? 200 : 503).json({
      success: isHealthy,
      healthy: isHealthy,
      checks: results,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('System health check error:', error);
    res.status(503).json({
      success: false,
      healthy: false,
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/admin/system/stats
 * Detailed system statistics
 */
router.get('/system/stats', async (req, res) => {
  try {
    const [
      userCount,
      contentCount,
      chunkCount,
      skillCount,
      viewCount,
      contactCount
    ] = await Promise.all([
      supabase.from('user_profiles').select('count', { count: 'exact', head: true }),
      supabase.from('sources').select('count', { count: 'exact', head: true }),
      supabase.from('content_chunks').select('count', { count: 'exact', head: true }),
      supabase.from('skills').select('count', { count: 'exact', head: true }),
      supabase.from('profile_views').select('count', { count: 'exact', head: true }),
      supabase.from('recruiter_contacts').select('count', { count: 'exact', head: true })
    ]);

    res.json({
      success: true,
      stats: {
        users: userCount.count || 0,
        content: contentCount.count || 0,
        chunks: chunkCount.count || 0,
        skills: skillCount.count || 0,
        views: viewCount.count || 0,
        contacts: contactCount.count || 0
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('System stats error:', error);
    res.status(500).json({
      error: 'Stats failed',
      message: 'Unable to generate system statistics'
    });
  }
});

// =========================================================================
// URL SLUG MANAGEMENT
// =========================================================================

/**
 * GET /api/admin/slugs/reserved
 * List reserved URL slugs
 */
router.get('/slugs/reserved', async (req, res) => {
  try {
    const { data: slugs, error } = await supabase
      .from('reserved_slugs')
      .select('*')
      .order('slug');

    if (error) throw error;

    res.json({
      success: true,
      reserved_slugs: slugs
    });

  } catch (error) {
    console.error('Reserved slugs error:', error);
    res.status(500).json({
      error: 'Reserved slugs failed',
      message: 'Unable to retrieve reserved slugs'
    });
  }
});

/**
 * POST /api/admin/slugs/reserved
 * Add reserved URL slug
 */
router.post('/slugs/reserved', async (req, res) => {
  try {
    const { slug, reason } = req.body;

    if (!slug || !reason) {
      return res.status(400).json({
        error: 'Missing fields',
        message: 'Both slug and reason are required'
      });
    }

    const { data: newSlug, error } = await supabase
      .from('reserved_slugs')
      .insert({ slug, reason })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        return res.status(400).json({
          error: 'Slug already reserved',
          message: 'This slug is already in the reserved list'
        });
      }
      throw error;
    }

    res.status(201).json({
      success: true,
      message: 'Slug reserved successfully',
      reserved_slug: newSlug
    });

  } catch (error) {
    console.error('Add reserved slug error:', error);
    res.status(500).json({
      error: 'Add reserved slug failed',
      message: 'Unable to add reserved slug'
    });
  }
});

// =========================================================================
// ERROR HANDLING
// =========================================================================

router.use((req, res) => {
  res.status(404).json({
    error: 'Admin route not found',
    message: 'The requested admin endpoint does not exist'
  });
});

export default router;