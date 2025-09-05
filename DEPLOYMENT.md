# ScottGPT Deployment Guide

Production deployment guide for ScottGPT's AI-powered interactive resume system.

## 🏗️ Production Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   CDN/Static    │    │   Application    │    │    Database     │
│   (Frontend)    │    │    Server        │    │   (Supabase)    │
│                 │    │                  │    │                 │
│ Netlify/Vercel  │◀──▶│  Railway/Render  │◀──▶│  Supabase Pro   │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                       │
         │                        │                       │
         ▼                        ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Load Balancer │    │   File Storage   │    │   Monitoring    │
│  (CloudFlare)   │    │  (Built-in)      │    │ (Optional)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## 🚀 Prerequisites

### Required Accounts & Services

- **Supabase**: Database with pgvector extension
- **OpenAI**: GPT-4 API access (production tier recommended)
- **Cohere**: Embedding API (paid plan for production)
- **Domain**: Custom domain (optional but recommended)

### API Key Requirements

| Service | Tier | Purpose | Cost |
|---------|------|---------|------|
| OpenAI | Production | Chat & extraction | $20-100/month |
| Cohere | Paid | Embeddings | $20-50/month |
| Supabase | Pro | Database & storage | $25/month |

## 🔧 Environment Configuration

### Production Environment Variables

Create a `.env.production` file:

```bash
# Environment
NODE_ENV=production
PORT=3005

# Database (Supabase Production)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_key

# AI Services (Production Keys)
OPENAI_API_KEY=sk-proj-your_production_key
COHERE_API_KEY=your_production_cohere_key

# Security
SESSION_SECRET=your_super_secure_random_string_32_chars
CORS_ORIGIN=https://your-domain.com

# Optional: Monitoring
SENTRY_DSN=https://your-sentry-dsn
```

## 🚀 Backend Deployment

### Option 1: Railway (Recommended)

Railway provides excellent Node.js support with automatic deployments.

**1. Setup Railway CLI**
```bash
npm install -g @railway/cli
railway login
```

**2. Create New Project**
```bash
railway link
# Or create new: railway init
```

**3. Configure Environment**
```bash
railway variables:set NODE_ENV=production
railway variables:set SUPABASE_URL=your_supabase_url
railway variables:set SUPABASE_ANON_KEY=your_anon_key
railway variables:set OPENAI_API_KEY=your_openai_key
railway variables:set COHERE_API_KEY=your_cohere_key
# Set all other variables from .env.production
```

**4. Deploy**
```bash
railway deploy
```

**5. Custom Domain**
```bash
railway domain add api.scottgpt.com
```

**Railway Configuration (`railway.json`):**
```json
{
  "deploy": {
    "startCommand": "npm start",
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300
  }
}
```

### Option 2: Render

**1. Create Web Service**
- Connect GitHub repository
- Set build command: `npm install`
- Set start command: `npm start`

**2. Environment Variables**
Add all production environment variables in Render dashboard.

**3. Health Check**
Configure health check endpoint: `/health`

### Option 3: Heroku

**1. Create Application**
```bash
heroku create scottgpt-api
git remote add heroku https://git.heroku.com/scottgpt-api.git
```

**2. Configure Environment**
```bash
heroku config:set NODE_ENV=production
heroku config:set SUPABASE_URL=your_url
# Add all other environment variables
```

**3. Deploy**
```bash
git push heroku main
```

## 🌐 Frontend Deployment

### Option 1: Netlify (Recommended)

**1. Build Configuration**
```toml
# netlify.toml
[build]
  publish = "client/build"
  command = "cd client && npm ci && npm run build"

[build.environment]
  NODE_VERSION = "18"
  
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

**2. Environment Variables**
Set in Netlify dashboard:
```
REACT_APP_API_URL=https://api.scottgpt.com
REACT_APP_ENVIRONMENT=production
```

**3. Custom Domain**
- Add custom domain in Netlify dashboard
- Configure DNS records as instructed

### Option 2: Vercel

**1. Project Configuration**
```json
{
  "name": "scottgpt-frontend",
  "buildCommand": "cd client && npm run build",
  "outputDirectory": "client/build",
  "framework": "create-react-app"
}
```

**2. Environment Variables**
```
REACT_APP_API_URL=https://api.scottgpt.com
```

## 🗄️ Database Setup

### Supabase Production Configuration

**1. Upgrade to Pro Plan**
- Navigate to Supabase dashboard
- Upgrade to Pro plan for production features

**2. Enable pgvector Extension**
```sql
-- In Supabase SQL Editor
CREATE EXTENSION IF NOT EXISTS vector;
```

**3. Run Migrations**
Execute SQL from `migrations/public-schema.sql` in Supabase SQL Editor.

**4. Configure Connection Pooling**
- Enable connection pooling in Supabase dashboard
- Use pool mode: Transaction
- Pool size: 25-50 connections

**5. Set Up Database Policies**
```sql
-- Enable Row Level Security
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create policies for public read access
CREATE POLICY "Public read access" ON sources FOR SELECT TO public USING (true);
CREATE POLICY "Public read access" ON document_chunks FOR SELECT TO public USING (true);
```

## 🔒 Security Configuration

### SSL/HTTPS Setup

**1. Backend Security**
- Use HTTPS only in production
- Configure CORS for your frontend domain
- Set secure session cookies

**2. Environment Security**
```bash
# Use environment-specific configs
NODE_ENV=production

# Secure session configuration
SESSION_SECURE=true
COOKIE_SECURE=true
```

### Rate Limiting

Add rate limiting for production:

```javascript
// In server.js
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', limiter);
```

## 📊 Monitoring & Logging

### Health Check Endpoint

Add to your Express app:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version
  });
});
```

### Optional: Sentry Integration

```bash
npm install @sentry/node
```

```javascript
// In server.js
const Sentry = require('@sentry/node');

if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
  });
}
```

### Logging Configuration

```javascript
// Configure structured logging for production
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
```

## 🚀 Deployment Checklist

### Pre-Deployment

- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates configured
- [ ] Domain DNS configured
- [ ] Rate limiting enabled
- [ ] CORS properly configured

### Testing

- [ ] Health check endpoint responding
- [ ] Chat API functional
- [ ] Upload API working
- [ ] Database connectivity confirmed
- [ ] Frontend-backend integration working

### Post-Deployment

- [ ] Monitor error logs for first 24 hours
- [ ] Verify API rate limits working
- [ ] Test document upload and processing
- [ ] Validate search functionality
- [ ] Confirm monitoring alerts working

## 📈 Performance Optimization

### Backend Optimizations

```javascript
// Enable compression
app.use(require('compression')());

// Static file caching
app.use(express.static('public', {
  maxAge: '1d',
  etag: false
}));

// Database connection pooling (handled by Supabase)
```

### CDN Configuration

For static assets, consider using CloudFlare:

1. Point DNS to CloudFlare
2. Enable caching for static assets
3. Configure compression
4. Enable minification

### Database Performance

- Enable pgvector extension for faster similarity searches
- Configure appropriate indexes
- Monitor query performance
- Set up connection pooling

## 🔧 Maintenance

### Daily Tasks

- Monitor application logs
- Check API usage metrics
- Verify database performance

### Weekly Tasks

- Review error logs
- Update dependencies
- Check security alerts
- Backup database

### Monthly Tasks

- Review API costs
- Update documentation
- Performance optimization review
- Security audit

## 🆘 Troubleshooting

### Common Issues

**1. API Keys Not Working**
- Verify keys are for production environment
- Check API usage limits
- Confirm keys have correct permissions

**2. Database Connection Issues**
- Verify Supabase URL and keys
- Check connection pooling configuration
- Ensure pgvector extension is enabled

**3. CORS Issues**
- Verify CORS_ORIGIN environment variable
- Check frontend URL configuration
- Confirm protocol (HTTP vs HTTPS)

**4. Upload Failures**
- Check file size limits
- Verify disk space
- Review processing pipeline logs

### Emergency Procedures

**Backend Down:**
1. Check health endpoint
2. Review application logs
3. Restart service via hosting platform
4. Verify environment variables

**Database Issues:**
1. Check Supabase dashboard
2. Review connection limits
3. Verify migration status
4. Contact Supabase support if needed

## 📞 Support

For deployment issues:
- Review logs in hosting platform dashboard
- Check Supabase logs for database issues
- Monitor API usage in OpenAI/Cohere dashboards
- Use health check endpoint for quick diagnostics

---

*For additional technical details, see [README.md](README.md) and [API.md](API.md)*