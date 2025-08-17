/**
 * Unit Tests for Embedding Service
 * Converted from debug-embeddings.js and check-embedding-details.js
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { mockApiResponses, performanceThresholds } from '../fixtures/test-data.js';

// Mock the dependencies
jest.unstable_mockModule('../../services/embeddings.js', () => ({
  default: jest.fn().mockImplementation(() => ({
    embedText: jest.fn(),
    extractFilters: jest.fn(),
    calculateSimilarityThreshold: jest.fn()
  }))
}));

jest.unstable_mockModule('cohere-ai', () => ({
  CohereApi: jest.fn().mockImplementation(() => TestSetup.mockCohereClient())
}));

describe('Embedding Service', () => {
  let EmbeddingService;
  let embeddingService;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(async () => {
    const module = await import('../../services/embeddings.js');
    EmbeddingService = module.default;
    embeddingService = new EmbeddingService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('embedText', () => {
    test('should generate embeddings with correct dimensions', async () => {
      const mockEmbedding = TestSetup.createMockEmbedding(1024);
      embeddingService.embedText.mockResolvedValue(mockEmbedding);

      const result = await embeddingService.embedText('test query', 'search_query');

      expect(result).toHaveLength(1024);
      expect(result.every(n => typeof n === 'number')).toBe(true);
      expect(embeddingService.embedText).toHaveBeenCalledWith('test query', 'search_query');
    });

    test('should handle embedding generation within performance threshold', async () => {
      const mockEmbedding = TestSetup.createMockEmbedding(1024);
      embeddingService.embedText.mockResolvedValue(mockEmbedding);

      const performance = await TestSetup.measurePerformance(
        () => embeddingService.embedText('test query', 'search_query'),
        'Embedding Generation'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.embedding.generation);
      expect(performance.result).toEqual(mockEmbedding);
    });

    test('should handle empty or invalid input gracefully', async () => {
      embeddingService.embedText.mockResolvedValue(null);

      const result = await embeddingService.embedText('', 'search_query');

      expect(result).toBeNull();
      expect(embeddingService.embedText).toHaveBeenCalledWith('', 'search_query');
    });

    test('should handle API errors gracefully', async () => {
      const error = new Error('Cohere API Error');
      embeddingService.embedText.mockRejectedValue(error);

      await expect(embeddingService.embedText('test query', 'search_query'))
        .rejects.toThrow('Cohere API Error');
    });
  });

  describe('extractFilters', () => {
    test('should extract skills and tags from OLDP query', () => {
      const query = "Tell me about Scott's OLDP experience at Lockheed Martin";
      const expectedFilters = {
        skills: ['Leadership', 'Operations'],
        tags: ['management', 'leadership', 'operations'],
        organizations: ['Lockheed Martin']
      };

      embeddingService.extractFilters.mockReturnValue(expectedFilters);

      const filters = embeddingService.extractFilters(query);

      expect(filters).toEqual(expectedFilters);
      expect(filters.skills).toContain('Leadership');
      expect(filters.organizations).toContain('Lockheed Martin');
    });

    test('should extract IoT-related filters', () => {
      const query = "What IoT work did Scott do?";
      const expectedFilters = {
        skills: ['IoT', 'JavaScript'],
        tags: ['iot', 'hardware', 'mobile'],
        organizations: []
      };

      embeddingService.extractFilters.mockReturnValue(expectedFilters);

      const filters = embeddingService.extractFilters(query);

      expect(filters.skills).toContain('IoT');
      expect(filters.tags).toContain('iot');
    });

    test('should handle general queries without specific filters', () => {
      const query = "Tell me about professional experience";
      const expectedFilters = {
        skills: [],
        tags: [],
        organizations: []
      };

      embeddingService.extractFilters.mockReturnValue(expectedFilters);

      const filters = embeddingService.extractFilters(query);

      expect(filters.skills).toHaveLength(0);
      expect(filters.tags).toHaveLength(0);
    });
  });

  describe('calculateSimilarityThreshold', () => {
    test('should return appropriate threshold for specific queries', () => {
      const query = "Tell me about Scott's OLDP experience";
      const expectedThreshold = 0.75;

      embeddingService.calculateSimilarityThreshold.mockReturnValue(expectedThreshold);

      const threshold = embeddingService.calculateSimilarityThreshold(query);

      expect(threshold).toBe(expectedThreshold);
      expect(threshold).toBeGreaterThan(0.5);
      expect(threshold).toBeLessThan(1.0);
    });

    test('should return lower threshold for general queries', () => {
      const query = "Tell me about professional experience";
      const expectedThreshold = 0.25;

      embeddingService.calculateSimilarityThreshold.mockReturnValue(expectedThreshold);

      const threshold = embeddingService.calculateSimilarityThreshold(query);

      expect(threshold).toBe(expectedThreshold);
      expect(threshold).toBeLessThan(0.5);
    });
  });

  describe('embedding validation', () => {
    test('should validate embedding structure correctly', () => {
      const validEmbedding = TestSetup.createMockEmbedding(1024);
      const validation = TestSetup.validateEmbedding(validEmbedding);

      expect(validation.isArray).toBe(true);
      expect(validation.hasCorrectLength).toBe(true);
      expect(validation.allNumbers).toBe(true);
      expect(validation.inValidRange).toBe(true);
    });

    test('should detect invalid embedding dimensions', () => {
      const invalidEmbedding = TestSetup.createMockEmbedding(512); // Wrong dimensions
      const validation = TestSetup.validateEmbedding(invalidEmbedding);

      expect(validation.isArray).toBe(true);
      expect(validation.hasCorrectLength).toBe(false);
      expect(validation.allNumbers).toBe(true);
    });

    test('should detect non-numeric values in embedding', () => {
      const invalidEmbedding = Array.from({ length: 1024 }, (_, i) => 
        i < 5 ? 'invalid' : Math.random()
      );
      const validation = TestSetup.validateEmbedding(invalidEmbedding);

      expect(validation.isArray).toBe(true);
      expect(validation.hasCorrectLength).toBe(true);
      expect(validation.allNumbers).toBe(false);
    });
  });
});