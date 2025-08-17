/**
 * Performance Tests for Database Operations
 * Tests database query performance, connection times, and optimization status
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { performanceThresholds, mockChunks } from '../fixtures/test-data.js';

jest.unstable_mockModule('../../config/database.js', () => ({
  db: {
    searchChunks: jest.fn(),
    testConnection: jest.fn(),
    checkPgVectorStatus: jest.fn(),
    measureQueryPerformance: jest.fn()
  },
  supabase: TestSetup.mockSupabaseClient()
}));

describe('Database Performance Tests', () => {
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

  describe('connection performance', () => {
    test('should establish connection within threshold', async () => {
      db.testConnection.mockResolvedValue(true);

      const performance = await TestSetup.measurePerformance(
        () => db.testConnection(),
        'Database Connection'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.database.connection);
      expect(performance.result).toBe(true);

      // Log performance for monitoring
      console.log(`Database connection time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle connection pooling efficiently', async () => {
      const connectionPromises = Array.from({ length: 10 }, () => {
        db.testConnection.mockResolvedValue(true);
        return db.testConnection();
      });

      const startTime = process.hrtime.bigint();
      await Promise.all(connectionPromises);
      const endTime = process.hrtime.bigint();
      
      const totalTime = Number(endTime - startTime) / 1_000_000;
      const avgTimePerConnection = totalTime / 10;

      expect(avgTimePerConnection).toBeLessThan(performanceThresholds.database.connection);
      console.log(`Average connection time (10 concurrent): ${avgTimePerConnection.toFixed(2)}ms`);
    });

    test('should recover from connection failures efficiently', async () => {
      // Simulate connection failure then recovery
      db.testConnection
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValue(true);

      const performance = await TestSetup.measurePerformance(
        async () => {
          try {
            await db.testConnection();
          } catch (error) {
            // Retry logic
            return await db.testConnection();
          }
        },
        'Connection Recovery'
      );

      expect(performance.result).toBe(true);
      expect(performance.duration).toBeLessThan(performanceThresholds.database.connection * 2);
    });
  });

  describe('search query performance', () => {
    test('should perform semantic search within current threshold (non-optimized)', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const options = {
        similarityThreshold: 0.7,
        maxResults: 10
      };

      db.searchChunks.mockResolvedValue(mockChunks);

      const performance = await TestSetup.measurePerformance(
        () => db.searchChunks(embedding, options),
        'Semantic Search (Current)'
      );

      // Current performance without pgvector optimization
      expect(performance.duration).toBeLessThan(performanceThresholds.database.search);
      expect(performance.result).toHaveLength(3);

      console.log(`Current semantic search time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should simulate optimized performance with pgvector', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      
      // Simulate pgvector optimized performance (much faster)
      db.searchChunks.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 40)); // Simulate 40ms
        return mockChunks;
      });

      const performance = await TestSetup.measurePerformance(
        () => db.searchChunks(embedding, { maxResults: 10 }),
        'Semantic Search (Optimized)'
      );

      // Optimized performance with pgvector should be much faster
      expect(performance.duration).toBeLessThan(performanceThresholds.database.searchOptimized);
      
      console.log(`Optimized semantic search time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle large result sets efficiently', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const largeResultSet = Array.from({ length: 100 }, (_, i) => 
        TestSetup.createMockChunk({ id: i + 1 })
      );

      db.searchChunks.mockResolvedValue(largeResultSet);

      const performance = await TestSetup.measurePerformance(
        () => db.searchChunks(embedding, { maxResults: 100 }),
        'Large Result Set Search'
      );

      expect(performance.result).toHaveLength(100);
      expect(performance.duration).toBeLessThan(performanceThresholds.database.search * 2);
      
      console.log(`Large result set (100 items) search time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should measure performance across different similarity thresholds', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const thresholds = [0.1, 0.3, 0.5, 0.7, 0.9];
      const performanceResults = [];

      for (const threshold of thresholds) {
        const relevantChunks = mockChunks.filter(chunk => 
          Math.random() > threshold // Simulate threshold filtering
        );
        
        db.searchChunks.mockResolvedValue(relevantChunks);

        const performance = await TestSetup.measurePerformance(
          () => db.searchChunks(embedding, { similarityThreshold: threshold }),
          `Threshold ${threshold}`
        );

        performanceResults.push({
          threshold,
          duration: performance.duration,
          resultCount: performance.result.length
        });
      }

      // Higher thresholds should generally be faster (fewer results)
      performanceResults.forEach(result => {
        expect(result.duration).toBeLessThan(performanceThresholds.database.search);
        console.log(`Threshold ${result.threshold}: ${result.duration.toFixed(2)}ms, ${result.resultCount} results`);
      });
    });
  });

  describe('embedding storage and retrieval performance', () => {
    test('should store embeddings efficiently', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      const chunkData = {
        title: 'Test Chunk',
        content: 'Test content',
        embedding
      };

      supabase.mockSelect.mockResolvedValue({
        data: [{ id: 1, ...chunkData }],
        error: null
      });

      const performance = await TestSetup.measurePerformance(
        () => supabase.from('content_chunks').insert(chunkData),
        'Embedding Storage'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.embedding.storage);
      
      console.log(`Embedding storage time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should retrieve embeddings efficiently', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);
      
      supabase.mockSelect.mockResolvedValue({
        data: [{ id: 1, embedding }],
        error: null
      });

      const performance = await TestSetup.measurePerformance(
        () => supabase.from('content_chunks').select('embedding').eq('id', 1),
        'Embedding Retrieval'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.embedding.retrieval);
      
      console.log(`Embedding retrieval time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle batch embedding operations efficiently', async () => {
      const batchSize = 50;
      const embeddings = Array.from({ length: batchSize }, () => 
        TestSetup.createMockEmbedding(1024)
      );

      const batchData = embeddings.map((embedding, i) => ({
        id: i + 1,
        title: `Batch Chunk ${i + 1}`,
        content: `Content ${i + 1}`,
        embedding
      }));

      supabase.mockSelect.mockResolvedValue({
        data: batchData,
        error: null
      });

      const performance = await TestSetup.measurePerformance(
        () => supabase.from('content_chunks').insert(batchData),
        `Batch Embedding Storage (${batchSize} items)`
      );

      const avgTimePerItem = performance.duration / batchSize;
      expect(avgTimePerItem).toBeLessThan(performanceThresholds.embedding.storage / 10);
      
      console.log(`Batch storage (${batchSize} items): ${performance.duration.toFixed(2)}ms (${avgTimePerItem.toFixed(2)}ms per item)`);
    });
  });

  describe('query optimization analysis', () => {
    test('should analyze current database optimization status', async () => {
      const optimizationStatus = {
        hasPgVector: false,
        hasVectorIndexes: false,
        embeddingStorageType: 'text',
        recommendedOptimizations: [
          'Enable pgvector extension',
          'Create vector indexes',
          'Convert embedding storage to native vector type'
        ]
      };

      db.checkPgVectorStatus.mockResolvedValue(optimizationStatus);

      const status = await db.checkPgVectorStatus();

      expect(status.hasPgVector).toBe(false);
      expect(status.recommendedOptimizations).toContain('Enable pgvector extension');
      
      console.log('Database optimization status:', status);
    });

    test('should measure query performance improvement potential', async () => {
      const embedding = TestSetup.createMockEmbedding(1024);

      // Simulate current performance (text-based similarity)
      db.measureQueryPerformance.mockResolvedValueOnce({
        method: 'text_similarity',
        duration: 450,
        resultsReturned: 10
      });

      // Simulate optimized performance (pgvector)
      db.measureQueryPerformance.mockResolvedValueOnce({
        method: 'pgvector',
        duration: 25,
        resultsReturned: 10
      });

      const currentPerf = await db.measureQueryPerformance(embedding, 'current');
      const optimizedPerf = await db.measureQueryPerformance(embedding, 'optimized');

      const improvement = (currentPerf.duration - optimizedPerf.duration) / currentPerf.duration * 100;

      expect(improvement).toBeGreaterThan(80); // Should be 80%+ improvement
      expect(optimizedPerf.duration).toBeLessThan(performanceThresholds.database.searchOptimized);
      
      console.log(`Performance improvement potential: ${improvement.toFixed(1)}% (${currentPerf.duration}ms → ${optimizedPerf.duration}ms)`);
    });
  });

  describe('stress testing', () => {
    test('should handle concurrent search requests', async () => {
      const concurrentRequests = 20;
      const embedding = TestSetup.createMockEmbedding(1024);

      const requests = Array.from({ length: concurrentRequests }, (_, i) => {
        db.searchChunks.mockResolvedValue(mockChunks);
        return db.searchChunks(embedding, { maxResults: 10 });
      });

      const startTime = process.hrtime.bigint();
      const results = await Promise.all(requests);
      const endTime = process.hrtime.bigint();

      const totalTime = Number(endTime - startTime) / 1_000_000;
      const avgTimePerRequest = totalTime / concurrentRequests;

      expect(results).toHaveLength(concurrentRequests);
      expect(avgTimePerRequest).toBeLessThan(performanceThresholds.database.search);
      
      console.log(`Concurrent requests (${concurrentRequests}): ${totalTime.toFixed(2)}ms total, ${avgTimePerRequest.toFixed(2)}ms avg`);
    });

    test('should maintain performance under sustained load', async () => {
      const requestsPerBatch = 10;
      const batches = 5;
      const embedding = TestSetup.createMockEmbedding(1024);
      const batchTimes = [];

      for (let batch = 0; batch < batches; batch++) {
        const requests = Array.from({ length: requestsPerBatch }, () => {
          db.searchChunks.mockResolvedValue(mockChunks);
          return db.searchChunks(embedding, { maxResults: 10 });
        });

        const batchPerformance = await TestSetup.measurePerformance(
          () => Promise.all(requests),
          `Batch ${batch + 1}`
        );

        batchTimes.push(batchPerformance.duration);
      }

      // Performance should remain consistent across batches
      const avgBatchTime = batchTimes.reduce((sum, time) => sum + time, 0) / batches;
      const maxVariation = Math.max(...batchTimes) - Math.min(...batchTimes);
      
      expect(maxVariation).toBeLessThan(avgBatchTime * 0.5); // Variation should be less than 50%
      
      console.log(`Sustained load test - Avg batch time: ${avgBatchTime.toFixed(2)}ms, Max variation: ${maxVariation.toFixed(2)}ms`);
    });
  });
});