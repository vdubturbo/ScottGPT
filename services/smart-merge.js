/**
 * Smart Merge Service
 * Intelligent merging of duplicate job entries with field-specific strategies,
 * data lineage tracking, and undo capabilities
 */

import winston from 'winston';
import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../config/database.js';
import EmbeddingService from './embeddings.js';
import DataProcessingService from '../utils/data-processing.js';

export class SmartMergeService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/smart-merge.log' })
      ]
    });

    this.embeddingService = new EmbeddingService();
    this.processingService = new DataProcessingService();

    // Merge operation tracking
    this.mergeOperations = new Map();
    
    // Field merge strategies
    this.mergeStrategies = {
      title: 'prefer_detailed',      // Use longer, more descriptive title
      org: 'prefer_complete',        // Use most complete organization name
      description: 'prefer_longest', // Use longest description
      skills: 'merge_unique',        // Combine and deduplicate skills
      location: 'prefer_complete',   // Use most complete location
      date_start: 'use_earliest',    // Use earliest start date
      date_end: 'use_latest',        // Use latest end date (or null if any is null)
      created_at: 'use_earliest',    // Keep earliest creation timestamp
      updated_at: 'use_current'      // Use current timestamp for merged entry
    };
  }

  /**
   * Preview merge operation
   * @param {number} sourceId - Source job ID to merge FROM
   * @param {number} targetId - Target job ID to merge INTO
   * @param {Object} options - Merge options
   * @returns {Object} Merge preview
   */
  async previewMerge(sourceId, targetId, options = {}) {
    try {
      this.logger.info('Generating merge preview', { sourceId, targetId });

      // Get both jobs with their chunks
      const [sourceJob, targetJob] = await Promise.all([
        this.getJobWithChunks(sourceId),
        this.getJobWithChunks(targetId)
      ]);

      if (!sourceJob || !targetJob) {
        throw new Error('One or both jobs not found');
      }

      // Calculate merge result
      const mergedData = this.calculateMergedData(sourceJob, targetJob, options);
      
      // Analyze changes
      const changes = this.analyzeChanges(targetJob, mergedData);
      
      // Assess merge quality and risks
      const quality = this.assessMergeQuality(sourceJob, targetJob, mergedData);
      const risks = this.identifyMergeRisks(sourceJob, targetJob, mergedData);
      
      // Calculate impact
      const impact = await this.calculateMergeImpact(sourceJob, targetJob);

      return {
        preview: {
          sourceJob: this.sanitizeJobForPreview(sourceJob),
          targetJob: this.sanitizeJobForPreview(targetJob),
          mergedResult: mergedData,
          changes,
          fieldMappings: this.generateFieldMappings(sourceJob, targetJob, mergedData)
        },
        analysis: {
          quality,
          risks,
          impact,
          recommendations: this.generateMergeRecommendations(sourceJob, targetJob, quality, risks)
        },
        operations: {
          chunksToMerge: sourceJob.chunks.length,
          chunksToUpdate: targetJob.chunks.length,
          embeddingsToRegenerate: targetJob.chunks.length,
          estimatedDuration: this.estimateMergeDuration(sourceJob, targetJob)
        },
        reversible: true,
        mergeId: uuidv4()
      };

    } catch (error) {
      this.logger.error('Error generating merge preview', { 
        sourceId, 
        targetId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Execute merge operation
   * @param {number} sourceId - Source job ID
   * @param {number} targetId - Target job ID
   * @param {Object} options - Merge options
   * @returns {Object} Merge result
   */
  async executeMerge(sourceId, targetId, options = {}) {
    const mergeId = uuidv4();
    
    try {
      this.logger.info('Starting merge operation', { mergeId, sourceId, targetId });

      // Start transaction
      const { data: transaction, error: transactionError } = await supabase.rpc('begin_transaction');
      if (transactionError) throw transactionError;

      // Track merge operation
      const mergeContext = {
        id: mergeId,
        sourceId,
        targetId,
        startTime: new Date(),
        status: 'in_progress',
        rollbackData: [],
        options
      };
      this.mergeOperations.set(mergeId, mergeContext);

      try {
        // Get jobs with chunks
        const [sourceJob, targetJob] = await Promise.all([
          this.getJobWithChunks(sourceId),
          this.getJobWithChunks(targetId)
        ]);

        if (!sourceJob || !targetJob) {
          throw new Error('Jobs not found');
        }

        // Store rollback data
        mergeContext.rollbackData.push({
          type: 'job_backup',
          targetJob: { ...targetJob },
          sourceJob: { ...sourceJob }
        });

        // Calculate merged data
        const mergedData = this.calculateMergedData(sourceJob, targetJob, options);

        // Update target job with merged data
        const { error: updateError } = await supabase
          .from('sources')
          .update({
            ...mergedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetId);

        if (updateError) throw updateError;

        // Merge content chunks
        await this.mergeContentChunks(sourceJob, targetJob, mergeId);

        // Delete source job
        const { error: deleteError } = await supabase
          .from('sources')
          .delete()
          .eq('id', sourceId);

        if (deleteError) throw deleteError;

        // Regenerate embeddings for merged job
        await this.regenerateEmbeddingsForMergedJob(targetId, mergedData);

        // Record merge in audit log
        await this.recordMergeAudit(mergeId, sourceJob, targetJob, mergedData);

        // Commit transaction
        const { error: commitError } = await supabase.rpc('commit_transaction');
        if (commitError) throw commitError;

        mergeContext.status = 'completed';
        mergeContext.endTime = new Date();
        mergeContext.duration = mergeContext.endTime - mergeContext.startTime;

        this.logger.info('Merge operation completed', { 
          mergeId, 
          duration: mergeContext.duration 
        });

        return {
          mergeId,
          status: 'completed',
          result: {
            mergedJobId: targetId,
            deletedJobId: sourceId,
            mergedData,
            chunksProcessed: sourceJob.chunks.length + targetJob.chunks.length,
            embeddingsRegenerated: targetJob.chunks.length
          },
          duration: mergeContext.duration,
          undoAvailable: true,
          undoExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
        };

      } catch (error) {
        // Rollback transaction
        await supabase.rpc('rollback_transaction');
        mergeContext.status = 'failed';
        mergeContext.error = error.message;
        throw error;
      }

    } catch (error) {
      this.logger.error('Merge operation failed', { 
        mergeId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Calculate merged data using field-specific strategies
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} options - Merge options
   * @returns {Object} Merged job data
   */
  calculateMergedData(sourceJob, targetJob, options = {}) {
    const merged = { ...targetJob };
    const customStrategies = options.fieldStrategies || {};

    // Apply field-specific merge strategies
    Object.keys(this.mergeStrategies).forEach(field => {
      const strategy = customStrategies[field] || this.mergeStrategies[field];
      merged[field] = this.applyFieldStrategy(
        field, 
        sourceJob[field], 
        targetJob[field], 
        strategy,
        sourceJob,
        targetJob
      );
    });

    // Add merge metadata
    merged.merge_source_id = sourceJob.id;
    merged.merge_timestamp = new Date().toISOString();
    merged.merge_strategy = options.strategy || 'smart_merge';

    return merged;
  }

  /**
   * Apply field-specific merge strategy
   * @param {string} field - Field name
   * @param {*} sourceValue - Source field value
   * @param {*} targetValue - Target field value
   * @param {string} strategy - Merge strategy
   * @param {Object} sourceJob - Complete source job
   * @param {Object} targetJob - Complete target job
   * @returns {*} Merged field value
   */
  applyFieldStrategy(field, sourceValue, targetValue, strategy, sourceJob, targetJob) {
    switch (strategy) {
      case 'prefer_detailed':
        return this.preferDetailed(sourceValue, targetValue);
      
      case 'prefer_complete':
        return this.preferComplete(sourceValue, targetValue);
      
      case 'prefer_longest':
        return this.preferLongest(sourceValue, targetValue);
      
      case 'merge_unique':
        return this.mergeUnique(sourceValue, targetValue);
      
      case 'use_earliest':
        return this.useEarliest(sourceValue, targetValue);
      
      case 'use_latest':
        return this.useLatest(sourceValue, targetValue);
      
      case 'use_current':
        return new Date().toISOString();
      
      case 'prefer_source':
        return sourceValue !== null && sourceValue !== undefined ? sourceValue : targetValue;
      
      case 'prefer_target':
        return targetValue !== null && targetValue !== undefined ? targetValue : sourceValue;
      
      default:
        return targetValue; // Default to keeping target value
    }
  }

  /**
   * Prefer more detailed value (longer with more info)
   * @param {*} sourceValue - Source value
   * @param {*} targetValue - Target value
   * @returns {*} More detailed value
   */
  preferDetailed(sourceValue, targetValue) {
    if (!sourceValue) return targetValue;
    if (!targetValue) return sourceValue;

    // For strings, prefer longer with more words
    if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
      const sourceWords = sourceValue.trim().split(/\s+/).length;
      const targetWords = targetValue.trim().split(/\s+/).length;
      
      if (sourceWords !== targetWords) {
        return sourceWords > targetWords ? sourceValue : targetValue;
      }
      
      // If same word count, prefer longer
      return sourceValue.length > targetValue.length ? sourceValue : targetValue;
    }

    return targetValue;
  }

  /**
   * Prefer more complete value (non-empty, more specific)
   * @param {*} sourceValue - Source value
   * @param {*} targetValue - Target value
   * @returns {*} More complete value
   */
  preferComplete(sourceValue, targetValue) {
    if (!sourceValue) return targetValue;
    if (!targetValue) return sourceValue;

    // For strings, prefer longer and more specific
    if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
      const sourceTrimmed = sourceValue.trim();
      const targetTrimmed = targetValue.trim();
      
      if (sourceTrimmed.length !== targetTrimmed.length) {
        return sourceTrimmed.length > targetTrimmed.length ? sourceValue : targetValue;
      }
    }

    return targetValue;
  }

  /**
   * Prefer longest value
   * @param {*} sourceValue - Source value
   * @param {*} targetValue - Target value
   * @returns {*} Longest value
   */
  preferLongest(sourceValue, targetValue) {
    if (!sourceValue) return targetValue;
    if (!targetValue) return sourceValue;

    if (typeof sourceValue === 'string' && typeof targetValue === 'string') {
      return sourceValue.length > targetValue.length ? sourceValue : targetValue;
    }

    return targetValue;
  }

  /**
   * Merge arrays with unique values
   * @param {Array} sourceValue - Source array
   * @param {Array} targetValue - Target array
   * @returns {Array} Merged unique array
   */
  mergeUnique(sourceValue, targetValue) {
    const sourceArray = Array.isArray(sourceValue) ? sourceValue : [];
    const targetArray = Array.isArray(targetValue) ? targetValue : [];

    // For skills, normalize before merging
    const allItems = [...sourceArray, ...targetArray];
    const normalizedItems = allItems.map(item => 
      typeof item === 'string' ? this.processingService.normalizeSkill(item) : item
    );

    // Remove duplicates and sort
    const uniqueItems = [...new Set(normalizedItems)].filter(item => item && item.trim());
    return uniqueItems.sort();
  }

  /**
   * Use earliest date value
   * @param {*} sourceValue - Source date
   * @param {*} targetValue - Target date
   * @returns {*} Earliest date
   */
  useEarliest(sourceValue, targetValue) {
    if (!sourceValue) return targetValue;
    if (!targetValue) return sourceValue;

    const sourceDate = new Date(sourceValue);
    const targetDate = new Date(targetValue);
    
    return sourceDate < targetDate ? sourceValue : targetValue;
  }

  /**
   * Use latest date value
   * @param {*} sourceValue - Source date
   * @param {*} targetValue - Target date
   * @returns {*} Latest date
   */
  useLatest(sourceValue, targetValue) {
    // If either is null (current job), keep null
    if (sourceValue === null || targetValue === null) return null;
    
    if (!sourceValue) return targetValue;
    if (!targetValue) return sourceValue;

    const sourceDate = new Date(sourceValue);
    const targetDate = new Date(targetValue);
    
    return sourceDate > targetDate ? sourceValue : targetValue;
  }

  /**
   * Get job with its content chunks
   * @param {number} jobId - Job ID
   * @returns {Object} Job with chunks
   */
  async getJobWithChunks(jobId) {
    try {
      // Get job data
      const { data: job, error: jobError } = await supabase
        .from('sources')
        .select('*')
        .eq('id', jobId)
        .eq('type', 'job')
        .single();

      if (jobError) throw jobError;
      if (!job) return null;

      // Get content chunks
      const { data: chunks, error: chunksError } = await supabase
        .from('content_chunks')
        .select('*')
        .eq('source_id', jobId)
        .order('created_at');

      if (chunksError) throw chunksError;

      return {
        ...job,
        chunks: chunks || []
      };

    } catch (error) {
      this.logger.error('Error getting job with chunks', { jobId, error: error.message });
      throw error;
    }
  }

  /**
   * Merge content chunks from source into target
   * @param {Object} sourceJob - Source job with chunks
   * @param {Object} targetJob - Target job with chunks
   * @param {string} mergeId - Merge operation ID
   */
  async mergeContentChunks(sourceJob, targetJob, mergeId) {
    try {
      // Update source chunks to point to target job
      if (sourceJob.chunks.length > 0) {
        const sourceChunkIds = sourceJob.chunks.map(chunk => chunk.id);
        
        const { error: updateError } = await supabase
          .from('content_chunks')
          .update({ 
            source_id: targetJob.id,
            merge_id: mergeId,
            merge_original_source_id: sourceJob.id,
            updated_at: new Date().toISOString()
          })
          .in('id', sourceChunkIds);

        if (updateError) throw updateError;
      }

      // Mark target chunks as merged
      if (targetJob.chunks.length > 0) {
        const targetChunkIds = targetJob.chunks.map(chunk => chunk.id);
        
        const { error: markError } = await supabase
          .from('content_chunks')
          .update({ 
            merge_id: mergeId,
            updated_at: new Date().toISOString()
          })
          .in('id', targetChunkIds);

        if (markError) throw markError;
      }

    } catch (error) {
      this.logger.error('Error merging content chunks', { 
        sourceJobId: sourceJob.id,
        targetJobId: targetJob.id,
        mergeId,
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Regenerate embeddings for merged job
   * @param {number} jobId - Merged job ID
   * @param {Object} mergedData - Merged job data
   */
  async regenerateEmbeddingsForMergedJob(jobId, mergedData) {
    try {
      // Get all chunks for the merged job
      const { data: chunks, error } = await supabase
        .from('content_chunks')
        .select('id, title, content')
        .eq('source_id', jobId);

      if (error) throw error;

      // Regenerate embeddings for each chunk
      for (const chunk of chunks) {
        const embeddingContent = [
          mergedData.title,
          chunk.title,
          chunk.content,
          mergedData.skills?.join(', ')
        ].filter(Boolean).join(' ');

        const embedding = await this.embeddingService.embedText(
          embeddingContent, 
          'search_document'
        );

        if (embedding) {
          await supabase
            .from('content_chunks')
            .update({ 
              embedding,
              skills: mergedData.skills,
              updated_at: new Date().toISOString()
            })
            .eq('id', chunk.id);
        }
      }

    } catch (error) {
      this.logger.error('Error regenerating embeddings for merged job', {
        jobId,
        error: error.message
      });
      // Don't throw - this is not critical for merge success
    }
  }

  /**
   * Record merge operation in audit log
   * @param {string} mergeId - Merge ID
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} mergedData - Merged result
   */
  async recordMergeAudit(mergeId, sourceJob, targetJob, mergedData) {
    try {
      const auditRecord = {
        id: mergeId,
        operation_type: 'merge',
        source_job_id: sourceJob.id,
        target_job_id: targetJob.id,
        source_data: sourceJob,
        target_data: targetJob,
        merged_data: mergedData,
        timestamp: new Date().toISOString(),
        reversible: true,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      };

      const { error } = await supabase
        .from('merge_audit')
        .insert(auditRecord);

      if (error) throw error;

    } catch (error) {
      this.logger.error('Error recording merge audit', { 
        mergeId, 
        error: error.message 
      });
      // Don't throw - audit failure shouldn't break merge
    }
  }

  /**
   * Analyze changes between original and merged data
   * @param {Object} original - Original job data
   * @param {Object} merged - Merged job data
   * @returns {Object} Change analysis
   */
  analyzeChanges(original, merged) {
    const changes = {};
    const important = ['title', 'org', 'description', 'skills', 'date_start', 'date_end', 'location'];

    important.forEach(field => {
      const originalValue = original[field];
      const mergedValue = merged[field];

      if (JSON.stringify(originalValue) !== JSON.stringify(mergedValue)) {
        changes[field] = {
          from: originalValue,
          to: mergedValue,
          changeType: this.categorizeChange(field, originalValue, mergedValue)
        };
      }
    });

    return {
      changedFields: Object.keys(changes),
      changes,
      hasSignificantChanges: Object.keys(changes).some(field => 
        ['title', 'org', 'description'].includes(field)
      )
    };
  }

  /**
   * Categorize type of change
   * @param {string} field - Field name
   * @param {*} from - Original value
   * @param {*} to - New value
   * @returns {string} Change type
   */
  categorizeChange(field, from, to) {
    if (!from && to) return 'added';
    if (from && !to) return 'removed';
    if (Array.isArray(from) && Array.isArray(to)) {
      return from.length !== to.length ? 'modified' : 'reordered';
    }
    if (typeof from === 'string' && typeof to === 'string') {
      if (to.includes(from) || from.includes(to)) return 'expanded';
      return 'replaced';
    }
    return 'modified';
  }

  /**
   * Assess merge quality
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} mergedData - Merged result
   * @returns {Object} Quality assessment
   */
  assessMergeQuality(sourceJob, targetJob, mergedData) {
    const quality = {
      score: 0,
      factors: [],
      grade: 'Poor'
    };

    // Data completeness improvement
    const originalCompleteness = this.calculateCompleteness(targetJob);
    const mergedCompleteness = this.calculateCompleteness(mergedData);
    
    if (mergedCompleteness > originalCompleteness) {
      quality.score += 0.3;
      quality.factors.push('Improved data completeness');
    }

    // Content richness
    const originalContentLength = (targetJob.description || '').length;
    const mergedContentLength = (mergedData.description || '').length;
    
    if (mergedContentLength > originalContentLength) {
      quality.score += 0.2;
      quality.factors.push('Enhanced content detail');
    }

    // Skills consolidation
    const originalSkillCount = (targetJob.skills || []).length;
    const mergedSkillCount = (mergedData.skills || []).length;
    
    if (mergedSkillCount >= originalSkillCount) {
      quality.score += 0.2;
      quality.factors.push('Expanded skill set');
    }

    // Date range optimization
    if (this.isDateRangeImproved(sourceJob, targetJob, mergedData)) {
      quality.score += 0.15;
      quality.factors.push('Optimized date range');
    }

    // Information consistency
    if (this.isInformationConsistent(sourceJob, targetJob)) {
      quality.score += 0.15;
      quality.factors.push('Consistent information');
    }

    // Assign grade
    if (quality.score >= 0.8) quality.grade = 'Excellent';
    else if (quality.score >= 0.6) quality.grade = 'Good';
    else if (quality.score >= 0.4) quality.grade = 'Fair';
    else quality.grade = 'Poor';

    return quality;
  }

  /**
   * Calculate data completeness score
   * @param {Object} job - Job data
   * @returns {number} Completeness score 0-1
   */
  calculateCompleteness(job) {
    const fields = ['title', 'org', 'description', 'skills', 'location', 'date_start'];
    const weights = [0.2, 0.2, 0.3, 0.2, 0.05, 0.05];
    
    let score = 0;
    fields.forEach((field, index) => {
      if (job[field]) {
        if (Array.isArray(job[field])) {
          score += job[field].length > 0 ? weights[index] : 0;
        } else if (typeof job[field] === 'string') {
          score += job[field].trim().length > 0 ? weights[index] : 0;
        } else {
          score += weights[index];
        }
      }
    });

    return score;
  }

  /**
   * Check if date range is improved after merge
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job  
   * @param {Object} mergedData - Merged data
   * @returns {boolean} Whether date range improved
   */
  isDateRangeImproved(sourceJob, targetJob, mergedData) {
    const originalStart = new Date(targetJob.date_start);
    const originalEnd = targetJob.date_end ? new Date(targetJob.date_end) : new Date();
    const originalDuration = originalEnd - originalStart;

    const mergedStart = new Date(mergedData.date_start);
    const mergedEnd = mergedData.date_end ? new Date(mergedData.date_end) : new Date();
    const mergedDuration = mergedEnd - mergedStart;

    return mergedDuration >= originalDuration;
  }

  /**
   * Check information consistency between jobs
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @returns {boolean} Whether information is consistent
   */
  isInformationConsistent(sourceJob, targetJob) {
    // Check company consistency
    const companyMatch = this.normalizeString(sourceJob.org) === this.normalizeString(targetJob.org);
    
    // Check title similarity
    const titleSimilarity = this.calculateStringSimilarity(sourceJob.title, targetJob.title);
    
    return companyMatch && titleSimilarity > 0.7;
  }

  /**
   * Normalize string for comparison
   * @param {string} str - String to normalize
   * @returns {string} Normalized string
   */
  normalizeString(str) {
    return (str || '').toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  }

  /**
   * Calculate string similarity
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score 0-1
   */
  calculateStringSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    
    const maxLength = Math.max(str1.length, str2.length);
    if (maxLength === 0) return 1;
    
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return Math.max(0, 1 - (distance / maxLength));
  }

  /**
   * Identify merge risks
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} mergedData - Merged data
   * @returns {Array} Risk factors
   */
  identifyMergeRisks(sourceJob, targetJob, mergedData) {
    const risks = [];

    // Significant content differences
    const contentSim = this.calculateStringSimilarity(
      sourceJob.description || '', 
      targetJob.description || ''
    );
    
    if (contentSim < 0.5 && sourceJob.description && targetJob.description) {
      risks.push({
        type: 'content_divergence',
        severity: 'medium',
        message: 'Job descriptions are significantly different',
        impact: 'May lose important context or create confusion'
      });
    }

    // Large skill set differences
    const sourceSkills = new Set(sourceJob.skills || []);
    const targetSkills = new Set(targetJob.skills || []);
    const intersection = new Set([...sourceSkills].filter(x => targetSkills.has(x)));
    const union = new Set([...sourceSkills, ...targetSkills]);
    const skillSimilarity = intersection.size / union.size;
    
    if (skillSimilarity < 0.3 && sourceSkills.size > 0 && targetSkills.size > 0) {
      risks.push({
        type: 'skills_mismatch',
        severity: 'low',
        message: 'Different skill sets may indicate different roles',
        impact: 'Could create misleading skill profile'
      });
    }

    // Date inconsistencies
    if (sourceJob.date_start && targetJob.date_start) {
      const dateDiff = Math.abs(
        new Date(sourceJob.date_start) - new Date(targetJob.date_start)
      ) / (1000 * 60 * 60 * 24); // days
      
      if (dateDiff > 365) {
        risks.push({
          type: 'date_mismatch',
          severity: 'high',
          message: 'Start dates differ by more than a year',
          impact: 'May represent different employment periods'
        });
      }
    }

    // Large chunk count difference
    const chunkDiff = Math.abs(sourceJob.chunks.length - targetJob.chunks.length);
    if (chunkDiff > 5) {
      risks.push({
        type: 'content_volume',
        severity: 'low',
        message: 'Significant difference in content volume',
        impact: 'One entry may be much more detailed than the other'
      });
    }

    return risks;
  }

  /**
   * Generate merge recommendations
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} quality - Quality assessment
   * @param {Array} risks - Risk factors
   * @returns {Array} Recommendations
   */
  generateMergeRecommendations(sourceJob, targetJob, quality, risks) {
    const recommendations = [];

    if (quality.score >= 0.8) {
      recommendations.push({
        type: 'proceed',
        priority: 'high',
        message: 'High-quality merge - safe to proceed',
        reasoning: 'Merge will improve data without significant risks'
      });
    } else if (quality.score >= 0.6) {
      recommendations.push({
        type: 'review',
        priority: 'medium',
        message: 'Good merge quality - review before proceeding',
        reasoning: 'Minor risks identified, but merge benefits outweigh concerns'
      });
    } else {
      recommendations.push({
        type: 'caution',
        priority: 'low',
        message: 'Low merge quality - careful review recommended',
        reasoning: 'Significant differences may indicate separate positions'
      });
    }

    // Risk-specific recommendations
    if (risks.some(risk => risk.severity === 'high')) {
      recommendations.push({
        type: 'investigate',
        priority: 'high',
        message: 'High-risk factors detected - investigate before merging',
        reasoning: 'Manual review required to ensure data accuracy'
      });
    }

    // Specific improvement suggestions
    if (quality.factors.includes('Enhanced content detail')) {
      recommendations.push({
        type: 'benefit',
        priority: 'medium',
        message: 'Merge will create more comprehensive job description',
        reasoning: 'Combined content provides better context'
      });
    }

    return recommendations;
  }

  /**
   * Generate field mappings for preview
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @param {Object} mergedData - Merged data
   * @returns {Object} Field mappings
   */
  generateFieldMappings(sourceJob, targetJob, mergedData) {
    const mappings = {};
    const fields = ['title', 'org', 'description', 'skills', 'location', 'date_start', 'date_end'];

    fields.forEach(field => {
      const sourceValue = sourceJob[field];
      const targetValue = targetJob[field];
      const mergedValue = mergedData[field];

      mappings[field] = {
        source: sourceValue,
        target: targetValue,
        merged: mergedValue,
        strategy: this.mergeStrategies[field],
        changed: JSON.stringify(targetValue) !== JSON.stringify(mergedValue),
        sourceUsed: JSON.stringify(sourceValue) === JSON.stringify(mergedValue)
      };
    });

    return mappings;
  }

  /**
   * Calculate merge impact
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @returns {Object} Impact analysis
   */
  async calculateMergeImpact(sourceJob, targetJob) {
    return {
      contentChunks: {
        current: targetJob.chunks.length,
        additional: sourceJob.chunks.length,
        total: targetJob.chunks.length + sourceJob.chunks.length
      },
      embeddingRegeneration: {
        chunksToUpdate: targetJob.chunks.length,
        estimatedTime: `${Math.ceil(targetJob.chunks.length * 0.5)} seconds`
      },
      storageImpact: {
        chunksToDelete: 0, // We keep all chunks
        jobsToDelete: 1,   // Source job deleted
        netReduction: 1    // One fewer job entry
      },
      searchImpact: {
        improvedRecall: 'More comprehensive content for search queries',
        betterContext: 'Combined context provides richer search results'
      }
    };
  }

  /**
   * Estimate merge duration
   * @param {Object} sourceJob - Source job
   * @param {Object} targetJob - Target job
   * @returns {string} Duration estimate
   */
  estimateMergeDuration(sourceJob, targetJob) {
    const chunkCount = sourceJob.chunks.length + targetJob.chunks.length;
    const embeddingTime = targetJob.chunks.length * 0.5; // 0.5 seconds per embedding
    const processingTime = 2; // Base processing time
    
    const totalSeconds = embeddingTime + processingTime;
    
    if (totalSeconds < 60) {
      return `${Math.ceil(totalSeconds)} seconds`;
    } else {
      return `${Math.ceil(totalSeconds / 60)} minutes`;
    }
  }

  /**
   * Sanitize job for preview (remove sensitive/internal fields)
   * @param {Object} job - Job object
   * @returns {Object} Sanitized job
   */
  sanitizeJobForPreview(job) {
    const { chunks, ...sanitized } = job;
    return {
      ...sanitized,
      chunkCount: chunks ? chunks.length : 0
    };
  }

  /**
   * Undo merge operation
   * @param {string} mergeId - Merge ID to undo
   * @returns {Object} Undo result
   */
  async undoMerge(mergeId) {
    try {
      this.logger.info('Starting merge undo', { mergeId });

      // Get merge audit record
      const { data: auditRecord, error: auditError } = await supabase
        .from('merge_audit')
        .select('*')
        .eq('id', mergeId)
        .single();

      if (auditError || !auditRecord) {
        throw new Error('Merge record not found or expired');
      }

      if (!auditRecord.reversible) {
        throw new Error('Merge is not reversible');
      }

      if (new Date(auditRecord.expires_at) < new Date()) {
        throw new Error('Merge undo has expired');
      }

      // Start transaction
      const { error: transactionError } = await supabase.rpc('begin_transaction');
      if (transactionError) throw transactionError;

      try {
        // Restore source job
        const { error: restoreError } = await supabase
          .from('sources')
          .insert(auditRecord.source_data);

        if (restoreError) throw restoreError;

        // Restore target job to original state
        const { error: revertError } = await supabase
          .from('sources')
          .update(auditRecord.target_data)
          .eq('id', auditRecord.target_job_id);

        if (revertError) throw revertError;

        // Restore chunk associations
        await this.restoreChunkAssociations(mergeId, auditRecord);

        // Mark audit record as undone
        const { error: markError } = await supabase
          .from('merge_audit')
          .update({ 
            undone: true, 
            undone_at: new Date().toISOString(),
            reversible: false 
          })
          .eq('id', mergeId);

        if (markError) throw markError;

        // Commit transaction
        const { error: commitError } = await supabase.rpc('commit_transaction');
        if (commitError) throw commitError;

        this.logger.info('Merge undo completed', { mergeId });

        return {
          success: true,
          message: 'Merge successfully undone',
          restoredJobId: auditRecord.source_job_id,
          revertedJobId: auditRecord.target_job_id
        };

      } catch (error) {
        await supabase.rpc('rollback_transaction');
        throw error;
      }

    } catch (error) {
      this.logger.error('Merge undo failed', { mergeId, error: error.message });
      throw error;
    }
  }

  /**
   * Restore chunk associations after undo
   * @param {string} mergeId - Merge ID
   * @param {Object} auditRecord - Audit record
   */
  async restoreChunkAssociations(mergeId, auditRecord) {
    // Restore chunks to original source job
    const { error: restoreSourceError } = await supabase
      .from('content_chunks')
      .update({ 
        source_id: auditRecord.source_job_id,
        merge_id: null,
        merge_original_source_id: null
      })
      .eq('merge_original_source_id', auditRecord.source_job_id);

    if (restoreSourceError) throw restoreSourceError;

    // Clean merge metadata from target chunks
    const { error: cleanTargetError } = await supabase
      .from('content_chunks')
      .update({ 
        merge_id: null
      })
      .eq('source_id', auditRecord.target_job_id)
      .eq('merge_id', mergeId);

    if (cleanTargetError) throw cleanTargetError;
  }

  /**
   * Get merge operation status
   * @param {string} mergeId - Merge ID
   * @returns {Object} Operation status
   */
  getMergeStatus(mergeId) {
    const operation = this.mergeOperations.get(mergeId);
    
    if (!operation) {
      return { status: 'not_found' };
    }

    return {
      id: operation.id,
      status: operation.status,
      sourceId: operation.sourceId,
      targetId: operation.targetId,
      startTime: operation.startTime,
      endTime: operation.endTime,
      duration: operation.duration,
      error: operation.error
    };
  }
}

export default SmartMergeService;