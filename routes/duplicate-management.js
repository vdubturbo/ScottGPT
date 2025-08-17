/**
 * Duplicate Management API Routes
 * Advanced duplicate detection and intelligent merging endpoints
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { supabase } from '../config/database.js';
import DuplicateDetectionService from '../services/duplicate-detection.js';
import SmartMergeService from '../services/smart-merge.js';

const router = express.Router();

// Initialize services
const duplicateService = new DuplicateDetectionService();
const mergeService = new SmartMergeService();

// Setup logging
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/duplicate-management-api.log' })
  ]
});

// Rate limiting for different operation types
const detectDuplicatesLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 10, // 10 detection requests per window
  message: { error: 'Too many duplicate detection requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const mergeOperationsLimit = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 merge operations per window
  message: { error: 'Too many merge operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

const autoMergeLimit = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 5, // 5 auto-merge operations per window
  message: { error: 'Too many auto-merge operations, please try again later' },
  standardHeaders: true,
  legacyHeaders: false
});

// ============================================================================
// DUPLICATE DETECTION ENDPOINTS
// ============================================================================

/**
 * GET /api/user/duplicates/detect
 * Comprehensive duplicate detection with confidence scoring
 */
router.get('/detect', detectDuplicatesLimit, async (req, res) => {
  try {
    const { 
      threshold = 0.7, 
      includePreview = false,
      groupBy = 'similarity'
    } = req.query;

    logger.info('Starting duplicate detection', { 
      threshold: parseFloat(threshold),
      includePreview,
      groupBy,
      ip: req.ip 
    });

    // Get all job sources
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (jobs.length < 2) {
      return res.json({
        success: true,
        data: {
          duplicateGroups: [],
          summary: {
            totalJobs: jobs.length,
            duplicateGroups: 0,
            totalDuplicates: 0,
            autoMergeable: 0,
            requiresReview: 0
          },
          recommendations: [],
          message: 'Not enough jobs for duplicate detection'
        },
        timestamp: new Date().toISOString()
      });
    }

    // Perform duplicate detection
    const detectionResult = await duplicateService.findDuplicates(jobs);

    // Filter by threshold if specified
    if (parseFloat(threshold) !== 0.7) {
      detectionResult.duplicateGroups = detectionResult.duplicateGroups.filter(
        group => group.groupSimilarity >= parseFloat(threshold)
      );
    }

    // Add merge previews if requested
    if (includePreview === 'true') {
      for (const group of detectionResult.duplicateGroups) {
        if (group.duplicates.length === 1) {
          try {
            const preview = await mergeService.previewMerge(
              group.duplicates[0].job.id,
              group.primaryJob.job.id
            );
            group.mergePreview = {
              quality: preview.analysis.quality,
              risks: preview.analysis.risks.filter(risk => risk.severity === 'high'),
              changes: preview.preview.changes,
              recommended: preview.analysis.quality.score >= 0.7
            };
          } catch (error) {
            logger.warn('Error generating merge preview', { 
              groupId: group.primaryJob.job.id,
              error: error.message 
            });
          }
        }
      }
    }

    // Group results if requested
    let responseData = detectionResult;
    if (groupBy === 'confidence') {
      responseData = this.groupByConfidence(detectionResult);
    } else if (groupBy === 'type') {
      responseData = this.groupByType(detectionResult);
    }

    res.json({
      success: true,
      data: responseData,
      metadata: {
        detectionThreshold: parseFloat(threshold),
        includePreview: includePreview === 'true',
        groupBy,
        processingTime: Date.now() - new Date(detectionResult.timestamp).getTime()
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in duplicate detection', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to detect duplicates',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/user/duplicates/summary
 * Quick duplicate summary without full analysis
 */
router.get('/summary', detectDuplicatesLimit, async (req, res) => {
  try {
    logger.info('Getting duplicate summary', { ip: req.ip });

    // Get job count and basic stats
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('id, title, org, date_start, date_end, created_at')
      .eq('type', 'job');

    if (error) throw error;

    // Quick duplicate detection using simplified algorithm
    const quickDuplicates = await this.quickDuplicateCheck(jobs);

    res.json({
      success: true,
      data: {
        totalJobs: jobs.length,
        estimatedDuplicates: quickDuplicates.estimated,
        highConfidenceDuplicates: quickDuplicates.highConfidence,
        potentialTimeSavings: quickDuplicates.timeSavings,
        recommendations: quickDuplicates.recommendations,
        needsFullAnalysis: quickDuplicates.estimated > 0
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting duplicate summary', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to get duplicate summary',
      message: error.message
    });
  }
});

// ============================================================================
// MERGE PREVIEW AND EXECUTION ENDPOINTS
// ============================================================================

/**
 * POST /api/user/duplicates/preview-merge
 * Preview merge operation between two jobs
 */
router.post('/preview-merge', mergeOperationsLimit, async (req, res) => {
  try {
    const { sourceId, targetId, options = {} } = req.body;

    if (!sourceId || !targetId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Both sourceId and targetId are required'
      });
    }

    if (sourceId === targetId) {
      return res.status(400).json({
        error: 'Invalid merge request',
        message: 'Cannot merge job with itself'
      });
    }

    logger.info('Generating merge preview', { 
      sourceId, 
      targetId, 
      options: Object.keys(options),
      ip: req.ip 
    });

    const preview = await mergeService.previewMerge(sourceId, targetId, options);

    res.json({
      success: true,
      data: preview,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error generating merge preview', { 
      sourceId: req.body.sourceId,
      targetId: req.body.targetId,
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'One or both specified jobs were not found'
      });
    }
    
    res.status(500).json({
      error: 'Failed to generate merge preview',
      message: error.message
    });
  }
});

/**
 * POST /api/user/duplicates/merge
 * Execute merge operation between two jobs
 */
router.post('/merge', mergeOperationsLimit, async (req, res) => {
  try {
    const { sourceId, targetId, options = {}, confirmed = false } = req.body;

    if (!sourceId || !targetId) {
      return res.status(400).json({
        error: 'Missing required parameters',
        message: 'Both sourceId and targetId are required'
      });
    }

    if (!confirmed) {
      return res.status(400).json({
        error: 'Merge not confirmed',
        message: 'Set confirmed=true to execute merge operation',
        requiresConfirmation: true
      });
    }

    logger.info('Executing merge operation', { 
      sourceId, 
      targetId, 
      options: Object.keys(options),
      ip: req.ip 
    });

    const result = await mergeService.executeMerge(sourceId, targetId, options);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error executing merge', { 
      sourceId: req.body.sourceId,
      targetId: req.body.targetId,
      error: error.message 
    });

    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'One or both specified jobs were not found'
      });
    }
    
    res.status(500).json({
      error: 'Failed to execute merge',
      message: error.message
    });
  }
});

/**
 * GET /api/user/duplicates/merge-status/:mergeId
 * Get merge operation status
 */
router.get('/merge-status/:mergeId', async (req, res) => {
  try {
    const { mergeId } = req.params;

    const status = mergeService.getMergeStatus(mergeId);

    if (status.status === 'not_found') {
      return res.status(404).json({
        error: 'Merge operation not found',
        message: 'The specified merge ID was not found'
      });
    }

    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting merge status', { 
      mergeId: req.params.mergeId,
      error: error.message 
    });
    
    res.status(500).json({
      error: 'Failed to get merge status',
      message: error.message
    });
  }
});

/**
 * POST /api/user/duplicates/undo-merge
 * Undo a completed merge operation
 */
router.post('/undo-merge', mergeOperationsLimit, async (req, res) => {
  try {
    const { mergeId, confirmed = false } = req.body;

    if (!mergeId) {
      return res.status(400).json({
        error: 'Missing merge ID',
        message: 'mergeId is required'
      });
    }

    if (!confirmed) {
      return res.status(400).json({
        error: 'Undo not confirmed',
        message: 'Set confirmed=true to undo merge operation',
        requiresConfirmation: true
      });
    }

    logger.info('Undoing merge operation', { mergeId, ip: req.ip });

    const result = await mergeService.undoMerge(mergeId);

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error undoing merge', { 
      mergeId: req.body.mergeId,
      error: error.message 
    });

    if (error.message.includes('not found') || error.message.includes('expired')) {
      return res.status(404).json({
        error: 'Merge not found or expired',
        message: error.message
      });
    }

    if (error.message.includes('not reversible')) {
      return res.status(400).json({
        error: 'Merge not reversible',
        message: error.message
      });
    }
    
    res.status(500).json({
      error: 'Failed to undo merge',
      message: error.message
    });
  }
});

// ============================================================================
// BULK OPERATIONS ENDPOINTS
// ============================================================================

/**
 * POST /api/user/duplicates/auto-merge
 * Automatically merge high-confidence duplicates
 */
router.post('/auto-merge', autoMergeLimit, async (req, res) => {
  try {
    const { 
      confidenceThreshold = 0.95,
      maxMerges = 10,
      preview = false,
      confirmed = false
    } = req.body;

    if (!preview && !confirmed) {
      return res.status(400).json({
        error: 'Auto-merge not confirmed',
        message: 'Set confirmed=true to execute auto-merge, or preview=true to see what would be merged',
        requiresConfirmation: true
      });
    }

    logger.info('Starting auto-merge operation', { 
      confidenceThreshold,
      maxMerges,
      preview,
      confirmed,
      ip: req.ip 
    });

    // Get all jobs
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job');

    if (error) throw error;

    // Find high-confidence duplicates
    const duplicates = await duplicateService.findDuplicates(jobs);
    const autoMergeableCandidates = duplicates.duplicateGroups
      .filter(group => group.groupSimilarity >= confidenceThreshold)
      .flatMap(group => 
        group.duplicates.filter(dup => dup.confidence.autoMergeable)
      )
      .slice(0, maxMerges);

    if (preview) {
      // Return preview of what would be merged
      const previews = [];
      for (const candidate of autoMergeableCandidates) {
        try {
          const mergePreview = await mergeService.previewMerge(
            candidate.job.id,
            candidate.primaryJob?.job?.id || duplicates.duplicateGroups
              .find(g => g.duplicates.includes(candidate))?.primaryJob.job.id
          );
          
          previews.push({
            sourceJob: candidate.job,
            targetJob: mergePreview.preview.targetJob,
            quality: mergePreview.analysis.quality,
            confidence: candidate.confidence.score
          });
        } catch (error) {
          logger.warn('Error generating auto-merge preview', { 
            jobId: candidate.job.id,
            error: error.message 
          });
        }
      }

      return res.json({
        success: true,
        data: {
          candidateCount: autoMergeableCandidates.length,
          previews,
          estimatedTimeSavings: duplicates.summary.potentialTimeSavings,
          settings: {
            confidenceThreshold,
            maxMerges
          }
        },
        timestamp: new Date().toISOString()
      });
    }

    // Execute auto-merges
    const results = {
      attempted: 0,
      successful: 0,
      failed: 0,
      merges: [],
      errors: []
    };

    for (const candidate of autoMergeableCandidates) {
      try {
        results.attempted++;
        
        const primaryJobId = duplicates.duplicateGroups
          .find(g => g.duplicates.includes(candidate))?.primaryJob.job.id;

        if (!primaryJobId) {
          throw new Error('Primary job not found for merge candidate');
        }

        const mergeResult = await mergeService.executeMerge(
          candidate.job.id,
          primaryJobId,
          { strategy: 'auto_merge' }
        );

        results.successful++;
        results.merges.push({
          sourceJobId: candidate.job.id,
          targetJobId: primaryJobId,
          mergeId: mergeResult.mergeId,
          confidence: candidate.confidence.score
        });

      } catch (error) {
        results.failed++;
        results.errors.push({
          sourceJobId: candidate.job.id,
          error: error.message
        });
        
        logger.error('Auto-merge failed', {
          sourceJobId: candidate.job.id,
          error: error.message
        });
      }
    }

    res.json({
      success: true,
      data: {
        results,
        summary: {
          duplicatesRemoved: results.successful,
          timeSaved: `${results.successful * 2} minutes`,
          qualityImproved: results.successful > 0
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error in auto-merge operation', { error: error.message });
    
    res.status(500).json({
      error: 'Auto-merge operation failed',
      message: error.message
    });
  }
});

/**
 * GET /api/user/duplicates/merge-candidates
 * Get list of merge candidates with recommendations
 */
router.get('/merge-candidates', detectDuplicatesLimit, async (req, res) => {
  try {
    const { 
      confidenceLevel = 'all',
      includeRisks = true,
      sortBy = 'confidence'
    } = req.query;

    logger.info('Getting merge candidates', { 
      confidenceLevel,
      includeRisks,
      sortBy,
      ip: req.ip 
    });

    // Get all jobs
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job');

    if (error) throw error;

    // Find duplicates
    const duplicates = await duplicateService.findDuplicates(jobs);

    // Extract and format candidates
    let candidates = [];
    
    duplicates.duplicateGroups.forEach(group => {
      group.duplicates.forEach(duplicate => {
        candidates.push({
          id: `${duplicate.job.id}_${group.primaryJob.job.id}`,
          sourceJob: {
            id: duplicate.job.id,
            title: duplicate.job.title,
            org: duplicate.job.org,
            dateRange: `${duplicate.job.date_start} to ${duplicate.job.date_end || 'Present'}`
          },
          targetJob: {
            id: group.primaryJob.job.id,
            title: group.primaryJob.job.title,
            org: group.primaryJob.job.org,
            dateRange: `${group.primaryJob.job.date_start} to ${group.primaryJob.job.date_end || 'Present'}`
          },
          similarity: duplicate.similarity,
          confidence: duplicate.confidence,
          recommendation: group.mergeRecommendation,
          risks: includeRisks === 'true' ? group.riskFactors : undefined,
          autoMergeable: duplicate.confidence.autoMergeable,
          groupType: group.type
        });
      });
    });

    // Filter by confidence level
    if (confidenceLevel !== 'all') {
      candidates = candidates.filter(candidate => 
        candidate.confidence.level === confidenceLevel
      );
    }

    // Sort candidates
    if (sortBy === 'confidence') {
      candidates.sort((a, b) => b.confidence.score - a.confidence.score);
    } else if (sortBy === 'similarity') {
      candidates.sort((a, b) => b.similarity.overall - a.similarity.overall);
    } else if (sortBy === 'risk') {
      candidates.sort((a, b) => (b.risks?.length || 0) - (a.risks?.length || 0));
    }

    res.json({
      success: true,
      data: {
        candidates,
        summary: {
          totalCandidates: candidates.length,
          autoMergeable: candidates.filter(c => c.autoMergeable).length,
          highConfidence: candidates.filter(c => c.confidence.level === 'very_high' || c.confidence.level === 'high').length,
          requiresReview: candidates.filter(c => !c.autoMergeable && c.confidence.level === 'high').length
        },
        filters: {
          confidenceLevel,
          includeRisks: includeRisks === 'true',
          sortBy
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error getting merge candidates', { error: error.message });
    
    res.status(500).json({
      error: 'Failed to get merge candidates',
      message: error.message
    });
  }
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Quick duplicate check for summary
 * @param {Array} jobs - Job array
 * @returns {Object} Quick duplicate stats
 */
async function quickDuplicateCheck(jobs) {
  // Simplified duplicate detection for quick summary
  const duplicatePairs = [];
  const processed = new Set();

  for (let i = 0; i < jobs.length; i++) {
    if (processed.has(i)) continue;
    
    for (let j = i + 1; j < jobs.length; j++) {
      if (processed.has(j)) continue;
      
      const job1 = jobs[i];
      const job2 = jobs[j];
      
      // Quick similarity check
      const orgMatch = job1.org?.toLowerCase() === job2.org?.toLowerCase();
      const titleSimilar = job1.title && job2.title && 
        job1.title.toLowerCase().includes(job2.title.toLowerCase()) ||
        job2.title.toLowerCase().includes(job1.title.toLowerCase());
      
      if (orgMatch && titleSimilar) {
        duplicatePairs.push({ job1: i, job2: j, confidence: 'high' });
        processed.add(j);
      }
    }
  }

  const estimated = duplicatePairs.length;
  const highConfidence = duplicatePairs.filter(pair => pair.confidence === 'high').length;

  return {
    estimated,
    highConfidence,
    timeSavings: `${estimated * 2} minutes`,
    recommendations: estimated > 0 ? [
      {
        type: 'run_full_analysis',
        message: `${estimated} potential duplicates found - run full analysis for detailed recommendations`
      }
    ] : [
      {
        type: 'no_action',
        message: 'No obvious duplicates detected'
      }
    ]
  };
}

/**
 * Group duplicate results by confidence level
 * @param {Object} detectionResult - Detection result
 * @returns {Object} Grouped results
 */
function groupByConfidence(detectionResult) {
  const grouped = {
    veryHigh: [],
    high: [],
    medium: [],
    low: []
  };

  detectionResult.duplicateGroups.forEach(group => {
    group.duplicates.forEach(duplicate => {
      const level = duplicate.confidence.level;
      if (level === 'very_high') grouped.veryHigh.push({ group, duplicate });
      else if (level === 'high') grouped.high.push({ group, duplicate });
      else if (level === 'medium') grouped.medium.push({ group, duplicate });
      else grouped.low.push({ group, duplicate });
    });
  });

  return {
    ...detectionResult,
    groupedByConfidence: grouped,
    confidenceSummary: {
      veryHigh: grouped.veryHigh.length,
      high: grouped.high.length,
      medium: grouped.medium.length,
      low: grouped.low.length
    }
  };
}

/**
 * Group duplicate results by type
 * @param {Object} detectionResult - Detection result
 * @returns {Object} Grouped results
 */
function groupByType(detectionResult) {
  const grouped = {
    exact_duplicate: [],
    near_duplicate: [],
    possible_duplicate: []
  };

  detectionResult.duplicateGroups.forEach(group => {
    grouped[group.type].push(group);
  });

  return {
    ...detectionResult,
    groupedByType: grouped,
    typeSummary: {
      exactDuplicates: grouped.exact_duplicate.length,
      nearDuplicates: grouped.near_duplicate.length,
      possibleDuplicates: grouped.possible_duplicate.length
    }
  };
}

// ============================================================================
// ERROR HANDLING MIDDLEWARE
// ============================================================================

router.use((error, req, res, next) => {
  logger.error('Unhandled error in duplicate management router', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method
  });

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred in duplicate management'
  });
});

export default router;