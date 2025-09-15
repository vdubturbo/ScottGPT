/**
 * PaymentForm Component
 * =====================
 *
 * Stripe Elements payment form for handling card payments.
 * Used for both subscriptions and one-time purchases.
 */

import React, { useState } from 'react';
import {
  useStripe,
  useElements,
  CardElement,
  PaymentElement
} from '@stripe/react-stripe-js';

const PaymentForm = ({
  onSubmit,
  onError,
  amount = null,
  description = '',
  submitText = 'Pay',
  processing = false,
  disabled = false,
  showAmount = true,
  className = '',
  usePaymentElement = false // Use new PaymentElement vs CardElement
}) => {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [cardComplete, setCardComplete] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!stripe || !elements || processing || isProcessing) {
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      let result;

      if (usePaymentElement) {
        // Use the new PaymentElement
        const paymentElement = elements.getElement(PaymentElement);

        result = await stripe.confirmPayment({
          elements,
          confirmParams: {
            return_url: `${window.location.origin}/billing/success`,
          },
          redirect: 'if_required'
        });
      } else {
        // Use traditional CardElement
        const cardElement = elements.getElement(CardElement);

        result = await stripe.createPaymentMethod({
          type: 'card',
          card: cardElement,
          billing_details: {
            // Add billing details if available
          },
        });
      }

      if (result.error) {
        setError(result.error.message);
        if (onError) {
          onError(result.error);
        }
      } else {
        if (onSubmit) {
          await onSubmit(result);
        }
      }
    } catch (err) {
      const errorMessage = err.message || 'An unexpected error occurred';
      setError(errorMessage);
      if (onError) {
        onError(err);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCardChange = (event) => {
    if (event.error) {
      setError(event.error.message);
    } else {
      setError(null);
    }
    setCardComplete(event.complete);
  };

  const formatAmount = (cents) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  };

  const isFormValid = () => {
    if (usePaymentElement) {
      return stripe && elements && !processing && !isProcessing;
    } else {
      return stripe && elements && cardComplete && !processing && !isProcessing;
    }
  };

  return (
    <form onSubmit={handleSubmit} className={`payment-form ${className}`}>
      {/* Amount Display */}
      {showAmount && amount && (
        <div className="payment-amount">
          <div className="amount-label">Total</div>
          <div className="amount-value">{formatAmount(amount)}</div>
          {description && (
            <div className="amount-description">{description}</div>
          )}
        </div>
      )}

      {/* Payment Element */}
      <div className="payment-element-container">
        {usePaymentElement ? (
          <PaymentElement
            options={{
              layout: 'tabs',
              paymentMethodOrder: ['card', 'apple_pay', 'google_pay']
            }}
          />
        ) : (
          <div className="card-element-container">
            <label className="payment-label">
              Card Information
            </label>
            <div className="card-element-wrapper">
              <CardElement
                options={{
                  style: {
                    base: {
                      fontSize: '16px',
                      color: '#212529',
                      '::placeholder': {
                        color: '#6c757d',
                      },
                    },
                    invalid: {
                      color: '#dc3545',
                    },
                  },
                  hidePostalCode: false,
                }}
                onChange={handleCardChange}
              />
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="payment-error">
          <span className="error-icon">❌</span>
          <span className="error-text">{error}</span>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        className="payment-submit"
        disabled={!isFormValid() || disabled}
      >
        {isProcessing || processing ? (
          <span className="submit-loading">
            <span className="spinner"></span>
            Processing...
          </span>
        ) : (
          <span className="submit-text">
            {submitText}
            {showAmount && amount && ` ${formatAmount(amount)}`}
          </span>
        )}
      </button>

      {/* Security Notice */}
      <div className="security-notice">
        <span className="security-icon">🔒</span>
        <span>Powered by Stripe. Your payment information is secure.</span>
      </div>

      <style jsx>{`
        .payment-form {
          width: 100%;
          max-width: 400px;
        }

        .payment-amount {
          background: #f8f9fa;
          border: 1px solid #e9ecef;
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 24px;
          text-align: center;
        }

        .amount-label {
          font-size: 0.875rem;
          color: #6c757d;
          margin-bottom: 4px;
        }

        .amount-value {
          font-size: 1.75rem;
          font-weight: 700;
          color: #212529;
          margin-bottom: 4px;
        }

        .amount-description {
          font-size: 0.875rem;
          color: #495057;
        }

        .payment-element-container {
          margin-bottom: 16px;
        }

        .card-element-container {
          margin-bottom: 16px;
        }

        .payment-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 500;
          color: #495057;
          margin-bottom: 8px;
        }

        .card-element-wrapper {
          padding: 12px;
          border: 2px solid #e9ecef;
          border-radius: 8px;
          background: white;
          transition: border-color 0.2s ease;
        }

        .card-element-wrapper:focus-within {
          border-color: #007bff;
          box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
        }

        .payment-error {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 6px;
          margin-bottom: 16px;
        }

        .error-icon {
          font-size: 0.875rem;
        }

        .error-text {
          font-size: 0.875rem;
          color: #721c24;
        }

        .payment-submit {
          width: 100%;
          padding: 14px 24px;
          background: #007bff;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-bottom: 12px;
        }

        .payment-submit:hover:not(:disabled) {
          background: #0056b3;
          transform: translateY(-1px);
        }

        .payment-submit:disabled {
          background: #6c757d;
          cursor: not-allowed;
          transform: none;
        }

        .submit-loading {
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

        .submit-text {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 4px;
        }

        .security-notice {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 0.8rem;
          color: #6c757d;
          text-align: center;
        }

        .security-icon {
          font-size: 0.875rem;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 768px) {
          .payment-form {
            max-width: 100%;
          }

          .amount-value {
            font-size: 1.5rem;
          }

          .payment-submit {
            padding: 16px 24px;
            font-size: 1.1rem;
          }
        }
      `}</style>
    </form>
  );
};

export default PaymentForm;