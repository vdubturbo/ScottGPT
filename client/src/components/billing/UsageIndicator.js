/**
 * UsageIndicator Component
 * ========================
 *
 * Displays current usage information with visual progress indicators.
 * Shows resume count, limits, and next reset date.
 */

import React from 'react';
import { useBilling } from '../../contexts/BillingContext';
import * as Progress from '@radix-ui/react-progress';

const UsageIndicator = ({
  showDetails = true,
  size = 'normal',
  className = ''
}) => {
  const {
    usage,
    subscription,
    usagePercentage,
    isAtLimit,
    loading
  } = useBilling();

  if (loading) {
    return (
      <div className={`usage-indicator loading ${size} ${className}`}>
        <div className="usage-skeleton">
          <div className="skeleton-bar"></div>
          <div className="skeleton-text"></div>
        </div>
      </div>
    );
  }

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getProgressColor = () => {
    if (usagePercentage >= 90) return 'danger';
    if (usagePercentage >= 70) return 'warning';
    return 'success';
  };

  const getStatusMessage = () => {
    if (isAtLimit) {
      return subscription.tier === 'free'
        ? 'Limit reached - upgrade to continue'
        : 'Monthly limit reached';
    }

    if (usagePercentage >= 80) {
      return `${usage.resumeCountRemaining} resumes remaining`;
    }

    return `${usage.resumeCountUsed} of ${usage.resumeCountLimit} resumes used`;
  };

  return (
    <div className={`usage-indicator ${size} ${className}`}>
      {/* Progress Bar */}
      <div className="usage-progress">
        <Progress.Root
          className={`progress-root ${getProgressColor()}`}
          value={usagePercentage}
        >
          <Progress.Indicator
            className="progress-indicator"
            style={{ transform: `translateX(-${100 - usagePercentage}%)` }}
          />
        </Progress.Root>
      </div>

      {/* Usage Stats */}
      {showDetails && (
        <div className="usage-details">
          <div className="usage-stats">
            <span className="usage-count">
              {usage.resumeCountUsed}/{usage.resumeCountLimit}
            </span>
            <span className="usage-label">resumes</span>
          </div>

          <div className="usage-status">
            <span className={`status-message ${isAtLimit ? 'at-limit' : ''}`}>
              {getStatusMessage()}
            </span>

            {usage.resetDate && (
              <span className="reset-date">
                Resets {formatDate(usage.resetDate)}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Compact View */}
      {!showDetails && (
        <div className="usage-compact">
          <span className="usage-fraction">
            {usage.resumeCountUsed}/{usage.resumeCountLimit}
          </span>
          {isAtLimit && (
            <span className="limit-badge">Limit Reached</span>
          )}
        </div>
      )}

      <style jsx>{`
        .usage-indicator {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 12px;
          border-radius: 8px;
          background: #1a1a1a;
          border: 1px solid #333;
        }

        .usage-indicator.compact {
          padding: 8px;
          gap: 4px;
        }

        .usage-indicator.small {
          padding: 6px;
          font-size: 0.875rem;
        }

        .usage-indicator.loading {
          opacity: 0.6;
        }

        .usage-progress {
          width: 100%;
        }

        .progress-root {
          position: relative;
          overflow: hidden;
          background: #333;
          border-radius: 6px;
          width: 100%;
          height: 8px;
        }

        .progress-root.success {
          background: #1e3a1e;
        }

        .progress-root.warning {
          background: #3a3015;
        }

        .progress-root.danger {
          background: #3a1e1e;
        }

        .progress-indicator {
          background: #28a745;
          width: 100%;
          height: 100%;
          transition: transform 660ms cubic-bezier(0.65, 0, 0.35, 1);
        }

        .progress-root.warning .progress-indicator {
          background: #ffc107;
        }

        .progress-root.danger .progress-indicator {
          background: #dc3545;
        }

        .usage-details {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }

        .usage-stats {
          display: flex;
          align-items: baseline;
          gap: 4px;
        }

        .usage-count {
          font-size: 1.125rem;
          font-weight: 600;
          color: #e0e0e0;
        }

        .usage-label {
          font-size: 0.875rem;
          color: #b0b0b0;
        }

        .usage-status {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          text-align: right;
        }

        .status-message {
          font-size: 0.875rem;
          color: #c0c0c0;
          margin-bottom: 2px;
        }

        .status-message.at-limit {
          color: #ff6b6b;
          font-weight: 500;
        }

        .reset-date {
          font-size: 0.75rem;
          color: #b0b0b0;
        }

        .usage-compact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .usage-fraction {
          font-size: 0.875rem;
          font-weight: 500;
          color: #c0c0c0;
        }

        .limit-badge {
          padding: 2px 6px;
          background: #dc3545;
          color: white;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 500;
        }

        .usage-skeleton {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .skeleton-bar {
          height: 8px;
          background: #444;
          border-radius: 4px;
          margin-bottom: 8px;
        }

        .skeleton-text {
          height: 12px;
          width: 60%;
          background: #444;
          border-radius: 4px;
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }

        @media (max-width: 768px) {
          .usage-details {
            flex-direction: column;
            gap: 8px;
          }

          .usage-status {
            align-items: flex-start;
            text-align: left;
          }
        }
      `}</style>
    </div>
  );
};

export default UsageIndicator;