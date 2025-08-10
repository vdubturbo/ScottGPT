import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// ES module __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate required environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'COHERE_API_KEY'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  logger.error('Missing required environment variables', { missingVars: missingEnvVars });
  console.error('❌ Missing required environment variables:');
  missingEnvVars.forEach(varName => {
    console.error(`   - ${varName}`);
  });
  console.error('\n📝 Please create a .env file with all required variables.');
  console.error('   You can copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

// Validate environment variable formats
if (process.env.SUPABASE_URL && !process.env.SUPABASE_URL.startsWith('https://')) {
  logger.error('Invalid SUPABASE_URL format', { url: process.env.SUPABASE_URL });
  console.error('❌ SUPABASE_URL must start with https://');
  process.exit(1);
}

if (process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.startsWith('sk-')) {
  logger.warn('OPENAI_API_KEY format warning', { keyPrefix: process.env.OPENAI_API_KEY.substring(0, 3) });
  console.warn('⚠️  Warning: OPENAI_API_KEY should typically start with "sk-"');
}

logger.info('Environment validation complete - all required variables configured');
console.log('✅ All required environment variables are configured');

const app = express();
const PORT = process.env.PORT || 3001;

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

// Different rate limits for different endpoint types
const generalLimit = createRateLimit(15 * 60 * 1000, 100, 'Too many requests, please try again later'); // 100 requests per 15 minutes
const chatLimit = createRateLimit(1 * 60 * 1000, 30, 'Too many chat requests, please try again in a minute'); // 30 requests per minute
const uploadLimit = createRateLimit(1 * 60 * 1000, 10, 'Too many upload requests, please try again later'); // 10 requests per minute
const dataLimit = createRateLimit(1 * 60 * 1000, 20, 'Too many data requests, please try again later'); // 20 requests per minute

// Middleware
app.use(helmet());
app.use(cors());
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

  // API Routes with specific rate limiting
  app.use('/api/chat', chatLimit, chatRoutes.default);
  app.use('/api/data', dataLimit, dataRoutes.default);
  app.use('/api/upload', uploadLimit, uploadRoutes.default);
  app.use('/api/tags', generalLimit, tagsRoutes.default);

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'ScottGPT API is running' });
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