/**
 * User Data Management API Routes
 * Provides safe, validated editing of resume data with real-time updates
 */

import express from 'express';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import { supabase } from '../config/database.js';
import { DataValidationService } from '../services/data-validation.js';
import { DataProcessingService } from '../utils/data-processing.js';
import EmbeddingService from '../services/embeddings.js';
import duplicateManagementRoutes from './duplicate-management.js';

const router = express.Router();

// Initialize services
const validationService = new DataValidationService();
const processingService = new DataProcessingService();
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
    new winston.transports.File({ filename: 'logs/user-data-api.log' })
  ]
});

// Rate limiting for API protection
const createRateLimit = (windowMs, max, message) => rateLimit({
  windowMs,
  max,
  message: { error: message },
  standardHeaders: true,
  legacyHeaders: false
});

const generalLimiter = createRateLimit(
  15 * 60 * 1000, // 15 minutes
  100, // 100 requests per window
  'Too many requests, please try again later'
);

const updateLimiter = createRateLimit(
  5 * 60 * 1000, // 5 minutes
  20, // 20 updates per window
  'Too many update requests, please try again later'
);

const deleteLimiter = createRateLimit(
  60 * 60 * 1000, // 1 hour
  5, // 5 deletions per window
  'Too many delete requests, please try again later'
);

// Apply rate limiting
router.use(generalLimiter);

/**
 * GET /api/user/work-history
 * Get chronological list of all jobs with summary information
 */
router.get('/work-history', async (req, res) => {
  try {
    logger.info('Fetching work history', { ip: req.ip });

    const { data: sources, error } = await supabase
      .from('sources')
      .select(`
        id,
        title,
        org,
        date_start,
        date_end,
        location,
        type,
        created_at,
        updated_at
      `)
      .eq('type', 'job')
      .order('date_start', { ascending: false });

    if (error) {
      logger.error('Database error fetching work history', { error: error.message });
      return res.status(500).json({
        error: 'Failed to fetch work history',
        details: error.message
      });
    }

    // Process and enrich the data
    const enrichedSources = await Promise.all(
      sources.map(async (source) => {
        // Get chunk count for each source
        const { count: chunkCount } = await supabase
          .from('content_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('source_id', source.id);

        // Get skills from chunks
        const { data: chunks } = await supabase
          .from('content_chunks')
          .select('skills')
          .eq('source_id', source.id);

        const allSkills = chunks?.flatMap(chunk => chunk.skills || []) || [];
        const uniqueSkills = [...new Set(allSkills)].sort();

        return {
          ...source,
          chunkCount: chunkCount || 0,
          skillsCount: uniqueSkills.length,
          skills: uniqueSkills.slice(0, 10), // First 10 skills for summary
          duration: processingService.calculateDuration(source.date_start, source.date_end)
        };
      })
    );

    // Generate analytics
    const analytics = processingService.generateAnalytics(enrichedSources);

    res.json({
      success: true,
      data: {
        jobs: enrichedSources,
        analytics: {
          totalJobs: analytics.totalJobs,
          totalDurationMonths: analytics.totalDuration,
          averageDurationMonths: Math.round(analytics.averageDuration),
          topSkills: Object.entries(analytics.skillFrequency)
            .sort(([,a], [,b]) => b - a)
            .slice(0, 10)
            .map(([skill, count]) => ({ skill, count })),
          organizations: Object.keys(analytics.organizationHistory).length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in work-history endpoint', { 
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching work history'
    });
  }
});

/**
 * GET /api/user/sources/:id
 * Get detailed view of specific job with skills and chunks
 */
router.get('/sources/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID must be a valid number'
      });
    }

    logger.info('Fetching source details', { sourceId: id, ip: req.ip });

    // Get source details
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .eq('type', 'job')
      .single();

    if (sourceError) {
      if (sourceError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Source not found',
          message: 'No job source found with the specified ID'
        });
      }
      
      logger.error('Database error fetching source', { 
        sourceId: id, 
        error: sourceError.message 
      });
      return res.status(500).json({
        error: 'Failed to fetch source details',
        details: sourceError.message
      });
    }

    // Get related chunks
    const { data: chunks, error: chunksError } = await supabase
      .from('content_chunks')
      .select('*')
      .eq('source_id', id)
      .order('created_at', { ascending: true });

    if (chunksError) {
      logger.error('Database error fetching chunks', { 
        sourceId: id, 
        error: chunksError.message 
      });
    }

    // Process the data
    const processedSource = processingService.processJobData(source);
    
    // Aggregate skills from all chunks
    const allSkills = chunks?.flatMap(chunk => chunk.skills || []) || [];
    const skillAnalysis = processingService.categorizeSkills([...new Set(allSkills)]);

    // Calculate engagement metrics
    const engagementMetrics = {
      totalChunks: chunks?.length || 0,
      totalCharacters: chunks?.reduce((sum, chunk) => sum + (chunk.content?.length || 0), 0) || 0,
      averageChunkSize: chunks?.length > 0 
        ? Math.round(chunks.reduce((sum, chunk) => sum + (chunk.content?.length || 0), 0) / chunks.length)
        : 0,
      hasEmbeddings: chunks?.filter(chunk => chunk.embedding).length || 0,
      embeddingCoverage: chunks?.length > 0 
        ? Math.round((chunks.filter(chunk => chunk.embedding).length / chunks.length) * 100)
        : 0
    };

    res.json({
      success: true,
      data: {
        source: processedSource,
        chunks: chunks || [],
        skillAnalysis,
        metrics: engagementMetrics,
        validation: validationService.validateJobData(source)
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in source details endpoint', { 
      sourceId: req.params.id,
      error: error.message,
      stack: error.stack 
    });
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while fetching source details'
    });
  }
});

/**
 * PUT /api/user/sources/:id
 * Edit job details with comprehensive validation and embedding regeneration
 */
router.put('/sources/:id', updateLimiter, async (req, res) => {
  const supabaseTransaction = supabase;
  
  try {
    const { id } = req.params;
    const updateData = req.body;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID must be a valid number'
      });
    }

    logger.info('Updating source', { 
      sourceId: id, 
      updateFields: Object.keys(updateData),
      ip: req.ip 
    });

    // Get existing source
    const { data: existingSource, error: fetchError } = await supabaseTransaction
      .from('sources')
      .select('*')
      .eq('id', id)
      .eq('type', 'job')
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Source not found',
          message: 'No job source found with the specified ID'
        });
      }
      throw fetchError;
    }

    // Get all existing jobs for timeline validation
    const { data: allJobs, error: jobsError } = await supabaseTransaction
      .from('sources')
      .select('id, title, org, date_start, date_end')
      .eq('type', 'job');

    if (jobsError) {
      throw jobsError;
    }

    // Merge existing data with updates
    const mergedData = { ...existingSource, ...updateData, id: parseInt(id) };

    // Validate the updated data
    const validation = validationService.validateJobData(mergedData, allJobs);

    // If there are critical errors, reject the update
    if (!validation.isValid) {
      logger.warn('Validation failed for source update', {
        sourceId: id,
        errors: validation.errors
      });
      
      return res.status(400).json({
        error: 'Validation failed',
        validation,
        message: 'The update contains validation errors that must be fixed'
      });
    }

    // Process the data (normalize, clean, etc.)
    const processedData = processingService.processJobData(validation.processedData);

    // Prepare update object (exclude computed fields)
    const {
      id: _id,
      created_at,
      updated_at,
      duration_months,
      skill_categories,
      processed_at,
      ...updateFields
    } = processedData;

    // Update the source
    const { data: updatedSource, error: updateError } = await supabaseTransaction
      .from('sources')
      .update({
        ...updateFields,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Check if content changed (requires embedding regeneration)
    const contentChanged = (
      updateData.title !== existingSource.title ||
      updateData.description !== existingSource.description ||
      JSON.stringify(updateData.skills) !== JSON.stringify(existingSource.skills)
    );

    let embeddingResults = { regenerated: false, affectedChunks: 0 };

    if (contentChanged) {
      logger.info('Content changed, regenerating embeddings', { sourceId: id });
      
      try {
        // Get chunks that need embedding updates
        const { data: chunks, error: chunksError } = await supabaseTransaction
          .from('content_chunks')
          .select('id, title, content, skills')
          .eq('source_id', id);

        if (chunksError) {
          throw chunksError;
        }

        // Regenerate embeddings for affected chunks
        const embeddingPromises = chunks.map(async (chunk) => {
          try {
            // Create updated content for embedding
            const embeddingContent = [
              updatedSource.title,
              chunk.title,
              chunk.content,
              updatedSource.skills?.join(', ')
            ].filter(Boolean).join(' ');

            const embedding = await embeddingService.embedText(embeddingContent, 'search_document');
            
            if (embedding) {
              const { error: embeddingUpdateError } = await supabaseTransaction
                .from('content_chunks')
                .update({ 
                  embedding,
                  skills: updatedSource.skills || chunk.skills,
                  updated_at: new Date().toISOString()
                })
                .eq('id', chunk.id);

              if (embeddingUpdateError) {
                logger.error('Failed to update chunk embedding', {
                  chunkId: chunk.id,
                  error: embeddingUpdateError.message
                });
                return false;
              }
              return true;
            }
            return false;
          } catch (error) {
            logger.error('Error regenerating embedding for chunk', {
              chunkId: chunk.id,
              error: error.message
            });
            return false;
          }
        });

        const results = await Promise.all(embeddingPromises);
        const successCount = results.filter(Boolean).length;

        embeddingResults = {
          regenerated: true,
          affectedChunks: successCount,
          totalChunks: chunks.length,
          success: successCount === chunks.length
        };

        logger.info('Embedding regeneration completed', {
          sourceId: id,
          affectedChunks: successCount,
          totalChunks: chunks.length
        });

      } catch (embeddingError) {
        logger.error('Error during embedding regeneration', {
          sourceId: id,
          error: embeddingError.message
        });
        
        // Don't fail the entire update if embedding fails
        embeddingResults = {
          regenerated: false,
          error: embeddingError.message,
          affectedChunks: 0
        };
      }
    }

    // Return success response
    res.json({
      success: true,
      data: {
        source: updatedSource,
        validation,
        embeddingResults,
        changes: {
          contentChanged,
          updatedFields: Object.keys(updateFields),
          previousValues: Object.keys(updateFields).reduce((prev, key) => {
            prev[key] = existingSource[key];
            return prev;
          }, {})
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in source update endpoint', { 
      sourceId: req.params.id,
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while updating the source'
    });
  }
});

/**
 * DELETE /api/user/sources/:id
 * Remove job with confirmation and cleanup
 */
router.delete('/sources/:id', deleteLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { confirm } = req.query;

    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID must be a valid number'
      });
    }

    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Add ?confirm=true to confirm deletion',
        warning: 'This action cannot be undone'
      });
    }

    logger.info('Deleting source', { sourceId: id, ip: req.ip });

    // Get source details before deletion
    const { data: source, error: fetchError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .eq('type', 'job')
      .single();

    if (fetchError) {
      if (fetchError.code === 'PGRST116') {
        return res.status(404).json({
          error: 'Source not found',
          message: 'No job source found with the specified ID'
        });
      }
      throw fetchError;
    }

    // Get chunk count for impact assessment
    const { count: chunkCount } = await supabase
      .from('content_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('source_id', id);

    // Delete related chunks first (cascade)
    const { error: chunksDeleteError } = await supabase
      .from('content_chunks')
      .delete()
      .eq('source_id', id);

    if (chunksDeleteError) {
      throw chunksDeleteError;
    }

    // Delete the source
    const { error: sourceDeleteError } = await supabase
      .from('sources')
      .delete()
      .eq('id', id);

    if (sourceDeleteError) {
      throw sourceDeleteError;
    }

    logger.info('Source deleted successfully', {
      sourceId: id,
      title: source.title,
      org: source.org,
      deletedChunks: chunkCount
    });

    res.json({
      success: true,
      data: {
        deletedSource: {
          id: source.id,
          title: source.title,
          org: source.org,
          dateRange: `${source.date_start} to ${source.date_end || 'present'}`
        },
        impact: {
          deletedChunks: chunkCount || 0,
          embeddingsRemoved: chunkCount || 0
        }
      },
      message: 'Job source and all related data deleted successfully',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in source deletion endpoint', { 
      sourceId: req.params.id,
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while deleting the source'
    });
  }
});

/**
 * GET /api/user/duplicates
 * Find potential duplicate entries with similarity analysis
 */
router.get('/duplicates', async (req, res) => {
  try {
    logger.info('Finding duplicate entries', { ip: req.ip });

    // Get all job sources
    const { data: sources, error } = await supabase
      .from('sources')
      .select('*')
      .eq('type', 'job')
      .order('date_start', { ascending: false });

    if (error) {
      throw error;
    }

    if (!sources || sources.length < 2) {
      return res.json({
        success: true,
        data: {
          duplicates: [],
          summary: {
            totalJobs: sources?.length || 0,
            duplicateGroups: 0,
            potentialDuplicates: 0,
            similarEntries: 0
          }
        },
        message: 'Insufficient data for duplicate detection',
        timestamp: new Date().toISOString()
      });
    }

    // Find duplicates using the processing service
    const duplicates = processingService.findDuplicates(sources);

    // Categorize duplicates
    const exactDuplicates = duplicates.filter(dup => dup.type === 'potential_duplicate');
    const similarEntries = duplicates.filter(dup => dup.type === 'similar_entry');

    // Enhance duplicates with additional context
    const enhancedDuplicates = await Promise.all(
      duplicates.map(async (duplicate) => {
        const enhancedJobs = await Promise.all(
          duplicate.jobs.map(async (jobInfo) => {
            const { count: chunkCount } = await supabase
              .from('content_chunks')
              .select('*', { count: 'exact', head: true })
              .eq('source_id', jobInfo.job.id);

            return {
              ...jobInfo,
              chunkCount: chunkCount || 0
            };
          })
        );

        return {
          ...duplicate,
          jobs: enhancedJobs,
          recommendations: generateDuplicateRecommendations(duplicate)
        };
      })
    );

    res.json({
      success: true,
      data: {
        duplicates: enhancedDuplicates,
        summary: {
          totalJobs: sources.length,
          duplicateGroups: duplicates.length,
          potentialDuplicates: exactDuplicates.length,
          similarEntries: similarEntries.length,
          highConfidenceDuplicates: duplicates.filter(dup => dup.similarity > 0.9).length
        },
        recommendations: {
          requiresReview: duplicates.filter(dup => dup.similarity > 0.8).length,
          autoMergeable: duplicates.filter(dup => dup.similarity > 0.95).length,
          needsManualCheck: duplicates.filter(dup => dup.similarity > 0.7 && dup.similarity <= 0.8).length
        }
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in duplicates endpoint', { 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred while finding duplicates'
    });
  }
});

/**
 * Generate recommendations for handling duplicates
 */
function generateDuplicateRecommendations(duplicate) {
  const recommendations = [];
  const { similarity, type, jobs } = duplicate;

  if (similarity > 0.95) {
    recommendations.push({
      action: 'merge',
      priority: 'high',
      message: 'Very high similarity - consider merging entries',
      automated: true
    });
  } else if (similarity > 0.8) {
    recommendations.push({
      action: 'review',
      priority: 'medium',
      message: 'High similarity - manual review recommended',
      automated: false
    });
  } else if (similarity > 0.7) {
    recommendations.push({
      action: 'investigate',
      priority: 'low',
      message: 'Moderate similarity - check for related positions',
      automated: false
    });
  }

  // Check for date inconsistencies
  if (jobs.length === 2) {
    const job1 = jobs[0].job;
    const job2 = jobs[1].job;
    
    if (job1.date_start === job2.date_start && job1.date_end === job2.date_end) {
      recommendations.push({
        action: 'merge',
        priority: 'high',
        message: 'Identical dates suggest duplicate entry',
        automated: false
      });
    }
  }

  return recommendations;
}

// ============================================================================
// DUPLICATE MANAGEMENT ROUTES
// ============================================================================

// Mount duplicate management routes
router.use('/duplicates', duplicateManagementRoutes);

/**
 * Error handling middleware
 */
router.use((error, req, res, next) => {
  logger.error('Unhandled error in user-data router', {
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