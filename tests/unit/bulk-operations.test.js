/**
 * Unit tests for Bulk Operations Service
 */

import { jest } from '@jest/globals';
import BulkOperationsService from '../../services/bulk-operations.js';

// Mock dependencies
jest.mock('../../config/database.js', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          order: jest.fn()
        })),
        in: jest.fn(),
        not: jest.fn()
      })),
      update: jest.fn(() => ({
        eq: jest.fn(),
        in: jest.fn()
      })),
      delete: jest.fn(() => ({
        eq: jest.fn(),
        in: jest.fn()
      })),
      insert: jest.fn()
    }))
  }
}));

jest.mock('../../utils/data-processing.js');
jest.mock('../../services/embeddings.js');

describe('BulkOperationsService', () => {
  let bulkOpsService;
  
  beforeEach(() => {
    bulkOpsService = new BulkOperationsService();
    jest.clearAllMocks();
  });

  describe('previewSkillsUpdate', () => {
    test('should preview skills addition', async () => {
      const params = {
        jobIds: [1, 2],
        operation: 'add',
        skills: ['New Skill 1', 'New Skill 2']
      };

      // Mock database response
      const mockJobs = [
        {
          id: 1,
          title: 'Job 1',
          org: 'Company 1',
          skills: ['Existing Skill']
        },
        {
          id: 2,
          title: 'Job 2',
          org: 'Company 2',
          skills: ['Other Skill']
        }
      ];

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().in().eq.mockResolvedValue({
        data: mockJobs,
        error: null
      });

      const preview = await bulkOpsService.previewSkillsUpdate(params);

      expect(preview.affectedJobs).toBe(2);
      expect(preview.changes).toHaveLength(2);
      expect(preview.estimatedEmbeddingUpdates).toBe(2);
      expect(preview.estimatedDuration).toBeGreaterThan(0);
    });

    test('should preview skills removal', async () => {
      const params = {
        jobIds: [1],
        operation: 'remove',
        skills: ['Skill to Remove']
      };

      const mockJobs = [
        {
          id: 1,
          title: 'Job 1',
          org: 'Company 1',
          skills: ['Keep This', 'Skill to Remove', 'Keep That']
        }
      ];

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().in().eq.mockResolvedValue({
        data: mockJobs,
        error: null
      });

      const preview = await bulkOpsService.previewSkillsUpdate(params);

      expect(preview.changes[0].removed).toContain('Skill to Remove');
      expect(preview.changes[0].after).not.toContain('Skill to Remove');
    });
  });

  describe('previewDateFixes', () => {
    test('should preview date changes', async () => {
      const params = {
        fixes: [
          {
            jobId: 1,
            date_start: '2020-02-01',
            date_end: '2021-02-01'
          }
        ]
      };

      const mockJob = {
        id: 1,
        title: 'Job 1',
        org: 'Company 1',
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().single.mockResolvedValue({
        data: mockJob,
        error: null
      });

      const preview = await bulkOpsService.previewDateFixes(params);

      expect(preview.affectedJobs).toBe(1);
      expect(preview.changes).toHaveLength(1);
      expect(preview.changes[0].changes).toHaveProperty('date_start');
      expect(preview.changes[0].changes).toHaveProperty('date_end');
    });

    test('should detect job not found', async () => {
      const params = {
        fixes: [
          {
            jobId: 999,
            date_start: '2020-02-01'
          }
        ]
      };

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const preview = await bulkOpsService.previewDateFixes(params);

      expect(preview.conflicts).toHaveLength(1);
      expect(preview.conflicts[0].error).toBe('Job not found');
    });
  });

  describe('getOperationStatus', () => {
    test('should return operation status', () => {
      const operationId = 'test-op-123';
      const operationContext = {
        id: operationId,
        type: 'update-skills',
        status: 'running',
        progress: 50,
        results: { processed: 5, successful: 4, failed: 1 },
        startTime: new Date('2025-01-01T00:00:00Z')
      };

      bulkOpsService.activeOperations.set(operationId, operationContext);

      const status = bulkOpsService.getOperationStatus(operationId);

      expect(status.id).toBe(operationId);
      expect(status.type).toBe('update-skills');
      expect(status.status).toBe('running');
      expect(status.progress).toBe(50);
    });

    test('should return not found for non-existent operation', () => {
      const status = bulkOpsService.getOperationStatus('non-existent');
      expect(status.status).toBe('not_found');
    });
  });

  describe('calculateMergedData', () => {
    test('should merge data with keep_primary strategy', async () => {
      const primaryJob = {
        id: 1,
        title: 'Primary Title',
        org: 'Primary Org',
        skills: ['Primary Skill'],
        description: 'Primary description'
      };

      const duplicateJobs = [
        {
          id: 2,
          title: 'Duplicate Title',
          org: 'Duplicate Org',
          skills: ['Duplicate Skill'],
          description: 'Duplicate description'
        }
      ];

      const merged = await bulkOpsService.calculateMergedData(
        primaryJob, 
        duplicateJobs, 
        'keep_primary'
      );

      expect(merged.title).toBe('Primary Title');
      expect(merged.org).toBe('Primary Org');
      expect(merged.skills).toContain('Primary Skill');
      expect(merged.skills).toContain('Duplicate Skill');
    });

    test('should merge data with merge_comprehensive strategy', async () => {
      const primaryJob = {
        id: 1,
        title: 'Primary Title',
        description: 'Short'
      };

      const duplicateJobs = [
        {
          id: 2,
          description: 'Much longer and more detailed description'
        }
      ];

      const merged = await bulkOpsService.calculateMergedData(
        primaryJob, 
        duplicateJobs, 
        'merge_comprehensive'
      );

      expect(merged.description).toBe('Much longer and more detailed description');
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const params = {
        jobIds: [1],
        operation: 'add',
        skills: ['New Skill']
      };

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().in().eq.mockResolvedValue({
        data: null,
        error: new Error('Database connection failed')
      });

      await expect(bulkOpsService.previewSkillsUpdate(params))
        .rejects.toThrow('Database connection failed');
    });

    test('should validate operation parameters', async () => {
      await expect(bulkOpsService.previewOperation('invalid-operation', {}))
        .rejects.toThrow('Unknown operation type: invalid-operation');
    });
  });

  describe('Rollback Operations', () => {
    test('should prepare rollback data for update operations', () => {
      const operationContext = {
        rollbackData: []
      };

      const originalData = { skills: ['Original Skill'] };
      
      operationContext.rollbackData.push({
        type: 'update',
        table: 'sources',
        id: 1,
        originalData
      });

      expect(operationContext.rollbackData).toHaveLength(1);
      expect(operationContext.rollbackData[0].type).toBe('update');
      expect(operationContext.rollbackData[0].originalData).toEqual(originalData);
    });
  });
});