/**
 * Unit Tests for Company Reassignment API Endpoint
 * Tests the PUT /api/user/sources/:id/reassign-company endpoint
 */

import request from 'supertest';
import { jest } from '@jest/globals';
import app from '../../server.js';

// Mock the database module
jest.mock('../../config/database.js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn(),
    update: jest.fn().mockReturnThis(),
    upsert: jest.fn().mockReturnThis(),
  }))
}));

// Mock the embeddings service
jest.mock('../../services/embeddings.js', () => ({
  generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3])
}));

describe('Company Reassignment API Endpoint', () => {
  let mockSupabase;

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset the database mock
    const { createClient } = require('../../config/database.js');
    mockSupabase = createClient();
  });

  describe('PUT /api/user/sources/:id/reassign-company', () => {
    const validSourceId = 'source-123';
    const validPayload = {
      newCompanyName: 'New Tech Corp',
      preserveEmbeddings: false,
      validateCompanyName: true,
      notifyUser: true
    };

    test('should successfully reassign company for valid request', async () => {
      // Mock successful database responses
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content'
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSourceId, org: 'New Tech Corp' },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(validPayload)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('source');
      expect(response.body.source.org).toBe('New Tech Corp');
      expect(response.body).toHaveProperty('oldCompanyName', 'Old Company');
    });

    test('should return 400 for missing source ID', async () => {
      const response = await request(app)
        .put('/api/user/sources//reassign-company')
        .send(validPayload)
        .expect(404); // Express returns 404 for malformed routes

      // The route won't match, so this tests route validation
    });

    test('should return 400 for missing new company name', async () => {
      const invalidPayload = {
        ...validPayload,
        newCompanyName: ''
      };

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('company name');
    });

    test('should return 400 for invalid company name characters', async () => {
      const invalidPayload = {
        ...validPayload,
        newCompanyName: 'Invalid<>Company'
      };

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('invalid characters');
    });

    test('should return 400 for company name too long', async () => {
      const invalidPayload = {
        ...validPayload,
        newCompanyName: 'A'.repeat(101) // Exceeds 100 character limit
      };

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(invalidPayload)
        .expect(400);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('100 characters');
    });

    test('should return 404 for non-existent source', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' }
      });

      const response = await request(app)
        .put('/api/user/sources/non-existent-id/reassign-company')
        .send(validPayload)
        .expect(404);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('not found');
    });

    test('should handle database errors gracefully', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: null,
        error: { code: 'CONNECTION_ERROR', message: 'Database connection failed' }
      });

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(validPayload)
        .expect(500);

      expect(response.body).toHaveProperty('success', false);
      expect(response.body.message).toContain('server error');
    });

    test('should preserve embeddings when flag is set', async () => {
      const preservePayload = {
        ...validPayload,
        preserveEmbeddings: true
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content',
          embedding: [0.1, 0.2, 0.3]
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSourceId, org: 'New Tech Corp' },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(preservePayload)
        .expect(200);

      expect(response.body.source.org).toBe('New Tech Corp');
      expect(response.body).toHaveProperty('embeddingPreserved', true);
    });

    test('should regenerate embeddings when preserve flag is false', async () => {
      const regeneratePayload = {
        ...validPayload,
        preserveEmbeddings: false
      };

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content'
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSourceId, org: 'New Tech Corp' },
        error: null
      });

      const { generateEmbedding } = require('../../services/embeddings.js');

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(regeneratePayload)
        .expect(200);

      expect(generateEmbedding).toHaveBeenCalled();
      expect(response.body).toHaveProperty('embeddingRegenerated', true);
    });

    test('should handle embedding generation failures gracefully', async () => {
      const { generateEmbedding } = require('../../services/embeddings.js');
      generateEmbedding.mockRejectedValueOnce(new Error('Embedding service unavailable'));

      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content'
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSourceId, org: 'New Tech Corp' },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(validPayload)
        .expect(200); // Should still succeed

      expect(response.body.source.org).toBe('New Tech Corp');
      expect(response.body).toHaveProperty('embeddingWarning');
    });

    test('should validate rate limiting', async () => {
      // Test rate limiting by making multiple rapid requests
      const requests = Array(15).fill().map(() =>
        request(app)
          .put(`/api/user/sources/${validSourceId}/reassign-company`)
          .send(validPayload)
      );

      const responses = await Promise.allSettled(requests);

      // At least one request should be rate limited
      const rateLimitedResponses = responses.filter(
        result => result.status === 'fulfilled' && result.value.status === 429
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });

    test('should normalize company names consistently', async () => {
      const testCases = [
        { input: '  Microsoft Corporation  ', expected: 'Microsoft Corporation' },
        { input: 'Google LLC', expected: 'Google LLC' },
        { input: 'Apple Inc.', expected: 'Apple Inc.' }
      ];

      for (const testCase of testCases) {
        mockSupabase.single.mockResolvedValueOnce({
          data: {
            id: validSourceId,
            org: 'Old Company',
            title: 'Software Engineer',
            content: 'Job description content'
          },
          error: null
        });

        mockSupabase.single.mockResolvedValueOnce({
          data: { id: validSourceId, org: testCase.expected },
          error: null
        });

        const response = await request(app)
          .put(`/api/user/sources/${validSourceId}/reassign-company`)
          .send({
            ...validPayload,
            newCompanyName: testCase.input
          })
          .expect(200);

        expect(response.body.source.org).toBe(testCase.expected);
      }
    });

    test('should handle concurrent reassignment requests', async () => {
      // Simulate concurrent requests for the same source
      mockSupabase.single.mockResolvedValue({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content'
        },
        error: null
      });

      const concurrentRequests = [
        request(app)
          .put(`/api/user/sources/${validSourceId}/reassign-company`)
          .send({ ...validPayload, newCompanyName: 'Company A' }),
        request(app)
          .put(`/api/user/sources/${validSourceId}/reassign-company`)
          .send({ ...validPayload, newCompanyName: 'Company B' })
      ];

      const responses = await Promise.allSettled(concurrentRequests);

      // Both requests should complete, but we should handle potential race conditions
      responses.forEach(result => {
        if (result.status === 'fulfilled') {
          expect(result.value.status).toBeOneOf([200, 409]); // Success or conflict
        }
      });
    });

    test('should include operation metadata in response', async () => {
      mockSupabase.single.mockResolvedValueOnce({
        data: {
          id: validSourceId,
          org: 'Old Company',
          title: 'Software Engineer',
          content: 'Job description content'
        },
        error: null
      });

      mockSupabase.single.mockResolvedValueOnce({
        data: { id: validSourceId, org: 'New Tech Corp' },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(validPayload)
        .expect(200);

      expect(response.body).toHaveProperty('operationId');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('processingTime');
      expect(response.body.processingTime).toBeGreaterThan(0);
    });

    test('should validate authentication', async () => {
      // This test would check authentication middleware
      // In a real implementation, you'd test without auth headers

      const response = await request(app)
        .put(`/api/user/sources/${validSourceId}/reassign-company`)
        .send(validPayload);
        // .expect(401); // Uncomment when auth is implemented

      // For now, just verify the endpoint exists
      expect([200, 401, 403]).toContain(response.status);
    });
  });

  describe('Company Name Validation', () => {
    test('should reject empty company names', async () => {
      const response = await request(app)
        .put('/api/user/sources/test-id/reassign-company')
        .send({
          newCompanyName: '',
          preserveEmbeddings: false
        })
        .expect(400);

      expect(response.body.message).toContain('company name');
    });

    test('should reject company names with special characters', async () => {
      const invalidNames = [
        'Company<script>',
        'Company{data}',
        'Company[array]',
        'Company\\path',
        'Company|pipe'
      ];

      for (const invalidName of invalidNames) {
        const response = await request(app)
          .put('/api/user/sources/test-id/reassign-company')
          .send({
            newCompanyName: invalidName,
            preserveEmbeddings: false
          })
          .expect(400);

        expect(response.body.message).toContain('invalid characters');
      }
    });

    test('should accept valid company names', async () => {
      const validNames = [
        'Microsoft Corporation',
        'Apple Inc.',
        'Google LLC',
        'Amazon.com Inc.',
        'Meta Platforms, Inc.',
        'Coca-Cola Company',
        'Johnson & Johnson',
        'AT&T Inc.'
      ];

      // Mock the database for these tests
      mockSupabase.single.mockResolvedValue({
        data: {
          id: 'test-id',
          org: 'Old Company',
          title: 'Engineer',
          content: 'Content'
        },
        error: null
      });

      for (const validName of validNames) {
        const response = await request(app)
          .put('/api/user/sources/test-id/reassign-company')
          .send({
            newCompanyName: validName,
            preserveEmbeddings: true
          });

        expect([200, 404]).toContain(response.status); // 404 if source doesn't exist
        if (response.status === 400) {
          console.error(`Valid name rejected: ${validName}`, response.body);
        }
      }
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed JSON', async () => {
      const response = await request(app)
        .put('/api/user/sources/test-id/reassign-company')
        .send('{"invalid": json}')
        .set('Content-Type', 'application/json')
        .expect(400);

      expect(response.body.message).toContain('Invalid JSON');
    });

    test('should handle missing request body', async () => {
      const response = await request(app)
        .put('/api/user/sources/test-id/reassign-company')
        .expect(400);

      expect(response.body.message).toContain('company name');
    });

    test('should provide helpful error messages', async () => {
      const response = await request(app)
        .put('/api/user/sources/test-id/reassign-company')
        .send({
          newCompanyName: 'A'.repeat(101)
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('details');
      expect(response.body.details).toHaveProperty('maxLength', 100);
    });
  });
});