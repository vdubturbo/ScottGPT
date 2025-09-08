// client/src/components/auth/RegisterForm.js
// Registration form component for multi-tenant authentication

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Link } from 'react-router-dom';

const RegisterForm = ({ onSuccess, redirectTo = '/dashboard' }) => {
  const { register, checkSlugAvailability, loading, error, setError } = useAuth();
  const [formData, setFormData] = useState({
    fullName: '',
    displayName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'job_seeker',
    urlSlug: ''
  });
  const [formErrors, setFormErrors] = useState({});
  const [slugChecking, setSlugChecking] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState(null);
  const [slugSuggestion, setSlugSuggestion] = useState('');

  // Auto-generate URL slug from display name
  useEffect(() => {
    if (formData.displayName && !formData.urlSlug) {
      const slug = generateSlugFromName(formData.displayName);
      setFormData(prev => ({ ...prev, urlSlug: slug }));
    }
  }, [formData.displayName]);

  // Check slug availability when user stops typing
  useEffect(() => {
    if (formData.urlSlug && formData.urlSlug.length >= 3) {
      const timeoutId = setTimeout(() => {
        checkSlugAvailabilityDebounced(formData.urlSlug);
      }, 500);
      
      return () => clearTimeout(timeoutId);
    } else {
      setSlugAvailable(null);
    }
  }, [formData.urlSlug]);

  const generateSlugFromName = (name) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 45);
  };

  const checkSlugAvailabilityDebounced = async (slug) => {
    if (!isValidSlug(slug)) {
      setSlugAvailable(false);
      return;
    }

    setSlugChecking(true);
    try {
      const result = await checkSlugAvailability(slug);
      if (result.success) {
        setSlugAvailable(result.available);
        if (!result.available) {
          setSlugSuggestion(`${slug}-${Math.random().toString(36).substring(2, 6)}`);
        } else {
          setSlugSuggestion('');
        }
      }
    } catch (err) {
      console.error('Slug check failed:', err);
      setSlugAvailable(null);
    } finally {
      setSlugChecking(false);
    }
  };

  const isValidSlug = (slug) => {
    return /^[a-z0-9-]{3,50}$/.test(slug) && !slug.startsWith('-') && !slug.endsWith('-');
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    
    // Handle special formatting for URL slug
    if (name === 'urlSlug') {
      const formattedSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '')
        .substring(0, 50);
      
      setFormData(prev => ({ ...prev, [name]: formattedSlug }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }

    // Clear specific field errors
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
    
    // Clear global error
    if (error) setError(null);
  };

  const validateForm = () => {
    const errors = {};

    // Required fields
    if (!formData.fullName.trim()) errors.fullName = 'Full name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    if (!formData.password) errors.password = 'Password is required';
    if (!formData.confirmPassword) errors.confirmPassword = 'Please confirm your password';

    // Email validation
    if (formData.email && !formData.email.includes('@')) {
      errors.email = 'Please enter a valid email address';
    }

    // Password validation
    if (formData.password && formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters long';
    }

    // Password confirmation
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }

    // URL slug validation
    if (formData.urlSlug) {
      if (!isValidSlug(formData.urlSlug)) {
        errors.urlSlug = 'URL slug must be 3-50 characters, lowercase letters, numbers, and hyphens only';
      } else if (slugAvailable === false) {
        errors.urlSlug = 'This URL slug is not available';
      }
    }

    return errors;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    try {
      const userData = {
        fullName: formData.fullName.trim(),
        displayName: formData.displayName.trim() || formData.fullName.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        urlSlug: formData.urlSlug || null
      };

      const result = await register(userData);
      
      if (result.success) {
        if (onSuccess) {
          onSuccess(result, redirectTo);
        }
      } else {
        setFormErrors({ general: result.error });
      }
    } catch (err) {
      setFormErrors({ general: 'An unexpected error occurred during registration' });
    }
  };

  const useSuggestion = () => {
    setFormData(prev => ({ ...prev, urlSlug: slugSuggestion }));
    setSlugSuggestion('');
  };

  const currentError = formErrors.general || error;

  return (
    <div className="register-form">
      <div className="auth-card">
        <div className="auth-header">
          <h2>Create Your Account</h2>
          <p>Join ScottGPT and showcase your professional experience</p>
        </div>

        {currentError && (
          <div className="alert alert-error">
            {currentError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="auth-form">
          {/* Account Type Selection */}
          <div className="form-group">
            <label htmlFor="role">Account Type</label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              className="form-select"
              disabled={loading}
            >
              <option value="job_seeker">Job Seeker - Showcase your experience</option>
              <option value="recruiter">Recruiter - Find top talent</option>
              <option value="job_poster">Company - Post opportunities</option>
            </select>
          </div>

          {/* Personal Information */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fullName">
                Full Name *
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                placeholder="John Doe"
                className={`form-input ${formErrors.fullName ? 'error' : ''}`}
                disabled={loading}
                autoComplete="name"
              />
              {formErrors.fullName && <span className="error-text">{formErrors.fullName}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="displayName">
                Display Name
                <span className="help-text">Public name shown on your profile</span>
              </label>
              <input
                type="text"
                id="displayName"
                name="displayName"
                value={formData.displayName}
                onChange={handleChange}
                placeholder="Leave empty to use full name"
                className="form-input"
                disabled={loading}
              />
            </div>
          </div>

          {/* Contact Information */}
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
              className={`form-input ${formErrors.email ? 'error' : ''}`}
              disabled={loading}
              autoComplete="email"
            />
            {formErrors.email && <span className="error-text">{formErrors.email}</span>}
          </div>

          {/* URL Slug */}
          <div className="form-group">
            <label htmlFor="urlSlug">
              Profile URL
              <span className="help-text">Your unique profile URL: scottgpt.com/your-slug</span>
            </label>
            <div className="url-input-group">
              <span className="url-prefix">scottgpt.com/</span>
              <input
                type="text"
                id="urlSlug"
                name="urlSlug"
                value={formData.urlSlug}
                onChange={handleChange}
                placeholder="your-name"
                className={`form-input url-input ${formErrors.urlSlug ? 'error' : ''} ${slugAvailable === true ? 'available' : ''} ${slugAvailable === false ? 'unavailable' : ''}`}
                disabled={loading}
                maxLength="50"
              />
              {slugChecking && <span className="spinner-small"></span>}
              {slugAvailable === true && <span className="check-icon">✓</span>}
              {slugAvailable === false && <span className="cross-icon">✗</span>}
            </div>
            {formErrors.urlSlug && <span className="error-text">{formErrors.urlSlug}</span>}
            {slugSuggestion && (
              <div className="slug-suggestion">
                Not available? Try:{' '}
                <button
                  type="button"
                  className="suggestion-btn"
                  onClick={useSuggestion}
                >
                  {slugSuggestion}
                </button>
              </div>
            )}
          </div>

          {/* Password */}
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="password">Password *</label>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                placeholder="At least 8 characters"
                className={`form-input ${formErrors.password ? 'error' : ''}`}
                disabled={loading}
                autoComplete="new-password"
              />
              {formErrors.password && <span className="error-text">{formErrors.password}</span>}
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm Password *</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                placeholder="Repeat your password"
                className={`form-input ${formErrors.confirmPassword ? 'error' : ''}`}
                disabled={loading}
                autoComplete="new-password"
              />
              {formErrors.confirmPassword && <span className="error-text">{formErrors.confirmPassword}</span>}
            </div>
          </div>

          <button
            type="submit"
            className={`btn btn-primary btn-full ${loading ? 'loading' : ''}`}
            disabled={loading || slugChecking}
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating Account...
              </>
            ) : (
              'Create Account'
            )}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account?{' '}
            <Link to="/login" className="auth-link">
              Sign in here
            </Link>
          </p>

          <div className="terms-notice">
            By creating an account, you agree to our{' '}
            <Link to="/terms" className="auth-link-small">Terms of Service</Link>
            {' '}and{' '}
            <Link to="/privacy" className="auth-link-small">Privacy Policy</Link>.
          </div>
        </div>
      </div>
    </div>
  );
};

export default RegisterForm;