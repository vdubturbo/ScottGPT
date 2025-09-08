// services/auth.js
// Supabase Auth integration for multi-tenant SaaS platform

import { supabase } from '../config/database.js';

/**
 * Authentication Service for ScottGPT SaaS Platform
 * 
 * Handles user registration, login, profile management, and role-based access control
 * Integrates with Supabase Auth and custom user_profiles table
 */
export class AuthService {
  constructor() {
    this.supabase = supabase;
  }

  // =========================================================================
  // USER REGISTRATION AND LOGIN
  // =========================================================================

  /**
   * Register new user with email and password
   * @param {Object} userData - User registration data
   * @param {string} userData.email - User email
   * @param {string} userData.password - User password
   * @param {string} userData.fullName - User full name
   * @param {string} userData.displayName - Display name
   * @param {string} userData.role - User role (job_seeker, recruiter, job_poster)
   * @param {string} userData.urlSlug - Desired URL slug (optional)
   * @returns {Object} - Registration result with user data and profile
   */
  async registerUser(userData) {
    try {
      const { email, password, fullName, displayName, role = 'job_seeker', urlSlug } = userData;

      // Validate input
      if (!email || !password || !fullName) {
        throw new Error('Email, password, and full name are required');
      }

      if (!['job_seeker', 'recruiter', 'job_poster'].includes(role)) {
        throw new Error('Invalid role specified');
      }

      // Register with Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            display_name: displayName || fullName,
            role: role
          }
        }
      });

      if (authError) {
        throw new Error(`Registration failed: ${authError.message}`);
      }

      // Create user profile (this will be handled by trigger after auth confirms)
      if (authData.user) {
        const profileData = await this.createUserProfile({
          id: authData.user.id,
          email,
          fullName,
          displayName: displayName || fullName,
          role,
          urlSlug
        });

        return {
          success: true,
          user: authData.user,
          profile: profileData,
          message: 'Registration successful. Please check your email to verify your account.'
        };
      }

      throw new Error('User registration succeeded but user object is missing');

    } catch (error) {
      console.error('Registration error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Login user with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Object} - Login result with user data and profile
   */
  async loginUser(email, password) {
    try {
      // Sign in with Supabase Auth
      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        throw new Error(`Login failed: ${authError.message}`);
      }

      // Get user profile
      const profile = await this.getUserProfile(authData.user.id);

      // Update last active timestamp
      await this.updateLastActive(authData.user.id);

      return {
        success: true,
        user: authData.user,
        profile: profile,
        session: authData.session
      };

    } catch (error) {
      console.error('Login error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Logout current user
   * @returns {Object} - Logout result
   */
  async logoutUser() {
    try {
      const { error } = await this.supabase.auth.signOut();
      
      if (error) {
        throw new Error(`Logout failed: ${error.message}`);
      }

      return {
        success: true,
        message: 'Logged out successfully'
      };

    } catch (error) {
      console.error('Logout error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // =========================================================================
  // PROFILE MANAGEMENT
  // =========================================================================

  /**
   * Create user profile after successful registration
   * @param {Object} profileData - Profile data
   * @returns {Object} - Created profile
   */
  async createUserProfile(profileData) {
    try {
      const { id, email, fullName, displayName, role, urlSlug } = profileData;

      // Generate URL slug if not provided
      let finalSlug = urlSlug;
      if (!finalSlug) {
        // Call the database function to generate unique slug
        const { data: slugData, error: slugError } = await this.supabase
          .rpc('generate_url_slug', { base_name: displayName || fullName });
        
        if (slugError) {
          console.warn('Failed to generate URL slug, using fallback');
          finalSlug = this.generateFallbackSlug(displayName || fullName);
        } else {
          finalSlug = slugData;
        }
      }

      // Create user profile
      const { data: profile, error: profileError } = await this.supabase
        .from('user_profiles')
        .insert({
          id,
          email,
          full_name: fullName,
          display_name: displayName,
          role,
          url_slug: finalSlug,
          subscription_tier: role === 'job_seeker' ? 'free' : 'premium',
          visibility: 'public',
          allow_recruiter_contact: true,
          allow_public_indexing: true
        })
        .select()
        .single();

      if (profileError) {
        throw new Error(`Failed to create profile: ${profileError.message}`);
      }

      console.log(`✅ Created user profile for ${email} with role ${role} and slug ${finalSlug}`);
      return profile;

    } catch (error) {
      console.error('Profile creation error:', error);
      throw error;
    }
  }

  /**
   * Get user profile by ID
   * @param {string} userId - User ID
   * @returns {Object} - User profile
   */
  async getUserProfile(userId) {
    try {
      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        throw new Error(`Failed to get profile: ${error.message}`);
      }

      return profile;

    } catch (error) {
      console.error('Get profile error:', error);
      return null;
    }
  }

  /**
   * Get user profile by URL slug
   * @param {string} urlSlug - URL slug
   * @returns {Object} - User profile
   */
  async getUserProfileBySlug(urlSlug) {
    try {
      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .select('*')
        .eq('url_slug', urlSlug)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw new Error(`Failed to get profile by slug: ${error.message}`);
      }

      return profile;

    } catch (error) {
      console.error('Get profile by slug error:', error);
      return null;
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updates - Profile updates
   * @returns {Object} - Updated profile
   */
  async updateUserProfile(userId, updates) {
    try {
      // Remove sensitive fields that shouldn't be updated directly
      const { id, email, created_at, subscription_tier, role, ...safeUpdates } = updates;

      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .update(safeUpdates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update profile: ${error.message}`);
      }

      console.log(`✅ Updated profile for user ${userId}`);
      return profile;

    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  }

  /**
   * Update last active timestamp
   * @param {string} userId - User ID
   */
  async updateLastActive(userId) {
    try {
      await this.supabase
        .from('user_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', userId);
    } catch (error) {
      console.warn('Failed to update last active:', error);
      // Non-critical error, don't throw
    }
  }

  // =========================================================================
  // ROLE AND PERMISSION MANAGEMENT
  // =========================================================================

  /**
   * Check if user has specific role
   * @param {string} userId - User ID
   * @param {string} requiredRole - Required role
   * @returns {boolean} - Whether user has the role
   */
  async hasRole(userId, requiredRole) {
    try {
      const profile = await this.getUserProfile(userId);
      return profile && profile.role === requiredRole;
    } catch (error) {
      console.error('Role check error:', error);
      return false;
    }
  }

  /**
   * Check if user has admin privileges
   * @param {string} userId - User ID
   * @returns {boolean} - Whether user is admin
   */
  async isAdmin(userId) {
    return await this.hasRole(userId, 'admin');
  }

  /**
   * Check if user can access another user's profile
   * @param {string} viewerId - ID of user trying to view (can be null for public)
   * @param {string} profileUserId - ID of profile owner
   * @returns {boolean} - Whether access is allowed
   */
  async canAccessProfile(viewerId, profileUserId) {
    try {
      // Get the target profile
      const targetProfile = await this.getUserProfile(profileUserId);
      
      if (!targetProfile) {
        return false;
      }

      // Check visibility settings
      // If public visibility, allow access
      if (targetProfile.visibility === 'public') {
        return true;
      }

      // If private and no viewer, deny access
      if (!viewerId) {
        return false;
      }

      // If viewer is the profile owner, allow access
      if (viewerId === profileUserId) {
        return true;
      }

      // Check if viewer is admin
      const viewerProfile = await this.getUserProfile(viewerId);
      if (viewerProfile && viewerProfile.role === 'admin') {
        return true;
      }

      // For recruiter visibility, allow if viewer is recruiter or admin
      if (targetProfile.visibility === 'recruiters' && viewerProfile) {
        return ['recruiter', 'admin'].includes(viewerProfile.role);
      }

      // Default deny for private profiles
      return false;

    } catch (error) {
      console.error('Access check error:', error);
      // On error, be permissive for public access but restrictive for private
      return false;
    }
  }

  // =========================================================================
  // URL SLUG MANAGEMENT
  // =========================================================================

  /**
   * Check if URL slug is available
   * @param {string} slug - URL slug to check
   * @param {string} excludeUserId - User ID to exclude from check (for updates)
   * @returns {boolean} - Whether slug is available
   */
  async isSlugAvailable(slug, excludeUserId = null) {
    try {
      // Check reserved slugs
      const { data: reservedSlug } = await this.supabase
        .from('reserved_slugs')
        .select('slug')
        .eq('slug', slug)
        .single();

      if (reservedSlug) {
        return false;
      }

      // Check existing user slugs
      let query = this.supabase
        .from('user_profiles')
        .select('id')
        .eq('url_slug', slug);

      if (excludeUserId) {
        query = query.neq('id', excludeUserId);
      }

      const { data: existingUser } = await query.single();

      return !existingUser;

    } catch (error) {
      // If no results found, slug is available
      return true;
    }
  }

  /**
   * Generate fallback URL slug (client-side)
   * @param {string} baseName - Base name for slug
   * @returns {string} - Generated slug
   */
  generateFallbackSlug(baseName) {
    return baseName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 45) + '-' + Math.random().toString(36).substring(2, 6);
  }

  // =========================================================================
  // SESSION MANAGEMENT
  // =========================================================================

  /**
   * Get current session
   * @returns {Object} - Current session
   */
  async getCurrentSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      
      if (error) {
        throw new Error(`Session error: ${error.message}`);
      }

      return session;

    } catch (error) {
      console.error('Get session error:', error);
      return null;
    }
  }

  /**
   * Get current user
   * @returns {Object} - Current user with profile
   */
  async getCurrentUser() {
    try {
      const { data: { user }, error } = await this.supabase.auth.getUser();
      
      if (error) {
        throw new Error(`Get user error: ${error.message}`);
      }

      if (!user) {
        return null;
      }

      // Get user profile
      const profile = await this.getUserProfile(user.id);

      return {
        ...user,
        profile
      };

    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }

  // =========================================================================
  // ADMIN FUNCTIONS
  // =========================================================================

  /**
   * Update user role (admin only)
   * @param {string} adminUserId - Admin user ID
   * @param {string} targetUserId - Target user ID
   * @param {string} newRole - New role to assign
   * @returns {Object} - Update result
   */
  async updateUserRole(adminUserId, targetUserId, newRole) {
    try {
      // Verify admin privileges
      const isAdminUser = await this.isAdmin(adminUserId);
      if (!isAdminUser) {
        throw new Error('Insufficient privileges to update user role');
      }

      // Update role
      const { data: profile, error } = await this.supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', targetUserId)
        .select()
        .single();

      if (error) {
        throw new Error(`Failed to update role: ${error.message}`);
      }

      console.log(`✅ Admin ${adminUserId} updated role for user ${targetUserId} to ${newRole}`);
      return {
        success: true,
        profile
      };

    } catch (error) {
      console.error('Update role error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // =========================================================================
  // ANALYTICS AND TRACKING
  // =========================================================================

  /**
   * Record profile view for analytics
   * @param {string} profileId - Profile being viewed
   * @param {string} viewerId - User viewing (optional)
   * @param {string} viewerIp - IP address of viewer
   * @param {Object} metadata - Additional metadata
   */
  async recordProfileView(profileId, viewerId = null, viewerIp = null, metadata = {}) {
    try {
      await this.supabase
        .from('profile_views')
        .insert({
          profile_id: profileId,
          viewer_id: viewerId,
          viewer_ip: viewerIp,
          user_agent: metadata.userAgent,
          referrer: metadata.referrer
        });

      // Update profile view count
      // First get current count, then increment (simple approach)
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('profile_views')
        .eq('id', profileId)
        .single();
      
      if (profile) {
        await this.supabase
          .from('user_profiles')
          .update({ 
            profile_views: (profile.profile_views || 0) + 1 
          })
          .eq('id', profileId);
      }

    } catch (error) {
      console.warn('Failed to record profile view:', error);
      // Non-critical error, don't throw
    }
  }
}

// Export singleton instance
export default new AuthService();