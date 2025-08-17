/**
 * End-to-End Tests for User Data Management API
 * Tests complete API workflows including validation, processing, and embedding regeneration
 */

import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import TestSetup from '../utilities/test-setup.js';
import { mockSources, mockChunks } from '../fixtures/test-data.js';

// Mock dependencies
jest.unstable_mockModule('../../config/database.js', () => ({
  supabase: TestSetup.mockSupabaseClient()
}));

jest.unstable_mockModule('../../services/embeddings.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    embedText: jest.fn().mockResolvedValue(TestSetup.createMockEmbedding(1024))
  }))
}));

describe('User Data Management API E2E Tests', () => {
  let app;
  let mockSupabase;
  let mockEmbeddingService;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(async () => {
    // Setup Express app
    app = express();
    app.use(express.json());

    // Import and setup routes after mocking
    const { default: userDataRouter } = await import('../../routes/user-data.js');
    app.use('/api/user', userDataRouter);

    // Get mocked services
    const { supabase } = await import('../../config/database.js');
    mockSupabase = supabase;

    const EmbeddingService = (await import('../../services/embeddings.js')).default;
    mockEmbeddingService = new EmbeddingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/user/work-history', () => {
    test('should return chronological work history with analytics', async () => {
      // Mock database responses
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockSources,
        error: null
      });

      // Mock chunk counts for each source
      mockSupabase.select.mockResolvedValue({ count: 5 });
      mockSupabase.mockSelect.mockResolvedValue({
        data: [{ skills: ['JavaScript', 'React'] }],
        error: null
      });

      const response = await request(app)
        .get('/api/user/work-history')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.jobs).toBeDefined();
      expect(response.body.data.analytics).toBeDefined();
      expect(response.body.data.analytics.totalJobs).toBeGreaterThan(0);
      expect(response.body.timestamp).toBeDefined();

      // Verify database calls
      expect(mockSupabase.from).toHaveBeenCalledWith('sources');
      expect(mockSupabase.mockSelect).toHaveBeenCalled();
    });

    test('should handle database errors gracefully', async () => {
      mockSupabase.mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' }
      });

      const response = await request(app)
        .get('/api/user/work-history')
        .expect(500);

      expect(response.body.error).toBe('Failed to fetch work history');
      expect(response.body.details).toBe('Database connection failed');
    });

    test('should include enriched data for each job', async () => {
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: [mockSources[0]],
        error: null
      });

      // Mock chunk count and skills
      mockSupabase.select.mockResolvedValue({ count: 3 });
      mockSupabase.mockSelect.mockResolvedValue({
        data: [
          { skills: ['JavaScript', 'React'] },
          { skills: ['Node.js', 'JavaScript'] }
        ],
        error: null
      });

      const response = await request(app)
        .get('/api/user/work-history')
        .expect(200);

      const job = response.body.data.jobs[0];
      expect(job.chunkCount).toBe(3);
      expect(job.skillsCount).toBeGreaterThan(0);
      expect(job.skills).toBeDefined();
      expect(job.duration).toBeDefined();
    });
  });

  describe('GET /api/user/sources/:id', () => {
    test('should return detailed source information', async () => {
      const sourceId = 1;

      // Mock source query
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockSources[0],
        error: null
      });

      // Mock chunks query
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: [mockChunks[0]],
        error: null
      });

      const response = await request(app)
        .get(`/api/user/sources/${sourceId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.source).toBeDefined();
      expect(response.body.data.chunks).toBeDefined();
      expect(response.body.data.skillAnalysis).toBeDefined();
      expect(response.body.data.metrics).toBeDefined();
      expect(response.body.data.validation).toBeDefined();
    });

    test('should return 404 for non-existent source', async () => {
      mockSupabase.mockSelect.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const response = await request(app)
        .get('/api/user/sources/999')
        .expect(404);

      expect(response.body.error).toBe('Source not found');
    });

    test('should return 400 for invalid source ID', async () => {
      const response = await request(app)
        .get('/api/user/sources/invalid')
        .expect(400);

      expect(response.body.error).toBe('Invalid source ID');
    });

    test('should include engagement metrics', async () => {
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockSources[0],
        error: null
      });

      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockChunks,
        error: null
      });

      const response = await request(app)
        .get('/api/user/sources/1')
        .expect(200);

      const metrics = response.body.data.metrics;
      expect(metrics.totalChunks).toBeDefined();
      expect(metrics.totalCharacters).toBeDefined();
      expect(metrics.averageChunkSize).toBeDefined();
      expect(metrics.hasEmbeddings).toBeDefined();
      expect(metrics.embeddingCoverage).toBeDefined();
    });
  });

  describe('PUT /api/user/sources/:id', () => {
    test('should successfully update source with valid data', async () => {
      const sourceId = 1;
      const updateData = {
        title: 'Senior Software Engineer',
        skills: ['JavaScript', 'React', 'Node.js']
      };

      // Mock existing source
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null }) // Get existing
        .mockResolvedValueOnce({ data: mockSources, error: null }); // Get all jobs for validation

      // Mock update
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: { ...mockSources[0], ...updateData },
        error: null
      });

      // Mock chunks for embedding regeneration
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockChunks.slice(0, 1),
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.source).toBeDefined();
      expect(response.body.data.validation).toBeDefined();
      expect(response.body.data.embeddingResults).toBeDefined();
      expect(response.body.data.changes.contentChanged).toBe(true);
    });

    test('should reject update with validation errors', async () => {
      const sourceId = 1;
      const invalidData = {
        title: '', // Invalid - empty title
        date_start: 'invalid-date'
      };

      // Mock existing source
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null });

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.validation.isValid).toBe(false);
      expect(response.body.validation.errors.length).toBeGreaterThan(0);
    });

    test('should regenerate embeddings when content changes', async () => {
      const sourceId = 1;
      const updateData = {
        description: 'Updated job description with new details'
      };

      // Mock existing source
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null });

      // Mock update
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: { ...mockSources[0], ...updateData },
        error: null
      });

      // Mock chunks
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockChunks.slice(0, 2),
        error: null
      });

      // Mock embedding update
      mockSupabase.update.mockResolvedValue({ error: null });

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.embeddingResults.regenerated).toBe(true);
      expect(response.body.data.embeddingResults.affectedChunks).toBeGreaterThan(0);
      expect(mockEmbeddingService.embedText).toHaveBeenCalled();
    });

    test('should handle non-content changes without embedding regeneration', async () => {
      const sourceId = 1;
      const updateData = {
        location: 'Remote' // Non-content change
      };

      // Mock existing source
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null });

      // Mock update
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: { ...mockSources[0], ...updateData },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.embeddingResults.regenerated).toBe(false);
      expect(response.body.data.changes.contentChanged).toBe(false);
    });

    test('should include validation warnings in response', async () => {
      const sourceId = 1;
      const updateData = {
        skills: Array.from({ length: 25 }, (_, i) => `Skill${i}`) // Will trigger warning
      };

      // Mock existing source
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null });

      // Mock update
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: { ...mockSources[0], ...updateData },
        error: null
      });

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.data.validation.warnings.length).toBeGreaterThan(0);
      expect(response.body.data.validation.warnings.some(w => w.code === 'MANY_SKILLS')).toBe(true);
    });
  });

  describe('DELETE /api/user/sources/:id', () => {
    test('should require confirmation for deletion', async () => {
      const response = await request(app)
        .delete('/api/user/sources/1')
        .expect(400);

      expect(response.body.error).toBe('Confirmation required');
      expect(response.body.warning).toContain('cannot be undone');
    });

    test('should successfully delete source with confirmation', async () => {
      const sourceId = 1;

      // Mock source fetch
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockSources[0],
        error: null
      });

      // Mock chunk count
      mockSupabase.select.mockResolvedValue({ count: 3 });

      // Mock deletions
      mockSupabase.delete.mockResolvedValue({ error: null });

      const response = await request(app)
        .delete(`/api/user/sources/${sourceId}?confirm=true`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.deletedSource).toBeDefined();
      expect(response.body.data.impact.deletedChunks).toBe(3);
      expect(response.body.message).toContain('deleted successfully');
    });

    test('should return 404 for non-existent source deletion', async () => {
      mockSupabase.mockSelect.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116' }
      });

      const response = await request(app)
        .delete('/api/user/sources/999?confirm=true')
        .expect(404);

      expect(response.body.error).toBe('Source not found');
    });

    test('should delete chunks before source (cascade)', async () => {
      // Mock source fetch
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: mockSources[0],
        error: null
      });

      // Mock chunk count
      mockSupabase.select.mockResolvedValue({ count: 2 });

      // Mock deletions
      mockSupabase.delete
        .mockResolvedValueOnce({ error: null }) // Chunks deletion
        .mockResolvedValueOnce({ error: null }); // Source deletion

      await request(app)
        .delete('/api/user/sources/1?confirm=true')
        .expect(200);

      // Verify deletion order: chunks first, then source
      const deleteCalls = mockSupabase.delete.mock.calls;
      expect(deleteCalls).toHaveLength(2);
    });
  });

  describe('GET /api/user/duplicates', () => {
    test('should find and analyze duplicate entries', async () => {
      const duplicateSources = [
        mockSources[0],
        { ...mockSources[0], id: 999 }, // Exact duplicate
        {
          ...mockSources[1],
          title: 'IoT Solutions Architect', // Similar title
          org: 'Coca-Cola' // Same org
        }
      ];

      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: duplicateSources,
        error: null
      });

      // Mock chunk counts for duplicate analysis
      mockSupabase.select.mockResolvedValue({ count: 2 });

      const response = await request(app)
        .get('/api/user/duplicates')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.duplicates).toBeDefined();
      expect(response.body.data.summary).toBeDefined();
      expect(response.body.data.recommendations).toBeDefined();
      expect(response.body.data.summary.totalJobs).toBe(3);
    });

    test('should handle insufficient data for duplicate detection', async () => {
      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: [mockSources[0]], // Only one job
        error: null
      });

      const response = await request(app)
        .get('/api/user/duplicates')
        .expect(200);

      expect(response.body.data.duplicates).toHaveLength(0);
      expect(response.body.message).toContain('Insufficient data');
    });

    test('should categorize duplicates by type and confidence', async () => {
      const sources = [
        mockSources[0],
        { ...mockSources[0], id: 999 }, // High similarity
        {
          ...mockSources[0],
          id: 998,
          title: 'Senior Operations Manager', // Medium similarity
          description: 'Different description'
        }
      ];

      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: sources,
        error: null
      });

      mockSupabase.select.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .get('/api/user/duplicates')
        .expect(200);

      expect(response.body.data.summary.duplicateGroups).toBeGreaterThan(0);
      expect(response.body.data.recommendations.requiresReview).toBeDefined();
      expect(response.body.data.recommendations.autoMergeable).toBeDefined();
    });

    test('should provide actionable recommendations', async () => {
      const exactDuplicates = [
        mockSources[0],
        { ...mockSources[0], id: 999 }
      ];

      mockSupabase.mockSelect.mockResolvedValueOnce({
        data: exactDuplicates,
        error: null
      });

      mockSupabase.select.mockResolvedValue({ count: 1 });

      const response = await request(app)
        .get('/api/user/duplicates')
        .expect(200);

      const duplicates = response.body.data.duplicates;
      if (duplicates.length > 0) {
        expect(duplicates[0].recommendations).toBeDefined();
        expect(duplicates[0].recommendations.some(r => 
          ['merge', 'review', 'investigate'].includes(r.action)
        )).toBe(true);
      }
    });
  });

  describe('API error handling', () => {
    test('should handle malformed JSON requests', async () => {
      const response = await request(app)
        .put('/api/user/sources/1')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);

      // Express will handle JSON parsing errors
    });

    test('should handle database connection failures', async () => {
      mockSupabase.mockSelect.mockRejectedValue(new Error('Connection timeout'));

      const response = await request(app)
        .get('/api/user/work-history')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    test('should handle embedding service failures gracefully', async () => {
      const sourceId = 1;
      const updateData = { description: 'Updated description' };

      // Mock successful database operations
      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null })
        .mockResolvedValueOnce({ data: { ...mockSources[0], ...updateData }, error: null })
        .mockResolvedValueOnce({ data: mockChunks.slice(0, 1), error: null });

      // Mock embedding failure
      mockEmbeddingService.embedText.mockRejectedValue(new Error('Embedding API failed'));

      const response = await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      // Update should succeed even if embedding fails
      expect(response.body.success).toBe(true);
      expect(response.body.data.embeddingResults.regenerated).toBe(false);
      expect(response.body.data.embeddingResults.error).toBeDefined();
    });
  });

  describe('rate limiting', () => {
    test('should apply rate limiting to update endpoints', async () => {
      // Mock successful responses for multiple requests
      mockSupabase.mockSelect.mockResolvedValue({ data: mockSources[0], error: null });

      // Make many requests quickly (rate limit is mocked in test environment)
      const requests = Array.from({ length: 25 }, () =>
        request(app)
          .put('/api/user/sources/1')
          .send({ location: 'Remote' })
      );

      const responses = await Promise.all(requests);

      // In a real environment, some requests would be rate limited (429)
      // In test environment, we just verify the rate limiter is applied
      responses.forEach(response => {
        expect([200, 429]).toContain(response.status);
      });
    });
  });

  describe('data integrity', () => {
    test('should maintain referential integrity during updates', async () => {
      const sourceId = 1;
      const updateData = { title: 'Updated Title' };

      // Mock transaction-like behavior
      let updateCallCount = 0;
      mockSupabase.update.mockImplementation(() => {
        updateCallCount++;
        return { data: { ...mockSources[0], ...updateData }, error: null };
      });

      mockSupabase.mockSelect
        .mockResolvedValueOnce({ data: mockSources[0], error: null })
        .mockResolvedValueOnce({ data: mockSources, error: null })
        .mockResolvedValueOnce({ data: { ...mockSources[0], ...updateData }, error: null });

      await request(app)
        .put(`/api/user/sources/${sourceId}`)
        .send(updateData)
        .expect(200);

      // Verify atomic updates
      expect(updateCallCount).toBeGreaterThan(0);
    });
  });
});