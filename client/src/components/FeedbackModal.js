import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './FeedbackModal.css';

const FeedbackModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const [comment, setComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!comment.trim()) {
      setError('Please enter your feedback');
      return;
    }

    if (comment.length > 1000) {
      setError('Feedback must be under 1000 characters');
      return;
    }

    setIsSubmitting(true);
    setError('');

    // Get token from localStorage (same as AuthContext uses)
    const token = localStorage.getItem('auth_token');
    console.log('Auth token:', token);

    if (!token) {
      setError('Authentication token not found. Please try logging in again.');
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          comment: comment.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit feedback');
      }

      setIsSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2000);

    } catch (err) {
      setError('Failed to submit feedback. Please try again.');
      console.error('Feedback submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setComment('');
    setError('');
    setIsSubmitted(false);
    setIsSubmitting(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="feedback-modal-overlay" onClick={handleClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-modal-header">
          <h3>💬 Provide Feedback</h3>
          <button className="feedback-modal-close" onClick={handleClose}>
            ×
          </button>
        </div>

        {isSubmitted ? (
          <div className="feedback-success">
            <div className="success-icon">✅</div>
            <h4>Thank you for your feedback!</h4>
            <p>We appreciate you taking the time to help us improve.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="feedback-form">
            <div className="feedback-form-group">
              <label htmlFor="feedback-comment">
                Your feedback helps us improve the platform:
              </label>
              <textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us about your experience, suggestions for improvement, bugs you've encountered, or features you'd like to see..."
                rows="6"
                maxLength="1000"
                disabled={isSubmitting}
                className={error ? 'error' : ''}
              />
              <div className="feedback-char-count">
                {comment.length}/1000 characters
              </div>
            </div>

            {error && (
              <div className="feedback-error">
                {error}
              </div>
            )}

            <div className="feedback-form-actions">
              <button
                type="button"
                onClick={handleClose}
                className="feedback-btn feedback-btn-cancel"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="feedback-btn feedback-btn-submit"
                disabled={isSubmitting || !comment.trim()}
              >
                {isSubmitting ? (
                  <>
                    <span className="feedback-spinner"></span>
                    Submitting...
                  </>
                ) : (
                  'Submit Feedback'
                )}
              </button>
            </div>

            <div className="feedback-info">
              <small>
                Feedback is submitted as: {user?.email || 'Unknown user'}
              </small>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;