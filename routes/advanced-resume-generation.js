/**
 * Advanced Resume Generation API Routes
 * Uses the new JD Pipeline for sophisticated resume generation
 * Provides enhanced features alongside the existing resume generation
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import AdvancedResumeGenerationService from '../services/advanced-resume-generation.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  checkResumeGenerationLimit,
  incrementResumeUsage,
  addUsageToResponse,
  sendUsageAwareResponse
} from '../middleware/usage-tracking.js';

const router = express.Router();

// Initialize services
const advancedResumeService = new AdvancedResumeGenerationService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/advanced-resume-api.log' })
  ]
});

// Rate limiting for advanced resume generation
const advancedResumeLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 3, // Fewer attempts due to higher computational cost
  message: { error: 'Too many advanced resume generation requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const previewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 preview requests per window
  message: { error: 'Too many preview requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// ADVANCED RESUME GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/user/advanced-generate/resume
 * Generate resume using advanced JD pipeline
 */
router.post('/resume', authenticateToken, checkResumeGenerationLimit, addUsageToResponse, advancedResumeLimiter, async (req, res) => {
  try {
    const {
      jobDescription,
      style = 'ats-optimized',
      maxBulletPoints = 5,
      prioritizeKeywords = true,
      outputFormat = 'html',
      preview = false
    } = req.body;

    // Validate required fields
    if (!jobDescription || jobDescription.trim().length < 100) {
      return res.status(400).json({
        error: 'Invalid job description',
        message: 'Job description must be at least 100 characters long for advanced processing'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to generate advanced resume'
      });
    }

    const options = {
      style,
      maxBulletPoints,
      prioritizeKeywords
    };

    logger.info('Advanced resume generation requested', { 
      userId,
      style, 
      maxBulletPoints,
      preview,
      jobDescriptionLength: jobDescription.length,
      ip: req.ip 
    });

    console.log(`🚀 [ADVANCED] Starting resume generation for user: ${userId}`);
    
    // Generate resume using advanced JD pipeline
    const result = await advancedResumeService.generateResume(jobDescription, userId, options);

    console.log(`🔍 [ADVANCED] Resume service result:`, {
      success: result.success,
      hasResume: !!result.resume,
      resumeLength: result.resume?.length || 0,
      matchScore: result.matchScore,
      coveragePercent: result.sourceData?.coveragePercent,
      advancedPipeline: result.sourceData?.advancedPipeline
    });

    if (!result.success) {
      console.error(`❌ [ADVANCED] Resume generation failed:`, result.error);
      return res.status(500).json({
        error: 'Advanced resume generation failed',
        message: result.error || 'Unknown error occurred',
        advancedPipeline: true
      });
    }

    // Additional validation: Ensure resume content exists and is valid
    if (!result.resumeHTML || typeof result.resumeHTML !== 'string' || result.resumeHTML.trim().length < 100) {
      console.error(`❌ [ADVANCED] Invalid resume content received from service:`, {
        hasResumeHTML: !!result.resumeHTML,
        resumeType: typeof result.resumeHTML,
        resumeLength: result.resumeHTML?.length || 0
      });
      return res.status(500).json({
        error: 'Advanced resume generation failed',
        message: 'Invalid or insufficient resume content generated',
        advancedPipeline: true
      });
    }

    // Return enhanced response with coverage data
    if (preview || outputFormat === 'json') {
      const responseData = {
        success: true,
        data: {
          resumeHTML: result.resumeHTML, // Fixed: Now correctly expects resumeHTML from service
          matchScore: result.matchScore,
          extractedKeywords: result.extractedKeywords,
          sourceData: {
            ...result.sourceData,
            coverageReport: result.sourceData?.coverageReport?.map(item => {
              // Handle new smart coverage format (already correct)
              if (item.requirement && typeof item.covered === 'boolean') {
                return item; // Already in correct format
              }
              // Handle old format (legacy)
              return {
                requirement: item.mustHave,
                covered: item.present,
                evidenceCount: item.evidenceIds?.length || 0
              };
            }) || []
          },
          isPreview: preview,
          advancedPipeline: true,
          enhancedFeatures: {
            coverageTracking: true,
            evidenceMapping: true,
            tokenOptimization: true,
            hybridRetrieval: true
          }
        },
        timestamp: new Date().toISOString()
      };
      
      console.log(`✅ [ADVANCED] Sending enhanced JSON response:`, {
        success: responseData.success,
        hasData: !!responseData.data,
        coveragePercent: responseData.data.sourceData.coveragePercent,
        requirementCount: responseData.data.sourceData.coverageReport?.length || 0
      });
      
      // Debug: Log first few coverage items to verify format
      console.log(`🔍 [ADVANCED] First 3 coverage items:`, JSON.stringify(responseData.data.sourceData.coverageReport?.slice(0, 3), null, 2));
      
      // Add cache-busting headers
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      
      res.json(responseData);
    } else if (outputFormat === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(result.resumeHTML); // Fixed: Use resumeHTML field
    } else {
      res.json({
        success: true,
        message: `${outputFormat.toUpperCase()} generation not yet implemented`,
        data: {
          resumeHTML: result.resumeHTML, // Fixed: Use resumeHTML field consistently
          matchScore: result.matchScore,
          sourceData: result.sourceData,
          advancedPipeline: true
        }
      });
    }

  } catch (error) {
    logger.error('Error in advanced resume generation endpoint', { 
      error: error.message,
      stack: error.stack,
      userId: req.user?.id 
    });
    res.status(500).json({
      error: 'Failed to generate advanced resume',
      message: error.message,
      advancedPipeline: true
    });
  }
});

/**
 * POST /api/user/advanced-generate/preview
 * Generate preview using advanced pipeline
 */
router.post('/preview', authenticateToken, previewLimiter, async (req, res) => {
  try {
    const {
      jobDescription,
      style = 'ats-optimized',
      maxBulletPoints = 3
    } = req.body;

    if (!jobDescription || jobDescription.trim().length < 50) {
      return res.status(400).json({
        error: 'Invalid job description',
        message: 'Job description must be at least 50 characters for advanced preview'
      });
    }

    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to generate advanced preview'
      });
    }

    const options = { style, maxBulletPoints, prioritizeKeywords: true };

    logger.info('Advanced resume preview requested', { 
      userId,
      style,
      jobDescriptionLength: jobDescription.length,
      ip: req.ip 
    });

    const result = await advancedResumeService.generatePreview(jobDescription, userId, options);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Advanced preview generation failed',
        message: result.error || 'Unknown error occurred',
        advancedPipeline: true
      });
    }

    res.json({
      success: true,
      data: {
        preview: true,
        resumeHTML: result.resume,
        matchScore: result.matchScore,
        extractedKeywords: result.extractedKeywords,
        sourceData: {
          ...result.sourceData,
          note: 'Advanced pipeline preview with enhanced features'
        },
        advancedPipeline: true,
        enhancedFeatures: {
          intelligentTrimming: true,
          coverageOptimization: true,
          evidenceRanking: true
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in advanced preview endpoint', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({
      error: 'Failed to generate advanced preview',
      message: error.message,
      advancedPipeline: true
    });
  }
});

/**
 * GET /api/user/advanced-generate/health
 * Get advanced pipeline health status
 */
router.get('/health', async (req, res) => {
  try {
    const health = await advancedResumeService.getHealthStatus();
    
    res.json({
      success: true,
      data: {
        ...health,
        advancedPipeline: true,
        features: {
          jdParsing: true,
          hybridRetrieval: true,
          crossEncoderReranking: true,
          evidenceCompression: true,
          tokenBudgeting: true,
          coverageTracking: true
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting advanced pipeline health', { error: error.message });
    res.status(500).json({
      error: 'Failed to get health status',
      message: error.message,
      advancedPipeline: true
    });
  }
});

/**
 * GET /api/user/advanced-generate/metrics
 * Get advanced pipeline metrics
 */
router.get('/metrics', async (req, res) => {
  try {
    const metrics = await advancedResumeService.getMetrics();
    
    res.json({
      success: true,
      data: {
        ...metrics,
        advancedPipeline: true
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting advanced pipeline metrics', { error: error.message });
    res.status(500).json({
      error: 'Failed to get metrics',
      message: error.message,
      advancedPipeline: true
    });
  }
});

/**
 * GET /api/user/advanced-generate/templates
 * Get enhanced resume templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = advancedResumeService.getAvailableTemplates();
    
    res.json({
      success: true,
      data: {
        templates,
        totalTemplates: Object.keys(templates).length,
        recommendedTemplate: 'ats-optimized',
        advancedPipeline: true,
        enhancedFeatures: [
          'Coverage tracking',
          'Evidence mapping', 
          'Token optimization',
          'Hybrid retrieval',
          'Intelligent ranking'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting advanced templates', { error: error.message });
    res.status(500).json({
      error: 'Failed to get templates',
      message: error.message,
      advancedPipeline: true
    });
  }
});

/**
 * POST /api/user/advanced-generate/validate
 * Validate advanced resume generation options
 */
router.post('/validate', previewLimiter, async (req, res) => {
  try {
    const { jobDescription, style = 'ats-optimized', outputFormat = 'html' } = req.body;

    logger.info('Advanced resume validation requested', { style, outputFormat, ip: req.ip });

    const validation = advancedResumeService.validateOptions(jobDescription, req.body);

    // Add advanced-specific recommendations
    if (jobDescription && jobDescription.length > 1000) {
      validation.recommendations.push('Detailed job description enables superior requirement extraction and coverage analysis');
    }

    if (!jobDescription?.includes('must have') && !jobDescription?.includes('required')) {
      validation.recommendations.push('Including explicit requirements improves coverage tracking accuracy');
    }

    res.json({
      success: true,
      data: {
        validation,
        estimatedGenerationTime: '15-30 seconds (enhanced processing)',
        advancedPipeline: true,
        enhancedValidation: {
          requirementExtraction: true,
          coveragePrediction: true,
          tokenBudgetEstimate: true
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in advanced validation endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to validate advanced resume options',
      message: error.message,
      advancedPipeline: true
    });
  }
});

// ============================================================================
// DEVELOPMENT TESTING ENDPOINTS (bypass auth for testing)
// ============================================================================

/**
 * POST /api/user/advanced-generate/test-resume
 * Test advanced resume generation (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/test-resume', advancedResumeLimiter, async (req, res) => {
    try {
      const {
        jobDescription,
        userId = 'test-user-id',
        style = 'ats-optimized',
        maxBulletPoints = 5,
        prioritizeKeywords = true,
        outputFormat = 'html'
      } = req.body;

      if (!jobDescription || jobDescription.trim().length < 100) {
        return res.status(400).json({
          error: 'Invalid job description',
          message: 'Job description must be at least 100 characters for testing'
        });
      }

      const options = { style, maxBulletPoints, prioritizeKeywords };

      logger.info('TEST Advanced resume generation requested', { 
        userId,
        style, 
        maxBulletPoints,
        jobDescriptionLength: jobDescription.length,
        ip: req.ip 
      });

      const result = await advancedResumeService.generateResume(jobDescription, userId, options);

      if (!result.success) {
        return res.status(500).json({
          error: 'Advanced resume generation failed',
          message: result.error || 'Unknown error occurred',
          advancedPipeline: true
        });
      }

      res.json({
        success: true,
        testMode: true,
        data: {
          resumeHTML: result.resume,
          matchScore: result.matchScore,
          extractedKeywords: result.extractedKeywords,
          sourceData: result.sourceData,
          advancedPipeline: true
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error in TEST advanced resume generation endpoint', { 
        error: error.message,
        stack: error.stack,
        testUserId: req.body.userId 
      });
      res.status(500).json({
        error: 'Failed to generate test advanced resume',
        message: error.message,
        testMode: true,
        advancedPipeline: true
      });
    }
  });
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in advanced-resume-generation router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred during advanced resume generation',
    advancedPipeline: true
  });
});

export default router;