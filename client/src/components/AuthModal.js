import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthModal.css';

const AuthModal = ({ isOpen, onClose, initialTab = 'register' }) => {
  const { login, register, loading, error, setError } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [formData, setFormData] = useState({
    // Login fields
    email: '',
    password: '',
    // Register fields
    full_name: '',
    display_name: '',
    url_slug: '',
    role: 'job_seeker'
  });
  const [formError, setFormError] = useState('');
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [slugChecking, setSlugChecking] = useState(false);

  // Reset form when modal opens/closes or tab changes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        email: '',
        password: '',
        full_name: '',
        display_name: '',
        url_slug: '',
        role: 'job_seeker'
      });
      setFormError('');
      setSlugAvailable(null);
      if (error) setError(null);
    }
  }, [isOpen, activeTab, setError, error]);

  // Close modal on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear errors when user starts typing
    if (formError) setFormError('');
    if (error) setError(null);
    
    // Auto-generate URL slug from display name
    if (name === 'display_name' && activeTab === 'register') {
      const slug = value.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim();
      setFormData(prev => ({ ...prev, url_slug: slug }));
      setSlugAvailable(null);
    }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.email || !formData.password) {
      setFormError('Please fill in all fields');
      return;
    }

    if (!formData.email.includes('@')) {
      setFormError('Please enter a valid email address');
      return;
    }

    try {
      const result = await login(formData.email, formData.password);
      
      if (result.success) {
        onClose();
        // Get the user's actual slug from login response
        console.log('🔍 Frontend Debug: Login result:', result);
        
        // Get the user's slug from the profile data
        const userSlug = result.profile?.url_slug || 'slovett';
        console.log('🔍 Frontend Debug: User slug:', userSlug);
        
        // Redirect to dashboard (their personal admin page)
        console.log('🔍 Frontend Debug: Redirecting to dashboard');
        window.location.href = '/dashboard';
      } else {
        setFormError(result.error || 'Login failed');
      }
    } catch (err) {
      setFormError('An unexpected error occurred');
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    
    console.log('🔍 Frontend Debug: Registration form submitted');
    console.log('🔍 Frontend Debug: Form data:', { ...formData, password: '[HIDDEN]' });
    
    const required = ['full_name', 'display_name', 'email', 'password', 'url_slug'];
    const missing = required.filter(field => !formData[field]);
    
    if (missing.length > 0) {
      console.log('🔍 Frontend Debug: Missing required fields:', missing);
      setFormError('Please fill in all required fields');
      return;
    }

    if (!formData.email.includes('@')) {
      console.log('🔍 Frontend Debug: Invalid email format');
      setFormError('Please enter a valid email address');
      return;
    }

    if (formData.password.length < 6) {
      console.log('🔍 Frontend Debug: Password too short');
      setFormError('Password must be at least 6 characters long');
      return;
    }

    try {
      console.log('🔍 Frontend Debug: Calling register function...');
      const result = await register(formData);
      console.log('🔍 Frontend Debug: Register result:', result);
      
      if (result.success) {
        onClose();
        alert('Registration successful! Please check your email to verify your account.');
      } else {
        setFormError(result.error || 'Registration failed');
      }
    } catch (err) {
      setFormError('An unexpected error occurred');
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const currentError = formError || error;

  return (
    <div className="auth-modal-overlay" onClick={handleBackdropClick}>
      <div className="auth-modal">
        <div className="auth-modal-header">
          <h2>Welcome to SplitOut.ai</h2>
          <button className="auth-modal-close" onClick={onClose}>×</button>
        </div>

        <div className="auth-modal-tabs">
          <button 
            className={`auth-tab ${activeTab === 'register' ? 'active' : ''}`}
            onClick={() => setActiveTab('register')}
          >
            Get Started
          </button>
          <button 
            className={`auth-tab ${activeTab === 'login' ? 'active' : ''}`}
            onClick={() => setActiveTab('login')}
          >
            Sign In
          </button>
        </div>

        <div className="auth-modal-content">
          {currentError && (
            <div className="alert alert-error">
              {currentError}
            </div>
          )}

          {activeTab === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="form-group">
                <label htmlFor="login-email">Email Address</label>
                <input
                  type="email"
                  id="login-email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="you@company.com"
                  className="form-input"
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="login-password">Password</label>
                <input
                  type="password"
                  id="login-password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Enter your password"
                  className="form-input"
                  disabled={loading}
                  autoComplete="current-password"
                />
              </div>

              <button
                type="submit"
                className={`btn btn-primary btn-full ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="auth-form">
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="full_name">Full Name *</label>
                  <input
                    type="text"
                    id="full_name"
                    name="full_name"
                    value={formData.full_name}
                    onChange={handleChange}
                    required
                    placeholder="John Doe"
                    className="form-input"
                    disabled={loading}
                    autoComplete="name"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="display_name">Display Name *</label>
                  <input
                    type="text"
                    id="display_name"
                    name="display_name"
                    value={formData.display_name}
                    onChange={handleChange}
                    required
                    placeholder="John D"
                    className="form-input"
                    disabled={loading}
                  />
                  <small className="help-text">How your name appears publicly</small>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="email">Email Address *</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  required
                  placeholder="john@company.com"
                  className="form-input"
                  disabled={loading}
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <label htmlFor="password">Password *</label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  required
                  placeholder="Minimum 6 characters"
                  className="form-input"
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <div className="form-group">
                <label htmlFor="url_slug">Profile URL *</label>
                <div className="url-input-group">
                  <span className="url-prefix">splitout.ai/</span>
                  <input
                    type="text"
                    id="url_slug"
                    name="url_slug"
                    value={formData.url_slug}
                    onChange={handleChange}
                    required
                    placeholder="your-name"
                    className="form-input url-input"
                    disabled={loading}
                    pattern="[a-z0-9-]+"
                    title="Only lowercase letters, numbers, and hyphens allowed"
                  />
                  {slugChecking && <span className="spinner-small"></span>}
                  {slugAvailable === true && <span className="check-icon">✓</span>}
                  {slugAvailable === false && <span className="cross-icon">✗</span>}
                </div>
                <small className="help-text">This will be your public profile URL</small>
              </div>

              <input type="hidden" name="role" value="job_seeker" />

              <button
                type="submit"
                className={`btn btn-primary btn-full ${loading ? 'loading' : ''}`}
                disabled={loading}
              >
                {loading ? 'Creating Account...' : 'Create Account'}
              </button>
            </form>
          )}

          <div className="auth-modal-footer">
            <p className="terms-notice">
              By creating an account, you agree to our{' '}
              <button className="auth-link-small">Terms of Service</button> and{' '}
              <button className="auth-link-small">Privacy Policy</button>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModal;