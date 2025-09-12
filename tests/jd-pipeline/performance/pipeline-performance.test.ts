/**
 * Performance tests for JD Pipeline
 * Tests performance characteristics, memory usage, and scalability
 */

import { JDPipeline, createJDPipeline } from '../../../services/jd-pipeline/jd-pipeline';
import { JDFlowConfig } from '../../../services/jd-pipeline/types';
import { MemoryCache } from '../../../services/jd-pipeline/cache';
import { 
  MockAdapterFactory,
  createMockLLM, 
  createMockEmbedding,
  createMockRerank
} from '../../mocks/adapters';

describe('JD Pipeline Performance', () => {
  const PERFORMANCE_TIMEOUT = 30000; // 30 seconds for performance tests
  
  let performanceConfig: JDFlowConfig;

  beforeEach(() => {
    performanceConfig = {
      modelName: 'gpt-3.5-turbo',
      temperature: 0.1,
      topKAnn: 50, // Larger for performance testing
      keepAfterRerank: 20,
      evidenceTokenBudget: 3000,
      minCoveragePercent: 0.85,
      strictCoverage: false,
      cacheEnabled: true,
      cacheTTLSeconds: 3600,
      tokenHeadroom: 0.15
    };
  });

  describe('pipeline throughput', () => {
    it('should process JDs within performance thresholds', async () => {
      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(50),
        bm25: MockAdapterFactory.createRealisticVectorDB(30), // Reuse for BM25
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache: new MemoryCache(1000, 3600),
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      // Setup realistic mock responses
      mockAdapters.llm.complete
        .mockResolvedValueOnce({
          text: JSON.stringify({
            roleTitle: 'Senior Full Stack Developer',
            seniority: 'senior',
            mustHaves: ['React', 'Node.js', 'TypeScript', 'AWS', 'PostgreSQL'],
            topResponsibilities: ['Build features', 'Code review', 'Mentoring'],
            hardConstraints: [],
            conciseSummary: 'Senior full stack role with React and Node.js',
            rawHash: 'perf_test_123'
          }),
          tokensUsed: { prompt: 300, completion: 200 }
        })
        .mockResolvedValue({
          text: JSON.stringify(['Relevant experience line 1', 'Achievement line 2']),
          tokensUsed: { prompt: 150, completion: 100 }
        })
        .mockResolvedValueOnce({
          text: generateMockResume(),
          tokensUsed: { prompt: 1200, completion: 800 }
        });

      const pipeline = createJDPipeline(performanceConfig, mockAdapters);
      const sampleJD = generateComplexJD();

      const startTime = Date.now();
      const result = await pipeline.processJD(sampleJD);
      const endTime = Date.now();

      const processingTime = endTime - startTime;

      // Performance assertions
      expect(processingTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result).toBeDefined();
      expect(result.resumeMarkdown.length).toBeGreaterThan(500);
      
      // Verify telemetry was collected
      const metrics = (mockAdapters.telemetry as any).getMetrics();
      expect(metrics.timers['pipeline.total_ms']).toBeDefined();

      console.log(`Pipeline processed JD in ${processingTime}ms`);
    }, PERFORMANCE_TIMEOUT);

    it('should handle concurrent JD processing', async () => {
      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(30),
        bm25: MockAdapterFactory.createRealisticVectorDB(20),
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache: new MemoryCache(1000, 3600),
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      // Setup consistent mock responses
      setupConcurrentMocks(mockAdapters);

      const pipeline = createJDPipeline(performanceConfig, mockAdapters);
      const concurrentJDs = [
        'Backend Developer - Python/Django',
        'Frontend Developer - React/Vue',
        'DevOps Engineer - AWS/Docker',
        'Data Scientist - ML/AI',
        'Mobile Developer - React Native'
      ];

      const startTime = Date.now();
      
      // Process all JDs concurrently
      const promises = concurrentJDs.map(jd => pipeline.processJD(jd));
      const results = await Promise.all(promises);
      
      const endTime = Date.now();
      const totalTime = endTime - startTime;

      // All should complete successfully
      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(result).toBeDefined();
        expect(result.resumeMarkdown).toBeDefined();
      });

      // Concurrent processing should be faster than sequential
      expect(totalTime).toBeLessThan(15000); // 15 seconds for 5 concurrent JDs

      console.log(`Processed ${concurrentJDs.length} JDs concurrently in ${totalTime}ms`);
      console.log(`Average per JD: ${Math.round(totalTime / concurrentJDs.length)}ms`);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('memory usage', () => {
    it('should maintain reasonable memory usage during processing', async () => {
      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(100), // Large result set
        bm25: MockAdapterFactory.createRealisticVectorDB(50),
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache: new MemoryCache(2000, 1800), // Large cache
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      setupMemoryTestMocks(mockAdapters);

      const pipeline = createJDPipeline(performanceConfig, mockAdapters);

      // Measure memory before
      const memBefore = process.memoryUsage();
      
      // Process multiple JDs to test memory accumulation
      for (let i = 0; i < 10; i++) {
        await pipeline.processJD(`Software Engineer ${i} - Test JD with various requirements`);
        
        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }
      }

      // Measure memory after
      const memAfter = process.memoryUsage();
      
      const heapIncrease = memAfter.heapUsed - memBefore.heapUsed;
      const heapIncreaseMB = heapIncrease / (1024 * 1024);

      // Memory increase should be reasonable (less than 100MB for 10 JDs)
      expect(heapIncreaseB).toBeLessThan(100 * 1024 * 1024); // 100MB

      console.log(`Memory usage increase: ${heapIncreaseB.toFixed(2)}MB for 10 JDs`);
      console.log(`Average per JD: ${(heapIncreaseMB / 10).toFixed(2)}MB`);
    }, PERFORMANCE_TIMEOUT);

    it('should handle large evidence sets efficiently', async () => {
      const largeConfig = {
        ...performanceConfig,
        topKAnn: 200, // Very large retrieval
        keepAfterRerank: 100,
        evidenceTokenBudget: 8000
      };

      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(200),
        bm25: MockAdapterFactory.createRealisticVectorDB(100),
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache: new MemoryCache(500, 1800),
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      setupLargeDataMocks(mockAdapters);

      const pipeline = createJDPipeline(largeConfig, mockAdapters);
      const complexJD = generateVeryComplexJD();

      const startTime = Date.now();
      const memBefore = process.memoryUsage();

      const result = await pipeline.processJD(complexJD);

      const endTime = Date.now();
      const memAfter = process.memoryUsage();

      // Should still complete in reasonable time even with large data
      expect(endTime - startTime).toBeLessThan(20000); // 20 seconds
      
      // Memory usage should be controlled
      const memIncrease = (memAfter.heapUsed - memBefore.heapUsed) / (1024 * 1024);
      expect(memIncrease).toBeLessThan(200); // Less than 200MB for large processing

      expect(result).toBeDefined();
      expect(result.resumeMarkdown.length).toBeGreaterThan(1000);

      console.log(`Large data processing: ${endTime - startTime}ms, Memory: ${memIncrease.toFixed(2)}MB`);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('cache performance', () => {
    it('should significantly improve performance with cache hits', async () => {
      const cache = new MemoryCache(1000, 3600);
      
      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(50),
        bm25: MockAdapterFactory.createRealisticVectorDB(30),
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache,
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      setupCachingMocks(mockAdapters);

      const pipeline = createJDPipeline(performanceConfig, mockAdapters);
      const testJD = 'Senior React Developer - Frontend Specialist';

      // First request - cache miss
      const start1 = Date.now();
      await pipeline.processJD(testJD);
      const time1 = Date.now() - start1;

      // Second request - cache hit
      const start2 = Date.now();
      await pipeline.processJD(testJD);
      const time2 = Date.now() - start2;

      // Cache hit should be significantly faster
      expect(time2).toBeLessThan(time1 * 0.5); // At least 50% faster

      // Verify cache metrics
      const metrics = (mockAdapters.telemetry as any).getMetrics();
      expect(metrics.counters['cache.hit']).toBeGreaterThan(0);

      console.log(`Cache performance: First ${time1}ms, Second ${time2}ms (${Math.round((1 - time2/time1) * 100)}% improvement)`);
    }, PERFORMANCE_TIMEOUT);
  });

  describe('token budget performance', () => {
    it('should efficiently handle token budget optimization', async () => {
      const constrainedConfig = {
        ...performanceConfig,
        evidenceTokenBudget: 500, // Very constrained budget
        topKAnn: 100 // Large initial retrieval
      };

      const mockAdapters = {
        llm: createMockLLM(),
        vectorDB: MockAdapterFactory.createRealisticVectorDB(100),
        bm25: MockAdapterFactory.createRealisticVectorDB(50),
        embedding: createMockEmbedding(),
        rerank: createMockRerank(),
        cache: new MemoryCache(500, 1800),
        telemetry: MockAdapterFactory.createTrackingTelemetry()
      };

      setupBudgetOptimizationMocks(mockAdapters);

      const pipeline = createJDPipeline(constrainedConfig, mockAdapters);

      const startTime = Date.now();
      const result = await pipeline.processJD('Full Stack Developer - Complex Requirements');
      const endTime = Date.now();

      // Should handle budget constraints efficiently
      expect(endTime - startTime).toBeLessThan(8000); // 8 seconds
      expect(result).toBeDefined();
      
      // Budget utilization should be high but not exceed limits
      expect(result.metadata?.budgetUtilization).toBeLessThanOrEqual(0.9);

      console.log(`Budget-constrained processing: ${endTime - startTime}ms`);
      console.log(`Budget utilization: ${(result.metadata?.budgetUtilization || 0 * 100).toFixed(1)}%`);
    }, PERFORMANCE_TIMEOUT);
  });

  // Helper functions for setting up mocks
  function setupConcurrentMocks(adapters: any) {
    adapters.llm.complete
      .mockImplementation(async (system: string, user: string) => {
        // Simulate variable processing time
        await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
        
        if (user.includes('parse')) {
          return {
            text: JSON.stringify({
              roleTitle: 'Test Developer',
              mustHaves: ['Programming', 'Testing'],
              topResponsibilities: ['Code', 'Debug'],
              hardConstraints: [],
              conciseSummary: 'Test role',
              rawHash: `concurrent_${Date.now()}`
            }),
            tokensUsed: { prompt: 200, completion: 150 }
          };
        }
        
        return {
          text: generateMockResume(),
          tokensUsed: { prompt: 800, completion: 600 }
        };
      });
  }

  function setupMemoryTestMocks(adapters: any) {
    // Create larger mock responses to test memory usage
    adapters.llm.complete
      .mockResolvedValue({
        text: 'Large mock response content that would use significant memory',
        tokensUsed: { prompt: 500, completion: 400 }
      });
  }

  function setupLargeDataMocks(adapters: any) {
    adapters.llm.complete
      .mockImplementation(async () => {
        // Simulate processing large amounts of data
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          text: generateLargeMockResponse(),
          tokensUsed: { prompt: 2000, completion: 1500 }
        };
      });
  }

  function setupCachingMocks(adapters: any) {
    let callCount = 0;
    adapters.llm.complete
      .mockImplementation(async () => {
        callCount++;
        // Simulate realistic processing time only on first call
        if (callCount === 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        return {
          text: generateMockResume(),
          tokensUsed: { prompt: 600, completion: 400 }
        };
      });
  }

  function setupBudgetOptimizationMocks(adapters: any) {
    adapters.llm.complete
      .mockResolvedValue({
        text: JSON.stringify(['Optimized evidence line']),
        tokensUsed: { prompt: 100, completion: 50 }
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Full Stack Developer',
          mustHaves: ['Frontend', 'Backend', 'Database', 'Cloud', 'Testing'],
          topResponsibilities: ['Development', 'Architecture'],
          hardConstraints: [],
          conciseSummary: 'Full stack development role',
          rawHash: 'budget_test_456'
        }),
        tokensUsed: { prompt: 300, completion: 200 }
      });
  }

  function generateComplexJD(): string {
    return `
      Senior Full Stack Developer
      
      We are seeking an experienced Senior Full Stack Developer to join our growing technology team.
      
      Required Skills:
      - 5+ years React.js and TypeScript
      - 4+ years Node.js and Express
      - PostgreSQL and database design
      - AWS cloud services (EC2, S3, RDS)
      - Docker containerization
      - CI/CD pipelines
      - RESTful API development
      - GraphQL experience preferred
      
      Responsibilities:
      - Architect and build scalable web applications
      - Mentor junior developers
      - Code review and quality assurance
      - Performance optimization
      - Technical documentation
      - Cross-functional collaboration
      
      Nice to Have:
      - Kubernetes experience
      - Machine learning integration
      - Mobile development (React Native)
      - DevOps experience
      
      Salary: $130,000 - $170,000 + equity
      Remote work available
    `;
  }

  function generateVeryComplexJD(): string {
    return generateComplexJD() + `
      
      Additional Requirements:
      - Security clearance preferred
      - Financial services domain knowledge
      - Microservices architecture
      - Event-driven systems
      - Real-time data processing
      - High-frequency trading systems
      - Regulatory compliance (SOX, PCI)
      - Load testing and optimization
      - Multi-cloud deployment strategies
      - Advanced monitoring and observability
    `;
  }

  function generateMockResume(): string {
    return `
      # John Doe
      john.doe@email.com | (555) 123-4567 | LinkedIn: linkedin.com/in/johndoe
      
      ## Professional Summary
      Senior Full Stack Developer with 8+ years of experience building scalable web applications using React, Node.js, and cloud technologies.
      
      ## Professional Experience
      
      ### Senior Software Engineer at TechCorp (2020 - Present)
      - Built React-based dashboard serving 50k+ daily users
      - Optimized Node.js APIs reducing response time by 40%
      - Implemented CI/CD pipeline using Docker and AWS
      - Mentored team of 3 junior developers
      
      ### Software Engineer at StartupInc (2018 - 2020)
      - Developed full-stack applications using MERN stack
      - Designed PostgreSQL schemas for complex data models
      - Integrated third-party APIs and payment systems
      
      ## Technical Skills
      **Languages:** JavaScript, TypeScript, Python, SQL
      **Frontend:** React, Vue.js, HTML5, CSS3, Redux
      **Backend:** Node.js, Express, Django, REST APIs
      **Databases:** PostgreSQL, MongoDB, Redis
      **Cloud:** AWS (EC2, S3, RDS), Docker, Kubernetes
      **Tools:** Git, Jest, Webpack, Jenkins
      
      ## Education
      Bachelor of Science in Computer Science
      University of Technology, 2017
    `;
  }

  function generateLargeMockResponse(): string {
    const baseResume = generateMockResume();
    // Repeat content to simulate large responses
    return baseResume + '\n'.repeat(10) + baseResume + '\n'.repeat(10) + baseResume;
  }
});