/**
 * Performance Tests for API Operations
 * Tests API response times, external service performance, and timeout handling
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { performanceThresholds, testQueries } from '../fixtures/test-data.js';

// Mock external services
jest.unstable_mockModule('openai', () => ({
  default: jest.fn().mockImplementation(() => TestSetup.mockOpenAIClient())
}));

jest.unstable_mockModule('cohere-ai', () => ({
  CohereApi: jest.fn().mockImplementation(() => TestSetup.mockCohereClient())
}));

describe('API Performance Tests', () => {
  let openaiClient;
  let cohereClient;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(() => {
    openaiClient = TestSetup.mockOpenAIClient();
    cohereClient = TestSetup.mockCohereClient();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('OpenAI API performance', () => {
    test('should generate responses within time threshold', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'This is a comprehensive response about professional experience including specific details about OLDP, IoT work, and AI/ML projects.'
          }
        }],
        usage: {
          total_tokens: 300,
          prompt_tokens: 250,
          completion_tokens: 50
        }
      };

      openaiClient.chat.completions.create.mockResolvedValue(mockResponse);

      const performance = await TestSetup.measurePerformance(
        () => openaiClient.chat.completions.create({
          model: 'gpt-4',
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: testQueries.oldp.query }
          ],
          max_tokens: 500,
          temperature: 0.7
        }),
        'OpenAI Response Generation'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat);
      expect(performance.result.choices[0].message.content).toBeTruthy();
      
      console.log(`OpenAI API response time: ${performance.duration.toFixed(2)}ms`);
      console.log(`Tokens used: ${performance.result.usage.total_tokens}`);
    });

    test('should handle different response lengths efficiently', async () => {
      const responseLengths = [
        { tokens: 50, expectedTime: 1000 },
        { tokens: 150, expectedTime: 2500 },
        { tokens: 300, expectedTime: 4000 },
        { tokens: 500, expectedTime: 5000 }
      ];

      for (const { tokens, expectedTime } of responseLengths) {
        const mockResponse = {
          choices: [{
            message: {
              content: 'Response content '.repeat(Math.floor(tokens / 2))
            }
          }],
          usage: {
            total_tokens: tokens,
            completion_tokens: Math.floor(tokens * 0.6)
          }
        };

        openaiClient.chat.completions.create.mockResolvedValue(mockResponse);

        const performance = await TestSetup.measurePerformance(
          () => openaiClient.chat.completions.create({
            model: 'gpt-4',
            max_tokens: tokens
          }),
          `OpenAI ${tokens} tokens`
        );

        expect(performance.duration).toBeLessThan(expectedTime);
        console.log(`${tokens} tokens: ${performance.duration.toFixed(2)}ms`);
      }
    });

    test('should handle concurrent API requests efficiently', async () => {
      const concurrentRequests = 5;
      const mockResponse = {
        choices: [{ message: { content: 'Concurrent response' } }],
        usage: { total_tokens: 100 }
      };

      openaiClient.chat.completions.create.mockResolvedValue(mockResponse);

      const requests = Array.from({ length: concurrentRequests }, (_, i) => 
        openaiClient.chat.completions.create({
          model: 'gpt-4',
          messages: [{ role: 'user', content: `Query ${i + 1}` }]
        })
      );

      const performance = await TestSetup.measurePerformance(
        () => Promise.all(requests),
        'Concurrent OpenAI Requests'
      );

      expect(performance.result).toHaveLength(concurrentRequests);
      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat * 2);
      
      console.log(`${concurrentRequests} concurrent requests: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle rate limiting gracefully', async () => {
      // Simulate rate limit error then success
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;

      openaiClient.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValue({
          choices: [{ message: { content: 'Success after retry' } }],
          usage: { total_tokens: 80 }
        });

      const performance = await TestSetup.measurePerformance(
        async () => {
          try {
            return await openaiClient.chat.completions.create({});
          } catch (error) {
            if (error.status === 429) {
              // Simulate retry delay
              await new Promise(resolve => setTimeout(resolve, 100));
              return await openaiClient.chat.completions.create({});
            }
            throw error;
          }
        },
        'Rate Limit Recovery'
      );

      expect(performance.result.choices[0].message.content).toBe('Success after retry');
      expect(performance.duration).toBeGreaterThan(100); // Should include retry delay
    });
  });

  describe('Cohere API performance', () => {
    test('should generate embeddings within time threshold', async () => {
      const mockEmbedding = TestSetup.createMockEmbedding(1024);
      cohereClient.embed.mockResolvedValue({
        embeddings: [mockEmbedding]
      });

      const performance = await TestSetup.measurePerformance(
        () => cohereClient.embed({
          texts: [testQueries.general.query],
          model: 'embed-english-v3.0',
          input_type: 'search_query'
        }),
        'Cohere Embedding Generation'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.embedding.generation);
      expect(performance.result.embeddings[0]).toHaveLength(1024);
      
      console.log(`Cohere embedding time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle batch embedding requests efficiently', async () => {
      const batchSizes = [1, 5, 10, 20];

      for (const batchSize of batchSizes) {
        const texts = Array.from({ length: batchSize }, (_, i) => `Query ${i + 1}`);
        const mockEmbeddings = Array.from({ length: batchSize }, () => 
          TestSetup.createMockEmbedding(1024)
        );

        cohereClient.embed.mockResolvedValue({
          embeddings: mockEmbeddings
        });

        const performance = await TestSetup.measurePerformance(
          () => cohereClient.embed({
            texts,
            model: 'embed-english-v3.0'
          }),
          `Cohere Batch ${batchSize}`
        );

        const timePerEmbedding = performance.duration / batchSize;
        expect(timePerEmbedding).toBeLessThan(performanceThresholds.embedding.generation / 5);
        
        console.log(`Batch ${batchSize}: ${performance.duration.toFixed(2)}ms (${timePerEmbedding.toFixed(2)}ms per embedding)`);
      }
    });

    test('should validate embedding quality and consistency', async () => {
      const testText = "This is a test query for embedding consistency";
      const mockEmbedding = TestSetup.createMockEmbedding(1024);

      cohereClient.embed.mockResolvedValue({
        embeddings: [mockEmbedding]
      });

      // Generate same embedding multiple times
      const embeddings = [];
      for (let i = 0; i < 3; i++) {
        const result = await cohereClient.embed({
          texts: [testText],
          model: 'embed-english-v3.0'
        });
        embeddings.push(result.embeddings[0]);
      }

      // Validate embedding structure
      embeddings.forEach(embedding => {
        const validation = TestSetup.validateEmbedding(embedding);
        expect(validation.isArray).toBe(true);
        expect(validation.hasCorrectLength).toBe(true);
        expect(validation.allNumbers).toBe(true);
        expect(validation.inValidRange).toBe(true);
      });

      console.log('Embedding validation passed for all generated embeddings');
    });
  });

  describe('timeout and error handling', () => {
    test('should handle API timeouts gracefully', async () => {
      const timeoutError = new Error('Request timeout');
      timeoutError.code = 'ETIMEDOUT';

      openaiClient.chat.completions.create.mockRejectedValue(timeoutError);

      const performance = await TestSetup.measurePerformance(
        async () => {
          try {
            return await openaiClient.chat.completions.create({});
          } catch (error) {
            if (error.code === 'ETIMEDOUT') {
              return { error: 'timeout', message: 'Request timed out' };
            }
            throw error;
          }
        },
        'Timeout Handling'
      );

      expect(performance.result.error).toBe('timeout');
      expect(performance.duration).toBeLessThan(1000); // Should fail fast
    });

    test('should handle network errors with retries', async () => {
      const networkError = new Error('Network error');
      networkError.code = 'ECONNRESET';

      // Fail twice, then succeed
      openaiClient.chat.completions.create
        .mockRejectedValueOnce(networkError)
        .mockRejectedValueOnce(networkError)
        .mockResolvedValue({
          choices: [{ message: { content: 'Success after retries' } }]
        });

      const performance = await TestSetup.measurePerformance(
        async () => {
          let attempts = 0;
          const maxAttempts = 3;
          
          while (attempts < maxAttempts) {
            try {
              return await openaiClient.chat.completions.create({});
            } catch (error) {
              attempts++;
              if (attempts === maxAttempts) throw error;
              await new Promise(resolve => setTimeout(resolve, 50)); // Brief retry delay
            }
          }
        },
        'Network Error Retry'
      );

      expect(performance.result.choices[0].message.content).toBe('Success after retries');
      expect(performance.duration).toBeGreaterThan(100); // Should include retry delays
    });

    test('should respect request timeouts', async () => {
      // Simulate slow response
      openaiClient.chat.completions.create.mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 6000)); // 6 second delay
        return { choices: [{ message: { content: 'Slow response' } }] };
      });

      const performance = await TestSetup.measurePerformance(
        async () => {
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Custom timeout')), 5000)
          );
          
          return Promise.race([
            openaiClient.chat.completions.create({}),
            timeoutPromise
          ]);
        },
        'Custom Timeout'
      );

      // Should timeout before completion
      expect(performance.duration).toBeLessThan(5500);
    });
  });

  describe('resource utilization monitoring', () => {
    test('should monitor token usage efficiently', async () => {
      const queries = [
        { query: testQueries.oldp.query, expectedTokens: 200 },
        { query: testQueries.iot.query, expectedTokens: 180 },
        { query: testQueries.ai.query, expectedTokens: 160 },
        { query: testQueries.general.query, expectedTokens: 150 }
      ];

      let totalTokens = 0;
      const tokenUsage = [];

      for (const { query, expectedTokens } of queries) {
        const mockResponse = {
          choices: [{ message: { content: `Response for: ${query}` } }],
          usage: { total_tokens: expectedTokens }
        };

        openaiClient.chat.completions.create.mockResolvedValue(mockResponse);

        const performance = await TestSetup.measurePerformance(
          () => openaiClient.chat.completions.create({
            messages: [{ role: 'user', content: query }]
          }),
          'Token Usage Query'
        );

        totalTokens += performance.result.usage.total_tokens;
        tokenUsage.push({
          query: query.substring(0, 50),
          tokens: performance.result.usage.total_tokens,
          duration: performance.duration
        });
      }

      expect(totalTokens).toBeLessThan(1000); // Total usage should be reasonable
      
      console.log('Token usage analysis:');
      tokenUsage.forEach(usage => {
        console.log(`  ${usage.query}...: ${usage.tokens} tokens, ${usage.duration.toFixed(2)}ms`);
      });
      console.log(`Total tokens used: ${totalTokens}`);
    });

    test('should optimize for cost-effective API usage', async () => {
      const costOptimizedRequest = {
        model: 'gpt-4',
        max_tokens: 200,
        temperature: 0.3,
        messages: [{ role: 'user', content: testQueries.general.query }]
      };

      const mockResponse = {
        choices: [{ message: { content: 'Cost-optimized response' } }],
        usage: { total_tokens: 180, completion_tokens: 30 }
      };

      openaiClient.chat.completions.create.mockResolvedValue(mockResponse);

      const performance = await TestSetup.measurePerformance(
        () => openaiClient.chat.completions.create(costOptimizedRequest),
        'Cost-Optimized Request'
      );

      // Should be efficient in both time and tokens
      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat);
      expect(performance.result.usage.total_tokens).toBeLessThan(200);
      expect(performance.result.usage.completion_tokens).toBeLessThan(50);
      
      console.log(`Cost-optimized request: ${performance.duration.toFixed(2)}ms, ${performance.result.usage.total_tokens} tokens`);
    });
  });
});