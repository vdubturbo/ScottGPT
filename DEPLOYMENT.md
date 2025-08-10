# ScottGPT Deployment Guide

This guide covers deploying ScottGPT to production environments with recommendations for various hosting platforms.

## Production Architecture

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
│  (CloudFlare)   │    │  (S3/DigitalOcean)│   │ (DataDog/Sentry)│
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

## Prerequisites

- Domain name (optional but recommended)
- SSL certificate (handled by hosting platforms)
- Production API keys for:
  - OpenAI (GPT-4 with higher rate limits)
  - Cohere (paid plan for embeddings)
  - Supabase (Pro plan for production workloads)

## Environment Setup

### Production Environment Variables

Create a production `.env` file with the following:

```bash
# Environment
NODE_ENV=production
PORT=5000

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key

# AI Services
OPENAI_API_KEY=your_production_openai_key
COHERE_API_KEY=your_production_cohere_key

# Security
SESSION_SECRET=your_super_secure_random_string
JWT_SECRET=your_jwt_secret_key
CORS_ORIGIN=https://your-domain.com

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
DATADOG_API_KEY=your_datadog_key

# Rate Limiting
REDIS_URL=redis://your-redis-instance
```

## Backend Deployment

### Option 1: Railway (Recommended)

Railway offers excellent Node.js support with automatic deployments.

1. **Connect Repository**
   ```bash
   # Install Railway CLI
   npm install -g @railway/cli
   
   # Login and link project
   railway login
   railway link
   ```

2. **Configure Environment**
   ```bash
   # Set environment variables
   railway variables:set NODE_ENV=production
   railway variables:set SUPABASE_URL=your_url
   # ... set all other environment variables
   ```

3. **Deploy**
   ```bash
   railway deploy
   ```

4. **Custom Domain**
   ```bash
   railway domain add api.your-domain.com
   ```

### Option 2: Render

1. **Create Web Service**
   - Connect GitHub repository
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`

2. **Environment Variables**
   - Add all production environment variables in Render dashboard

3. **Custom Domain**
   - Configure custom domain in Render settings

### Option 3: Heroku

```bash
# Install Heroku CLI and login
heroku login

# Create application
heroku create scottgpt-api

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SUPABASE_URL=your_url
# ... set all other variables

# Deploy
git push heroku main
```

### Option 4: DigitalOcean App Platform

1. Create new App from GitHub
2. Configure build settings:
   - Build Command: `npm install`
   - Run Command: `npm start`
3. Add environment variables
4. Deploy

## Frontend Deployment

### Option 1: Netlify (Recommended)

1. **Build Configuration**
   Create `netlify.toml`:
   ```toml
   [build]
     command = "cd client && npm install && npm run build"
     publish = "client/build"

   [[redirects]]
     from = "/api/*"
     to = "https://your-api-domain.com/api/:splat"
     status = 200
     force = true

   [[redirects]]
     from = "/*"
     to = "/index.html"
     status = 200
   ```

2. **Environment Variables**
   Add to Netlify dashboard:
   ```
   REACT_APP_API_URL=https://your-api-domain.com
   REACT_APP_ENVIRONMENT=production
   ```

3. **Deploy**
   - Connect GitHub repository
   - Auto-deploy on push to main branch

### Option 2: Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Configure project
cd client
vercel

# Set environment variables
vercel env add REACT_APP_API_URL production
```

### Option 3: GitHub Pages

```bash
# Build and deploy script
cd client
npm run build
npx gh-pages -d build
```

## Database Setup

### Supabase Production Configuration

1. **Upgrade to Pro Plan**
   - Higher connection limits
   - Increased compute resources
   - Extended backup retention

2. **Security Configuration**
   ```sql
   -- Enable Row Level Security
   ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
   ALTER TABLE content_chunks ENABLE ROW LEVEL SECURITY;
   
   -- Create policies for API access
   CREATE POLICY "Public read access" ON sources
   FOR SELECT USING (true);
   
   CREATE POLICY "Service role full access" ON sources
   FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
   ```

3. **Performance Optimization**
   ```sql
   -- Optimize vector search
   CREATE INDEX CONCURRENTLY idx_content_chunks_embedding_hnsw 
   ON content_chunks 
   USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   
   -- Optimize metadata queries
   CREATE INDEX CONCURRENTLY idx_sources_type_date 
   ON sources (type, date_start DESC);
   ```

4. **Backup Strategy**
   - Enable automated backups
   - Configure backup retention (30 days recommended)
   - Test restoration procedures

## Security Hardening

### Application Security

1. **CORS Configuration**
   ```javascript
   const cors = require('cors');
   
   app.use(cors({
     origin: process.env.CORS_ORIGIN?.split(',') || 'http://localhost:3000',
     credentials: true,
     optionsSuccessStatus: 200
   }));
   ```

2. **Rate Limiting**
   ```javascript
   const rateLimit = require('express-rate-limit');
   
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15 minutes
     max: 100, // limit each IP to 100 requests per windowMs
     message: 'Too many requests from this IP'
   });
   
   app.use(limiter);
   ```

3. **Input Validation**
   ```javascript
   const { body, validationResult } = require('express-validator');
   
   app.post('/api/chat', [
     body('message').isLength({ min: 1, max: 1000 }).trim().escape()
   ], (req, res) => {
     const errors = validationResult(req);
     if (!errors.isEmpty()) {
       return res.status(400).json({ errors: errors.array() });
     }
     // ... handle request
   });
   ```

### Infrastructure Security

1. **SSL/TLS**
   - Use HTTPS everywhere (handled by hosting platforms)
   - Implement HSTS headers

2. **Environment Variables**
   - Never commit secrets to git
   - Use platform-specific secret management
   - Rotate keys regularly

3. **Network Security**
   - Configure firewall rules
   - Use VPC/private networks where available
   - Restrict database access to application servers only

## Performance Optimization

### Backend Optimization

1. **Caching Strategy**
   ```javascript
   const Redis = require('ioredis');
   const redis = new Redis(process.env.REDIS_URL);
   
   // Cache search results
   app.get('/api/search', async (req, res) => {
     const cacheKey = `search:${JSON.stringify(req.query)}`;
     const cached = await redis.get(cacheKey);
     
     if (cached) {
       return res.json(JSON.parse(cached));
     }
     
     const results = await searchContent(req.query);
     await redis.setex(cacheKey, 300, JSON.stringify(results)); // 5 min cache
     res.json(results);
   });
   ```

2. **Database Connection Pooling**
   ```javascript
   const { createClient } = require('@supabase/supabase-js');
   
   const supabase = createClient(
     process.env.SUPABASE_URL,
     process.env.SUPABASE_SERVICE_ROLE_KEY,
     {
       db: {
         schema: 'public',
         max: 20, // Maximum number of connections
         idleTimeoutMillis: 30000,
       }
     }
   );
   ```

3. **Response Compression**
   ```javascript
   const compression = require('compression');
   app.use(compression());
   ```

### Frontend Optimization

1. **Build Optimization**
   ```json
   {
     "scripts": {
       "build": "GENERATE_SOURCEMAP=false react-scripts build",
       "build:analyze": "npm run build && npx bundle-analyzer build/static/js/*.js"
     }
   }
   ```

2. **CDN Configuration**
   - Use CDN for static assets
   - Configure proper cache headers
   - Enable gzip compression

## Monitoring and Logging

### Application Monitoring

1. **Error Tracking with Sentry**
   ```javascript
   const Sentry = require('@sentry/node');
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV
   });
   
   app.use(Sentry.Handlers.errorHandler());
   ```

2. **Performance Monitoring**
   ```javascript
   // Custom metrics
   const promClient = require('prom-client');
   
   const httpRequestDuration = new promClient.Histogram({
     name: 'http_request_duration_ms',
     help: 'Duration of HTTP requests in ms',
     labelNames: ['route', 'method', 'status']
   });
   ```

3. **Health Checks**
   ```javascript
   app.get('/health', async (req, res) => {
     try {
       // Check database connection
       await supabase.from('sources').select('count').limit(1);
       
       // Check external APIs
       const openaiStatus = await checkOpenAI();
       const cohereStatus = await checkCohere();
       
       res.json({
         status: 'healthy',
         timestamp: new Date().toISOString(),
         services: {
           database: 'up',
           openai: openaiStatus,
           cohere: cohereStatus
         }
       });
     } catch (error) {
       res.status(500).json({
         status: 'unhealthy',
         error: error.message
       });
     }
   });
   ```

### Log Management

1. **Structured Logging**
   ```javascript
   const winston = require('winston');
   
   const logger = winston.createLogger({
     level: process.env.LOG_LEVEL || 'info',
     format: winston.format.combine(
       winston.format.timestamp(),
       winston.format.json()
     ),
     transports: [
       new winston.transports.Console(),
       new winston.transports.File({ filename: 'app.log' })
     ]
   });
   ```

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancing**
   - Use platform load balancers
   - Configure session stickiness if needed
   - Health check configuration

2. **Database Scaling**
   ```sql
   -- Read replicas for search queries
   -- Connection pooling with PgBouncer
   -- Query optimization with EXPLAIN ANALYZE
   ```

3. **Caching Layers**
   - Redis for session storage
   - CDN for static content
   - Application-level caching

### Auto-scaling Configuration

```yaml
# Railway railway.toml
[deploy]
  startCommand = "npm start"
  healthcheckPath = "/health"

[scaling]
  minReplicas = 1
  maxReplicas = 10
  targetCPU = 70
```

## Backup and Recovery

### Database Backups

1. **Automated Backups**
   - Supabase Pro includes automated backups
   - Configure retention period
   - Test restoration procedures

2. **Application Data**
   ```bash
   # Backup script
   #!/bin/bash
   pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql
   aws s3 cp backup_*.sql s3://your-backup-bucket/
   ```

### Disaster Recovery Plan

1. **RTO/RPO Targets**
   - Recovery Time Objective: < 1 hour
   - Recovery Point Objective: < 15 minutes

2. **Recovery Procedures**
   - Database restoration steps
   - Application redeployment
   - DNS failover configuration

## Cost Optimization

### Resource Monitoring

1. **API Usage Tracking**
   ```javascript
   // Track API costs
   const trackAPIUsage = async (provider, operation, tokens) => {
     await supabase.from('api_usage').insert({
       provider,
       operation,
       tokens,
       cost: calculateCost(provider, operation, tokens),
       timestamp: new Date()
     });
   };
   ```

2. **Database Usage**
   - Monitor connection counts
   - Optimize query performance
   - Use read replicas for analytics

### Cost-Saving Strategies

1. **Caching**
   - Cache expensive API calls
   - Implement smart cache invalidation
   - Use CDN for static content

2. **Resource Optimization**
   - Right-size server instances
   - Use spot instances where appropriate
   - Implement auto-scaling policies

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   ```javascript
   // Connection retry logic
   const connectWithRetry = async (retries = 3) => {
     try {
       await supabase.from('sources').select('count').limit(1);
     } catch (error) {
       if (retries > 0) {
         await new Promise(resolve => setTimeout(resolve, 1000));
         return connectWithRetry(retries - 1);
       }
       throw error;
     }
   };
   ```

2. **API Rate Limiting**
   ```javascript
   // Exponential backoff
   const apiCallWithBackoff = async (apiCall, maxRetries = 3) => {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await apiCall();
       } catch (error) {
         if (error.status === 429 && i < maxRetries - 1) {
           const delay = Math.pow(2, i) * 1000;
           await new Promise(resolve => setTimeout(resolve, delay));
         } else {
           throw error;
         }
       }
     }
   };
   ```

3. **Memory Leaks**
   ```javascript
   // Memory monitoring
   setInterval(() => {
     const used = process.memoryUsage();
     logger.info('Memory usage:', used);
     
     if (used.heapUsed > 512 * 1024 * 1024) { // 512MB
       logger.warn('High memory usage detected');
     }
   }, 60000);
   ```

### Debug Commands

```bash
# Check application logs
railway logs
heroku logs --tail

# Database queries
psql $DATABASE_URL -c "SELECT count(*) FROM content_chunks;"

# Performance monitoring
curl https://your-api.com/health
curl https://your-api.com/api/upload/stats
```

## Maintenance

### Regular Tasks

1. **Weekly**
   - Review error logs
   - Check API usage and costs
   - Monitor performance metrics

2. **Monthly**
   - Update dependencies
   - Security audit
   - Backup testing

3. **Quarterly**
   - Capacity planning review
   - Security penetration testing
   - Disaster recovery testing

### Update Procedures

```bash
# Safe deployment process
1. Deploy to staging environment
2. Run integration tests
3. Database migrations (if any)
4. Blue-green deployment to production
5. Monitor health checks
6. Rollback plan ready
```

This deployment guide ensures a robust, scalable, and maintainable production deployment of ScottGPT.