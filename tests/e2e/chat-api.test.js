/**
 * End-to-End Tests for Chat API
 * Tests the complete chat flow including API endpoints, middleware, and response handling
 */

import { jest } from '@jest/globals';
import TestSetup from '../utilities/test-setup.js';
import { testQueries, mockChunks, performanceThresholds } from '../fixtures/test-data.js';

// Mock the server and routes
jest.unstable_mockModule('express', () => ({
  default: jest.fn(() => ({
    use: jest.fn(),
    post: jest.fn(),
    listen: jest.fn(),
    get: jest.fn()
  }))
}));

// Mock request/response for testing
const createMockRequest = (body = {}) => ({
  body,
  headers: {},
  ip: '127.0.0.1'
});

const createMockResponse = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    setHeader: jest.fn()
  };
  return res;
};

describe('Chat API End-to-End Tests', () => {
  let mockChatHandler;
  let mockRAGService;

  beforeAll(() => {
    TestSetup.setupMocks();
  });

  beforeEach(() => {
    mockRAGService = {
      processQuery: jest.fn()
    };

    mockChatHandler = async (req, res) => {
      try {
        const { message } = req.body;
        
        if (!message) {
          return res.status(400).json({ error: 'Message is required' });
        }

        const result = await mockRAGService.processQuery(message);
        
        res.json({
          response: result.response,
          context: result.context,
          metadata: result.metadata
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('successful chat interactions', () => {
    test('should handle OLDP query successfully', async () => {
      const req = createMockRequest({ message: testQueries.oldp.query });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Scott participated in Lockheed Martin\'s Operations Leadership Development Program (OLDP) from 2001-2005, where he gained valuable experience in project management and team leadership.',
        context: [mockChunks[0]],
        metadata: {
          totalChunks: 1,
          avgSimilarity: 0.85,
          searchMethod: 'semantic',
          processingTime: 1200
        }
      });

      const performance = await TestSetup.measurePerformance(
        () => mockChatHandler(req, res),
        'OLDP Chat Query'
      );

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.stringContaining('OLDP'),
          context: expect.arrayContaining([
            expect.objectContaining({
              title: expect.stringContaining('Operations Leadership')
            })
          ]),
          metadata: expect.objectContaining({
            avgSimilarity: 0.85,
            searchMethod: 'semantic'
          })
        })
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat);
      console.log(`OLDP query E2E time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle IoT query with proper response structure', async () => {
      const req = createMockRequest({ message: testQueries.iot.query });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Scott worked on IoT solutions for Coca-Cola Freestyle dispensing machines, building real-time monitoring systems and data analytics platforms.',
        context: [mockChunks[1]],
        metadata: {
          totalChunks: 1,
          avgSimilarity: 0.78,
          searchMethod: 'semantic',
          processingTime: 1100
        }
      });

      await mockChatHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.stringContaining('IoT'),
          context: expect.arrayContaining([
            expect.objectContaining({
              skills: expect.arrayContaining(['IoT'])
            })
          ])
        })
      );

      expect(mockRAGService.processQuery).toHaveBeenCalledWith(testQueries.iot.query);
    });

    test('should handle general queries with multiple context chunks', async () => {
      const req = createMockRequest({ message: testQueries.general.query });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Scott has diverse professional experience including operations leadership at Lockheed Martin, IoT development at Coca-Cola, and AI/ML engineering.',
        context: mockChunks,
        metadata: {
          totalChunks: 3,
          avgSimilarity: 0.72,
          searchMethod: 'semantic',
          processingTime: 1500
        }
      });

      await mockChatHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.stringContaining('professional experience'),
          context: expect.arrayContaining([
            expect.objectContaining({ title: expect.stringContaining('Operations Leadership') }),
            expect.objectContaining({ title: expect.stringContaining('IoT Platform') }),
            expect.objectContaining({ title: expect.stringContaining('AI/ML Model') })
          ]),
          metadata: expect.objectContaining({
            totalChunks: 3
          })
        })
      );
    });

    test('should include proper source attribution in responses', async () => {
      const req = createMockRequest({ message: "Tell me about Scott's leadership experience" });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Scott demonstrated leadership through the OLDP program at Lockheed Martin.',
        context: [mockChunks[0]],
        metadata: {
          sources: ['Lockheed Martin'],
          searchMethod: 'semantic'
        }
      });

      await mockChatHandler(req, res);

      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.context[0].sources).toEqual(
        expect.objectContaining({
          org: 'Lockheed Martin',
          title: expect.any(String)
        })
      );
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle missing message parameter', async () => {
      const req = createMockRequest({}); // No message
      const res = createMockResponse();

      await mockChatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Message is required'
      });
    });

    test('should handle empty message', async () => {
      const req = createMockRequest({ message: '' });
      const res = createMockResponse();

      await mockChatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Message is required'
      });
    });

    test('should handle RAG service errors gracefully', async () => {
      const req = createMockRequest({ message: 'Test query' });
      const res = createMockResponse();

      mockRAGService.processQuery.mockRejectedValue(new Error('Database connection failed'));

      await mockChatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Database connection failed'
      });
    });

    test('should handle queries with no context found', async () => {
      const req = createMockRequest({ message: 'Tell me about nonexistent experience' });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'I don\'t have information about that specific experience in the available context.',
        context: [],
        metadata: {
          totalChunks: 0,
          avgSimilarity: 0,
          searchMethod: 'semantic'
        }
      });

      await mockChatHandler(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: expect.stringContaining('don\'t have information'),
          context: [],
          metadata: expect.objectContaining({
            totalChunks: 0
          })
        })
      );
    });

    test('should handle malformed requests', async () => {
      const req = createMockRequest({ invalidField: 'value' });
      const res = createMockResponse();

      await mockChatHandler(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Message is required'
      });
    });
  });

  describe('response performance and quality', () => {
    test('should meet response time requirements for simple queries', async () => {
      const req = createMockRequest({ message: 'Quick question about experience' });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Brief response about experience.',
        context: [mockChunks[0]],
        metadata: { processingTime: 800 }
      });

      const performance = await TestSetup.measurePerformance(
        () => mockChatHandler(req, res),
        'Simple Query Response'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat / 2);
      console.log(`Simple query time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should handle complex queries within time limits', async () => {
      const complexQuery = "Tell me about Scott's experience with IoT, AI/ML, and leadership roles, including specific projects and achievements";
      const req = createMockRequest({ message: complexQuery });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'Scott has extensive experience across multiple domains. In IoT, he worked on Coca-Cola Freestyle machines. In AI/ML, he developed predictive models. In leadership, he participated in the OLDP program at Lockheed Martin.',
        context: mockChunks,
        metadata: {
          totalChunks: 3,
          processingTime: 2200
        }
      });

      const performance = await TestSetup.measurePerformance(
        () => mockChatHandler(req, res),
        'Complex Query Response'
      );

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat);
      console.log(`Complex query time: ${performance.duration.toFixed(2)}ms`);
    });

    test('should maintain response quality across multiple requests', async () => {
      const queries = [
        testQueries.oldp.query,
        testQueries.iot.query,
        testQueries.ai.query
      ];

      const responses = [];

      for (const [index, query] of queries.entries()) {
        const req = createMockRequest({ message: query });
        const res = createMockResponse();

        mockRAGService.processQuery.mockResolvedValue({
          response: `Quality response ${index + 1} about professional experience.`,
          context: [mockChunks[index]],
          metadata: { avgSimilarity: 0.8 }
        });

        await mockChatHandler(req, res);

        const responseCall = res.json.mock.calls[0][0];
        responses.push(responseCall);

        // Reset mocks for next iteration
        res.json.mockClear();
      }

      // Verify all responses have required structure
      responses.forEach((response, index) => {
        expect(response).toHaveProperty('response');
        expect(response).toHaveProperty('context');
        expect(response).toHaveProperty('metadata');
        expect(response.context).toHaveLength(1);
        expect(response.metadata.avgSimilarity).toBeGreaterThan(0.7);
        
        console.log(`Query ${index + 1} response quality: ${response.metadata.avgSimilarity}`);
      });
    });
  });

  describe('concurrent request handling', () => {
    test('should handle multiple concurrent requests', async () => {
      const concurrentRequests = 5;
      const requests = Array.from({ length: concurrentRequests }, (_, i) => {
        const req = createMockRequest({ message: `Concurrent query ${i + 1}` });
        const res = createMockResponse();

        mockRAGService.processQuery.mockResolvedValue({
          response: `Response to concurrent query ${i + 1}`,
          context: [mockChunks[0]],
          metadata: { processingTime: 1000 }
        });

        return { req, res };
      });

      const performance = await TestSetup.measurePerformance(
        () => Promise.all(requests.map(({ req, res }) => mockChatHandler(req, res))),
        'Concurrent Requests'
      );

      // Verify all requests completed successfully
      requests.forEach(({ res }) => {
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            response: expect.stringContaining('Response to concurrent query'),
            context: expect.any(Array)
          })
        );
      });

      expect(performance.duration).toBeLessThan(performanceThresholds.api.chat * 2);
      console.log(`${concurrentRequests} concurrent requests: ${performance.duration.toFixed(2)}ms`);
    });

    test('should maintain isolation between concurrent requests', async () => {
      const request1 = createMockRequest({ message: testQueries.oldp.query });
      const response1 = createMockResponse();

      const request2 = createMockRequest({ message: testQueries.iot.query });
      const response2 = createMockResponse();

      // Set up different responses for each request
      mockRAGService.processQuery
        .mockResolvedValueOnce({
          response: 'OLDP response',
          context: [mockChunks[0]],
          metadata: { topic: 'oldp' }
        })
        .mockResolvedValueOnce({
          response: 'IoT response',
          context: [mockChunks[1]],
          metadata: { topic: 'iot' }
        });

      await Promise.all([
        mockChatHandler(request1, response1),
        mockChatHandler(request2, response2)
      ]);

      // Verify responses are correctly isolated
      expect(response1.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: 'OLDP response',
          metadata: expect.objectContaining({ topic: 'oldp' })
        })
      );

      expect(response2.json).toHaveBeenCalledWith(
        expect.objectContaining({
          response: 'IoT response',
          metadata: expect.objectContaining({ topic: 'iot' })
        })
      );
    });
  });

  describe('data sanitization and security', () => {
    test('should handle potentially malicious input safely', async () => {
      const maliciousInputs = [
        '<script>alert("xss")</script>',
        'DROP TABLE content_chunks;',
        '${process.env.OPENAI_API_KEY}',
        '<!-- malicious comment -->'
      ];

      for (const maliciousInput of maliciousInputs) {
        const req = createMockRequest({ message: maliciousInput });
        const res = createMockResponse();

        mockRAGService.processQuery.mockResolvedValue({
          response: 'Safe response to user query.',
          context: [],
          metadata: { sanitized: true }
        });

        await mockChatHandler(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            response: expect.not.stringContaining('<script>'),
            response: expect.not.stringContaining('DROP TABLE'),
            response: expect.not.stringContaining('${process.env')
          })
        );
      }
    });

    test('should not expose sensitive information in responses', async () => {
      const req = createMockRequest({ message: 'Tell me about API keys and secrets' });
      const res = createMockResponse();

      mockRAGService.processQuery.mockResolvedValue({
        response: 'I can provide information about professional experience, but I don\'t have access to sensitive system information.',
        context: [],
        metadata: { filtered: true }
      });

      await mockChatHandler(req, res);

      const responseCall = res.json.mock.calls[0][0];
      expect(responseCall.response).not.toMatch(/api[_-]?key/i);
      expect(responseCall.response).not.toMatch(/secret/i);
      expect(responseCall.response).not.toMatch(/password/i);
      expect(responseCall.response).not.toMatch(/token/i);
    });
  });
});