/**
 * UpgradePrompt Component
 * =======================
 *
 * Modal dialog that appears when users hit their usage limits.
 * Offers upgrade to Premium or one-time resume purchase options.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBilling } from '../../contexts/BillingContext';
import PricingTiers from './PricingTiers';

const UpgradePrompt = ({
  open,
  onOpenChange,
  trigger = 'limit', // 'limit' | 'custom'
  title = null,
  message = null,
  showOneTimePurchase = true,
  className = ''
}) => {
  const {
    subscription,
    usage,
    oneTimePurchases,
    isPremium,
    purchaseResumeCredits,
    paymentProcessing,
    error
  } = useBilling();

  const [selectedOption, setSelectedOption] = useState('upgrade'); // 'upgrade' | 'purchase'
  const [purchasing, setPurchasing] = useState(false);

  const getTriggerContent = () => {
    switch (trigger) {
      case 'limit':
        return {
          title: 'Resume Limit Reached',
          message: `You've used all ${usage.resumeCountLimit} resumes in your ${subscription.tier} plan.`,
          urgency: 'high'
        };
      default:
        return {
          title: title || 'Upgrade Your Plan',
          message: message || 'Get access to more features and higher limits.',
          urgency: 'medium'
        };
    }
  };

  const { title: modalTitle, message: modalMessage, urgency } = getTriggerContent();

  const handleOneTimePurchase = async () => {
    try {
      setPurchasing(true);

      // This would integrate with Stripe Payment Intent
      const result = await purchaseResumeCredits(1);

      if (result) {
        // Show success and close modal
        onOpenChange(false);
      }
    } catch (error) {
      console.error('Purchase failed:', error);
    } finally {
      setPurchasing(false);
    }
  };

  const handlePlanSelect = (planId, plan) => {
    if (planId === 'premium') {
      // This would trigger the subscription flow
      console.log('Starting premium upgrade flow...');
      // onOpenChange(false);
    }
  };

  const oneTimePrice = oneTimePurchases?.additionalResume?.price || 2.99;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content upgrade-prompt ${urgency} ${className}`}>

          {/* Header */}
          <div className="prompt-header">
            <Dialog.Title className="prompt-title">
              {modalTitle}
            </Dialog.Title>

            <Dialog.Description className="prompt-message">
              {modalMessage}
            </Dialog.Description>

            {urgency === 'high' && (
              <div className="urgency-indicator">
                <span className="urgency-icon">⚠️</span>
                <span>Upgrade now to continue generating resumes</span>
              </div>
            )}
          </div>

          {/* Options Tabs */}
          {showOneTimePurchase && !isPremium && (
            <div className="options-tabs">
              <button
                className={`tab-button ${selectedOption === 'upgrade' ? 'active' : ''}`}
                onClick={() => setSelectedOption('upgrade')}
              >
                <span className="tab-icon">🚀</span>
                <span>Upgrade Plan</span>
                <span className="tab-badge">Best Value</span>
              </button>

              <button
                className={`tab-button ${selectedOption === 'purchase' ? 'active' : ''}`}
                onClick={() => setSelectedOption('purchase')}
              >
                <span className="tab-icon">🎯</span>
                <span>Buy 1 Resume</span>
                <span className="tab-price">${oneTimePrice}</span>
              </button>
            </div>
          )}

          {/* Content */}
          <div className="prompt-content">
            {selectedOption === 'upgrade' || isPremium ? (
              <div className="upgrade-section">
                <PricingTiers
                  onSelectPlan={handlePlanSelect}
                  layout="vertical"
                  showCurrentPlan={false}
                  className="modal-pricing"
                />
              </div>
            ) : (
              <div className="purchase-section">
                <div className="purchase-card">
                  <div className="purchase-header">
                    <h4>Quick Resume Purchase</h4>
                    <p>Get 1 additional resume generation for ${oneTimePrice}</p>
                  </div>

                  <div className="purchase-benefits">
                    <div className="benefit-item">
                      <span className="benefit-icon">✓</span>
                      <span>Instant access to generate 1 more resume</span>
                    </div>
                    <div className="benefit-item">
                      <span className="benefit-icon">✓</span>
                      <span>No subscription required</span>
                    </div>
                    <div className="benefit-item">
                      <span className="benefit-icon">✓</span>
                      <span>Same high-quality AI generation</span>
                    </div>
                  </div>

                  <button
                    className="purchase-button"
                    onClick={handleOneTimePurchase}
                    disabled={purchasing || paymentProcessing}
                  >
                    {purchasing ? (
                      <span className="button-loading">
                        <span className="spinner"></span>
                        Processing...
                      </span>
                    ) : (
                      `Buy 1 Resume - $${oneTimePrice}`
                    )}
                  </button>

                  <div className="purchase-note">
                    <span>💡 Tip: Premium plan offers better value for regular use</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <span className="error-icon">❌</span>
              <span>{error}</span>
            </div>
          )}

          {/* Footer */}
          <div className="prompt-footer">
            <Dialog.Close asChild>
              <button className="close-button">
                Maybe Later
              </button>
            </Dialog.Close>
          </div>

          {/* Close Button */}
          <Dialog.Close asChild>
            <button className="close-icon" aria-label="Close">
              ✕
            </button>
          </Dialog.Close>

          <style jsx>{`
            .dialog-overlay {
              background: rgba(0, 0, 0, 0.6);
              position: fixed;
              inset: 0;
              animation: overlayShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
              z-index: 1000;
            }

            .dialog-content {
              background: white;
              border-radius: 12px;
              box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
              position: fixed;
              top: 50%;
              left: 50%;
              transform: translate(-50%, -50%);
              width: 90vw;
              max-width: 600px;
              max-height: 90vh;
              overflow-y: auto;
              padding: 0;
              animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
              z-index: 1001;
            }

            .upgrade-prompt.high {
              border: 2px solid #dc3545;
            }

            .prompt-header {
              padding: 24px 24px 16px 24px;
              border-bottom: 1px solid #e9ecef;
            }

            .prompt-title {
              font-size: 1.5rem;
              font-weight: 700;
              color: #212529;
              margin-bottom: 8px;
            }

            .prompt-message {
              font-size: 1rem;
              color: #6c757d;
              margin-bottom: 16px;
            }

            .urgency-indicator {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 8px 12px;
              background: #fff3cd;
              border: 1px solid #ffc107;
              border-radius: 6px;
              font-size: 0.875rem;
              color: #856404;
            }

            .urgency-icon {
              font-size: 1rem;
            }

            .options-tabs {
              display: flex;
              padding: 0 24px;
              border-bottom: 1px solid #e9ecef;
            }

            .tab-button {
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 4px;
              padding: 16px 12px;
              border: none;
              background: none;
              cursor: pointer;
              border-bottom: 3px solid transparent;
              transition: all 0.2s ease;
              position: relative;
            }

            .tab-button.active {
              border-bottom-color: #007bff;
              background: #f8f9fa;
            }

            .tab-button:hover:not(.active) {
              background: #f8f9fa;
            }

            .tab-icon {
              font-size: 1.25rem;
            }

            .tab-badge {
              position: absolute;
              top: 8px;
              right: 8px;
              padding: 2px 6px;
              background: #28a745;
              color: white;
              border-radius: 4px;
              font-size: 0.7rem;
              font-weight: 600;
            }

            .tab-price {
              font-size: 0.875rem;
              font-weight: 600;
              color: #007bff;
            }

            .prompt-content {
              padding: 24px;
            }

            .purchase-card {
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 20px;
              text-align: center;
            }

            .purchase-header h4 {
              font-size: 1.25rem;
              font-weight: 600;
              color: #212529;
              margin-bottom: 8px;
            }

            .purchase-header p {
              color: #6c757d;
              margin-bottom: 16px;
            }

            .purchase-benefits {
              margin-bottom: 20px;
            }

            .benefit-item {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 4px 0;
              font-size: 0.9rem;
              color: #495057;
            }

            .benefit-icon {
              color: #28a745;
              font-weight: bold;
            }

            .purchase-button {
              width: 100%;
              padding: 12px 24px;
              background: #007bff;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
              transition: background-color 0.2s ease;
              margin-bottom: 12px;
            }

            .purchase-button:hover:not(:disabled) {
              background: #0056b3;
            }

            .purchase-button:disabled {
              opacity: 0.6;
              cursor: not-allowed;
            }

            .button-loading {
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 8px;
            }

            .spinner {
              width: 16px;
              height: 16px;
              border: 2px solid transparent;
              border-top: 2px solid currentColor;
              border-radius: 50%;
              animation: spin 1s linear infinite;
            }

            .purchase-note {
              font-size: 0.875rem;
              color: #6c757d;
              padding: 8px;
              background: #f8f9fa;
              border-radius: 6px;
            }

            .error-message {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 24px;
              background: #f8d7da;
              border-top: 1px solid #f5c6cb;
              color: #721c24;
              font-size: 0.875rem;
            }

            .prompt-footer {
              padding: 16px 24px;
              border-top: 1px solid #e9ecef;
              text-align: center;
            }

            .close-button {
              padding: 8px 16px;
              background: none;
              border: 1px solid #6c757d;
              border-radius: 6px;
              color: #6c757d;
              cursor: pointer;
              transition: all 0.2s ease;
            }

            .close-button:hover {
              background: #6c757d;
              color: white;
            }

            .close-icon {
              position: absolute;
              top: 16px;
              right: 16px;
              background: none;
              border: none;
              color: #6c757d;
              cursor: pointer;
              font-size: 1.25rem;
              padding: 4px;
              border-radius: 4px;
              transition: all 0.2s ease;
            }

            .close-icon:hover {
              background: #f8f9fa;
              color: #212529;
            }

            @keyframes overlayShow {
              from {
                opacity: 0;
              }
              to {
                opacity: 1;
              }
            }

            @keyframes contentShow {
              from {
                opacity: 0;
                transform: translate(-50%, -48%) scale(0.96);
              }
              to {
                opacity: 1;
                transform: translate(-50%, -50%) scale(1);
              }
            }

            @keyframes spin {
              to {
                transform: rotate(360deg);
              }
            }

            @media (max-width: 768px) {
              .dialog-content {
                width: 95vw;
                max-height: 95vh;
              }

              .options-tabs {
                flex-direction: column;
                padding: 0;
              }

              .tab-button {
                border-bottom: 1px solid #e9ecef;
                border-right: none;
              }

              .tab-button.active {
                border-bottom-color: #e9ecef;
                border-left: 3px solid #007bff;
              }
            }
          `}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default UpgradePrompt;