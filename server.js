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
const generalLimit = createRateLimit(
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
  ? createRateLimit(1 * 60 * 1000, 1000, 'Development rate limit') // Very high limit for dev
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
  
  // Multi-tenant SaaS routes
  const authRoutes = await import('./routes/auth.js');
  const adminRoutes = await import('./routes/admin.js');

  // API Routes with specific rate limiting
  app.use('/api/chat', chatLimit, chatRoutes.default);
  app.use('/api/data', dataLimit, dataRoutes.default);
  app.use('/api/upload', uploadRoutes.default);
  app.use('/api/tags', generalLimit, tagsRoutes.default);
  app.use('/api/user', dataLimit, userDataRoutes.default);
  app.use('/api/user', dataLimit, advancedUserDataRoutes.default);
  app.use('/api/user/export', dataLimit, dataExportRoutes.default);
  app.use('/api/user/generate', dataLimit, resumeGenerationRoutes.default);
  
  // Multi-tenant SaaS routes
  app.use('/api/auth', authRoutes.default);
  app.use('/api/admin', adminRoutes.default);

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
    const reservedRoutes = ['dashboard', 'admin', 'login', 'register', 'api'];
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

  app.listen(PORT, () => {
    logger.info('ScottGPT server started successfully', { port: PORT });
    console.log(`ScottGPT server running on port ${PORT}`);
  });
}

startServer().catch(console.error);