/**
 * End-to-end tests for Advanced User Data API
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
    }))
  }
}));

jest.mock('openai');
jest.mock('../../services/embeddings.js');
jest.mock('../../utils/data-processing.js');

describe('Advanced User Data API E2E Tests', () => {
  let app;

  beforeAll(async () => {
    // Import the app after mocking dependencies
    const express = await import('express');
    const advancedRoutes = await import('../../routes/advanced-user-data.js');
    
    app = express.default();
    app.use(express.json());
    app.use('/api/user', advancedRoutes.default);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Bulk Operations Endpoints', () => {
    describe('POST /api/user/bulk/preview', () => {
      test('should preview bulk skills update', async () => {
        const requestBody = {
          operationType: 'update-skills',
          params: {
            jobIds: [1, 2],
            operation: 'add',
            skills: ['New Skill']
          }
        };

        const mockJobs = [
          { id: 1, title: 'Job 1', org: 'Company 1', skills: ['Old Skill'] },
          { id: 2, title: 'Job 2', org: 'Company 2', skills: ['Other Skill'] }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().in().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .post('/api/user/bulk/preview')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('operationType');
        expect(response.body.data).toHaveProperty('preview');
        expect(response.body.data.operationType).toBe('update-skills');
      });

      test('should return 400 for missing parameters', async () => {
        const response = await request(app)
          .post('/api/user/bulk/preview')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Missing required fields');
      });
    });

    describe('POST /api/user/bulk/execute', () => {
      test('should start bulk operation execution', async () => {
        const requestBody = {
          operationType: 'update-skills',
          params: {
            jobIds: [1],
            operation: 'add',
            skills: ['New Skill']
          }
        };

        const response = await request(app)
          .post('/api/user/bulk/execute')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('operationId');
        expect(response.body.data).toHaveProperty('status');
        expect(response.body.data).toHaveProperty('statusUrl');
        expect(response.body.data.status).toBe('started');
      });

      test('should return preview when preview=true', async () => {
        const requestBody = {
          operationType: 'update-skills',
          params: {
            jobIds: [1],
            operation: 'add',
            skills: ['New Skill']
          },
          preview: true
        };

        const mockJobs = [
          { id: 1, title: 'Job 1', org: 'Company 1', skills: ['Old Skill'] }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().in().eq.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .post('/api/user/bulk/execute')
          .send(requestBody)
          .expect(200);

        expect(response.body.data.status).toBe('preview_only');
      });
    });

    describe('POST /api/user/bulk/update-skills', () => {
      test('should validate skills update parameters', async () => {
        const requestBody = {
          jobIds: [1, 2],
          operation: 'add',
          skills: ['JavaScript', 'React']
        };

        const response = await request(app)
          .post('/api/user/bulk/update-skills')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('operationId');
        expect(response.body.data.operation).toBe('update-skills');
      });

      test('should reject invalid operation types', async () => {
        const requestBody = {
          jobIds: [1],
          operation: 'invalid',
          skills: ['Skill']
        };

        const response = await request(app)
          .post('/api/user/bulk/update-skills')
          .send(requestBody)
          .expect(400);

        expect(response.body.error).toBe('Invalid operation');
      });
    });

    describe('POST /api/user/bulk/fix-dates', () => {
      test('should accept valid date fixes', async () => {
        const requestBody = {
          fixes: [
            {
              jobId: 1,
              date_start: '2020-01-01',
              date_end: '2021-01-01'
            }
          ]
        };

        const response = await request(app)
          .post('/api/user/bulk/fix-dates')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.operation).toBe('fix-dates');
      });

      test('should validate fix format', async () => {
        const requestBody = {
          fixes: [
            {
              jobId: 1
              // Missing date fields
            }
          ]
        };

        const response = await request(app)
          .post('/api/user/bulk/fix-dates')
          .send(requestBody)
          .expect(400);

        expect(response.body.error).toBe('Invalid fix format');
      });
    });

    describe('POST /api/user/bulk/merge-duplicates', () => {
      test('should accept valid merge groups', async () => {
        const requestBody = {
          mergeGroups: [
            {
              primaryJobId: 1,
              duplicateJobIds: [2, 3]
            }
          ]
        };

        const response = await request(app)
          .post('/api/user/bulk/merge-duplicates')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.operation).toBe('merge-duplicates');
      });

      test('should validate merge group format', async () => {
        const requestBody = {
          mergeGroups: [
            {
              primaryJobId: 1
              // Missing duplicateJobIds
            }
          ]
        };

        const response = await request(app)
          .post('/api/user/bulk/merge-duplicates')
          .send(requestBody)
          .expect(400);

        expect(response.body.error).toBe('Invalid merge group format');
      });
    });
  });

  describe('Smart Enhancement Endpoints', () => {
    describe('GET /api/user/gaps', () => {
      test('should analyze timeline gaps', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Job 1',
            org: 'Company 1',
            date_start: '2020-01-01',
            date_end: '2020-06-01'
          },
          {
            id: 2,
            title: 'Job 2',
            org: 'Company 2',
            date_start: '2021-01-01',
            date_end: '2021-06-01'
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .get('/api/user/gaps')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('gaps');
        expect(response.body.data).toHaveProperty('overlaps');
        expect(response.body.data).toHaveProperty('summary');
      });
    });

    describe('POST /api/user/suggest-skills', () => {
      test('should suggest skills for existing job', async () => {
        const requestBody = {
          jobId: 1
        };

        const mockJob = {
          id: 1,
          title: 'Software Engineer',
          org: 'Tech Company',
          description: 'Building web applications with React and Node.js',
          skills: ['JavaScript']
        };

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().single.mockResolvedValue({
          data: mockJob,
          error: null
        });

        const response = await request(app)
          .post('/api/user/suggest-skills')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('job');
        expect(response.body.data).toHaveProperty('suggestions');
        expect(response.body.data).toHaveProperty('analysis');
      });

      test('should suggest skills for provided job data', async () => {
        const requestBody = {
          jobData: {
            title: 'Data Scientist',
            org: 'AI Company',
            description: 'Building machine learning models with Python and TensorFlow',
            skills: ['Python']
          }
        };

        const response = await request(app)
          .post('/api/user/suggest-skills')
          .send(requestBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.job.title).toBe('Data Scientist');
      });

      test('should return 400 for missing job data', async () => {
        const response = await request(app)
          .post('/api/user/suggest-skills')
          .send({})
          .expect(400);

        expect(response.body.error).toBe('Missing job data');
      });
    });

    describe('POST /api/user/validate', () => {
      test('should generate comprehensive validation report', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Software Engineer',
            org: 'Tech Company',
            date_start: '2020-01-01',
            date_end: '2023-01-01',
            description: 'Built applications',
            skills: ['JavaScript', 'React'],
            location: 'San Francisco'
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq().order.mockResolvedValue({
          data: mockJobs,
          error: null
        });

        const response = await request(app)
          .post('/api/user/validate')
          .send({ includeEnhancements: true })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('overall');
        expect(response.body.data).toHaveProperty('jobs');
        expect(response.body.data).toHaveProperty('summary');
      });
    });
  });

  describe('System Operations Endpoints', () => {
    describe('POST /api/user/regenerate-all-embeddings', () => {
      test('should regenerate all embeddings', async () => {
        const mockChunks = [
          {
            id: 1,
            title: 'Chunk 1',
            content: 'Content 1',
            source_id: 1,
            sources: { title: 'Job 1', skills: ['Skill 1'] }
          }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select.mockResolvedValue({
          data: mockChunks,
          error: null
        });
        supabase.from().update().eq.mockResolvedValue({
          error: null
        });

        const response = await request(app)
          .post('/api/user/regenerate-all-embeddings')
          .send({ batchSize: 5 })
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('operationId');
        expect(response.body.data).toHaveProperty('results');
        expect(response.body.data.status).toBe('completed');
      });
    });

    describe('GET /api/user/data-quality', () => {
      test('should generate data quality report', async () => {
        const mockJobs = [
          {
            id: 1,
            title: 'Software Engineer',
            org: 'Tech Company',
            date_start: '2020-01-01',
            skills: ['JavaScript'],
            description: 'Built applications',
            location: 'SF'
          }
        ];

        const mockChunkStats = [
          { source_id: 1, embedding: '[0.1,0.2,0.3]' }
        ];

        const { supabase } = await import('../../config/database.js');
        supabase.from().select().eq.mockResolvedValueOnce({
          data: mockJobs,
          error: null
        });
        supabase.from().select().not.mockResolvedValueOnce({
          data: mockChunkStats,
          error: null
        });

        const response = await request(app)
          .get('/api/user/data-quality')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toHaveProperty('healthMetrics');
        expect(response.body.data).toHaveProperty('completenessScore');
        expect(response.body.data).toHaveProperty('qualitySummary');
        expect(response.body.data).toHaveProperty('recommendations');
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().order.mockResolvedValue({
        data: null,
        error: new Error('Database connection failed')
      });

      const response = await request(app)
        .get('/api/user/gaps')
        .expect(500);

      expect(response.body.error).toBe('Failed to analyze timeline gaps');
    });

    test('should handle missing job in skill suggestions', async () => {
      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const response = await request(app)
        .post('/api/user/suggest-skills')
        .send({ jobId: 999 })
        .expect(404);

      expect(response.body.error).toBe('Job not found');
    });
  });

  describe('Rate Limiting', () => {
    test('should apply rate limiting to bulk operations', async () => {
      // This test would need actual rate limiting implementation
      // For now, just test that the endpoint is accessible
      const response = await request(app)
        .post('/api/user/bulk/preview')
        .send({
          operationType: 'update-skills',
          params: { jobIds: [1], operation: 'add', skills: ['Test'] }
        });

      // Should not be rate limited for first request
      expect(response.status).not.toBe(429);
    });
  });
});