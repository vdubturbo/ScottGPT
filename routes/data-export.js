/**
 * Data Export API Routes
 * Provides comprehensive export capabilities with validation and preview options
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { DataExportService } from '../services/data-export.js';

const router = express.Router();

// Initialize services
const exportService = new DataExportService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/data-export-api.log' })
  ]
});

// Rate limiting for export operations
const exportLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 export requests per window
  message: { error: 'Too many export requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const previewLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 preview requests per window
  message: { error: 'Too many preview requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// EXPORT DATA ENDPOINTS
// ============================================================================

/**
 * GET /api/user/export/json
 * Export complete work history as structured JSON
 */
router.get('/json', exportLimiter, async (req, res) => {
  try {
    const {
      includeChunks = 'false',
      includeEmbeddings = 'false',
      validate = 'true',
      startDate,
      endDate,
      preview = 'false'
    } = req.query;

    const options = {
      includeChunks: includeChunks === 'true',
      includeEmbeddings: includeEmbeddings === 'true',
      validate: validate === 'true',
      dateRange: (startDate || endDate) ? { start: startDate, end: endDate } : null
    };

    logger.info('JSON export requested', { 
      options, 
      preview: preview === 'true',
      ip: req.ip 
    });

    // Validate request
    const validation = await exportService.validateExportRequest('json', options);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Export validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Generate preview or full export
    let result;
    if (preview === 'true') {
      result = await exportService.generateExportPreview('json', options);
    } else {
      result = await exportService.exportJSON(options);
    }

    // Set appropriate headers
    if (preview !== 'true') {
      const filename = `scottgpt-data-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
    }

    res.json({
      success: true,
      data: result,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in JSON export endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to export JSON data',
      message: error.message
    });
  }
});

/**
 * GET /api/user/export/csv
 * Export data in CSV format for spreadsheet tools
 */
router.get('/csv', exportLimiter, async (req, res) => {
  try {
    const {
      includeSkills = 'true',
      startDate,
      endDate,
      preview = 'false'
    } = req.query;

    const options = {
      includeSkills: includeSkills === 'true',
      dateRange: (startDate || endDate) ? { start: startDate, end: endDate } : null
    };

    logger.info('CSV export requested', { 
      options, 
      preview: preview === 'true',
      ip: req.ip 
    });

    // Validate request
    const validation = await exportService.validateExportRequest('csv', options);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Export validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Generate preview or full export
    let result;
    if (preview === 'true') {
      result = await exportService.generateExportPreview('csv', options);
      res.json({
        success: true,
        data: result,
        validation,
        timestamp: new Date().toISOString()
      });
    } else {
      result = await exportService.exportCSV(options);
      
      // Set CSV headers
      const filename = `scottgpt-data-${new Date().toISOString().split('T')[0]}.csv`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'text/csv');
      
      res.send(result);
    }

  } catch (error) {
    logger.error('Error in CSV export endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to export CSV data',
      message: error.message
    });
  }
});

/**
 * GET /api/user/export/resume-data
 * Export clean data optimized for resume generation
 */
router.get('/resume-data', exportLimiter, async (req, res) => {
  try {
    const {
      maxJobs,
      skillLimit = '50',
      includeOutcomes = 'true',
      minDurationMonths = '1',
      excludeIndustries,
      preview = 'false'
    } = req.query;

    const options = {
      maxJobs: maxJobs ? parseInt(maxJobs) : null,
      skillLimit: parseInt(skillLimit),
      includeOutcomes: includeOutcomes === 'true',
      minDurationMonths: parseInt(minDurationMonths),
      excludeIndustries: excludeIndustries ? excludeIndustries.split(',') : []
    };

    logger.info('Resume data export requested', { 
      options, 
      preview: preview === 'true',
      ip: req.ip 
    });

    // Validate request
    const validation = await exportService.validateExportRequest('resumeData', options);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Export validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Generate preview or full export
    let result;
    if (preview === 'true') {
      result = await exportService.generateExportPreview('resumeData', options);
    } else {
      result = await exportService.exportResumeData(options);
    }

    // Set appropriate headers
    if (preview !== 'true') {
      const filename = `scottgpt-resume-data-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
    }

    res.json({
      success: true,
      data: result,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in resume data export endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to export resume data',
      message: error.message
    });
  }
});

/**
 * GET /api/user/export/timeline
 * Export chronological career timeline data
 */
router.get('/timeline', exportLimiter, async (req, res) => {
  try {
    const {
      includeGaps = 'true',
      includeOverlaps = 'true',
      groupByYear = 'false',
      includeSkillEvolution = 'true',
      preview = 'false'
    } = req.query;

    const options = {
      includeGaps: includeGaps === 'true',
      includeOverlaps: includeOverlaps === 'true',
      groupByYear: groupByYear === 'true',
      includeSkillEvolution: includeSkillEvolution === 'true'
    };

    logger.info('Timeline export requested', { 
      options, 
      preview: preview === 'true',
      ip: req.ip 
    });

    // Validate request
    const validation = await exportService.validateExportRequest('timeline', options);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Export validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    // Generate preview or full export
    let result;
    if (preview === 'true') {
      result = await exportService.generateExportPreview('timeline', options);
    } else {
      result = await exportService.exportTimeline(options);
    }

    // Set appropriate headers
    if (preview !== 'true') {
      const filename = `scottgpt-timeline-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'application/json');
    }

    res.json({
      success: true,
      data: result,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in timeline export endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to export timeline data',
      message: error.message
    });
  }
});

// ============================================================================
// EXPORT UTILITY ENDPOINTS
// ============================================================================

/**
 * POST /api/user/export/validate
 * Validate export request before execution
 */
router.post('/validate', previewLimiter, async (req, res) => {
  try {
    const { format, options = {} } = req.body;

    if (!format) {
      return res.status(400).json({
        error: 'Missing format parameter',
        message: 'Export format is required'
      });
    }

    logger.info('Export validation requested', { format, options, ip: req.ip });

    const validation = await exportService.validateExportRequest(format, options);

    res.json({
      success: true,
      data: {
        format,
        validation,
        estimatedSize: await exportService.estimateExportSize(format, options)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in export validation endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to validate export request',
      message: error.message
    });
  }
});

/**
 * POST /api/user/export/preview
 * Generate preview of export data
 */
router.post('/preview', previewLimiter, async (req, res) => {
  try {
    const { format, options = {} } = req.body;

    if (!format) {
      return res.status(400).json({
        error: 'Missing format parameter',
        message: 'Export format is required'
      });
    }

    logger.info('Export preview requested', { format, options, ip: req.ip });

    // Validate first
    const validation = await exportService.validateExportRequest(format, options);
    if (!validation.isValid) {
      return res.status(400).json({
        error: 'Export validation failed',
        details: validation.errors,
        warnings: validation.warnings
      });
    }

    const preview = await exportService.generateExportPreview(format, options);

    res.json({
      success: true,
      data: preview,
      validation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in export preview endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to generate export preview',
      message: error.message
    });
  }
});

/**
 * GET /api/user/export/formats
 * Get available export formats and their capabilities
 */
router.get('/formats', async (req, res) => {
  try {
    const formats = {
      json: {
        name: 'JSON',
        description: 'Complete structured data export with full details',
        mimeType: 'application/json',
        extension: 'json',
        features: [
          'Complete job history',
          'Skills and industry tags',
          'Content chunks (optional)',
          'Embeddings (optional)',
          'Validation results',
          'Analytics and metrics'
        ],
        options: {
          includeChunks: { type: 'boolean', default: false },
          includeEmbeddings: { type: 'boolean', default: false },
          validate: { type: 'boolean', default: true },
          dateRange: { type: 'object', optional: true }
        }
      },
      csv: {
        name: 'CSV',
        description: 'Spreadsheet-compatible format for data analysis',
        mimeType: 'text/csv',
        extension: 'csv',
        features: [
          'Flattened job data',
          'Skills as concatenated list',
          'Easy import to Excel/Sheets',
          'Industry tags included'
        ],
        options: {
          includeSkills: { type: 'boolean', default: true },
          dateRange: { type: 'object', optional: true }
        }
      },
      resumeData: {
        name: 'Resume Data',
        description: 'Clean, optimized data for resume generation',
        mimeType: 'application/json',
        extension: 'json',
        features: [
          'Filtered and validated jobs',
          'Prioritized skills',
          'Career summary',
          'Timeline analysis',
          'Professional formatting'
        ],
        options: {
          maxJobs: { type: 'number', optional: true },
          skillLimit: { type: 'number', default: 50 },
          includeOutcomes: { type: 'boolean', default: true },
          minDurationMonths: { type: 'number', default: 1 },
          excludeIndustries: { type: 'array', optional: true }
        }
      },
      timeline: {
        name: 'Timeline',
        description: 'Chronological career progression with analysis',
        mimeType: 'application/json',
        extension: 'json',
        features: [
          'Chronological ordering',
          'Gap detection',
          'Overlap analysis',
          'Skill evolution',
          'Career progression insights'
        ],
        options: {
          includeGaps: { type: 'boolean', default: true },
          includeOverlaps: { type: 'boolean', default: true },
          groupByYear: { type: 'boolean', default: false },
          includeSkillEvolution: { type: 'boolean', default: true }
        }
      }
    };

    res.json({
      success: true,
      data: {
        formats,
        totalFormats: Object.keys(formats).length,
        supportedFeatures: [
          'Data validation',
          'Export preview',
          'Selective date ranges',
          'Multiple output formats',
          'File size estimation',
          'Rate limiting protection'
        ]
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in export formats endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to get export formats',
      message: error.message
    });
  }
});

/**
 * GET /api/user/export/stats
 * Get export-related statistics and data health
 */
router.get('/stats', async (req, res) => {
  try {
    logger.info('Export stats requested', { ip: req.ip });

    // Get basic validation for stats
    const validation = await exportService.validateExportRequest('json', {});

    // Estimate sizes for all formats
    const sizeEstimates = {};
    for (const format of ['json', 'csv', 'resumeData', 'timeline']) {
      sizeEstimates[format] = await exportService.estimateExportSize(format, {});
    }

    res.json({
      success: true,
      data: {
        dataAvailability: {
          hasData: validation.isValid,
          issues: validation.errors,
          warnings: validation.warnings
        },
        estimatedSizes: sizeEstimates,
        recommendations: validation.recommendations,
        lastUpdated: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in export stats endpoint', { error: error.message });
    res.status(500).json({
      error: 'Failed to get export statistics',
      message: error.message
    });
  }
});

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in data-export router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred during export'
  });
});

export default router;