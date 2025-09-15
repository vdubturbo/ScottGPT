/**
 * SubscriptionFlow Component
 * ==========================
 *
 * Multi-step subscription upgrade flow with Stripe integration.
 * Handles plan selection, payment method, and confirmation.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBilling } from '../../contexts/BillingContext';
import StripeProvider from './StripeProvider';
import PaymentForm from './PaymentForm';
import PricingTiers from './PricingTiers';

const SubscriptionFlow = ({
  open,
  onOpenChange,
  initialPlan = 'premium',
  className = ''
}) => {
  const {
    plans,
    createSubscription,
    paymentProcessing,
    error,
    clearError
  } = useBilling();

  const [step, setStep] = useState(1); // 1: Plan, 2: Payment, 3: Confirmation
  const [selectedPlan, setSelectedPlan] = useState(initialPlan);
  const [subscriptionResult, setSubscriptionResult] = useState(null);

  const handlePlanSelect = (planId, plan) => {
    setSelectedPlan(planId);
    if (planId === 'premium') {
      setStep(2);
    }
  };

  const handlePaymentSubmit = async (paymentResult) => {
    try {
      clearError();

      const plan = plans[selectedPlan];
      if (!plan?.stripePriceId) {
        throw new Error('Plan price ID not configured');
      }

      const result = await createSubscription(
        plan.stripePriceId,
        paymentResult.paymentMethod?.id
      );

      setSubscriptionResult(result);
      setStep(3);

    } catch (error) {
      console.error('Subscription creation failed:', error);
      // Error will be handled by the billing context
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedPlan(initialPlan);
    setSubscriptionResult(null);
    clearError();
    onOpenChange(false);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="step-content">
            <div className="step-header">
              <h2>Choose Your Plan</h2>
              <p>Select the plan that best fits your needs</p>
            </div>

            <PricingTiers
              onSelectPlan={handlePlanSelect}
              currentPlan={selectedPlan}
              layout="vertical"
              className="flow-pricing"
            />
          </div>
        );

      case 2:
        const selectedPlanData = plans[selectedPlan];
        return (
          <div className="step-content">
            <div className="step-header">
              <h2>Payment Information</h2>
              <p>Complete your upgrade to {selectedPlanData?.name}</p>
            </div>

            <div className="plan-summary">
              <div className="summary-item">
                <span className="summary-label">Plan</span>
                <span className="summary-value">{selectedPlanData?.name}</span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Price</span>
                <span className="summary-value">
                  ${selectedPlanData?.price}/month
                </span>
              </div>
              <div className="summary-item">
                <span className="summary-label">Resume Limit</span>
                <span className="summary-value">
                  {selectedPlanData?.resumeLimit} per month
                </span>
              </div>
            </div>

            <StripeProvider>
              <PaymentForm
                onSubmit={handlePaymentSubmit}
                amount={selectedPlanData?.price * 100} // Convert to cents
                description={`${selectedPlanData?.name} subscription`}
                submitText="Start Subscription"
                processing={paymentProcessing}
                showAmount={true}
                className="subscription-payment"
              />
            </StripeProvider>

            <button
              className="back-button"
              onClick={() => setStep(1)}
              disabled={paymentProcessing}
            >
              ← Back to Plans
            </button>
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <div className="success-content">
              <div className="success-icon">🎉</div>
              <h2>Welcome to Premium!</h2>
              <p>Your subscription has been activated successfully.</p>

              <div className="success-details">
                <div className="detail-item">
                  <span className="detail-label">Plan</span>
                  <span className="detail-value">{plans[selectedPlan]?.name}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Monthly Resumes</span>
                  <span className="detail-value">{plans[selectedPlan]?.resumeLimit}</span>
                </div>
                <div className="detail-item">
                  <span className="detail-label">Next Billing</span>
                  <span className="detail-value">
                    {subscriptionResult?.currentPeriodEnd &&
                      new Date(subscriptionResult.currentPeriodEnd).toLocaleDateString()
                    }
                  </span>
                </div>
              </div>

              <div className="success-actions">
                <button
                  className="primary-button"
                  onClick={handleClose}
                >
                  Start Using Premium
                </button>
              </div>

              <div className="success-note">
                <span>💡 You can manage your subscription anytime in your billing dashboard</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className={`dialog-content subscription-flow ${className}`}>

          {/* Progress Indicator */}
          <div className="progress-indicator">
            <div className={`progress-step ${step >= 1 ? 'active' : ''} ${step > 1 ? 'completed' : ''}`}>
              <div className="step-number">1</div>
              <div className="step-label">Plan</div>
            </div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step >= 2 ? 'active' : ''} ${step > 2 ? 'completed' : ''}`}>
              <div className="step-number">2</div>
              <div className="step-label">Payment</div>
            </div>
            <div className="progress-line"></div>
            <div className={`progress-step ${step >= 3 ? 'active' : ''}`}>
              <div className="step-number">3</div>
              <div className="step-label">Complete</div>
            </div>
          </div>

          {/* Step Content */}
          {renderStep()}

          {/* Error Message */}
          {error && (
            <div className="error-message">
              <span className="error-icon">❌</span>
              <span>{error}</span>
            </div>
          )}

          {/* Close Button */}
          <Dialog.Close asChild>
            <button className="close-icon" aria-label="Close" onClick={handleClose}>
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
              max-width: 700px;
              max-height: 90vh;
              overflow-y: auto;
              padding: 24px;
              animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
              z-index: 1001;
            }

            .progress-indicator {
              display: flex;
              align-items: center;
              justify-content: center;
              margin-bottom: 32px;
              padding: 0 20px;
            }

            .progress-step {
              display: flex;
              flex-direction: column;
              align-items: center;
              gap: 8px;
            }

            .step-number {
              width: 40px;
              height: 40px;
              border-radius: 50%;
              background: #e9ecef;
              color: #6c757d;
              display: flex;
              align-items: center;
              justify-content: center;
              font-weight: 600;
              transition: all 0.2s ease;
            }

            .progress-step.active .step-number {
              background: #007bff;
              color: white;
            }

            .progress-step.completed .step-number {
              background: #28a745;
              color: white;
            }

            .step-label {
              font-size: 0.875rem;
              color: #6c757d;
              font-weight: 500;
            }

            .progress-step.active .step-label {
              color: #007bff;
            }

            .progress-step.completed .step-label {
              color: #28a745;
            }

            .progress-line {
              width: 60px;
              height: 2px;
              background: #e9ecef;
              margin: 0 12px;
            }

            .step-content {
              min-height: 400px;
            }

            .step-header {
              text-align: center;
              margin-bottom: 24px;
            }

            .step-header h2 {
              font-size: 1.75rem;
              font-weight: 700;
              color: #212529;
              margin-bottom: 8px;
            }

            .step-header p {
              font-size: 1rem;
              color: #6c757d;
              margin: 0;
            }

            .plan-summary {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 24px;
            }

            .summary-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #e9ecef;
            }

            .summary-item:last-child {
              border-bottom: none;
            }

            .summary-label {
              font-weight: 500;
              color: #495057;
            }

            .summary-value {
              font-weight: 600;
              color: #212529;
            }

            .subscription-payment {
              margin: 0 auto;
            }

            .back-button {
              display: block;
              margin: 16px auto 0;
              padding: 8px 16px;
              background: none;
              border: 1px solid #6c757d;
              border-radius: 6px;
              color: #6c757d;
              cursor: pointer;
              transition: all 0.2s ease;
            }

            .back-button:hover:not(:disabled) {
              background: #6c757d;
              color: white;
            }

            .back-button:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            .success-content {
              text-align: center;
              padding: 20px;
            }

            .success-icon {
              font-size: 3rem;
              margin-bottom: 16px;
            }

            .success-content h2 {
              font-size: 1.75rem;
              font-weight: 700;
              color: #212529;
              margin-bottom: 12px;
            }

            .success-content p {
              font-size: 1rem;
              color: #6c757d;
              margin-bottom: 24px;
            }

            .success-details {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
            }

            .detail-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 6px 0;
            }

            .detail-label {
              color: #6c757d;
            }

            .detail-value {
              font-weight: 600;
              color: #212529;
            }

            .success-actions {
              margin-bottom: 16px;
            }

            .primary-button {
              padding: 12px 32px;
              background: #28a745;
              color: white;
              border: none;
              border-radius: 8px;
              font-size: 1rem;
              font-weight: 600;
              cursor: pointer;
              transition: background-color 0.2s ease;
            }

            .primary-button:hover {
              background: #1e7e34;
            }

            .success-note {
              font-size: 0.875rem;
              color: #6c757d;
              padding: 12px;
              background: #e3f2fd;
              border-radius: 6px;
            }

            .error-message {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 12px 24px;
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              border-radius: 6px;
              color: #721c24;
              font-size: 0.875rem;
              margin-top: 16px;
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
              from { opacity: 0; }
              to { opacity: 1; }
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

            @media (max-width: 768px) {
              .dialog-content {
                width: 95vw;
                padding: 16px;
              }

              .progress-indicator {
                margin-bottom: 24px;
                padding: 0 10px;
              }

              .step-number {
                width: 32px;
                height: 32px;
                font-size: 0.875rem;
              }

              .progress-line {
                width: 40px;
                margin: 0 8px;
              }

              .step-label {
                font-size: 0.75rem;
              }

              .step-header h2 {
                font-size: 1.5rem;
              }
            }
          `}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default SubscriptionFlow;