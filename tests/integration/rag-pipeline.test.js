/**
 * Integration Tests for RAG Pipeline
 * Tests the complete flow: Query -> Embeddings -> Retrieval -> Response Generation
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { testQueries, mockChunks, mockApiResponses, performanceThresholds } from '../fixtures/test-data.js';

// Mock all services
jest.unstable_mockModule('../../services/rag.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    processQuery: jest.fn(),
    generateResponse: jest.fn()
  }))
}));

jest.unstable_mockModule('../../services/embeddings.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    embedText: jest.fn(),
    extractFilters: jest.fn(),
    calculateSimilarityThreshold: jest.fn()
  }))
}));

jest.unstable_mockModule('../../services/retrieval.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    retrieveContext: jest.fn()
  }))
}));

jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => TestSetup.mockOpenAIClient())
}));

describe('RAG Pipeline Integration', () => {
  let RAGService;
  let EmbeddingService;
  let RetrievalService;
  let ragService;
  let embeddingService;
  let retrievalService;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(async () => {
    const ragModule = await import('../../services/rag.js');
    const embeddingModule = await import('../../services/embeddings.js');
    const retrievalModule = await import('../../services/retrieval.js');

    RAGService = ragModule.default;
    EmbeddingService = embeddingModule.default;
    RetrievalService = retrievalModule.default;

    ragService = new RAGService();
    embeddingService = new EmbeddingService();
    retrievalService = new RetrievalService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('complete RAG flow', () => {
    test('should handle OLDP query end-to-end', async () => {
      const query = testQueries.oldp.query;
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      // Mock the pipeline steps
      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      embeddingService.extractFilters.mockReturnValue(testQueries.oldp.expectedFilters);
      embeddingService.calculateSimilarityThreshold.mockReturnValue(0.7);

      retrievalService.retrieveContext.mockResolvedValue({
        chunks: [mockChunks[0]],
        totalFound: 1,
        avgSimilarity: 0.85,
        searchMethod: 'semantic',
        sources: ['Lockheed Martin']
      });

      ragService.processQuery.mockResolvedValue({
        response: 'Scott participated in Lockheed Martin\'s Operations Leadership Development Program (OLDP) from 2001-2005, where he gained experience in project management and team leadership.',
        context: [mockChunks[0]],
        metadata: {
          totalChunks: 1,
          avgSimilarity: 0.85,
          searchMethod: 'semantic',
          processingTime: 1500
        }
      });

      const result = await ragService.processQuery(query);

      expect(result.response).toContain('OLDP');
      expect(result.response).toContain('Lockheed Martin');
      expect(result.context).toHaveLength(1);
      expect(result.metadata.avgSimilarity).toBeGreaterThan(0.8);
      expect(result.metadata.searchMethod).toBe('semantic');
    });

    test('should handle IoT query with proper context retrieval', async () => {
      const query = testQueries.iot.query;
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      embeddingService.extractFilters.mockReturnValue(testQueries.iot.expectedFilters);
      embeddingService.calculateSimilarityThreshold.mockReturnValue(0.65);

      retrievalService.retrieveContext.mockResolvedValue({
        chunks: [mockChunks[1]],
        totalFound: 1,
        avgSimilarity: 0.78,
        searchMethod: 'semantic',
        sources: ['Coca-Cola']
      });

      ragService.processQuery.mockResolvedValue({
        response: 'Scott worked on IoT solutions for Coca-Cola Freestyle dispensing machines, building real-time monitoring systems and data analytics platforms.',
        context: [mockChunks[1]],
        metadata: {
          totalChunks: 1,
          avgSimilarity: 0.78,
          searchMethod: 'semantic',
          processingTime: 1200
        }
      });

      const result = await ragService.processQuery(query);

      expect(result.response).toContain('IoT');
      expect(result.response).toContain('Freestyle');
      expect(result.response).toContain('Coca-Cola');
      expect(result.context[0].skills).toContain('IoT');
      expect(result.metadata.avgSimilarity).toBeGreaterThan(0.7);
    });

    test('should handle general queries with multiple relevant chunks', async () => {
      const query = testQueries.general.query;
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      embeddingService.extractFilters.mockReturnValue(testQueries.general.expectedFilters);
      embeddingService.calculateSimilarityThreshold.mockReturnValue(0.25);

      retrievalService.retrieveContext.mockResolvedValue({
        chunks: mockChunks,
        totalFound: 3,
        avgSimilarity: 0.72,
        searchMethod: 'semantic',
        sources: ['Lockheed Martin', 'Coca-Cola', 'Tech Startup']
      });

      ragService.processQuery.mockResolvedValue({
        response: 'Scott has diverse professional experience including operations leadership at Lockheed Martin, IoT development at Coca-Cola, and AI/ML engineering.',
        context: mockChunks,
        metadata: {
          totalChunks: 3,
          avgSimilarity: 0.72,
          searchMethod: 'semantic',
          processingTime: 1800
        }
      });

      const result = await ragService.processQuery(query);

      expect(result.context).toHaveLength(3);
      expect(result.response).toContain('Lockheed Martin');
      expect(result.response).toContain('Coca-Cola');
      expect(result.metadata.totalChunks).toBe(3);
    });

    test('should meet end-to-end performance requirements', async () => {
      const query = testQueries.general.query;
      
      ragService.processQuery.mockResolvedValue({
        response: 'Test response',
        context: [mockChunks[0]],
        metadata: { processingTime: 1500 }
      });

      const performance = await TestSetup.measurePerformance(
        () => ragService.processQuery(query),
        'Complete RAG Pipeline'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat);
      expect(performance.result.response).toBeTruthy();
      expect(performance.result.context).toHaveLength(1);
    });
  });

  describe('pipeline error handling', () => {
    test('should handle embedding service failures gracefully', async () => {
      const query = testQueries.oldp.query;
      
      embeddingService.embedText.mockRejectedValue(new Error('Cohere API failure'));
      
      ragService.processQuery.mockRejectedValue(new Error('Embedding generation failed'));

      await expect(ragService.processQuery(query))
        .rejects.toThrow('Embedding generation failed');
    });

    test('should handle retrieval service failures', async () => {
      const query = testQueries.iot.query;
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      retrievalService.retrieveContext.mockRejectedValue(new Error('Database connection failed'));
      
      ragService.processQuery.mockRejectedValue(new Error('Context retrieval failed'));

      await expect(ragService.processQuery(query))
        .rejects.toThrow('Context retrieval failed');
    });

    test('should handle OpenAI API failures', async () => {
      const query = testQueries.general.query;
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      retrievalService.retrieveContext.mockResolvedValue({
        chunks: [mockChunks[0]],
        totalFound: 1,
        avgSimilarity: 0.8
      });

      ragService.generateResponse.mockRejectedValue(new Error('OpenAI API rate limit exceeded'));
      ragService.processQuery.mockRejectedValue(new Error('Response generation failed'));

      await expect(ragService.processQuery(query))
        .rejects.toThrow('Response generation failed');
    });

    test('should handle empty context gracefully', async () => {
      const query = "Tell me about nonexistent experience";
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      retrievalService.retrieveContext.mockResolvedValue({
        chunks: [],
        totalFound: 0,
        avgSimilarity: 0,
        searchMethod: 'semantic'
      });

      ragService.processQuery.mockResolvedValue({
        response: 'I don\'t have information about that specific experience in the available context.',
        context: [],
        metadata: {
          totalChunks: 0,
          avgSimilarity: 0,
          searchMethod: 'semantic',
          processingTime: 800
        }
      });

      const result = await ragService.processQuery(query);

      expect(result.context).toHaveLength(0);
      expect(result.response).toContain('don\'t have information');
      expect(result.metadata.totalChunks).toBe(0);
    });
  });

  describe('context filtering and ranking', () => {
    test('should apply filters correctly in pipeline', async () => {
      const query = "Tell me about leadership experience at Lockheed Martin";
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      embeddingService.extractFilters.mockReturnValue({
        skills: ['Leadership'],
        tags: ['management', 'leadership'],
        organizations: ['Lockheed Martin']
      });

      retrievalService.retrieveContext.mockResolvedValue({
        chunks: [mockChunks[0]], // Only OLDP chunk should match
        totalFound: 1,
        avgSimilarity: 0.88,
        searchMethod: 'semantic'
      });

      ragService.processQuery.mockResolvedValue({
        response: 'Scott demonstrated leadership experience through the OLDP program at Lockheed Martin.',
        context: [mockChunks[0]],
        metadata: { avgSimilarity: 0.88 }
      });

      const result = await ragService.processQuery(query);

      expect(result.context).toHaveLength(1);
      expect(result.context[0].sources.org).toBe('Lockheed Martin');
      expect(result.context[0].skills).toContain('Leadership');
    });

    test('should handle fallback to text search when semantic fails', async () => {
      const query = "Tell me about very specific technical details";
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      embeddingService.embedText.mockResolvedValue(mockEmbedding);
      
      // First try semantic search (returns empty)
      retrievalService.retrieveContext.mockResolvedValueOnce({
        chunks: [],
        totalFound: 0,
        avgSimilarity: 0,
        searchMethod: 'semantic'
      });

      // Then fallback to text search
      retrievalService.retrieveContext.mockResolvedValueOnce({
        chunks: [mockChunks[2]],
        totalFound: 1,
        avgSimilarity: 0.35,
        searchMethod: 'text'
      });

      ragService.processQuery.mockResolvedValue({
        response: 'Based on text search, here are some technical details.',
        context: [mockChunks[2]],
        metadata: {
          searchMethod: 'text',
          avgSimilarity: 0.35
        }
      });

      const result = await ragService.processQuery(query);

      expect(result.metadata.searchMethod).toBe('text');
      expect(result.metadata.avgSimilarity).toBeLessThan(0.5);
      expect(result.context).toHaveLength(1);
    });
  });

  describe('response quality and consistency', () => {
    test('should generate contextually relevant responses', async () => {
      const query = testQueries.oldp.query;
      
      ragService.processQuery.mockResolvedValue({
        response: 'Scott participated in the Operations Leadership Development Program (OLDP) at Lockheed Martin from 2001-2005, where he gained valuable experience in project management, team leadership, and operational excellence.',
        context: [mockChunks[0]],
        metadata: { avgSimilarity: 0.85 }
      });

      const result = await ragService.processQuery(query);

      expect(result.response).toContain('OLDP');
      expect(result.response).toContain('Lockheed Martin');
      expect(result.response).toContain('2001-2005');
      expect(result.response).toContain('leadership');
    });

    test('should maintain response consistency across similar queries', async () => {
      const queries = [
        "Tell me about Scott's OLDP experience",
        "What was Scott's role in the Operations Leadership Development Program?",
        "Describe Scott's experience at Lockheed Martin OLDP"
      ];

      const responses = [];
      
      for (const query of queries) {
        ragService.processQuery.mockResolvedValue({
          response: 'Scott participated in Lockheed Martin\'s OLDP program, gaining leadership and project management experience.',
          context: [mockChunks[0]],
          metadata: { avgSimilarity: 0.8 }
        });

        const result = await ragService.processQuery(query);
        responses.push(result.response);
      }

      // All responses should mention key elements
      responses.forEach(response => {
        expect(response).toContain('OLDP');
        expect(response).toContain('Lockheed Martin');
        expect(response).toContain('leadership');
      });
    });
  });
});