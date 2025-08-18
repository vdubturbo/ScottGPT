/**
 * Advanced User Data Management API Routes
 * Provides bulk operations, smart enhancements, and system operations
 * 
 * AI FEATURES STATUS (Updated Aug 2025):
 * =====================================
 * The following endpoints had AI functionality PERMANENTLY DISABLED:
 * - /suggest-skills - Previously used OpenAI for intelligent skill extraction
 * - /quality-report - Previously included AI-generated insights and recommendations  
 * - /quality-improvement-plan - Previously used AI for personalized improvement plans
 * 
 * All AI features now use rule-based logic only to prevent unauthorized OpenAI API costs.
 * Rate limits have been adjusted to be more restrictive for these endpoints.
 * Maintenance mode flag (AI_FEATURES_ENABLED) allows easy re-enabling when needed.
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database.js';
import { BulkOperationsService } from '../services/bulk-operations.js';
import { SmartEnhancementService } from '../services/smart-enhancement.js';
import { AdvancedValidationService } from '../services/advanced-validation.js';
import { DataQualityAnalysisService } from '../services/data-quality-analysis.js';
import EmbeddingService from '../services/embeddings.js';

const router = express.Router();

// AI Features Maintenance Mode Flag
// Set to false to disable all AI-powered features (OpenAI, smart enhancements)
const AI_FEATURES_ENABLED = false;
const AI_DISABLE_REASON = 'temporary-cost-protection';
const AI_DISABLE_MESSAGE = 'AI features temporarily disabled to prevent OpenAI API costs';

// Initialize services
const bulkOpsService = new BulkOperationsService();
const enhancementService = new SmartEnhancementService();
const advancedValidationService = new AdvancedValidationService();
const qualityAnalysisService = new DataQualityAnalysisService();
const embeddingService = new EmbeddingService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/advanced-user-data-api.log' })
  ]
});

// Rate limiting for different operation types
const bulkOperationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 bulk operations per window
  message: { error: 'Too many bulk operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req, res, options) => {
    logger.warn('Bulk operation rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      windowMs: options.windowMs,
      maxRequests: options.max
    });
  }
});

// IMPORTANT: AI features are temporarily disabled to prevent OpenAI API costs
// These endpoints now return rule-based responses only
const enhancementLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // Reduced from 20 - more restrictive since AI features disabled
  message: { 
    error: 'Too many enhancement requests, please try again later',
    note: 'AI features are temporarily disabled for cost protection'
  },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req, res, options) => {
    logger.warn('Enhancement rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      aiDisabled: true,
      windowMs: options.windowMs,
      maxRequests: options.max
    });
  }
});

const validationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 validation requests per minute - permissive for real-time validation
  message: { error: 'Too many validation requests, please slow down' },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req, res, options) => {
    logger.warn('Validation rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      windowMs: options.windowMs,
      maxRequests: options.max
    });
  }
});

const systemLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 3, // 3 system operations per window
  message: { error: 'Too many system operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
  onLimitReached: (req, res, options) => {
    logger.warn('System operation rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      windowMs: options.windowMs,
      maxRequests: options.max
    });
  }
});

// ============================================================================
// BULK OPERATIONS ENDPOINTS
// ============================================================================

/**
 * POST /api/user/bulk/preview
 * Preview bulk operation before execution
 */
router.post('/bulk/preview', bulkOperationLimiter, async (req, res) => {
  try {
    const { operationType, params } = req.body;

    if (!operationType || !params) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'operationType and params are required'
      });
    }

    logger.info('Previewing bulk operation', { 
      operationType, 
      ip: req.ip,
      paramsKeys: Object.keys(params)
    });

    const preview = await bulkOpsService.previewOperation(operationType, params);

    res.json({
      success: true,
      data: {
        operationType,
        preview,
        estimatedDuration: preview.estimatedDuration || 'Unknown',
        risks: preview.conflicts || [],
        canProceed: (preview.conflicts || []).length === 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error previewing bulk operation', { 
      error: error.message,
      operationType: req.body.operationType
    });
    
    res.status(500).json({
      error: 'Failed to preview operation',
      message: error.message
    });
  }
});

/**
 * POST /api/user/bulk/execute
 * Execute bulk operation with transaction safety
 */
router.post('/bulk/execute', bulkOperationLimiter, async (req, res) => {
  try {
    const { operationType, params, preview = false } = req.body;

    if (!operationType || !params) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'operationType and params are required'
      });
    }

    const operationId = uuidv4();

    logger.info('Executing bulk operation', { 
      operationId,
      operationType, 
      preview,
      ip: req.ip
    });

    if (preview) {
      // Return preview only
      const previewResult = await bulkOpsService.previewOperation(operationType, params);
      return res.json({
        success: true,
        data: {
          operationId,
          preview: previewResult,
          status: 'preview_only'
        }
      });
    }

    // Execute the operation (async)
    bulkOpsService.executeOperation(operationId, operationType, params)
      .catch(error => {
        logger.error('Bulk operation execution failed', {
          operationId,
          error: error.message
        });
      });

    res.json({
      success: true,
      data: {
        operationId,
        status: 'started',
        message: 'Bulk operation started successfully',
        statusUrl: `/api/user/bulk/status/${operationId}`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error starting bulk operation', { 
      error: error.message,
      operationType: req.body.operationType
    });
    
    res.status(500).json({
      error: 'Failed to start operation',
      message: error.message
    });
  }
});

/**
 * GET /api/user/bulk/status/:operationId
 * Get bulk operation status and progress
 */
router.get('/bulk/status/:operationId', async (req, res) => {
  try {
    const { operationId } = req.params;

    const status = bulkOpsService.getOperationStatus(operationId);

    if (status.status === 'not_found') {
      return res.status(404).json({
        error: 'Operation not found',
        message: 'The specified operation ID was not found'
      });
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting operation status', { 
      operationId: req.params.operationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to get operation status',
      message: error.message
    });
  }
});

/**
 * POST /api/user/bulk/update-skills
 * Bulk update skills across multiple jobs
 */
router.post('/bulk/update-skills', bulkOperationLimiter, async (req, res) => {
  try {
    const { jobIds, operation, skills, preview = false } = req.body;

    if (!jobIds || !Array.isArray(jobIds) || !operation || !skills) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'jobIds (array), operation, and skills are required'
      });
    }

    const validOperations = ['add', 'remove', 'replace', 'normalize'];
    if (!validOperations.includes(operation)) {
      return res.status(400).json({
        error: 'Invalid operation',
        message: `Operation must be one of: ${validOperations.join(', ')}`
      });
    }

    const operationId = uuidv4();
    const params = { jobIds, operation, skills };

    logger.info('Bulk skills update requested', { 
      operationId,
      operation,
      jobCount: jobIds.length,
      preview,
      ip: req.ip
    });

    if (preview) {
      const previewResult = await bulkOpsService.previewOperation('update-skills', params);
      return res.json({
        success: true,
        data: {
          operationId,
          preview: previewResult,
          status: 'preview_only'
        }
      });
    }

    // Execute the operation
    bulkOpsService.executeOperation(operationId, 'update-skills', params)
      .catch(error => {
        logger.error('Bulk skills update failed', {
          operationId,
          error: error.message
        });
      });

    res.json({
      success: true,
      data: {
        operationId,
        operation: 'update-skills',
        params: { jobCount: jobIds.length, operation, skillsCount: skills.length },
        status: 'started',
        statusUrl: `/api/user/bulk/status/${operationId}`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in bulk skills update', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to update skills',
      message: error.message
    });
  }
});

/**
 * POST /api/user/bulk/fix-dates
 * Batch date corrections with conflict detection
 */
router.post('/bulk/fix-dates', bulkOperationLimiter, async (req, res) => {
  try {
    const { fixes, preview = false } = req.body;

    if (!fixes || !Array.isArray(fixes)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'fixes array is required'
      });
    }

    // Validate fix format
    for (const fix of fixes) {
      if (!fix.jobId || (!fix.date_start && fix.date_end === undefined)) {
        return res.status(400).json({
          error: 'Invalid fix format',
          message: 'Each fix must have jobId and at least one date field'
        });
      }
    }

    const operationId = uuidv4();
    const params = { fixes };

    logger.info('Bulk date fixes requested', { 
      operationId,
      fixCount: fixes.length,
      preview,
      ip: req.ip
    });

    if (preview) {
      const previewResult = await bulkOpsService.previewOperation('fix-dates', params);
      return res.json({
        success: true,
        data: {
          operationId,
          preview: previewResult,
          status: 'preview_only'
        }
      });
    }

    // Execute the operation
    bulkOpsService.executeOperation(operationId, 'fix-dates', params)
      .catch(error => {
        logger.error('Bulk date fixes failed', {
          operationId,
          error: error.message
        });
      });

    res.json({
      success: true,
      data: {
        operationId,
        operation: 'fix-dates',
        params: { fixCount: fixes.length },
        status: 'started',
        statusUrl: `/api/user/bulk/status/${operationId}`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in bulk date fixes', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to fix dates',
      message: error.message
    });
  }
});

/**
 * POST /api/user/bulk/merge-duplicates
 * Intelligent duplicate merging with rollback safety
 */
router.post('/bulk/merge-duplicates', bulkOperationLimiter, async (req, res) => {
  try {
    const { mergeGroups, preview = false } = req.body;

    if (!mergeGroups || !Array.isArray(mergeGroups)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'mergeGroups array is required'
      });
    }

    // Validate merge group format
    for (const group of mergeGroups) {
      if (!group.primaryJobId || !group.duplicateJobIds || !Array.isArray(group.duplicateJobIds)) {
        return res.status(400).json({
          error: 'Invalid merge group format',
          message: 'Each group must have primaryJobId and duplicateJobIds array'
        });
      }
    }

    const operationId = uuidv4();
    const params = { mergeGroups };

    logger.info('Bulk duplicate merge requested', { 
      operationId,
      mergeGroupCount: mergeGroups.length,
      preview,
      ip: req.ip
    });

    if (preview) {
      const previewResult = await bulkOpsService.previewOperation('merge-duplicates', params);
      return res.json({
        success: true,
        data: {
          operationId,
          preview: previewResult,
          status: 'preview_only'
        }
      });
    }

    // Execute the operation
    bulkOpsService.executeOperation(operationId, 'merge-duplicates', params)
      .catch(error => {
        logger.error('Bulk duplicate merge failed', {
          operationId,
          error: error.message
        });
      });

    res.json({
      success: true,
      data: {
        operationId,
        operation: 'merge-duplicates',
        params: { mergeGroupCount: mergeGroups.length },
        status: 'started',
        statusUrl: `/api/user/bulk/status/${operationId}`
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in bulk duplicate merge', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to merge duplicates',
      message: error.message
    });
  }
});

/**
 * DELETE /api/user/bulk/cancel/:operationId
 * Cancel running bulk operation
 */
router.delete('/bulk/cancel/:operationId', async (req, res) => {
  try {
    const { operationId } = req.params;

    const cancelled = await bulkOpsService.cancelOperation(operationId);

    if (!cancelled) {
      return res.status(404).json({
        error: 'Operation not found or cannot be cancelled',
        message: 'The operation may have already completed or was never started'
      });
    }

    logger.info('Bulk operation cancelled', { operationId, ip: req.ip });

    res.json({
      success: true,
      data: {
        operationId,
        status: 'cancelled',
        message: 'Operation cancelled and rolled back successfully'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error cancelling operation', { 
      operationId: req.params.operationId,
      error: error.message
    });
    
    res.status(500).json({
      error: 'Failed to cancel operation',
      message: error.message
    });
  }
});

// ============================================================================
// SMART DATA ENHANCEMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/user/gaps
 * Identify timeline gaps with enhancement suggestions
 */
router.get('/gaps', enhancementLimiter, async (req, res) => {
  try {
    logger.info('Analyzing timeline gaps', { ip: req.ip });

    // Get all job sources
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job')
      .order('date_start', { ascending: true });

    if (error) {
      throw error;
    }

    const gapAnalysis = await enhancementService.identifyTimelineGaps(jobs);

    res.json({
      success: true,
      data: gapAnalysis,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error analyzing timeline gaps', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to analyze timeline gaps',
      message: error.message
    });
  }
});

/**
 * POST /api/user/suggest-skills
 * Skill suggestions based on job descriptions (AI disabled)
 * 
 * FORMERLY AI-POWERED: This endpoint previously used OpenAI GPT-4 for intelligent
 * skill extraction and suggestions. AI functionality has been permanently disabled
 * to prevent unauthorized API costs.
 * 
 * CURRENT BEHAVIOR: Returns rule-based skill suggestions only, using:
 * - Keyword matching against skill databases
 * - Industry-standard skill mappings
 * - Job title and description parsing
 * 
 * RATE LIMITING: More restrictive limits applied since AI features disabled
 */
router.post('/suggest-skills', enhancementLimiter, async (req, res) => {
  try {
    const { jobId, jobData, options = {} } = req.body;

    let job;
    if (jobId) {
      // Get job by ID
      const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', jobId)
        .eq('type', 'job')
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return res.status(404).json({
            error: 'Job not found',
            message: 'No job found with the specified ID'
          });
        }
        throw error;
      }
      job = data;
    } else if (jobData) {
      // Use provided job data
      job = jobData;
    } else {
      return res.status(400).json({
        error: 'Missing job data',
        message: 'Either jobId or jobData is required'
      });
    }

    // Check maintenance mode and add appropriate headers
    const isMaintenanceMode = checkAIMaintenanceMode(req, res, 'suggest-skills');
    
    logger.info('Generating skill suggestions (maintenance mode active)', { 
      jobId: job.id,
      title: job.title?.substring(0, 50),
      ip: req.ip,
      requestedAI: options.includeAI,
      actualAI: !isMaintenanceMode,
      maintenanceMode: isMaintenanceMode
    });

    // Force AI disabled when in maintenance mode
    const effectiveOptions = {
      ...options,
      includeAI: AI_FEATURES_ENABLED ? options.includeAI : false
    };

    const suggestions = await enhancementService.suggestSkills(job, effectiveOptions);

    const responseData = {
      job: {
        id: job.id,
        title: job.title,
        org: job.org,
        currentSkills: job.skills || []
      },
      suggestions: suggestions.suggestions,
      categorized: suggestions.categorized,
      analysis: {
        ...suggestions.analysis,
        aiContribution: AI_FEATURES_ENABLED ? suggestions.analysis.aiContribution : 0,
        ruleBasedOnly: !AI_FEATURES_ENABLED
      },
      recommendations: suggestions.recommendations
    };

    res.json({
      success: true,
      ...(isMaintenanceMode ? createAIDisabledResponse({}) : {}),
      data: responseData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating skill suggestions', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate skill suggestions',
      message: error.message,
      aiDisabled: true
    });
  }
});

/**
 * POST /api/user/validate
 * Comprehensive data validation report with quality scoring
 */
router.post('/validate', validationLimiter, async (req, res) => {
  try {
    const { includeEnhancements = true, jobData, validateOnly = false } = req.body;

    // If jobData is provided, validate only that specific job
    if (jobData) {
      logger.info('Validating single job', { 
        jobId: jobData.id || 'new',
        validateOnly,
        ip: req.ip
      });

      // Single job validation - much more efficient
      const validation = validationService.validateJobData(jobData);
      
      return res.json({
        success: true,
        data: {
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
          processedData: validation.processedData
        },
        timestamp: new Date().toISOString()
      });
    }

    // Full system validation only if no specific job data provided
    logger.info('Generating comprehensive validation report for all jobs', { 
      includeEnhancements,
      ip: req.ip
    });

    // Get all job sources
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job')
      .order('date_start', { ascending: false });

    if (error) {
      throw error;
    }

    let report;
    if (includeEnhancements) {
      report = await enhancementService.generateDataQualityReport(jobs);
    } else {
      report = advancedValidationService.validateDataQuality(jobs);
    }

    res.json({
      success: true,
      data: report,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating validation report', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate validation report',
      message: error.message
    });
  }
});

// ============================================================================
// SYSTEM OPERATIONS ENDPOINTS
// ============================================================================

/**
 * POST /api/user/regenerate-all-embeddings
 * Refresh entire search index with new embeddings
 */
router.post('/regenerate-all-embeddings', systemLimiter, async (req, res) => {
  try {
    const { batchSize = 10, skipValidation = false } = req.body;

    logger.info('Starting full embedding regeneration', { 
      batchSize,
      skipValidation,
      ip: req.ip
    });

    // Get all content chunks
    const { data: chunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content, source_id,
        sources (title, org, skills)
      `);

    if (error) {
      throw error;
    }

    const operationId = uuidv4();
    const startTime = new Date();

    // Process chunks in batches
    let processed = 0;
    let successful = 0;
    let failed = 0;
    const errors = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (chunk) => {
        try {
          // Create embedding content
          const embeddingContent = [
            chunk.sources?.title,
            chunk.title,
            chunk.content,
            chunk.sources?.skills?.join(', ')
          ].filter(Boolean).join(' ');

          const embedding = await embeddingService.embedText(
            embeddingContent, 
            'search_document'
          );

          if (embedding) {
            const { error: updateError } = await supabase
              .from('content_chunks')
              .update({ 
                embedding,
                updated_at: new Date().toISOString()
              })
              .eq('id', chunk.id);

            if (updateError) throw updateError;
            return { success: true, chunkId: chunk.id };
          } else {
            throw new Error('Failed to generate embedding');
          }
        } catch (error) {
          return { success: false, chunkId: chunk.id, error: error.message };
        }
      });

      const batchResults = await Promise.all(batchPromises);
      
      batchResults.forEach(result => {
        processed++;
        if (result.success) {
          successful++;
        } else {
          failed++;
          errors.push(result);
        }
      });

      // Log progress
      if (i % (batchSize * 5) === 0) {
        logger.info('Embedding regeneration progress', {
          operationId,
          processed,
          successful,
          failed,
          remaining: chunks.length - processed
        });
      }
    }

    const endTime = new Date();
    const duration = endTime - startTime;

    logger.info('Embedding regeneration completed', {
      operationId,
      duration,
      totalChunks: chunks.length,
      successful,
      failed
    });

    res.json({
      success: true,
      data: {
        operationId,
        status: 'completed',
        duration: Math.round(duration / 1000),
        results: {
          totalChunks: chunks.length,
          processed,
          successful,
          failed,
          successRate: Math.round((successful / processed) * 100),
          errors: errors.slice(0, 10) // Limit error details
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error regenerating embeddings', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to regenerate embeddings',
      message: error.message
    });
  }
});

/**
 * GET /api/user/data-quality
 * Overall data health report with metrics
 */
router.get('/data-quality', enhancementLimiter, async (req, res) => {
  try {
    logger.info('Generating data quality report', { ip: req.ip });

    // Get all job sources
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job');

    if (error) {
      throw error;
    }

    // Get chunk statistics
    const { data: chunkStats } = await supabase
      .from('content_chunks')
      .select('source_id, embedding')
      .not('embedding', 'is', null);

    // Calculate data health metrics
    const healthMetrics = {
      jobs: {
        total: jobs.length,
        withDescriptions: jobs.filter(j => j.description && j.description.trim().length > 0).length,
        withSkills: jobs.filter(j => j.skills && j.skills.length > 0).length,
        withLocations: jobs.filter(j => j.location && j.location.trim().length > 0).length,
        recentJobs: jobs.filter(j => {
          if (!j.date_start) return false;
          const jobStart = new Date(j.date_start);
          const fiveYearsAgo = new Date();
          fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
          return jobStart > fiveYearsAgo;
        }).length
      },
      embeddings: {
        totalChunks: chunkStats?.length || 0,
        coverage: jobs.length > 0 ? Math.round((chunkStats?.length || 0) / jobs.length) : 0
      },
      timeline: {},
      quality: {}
    };

    // Calculate completeness scores
    const completenessScore = (
      (healthMetrics.jobs.withDescriptions / healthMetrics.jobs.total * 0.4) +
      (healthMetrics.jobs.withSkills / healthMetrics.jobs.total * 0.3) +
      (healthMetrics.jobs.withLocations / healthMetrics.jobs.total * 0.2) +
      (healthMetrics.embeddings.coverage > 0 ? 0.1 : 0)
    );

    // Get advanced quality metrics
    const qualityReport = advancedValidationService.validateDataQuality(jobs);

    res.json({
      success: true,
      data: {
        healthMetrics,
        completenessScore: Math.round(completenessScore * 100),
        qualitySummary: {
          overallScore: Math.round(qualityReport.overall.score * 100),
          grade: qualityReport.overall.grade,
          criticalIssues: qualityReport.summary.criticalIssues,
          warnings: qualityReport.summary.warnings,
          excellentJobs: qualityReport.summary.excellentQuality,
          poorJobs: qualityReport.summary.poorQuality
        },
        recommendations: qualityReport.overall.recommendations.slice(0, 5),
        lastUpdated: new Date().toISOString()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating data quality report', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate data quality report',
      message: error.message
    });
  }
});

/**
 * GET /api/user/quality-report
 * Generate comprehensive data health and quality analysis report (AI disabled)
 * 
 * FORMERLY AI-POWERED: This endpoint previously included AI-generated insights,
 * recommendations, and enhancement suggestions using OpenAI GPT-4.
 * 
 * CURRENT BEHAVIOR: Returns rule-based analysis only:
 * - Statistical data quality metrics
 * - Template-based recommendations
 * - Predefined improvement suggestions
 * 
 * AI functionality disabled for cost protection.
 */
router.get('/quality-report', enhancementLimiter, async (req, res) => {
  try {
    const {
      includeRecommendations = 'true',
      includeEnhancements = 'true',
      detailedAnalysis = 'true',
      generateActionPlan = 'true'
    } = req.query;

    const requestedOptions = {
      includeRecommendations: includeRecommendations === 'true',
      includeEnhancements: includeEnhancements === 'true',
      detailedAnalysis: detailedAnalysis === 'true',
      generateActionPlan: generateActionPlan === 'true'
    };

    // Force AI enhancements disabled regardless of client request
    const aiDisabledOptions = {
      ...requestedOptions,
      includeEnhancements: false // Always disable AI enhancements
    };

    logger.info('Comprehensive quality report requested (AI enhancements disabled)', { 
      requestedOptions,
      actualOptions: aiDisabledOptions,
      ip: req.ip,
      message: 'AI enhancements permanently disabled to prevent OpenAI API abuse'
    });

    const healthReport = await qualityAnalysisService.generateDataHealthReport(aiDisabledOptions);

    // Add response headers indicating AI is disabled
    res.set('X-AI-Features-Disabled', 'true');
    res.set('X-AI-Disable-Reason', 'temporary-cost-protection');

    res.json({
      success: true,
      aiDisabled: true, // Inform frontend AI is disabled
      aiDisableReason: 'AI enhancements temporarily disabled to prevent OpenAI API costs',
      data: {
        ...healthReport,
        aiEnhancementsUsed: false, // Clearly indicate no AI was used
        enhancementMethod: 'rule-based-only'
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating comprehensive quality report', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate quality report',
      message: error.message,
      aiDisabled: true
    });
  }
});

/**
 * GET /api/user/quality-score
 * Get quick quality score and basic health metrics
 */
router.get('/quality-score', enhancementLimiter, async (req, res) => {
  try {
    logger.info('Quick quality score requested', { ip: req.ip });

    // Generate a lightweight version of the health report
    const healthReport = await qualityAnalysisService.generateDataHealthReport({
      includeRecommendations: false,
      includeEnhancements: false,
      detailedAnalysis: false,
      generateActionPlan: false
    });

    // Extract key metrics for quick overview
    const quickScore = {
      overallScore: healthReport.overallHealth.score,
      grade: healthReport.overallHealth.grade,
      status: healthReport.overallHealth.status,
      breakdown: healthReport.overallHealth.breakdown,
      criticalIssues: healthReport.issues.critical.length,
      warnings: healthReport.issues.warnings.length,
      dataStats: {
        totalJobs: healthReport.metadata.totalJobs,
        totalChunks: healthReport.metadata.totalChunks,
        validJobs: healthReport.analysis.core.validJobs,
        averageQualityScore: Math.round(healthReport.analysis.core.averageQualityScore * 100) / 100
      },
      topIssues: [
        ...healthReport.issues.critical.slice(0, 3),
        ...healthReport.issues.warnings.slice(0, 2)
      ]
    };

    res.json({
      success: true,
      data: quickScore,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating quality score', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate quality score',
      message: error.message
    });
  }
});

/**
 * POST /api/user/quality-improvement-plan
 * Generate a customized improvement plan based on current data quality (AI disabled)
 * 
 * FORMERLY AI-POWERED: Previously generated personalized improvement plans using
 * AI analysis of data patterns, user behavior, and intelligent prioritization.
 * 
 * CURRENT BEHAVIOR: Uses predefined templates and rule-based logic:
 * - Standard improvement templates
 * - Priority filtering based on data scores
 * - Generic milestone generation
 * 
 * AI enhancements disabled to prevent OpenAI API abuse.
 */
router.post('/quality-improvement-plan', enhancementLimiter, async (req, res) => {
  try {
    const { 
      timeframe = '4 weeks',
      priority = 'balanced',
      focusAreas = ['all']
    } = req.body;

    logger.info('Quality improvement plan requested (AI enhancements disabled)', { 
      timeframe,
      priority,
      focusAreas,
      ip: req.ip,
      message: 'AI-based enhancements permanently disabled to prevent OpenAI API abuse'
    });

    // Generate comprehensive report for analysis (AI disabled)
    const healthReport = await qualityAnalysisService.generateDataHealthReport({
      includeRecommendations: true,
      includeEnhancements: false, // Always disable AI enhancements
      detailedAnalysis: true,
      generateActionPlan: true
    });

    // Customize the action plan based on request parameters
    const customizedPlan = {
      currentState: {
        score: healthReport.overallHealth.score,
        grade: healthReport.overallHealth.grade,
        mainIssues: healthReport.issues.critical.concat(healthReport.issues.warnings)
      },
      targetState: {
        targetScore: Math.min(healthReport.overallHealth.score + 0.2, 1.0),
        timeframe,
        estimatedEffort: estimateEffortLevel(healthReport.recommendations)
      },
      actionPlan: healthReport.actionPlan,
      recommendations: filterRecommendationsByPriority(healthReport.recommendations, priority),
      milestones: generateMilestones(healthReport.actionPlan, timeframe),
      resources: {
        estimatedTime: healthReport.actionPlan?.overview?.estimatedImprovementTime || 'Unknown',
        toolsNeeded: ['Data validation', 'Content enhancement', 'Manual skill suggestions'],
        skillsRequired: ['Data entry', 'Content writing', 'Basic editing'],
        aiToolsDisabled: 'AI-powered enhancements temporarily unavailable'
      },
      aiEnhancementsUsed: false, // Clearly indicate no AI was used
      enhancementMethod: 'rule-based-only'
    };

    // Add response headers indicating AI is disabled
    res.set('X-AI-Features-Disabled', 'true');
    res.set('X-AI-Disable-Reason', 'temporary-cost-protection');

    res.json({
      success: true,
      aiDisabled: true, // Inform frontend AI is disabled
      aiDisableReason: 'AI enhancements temporarily disabled to prevent OpenAI API costs',
      data: customizedPlan,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating improvement plan', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to generate improvement plan',
      message: error.message,
      aiDisabled: true
    });
  }
});

// ============================================================================
// MAINTENANCE MODE UTILITIES
// ============================================================================

/**
 * Check if AI features are enabled and add appropriate headers/logging
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} endpoint - Endpoint name for logging
 */
function checkAIMaintenanceMode(req, res, endpoint) {
  if (!AI_FEATURES_ENABLED) {
    logger.info(`AI features disabled for ${endpoint}`, {
      ip: req.ip,
      endpoint,
      reason: AI_DISABLE_REASON,
      userAgent: req.get('User-Agent')
    });
    
    // Add headers to inform client
    res.set('X-AI-Features-Disabled', 'true');
    res.set('X-AI-Disable-Reason', AI_DISABLE_REASON);
    res.set('X-AI-Maintenance-Mode', 'active');
  }
  return !AI_FEATURES_ENABLED;
}

/**
 * Standard AI disabled response structure
 * @param {Object} data - Response data
 * @param {string} message - Optional custom message
 */
function createAIDisabledResponse(data, message = null) {
  return {
    ...data,
    aiDisabled: true,
    aiDisableReason: message || AI_DISABLE_MESSAGE,
    aiEnhancementsUsed: false,
    enhancementMethod: 'rule-based-only'
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Estimate effort level based on recommendations
 */
function estimateEffortLevel(recommendations) {
  if (!recommendations || recommendations.length === 0) return 'low';
  
  const criticalCount = recommendations.filter(r => r.priority === 'critical').length;
  const highCount = recommendations.filter(r => r.priority === 'high').length;
  
  if (criticalCount > 0 || highCount > 3) return 'high';
  if (highCount > 0 || recommendations.length > 5) return 'medium';
  return 'low';
}

/**
 * Filter recommendations by priority level
 */
function filterRecommendationsByPriority(recommendations, priority) {
  if (!recommendations) return [];
  
  switch (priority) {
    case 'critical':
      return recommendations.filter(r => r.priority === 'critical');
    case 'high':
      return recommendations.filter(r => ['critical', 'high'].includes(r.priority));
    case 'balanced':
      return recommendations; // Return all
    case 'quick':
      return recommendations.filter(r => r.effort === 'low' || r.effort === 'medium');
    default:
      return recommendations;
  }
}

/**
 * Generate milestones based on action plan and timeframe
 */
function generateMilestones(actionPlan, timeframe) {
  if (!actionPlan || !actionPlan.phases) return [];
  
  const milestones = [];
  let cumulativeTime = 0;
  
  actionPlan.phases.forEach((phase, index) => {
    const phaseTimeWeeks = parseTimeframe(phase.timeframe);
    cumulativeTime += phaseTimeWeeks;
    
    milestones.push({
      phase: phase.phase,
      title: phase.title,
      targetWeek: cumulativeTime,
      priority: phase.priority,
      expectedImprovement: phase.expectedScoreImprovement,
      keyActions: phase.recommendations.map(r => r.title)
    });
  });
  
  return milestones;
}

/**
 * Parse timeframe string to weeks
 */
function parseTimeframe(timeframe) {
  if (timeframe.includes('week')) {
    const weeks = timeframe.match(/(\d+)/);
    return weeks ? parseInt(weeks[1]) : 1;
  } else if (timeframe.includes('month')) {
    const months = timeframe.match(/(\d+)/);
    return months ? parseInt(months[1]) * 4 : 4;
  }
  return 1;
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in advanced user-data router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

export default router;