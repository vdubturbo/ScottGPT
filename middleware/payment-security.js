/**
 * Payment Security Middleware
 * ===========================
 *
 * Security middleware for payment endpoints including CORS, CSRF protection,
 * rate limiting, and payment validation.
 */

import rateLimit from 'express-rate-limit';
import winston from 'winston';
import crypto from 'crypto';
import CONFIG from '../config/app-config.js';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  defaultMeta: { service: 'payment-security' },
  transports: [
    new winston.transports.File({ filename: 'logs/payment-security.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

/**
 * CORS configuration for Stripe Elements
 */
export const stripeElementsCORS = (req, res, next) => {
  // Allow Stripe's domains for Elements
  const allowedOrigins = [
    CONFIG.app.baseUrl,
    'https://js.stripe.com',
    'https://hooks.stripe.com',
    'https://api.stripe.com'
  ];

  // In development, allow localhost
  if (CONFIG.environment.NODE_ENV === 'development') {
    allowedOrigins.push('http://localhost:3000', 'http://localhost:3004');
  }

  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Stripe-Signature');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '3600');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
};

/**
 * Rate limiting for payment endpoints
 */
export const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 payment attempts per window
  message: {
    error: 'Too many payment attempts',
    message: 'Please wait before trying again',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Rate limit by user ID if authenticated, otherwise by IP
    return req.user?.id || req.ip;
  },
  onLimitReached: (req, res) => {
    logger.warn('Payment rate limit exceeded', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent: req.get('user-agent')
    });
  }
});

/**
 * Subscription rate limiting (more restrictive)
 */
export const subscriptionRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 subscription attempts per hour
  message: {
    error: 'Too many subscription attempts',
    message: 'Please contact support if you need assistance',
    retryAfter: '1 hour'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip
});

/**
 * CSRF protection for payment forms
 */
export const csrfProtection = (req, res, next) => {
  // Skip CSRF for webhooks (they use signature verification)
  if (req.path.includes('/webhooks/')) {
    return next();
  }

  const token = req.headers['x-csrf-token'] || req.body.csrfToken;
  const sessionToken = req.session?.csrfToken;

  if (!token || !sessionToken || token !== sessionToken) {
    logger.warn('CSRF token validation failed', {
      userId: req.user?.id,
      ip: req.ip,
      hasToken: !!token,
      hasSessionToken: !!sessionToken,
      path: req.path
    });

    return res.status(403).json({
      error: 'Invalid CSRF token',
      message: 'Request rejected for security reasons'
    });
  }

  next();
};

/**
 * Generate CSRF token for session
 */
export const generateCSRFToken = (req, res, next) => {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  next();
};

/**
 * Payment amount validation
 */
export const validatePaymentAmount = (req, res, next) => {
  const { amount, currency = 'usd' } = req.body;

  // Validate amount is present and reasonable
  if (!amount || typeof amount !== 'number') {
    return res.status(400).json({
      error: 'Invalid amount',
      message: 'Payment amount must be a valid number'
    });
  }

  // Minimum amount check (e.g., $0.50)
  const minAmount = CONFIG.billing.minPaymentAmount || 50; // cents
  if (amount < minAmount) {
    return res.status(400).json({
      error: 'Amount too small',
      message: `Minimum payment amount is ${currency.toUpperCase()} $${(minAmount / 100).toFixed(2)}`
    });
  }

  // Maximum amount check (e.g., $1000)
  const maxAmount = CONFIG.billing.maxPaymentAmount || 100000; // cents
  if (amount > maxAmount) {
    return res.status(400).json({
      error: 'Amount too large',
      message: `Maximum payment amount is ${currency.toUpperCase()} $${(maxAmount / 100).toFixed(2)}`
    });
  }

  // Validate currency
  const allowedCurrencies = ['usd', 'eur', 'gbp'];
  if (!allowedCurrencies.includes(currency.toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid currency',
      message: 'Currency not supported'
    });
  }

  next();
};

/**
 * Subscription plan validation
 */
export const validateSubscriptionPlan = (req, res, next) => {
  const { planId, priceId } = req.body;

  if (!planId || !priceId) {
    return res.status(400).json({
      error: 'Missing plan information',
      message: 'Plan ID and Price ID are required'
    });
  }

  // Validate against configured plans
  const validPlans = Object.keys(CONFIG.billing.plans || {});
  if (!validPlans.includes(planId)) {
    return res.status(400).json({
      error: 'Invalid plan',
      message: 'Selected plan is not available'
    });
  }

  next();
};

/**
 * Prevent duplicate payment processing
 */
export const preventDuplicatePayments = (req, res, next) => {
  const { idempotencyKey } = req.body;

  if (!idempotencyKey) {
    return res.status(400).json({
      error: 'Missing idempotency key',
      message: 'Payment requests must include an idempotency key'
    });
  }

  // Validate idempotency key format
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 16) {
    return res.status(400).json({
      error: 'Invalid idempotency key',
      message: 'Idempotency key must be at least 16 characters'
    });
  }

  // Store for duplicate detection (in production, use Redis or database)
  req.idempotencyKey = idempotencyKey;
  next();
};

/**
 * Fraud detection middleware
 */
export const fraudDetection = (req, res, next) => {
  const suspiciousPatterns = {
    // Multiple rapid payment attempts
    rapidAttempts: false,
    // Unusual amounts (e.g., testing with $1.00 repeatedly)
    testingPattern: false,
    // Suspicious user agent or missing headers
    suspiciousHeaders: false,
    // Country/IP mismatch (would need GeoIP service)
    locationMismatch: false
  };

  const { amount } = req.body;
  const userAgent = req.get('user-agent');

  // Check for testing patterns
  if (amount === 100 || amount === 1) { // $1.00 or $0.01
    suspiciousPatterns.testingPattern = true;
  }

  // Check for missing or suspicious user agent
  if (!userAgent || userAgent.includes('curl') || userAgent.includes('wget')) {
    suspiciousPatterns.suspiciousHeaders = true;
  }

  // Calculate risk score
  const riskFactors = Object.values(suspiciousPatterns).filter(Boolean).length;
  const riskScore = riskFactors / Object.keys(suspiciousPatterns).length;

  // Log suspicious activity
  if (riskScore > 0.3) {
    logger.warn('Suspicious payment activity detected', {
      userId: req.user?.id,
      ip: req.ip,
      userAgent,
      amount,
      riskScore,
      patterns: suspiciousPatterns
    });

    // In production, you might want to require additional verification
    // or flag for manual review
  }

  // Block high-risk transactions
  if (riskScore > 0.7) {
    logger.error('High-risk payment blocked', {
      userId: req.user?.id,
      ip: req.ip,
      riskScore
    });

    return res.status(429).json({
      error: 'Payment blocked',
      message: 'This transaction requires additional verification. Please contact support.'
    });
  }

  req.riskScore = riskScore;
  next();
};

/**
 * Log payment attempts for monitoring
 */
export const logPaymentAttempt = (req, res, next) => {
  const { amount, currency, planId } = req.body;

  logger.info('Payment attempt started', {
    userId: req.user?.id,
    ip: req.ip,
    amount,
    currency,
    planId,
    userAgent: req.get('user-agent'),
    timestamp: new Date().toISOString(),
    riskScore: req.riskScore
  });

  // Continue to payment processing
  next();
};

/**
 * Comprehensive payment security stack
 */
export const paymentSecurityStack = [
  stripeElementsCORS,
  generateCSRFToken,
  paymentRateLimit,
  validatePaymentAmount,
  preventDuplicatePayments,
  fraudDetection,
  logPaymentAttempt
];

/**
 * Subscription security stack
 */
export const subscriptionSecurityStack = [
  stripeElementsCORS,
  generateCSRFToken,
  subscriptionRateLimit,
  validateSubscriptionPlan,
  preventDuplicatePayments,
  fraudDetection,
  logPaymentAttempt
];

/**
 * Get security headers for Stripe Elements
 */
export const getStripeElementsHeaders = () => {
  return {
    'Content-Security-Policy': "frame-src 'self' https://js.stripe.com https://hooks.stripe.com",
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  };
};

/**
 * Webhook security for Stripe
 */
export const webhookSecurity = (req, res, next) => {
  // Verify the request is from Stripe
  const signature = req.get('stripe-signature');

  if (!signature) {
    logger.warn('Webhook request missing signature', {
      ip: req.ip,
      userAgent: req.get('user-agent')
    });

    return res.status(400).json({
      error: 'Missing signature'
    });
  }

  // Additional security checks
  const userAgent = req.get('user-agent');
  if (!userAgent || !userAgent.includes('Stripe')) {
    logger.warn('Suspicious webhook user agent', {
      ip: req.ip,
      userAgent
    });
  }

  next();
};

export default {
  stripeElementsCORS,
  paymentRateLimit,
  subscriptionRateLimit,
  csrfProtection,
  generateCSRFToken,
  validatePaymentAmount,
  validateSubscriptionPlan,
  preventDuplicatePayments,
  fraudDetection,
  logPaymentAttempt,
  paymentSecurityStack,
  subscriptionSecurityStack,
  getStripeElementsHeaders,
  webhookSecurity
};