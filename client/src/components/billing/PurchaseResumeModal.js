/**
 * PurchaseResumeModal Component
 * =============================
 *
 * Modal for one-time resume credit purchases.
 * Quick checkout flow for users who need additional resumes.
 */

import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { useBilling } from '../../contexts/BillingContext';
import StripeProvider from './StripeProvider';
import PaymentForm from './PaymentForm';

const PurchaseResumeModal = ({
  open,
  onOpenChange,
  credits = 1,
  className = ''
}) => {
  const {
    oneTimePurchases,
    purchaseResumeCredits,
    paymentProcessing,
    error,
    clearError,
    usage
  } = useBilling();

  const [step, setStep] = useState(1); // 1: Confirm, 2: Payment, 3: Success
  const [purchaseResult, setPurchaseResult] = useState(null);

  const resumeProduct = oneTimePurchases?.additionalResume;
  const totalPrice = resumeProduct ? resumeProduct.price * credits : 2.99 * credits;

  const handlePaymentSubmit = async (paymentResult) => {
    try {
      clearError();

      const result = await purchaseResumeCredits(credits);
      setPurchaseResult(result);
      setStep(3);

    } catch (error) {
      console.error('Purchase failed:', error);
      // Error handled by billing context
    }
  };

  const handleClose = () => {
    setStep(1);
    setPurchaseResult(null);
    clearError();
    onOpenChange(false);
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="step-content">
            <div className="confirm-header">
              <h2>Purchase Resume Credits</h2>
              <p>Get additional resume generation credits instantly</p>
            </div>

            <div className="purchase-summary">
              <div className="summary-icon">📄</div>
              <div className="summary-details">
                <div className="summary-title">
                  {credits} Additional Resume{credits > 1 ? 's' : ''}
                </div>
                <div className="summary-price">
                  ${totalPrice.toFixed(2)} total
                </div>
              </div>
            </div>

            <div className="benefits-list">
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Instant access - use immediately</span>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Same AI-powered quality</span>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>No subscription required</span>
              </div>
              <div className="benefit-item">
                <span className="benefit-icon">✓</span>
                <span>Never expires</span>
              </div>
            </div>

            <div className="current-usage">
              <div className="usage-info">
                Current usage: {usage.resumeCountUsed}/{usage.resumeCountLimit} resumes
              </div>
              <div className="after-purchase">
                After purchase: {usage.resumeCountUsed}/{usage.resumeCountLimit + credits} resumes
              </div>
            </div>

            <div className="confirm-actions">
              <button
                className="proceed-button"
                onClick={() => setStep(2)}
              >
                Proceed to Payment
              </button>
              <button
                className="cancel-button"
                onClick={handleClose}
              >
                Cancel
              </button>
            </div>
          </div>
        );

      case 2:
        return (
          <div className="step-content">
            <div className="payment-header">
              <h2>Complete Your Purchase</h2>
              <p>Secure payment powered by Stripe</p>
            </div>

            <div className="payment-summary">
              <div className="summary-row">
                <span>Resume Credits ({credits})</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              <div className="summary-total">
                <span>Total</span>
                <span>${totalPrice.toFixed(2)}</span>
              </div>
            </div>

            <StripeProvider>
              <PaymentForm
                onSubmit={handlePaymentSubmit}
                amount={totalPrice * 100} // Convert to cents
                description={`${credits} Resume Credit${credits > 1 ? 's' : ''}`}
                submitText="Complete Purchase"
                processing={paymentProcessing}
                showAmount={false} // We show it above
                className="resume-payment"
              />
            </StripeProvider>

            <button
              className="back-button"
              onClick={() => setStep(1)}
              disabled={paymentProcessing}
            >
              ← Back
            </button>
          </div>
        );

      case 3:
        return (
          <div className="step-content">
            <div className="success-content">
              <div className="success-icon">🎉</div>
              <h2>Purchase Successful!</h2>
              <p>Your resume credits have been added to your account.</p>

              <div className="success-summary">
                <div className="success-item">
                  <span className="success-label">Credits Added</span>
                  <span className="success-value">{credits} resume{credits > 1 ? 's' : ''}</span>
                </div>
                <div className="success-item">
                  <span className="success-label">Amount Paid</span>
                  <span className="success-value">${totalPrice.toFixed(2)}</span>
                </div>
                <div className="success-item">
                  <span className="success-label">New Limit</span>
                  <span className="success-value">{usage.resumeCountLimit + credits} resumes</span>
                </div>
              </div>

              <div className="success-actions">
                <button
                  className="primary-button"
                  onClick={handleClose}
                >
                  Start Creating Resumes
                </button>
              </div>

              <div className="success-note">
                <span>💡 Your credits never expire and can be used anytime</span>
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
        <Dialog.Content className={`dialog-content purchase-modal ${className}`}>

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
              max-width: 500px;
              max-height: 90vh;
              overflow-y: auto;
              padding: 24px;
              animation: contentShow 150ms cubic-bezier(0.16, 1, 0.3, 1);
              z-index: 1001;
            }

            .step-content {
              min-height: 300px;
            }

            .confirm-header,
            .payment-header {
              text-align: center;
              margin-bottom: 24px;
            }

            .confirm-header h2,
            .payment-header h2 {
              font-size: 1.5rem;
              font-weight: 700;
              color: #212529;
              margin-bottom: 8px;
            }

            .confirm-header p,
            .payment-header p {
              font-size: 1rem;
              color: #6c757d;
              margin: 0;
            }

            .purchase-summary {
              display: flex;
              align-items: center;
              gap: 16px;
              padding: 20px;
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              margin-bottom: 20px;
            }

            .summary-icon {
              font-size: 2.5rem;
            }

            .summary-details {
              flex: 1;
            }

            .summary-title {
              font-size: 1.125rem;
              font-weight: 600;
              color: #212529;
              margin-bottom: 4px;
            }

            .summary-price {
              font-size: 1.5rem;
              font-weight: 700;
              color: #007bff;
            }

            .benefits-list {
              margin-bottom: 20px;
            }

            .benefit-item {
              display: flex;
              align-items: center;
              gap: 8px;
              padding: 6px 0;
              font-size: 0.9rem;
              color: #495057;
            }

            .benefit-icon {
              color: #28a745;
              font-weight: bold;
              font-size: 1rem;
            }

            .current-usage {
              background: #e3f2fd;
              border: 1px solid #bbdefb;
              border-radius: 6px;
              padding: 12px;
              margin-bottom: 24px;
              font-size: 0.875rem;
            }

            .usage-info {
              color: #1976d2;
              margin-bottom: 4px;
            }

            .after-purchase {
              color: #388e3c;
              font-weight: 500;
            }

            .confirm-actions {
              display: flex;
              flex-direction: column;
              gap: 12px;
            }

            .proceed-button {
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
            }

            .proceed-button:hover {
              background: #0056b3;
            }

            .cancel-button {
              width: 100%;
              padding: 10px 24px;
              background: none;
              color: #6c757d;
              border: 1px solid #6c757d;
              border-radius: 8px;
              font-size: 1rem;
              cursor: pointer;
              transition: all 0.2s ease;
            }

            .cancel-button:hover {
              background: #6c757d;
              color: white;
            }

            .payment-summary {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
            }

            .summary-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 8px 0;
              border-bottom: 1px solid #e9ecef;
            }

            .summary-total {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 12px 0 4px;
              font-weight: 600;
              font-size: 1.125rem;
              color: #212529;
            }

            .resume-payment {
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
              padding: 20px 0;
            }

            .success-icon {
              font-size: 3rem;
              margin-bottom: 16px;
            }

            .success-content h2 {
              font-size: 1.5rem;
              font-weight: 700;
              color: #212529;
              margin-bottom: 12px;
            }

            .success-content p {
              font-size: 1rem;
              color: #6c757d;
              margin-bottom: 24px;
            }

            .success-summary {
              background: #f8f9fa;
              border: 1px solid #e9ecef;
              border-radius: 8px;
              padding: 16px;
              margin-bottom: 24px;
            }

            .success-item {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 6px 0;
            }

            .success-label {
              color: #6c757d;
            }

            .success-value {
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
              padding: 12px;
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

              .purchase-summary {
                flex-direction: column;
                text-align: center;
                gap: 12px;
              }

              .summary-icon {
                font-size: 2rem;
              }
            }
          `}</style>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default PurchaseResumeModal;