import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import CONFIG from './config/app-config.js';

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Environment validation is handled by centralized configuration
logger.info('Environment validation handled by centralized configuration');
console.log('✅ Environment validation handled by centralized configuration');
console.log(`🚀 Starting ScottGPT server in ${CONFIG.environment.NODE_ENV} mode`);

// Log detected environment information
CONFIG.environment.detector.logEnvironmentInfo();

const app = express();
const PORT = CONFIG.server.port;

// Enable trust proxy for rate limiting with proxy
app.set('trust proxy', 1);

// Rate limiting configuration
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limits from centralized configuration
const generalLimit = CONFIG.environment.IS_DEVELOPMENT
  ? createRateLimit(1000, 200, 'Development rate limit') // 200 requests per second for dev
  : createRateLimit(
      CONFIG.rateLimiting.general.windowMs,
      CONFIG.rateLimiting.general.maxRequests,
      CONFIG.rateLimiting.general.message
    );
const chatLimit = createRateLimit(
  CONFIG.rateLimiting.chat.windowMs, 
  CONFIG.rateLimiting.chat.maxRequests, 
  CONFIG.rateLimiting.chat.message
);
const uploadLimit = createRateLimit(
  CONFIG.rateLimiting.upload.windowMs, 
  CONFIG.rateLimiting.upload.maxRequests, 
  CONFIG.rateLimiting.upload.message
);
// Development-friendly data limits
const dataLimit = CONFIG.environment.IS_DEVELOPMENT
  ? createRateLimit(1000, 100, 'Development rate limit') // 100 requests per second for dev
  : createRateLimit(1 * 60 * 1000, 20, 'Too many data requests, please try again later');

// Middleware
app.use(helmet());
app.use(cors({
  origin: CONFIG.server.cors.origin,
  credentials: CONFIG.server.cors.credentials
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply general rate limiting to all requests
app.use('/api/', generalLimit);

// Async function to set up server with dynamic imports
async function startServer() {
  // Serve static files from client build
  app.use(express.static(path.join(__dirname, 'client/build')));

  // Dynamic imports for routes
  const chatRoutes = await import('./routes/chat.js');
  const dataRoutes = await import('./routes/data.js');
  const uploadRoutes = await import('./routes/upload.js');
  const tagsRoutes = await import('./routes/tags.js');
  const userDataRoutes = await import('./routes/user-data.js');
  const advancedUserDataRoutes = await import('./routes/advanced-user-data.js');
  const dataExportRoutes = await import('./routes/data-export.js');
  const resumeGenerationRoutes = await import('./routes/resume-generation.js');
  const advancedResumeGenerationRoutes = await import('./routes/advanced-resume-generation.js');
  const resumeExportRoutes = await import('./routes/resume-export.js');

  // Multi-tenant SaaS routes
  const authRoutes = await import('./routes/auth.js');
  const feedbackRoutes = await import('./routes/feedback.js');

  // Conditionally import admin and payment-related routes only if Stripe is configured
  let adminRoutes, secureAdminRoutes, billingRoutes, webhookRoutes, analyticsRoutes;
  if (CONFIG.billing.stripe.secretKey) {
    try {
      adminRoutes = await import('./routes/admin.js');
      secureAdminRoutes = await import('./routes/secure-admin.js');
      billingRoutes = await import('./routes/billing.js');
      webhookRoutes = await import('./routes/webhooks.js');
      analyticsRoutes = await import('./routes/analytics.js');
    } catch (error) {
      console.log('⚠️  Payment-related routes failed to import:', error.message);
    }
  } else {
    // Load non-payment admin routes
    try {
      adminRoutes = await import('./routes/admin.js');
      secureAdminRoutes = await import('./routes/secure-admin.js');
    } catch (error) {
      console.log('⚠️  Admin routes failed to import:', error.message);
    }
  }
  
  // Auth middleware
  const { authenticateToken, requireAuth } = await import('./middleware/auth.js');

  // Usage tracking middleware
  const { handleUsageError } = await import('./middleware/usage-tracking.js');

  // API Routes with specific rate limiting
  app.use('/api/chat', chatLimit, chatRoutes.default);
  app.use('/api/data', dataLimit, dataRoutes.default);
  app.use('/api/upload', uploadRoutes.default);
  app.use('/api/tags', generalLimit, tagsRoutes.default);
  app.use('/api/user', dataLimit, authenticateToken, requireAuth, userDataRoutes.default);
  app.use('/api/user', dataLimit, authenticateToken, requireAuth, advancedUserDataRoutes.default);
  app.use('/api/user/export', dataLimit, authenticateToken, requireAuth, dataExportRoutes.default);
  app.use('/api/user/export', dataLimit, authenticateToken, requireAuth, resumeExportRoutes.default);
  app.use('/api/user/generate', dataLimit, authenticateToken, requireAuth, resumeGenerationRoutes.default);
  app.use('/api/user/advanced-generate', dataLimit, authenticateToken, requireAuth, advancedResumeGenerationRoutes.default);
  
  // Multi-tenant SaaS routes
  app.use('/api/auth', authRoutes.default);
  app.use('/api/feedback', authenticateToken, requireAuth, feedbackRoutes.default);

  // Register admin routes if available
  if (adminRoutes) {
    app.use('/api/admin', adminRoutes.default);
    console.log('✅ Admin routes registered');
  } else {
    console.log('⚠️  Admin routes skipped');
  }

  // Register secure admin routes with hidden path
  if (secureAdminRoutes) {
    app.use('/api/vdubturboadmin', secureAdminRoutes.default);
    console.log('✅ Secure admin routes registered at hidden path');
  } else {
    console.log('⚠️  Secure admin routes skipped');
  }

  // Only register payment routes if Stripe is configured
  if (CONFIG.billing.stripe.secretKey && billingRoutes && webhookRoutes && analyticsRoutes) {
    app.use('/api/billing', billingRoutes.default);
    app.use('/api/webhooks', webhookRoutes.default);
    app.use('/api/analytics', analyticsRoutes.default);
    console.log('✅ Payment routes registered');
  } else {
    console.log('⚠️  Payment routes skipped (Stripe not configured)');

    // Provide basic billing endpoints for development/frontend compatibility
    app.get('/api/billing/plans', (req, res) => {
      res.json({
        success: true,
        data: {
          plans: {
            free: {
              name: 'Free',
              price: 0,
              resumeLimit: 3,
              billingPeriod: 'month',
              features: ['3 resume generations', 'Basic support']
            },
            premium: {
              name: 'Premium',
              price: 6.99,
              resumeLimit: 50,
              billingPeriod: 'month',
              features: ['50 resume generations', 'Priority support', 'Advanced templates']
            }
          }
        }
      });
    });

    // Simple in-memory usage tracking for development
    const userUsageCache = new Map();

    app.get('/api/billing/status', async (req, res) => {
      // Apply authentication middleware
      authenticateToken(req, res, () => {
        if (!req.user || !req.user.id) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please log in to view billing status'
          });
        }
        const userId = req.user.id;
        const currentUsage = userUsageCache.get(userId) || 0;
        const limit = 3;
        const remaining = Math.max(0, limit - currentUsage);

        res.json({
          success: true,
          data: {
            subscription: {
              tier: 'free',
              status: 'active',
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false
            },
            usage: {
              resumeCountUsed: currentUsage,
              resumeCountLimit: limit,
              resumeCountRemaining: remaining,
              resetDate: null,
              canGenerateResume: remaining > 0
            }
          }
        });
      });
    });

    // Endpoint to increment usage count
    app.post('/api/billing/increment-usage', async (req, res) => {
      authenticateToken(req, res, () => {
        if (!req.user || !req.user.id) {
          return res.status(401).json({
            error: 'Authentication required',
            message: 'Please log in to increment usage'
          });
        }
        const userId = req.user.id;
        const currentUsage = userUsageCache.get(userId) || 0;
        const newUsage = currentUsage + 1;
        userUsageCache.set(userId, newUsage);

        const limit = 3;
        const remaining = Math.max(0, limit - newUsage);

        res.json({
          success: true,
          data: {
            resumeCountUsed: newUsage,
            resumeCountLimit: limit,
            resumeCountRemaining: remaining,
            canGenerateResume: remaining > 0
          }
        });
      });
    });

    app.get('/api/billing/subscription', async (req, res) => {
      // Apply authentication middleware
      authenticateToken(req, res, () => {
        res.json({
          success: true,
          data: {
            subscription: {
              tier: 'free',
              status: 'active',
              currentPeriodEnd: null,
              cancelAtPeriodEnd: false
            }
          }
        });
      });
    });

    app.get('/api/billing/history', async (req, res) => {
      // Apply authentication middleware
      authenticateToken(req, res, () => {
        res.json({
          success: true,
          data: []
        });
      });
    });

    // Catch-all for other billing endpoints
    app.use('/api/billing/*', (req, res) => {
      res.status(501).json({
        error: 'Billing not configured',
        message: 'Stripe billing is not configured for this environment'
      });
    });
  }

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'ScottGPT API is running' });
  });

  // Public profile routing by URL slug (before wildcard)
  // This allows URLs like https://scottgpt.com/john-doe to load John's profile
  // Exclude reserved routes like dashboard, admin, etc.
  app.get('/:slug([a-z0-9-]+)', async (req, res) => {
    const { slug } = req.params;
    
    // Skip reserved routes - let React handle these
    const reservedRoutes = ['dashboard', 'admin', 'login', 'register', 'api', 'vdubturboadmin'];
    if (reservedRoutes.includes(slug)) {
      return res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
    }
    
    try {
      // Import auth middleware for profile access check
      const { authenticateToken, checkProfileAccess, trackProfileView } = await import('./middleware/auth.js');
      
      // Apply middleware to check if profile exists and is accessible
      authenticateToken(req, res, () => {
        // Add slug to params for checkProfileAccess middleware
        req.params.slug = slug;
        
        checkProfileAccess(req, res, (err) => {
          if (err || !req.targetProfile) {
            // Profile not found or not accessible - serve React app for 404 handling
            return res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
          }
          
          // Track profile view
          trackProfileView(req, res, () => {
            // Profile exists and is accessible - serve React app with profile data
            res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
          });
        });
      });
      
    } catch (error) {
      console.error('Profile routing error:', error);
      // Serve React app for error handling
      res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
    }
  });

  // Serve React app for all other routes
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });

  // Usage-specific error handling middleware
  app.use(handleUsageError);

  // Error handling middleware
  app.use((err, req, res, _next) => {
    logger.error('Unhandled application error', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    res.status(500).json({ error: 'Internal server error occurred' });
  });

  app.listen(PORT, async () => {
    logger.info('ScottGPT server started successfully', { port: PORT });
    console.log(`ScottGPT server running on port ${PORT}`);

    // Start usage reset scheduler in production
    if (CONFIG.environment.NODE_ENV === 'production') {
      try {
        const { default: usageResetScheduler } = await import('./services/usage-reset-scheduler.js');
        usageResetScheduler.start();
        console.log('✅ Usage reset scheduler started');
      } catch (error) {
        console.error('❌ Failed to start usage reset scheduler:', error.message);
      }
    } else {
      console.log('⏸️ Usage reset scheduler disabled in development mode');
    }
  });
}

startServer().catch(console.error);