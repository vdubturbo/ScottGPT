/**
 * StripeProvider Component
 * ========================
 *
 * Wrapper component that provides Stripe Elements context.
 * Handles Stripe initialization and configuration.
 */

import React from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements } from '@stripe/react-stripe-js';

// Load Stripe with publishable key
// Note: In production, this should come from environment variables
const stripePromise = loadStripe(
  process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_placeholder'
);

const StripeProvider = ({ children, options = {} }) => {
  const defaultOptions = {
    // Appearance customization
    appearance: {
      theme: 'stripe',
      variables: {
        colorPrimary: '#007bff',
        colorBackground: '#ffffff',
        colorText: '#212529',
        colorDanger: '#dc3545',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSizeBase: '16px',
        borderRadius: '8px',
        spacingUnit: '4px'
      },
      rules: {
        '.Input': {
          border: '2px solid #e9ecef',
          borderRadius: '8px',
          padding: '12px',
          fontSize: '16px',
          transition: 'border-color 0.2s ease'
        },
        '.Input:focus': {
          borderColor: '#007bff',
          boxShadow: '0 0 0 3px rgba(0, 123, 255, 0.1)'
        },
        '.Input--invalid': {
          borderColor: '#dc3545'
        },
        '.Label': {
          fontSize: '14px',
          fontWeight: '500',
          color: '#495057',
          marginBottom: '6px'
        },
        '.Error': {
          color: '#dc3545',
          fontSize: '14px',
          marginTop: '4px'
        }
      }
    },
    // Default locale
    locale: 'en',
    // Loading spinner
    loader: 'auto',
    ...options
  };

  return (
    <Elements stripe={stripePromise} options={defaultOptions}>
      {children}
    </Elements>
  );
};

export default StripeProvider;