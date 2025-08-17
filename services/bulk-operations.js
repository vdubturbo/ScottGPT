/**
 * Bulk Operations Service
 * Handles batch operations with transaction safety, rollback capabilities,
 * and progress tracking for large datasets
 */

import winston from 'winston';
import { supabase } from '../config/database.js';
import { DataProcessingService } from '../utils/data-processing.js';
import EmbeddingService from './embeddings.js';

export class BulkOperationsService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/bulk-operations.log' })
      ]
    });

    this.processingService = new DataProcessingService();
    this.embeddingService = new EmbeddingService();
    
    // Track active operations
    this.activeOperations = new Map();
  }

  /**
   * Preview bulk operation before execution
   * @param {string} operationType - Type of operation
   * @param {Object} params - Operation parameters
   * @returns {Object} Preview of changes
   */
  async previewOperation(operationType, params) {
    try {
      this.logger.info('Generating preview for bulk operation', { 
        operationType, 
        params: Object.keys(params) 
      });

      switch (operationType) {
        case 'update-skills':
          return await this.previewSkillsUpdate(params);
        case 'fix-dates':
          return await this.previewDateFixes(params);
        case 'merge-duplicates':
          return await this.previewDuplicateMerge(params);
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }
    } catch (error) {
      this.logger.error('Error generating preview', { 
        operationType, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Execute bulk operation with transaction safety
   * @param {string} operationId - Unique operation ID
   * @param {string} operationType - Type of operation
   * @param {Object} params - Operation parameters
   * @returns {Object} Operation result
   */
  async executeOperation(operationId, operationType, params) {
    // Check if operation is already running
    if (this.activeOperations.has(operationId)) {
      throw new Error('Operation is already in progress');
    }

    const operationContext = {
      id: operationId,
      type: operationType,
      status: 'started',
      startTime: new Date(),
      progress: 0,
      results: {
        processed: 0,
        successful: 0,
        failed: 0,
        errors: [],
        changes: []
      },
      rollbackData: []
    };

    this.activeOperations.set(operationId, operationContext);

    try {
      this.logger.info('Starting bulk operation', { 
        operationId, 
        operationType, 
        params: Object.keys(params) 
      });

      operationContext.status = 'running';
      
      let result;
      switch (operationType) {
        case 'update-skills':
          result = await this.executeSkillsUpdate(operationContext, params);
          break;
        case 'fix-dates':
          result = await this.executeDateFixes(operationContext, params);
          break;
        case 'merge-duplicates':
          result = await this.executeDuplicateMerge(operationContext, params);
          break;
        default:
          throw new Error(`Unknown operation type: ${operationType}`);
      }

      operationContext.status = 'completed';
      operationContext.endTime = new Date();
      operationContext.duration = operationContext.endTime - operationContext.startTime;

      this.logger.info('Bulk operation completed successfully', {
        operationId,
        duration: operationContext.duration,
        successful: operationContext.results.successful,
        failed: operationContext.results.failed
      });

      return {
        operationId,
        status: 'completed',
        duration: operationContext.duration,
        results: operationContext.results
      };

    } catch (error) {
      operationContext.status = 'failed';
      operationContext.error = error.message;
      
      this.logger.error('Bulk operation failed', {
        operationId,
        error: error.message,
        processed: operationContext.results.processed
      });

      // Attempt rollback
      await this.rollbackOperation(operationContext);

      throw new Error(`Bulk operation failed: ${error.message}`);
    } finally {
      // Clean up after delay to allow status checking
      setTimeout(() => {
        this.activeOperations.delete(operationId);
      }, 300000); // Keep for 5 minutes
    }
  }

  /**
   * Get operation status and progress
   * @param {string} operationId - Operation ID
   * @returns {Object} Operation status
   */
  getOperationStatus(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation) {
      return { status: 'not_found' };
    }

    return {
      id: operation.id,
      type: operation.type,
      status: operation.status,
      progress: operation.progress,
      results: operation.results,
      startTime: operation.startTime,
      duration: operation.endTime ? 
        operation.endTime - operation.startTime : 
        new Date() - operation.startTime
    };
  }

  /**
   * Preview skills update operation
   * @param {Object} params - Update parameters
   * @returns {Object} Preview of changes
   */
  async previewSkillsUpdate(params) {
    const { jobIds, operation, skills } = params;
    
    // Get affected jobs
    const { data: jobs, error } = await supabase
      .from('sources')
      .select('id, title, org, skills')
      .in('id', jobIds)
      .eq('type', 'job');

    if (error) throw error;

    const preview = {
      affectedJobs: jobs.length,
      changes: []
    };

    jobs.forEach(job => {
      const currentSkills = job.skills || [];
      let newSkills = [...currentSkills];

      switch (operation) {
        case 'add':
          const skillsToAdd = skills.filter(skill => !currentSkills.includes(skill));
          newSkills = [...currentSkills, ...skillsToAdd];
          break;
        case 'remove':
          newSkills = currentSkills.filter(skill => !skills.includes(skill));
          break;
        case 'replace':
          newSkills = skills;
          break;
        case 'normalize':
          newSkills = this.processingService.normalizeSkills(currentSkills);
          break;
      }

      // Process the new skills
      newSkills = this.processingService.normalizeSkills(newSkills);

      if (JSON.stringify(currentSkills.sort()) !== JSON.stringify(newSkills.sort())) {
        preview.changes.push({
          jobId: job.id,
          title: job.title,
          org: job.org,
          before: currentSkills,
          after: newSkills,
          added: newSkills.filter(skill => !currentSkills.includes(skill)),
          removed: currentSkills.filter(skill => !newSkills.includes(skill))
        });
      }
    });

    preview.estimatedEmbeddingUpdates = preview.changes.length;
    preview.estimatedDuration = Math.ceil(preview.changes.length * 2); // 2 seconds per job

    return preview;
  }

  /**
   * Preview date fixes operation
   * @param {Object} params - Fix parameters
   * @returns {Object} Preview of changes
   */
  async previewDateFixes(params) {
    const { fixes } = params;
    
    const preview = {
      affectedJobs: fixes.length,
      changes: [],
      conflicts: []
    };

    for (const fix of fixes) {
      const { jobId, date_start, date_end } = fix;
      
      // Get current job data
      const { data: job, error } = await supabase
        .from('sources')
        .select('id, title, org, date_start, date_end')
        .eq('id', jobId)
        .single();

      if (error) {
        preview.conflicts.push({
          jobId,
          error: 'Job not found'
        });
        continue;
      }

      const changes = {};
      if (date_start && date_start !== job.date_start) {
        changes.date_start = { from: job.date_start, to: date_start };
      }
      if (date_end !== undefined && date_end !== job.date_end) {
        changes.date_end = { from: job.date_end, to: date_end };
      }

      if (Object.keys(changes).length > 0) {
        preview.changes.push({
          jobId: job.id,
          title: job.title,
          org: job.org,
          changes
        });
      }
    }

    // Check for timeline conflicts
    await this.validateTimelineConflicts(preview);

    return preview;
  }

  /**
   * Preview duplicate merge operation
   * @param {Object} params - Merge parameters
   * @returns {Object} Preview of changes
   */
  async previewDuplicateMerge(params) {
    const { mergeGroups } = params;
    
    const preview = {
      mergeGroups: mergeGroups.length,
      totalJobs: 0,
      jobsToDelete: 0,
      jobsToUpdate: 0,
      changes: []
    };

    for (const group of mergeGroups) {
      const { primaryJobId, duplicateJobIds, mergeStrategy } = group;
      
      // Get all jobs in the merge group
      const allJobIds = [primaryJobId, ...duplicateJobIds];
      const { data: jobs, error } = await supabase
        .from('sources')
        .select('*')
        .in('id', allJobIds);

      if (error) throw error;

      const primaryJob = jobs.find(j => j.id === primaryJobId);
      const duplicateJobs = jobs.filter(j => duplicateJobIds.includes(j.id));

      // Calculate merged data
      const mergedData = await this.calculateMergedData(primaryJob, duplicateJobs, mergeStrategy);

      preview.totalJobs += jobs.length;
      preview.jobsToDelete += duplicateJobs.length;
      preview.jobsToUpdate += 1;

      preview.changes.push({
        primaryJob: {
          id: primaryJob.id,
          title: primaryJob.title,
          org: primaryJob.org,
          current: primaryJob,
          merged: mergedData
        },
        duplicateJobs: duplicateJobs.map(job => ({
          id: job.id,
          title: job.title,
          org: job.org,
          action: 'delete'
        })),
        mergeStrategy
      });
    }

    preview.estimatedChunkMerges = preview.jobsToDelete * 3; // Estimate chunks per job
    preview.estimatedDuration = Math.ceil(preview.totalJobs * 5); // 5 seconds per job

    return preview;
  }

  /**
   * Execute skills update operation
   * @param {Object} operationContext - Operation context
   * @param {Object} params - Update parameters
   * @returns {Object} Operation result
   */
  async executeSkillsUpdate(operationContext, params) {
    const preview = await this.previewSkillsUpdate(params);
    const { changes } = preview;

    operationContext.results.processed = changes.length;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      
      try {
        // Store rollback data
        const { data: originalJob } = await supabase
          .from('sources')
          .select('skills')
          .eq('id', change.jobId)
          .single();

        operationContext.rollbackData.push({
          type: 'update',
          table: 'sources',
          id: change.jobId,
          originalData: originalJob
        });

        // Update job skills
        const { error: updateError } = await supabase
          .from('sources')
          .update({ 
            skills: change.after,
            updated_at: new Date().toISOString()
          })
          .eq('id', change.jobId);

        if (updateError) throw updateError;

        // Regenerate embeddings for content chunks
        await this.regenerateJobEmbeddings(change.jobId, change.after);

        operationContext.results.successful++;
        operationContext.results.changes.push({
          jobId: change.jobId,
          type: 'skills_update',
          skillsAdded: change.added,
          skillsRemoved: change.removed
        });

      } catch (error) {
        operationContext.results.failed++;
        operationContext.results.errors.push({
          jobId: change.jobId,
          error: error.message
        });
      }

      // Update progress
      operationContext.progress = Math.round(((i + 1) / changes.length) * 100);
    }

    return operationContext.results;
  }

  /**
   * Execute date fixes operation
   * @param {Object} operationContext - Operation context
   * @param {Object} params - Fix parameters
   * @returns {Object} Operation result
   */
  async executeDateFixes(operationContext, params) {
    const preview = await this.previewDateFixes(params);
    const { changes } = preview;

    operationContext.results.processed = changes.length;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      
      try {
        // Store rollback data
        const { data: originalJob } = await supabase
          .from('sources')
          .select('date_start, date_end')
          .eq('id', change.jobId)
          .single();

        operationContext.rollbackData.push({
          type: 'update',
          table: 'sources',
          id: change.jobId,
          originalData: originalJob
        });

        // Prepare update data
        const updateData = { updated_at: new Date().toISOString() };
        if (change.changes.date_start) {
          updateData.date_start = change.changes.date_start.to;
        }
        if (change.changes.date_end) {
          updateData.date_end = change.changes.date_end.to;
        }

        // Update job dates
        const { error: updateError } = await supabase
          .from('sources')
          .update(updateData)
          .eq('id', change.jobId);

        if (updateError) throw updateError;

        operationContext.results.successful++;
        operationContext.results.changes.push({
          jobId: change.jobId,
          type: 'date_fix',
          changes: change.changes
        });

      } catch (error) {
        operationContext.results.failed++;
        operationContext.results.errors.push({
          jobId: change.jobId,
          error: error.message
        });
      }

      operationContext.progress = Math.round(((i + 1) / changes.length) * 100);
    }

    return operationContext.results;
  }

  /**
   * Execute duplicate merge operation
   * @param {Object} operationContext - Operation context
   * @param {Object} params - Merge parameters
   * @returns {Object} Operation result
   */
  async executeDuplicateMerge(operationContext, params) {
    const preview = await this.previewDuplicateMerge(params);
    const { changes } = preview;

    operationContext.results.processed = changes.length;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      
      try {
        // Store rollback data for primary job
        const { data: originalPrimary } = await supabase
          .from('sources')
          .select('*')
          .eq('id', change.primaryJob.id)
          .single();

        operationContext.rollbackData.push({
          type: 'update',
          table: 'sources',
          id: change.primaryJob.id,
          originalData: originalPrimary
        });

        // Store rollback data for duplicate jobs and their chunks
        for (const duplicateJob of change.duplicateJobs) {
          const { data: originalDuplicate } = await supabase
            .from('sources')
            .select('*')
            .eq('id', duplicateJob.id)
            .single();

          const { data: duplicateChunks } = await supabase
            .from('content_chunks')
            .select('*')
            .eq('source_id', duplicateJob.id);

          operationContext.rollbackData.push({
            type: 'delete',
            table: 'sources',
            originalData: originalDuplicate,
            relatedChunks: duplicateChunks
          });
        }

        // Update primary job with merged data
        const { error: updateError } = await supabase
          .from('sources')
          .update({
            ...change.primaryJob.merged,
            updated_at: new Date().toISOString()
          })
          .eq('id', change.primaryJob.id);

        if (updateError) throw updateError;

        // Merge chunks from duplicate jobs to primary job
        for (const duplicateJob of change.duplicateJobs) {
          const { error: chunkUpdateError } = await supabase
            .from('content_chunks')
            .update({ source_id: change.primaryJob.id })
            .eq('source_id', duplicateJob.id);

          if (chunkUpdateError) throw chunkUpdateError;
        }

        // Delete duplicate jobs
        const duplicateIds = change.duplicateJobs.map(j => j.id);
        const { error: deleteError } = await supabase
          .from('sources')
          .delete()
          .in('id', duplicateIds);

        if (deleteError) throw deleteError;

        // Regenerate embeddings for merged job
        await this.regenerateJobEmbeddings(
          change.primaryJob.id, 
          change.primaryJob.merged.skills
        );

        operationContext.results.successful++;
        operationContext.results.changes.push({
          primaryJobId: change.primaryJob.id,
          type: 'duplicate_merge',
          mergedJobIds: duplicateIds,
          mergedData: change.primaryJob.merged
        });

      } catch (error) {
        operationContext.results.failed++;
        operationContext.results.errors.push({
          primaryJobId: change.primaryJob.id,
          error: error.message
        });
      }

      operationContext.progress = Math.round(((i + 1) / changes.length) * 100);
    }

    return operationContext.results;
  }

  /**
   * Rollback operation on failure
   * @param {Object} operationContext - Operation context
   */
  async rollbackOperation(operationContext) {
    this.logger.info('Starting operation rollback', { 
      operationId: operationContext.id,
      rollbackItems: operationContext.rollbackData.length 
    });

    try {
      // Reverse rollback data to undo in correct order
      const rollbackItems = [...operationContext.rollbackData].reverse();

      for (const item of rollbackItems) {
        switch (item.type) {
          case 'update':
            await supabase
              .from(item.table)
              .update(item.originalData)
              .eq('id', item.id);
            break;
          
          case 'delete':
            // Restore deleted source
            await supabase
              .from(item.table)
              .insert(item.originalData);
            
            // Restore related chunks if any
            if (item.relatedChunks && item.relatedChunks.length > 0) {
              await supabase
                .from('content_chunks')
                .insert(item.relatedChunks);
            }
            break;
        }
      }

      operationContext.status = 'rolled_back';
      this.logger.info('Operation rollback completed', { 
        operationId: operationContext.id 
      });

    } catch (rollbackError) {
      operationContext.status = 'rollback_failed';
      this.logger.error('Rollback failed', {
        operationId: operationContext.id,
        error: rollbackError.message
      });
    }
  }

  /**
   * Regenerate embeddings for a job's chunks
   * @param {number} jobId - Job ID
   * @param {Array} skills - Updated skills
   */
  async regenerateJobEmbeddings(jobId, skills) {
    try {
      const { data: chunks } = await supabase
        .from('content_chunks')
        .select('id, title, content')
        .eq('source_id', jobId);

      for (const chunk of chunks) {
        const embeddingContent = [
          chunk.title,
          chunk.content,
          skills?.join(', ')
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
              skills,
              updated_at: new Date().toISOString()
            })
            .eq('id', chunk.id);
        }
      }
    } catch (error) {
      this.logger.error('Failed to regenerate embeddings', {
        jobId,
        error: error.message
      });
    }
  }

  /**
   * Calculate merged data for duplicate jobs
   * @param {Object} primaryJob - Primary job to merge into
   * @param {Array} duplicateJobs - Jobs to merge
   * @param {string} mergeStrategy - Merge strategy
   * @returns {Object} Merged job data
   */
  async calculateMergedData(primaryJob, duplicateJobs, mergeStrategy) {
    const merged = { ...primaryJob };

    switch (mergeStrategy) {
      case 'keep_primary':
        // Keep primary job data, only merge skills
        const allSkills = [
          ...(primaryJob.skills || []),
          ...duplicateJobs.flatMap(job => job.skills || [])
        ];
        merged.skills = this.processingService.normalizeSkills(allSkills);
        break;

      case 'merge_comprehensive':
        // Merge all available data intelligently
        merged.skills = this.processingService.normalizeSkills([
          ...(primaryJob.skills || []),
          ...duplicateJobs.flatMap(job => job.skills || [])
        ]);

        // Use longest description
        const descriptions = [primaryJob.description, ...duplicateJobs.map(j => j.description)]
          .filter(Boolean);
        if (descriptions.length > 0) {
          merged.description = descriptions.reduce((longest, current) => 
            current.length > longest.length ? current : longest
          );
        }

        // Use most complete location
        const locations = [primaryJob.location, ...duplicateJobs.map(j => j.location)]
          .filter(Boolean);
        if (locations.length > 0 && !merged.location) {
          merged.location = locations[0];
        }
        break;

      case 'prefer_recent':
        // Prefer data from most recent job
        const allJobs = [primaryJob, ...duplicateJobs];
        const mostRecent = allJobs.reduce((latest, job) => {
          const jobDate = new Date(job.date_start || '1900-01-01');
          const latestDate = new Date(latest.date_start || '1900-01-01');
          return jobDate > latestDate ? job : latest;
        });

        Object.assign(merged, mostRecent);
        merged.id = primaryJob.id; // Keep original ID
        break;
    }

    return merged;
  }

  /**
   * Validate timeline conflicts in date fixes
   * @param {Object} preview - Preview object to update
   */
  async validateTimelineConflicts(preview) {
    // Get all jobs for timeline validation
    const { data: allJobs } = await supabase
      .from('sources')
      .select('id, title, org, date_start, date_end')
      .eq('type', 'job');

    // Apply preview changes to create projected timeline
    const projectedJobs = allJobs.map(job => {
      const change = preview.changes.find(c => c.jobId === job.id);
      if (change) {
        const updated = { ...job };
        if (change.changes.date_start) {
          updated.date_start = change.changes.date_start.to;
        }
        if (change.changes.date_end) {
          updated.date_end = change.changes.date_end.to;
        }
        return updated;
      }
      return job;
    });

    // Check for new conflicts
    const conflicts = [];
    for (let i = 0; i < projectedJobs.length; i++) {
      for (let j = i + 1; j < projectedJobs.length; j++) {
        const job1 = projectedJobs[i];
        const job2 = projectedJobs[j];

        if (this.processingService.calculateDateOverlap(job1, job2) > 0.5) {
          conflicts.push({
            job1: { id: job1.id, title: job1.title },
            job2: { id: job2.id, title: job2.title },
            type: 'date_overlap',
            severity: 'warning'
          });
        }
      }
    }

    preview.conflicts.push(...conflicts);
  }

  /**
   * Cancel running operation
   * @param {string} operationId - Operation ID
   * @returns {boolean} Success status
   */
  async cancelOperation(operationId) {
    const operation = this.activeOperations.get(operationId);
    if (!operation || operation.status !== 'running') {
      return false;
    }

    operation.status = 'cancelled';
    
    // Attempt rollback
    await this.rollbackOperation(operation);

    this.logger.info('Operation cancelled', { operationId });
    return true;
  }
}

export default BulkOperationsService;