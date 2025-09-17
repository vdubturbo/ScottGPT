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
      {/* Simple Box Format */}
      <div className="usage-box">
        <span className="usage-text">
          {usage.resumeCountRemaining} remaining resume generations
        </span>
      </div>

      <style jsx>{`
        .usage-indicator {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0.5rem 1rem;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 8px;
        }

        .usage-indicator.header {
          min-height: 50px; /* Match login box height */
          padding: 0.75rem 1rem;
        }

        .usage-indicator.compact {
          min-height: 40px;
          padding: 0.5rem 0.75rem;
        }

        .usage-indicator.small {
          min-height: 36px;
          padding: 0.5rem;
          font-size: 0.875rem;
        }

        .usage-indicator.loading {
          opacity: 0.6;
        }

        .usage-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
        }

        .usage-text {
          font-size: 1rem;
          font-weight: 600;
          color: #e0e0e0;
          font-family: 'Courier New', monospace;
          letter-spacing: 0.05em;
        }

        .usage-indicator.header .usage-text {
          font-size: 1.1rem;
        }

        .usage-indicator.small .usage-text {
          font-size: 0.9rem;
        }


        @media (max-width: 768px) {
          .usage-indicator {
            min-height: 44px;
          }

          .usage-text {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default UsageIndicator;