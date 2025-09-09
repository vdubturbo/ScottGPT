// client/src/contexts/AuthContext.js
// Authentication context for multi-tenant SaaS application

import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext({});

// Configure axios defaults
axios.defaults.baseURL = process.env.REACT_APP_API_URL || '';
axios.defaults.withCredentials = true;

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Set up axios interceptor for authentication
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }

    // Response interceptor to handle 401s
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401 && token) {
          // Token expired or invalid
          logout();
        }
        return Promise.reject(error);
      }
    );

    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  // Check authentication status on app load
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      
      if (!token) {
        setLoading(false);
        return;
      }

      const response = await axios.get('/api/auth/me');
      if (response.data.success) {
        setUser(response.data.user);
        setError(null);
      } else {
        // Invalid session
        logout();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      if (error.response?.status === 401) {
        logout();
      } else {
        setError('Failed to verify authentication status');
      }
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.post('/api/auth/login', {
        email,
        password
      });

      if (response.data.success) {
        const { user, session } = response.data;
        
        // Store token
        localStorage.setItem('auth_token', session.access_token);
        localStorage.setItem('refresh_token', session.refresh_token);
        
        // Set axios header
        axios.defaults.headers.common['Authorization'] = `Bearer ${session.access_token}`;
        
        // Update state
        setUser(user);
        
        return { success: true, user };
      } else {
        throw new Error(response.data.message || 'Login failed');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const register = async (userData) => {
    try {
      console.log('🔍 Auth Context Debug: Starting registration');
      console.log('🔍 Auth Context Debug: User data:', { ...userData, password: '[HIDDEN]' });
      
      setLoading(true);
      setError(null);

      console.log('🔍 Auth Context Debug: Making API call to /api/auth/register');
      const response = await axios.post('/api/auth/register', userData);
      console.log('🔍 Auth Context Debug: API response:', response.data);

      if (response.data.success) {
        return { 
          success: true, 
          message: response.data.message,
          user: response.data.user,
          profile: response.data.profile
        };
      } else {
        throw new Error(response.data.message || 'Registration failed');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Registration failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await axios.post('/api/auth/logout');
    } catch (error) {
      console.warn('Logout API call failed:', error);
    } finally {
      // Clear local state regardless of API call success
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      delete axios.defaults.headers.common['Authorization'];
      setUser(null);
      setError(null);
      
      // Redirect to landing page
      window.location.href = '/';
    }
  };

  const updateProfile = async (updates) => {
    try {
      setError(null);
      
      if (!user) {
        throw new Error('No authenticated user');
      }

      const response = await axios.put(`/api/auth/profile/${user.id}`, updates);

      if (response.data.success) {
        // Update user profile in state
        setUser(prevUser => ({
          ...prevUser,
          profile: response.data.profile
        }));
        return { success: true, profile: response.data.profile };
      } else {
        throw new Error(response.data.message || 'Profile update failed');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Profile update failed';
      setError(errorMessage);
      return { success: false, error: errorMessage };
    }
  };

  const checkSlugAvailability = async (slug) => {
    try {
      const response = await axios.get(`/api/auth/check-slug/${slug}`);
      return response.data;
    } catch (error) {
      console.error('Slug check failed:', error);
      return { success: false, available: false };
    }
  };

  const getPublicProfile = async (slug) => {
    try {
      const response = await axios.get(`/api/auth/public/${slug}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get public profile:', error);
      return { success: false, error: error.response?.data?.message || 'Profile not found' };
    }
  };

  const chatWithProfile = async (slug, message, options = {}) => {
    try {
      const response = await axios.post(`/api/chat/profile/${slug}`, {
        message,
        options
      });
      return response.data;
    } catch (error) {
      console.error('Profile chat failed:', error);
      throw error;
    }
  };

  // Helper functions for role checking
  const isAdmin = () => user?.profile?.role === 'admin';
  const isRecruiter = () => user?.profile?.role === 'recruiter';
  const isJobPoster = () => user?.profile?.role === 'job_poster';
  const isJobSeeker = () => user?.profile?.role === 'job_seeker';

  const hasRole = (role) => user?.profile?.role === role;
  const hasAnyRole = (roles) => roles.includes(user?.profile?.role);

  const value = {
    user,
    loading,
    error,
    login,
    register,
    logout,
    updateProfile,
    checkSlugAvailability,
    getPublicProfile,
    chatWithProfile,
    checkAuthStatus,
    isAdmin,
    isRecruiter,
    isJobPoster,
    isJobSeeker,
    hasRole,
    hasAnyRole,
    setError // Allow components to clear errors
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;