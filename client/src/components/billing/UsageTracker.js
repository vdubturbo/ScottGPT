/**
 * UsageTracker Component
 * ======================
 *
 * Real-time usage tracking component that can be embedded
 * throughout the app to show current usage and trigger upgrades.
 */

import React, { useState } from 'react';
import { useBilling } from '../../contexts/BillingContext';
import UsageIndicator from './UsageIndicator';
import UpgradePrompt from './UpgradePrompt';
import PurchaseResumeModal from './PurchaseResumeModal';

const UsageTracker = ({
  showUpgradePrompts = true,
  autoShowUpgrade = true,
  compact = false,
  position = 'inline', // 'inline' | 'floating' | 'header'
  className = ''
}) => {
  const {
    usage,
    subscription,
    isAtLimit,
    isPremium,
    usagePercentage,
    checkUsage
  } = useBilling();

  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);

  // Determine when to show upgrade prompts
  const shouldShowUpgradeHint = () => {
    if (!showUpgradePrompts || isPremium) return false;

    if (isAtLimit) return true;
    if (usagePercentage >= 80) return true;

    return false;
  };

  const getActionButton = () => {
    if (isAtLimit && !isPremium) {
      return (
        <div className="action-buttons">
          <button
            className="action-btn primary"
            onClick={() => setShowPurchaseModal(true)}
          >
            Buy Resume
          </button>
          <button
            className="action-btn secondary"
            onClick={() => setShowUpgradePrompt(true)}
          >
            Upgrade
          </button>
        </div>
      );
    }

    if (shouldShowUpgradeHint() && !isPremium) {
      return (
        <button
          className="action-btn upgrade"
          onClick={() => setShowUpgradePrompt(true)}
        >
          Upgrade to Premium
        </button>
      );
    }

    return null;
  };

  const refreshUsage = async () => {
    await checkUsage();
  };

  return (
    <div className={`usage-tracker ${position} ${compact ? 'compact' : ''} ${className}`}>
      <div className="tracker-content">
        {/* Usage Display */}
        <div className="usage-display">
          <UsageIndicator
            showDetails={!compact}
            size={compact ? 'small' : 'normal'}
            className="tracker-usage"
          />

          {/* Refresh Button */}
          <button
            className="refresh-btn"
            onClick={refreshUsage}
            title="Refresh usage data"
          >
            🔄
          </button>
        </div>

        {/* Action Buttons */}
        {getActionButton()}

        {/* Upgrade Hint */}
        {shouldShowUpgradeHint() && showUpgradePrompts && (
          <div className="upgrade-hint">
            <span className="hint-icon">💡</span>
            <span className="hint-text">
              {isAtLimit
                ? 'Upgrade for unlimited resumes'
                : `${usage.resumeCountRemaining} resumes left this month`
              }
            </span>
          </div>
        )}
      </div>

      {/* Modals */}
      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        trigger={isAtLimit ? 'limit' : 'custom'}
        title={isAtLimit ? undefined : 'Almost at your limit'}
        message={isAtLimit ? undefined : 'Upgrade now to avoid interruptions'}
      />

      <PurchaseResumeModal
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        credits={1}
      />

      <style jsx>{`
        .usage-tracker {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .usage-tracker.floating {
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #1a1a1a;
          border: 1px solid #333;
          border-radius: 12px;
          padding: 16px;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
          z-index: 100;
          max-width: 300px;
        }

        .usage-tracker.header {
          background: #1a1a1a;
          border-radius: 8px;
          padding: 8px 12px;
        }

        .usage-tracker.compact {
          gap: 8px;
        }

        .tracker-content {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .usage-tracker.compact .tracker-content {
          gap: 8px;
        }

        .usage-display {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .tracker-usage {
          flex: 1;
        }

        .refresh-btn {
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: background-color 0.2s ease;
          font-size: 0.875rem;
        }

        .refresh-btn:hover {
          background: #333;
        }

        .action-buttons {
          display: flex;
          gap: 8px;
        }

        .action-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 6px;
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
          flex: 1;
        }

        .usage-tracker.compact .action-btn {
          padding: 6px 12px;
          font-size: 0.8rem;
        }

        .action-btn.primary {
          background: #28a745;
          color: white;
        }

        .action-btn.primary:hover {
          background: #1e7e34;
        }

        .action-btn.secondary {
          background: #007bff;
          color: white;
        }

        .action-btn.secondary:hover {
          background: #0056b3;
        }

        .action-btn.upgrade {
          background: #007bff;
          color: white;
          width: 100%;
        }

        .action-btn.upgrade:hover {
          background: #0056b3;
        }

        .upgrade-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 12px;
          background: #1a2e3e;
          border: 1px solid #2c5282;
          border-radius: 6px;
          font-size: 0.875rem;
          color: #63b3ed;
        }

        .usage-tracker.compact .upgrade-hint {
          padding: 6px 10px;
          font-size: 0.8rem;
        }

        .hint-icon {
          font-size: 1rem;
        }

        .hint-text {
          flex: 1;
        }

        @media (max-width: 768px) {
          .usage-tracker.floating {
            bottom: 10px;
            right: 10px;
            left: 10px;
            max-width: none;
          }

          .action-buttons {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default UsageTracker;