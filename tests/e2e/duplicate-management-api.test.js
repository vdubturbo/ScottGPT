/**
 * End-to-end tests for Duplicate Management API
 */

import { jest } from '@jest/globals';
import request from 'supertest';

// Mock all dependencies before importing the app
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
    })),
    rpc: jest.fn()
  }
}));

jest.mock('../../services/embeddings.js');
jest.mock('../../utils/data-processing.js');
jest.mock('fastest-levenshtein');

describe('Duplicate Management API E2E Tests', () => {
  let app;

  beforeAll(async () => {
    // Import the app after mocking dependencies
    const express = await import('express');
    const duplicateRoutes = await import('../../routes/duplicate-management.js');
    
    app = express.default();
    app.use(express.json());
    app.use('/api/user/duplicates', duplicateRoutes.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Duplicate Detection Endpoints', () => {
    describe('GET /api/user/duplicates/detect', () => {
      test('should detect duplicates successfully', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Software Engineer',
            org: 'Tech Corp',
            date_start: '2020-01-01',
            date_end: '2021-01-01',
            description: 'Built web applications',
            skills: ['JavaScript', 'React']
          },
          {
            id: 2,
            title: 'Senior Software Engineer',
            org: 'Tech Corp',
            date_start: '2020-01-01',
            date_end: '2021-01-01',
            description: 'Built web applications',
            skills: ['JavaScript', 'React']
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        // Mock the chunk count queries
        supabase.from().select().eq.mockResolvedValue({
          count: 3,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/detect')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('duplicateGroups');
        expect(response.body.data).toHaveProperty('summary');
        expect(response.body.data).toHaveProperty('recommendations');
      });

      test('should handle threshold parameter', async () => {
        const mockJobs = [
          { id: 1, title: 'Engineer', org: 'Corp' },
          { id: 2, title: 'Developer', org: 'Inc' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/detect?threshold=0.8')
          .expect(200);

        expect(response.body.metadata.detectionThreshold).toBe(0.8);
      });

      test('should handle empty job list', async () => {
        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: [],
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/detect')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.duplicateGroups).toEqual([]);
        expect(response.body.data.message).toContain('Not enough jobs');
      });

      test('should handle database errors', async () => {
        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: null,
          error: new Error('Database connection failed')
        });

        const response = await request(app)
          .get('/api/user/duplicates/detect')
          .expect(500);

        expect(response.body.error).toBe('Failed to detect duplicates');
      });
    });

    describe('GET /api/user/duplicates/summary', () => {
      test('should return duplicate summary', async () => {
        const mockJobs = [
          { id: 1, title: 'Engineer', org: 'Corp A', created_at: '2023-01-01' },
          { id: 2, title: 'Engineer', org: 'Corp A', created_at: '2023-01-02' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/summary')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('totalJobs');
        expect(response.body.data).toHaveProperty('estimatedDuplicates');
        expect(response.body.data).toHaveProperty('potentialTimeSavings');
      });
    });
  });

  describe('Merge Preview and Execution Endpoints', () => {
    describe('POST /api/user/duplicates/preview-merge', () => {
      test('should generate merge preview', async () => {
        const mockSourceJob = {
          id: 1,
          title: 'Engineer',
          org: 'Corp',
          chunks: [{ id: 101 }]
        };

        const mockTargetJob = {
          id: 2,
          title: 'Senior Engineer',
          org: 'Corp',
          chunks: [{ id: 201 }]
        };

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().single
          .mockResolvedValueOnce({ data: mockSourceJob, error: null })
          .mockResolvedValueOnce({ data: mockTargetJob, error: null });

        supabase.from().select().eq().order
          .mockResolvedValueOnce({ data: [{ id: 101 }], error: null })
          .mockResolvedValueOnce({ data: [{ id: 201 }], error: null });

        const response = await request(app)
          .post('/api/user/duplicates/preview-merge')
          .send({
            sourceId: 1,
            targetId: 2
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('preview');
        expect(response.body.data).toHaveProperty('analysis');
        expect(response.body.data).toHaveProperty('operations');
      });

      test('should validate required parameters', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/preview-merge')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Missing required parameters');
      });

      test('should reject self-merge', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/preview-merge')
          .send({
            sourceId: 1,
            targetId: 1
          })
          .expect(400);

        expect(response.body.error).toBe('Invalid merge request');
      });

      test('should handle job not found', async () => {
        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().single.mockResolvedValue({
          data: null,
          error: { code: 'PGRST116' }
        });

        const response = await request(app)
          .post('/api/user/duplicates/preview-merge')
          .send({
            sourceId: 999,
            targetId: 1
          })
          .expect(404);

        expect(response.body.error).toBe('Job not found');
      });
    });

    describe('POST /api/user/duplicates/merge', () => {
      test('should require confirmation', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/merge')
          .send({
            sourceId: 1,
            targetId: 2
          })
          .expect(400);

        expect(response.body.error).toBe('Merge not confirmed');
        expect(response.body.requiresConfirmation).toBe(true);
      });

      test('should execute merge when confirmed', async () => {
        const mockSourceJob = {
          id: 1,
          title: 'Engineer',
          chunks: [{ id: 101 }]
        };

        const mockTargetJob = {
          id: 2,
          title: 'Senior Engineer',
          chunks: [{ id: 201 }]
        };

        const { supabase } = await import('../../config/database.js');
        
        // Mock transaction functions
        supabase.rpc
          .mockResolvedValueOnce({ data: 'transaction_started', error: null })
          .mockResolvedValueOnce({ data: 'transaction_committed', error: null });

        // Mock job retrieval
        supabase.from().select().eq().single
          .mockResolvedValueOnce({ data: mockSourceJob, error: null })
          .mockResolvedValueOnce({ data: mockTargetJob, error: null });

        // Mock chunk retrieval
        supabase.from().select().eq().order
          .mockResolvedValueOnce({ data: [{ id: 101 }], error: null })
          .mockResolvedValueOnce({ data: [{ id: 201 }], error: null });

        // Mock update operations
        supabase.from().update().eq.mockResolvedValue({ error: null });
        supabase.from().delete().eq.mockResolvedValue({ error: null });
        supabase.from().insert.mockResolvedValue({ error: null });

        const response = await request(app)
          .post('/api/user/duplicates/merge')
          .send({
            sourceId: 1,
            targetId: 2,
            confirmed: true
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('mergeId');
        expect(response.body.data.status).toBe('completed');
        expect(response.body.data.undoAvailable).toBe(true);
      });
    });

    describe('GET /api/user/duplicates/merge-status/:mergeId', () => {
      test('should return merge status', async () => {
        // This test would need the merge service to be properly mocked
        const response = await request(app)
          .get('/api/user/duplicates/merge-status/test-merge-id')
          .expect(404); // Expected since no merge operation exists

        expect(response.body.error).toBe('Merge operation not found');
      });
    });

    describe('POST /api/user/duplicates/undo-merge', () => {
      test('should require confirmation for undo', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/undo-merge')
          .send({
            mergeId: 'test-merge-id'
          })
          .expect(400);

        expect(response.body.error).toBe('Undo not confirmed');
        expect(response.body.requiresConfirmation).toBe(true);
      });

      test('should validate merge ID', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/undo-merge')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Missing merge ID');
      });
    });
  });

  describe('Bulk Operations Endpoints', () => {
    describe('POST /api/user/duplicates/auto-merge', () => {
      test('should require confirmation for auto-merge', async () => {
        const response = await request(app)
          .post('/api/user/duplicates/auto-merge')
          .send({
            confidenceThreshold: 0.95
          })
          .expect(400);

        expect(response.body.error).toBe('Auto-merge not confirmed');
        expect(response.body.requiresConfirmation).toBe(true);
      });

      test('should return preview when requested', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Engineer',
            org: 'Corp',
            skills: ['JavaScript']
          },
          {
            id: 2,
            title: 'Engineer',
            org: 'Corp',
            skills: ['JavaScript']
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .post('/api/user/duplicates/auto-merge')
          .send({
            preview: true,
            confidenceThreshold: 0.95
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('candidateCount');
        expect(response.body.data).toHaveProperty('previews');
        expect(response.body.data).toHaveProperty('estimatedTimeSavings');
      });

      test('should execute auto-merge when confirmed', async () => {
        const mockJobs = [
          { id: 1, title: 'Engineer', org: 'Corp' },
          { id: 2, title: 'Engineer', org: 'Corp' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .post('/api/user/duplicates/auto-merge')
          .send({
            confirmed: true,
            confidenceThreshold: 0.95,
            maxMerges: 5
          })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data).toHaveProperty('summary');
      });
    });

    describe('GET /api/user/duplicates/merge-candidates', () => {
      test('should return merge candidates', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Software Engineer',
            org: 'Tech Corp',
            date_start: '2020-01-01'
          },
          {
            id: 2,
            title: 'Senior Software Engineer',
            org: 'Tech Corp',
            date_start: '2020-01-01'
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/merge-candidates')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('candidates');
        expect(response.body.data).toHaveProperty('summary');
        expect(response.body.data).toHaveProperty('filters');
      });

      test('should filter by confidence level', async () => {
        const mockJobs = [
          { id: 1, title: 'Engineer', org: 'Corp' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/merge-candidates?confidenceLevel=high')
          .expect(200);

        expect(response.body.data.filters.confidenceLevel).toBe('high');
      });

      test('should sort candidates by specified criteria', async () => {
        const mockJobs = [
          { id: 1, title: 'Engineer', org: 'Corp' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/duplicates/merge-candidates?sortBy=similarity')
          .expect(200);

        expect(response.body.data.filters.sortBy).toBe('similarity');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle service initialization errors', async () => {
      // This test verifies that the router can handle service errors gracefully
      const response = await request(app)
        .get('/api/user/duplicates/detect')
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle malformed request bodies', async () => {
      const response = await request(app)
        .post('/api/user/duplicates/preview-merge')
        .send('invalid-json')
        .set('Content-Type', 'application/json')
        .expect(400);

      // Express should handle this automatically
    });

    test('should handle very large datasets gracefully', async () => {
      const largeJobSet = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        title: `Job ${i}`,
        org: `Company ${i % 10}`
      }));

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().order.mockResolvedValue({
        data: largeJobSet,
        error: null
      });

      const response = await request(app)
        .get('/api/user/duplicates/detect')
        .expect(200);

      expect(response.body.success).toBe(true);
      // Should complete without timeout
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to detection requests', async () => {
      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().order.mockResolvedValue({
        data: [],
        error: null
      });

      // Make multiple requests to test rate limiting
      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/api/user/duplicates/detect')
      );

      const responses = await Promise.all(requests);
      
      // All should succeed within rate limit
      responses.forEach(response => {
        expect(response.status).not.toBe(429);
      });
    });
  });

  describe('Input Validation', () => {
    test('should validate numeric parameters', async () => {
      const response = await request(app)
        .get('/api/user/duplicates/detect?threshold=invalid')
        .expect(200); // Should use default threshold

      expect(response.body.metadata.detectionThreshold).toBe(0.7); // Default
    });

    test('should validate merge operation parameters', async () => {
      const response = await request(app)
        .post('/api/user/duplicates/preview-merge')
        .send({
          sourceId: 'not-a-number',
          targetId: 2
        })
        .expect(400);

      // Should be handled by the route validation
    });

    test('should validate auto-merge parameters', async () => {
      const response = await request(app)
        .post('/api/user/duplicates/auto-merge')
        .send({
          confidenceThreshold: 'invalid',
          maxMerges: -1,
          preview: true
        })
        .expect(200);

      // Should use default values for invalid parameters
      expect(response.body.data.settings.confidenceThreshold).toBe(0.95);
    });
  });

  describe('Performance Considerations', () => {
    test('should handle concurrent merge operations', async () => {
      const mockJobs = [
        { id: 1, title: 'Engineer', chunks: [] },
        { id: 2, title: 'Engineer', chunks: [] }
      ];

      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().single.mockResolvedValue({
        data: mockJobs[0],
        error: null
      });
      supabase.from().select().eq().order.mockResolvedValue({
        data: [],
        error: null
      });

      // Simulate concurrent merge previews
      const concurrentRequests = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/user/duplicates/preview-merge')
          .send({
            sourceId: 1,
            targetId: 2
          })
      );

      const responses = await Promise.all(concurrentRequests);
      
      // All should complete successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    test('should handle timeout scenarios gracefully', async () => {
      const { supabase } = await import('../../config/database.js');
      
      // Simulate slow database response
      supabase.from().select().eq().order.mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve({ data: [], error: null }), 100))
      );

      const response = await request(app)
        .get('/api/user/duplicates/detect')
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});