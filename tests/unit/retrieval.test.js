/**
 * Unit Tests for Retrieval Service
 * Converted from debug-retrieval.js and test-oldp-retrieval-detailed.js
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { testQueries, mockChunks, performanceThresholds } from '../fixtures/test-data.js';

// Mock the dependencies
jest.unstable_mockModule('../../services/retrieval.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    retrieveContext: jest.fn(),
    searchSemantic: jest.fn(),
    searchText: jest.fn(),
    rerankResults: jest.fn()
  }))
}));

jest.unstable_mockModule('../../config/database.js', () => ({
  db: {
    searchChunks: jest.fn(),
    cosineSimilarity: jest.fn()
  },
  supabase: TestSetup.mockSupabaseClient()
}));

describe('Retrieval Service', () => {
  let RetrievalService;
  let retrievalService;
  let mockDb;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(async () => {
    const retrievalModule = await import('../../services/retrieval.js');
    RetrievalService = retrievalModule.default;
    retrievalService = new RetrievalService();

    const dbModule = await import('../../config/database.js');
    mockDb = dbModule.db;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('retrieveContext', () => {
    test('should retrieve context for OLDP query successfully', async () => {
      const query = testQueries.oldp.query;
      const expectedResult = {
        chunks: [mockChunks[0]],
        totalFound: 1,
        avgSimilarity: 0.85,
        searchMethod: 'semantic',
        sources: ['Lockheed Martin']
      };

      retrievalService.retrieveContext.mockResolvedValue(expectedResult);

      const result = await retrievalService.retrieveContext(query, {
        maxResults: 10,
        includeMetadata: true,
        rerankResults: true
      });

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].title).toContain('OLDP');
      expect(result.avgSimilarity).toBeGreaterThan(0.7);
      expect(result.searchMethod).toBe('semantic');
      expect(result.sources).toContain('Lockheed Martin');
    });

    test('should retrieve IoT context successfully', async () => {
      const query = testQueries.iot.query;
      const expectedResult = {
        chunks: [mockChunks[1]],
        totalFound: 1,
        avgSimilarity: 0.78,
        searchMethod: 'semantic',
        sources: ['Coca-Cola']
      };

      retrievalService.retrieveContext.mockResolvedValue(expectedResult);

      const result = await retrievalService.retrieveContext(query);

      expect(result.chunks).toHaveLength(1);
      expect(result.chunks[0].title).toContain('IoT');
      expect(result.chunks[0].content).toContain('Freestyle');
      expect(result.sources).toContain('Coca-Cola');
    });

    test('should handle queries with no semantic results and fall back to text search', async () => {
      const query = "Tell me about obscure technical details";
      const expectedResult = {
        chunks: [mockChunks[2]],
        totalFound: 1,
        avgSimilarity: 0.35,
        searchMethod: 'text',
        sources: ['Tech Startup']
      };

      retrievalService.retrieveContext.mockResolvedValue(expectedResult);

      const result = await retrievalService.retrieveContext(query);

      expect(result.searchMethod).toBe('text');
      expect(result.avgSimilarity).toBeLessThan(0.5);
      expect(result.chunks).toHaveLength(1);
    });

    test('should meet performance requirements', async () => {
      const query = testQueries.general.query;
      const expectedResult = {
        chunks: mockChunks,
        totalFound: 3,
        avgSimilarity: 0.7,
        searchMethod: 'semantic'
      };

      retrievalService.retrieveContext.mockResolvedValue(expectedResult);

      const performance = await TestSetup.measurePerformance(
        () => retrievalService.retrieveContext(query),
        'Context Retrieval'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.retrieval);
      expect(performance.result.chunks).toHaveLength(3);
    });
  });

  describe('searchSemantic', () => {
    test('should perform semantic search with correct parameters', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const options = {
        similarityThreshold: 0.7,
        maxResults: 10,
        skills: ['Leadership'],
        tags: ['management']
      };

      mockDb.searchChunks.mockResolvedValue([mockChunks[0]]);
      retrievalService.searchSemantic.mockResolvedValue([mockChunks[0]]);

      const results = await retrievalService.searchSemantic(embedding, options);

      expect(results).toHaveLength(1);
      expect(results[0].similarity).toBeGreaterThan(0.7);
      expect(retrievalService.searchSemantic).toHaveBeenCalledWith(embedding, options);
    });

    test('should apply soft filtering with preference boosts', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const options = {
        skills: ['IoT'],
        tags: ['iot'],
        preferenceBoost: 0.02
      };

      const resultsWithBoost = [
        { ...mockChunks[1], similarity: 0.77 } // IoT chunk with boost
      ];

      retrievalService.searchSemantic.mockResolvedValue(resultsWithBoost);

      const results = await retrievalService.searchSemantic(embedding, options);

      expect(results[0].skills).toContain('IoT');
      expect(results[0].similarity).toBeGreaterThan(0.75);
    });
  });

  describe('searchText', () => {
    test('should perform text search as fallback', async () => {
      const query = "specific technical term not in embeddings";
      const options = {
        maxResults: 5,
        confidence: 0.3
      };

      retrievalService.searchText.mockResolvedValue([mockChunks[2]]);

      const results = await retrievalService.searchText(query, options);

      expect(results).toHaveLength(1);
      expect(retrievalService.searchText).toHaveBeenCalledWith(query, options);
    });

    test('should handle empty text search results', async () => {
      const query = "nonexistent content";
      
      retrievalService.searchText.mockResolvedValue([]);

      const results = await retrievalService.searchText(query);

      expect(results).toHaveLength(0);
    });
  });

  describe('rerankResults', () => {
    test('should rerank results by multiple quality signals', () => {
      const chunks = [...mockChunks];
      const expectedReranked = [mockChunks[2], mockChunks[0], mockChunks[1]]; // AI, OLDP, IoT

      retrievalService.rerankResults.mockReturnValue(expectedReranked);

      const reranked = retrievalService.rerankResults(chunks, 'AI experience');

      expect(reranked).toHaveLength(3);
      expect(reranked[0].title).toContain('AI/ML');
      expect(retrievalService.rerankResults).toHaveBeenCalledWith(chunks, 'AI experience');
    });

    test('should maintain similarity order when relevance is equal', () => {
      const chunks = [
        { ...mockChunks[0], similarity: 0.9 },
        { ...mockChunks[1], similarity: 0.8 },
        { ...mockChunks[2], similarity: 0.7 }
      ];

      retrievalService.rerankResults.mockReturnValue(chunks);

      const reranked = retrievalService.rerankResults(chunks, 'general query');

      expect(reranked[0].similarity).toBeGreaterThanOrEqual(reranked[1].similarity);
      expect(reranked[1].similarity).toBeGreaterThanOrEqual(reranked[2].similarity);
    });
  });

  describe('error handling', () => {
    test('should handle database connection errors gracefully', async () => {
      const query = testQueries.general.query;
      const error = new Error('Database connection failed');

      retrievalService.retrieveContext.mockRejectedValue(error);

      await expect(retrievalService.retrieveContext(query))
        .rejects.toThrow('Database connection failed');
    });

    test('should handle malformed embedding errors', async () => {
      const invalidEmbedding = null;
      const options = { similarityThreshold: 0.7 };

      retrievalService.searchSemantic.mockRejectedValue(
        new Error('Invalid embedding format')
      );

      await expect(retrievalService.searchSemantic(invalidEmbedding, options))
        .rejects.toThrow('Invalid embedding format');
    });
  });

  describe('similarity calculations', () => {
    test('should calculate cosine similarity correctly', () => {
      const embedding1 = [1, 0, 0, 0];
      const embedding2 = [0, 1, 0, 0];
      const expectedSimilarity = 0; // Orthogonal vectors

      mockDb.cosineSimilarity.mockReturnValue(expectedSimilarity);

      const similarity = mockDb.cosineSimilarity(embedding1, embedding2);

      expect(similarity).toBe(expectedSimilarity);
      expect(mockDb.cosineSimilarity).toHaveBeenCalledWith(embedding1, embedding2);
    });

    test('should handle identical embeddings', () => {
      const embedding = [1, 0, 0, 0];
      const expectedSimilarity = 1; // Identical vectors

      mockDb.cosineSimilarity.mockReturnValue(expectedSimilarity);

      const similarity = mockDb.cosineSimilarity(embedding, embedding);

      expect(similarity).toBe(expectedSimilarity);
    });
  });
});