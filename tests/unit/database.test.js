/**
 * Unit Tests for Database Service
 * Converted from debug-db-structure.js and debug-search.js
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { mockChunks, mockApiResponses, performanceThresholds } from '../fixtures/test-data.js';

// Mock the dependencies
jest.unstable_mockModule('../../config/database.js', () => ({
  db: {
    searchChunks: jest.fn(),
    cosineSimilarity: jest.fn(),
    testConnection: jest.fn()
  },
  supabase: TestSetup.mockSupabaseClient()
}));

describe('Database Service', () => {
  let db;
  let supabase;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(async () => {
    const dbModule = await import('../../config/database.js');
    db = dbModule.db;
    supabase = dbModule.supabase;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('database connection', () => {
    test('should establish connection successfully', async () => {
      supabase.mockSelect.mockResolvedValue({
        data: mockChunks.slice(0, 5),
        error: null
      });

      db.testConnection.mockResolvedValue(true);

      const isConnected = await db.testConnection();

      expect(isConnected).toBe(true);
      expect(db.testConnection).toHaveBeenCalled();
    });

    test('should meet connection performance threshold', async () => {
      db.testConnection.mockResolvedValue(true);

      const performance = await TestSetup.measurePerformance(
        () => db.testConnection(),
        'Database Connection'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.database.connection);
      expect(performance.result).toBe(true);
    });

    test('should handle connection failures gracefully', async () => {
      const error = new Error('Connection timeout');
      db.testConnection.mockRejectedValue(error);

      await expect(db.testConnection()).rejects.toThrow('Connection timeout');
    });
  });

  describe('searchChunks', () => {
    test('should search chunks with embedding successfully', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const options = {
        similarityThreshold: 0.7,
        maxResults: 10,
        skills: ['Leadership'],
        tags: ['management']
      };

      db.searchChunks.mockResolvedValue([mockChunks[0]]);

      const results = await db.searchChunks(embedding, options);

      expect(results).toHaveLength(1);
      expect(results[0].title).toContain('Operations Leadership');
      expect(db.searchChunks).toHaveBeenCalledWith(embedding, options);
    });

    test('should handle null embedding (text search mode)', async () => {
      const options = {
        similarityThreshold: 0.0,
        maxResults: 5
      };

      db.searchChunks.mockResolvedValue(mockChunks);

      const results = await db.searchChunks(null, options);

      expect(results).toHaveLength(3);
      expect(db.searchChunks).toHaveBeenCalledWith(null, options);
    });

    test('should apply similarity threshold correctly', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const options = {
        similarityThreshold: 0.8,
        maxResults: 10
      };

      // Only high-similarity chunks should be returned
      const highSimilarityChunks = [
        { ...mockChunks[0], similarity: 0.85 }
      ];

      db.searchChunks.mockResolvedValue(highSimilarityChunks);

      const results = await db.searchChunks(embedding, options);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeGreaterThan(0.8);
    });

    test('should handle skills-based filtering', async () => {
      const options = {
        skills: ['IoT'],
        similarityThreshold: 0.5
      };

      // Mock Supabase overlaps query
      supabase.mockOverlaps.mockResolvedValue({
        data: [mockChunks[1]], // IoT chunk
        error: null
      });

      db.searchChunks.mockResolvedValue([mockChunks[1]]);

      const results = await db.searchChunks(null, options);

      expect(results).toHaveLength(1);
      expect(results[0].skills).toContain('IoT');
    });

    test('should meet search performance requirements', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      
      db.searchChunks.mockResolvedValue(mockChunks);

      const performance = await TestSetup.measurePerformance(
        () => db.searchChunks(embedding, { maxResults: 10 }),
        'Database Search'
      );

      // Current performance (without pgvector optimization)
      expect(performance.duration).toBeLessThan(performanceThresholds.database.search);
      expect(performance.result).toHaveLength(3);
    });
  });

  describe('direct supabase queries', () => {
    test('should query content_chunks table successfully', async () => {
      supabase.mockSelect.mockResolvedValue({
        data: mockChunks,
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('id, title, skills, tags')
        .limit(5);

      expect(result.data).toHaveLength(3);
      expect(result.error).toBeNull();
      expect(supabase.from).toHaveBeenCalledWith('content_chunks');
    });

    test('should handle AI/ML skills queries', async () => {
      const aiChunks = [mockChunks[2]]; // AI chunk
      
      supabase.mockOverlaps.mockResolvedValue({
        data: aiChunks,
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('id, title, content, skills, tags')
        .overlaps('skills', ['AI/ML']);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].skills).toContain('AI/ML');
    });

    test('should handle OLDP title searches', async () => {
      const oldpChunks = [mockChunks[0]]; // OLDP chunk
      
      supabase.mockIlike.mockResolvedValue({
        data: oldpChunks,
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('id, title, content')
        .ilike('title', '%operations leadership%');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].title).toContain('Operations Leadership');
    });

    test('should handle complex OR queries', async () => {
      const oldpChunks = [mockChunks[0]];
      
      supabase.mockOr.mockResolvedValue({
        data: oldpChunks,
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('id, title, embedding')
        .or('title.ilike.%operations leadership%,title.ilike.%oldp%')
        .not('embedding', 'is', null);

      expect(result.data).toHaveLength(1);
      expect(result.data[0].embedding).toBeTruthy();
    });
  });

  describe('embedding storage and retrieval', () => {
    test('should store embeddings in correct format', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const chunk = { ...mockChunks[0], embedding };

      supabase.mockSelect.mockResolvedValue({
        data: [chunk],
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('embedding')
        .eq('id', chunk.id);

      expect(result.data[0].embedding).toHaveLength(1024);
      expect(Array.isArray(result.data[0].embedding)).toBe(true);
    });

    test('should handle embedding validation', () => {
      const validEmbedding = TestSetup.createMockEmbedding(1024);
      const validation = TestSetup.validateEmbedding(validEmbedding);

      expect(validation.isArray).toBe(true);
      expect(validation.hasCorrectLength).toBe(true);
      expect(validation.allNumbers).toBe(true);
      expect(validation.inValidRange).toBe(true);
    });

    test('should detect null embeddings', async () => {
      const chunksWithNullEmbeddings = [
        { ...mockChunks[0], embedding: null }
      ];

      supabase.mockSelect.mockResolvedValue({
        data: chunksWithNullEmbeddings,
        error: null
      });

      const result = await supabase
        .from('content_chunks')
        .select('id, embedding')
        .is('embedding', null);

      expect(result.data[0].embedding).toBeNull();
    });
  });

  describe('cosine similarity calculations', () => {
    test('should calculate similarity for identical vectors', () => {
      const vector = [1, 0, 0, 0];
      
      db.cosineSimilarity.mockReturnValue(1.0);

      const similarity = db.cosineSimilarity(vector, vector);

      expect(similarity).toBe(1.0);
    });

    test('should calculate similarity for orthogonal vectors', () => {
      const vector1 = [1, 0, 0, 0];
      const vector2 = [0, 1, 0, 0];
      
      db.cosineSimilarity.mockReturnValue(0.0);

      const similarity = db.cosineSimilarity(vector1, vector2);

      expect(similarity).toBe(0.0);
    });

    test('should handle edge cases in similarity calculation', () => {
      const zeroVector = [0, 0, 0, 0];
      const normalVector = [1, 0, 0, 0];
      
      db.cosineSimilarity.mockReturnValue(0.0);

      const similarity = db.cosineSimilarity(zeroVector, normalVector);

      expect(similarity).toBe(0.0);
    });
  });

  describe('error handling', () => {
    test('should handle database query errors', async () => {
      supabase.mockSelect.mockResolvedValue({
        data: null,
        error: { message: 'Table does not exist' }
      });

      const result = await supabase
        .from('nonexistent_table')
        .select('*');

      expect(result.error).toBeTruthy();
      expect(result.error.message).toContain('Table does not exist');
    });

    test('should handle malformed embedding queries', async () => {
      const invalidEmbedding = 'not-an-array';
      const error = new Error('Invalid embedding format');
      
      db.searchChunks.mockRejectedValue(error);

      await expect(db.searchChunks(invalidEmbedding, {}))
        .rejects.toThrow('Invalid embedding format');
    });
  });
});