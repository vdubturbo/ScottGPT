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
import CompanyGroupingService from '../utils/company-grouping.js';
import EmbeddingService from '../services/embeddings.js';
import duplicateManagementRoutes from './duplicate-management.js';

const router = express.Router();

// AI Features Maintenance Mode Flag
// Currently no AI features in user-data.js, but flag available for consistency
const AI_FEATURES_ENABLED = false;
const AI_DISABLE_REASON = 'temporary-cost-protection';
const AI_DISABLE_MESSAGE = 'AI features temporarily disabled to prevent OpenAI API costs';

// Initialize services
const validationService = new DataValidationService();
const processingService = new DataProcessingService();
const companyGroupingService = new CompanyGroupingService();
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

// Note: Rate limit logging moved to handler in express-rate-limit v7

const updateLimiter = createRateLimit(
  5 * 60 * 1000, // 5 minutes
  50, // 50 updates per window - more permissive for auto-save functionality
  'Too many update requests, please try again later'
);

// Note: Rate limit logging moved to handler in express-rate-limit v7

const deleteLimiter = createRateLimit(
  8 * 1000, // 8 seconds
  1, // 1 deletion per window (one every 8 seconds)
  'Too many delete requests, please try again in 8 seconds'
);

// Note: Rate limit logging moved to handler in express-rate-limit v7

// Apply rate limiting
router.use(generalLimiter);

/**
 * GET /api/user/work-history
 * Get chronological list of all jobs with optional company grouping
 * Query parameters:
 *   - groupByCompany: boolean - Enable company grouping view (default: false)
 *   - includeTimeline: boolean - Include timeline data for visualization (default: false)
 */
router.get('/work-history', async (req, res) => {
  try {
    const { groupByCompany, includeTimeline } = req.query;
    const groupingEnabled = groupByCompany === 'true';
    const timelineEnabled = includeTimeline === 'true';
    
    logger.info('Fetching work history', { 
      ip: req.ip,
      groupByCompany: groupingEnabled,
      includeTimeline: timelineEnabled
    });

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
      .eq('user_id', req.user.id)
      .order('date_start', { ascending: false });

    if (error) {
      logger.error('Database error fetching work history', { error: error.message });
      return res.status(500).json({
        error: 'Failed to fetch work history',
        details: error.message
      });
    }

    // Process and enrich the individual job data
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

    // Generate comprehensive analytics (includes company analytics)
    const analytics = processingService.generateAnalytics(enrichedSources);

    // Prepare response data structure
    const responseData = {
      jobs: enrichedSources,
      analytics: {
        // Basic analytics (backward compatibility)
        totalJobs: analytics.totalJobs,
        totalDurationMonths: analytics.totalDuration,
        averageDurationMonths: Math.round(analytics.averageDuration),
        topSkills: Object.entries(analytics.skillFrequency || {})
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10)
          .map(([skill, count]) => ({ skill, count })),
        organizations: Object.keys(analytics.organizationHistory || {}).length,
        
        // Enhanced company analytics (always included but detailed when grouped)
        companies: analytics.companies
      },
      displayMode: groupingEnabled ? 'grouped' : 'individual'
    };

    // Add company grouping data if requested
    if (groupingEnabled) {
      try {
        // Generate company groups
        const companyGroups = companyGroupingService.groupJobsByCompany(enrichedSources);
        
        // Transform company groups for API response
        const companiesData = companyGroups.map(company => ({
          // Basic company information
          company: company.originalNames[0],
          normalizedName: company.normalizedName,
          originalNames: company.originalNames,
          totalPositions: company.totalPositions,
          
          // Dates and duration
          startDate: company.dateRange?.start,
          endDate: company.dateRange?.end,
          dateRange: company.dateRange?.formatted,
          totalTenure: company.tenure.formatted,
          totalMonths: company.tenure.months,
          
          // Positions within company
          positions: company.positions.map(pos => ({
            id: pos.id,
            title: pos.title,
            startDate: pos.date_start,
            endDate: pos.date_end,
            duration: processingService.calculateDuration(pos.date_start, pos.date_end),
            durationFormatted: processingService.formatDurationFromMonths(
              processingService.calculateDuration(pos.date_start, pos.date_end)
            ),
            skills: pos.skills || [],
            chunkCount: pos.chunkCount || 0,
            isCurrentPosition: !pos.date_end
          })),
          
          // Career progression analysis
          careerProgression: {
            pattern: company.careerProgression.pattern,
            progressionScore: company.careerProgression.progressionScore,
            promotions: company.careerProgression.promotions.map(promo => ({
              from: promo.from.title,
              to: promo.to.title,
              date: promo.to.date,
              indicators: promo.indicators
            })),
            promotionCount: company.careerProgression.promotions.length,
            lateralMoves: company.careerProgression.lateralMoves.length,
            totalRoleChanges: company.careerProgression.totalRoleChanges
          },
          
          // Boomerang pattern analysis
          boomerangPattern: {
            isBoomerang: company.boomerangPattern.isBoomerang,
            stints: company.boomerangPattern.stints,
            gaps: company.boomerangPattern.gaps.map(gap => ({
              start: gap.start,
              end: gap.end,
              duration: gap.duration,
              durationFormatted: gap.durationFormatted
            })),
            totalGapTime: company.boomerangPattern.totalGapTimeFormatted
          },
          
          // Skills analysis
          skillsAnalysis: {
            totalSkills: company.aggregatedSkills.skillCount,
            topSkills: Object.entries(company.aggregatedSkills.skillFrequency || {})
              .sort(([,a], [,b]) => b - a)
              .slice(0, 8)
              .map(([skill, count]) => ({ skill, count })),
            skillCategories: company.aggregatedSkills.categoryDistribution,
            skillEvolution: company.aggregatedSkills.skillEvolution?.length || 0
          },
          
          // Company insights
          insights: company.insights,
          
          // Calculated metrics for frontend display
          careerPercentage: analytics.totalDuration > 0 ? 
            Math.round((company.tenure.months / analytics.totalDuration) * 100 * 10) / 10 : 0,
          
          // Display hints for UI
          displayHints: {
            isHighlight: company.tenure.months > 36 || // 3+ years
              (analytics.totalDuration > 0 && (company.tenure.months / analytics.totalDuration) > 0.25), // 25%+ of career
            progressionLevel: company.careerProgression.pattern === 'strong_upward' ? 'high' :
              company.careerProgression.pattern === 'upward' ? 'medium' : 'low',
            stabilityLevel: company.tenure.months > 36 ? 'high' :
              company.tenure.months > 12 ? 'medium' : 'low'
          }
        }));
        
        // Sort companies by most recent activity
        companiesData.sort((a, b) => {
          const aLatest = new Date(Math.max(...a.positions.map(p => new Date(p.endDate || new Date()))));
          const bLatest = new Date(Math.max(...b.positions.map(p => new Date(p.endDate || new Date()))));
          return bLatest - aLatest;
        });
        
        responseData.companies = companiesData;
        
        // Add company-level summary statistics
        responseData.companySummary = {
          totalCompanies: companiesData.length,
          companiesWithMultipleRoles: companiesData.filter(c => c.totalPositions > 1).length,
          boomerangCompanies: companiesData.filter(c => c.boomerangPattern.isBoomerang).length,
          companiesWithPromotions: companiesData.filter(c => c.careerProgression.promotionCount > 0).length,
          averageTenurePerCompany: companiesData.length > 0 ?
            Math.round(companiesData.reduce((sum, c) => sum + c.totalMonths, 0) / companiesData.length) : 0,
          longestTenure: companiesData.length > 0 ?
            Math.max(...companiesData.map(c => c.totalMonths)) : 0
        };
        
        logger.info('Company grouping completed', {
          totalCompanies: companiesData.length,
          multiRoleCompanies: responseData.companySummary.companiesWithMultipleRoles
        });
        
      } catch (groupingError) {
        logger.error('Error during company grouping', {
          error: groupingError.message,
          stack: groupingError.stack
        });
        // Don't fail the entire request - fall back to individual view
        responseData.displayMode = 'individual';
        responseData.groupingError = 'Company grouping failed - showing individual view';
      }
    }

    // Add timeline data if requested
    if (timelineEnabled) {
      try {
        const timelineData = processingService.generateCompanyTimeline(enrichedSources);
        responseData.timeline = {
          blocks: timelineData.timeline,
          patterns: timelineData.patterns,
          gaps: timelineData.gaps,
          overlaps: timelineData.overlaps,
          insights: timelineData.insights,
          metadata: timelineData.metadata
        };
        
        logger.info('Timeline data generated', {
          timelineBlocks: timelineData.timeline.length,
          careerPattern: timelineData.patterns.careerPattern
        });
        
      } catch (timelineError) {
        logger.error('Error generating timeline data', {
          error: timelineError.message,
          stack: timelineError.stack
        });
        // Timeline is optional - don't fail the request
        responseData.timelineError = 'Timeline generation failed';
      }
    }

    // Success response
    res.json({
      success: true,
      data: responseData,
      features: {
        groupByCompany: groupingEnabled,
        includeTimeline: timelineEnabled,
        companyAnalytics: true,
        careerPatterns: groupingEnabled || timelineEnabled
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
    
    if (!id || id.trim() === '') {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID is required'
      });
    }

    logger.info('Fetching source details', { sourceId: id, ip: req.ip });

    // Get source details
    const { data: source, error: sourceError } = await supabase
      .from('sources')
      .select('*')
      .eq('id', id)
      .eq('type', 'job')
      .eq('user_id', req.user.id)
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

    if (!id || id.trim() === '') {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID is required'
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
      .eq('user_id', req.user.id)
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
      .eq('type', 'job')
      .eq('user_id', req.user.id);

    if (jobsError) {
      throw jobsError;
    }

    // Merge existing data with updates
    const mergedData = { ...existingSource, ...updateData, id: id };

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

    // Prepare update object (exclude computed fields and non-existent columns)
    const {
      id: _id,
      created_at,
      updated_at,
      duration_months,
      skill_categories,
      processed_at,
      description, // Exclude description if it doesn't exist in schema
      ...updateFields
    } = processedData;

    // Clean update fields - convert empty strings to null for date fields
    const cleanedUpdateFields = Object.entries(updateFields).reduce((acc, [key, value]) => {
      if ((key.includes('date') || key.endsWith('_at')) && value === '') {
        acc[key] = null;
      } else {
        acc[key] = value;
      }
      return acc;
    }, {});

    // Update the source
    const { data: updatedSource, error: updateError } = await supabaseTransaction
      .from('sources')
      .update({
        ...cleanedUpdateFields,
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
 * DELETE /api/user/sources/bulk
 * Remove multiple jobs with confirmation and cleanup
 */
router.delete('/sources/bulk', deleteLimiter, async (req, res) => {
  try {
    const { ids } = req.body;
    const { confirm } = req.query;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        error: 'Invalid source IDs',
        message: 'Array of source IDs is required'
      });
    }

    if (ids.length > 20) {
      return res.status(400).json({
        error: 'Too many items',
        message: 'Maximum 20 items can be deleted at once'
      });
    }

    if (confirm !== 'true') {
      return res.status(400).json({
        error: 'Confirmation required',
        message: 'Add ?confirm=true to confirm deletion',
        warning: 'This action cannot be undone'
      });
    }

    logger.info('Bulk deleting sources', { 
      sourceIds: ids, 
      count: ids.length,
      ip: req.ip 
    });


    const deletedSources = [];
    const errors = [];
    let totalDeletedChunks = 0;

    // Process each ID
    for (const id of ids) {
      try {
        // Get source details before deletion
        const { data: source, error: fetchError } = await supabase
          .from('sources')
          .select('*')
          .eq('id', id)
          .eq('type', 'job')
          .eq('user_id', req.user.id)
          .single();

        if (fetchError) {
          if (fetchError.code === 'PGRST116') {
            errors.push({ id, error: 'Source not found' });
            continue;
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
          errors.push({ id, error: 'Failed to delete chunks' });
          continue;
        }

        // Delete the source
        const { error: sourceDeleteError } = await supabase
          .from('sources')
          .delete()
          .eq('id', id);

        if (sourceDeleteError) {
          errors.push({ id, error: 'Failed to delete source' });
          continue;
        }

        deletedSources.push({
          id: source.id,
          title: source.title,
          org: source.org,
          dateRange: `${source.date_start} to ${source.date_end || 'present'}`,
          deletedChunks: chunkCount || 0
        });

        totalDeletedChunks += (chunkCount || 0);

      } catch (error) {
        logger.error('Error deleting individual source', { 
          sourceId: id, 
          error: error.message 
        });
        errors.push({ id, error: error.message });
      }
    }

    logger.info('Bulk deletion completed', {
      requested: ids.length,
      successful: deletedSources.length,
      failed: errors.length,
      totalDeletedChunks
    });

    res.json({
      success: true,
      data: {
        deletedSources,
        errors,
        summary: {
          requested: ids.length,
          successful: deletedSources.length,
          failed: errors.length,
          totalDeletedChunks,
          totalEmbeddingsRemoved: totalDeletedChunks
        }
      },
      message: `Bulk deletion completed: ${deletedSources.length} sources deleted, ${errors.length} failed`,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Unexpected error in bulk deletion endpoint', { 
      error: error.message,
      stack: error.stack 
    });
    
    res.status(500).json({
      error: 'Internal server error',
      message: 'An unexpected error occurred during bulk deletion'
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

    if (!id || id.trim() === '') {
      return res.status(400).json({
        error: 'Invalid source ID',
        message: 'Source ID is required'
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
      .eq('user_id', req.user.id)
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
 * GET /api/user/debug/sources
 * Debug endpoint to check source data
 */
router.get('/debug/sources', async (req, res) => {
  try {
    const { data: sources, error } = await supabase
      .from('sources')
      .select('id, type, title, org, created_at')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    const jobSources = sources.filter(s => s.type === 'job');
    const otherSources = sources.filter(s => s.type !== 'job');

    res.json({
      success: true,
      data: {
        totalSources: sources.length,
        jobSources: {
          count: jobSources.length,
          items: jobSources
        },
        otherSources: {
          count: otherSources.length,
          types: [...new Set(otherSources.map(s => s.type))],
          items: otherSources
        }
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Debug query failed',
      message: error.message
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
      .eq('user_id', req.user.id)
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
 * GET /api/user/documents
 * Get list of uploaded documents from pipeline_documents table
 * Query parameters:
 *   - limit: number - Maximum number of documents to return (default: 100)
 *   - offset: number - Number of documents to skip for pagination (default: 0)
 *   - status: string - Filter by processing_status (optional)
 */
router.get('/documents', async (req, res) => {
  try {
    const { limit = 100, offset = 0, status } = req.query;
    
    logger.info('Fetching uploaded documents', { 
      ip: req.ip,
      limit,
      offset,
      status
    });

    // If limit is 0, just return the count
    if (parseInt(limit) === 0) {
      let countQuery = supabase
        .from('pipeline_documents')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', req.user.id);
      
      if (status) {
        countQuery = countQuery.eq('processing_status', status);
      }
      
      const { count, error: countError } = await countQuery;
      
      if (countError) {
        logger.error('Failed to get document count', { error: countError });
        return res.status(500).json({
          error: 'Failed to get document count',
          message: countError.message
        });
      }
      
      return res.json({
        success: true,
        data: [],
        pagination: {
          limit: 0,
          offset: 0,
          total: count || 0
        }
      });
    }

    // Build query for actual documents
    let query = supabase
      .from('pipeline_documents')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

    // Add status filter if provided
    if (status) {
      query = query.eq('processing_status', status);
    }

    const { data: documents, error } = await query;

    if (error) {
      logger.error('Failed to fetch documents', { error });
      return res.status(500).json({
        error: 'Failed to fetch documents',
        message: error.message
      });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('pipeline_documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', req.user.id);
    
    if (status) {
      countQuery = countQuery.eq('processing_status', status);
    }
    
    const { count, error: countError } = await countQuery;

    if (countError) {
      logger.warn('Failed to get document count', { error: countError });
    }

    logger.info('Documents fetched successfully', { 
      count: documents?.length || 0,
      totalCount: count || 0
    });

    res.json({
      success: true,
      data: documents || [],
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: count || documents?.length || 0
      }
    });

  } catch (error) {
    logger.error('Error fetching documents', { 
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });

    res.status(500).json({
      error: 'Failed to fetch documents',
      message: 'An unexpected error occurred while fetching documents'
    });
  }
});

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