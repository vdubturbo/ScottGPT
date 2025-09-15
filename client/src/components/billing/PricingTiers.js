/**
 * PricingTiers Component
 * ======================
 *
 * Displays pricing comparison between Free and Premium tiers.
 * Includes feature lists, pricing, and upgrade buttons.
 */

import React from 'react';
import { useBilling } from '../../contexts/BillingContext';

const PricingTiers = ({
  onSelectPlan,
  currentPlan = null,
  showCurrentPlan = true,
  layout = 'horizontal', // 'horizontal' | 'vertical'
  className = ''
}) => {
  const {
    plans,
    subscription,
    loading,
    isPremium
  } = useBilling();

  if (loading || !plans.free || !plans.premium) {
    return (
      <div className={`pricing-tiers loading ${layout} ${className}`}>
        <div className="pricing-skeleton">
          <div className="plan-skeleton"></div>
          <div className="plan-skeleton"></div>
        </div>
      </div>
    );
  }

  const handleSelectPlan = (planId) => {
    if (onSelectPlan) {
      onSelectPlan(planId, plans[planId]);
    }
  };

  const isCurrentPlan = (planId) => {
    return subscription.tier === planId;
  };

  const getButtonText = (planId) => {
    if (isCurrentPlan(planId)) {
      return 'Current Plan';
    }

    if (planId === 'free') {
      return isPremium ? 'Downgrade to Free' : 'Current Plan';
    }

    return 'Upgrade to Premium';
  };

  const getButtonVariant = (planId) => {
    if (isCurrentPlan(planId)) {
      return 'current';
    }

    if (planId === 'premium') {
      return 'primary';
    }

    return 'secondary';
  };

  const formatPrice = (price) => {
    if (price === 0) return 'Free';
    return `$${price.toFixed(2)}`;
  };

  const PlanCard = ({ plan, planId }) => (
    <div className={`plan-card ${planId} ${isCurrentPlan(planId) ? 'current' : ''}`}>
      {/* Plan Header */}
      <div className="plan-header">
        <h3 className="plan-name">{plan.name}</h3>
        <div className="plan-price">
          <span className="price-amount">{formatPrice(plan.price)}</span>
          {plan.price > 0 && (
            <span className="price-period">/{plan.billingPeriod}</span>
          )}
        </div>
        {isCurrentPlan(planId) && showCurrentPlan && (
          <div className="current-badge">Current Plan</div>
        )}
      </div>

      {/* Plan Features */}
      <div className="plan-features">
        <div className="resume-limit">
          {plan.resumeLimit === 30 ? 'Unlimited' : plan.resumeLimit} resumes per month
        </div>

        <ul className="feature-list">
          {plan.features.map((feature, index) => (
            <li key={index} className="feature-item">
              <span className="feature-icon">✓</span>
              {feature}
            </li>
          ))}
        </ul>
      </div>

      {/* Plan Action */}
      <div className="plan-action">
        <button
          className={`plan-button ${getButtonVariant(planId)}`}
          onClick={() => handleSelectPlan(planId)}
          disabled={isCurrentPlan(planId) && planId === 'free'}
        >
          {getButtonText(planId)}
        </button>
      </div>

      {/* Popular Badge for Premium */}
      {planId === 'premium' && (
        <div className="popular-badge">Most Popular</div>
      )}
    </div>
  );

  return (
    <div className={`pricing-tiers ${layout} ${className}`}>
      <div className="pricing-header">
        <h2 className="pricing-title">Choose Your Plan</h2>
        <p className="pricing-subtitle">
          Upgrade anytime to unlock more features and higher limits
        </p>
      </div>

      <div className="plans-container">
        <PlanCard plan={plans.free} planId="free" />
        <PlanCard plan={plans.premium} planId="premium" />
      </div>

      <style jsx>{`
        .pricing-tiers {
          width: 100%;
          max-width: 800px;
          margin: 0 auto;
        }

        .pricing-tiers.loading {
          opacity: 0.6;
        }

        .pricing-header {
          text-align: center;
          margin-bottom: 32px;
        }

        .pricing-title {
          font-size: 1.875rem;
          font-weight: 700;
          color: #212529;
          margin-bottom: 8px;
        }

        .pricing-subtitle {
          font-size: 1rem;
          color: #6c757d;
          margin: 0;
        }

        .plans-container {
          display: grid;
          gap: 24px;
          grid-template-columns: 1fr 1fr;
        }

        .pricing-tiers.vertical .plans-container {
          grid-template-columns: 1fr;
          max-width: 400px;
          margin: 0 auto;
        }

        .plan-card {
          position: relative;
          padding: 24px;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          background: white;
          transition: all 0.2s ease;
        }

        .plan-card:hover {
          border-color: #007bff;
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.15);
        }

        .plan-card.premium {
          border-color: #007bff;
          box-shadow: 0 4px 12px rgba(0, 123, 255, 0.1);
        }

        .plan-card.current {
          border-color: #28a745;
          background: #f8fff9;
        }

        .plan-header {
          text-align: center;
          margin-bottom: 24px;
        }

        .plan-name {
          font-size: 1.5rem;
          font-weight: 600;
          color: #212529;
          margin-bottom: 8px;
        }

        .plan-price {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 4px;
          margin-bottom: 12px;
        }

        .price-amount {
          font-size: 2rem;
          font-weight: 700;
          color: #212529;
        }

        .price-period {
          font-size: 1rem;
          color: #6c757d;
        }

        .current-badge {
          display: inline-block;
          padding: 4px 12px;
          background: #28a745;
          color: white;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .popular-badge {
          position: absolute;
          top: -12px;
          left: 50%;
          transform: translateX(-50%);
          padding: 6px 16px;
          background: #007bff;
          color: white;
          border-radius: 20px;
          font-size: 0.75rem;
          font-weight: 600;
          text-transform: uppercase;
        }

        .plan-features {
          margin-bottom: 32px;
        }

        .resume-limit {
          font-size: 1.125rem;
          font-weight: 600;
          color: #007bff;
          text-align: center;
          margin-bottom: 16px;
          padding: 8px 12px;
          background: #e3f2fd;
          border-radius: 6px;
        }

        .feature-list {
          list-style: none;
          padding: 0;
          margin: 0;
        }

        .feature-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 6px 0;
          font-size: 0.9rem;
          color: #495057;
        }

        .feature-icon {
          color: #28a745;
          font-weight: bold;
          font-size: 1rem;
        }

        .plan-action {
          text-align: center;
        }

        .plan-button {
          width: 100%;
          padding: 12px 24px;
          border: 2px solid transparent;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .plan-button.primary {
          background: #007bff;
          color: white;
          border-color: #007bff;
        }

        .plan-button.primary:hover {
          background: #0056b3;
          border-color: #0056b3;
        }

        .plan-button.secondary {
          background: white;
          color: #007bff;
          border-color: #007bff;
        }

        .plan-button.secondary:hover {
          background: #007bff;
          color: white;
        }

        .plan-button.current {
          background: #28a745;
          color: white;
          border-color: #28a745;
          cursor: default;
        }

        .plan-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .pricing-skeleton {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }

        .plan-skeleton {
          height: 400px;
          background: #f8f9fa;
          border-radius: 12px;
          animation: pulse 1.5s ease-in-out infinite;
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
          .plans-container {
            grid-template-columns: 1fr;
            gap: 16px;
          }

          .pricing-header {
            margin-bottom: 24px;
          }

          .pricing-title {
            font-size: 1.5rem;
          }

          .plan-card {
            padding: 20px;
          }

          .price-amount {
            font-size: 1.75rem;
          }
        }
      `}</style>
    </div>
  );
};

export default PricingTiers;