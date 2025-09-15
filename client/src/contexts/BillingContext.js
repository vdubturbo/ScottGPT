/**
 * Billing Context - State Management for ScottGPT Billing
 * ========================================================
 *
 * Provides centralized state management for:
 * - Subscription status and plan information
 * - Usage tracking and limits
 * - Payment processing state
 * - Billing history
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import { useAuth } from './AuthContext';

// Billing action types
const BILLING_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_SUBSCRIPTION: 'SET_SUBSCRIPTION',
  SET_USAGE: 'SET_USAGE',
  SET_PLANS: 'SET_PLANS',
  SET_PAYMENT_PROCESSING: 'SET_PAYMENT_PROCESSING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  UPDATE_USAGE: 'UPDATE_USAGE',
  SET_BILLING_HISTORY: 'SET_BILLING_HISTORY'
};

// Initial billing state
const initialState = {
  loading: true,
  subscription: {
    tier: 'free',
    status: 'active',
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false
  },
  usage: {
    resumeCountUsed: 0,
    resumeCountLimit: 3,
    resumeCountRemaining: 3,
    resetDate: null,
    canGenerateResume: true
  },
  plans: {
    free: null,
    premium: null
  },
  oneTimePurchases: {},
  billingHistory: [],
  paymentProcessing: false,
  error: null
};

// Billing reducer
function billingReducer(state, action) {
  switch (action.type) {
    case BILLING_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };

    case BILLING_ACTIONS.SET_SUBSCRIPTION:
      return {
        ...state,
        subscription: {
          ...state.subscription,
          ...action.payload
        }
      };

    case BILLING_ACTIONS.SET_USAGE:
      return {
        ...state,
        usage: {
          ...state.usage,
          ...action.payload
        }
      };

    case BILLING_ACTIONS.SET_PLANS:
      return {
        ...state,
        plans: action.payload.plans,
        oneTimePurchases: action.payload.oneTimePurchases
      };

    case BILLING_ACTIONS.SET_PAYMENT_PROCESSING:
      return {
        ...state,
        paymentProcessing: action.payload
      };

    case BILLING_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
        paymentProcessing: false
      };

    case BILLING_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };

    case BILLING_ACTIONS.UPDATE_USAGE:
      const newUsed = state.usage.resumeCountUsed + action.payload;
      return {
        ...state,
        usage: {
          ...state.usage,
          resumeCountUsed: newUsed,
          resumeCountRemaining: Math.max(0, state.usage.resumeCountLimit - newUsed),
          canGenerateResume: newUsed < state.usage.resumeCountLimit
        }
      };

    case BILLING_ACTIONS.SET_BILLING_HISTORY:
      return {
        ...state,
        billingHistory: action.payload
      };

    default:
      return state;
  }
}

// Create context
const BillingContext = createContext();

// Billing provider component
export function BillingProvider({ children }) {
  const [state, dispatch] = useReducer(billingReducer, initialState);
  const { user } = useAuth();

  // API base URL
  const API_BASE = '/api/billing';

  // Fetch subscription status
  const fetchSubscriptionStatus = async () => {
    if (!user) return;

    try {
      dispatch({ type: BILLING_ACTIONS.SET_LOADING, payload: true });

      const response = await fetch(`${API_BASE}/status`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch subscription status');
      }

      const data = await response.json();

      dispatch({
        type: BILLING_ACTIONS.SET_SUBSCRIPTION,
        payload: data.data.subscription
      });

      dispatch({
        type: BILLING_ACTIONS.SET_USAGE,
        payload: data.data.usage
      });

    } catch (error) {
      console.error('Error fetching subscription status:', error);
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
    } finally {
      dispatch({ type: BILLING_ACTIONS.SET_LOADING, payload: false });
    }
  };

  // Fetch available plans
  const fetchPlans = async () => {
    try {
      const response = await fetch(`${API_BASE}/plans`);

      if (!response.ok) {
        throw new Error('Failed to fetch plans');
      }

      const data = await response.json();
      dispatch({ type: BILLING_ACTIONS.SET_PLANS, payload: data.data });

    } catch (error) {
      console.error('Error fetching plans:', error);
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
    }
  };

  // Create subscription
  const createSubscription = async (priceId, paymentMethodId = null) => {
    if (!user) throw new Error('User not authenticated');

    try {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: true });
      dispatch({ type: BILLING_ACTIONS.CLEAR_ERROR });

      const response = await fetch(`${API_BASE}/create-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ priceId, paymentMethodId })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create subscription');
      }

      return data.data;

    } catch (error) {
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
      throw error;
    } finally {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: false });
    }
  };

  // Cancel subscription
  const cancelSubscription = async (cancelAtPeriodEnd = true) => {
    if (!user) throw new Error('User not authenticated');

    try {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: true });
      dispatch({ type: BILLING_ACTIONS.CLEAR_ERROR });

      const response = await fetch(`${API_BASE}/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ cancelAtPeriodEnd })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to cancel subscription');
      }

      // Update local state
      dispatch({
        type: BILLING_ACTIONS.SET_SUBSCRIPTION,
        payload: {
          cancelAtPeriodEnd: data.data.cancelAtPeriodEnd,
          status: data.data.status
        }
      });

      return data.data;

    } catch (error) {
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
      throw error;
    } finally {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: false });
    }
  };

  // Purchase resume credits
  const purchaseResumeCredits = async (credits = 1) => {
    if (!user) throw new Error('User not authenticated');

    try {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: true });
      dispatch({ type: BILLING_ACTIONS.CLEAR_ERROR });

      const response = await fetch(`${API_BASE}/purchase-resume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        },
        body: JSON.stringify({ credits })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to purchase resume credits');
      }

      return data.data;

    } catch (error) {
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
      throw error;
    } finally {
      dispatch({ type: BILLING_ACTIONS.SET_PAYMENT_PROCESSING, payload: false });
    }
  };

  // Check usage limits
  const checkUsage = async () => {
    if (!user) return;

    try {
      const response = await fetch(`${API_BASE}/check-usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to check usage');
      }

      const data = await response.json();

      dispatch({
        type: BILLING_ACTIONS.SET_USAGE,
        payload: data.data
      });

      return data.data;

    } catch (error) {
      console.error('Error checking usage:', error);
      return null;
    }
  };

  // Fetch billing history
  const fetchBillingHistory = async (limit = 20, offset = 0) => {
    if (!user) return;

    try {
      const response = await fetch(`${API_BASE}/history?limit=${limit}&offset=${offset}`, {
        headers: {
          'Authorization': `Bearer ${user.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch billing history');
      }

      const data = await response.json();

      dispatch({
        type: BILLING_ACTIONS.SET_BILLING_HISTORY,
        payload: data.data.transactions
      });

      return data.data;

    } catch (error) {
      console.error('Error fetching billing history:', error);
      dispatch({
        type: BILLING_ACTIONS.SET_ERROR,
        payload: error.message
      });
    }
  };

  // Update usage locally (optimistic update)
  const incrementUsage = (count = 1) => {
    dispatch({ type: BILLING_ACTIONS.UPDATE_USAGE, payload: count });
  };

  // Clear errors
  const clearError = () => {
    dispatch({ type: BILLING_ACTIONS.CLEAR_ERROR });
  };

  // Load initial data
  useEffect(() => {
    if (user) {
      fetchSubscriptionStatus();
      fetchBillingHistory();
    }
  }, [user]);

  // Load plans on mount (no auth required)
  useEffect(() => {
    fetchPlans();
  }, []);

  // Context value
  const value = {
    ...state,

    // Actions
    createSubscription,
    cancelSubscription,
    purchaseResumeCredits,
    checkUsage,
    fetchSubscriptionStatus,
    fetchBillingHistory,
    incrementUsage,
    clearError,

    // Computed values
    isPremium: state.subscription.tier === 'premium',
    isAtLimit: state.usage.resumeCountUsed >= state.usage.resumeCountLimit,
    usagePercentage: (state.usage.resumeCountUsed / state.usage.resumeCountLimit) * 100
  };

  return (
    <BillingContext.Provider value={value}>
      {children}
    </BillingContext.Provider>
  );
}

// Custom hook to use billing context
export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) {
    throw new Error('useBilling must be used within a BillingProvider');
  }
  return context;
}

export default BillingContext;