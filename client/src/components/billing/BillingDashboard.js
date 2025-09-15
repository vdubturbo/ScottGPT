/**
 * BillingDashboard Component
 * ==========================
 *
 * Main billing management interface showing:
 * - Current subscription status
 * - Usage statistics
 * - Payment history
 * - Subscription management actions
 */

import React, { useState, useEffect } from 'react';
import { useBilling } from '../../contexts/BillingContext';
import UsageIndicator from './UsageIndicator';
import PricingTiers from './PricingTiers';
import SubscriptionFlow from './SubscriptionFlow';
import PurchaseResumeModal from './PurchaseResumeModal';
import UpgradePrompt from './UpgradePrompt';

const BillingDashboard = ({ className = '' }) => {
  const {
    subscription,
    usage,
    plans,
    billingHistory,
    loading,
    error,
    isPremium,
    isAtLimit,
    cancelSubscription,
    fetchBillingHistory,
    paymentProcessing
  } = useBilling();

  const [showSubscriptionFlow, setShowSubscriptionFlow] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Load billing history on mount
  useEffect(() => {
    if (!billingHistory.length) {
      fetchBillingHistory();
    }
  }, []);

  const handleCancelSubscription = async () => {
    try {
      await cancelSubscription(true); // Cancel at period end
      setShowCancelConfirm(false);
    } catch (error) {
      console.error('Cancel failed:', error);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className={`billing-dashboard loading ${className}`}>
        <div className="dashboard-skeleton">
          <div className="skeleton-header"></div>
          <div className="skeleton-cards">
            <div className="skeleton-card"></div>
            <div className="skeleton-card"></div>
            <div className="skeleton-card"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`billing-dashboard ${className}`}>
      {/* Header */}
      <div className="dashboard-header">
        <div className="header-content">
          <h1 className="dashboard-title">Billing & Subscription</h1>
          <p className="dashboard-subtitle">
            Manage your subscription and track usage
          </p>
        </div>

        {/* Quick Actions */}
        <div className="header-actions">
          {!isPremium && (
            <button
              className="upgrade-button"
              onClick={() => setShowSubscriptionFlow(true)}
            >
              🚀 Upgrade to Premium
            </button>
          )}

          {isAtLimit && !isPremium && (
            <button
              className="purchase-button"
              onClick={() => setShowPurchaseModal(true)}
            >
              💳 Buy Resume
            </button>
          )}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="error-banner">
          <span className="error-icon">❌</span>
          <span>{error}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="dashboard-tabs">
        <button
          className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button
          className={`tab-button ${activeTab === 'usage' ? 'active' : ''}`}
          onClick={() => setActiveTab('usage')}
        >
          Usage
        </button>
        <button
          className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          Billing History
        </button>
        <button
          className={`tab-button ${activeTab === 'plans' ? 'active' : ''}`}
          onClick={() => setActiveTab('plans')}
        >
          Plans
        </button>
      </div>

      {/* Tab Content */}
      <div className="tab-content">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="overview-content">
            {/* Current Plan Card */}
            <div className="overview-card current-plan-card">
              <div className="card-header">
                <h3>Current Plan</h3>
                <div className={`plan-badge ${subscription.tier}`}>
                  {subscription.tier === 'premium' ? 'Premium' : 'Free'}
                </div>
              </div>

              <div className="plan-details">
                <div className="plan-info">
                  <div className="plan-price">
                    {subscription.tier === 'premium'
                      ? `${formatCurrency(plans.premium?.price || 6.99)}/month`
                      : 'Free'
                    }
                  </div>
                  <div className="plan-features">
                    {subscription.tier === 'premium' ? (
                      <>
                        <span>✓ 30 resumes per month</span>
                        <span>✓ Premium templates</span>
                        <span>✓ Priority support</span>
                      </>
                    ) : (
                      <>
                        <span>✓ 3 resumes per month</span>
                        <span>✓ Basic templates</span>
                        <span>✓ Standard support</span>
                      </>
                    )}
                  </div>
                </div>

                {isPremium && (
                  <div className="subscription-info">
                    <div className="info-item">
                      <span className="info-label">Status</span>
                      <span className={`info-value status-${subscription.status}`}>
                        {subscription.status === 'active' ? 'Active' : subscription.status}
                      </span>
                    </div>
                    {subscription.currentPeriodEnd && (
                      <div className="info-item">
                        <span className="info-label">Next billing</span>
                        <span className="info-value">
                          {formatDate(subscription.currentPeriodEnd)}
                        </span>
                      </div>
                    )}
                    {subscription.cancelAtPeriodEnd && (
                      <div className="cancel-notice">
                        ⚠️ Subscription will cancel on {formatDate(subscription.currentPeriodEnd)}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Plan Actions */}
              <div className="plan-actions">
                {!isPremium ? (
                  <button
                    className="action-button primary"
                    onClick={() => setShowSubscriptionFlow(true)}
                  >
                    Upgrade to Premium
                  </button>
                ) : (
                  <div className="premium-actions">
                    {!subscription.cancelAtPeriodEnd ? (
                      <button
                        className="action-button secondary"
                        onClick={() => setShowCancelConfirm(true)}
                        disabled={paymentProcessing}
                      >
                        Cancel Subscription
                      </button>
                    ) : (
                      <button
                        className="action-button primary"
                        onClick={() => {/* Reactivate subscription */}}
                        disabled={paymentProcessing}
                      >
                        Reactivate Subscription
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Usage Card */}
            <div className="overview-card usage-card">
              <div className="card-header">
                <h3>Usage This Month</h3>
              </div>

              <UsageIndicator
                showDetails={true}
                size="large"
                className="dashboard-usage"
              />

              {isAtLimit && !isPremium && (
                <div className="usage-actions">
                  <button
                    className="action-button primary"
                    onClick={() => setShowPurchaseModal(true)}
                  >
                    Buy Additional Resume
                  </button>
                  <button
                    className="action-button secondary"
                    onClick={() => setShowSubscriptionFlow(true)}
                  >
                    Upgrade Plan
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Usage Tab */}
        {activeTab === 'usage' && (
          <div className="usage-content">
            <div className="usage-stats-card">
              <h3>Detailed Usage Statistics</h3>

              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{usage.resumeCountUsed}</div>
                  <div className="stat-label">Resumes Used</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{usage.resumeCountRemaining}</div>
                  <div className="stat-label">Remaining</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{usage.resumeCountLimit}</div>
                  <div className="stat-label">Monthly Limit</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">
                    {usage.resetDate ? formatDate(usage.resetDate) : 'N/A'}
                  </div>
                  <div className="stat-label">Resets On</div>
                </div>
              </div>

              <UsageIndicator
                showDetails={true}
                size="large"
                className="detailed-usage"
              />
            </div>
          </div>
        )}

        {/* Billing History Tab */}
        {activeTab === 'history' && (
          <div className="history-content">
            <div className="history-card">
              <h3>Billing History</h3>

              {billingHistory.length > 0 ? (
                <div className="transactions-list">
                  {billingHistory.map((transaction, index) => (
                    <div key={index} className="transaction-item">
                      <div className="transaction-info">
                        <div className="transaction-description">
                          {transaction.description}
                        </div>
                        <div className="transaction-date">
                          {formatDate(transaction.date)}
                        </div>
                      </div>
                      <div className="transaction-amount">
                        {formatCurrency(transaction.amount)}
                      </div>
                      <div className={`transaction-status ${transaction.status}`}>
                        {transaction.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-history">
                  <div className="empty-icon">📄</div>
                  <div className="empty-text">No billing history yet</div>
                  <div className="empty-subtext">
                    Transactions will appear here after your first purchase
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Plans Tab */}
        {activeTab === 'plans' && (
          <div className="plans-content">
            <PricingTiers
              onSelectPlan={(planId) => {
                if (planId === 'premium') {
                  setShowSubscriptionFlow(true);
                }
              }}
              currentPlan={subscription.tier}
              showCurrentPlan={true}
              layout="horizontal"
              className="dashboard-pricing"
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <SubscriptionFlow
        open={showSubscriptionFlow}
        onOpenChange={setShowSubscriptionFlow}
        initialPlan="premium"
      />

      <PurchaseResumeModal
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        credits={1}
      />

      <UpgradePrompt
        open={showUpgradePrompt}
        onOpenChange={setShowUpgradePrompt}
        trigger="custom"
        title="Upgrade Your Plan"
        message="Get more features and higher limits with Premium"
      />

      {/* Cancel Confirmation Dialog */}
      {showCancelConfirm && (
        <div className="modal-overlay" onClick={() => setShowCancelConfirm(false)}>
          <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Cancel Subscription?</h3>
            <p>
              Your subscription will remain active until {formatDate(subscription.currentPeriodEnd)}.
              You'll keep access to Premium features until then.
            </p>
            <div className="confirm-actions">
              <button
                className="confirm-button danger"
                onClick={handleCancelSubscription}
                disabled={paymentProcessing}
              >
                {paymentProcessing ? 'Processing...' : 'Yes, Cancel'}
              </button>
              <button
                className="confirm-button secondary"
                onClick={() => setShowCancelConfirm(false)}
              >
                Keep Subscription
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .billing-dashboard {
          max-width: 1200px;
          margin: 0 auto;
          padding: 24px;
        }

        .billing-dashboard.loading {
          opacity: 0.6;
        }

        .dashboard-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 32px;
          padding-bottom: 16px;
          border-bottom: 1px solid #e9ecef;
        }

        .header-content h1 {
          font-size: 2rem;
          font-weight: 700;
          color: #212529;
          margin-bottom: 4px;
        }

        .header-content p {
          color: #6c757d;
          margin: 0;
        }

        .header-actions {
          display: flex;
          gap: 12px;
        }

        .upgrade-button,
        .purchase-button {
          padding: 10px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .upgrade-button {
          background: #007bff;
          color: white;
        }

        .upgrade-button:hover {
          background: #0056b3;
        }

        .purchase-button {
          background: #28a745;
          color: white;
        }

        .purchase-button:hover {
          background: #1e7e34;
        }

        .error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 6px;
          color: #721c24;
          margin-bottom: 24px;
        }

        .dashboard-tabs {
          display: flex;
          border-bottom: 1px solid #e9ecef;
          margin-bottom: 24px;
        }

        .tab-button {
          padding: 12px 24px;
          border: none;
          background: none;
          color: #6c757d;
          cursor: pointer;
          border-bottom: 3px solid transparent;
          transition: all 0.2s ease;
        }

        .tab-button.active {
          color: #007bff;
          border-bottom-color: #007bff;
        }

        .tab-button:hover:not(.active) {
          color: #495057;
        }

        .tab-content {
          min-height: 400px;
        }

        .overview-content {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .overview-card {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 24px;
        }

        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .card-header h3 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #212529;
          margin: 0;
        }

        .plan-badge {
          padding: 4px 12px;
          border-radius: 20px;
          font-size: 0.8rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .plan-badge.free {
          background: #e9ecef;
          color: #495057;
        }

        .plan-badge.premium {
          background: #007bff;
          color: white;
        }

        .plan-details {
          margin-bottom: 24px;
        }

        .plan-price {
          font-size: 1.5rem;
          font-weight: 700;
          color: #212529;
          margin-bottom: 8px;
        }

        .plan-features {
          display: flex;
          flex-direction: column;
          gap: 4px;
          margin-bottom: 16px;
        }

        .plan-features span {
          font-size: 0.9rem;
          color: #495057;
        }

        .subscription-info {
          background: #f8f9fa;
          border-radius: 6px;
          padding: 12px;
        }

        .info-item {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
        }

        .info-label {
          color: #6c757d;
          font-size: 0.875rem;
        }

        .info-value {
          font-weight: 500;
          color: #212529;
          font-size: 0.875rem;
        }

        .status-active {
          color: #28a745;
        }

        .cancel-notice {
          margin-top: 8px;
          padding: 8px;
          background: #fff3cd;
          border: 1px solid #ffc107;
          border-radius: 4px;
          font-size: 0.875rem;
          color: #856404;
        }

        .plan-actions,
        .usage-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .action-button {
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .action-button.primary {
          background: #007bff;
          color: white;
        }

        .action-button.primary:hover {
          background: #0056b3;
        }

        .action-button.secondary {
          background: none;
          color: #6c757d;
          border: 1px solid #6c757d;
        }

        .action-button.secondary:hover {
          background: #6c757d;
          color: white;
        }

        .usage-content,
        .history-content,
        .plans-content {
          max-width: 800px;
        }

        .usage-stats-card,
        .history-card {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 24px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 20px;
          margin-bottom: 24px;
        }

        .stat-item {
          text-align: center;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .stat-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #007bff;
          margin-bottom: 4px;
        }

        .stat-label {
          font-size: 0.875rem;
          color: #6c757d;
        }

        .transactions-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .transaction-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          background: #f8f9fa;
          border-radius: 8px;
        }

        .transaction-info {
          flex: 1;
        }

        .transaction-description {
          font-weight: 500;
          color: #212529;
          margin-bottom: 4px;
        }

        .transaction-date {
          font-size: 0.875rem;
          color: #6c757d;
        }

        .transaction-amount {
          font-weight: 600;
          color: #212529;
        }

        .transaction-status {
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.8rem;
          font-weight: 500;
          text-transform: uppercase;
        }

        .transaction-status.paid {
          background: #d4edda;
          color: #155724;
        }

        .transaction-status.pending {
          background: #fff3cd;
          color: #856404;
        }

        .empty-history {
          text-align: center;
          padding: 40px;
        }

        .empty-icon {
          font-size: 2.5rem;
          margin-bottom: 12px;
        }

        .empty-text {
          font-weight: 500;
          color: #495057;
          margin-bottom: 4px;
        }

        .empty-subtext {
          font-size: 0.875rem;
          color: #6c757d;
        }

        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }

        .confirm-dialog {
          background: white;
          border-radius: 12px;
          padding: 24px;
          max-width: 400px;
          width: 90%;
        }

        .confirm-dialog h3 {
          margin-bottom: 12px;
          color: #212529;
        }

        .confirm-dialog p {
          color: #6c757d;
          margin-bottom: 20px;
        }

        .confirm-actions {
          display: flex;
          gap: 12px;
        }

        .confirm-button {
          flex: 1;
          padding: 10px 16px;
          border: none;
          border-radius: 6px;
          font-weight: 500;
          cursor: pointer;
        }

        .confirm-button.danger {
          background: #dc3545;
          color: white;
        }

        .confirm-button.secondary {
          background: #6c757d;
          color: white;
        }

        .dashboard-skeleton {
          animation: pulse 1.5s ease-in-out infinite;
        }

        .skeleton-header {
          height: 60px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 24px;
        }

        .skeleton-cards {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 24px;
        }

        .skeleton-card {
          height: 200px;
          background: #f8f9fa;
          border-radius: 12px;
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }

        @media (max-width: 768px) {
          .billing-dashboard {
            padding: 16px;
          }

          .dashboard-header {
            flex-direction: column;
            gap: 16px;
            align-items: flex-start;
          }

          .header-actions {
            width: 100%;
          }

          .overview-content {
            grid-template-columns: 1fr;
          }

          .dashboard-tabs {
            overflow-x: auto;
          }

          .tab-button {
            white-space: nowrap;
            min-width: 120px;
          }

          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .skeleton-cards {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
};

export default BillingDashboard;