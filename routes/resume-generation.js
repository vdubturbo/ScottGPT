/**
 * Resume Generation API Routes
 * Provides AI-powered resume generation in multiple formats
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { ResumeGenerationService } from '../services/resume-generation.js';

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
router.post('/resume', resumeLimiter, async (req, res) => {
  try {
    const {
      template = 'professional',
      outputFormat = 'markdown',
      targetRole = null,
      maxPositions = 8,
      skillCategories = 'auto',
      includeProjects = true,
      includeEducation = true,
      customSections = [],
      enhanceContent = true,
      personalInfo = {},
      preview = false
    } = req.body;

    const options = {
      template,
      outputFormat,
      targetRole,
      maxPositions,
      skillCategories,
      includeProjects,
      includeEducation,
      customSections,
      enhanceContent: enhanceContent && !preview, // Don't enhance for previews
      personalInfo
    };

    logger.info('Resume generation requested', { 
      template, 
      outputFormat, 
      targetRole,
      preview,
      ip: req.ip 
    });

    // Validate template
    const availableTemplates = resumeService.getAvailableTemplates();
    if (!availableTemplates[template]) {
      return res.status(400).json({
        error: 'Invalid template',
        message: `Template '${template}' not found`,
        availableTemplates: Object.keys(availableTemplates)
      });
    }

    // Validate output format
    const supportedFormats = resumeService.getSupportedFormats();
    if (!supportedFormats[outputFormat]) {
      return res.status(400).json({
        error: 'Invalid output format',
        message: `Format '${outputFormat}' not supported`,
        supportedFormats: Object.keys(supportedFormats)
      });
    }

    // Generate resume
    const result = await resumeService.generateResume(options);

    // Set appropriate headers for non-preview requests
    if (!preview) {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = `resume-${template}-${timestamp}.${supportedFormats[outputFormat].extension}`;
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', supportedFormats[outputFormat].mimeType);
    }

    // Return based on format and preview status
    if (preview || outputFormat === 'json') {
      res.json({
        success: true,
        data: result,
        isPreview: preview,
        timestamp: new Date().toISOString()
      });
    } else if (outputFormat === 'markdown' || outputFormat === 'html') {
      res.send(result.content);
    } else {
      // For PDF/DOCX - these would be binary formats
      res.json({
        success: true,
        message: `${outputFormat.toUpperCase()} generation completed`,
        metadata: result.metadata,
        downloadUrl: `/api/user/generate/download/${result.metadata.id}` // Would be implemented
      });
    }

  } catch (error) {
    logger.error('Error in resume generation endpoint', { error: error.message });
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
          features: this.getFormatFeatures(key),
          availability: this.getFormatAvailability(key)
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
router.post('/preview', previewLimiter, async (req, res) => {
  try {
    const options = {
      ...req.body,
      preview: true,
      enhanceContent: false, // Disable AI enhancement for previews
      maxPositions: Math.min(req.body.maxPositions || 5, 5) // Limit positions for preview
    };

    logger.info('Resume preview requested', { 
      template: options.template,
      outputFormat: options.outputFormat,
      ip: req.ip 
    });

    const result = await resumeService.generateResume(options);
    
    // For previews, always return JSON structure
    res.json({
      success: true,
      data: {
        preview: true,
        structure: result.structure,
        metadata: result.metadata,
        recommendations: result.recommendations,
        sampleContent: this.generateSampleContent(result.structure, options.outputFormat),
        limitations: {
          maxPositions: 5,
          enhancementDisabled: true,
          estimatedFullSize: await this.estimateFullResumeSize(result.metadata)
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in resume preview endpoint', { error: error.message });
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
      template = 'professional',
      outputFormat = 'markdown',
      targetRole = null,
      maxPositions = 8,
      personalInfo = {}
    } = req.body;

    logger.info('Resume validation requested', { template, outputFormat, ip: req.ip });

    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    // Validate template
    const availableTemplates = resumeService.getAvailableTemplates();
    if (!availableTemplates[template]) {
      validation.isValid = false;
      validation.errors.push(`Invalid template: ${template}`);
    }

    // Validate output format
    const supportedFormats = resumeService.getSupportedFormats();
    if (!supportedFormats[outputFormat]) {
      validation.isValid = false;
      validation.errors.push(`Unsupported output format: ${outputFormat}`);
    }

    // Validate personal info
    if (!personalInfo.name || personalInfo.name.trim() === '') {
      validation.warnings.push('Name not provided - will use default');
    }

    if (!personalInfo.email || personalInfo.email.trim() === '') {
      validation.warnings.push('Email not provided - consider adding for contact info');
    }

    // Validate position limits
    if (maxPositions < 3) {
      validation.warnings.push('Very few positions selected - resume may appear incomplete');
    } else if (maxPositions > 15) {
      validation.warnings.push('Many positions selected - resume may be too long');
    }

    // Add recommendations
    if (targetRole) {
      validation.recommendations.push('Targeting specific role - content will be optimized accordingly');
    } else {
      validation.recommendations.push('Consider specifying target role for better optimization');
    }

    if (outputFormat === 'pdf' || outputFormat === 'docx') {
      validation.warnings.push(`${outputFormat.toUpperCase()} format requires additional processing time`);
    }

    res.json({
      success: true,
      data: {
        validation,
        estimatedGenerationTime: this.estimateGenerationTime(req.body),
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