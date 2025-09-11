/**
 * Resume Generation API Routes
 * Provides AI-powered resume generation using actual user data and RAG system
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { z } from 'zod';
import ResumeGenerationService from '../services/resume-generation.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Initialize services
const resumeService = new ResumeGenerationService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/resume-generation-api.log' })
  ]
});

// Rate limiting for resume generation
const resumeLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // 5 resume generations per window
  message: { error: 'Too many resume generation requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const previewLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // 15 preview requests per window
  message: { error: 'Too many preview requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// RESUME GENERATION ENDPOINTS
// ============================================================================

/**
 * POST /api/user/generate/resume
 * Generate a complete resume from user data
 */
router.post('/resume', authenticateToken, resumeLimiter, async (req, res) => {
  try {
    const {
      jobDescription,
      style = 'professional',
      maxBulletPoints = 5,
      prioritizeKeywords = true,
      outputFormat = 'html',
      preview = false
    } = req.body;

    // Validate required fields
    if (!jobDescription || jobDescription.trim().length < 50) {
      return res.status(400).json({
        error: 'Invalid job description',
        message: 'Job description must be at least 50 characters long'
      });
    }

    // Get user ID from authenticated request
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to generate resume'
      });
    }

    const options = {
      style,
      maxBulletPoints,
      prioritizeKeywords
    };

    logger.info('Resume generation requested', { 
      userId,
      style, 
      maxBulletPoints,
      preview,
      jobDescriptionLength: jobDescription.length,
      ip: req.ip 
    });

    // Generate resume using actual user data and RAG
    const result = await resumeService.generateResume(jobDescription, userId, options);

    if (!result.success) {
      return res.status(500).json({
        error: 'Resume generation failed',
        message: result.error || 'Unknown error occurred'
      });
    }

    // Return based on format and preview status
    if (preview || outputFormat === 'json') {
      res.json({
        success: true,
        data: {
          resumeHTML: result.resume,
          matchScore: result.matchScore,
          extractedKeywords: result.extractedKeywords,
          sourceData: result.sourceData,
          isPreview: preview
        },
        timestamp: new Date().toISOString()
      });
    } else if (outputFormat === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(result.resume);
    } else {
      // For future PDF/DOCX support
      res.json({
        success: true,
        message: `${outputFormat.toUpperCase()} generation not yet implemented`,
        data: {
          resumeHTML: result.resume,
          matchScore: result.matchScore,
          sourceData: result.sourceData
        }
      });
    }

  } catch (error) {
    logger.error('Error in resume generation endpoint', { 
      error: error.message,
      stack: error.stack,
      userId: req.user?.id 
    });
    res.status(500).json({
      error: 'Failed to generate resume',
      message: error.message
    });
  }
});

/**
 * GET /api/user/generate/templates
 * Get available resume templates
 */
router.get('/templates', async (req, res) => {
  try {
    const templates = resumeService.getAvailableTemplates();
    
    res.json({
      success: true,
      data: {
        templates,
        totalTemplates: Object.keys(templates).length,
        recommendedTemplate: 'professional'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting resume templates', { error: error.message });
    res.status(500).json({
      error: 'Failed to get templates',
      message: error.message
    });
  }
});

/**
 * GET /api/user/generate/formats
 * Get supported output formats
 */
router.get('/formats', async (req, res) => {
  try {
    const formats = resumeService.getSupportedFormats();
    
    // Add feature information for each format
    const enhancedFormats = Object.fromEntries(
      Object.entries(formats).map(([key, format]) => [
        key,
        {
          ...format,
          features: getFormatFeatures(key),
          availability: getFormatAvailability(key)
        }
      ])
    );
    
    res.json({
      success: true,
      data: {
        formats: enhancedFormats,
        totalFormats: Object.keys(formats).length,
        recommendedFormat: 'markdown'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting resume formats', { error: error.message });
    res.status(500).json({
      error: 'Failed to get formats',
      message: error.message
    });
  }
});

/**
 * POST /api/user/generate/preview
 * Generate a preview of resume content
 */
router.post('/preview', authenticateToken, previewLimiter, async (req, res) => {
  try {
    const {
      jobDescription,
      style = 'professional',
      maxBulletPoints = 3 // Reduced for preview
    } = req.body;

    // Validate required fields
    if (!jobDescription || jobDescription.trim().length < 20) {
      return res.status(400).json({
        error: 'Invalid job description',
        message: 'Job description must be at least 20 characters for preview'
      });
    }

    // Get user ID from authenticated request
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'User must be authenticated to generate preview'
      });
    }

    const options = {
      style,
      maxBulletPoints,
      prioritizeKeywords: true
    };

    logger.info('Resume preview requested', { 
      userId,
      style,
      jobDescriptionLength: jobDescription.length,
      ip: req.ip 
    });

    const result = await resumeService.generateResume(jobDescription, userId, options);
    
    if (!result.success) {
      return res.status(500).json({
        error: 'Preview generation failed',
        message: result.error || 'Unknown error occurred'
      });
    }

    // For previews, return truncated content
    const previewHTML = result.resume.substring(0, 2000) + (result.resume.length > 2000 ? '...' : '');
    
    res.json({
      success: true,
      data: {
        preview: true,
        resumeHTML: previewHTML,
        matchScore: result.matchScore,
        extractedKeywords: result.extractedKeywords,
        sourceData: {
          ...result.sourceData,
          note: 'Preview limited to first 2000 characters'
        },
        limitations: {
          maxBulletPoints: 3,
          previewLength: 2000,
          fullLength: result.resume.length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in resume preview endpoint', { 
      error: error.message,
      userId: req.user?.id 
    });
    res.status(500).json({
      error: 'Failed to generate preview',
      message: error.message
    });
  }
});

/**
 * POST /api/user/generate/validate
 * Validate resume generation options
 */
router.post('/validate', previewLimiter, async (req, res) => {
  try {
    const {
      jobDescription,
      style = 'professional',
      maxBulletPoints = 5,
      outputFormat = 'html'
    } = req.body;

    logger.info('Resume validation requested', { style, outputFormat, ip: req.ip });

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Validate job description
    if (!jobDescription || jobDescription.trim().length < 50) {
      validation.isValid = false;
      validation.errors.push('Job description must be at least 50 characters long');
    }

    // Validate style
    const availableTemplates = resumeService.getAvailableTemplates();
    if (!availableTemplates[style]) {
      validation.isValid = false;
      validation.errors.push(`Invalid style: ${style}`);
    }

    // Validate output format
    const supportedFormats = resumeService.getSupportedFormats();
    if (!supportedFormats[outputFormat]) {
      validation.isValid = false;
      validation.errors.push(`Unsupported output format: ${outputFormat}`);
    }

    // Validate bullet points
    if (maxBulletPoints < 2) {
      validation.warnings.push('Very few bullet points - resume may appear incomplete');
    } else if (maxBulletPoints > 8) {
      validation.warnings.push('Many bullet points - resume may be too verbose');
    }

    // Add recommendations
    if (jobDescription && jobDescription.length > 500) {
      validation.recommendations.push('Good detailed job description provided - will enable better targeting');
    } else if (jobDescription && jobDescription.length < 200) {
      validation.recommendations.push('Consider providing more details in job description for better targeting');
    }

    if (outputFormat === 'pdf' || outputFormat === 'docx') {
      validation.warnings.push(`${outputFormat.toUpperCase()} format not yet implemented - will return HTML`);
    }

    res.json({
      success: true,
      data: {
        validation,
        estimatedGenerationTime: estimateGenerationTime(req.body),
        recommendations: validation.recommendations
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in resume validation endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to validate resume options',
      message: error.message
    });
  }
});

// ============================================================================
// DEVELOPMENT TESTING ENDPOINTS (bypass auth for testing)
// ============================================================================

/**
 * POST /api/user/generate/test-resume
 * Test resume generation with mock user ID (development only)
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/test-resume', resumeLimiter, async (req, res) => {
    try {
      const {
        jobDescription,
        userId = 'test-user-id', // Default test user ID
        style = 'professional',
        maxBulletPoints = 5,
        prioritizeKeywords = true,
        outputFormat = 'html'
      } = req.body;

      // Validate required fields
      if (!jobDescription || jobDescription.trim().length < 50) {
        return res.status(400).json({
          error: 'Invalid job description',
          message: 'Job description must be at least 50 characters long'
        });
      }

      const options = {
        style,
        maxBulletPoints,
        prioritizeKeywords
      };

      logger.info('TEST Resume generation requested', { 
        userId,
        style, 
        maxBulletPoints,
        jobDescriptionLength: jobDescription.length,
        ip: req.ip 
      });

      // Generate resume using actual user data and RAG
      const result = await resumeService.generateResume(jobDescription, userId, options);

      if (!result.success) {
        return res.status(500).json({
          error: 'Resume generation failed',
          message: result.error || 'Unknown error occurred'
        });
      }

      // Return detailed response for testing
      res.json({
        success: true,
        testMode: true,
        data: {
          resumeHTML: result.resume,
          matchScore: result.matchScore,
          extractedKeywords: result.extractedKeywords,
          sourceData: result.sourceData
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('Error in TEST resume generation endpoint', { 
        error: error.message,
        stack: error.stack,
        testUserId: req.body.userId 
      });
      res.status(500).json({
        error: 'Failed to generate test resume',
        message: error.message,
        testMode: true
      });
    }
  });
}

// ============================================================================
// HELPER METHODS
// ============================================================================

/**
 * Get features for each format
 */
function getFormatFeatures(format) {
  const features = {
    markdown: [
      'Human-readable',
      'Version control friendly',
      'Easy to edit',
      'Platform independent'
    ],
    html: [
      'Web-ready',
      'Styled presentation',
      'Interactive elements',
      'Print-friendly'
    ],
    pdf: [
      'Professional formatting',
      'Print-ready',
      'Universal compatibility',
      'Fixed layout'
    ],
    docx: [
      'Microsoft Word compatible',
      'Editable format',
      'Corporate standard',
      'Template support'
    ]
  };

  return features[format] || [];
}

/**
 * Get format availability
 */
function getFormatAvailability(format) {
  const availability = {
    markdown: 'available',
    html: 'available',
    pdf: 'development', // Would be 'available' when implemented
    docx: 'development'  // Would be 'available' when implemented
  };

  return availability[format] || 'unknown';
}

/**
 * Generate sample content for preview
 */
function generateSampleContent(structure, outputFormat) {
  if (outputFormat === 'markdown') {
    let sample = `# ${structure.header.name}\n`;
    sample += `## ${structure.header.title || 'Professional Title'}\n\n`;
    
    if (structure.experience && structure.experience.length > 0) {
      const firstJob = structure.experience[0];
      sample += `### ${firstJob.title}\n`;
      sample += `**${firstJob.organization}** • ${firstJob.duration}\n\n`;
      sample += '...[additional content]...\n';
    }
    
    return sample;
  } else if (outputFormat === 'html') {
    return `<h1>${structure.header.name}</h1>\n<h2>${structure.header.title || 'Professional Title'}</h2>\n<p>...[additional content]...</p>`;
  }
  
  return 'Preview content would be generated here';
}

/**
 * Estimate full resume size
 */
async function estimateFullResumeSize(metadata) {
  const estimatedWords = metadata.positionsIncluded * 150; // ~150 words per position
  const estimatedPages = Math.ceil(estimatedWords / 500); // ~500 words per page
  
  return {
    estimatedWords,
    estimatedPages,
    estimatedReadingTime: `${Math.ceil(estimatedWords / 200)} minutes`
  };
}

/**
 * Estimate generation time
 */
function estimateGenerationTime(options) {
  let baseTime = 5; // 5 seconds base
  
  if (options.enhanceContent) {
    baseTime += options.maxPositions * 3; // 3 seconds per position for AI enhancement
  }
  
  if (options.outputFormat === 'pdf' || options.outputFormat === 'docx') {
    baseTime += 10; // Additional time for binary formats
  }
  
  return `${baseTime}-${baseTime + 10} seconds`;
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in resume-generation router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred during resume generation'
  });
});

export default router;