/**
 * End-to-end integration tests for JD Pipeline
 * Tests complete pipeline flow from raw JD to final resume
 */

import { JDPipeline, createJDPipeline } from '../../../services/jd-pipeline/jd-pipeline';
import { JDFlowConfig } from '../../../services/jd-pipeline/types';
import { 
  createMockLLM, 
  createMockVectorDB, 
  createMockBM25,
  createMockEmbedding,
  createMockRerank,
  createMockTelemetry 
} from '../../mocks/adapters';
import { MemoryCache } from '../../../services/jd-pipeline/cache';

describe('JD Pipeline E2E', () => {
  let pipeline: JDPipeline;
  let mockAdapters: any;
  let config: JDFlowConfig;

  beforeEach(() => {
    config = {
      modelName: 'gpt-3.5-turbo',
      temperature: 0.1,
      topKAnn: 10,
      keepAfterRerank: 5,
      evidenceTokenBudget: 1500,
      minCoveragePercent: 0.95,
      strictCoverage: false,
      cacheEnabled: true,
      cacheTTLSeconds: 1800,
      tokenHeadroom: 0.15
    };

    mockAdapters = {
      llm: createMockLLM(),
      vectorDB: createMockVectorDB(),
      bm25: createMockBM25(),
      embedding: createMockEmbedding(),
      rerank: createMockRerank(),
      cache: new MemoryCache(100, 1800),
      telemetry: createMockTelemetry()
    };

    // Setup mock responses for complete pipeline flow
    setupMockResponses();

    pipeline = createJDPipeline(config, mockAdapters);
  });

  const setupMockResponses = () => {
    // JD Parser mock response
    mockAdapters.llm.complete
      .mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Senior Python Developer',
          seniority: 'senior',
          domain: ['backend development'],
          mustHaves: ['Python', 'Django', 'PostgreSQL', 'AWS', 'REST APIs'],
          topResponsibilities: ['Build web applications', 'Design APIs', 'Database optimization'],
          hardConstraints: [],
          conciseSummary: 'Senior Python developer with Django and AWS experience',
          rawHash: 'test_hash_123'
        }),
        tokensUsed: { prompt: 200, completion: 150 }
      })
      // Evidence compression mock responses
      .mockResolvedValue({
        text: JSON.stringify([
          'Built scalable Django applications serving 100k+ users',
          'Optimized PostgreSQL queries reducing load time by 40%',
          'Deployed microservices on AWS using Docker and ECS'
        ]),
        tokensUsed: { prompt: 100, completion: 80 }
      })
      // Resume generation mock response
      .mockResolvedValueOnce({
        text: `# John Doe
john.doe@email.com | (555) 123-4567

## Professional Summary
Senior Python developer with 6+ years experience building scalable web applications using Django and AWS.

## Professional Experience
### Senior Software Engineer at TechCorp (2020 - Present)
<!-- evidence:chunk_1 -->
- Built scalable Django applications serving 100k+ users
<!-- evidence:chunk_2 -->
- Optimized PostgreSQL queries reducing load time by 40%
<!-- evidence:chunk_3 -->
- Deployed microservices on AWS using Docker and ECS

## Technical Skills
**Languages:** Python, JavaScript, SQL
**Frameworks:** Django, React
**Cloud:** AWS, Docker
**Databases:** PostgreSQL, Redis`,
        tokensUsed: { prompt: 800, completion: 400 }
      });

    // Embedding mock
    mockAdapters.embedding.embed.mockResolvedValue(
      Array(1024).fill(0).map(() => Math.random())
    );

    // Vector DB mock
    mockAdapters.vectorDB.search.mockResolvedValue([
      {
        chunk: {
          id: 'chunk_1',
          text: 'Built scalable Django applications serving 100k+ users at TechCorp',
          meta: { role: 'Senior Software Engineer', skills: ['Python', 'Django'], company: 'TechCorp' }
        },
        score: 0.89,
        retrievalMethod: 'dense'
      },
      {
        chunk: {
          id: 'chunk_2',
          text: 'Optimized PostgreSQL database queries reducing average load time by 40%',
          meta: { role: 'Database Developer', skills: ['PostgreSQL', 'SQL'], company: 'TechCorp' }
        },
        score: 0.82,
        retrievalMethod: 'dense'
      }
    ]);

    // BM25 mock
    mockAdapters.bm25.search.mockResolvedValue([
      {
        chunk: {
          id: 'chunk_3',
          text: 'Deployed microservices on AWS using Docker containers and ECS orchestration',
          meta: { role: 'DevOps Engineer', skills: ['AWS', 'Docker'], company: 'CloudStart' }
        },
        score: 0.76,
        retrievalMethod: 'bm25'
      }
    ]);

    // Reranker mock
    mockAdapters.rerank.rerank.mockResolvedValue([
      { index: 0, score: 0.95 },
      { index: 1, score: 0.88 },
      { index: 2, score: 0.82 }
    ]);
  };

  describe('complete pipeline flow', () => {
    it('should process JD successfully with high coverage', async () => {
      const rawJD = `
        Senior Python Developer
        
        We are seeking a Senior Python Developer to join our backend team.
        
        Required Skills:
        - 5+ years Python experience
        - Django framework expertise
        - PostgreSQL database experience
        - AWS cloud platform
        - REST API development
        
        Responsibilities:
        - Build scalable web applications
        - Design and implement APIs
        - Optimize database performance
        - Deploy to production
        
        Salary: $120,000 - $150,000
      `;

      const result = await pipeline.processJD(rawJD, 'user_123');

      // Verify pipeline completed successfully
      expect(result).toBeDefined();
      expect(result.resumeMarkdown).toContain('John Doe');
      expect(result.resumeMarkdown).toContain('Senior Python developer');
      expect(result.resumeMarkdown).toContain('Django applications');
      expect(result.resumeMarkdown).toContain('PostgreSQL queries');
      expect(result.resumeMarkdown).toContain('AWS using Docker');

      // Verify coverage
      expect(result.coverageReport).toBeDefined();
      const coveredRequirements = result.coverageReport.filter(r => r.present);
      expect(coveredRequirements.length).toBeGreaterThanOrEqual(4); // Most requirements covered

      // Verify metadata
      expect(result.metadata?.userId).toBe('user_123');
      expect(result.metadata?.processingTimeMs).toBeGreaterThan(0);
      expect(result.metadata?.coveragePercent).toBeGreaterThan(0.8);

      // Verify telemetry was called
      expect(mockAdapters.telemetry.counter).toHaveBeenCalledWith('pipeline.start', 1, { userId: 'user_123' });
      expect(mockAdapters.telemetry.counter).toHaveBeenCalledWith('pipeline.success', 1, { userId: 'user_123' });
      expect(mockAdapters.telemetry.timer).toHaveBeenCalledWith('pipeline.total_ms', expect.any(Number));
    });

    it('should handle budget constraints gracefully', async () => {
      // Use very tight budget
      const tightConfig = { 
        ...config, 
        evidenceTokenBudget: 100, // Very small budget
        tokenHeadroom: 0.05
      };

      const tightPipeline = createJDPipeline(tightConfig, mockAdapters);

      const rawJD = `
        Full Stack Developer
        
        Requirements:
        - React.js
        - Node.js
        - MongoDB
        - Docker
      `;

      const result = await tightPipeline.processJD(rawJD);

      // Should still complete but with reduced evidence
      expect(result).toBeDefined();
      expect(result.resumeMarkdown).toBeDefined();
      
      // Budget utilization should be tracked
      expect(result.metadata?.budgetUtilization).toBeDefined();
      expect(mockAdapters.telemetry.gauge).toHaveBeenCalledWith(
        'budget.utilization', 
        expect.any(Number)
      );
    });

    it('should handle low coverage scenarios', async () => {
      // Mock scenario with low coverage
      mockAdapters.vectorDB.search.mockResolvedValueOnce([
        {
          chunk: {
            id: 'irrelevant_chunk',
            text: 'Generic software development experience',
            meta: { role: 'Developer', skills: ['Programming'] }
          },
          score: 0.45,
          retrievalMethod: 'dense'
        }
      ]);

      mockAdapters.bm25.search.mockResolvedValueOnce([]);

      const rawJD = `
        Specialized Blockchain Developer
        
        Must have:
        - Solidity programming
        - Smart contract development
        - Web3.js experience
        - DeFi protocols
        - Ethereum blockchain
      `;

      const result = await pipeline.processJD(rawJD);

      // Should still generate resume but log coverage warning
      expect(result).toBeDefined();
      expect(result.coverageReport).toBeDefined();
      
      const coveragePercent = result.coverageReport.filter(c => c.present).length 
        / result.coverageReport.length;
      expect(coveragePercent).toBeLessThan(0.5);

      // Should not throw error with non-strict coverage
      expect(result.resumeMarkdown).toBeDefined();
    });

    it('should handle strict coverage requirements', async () => {
      const strictConfig = { ...config, strictCoverage: true, minCoveragePercent: 0.95 };
      const strictPipeline = createJDPipeline(strictConfig, mockAdapters);

      // Mock low coverage scenario
      mockAdapters.llm.complete.mockReset();
      mockAdapters.llm.complete
        .mockResolvedValueOnce({
          text: JSON.stringify({
            roleTitle: 'Quantum Computing Specialist',
            mustHaves: ['Quantum algorithms', 'Qiskit', 'Linear algebra', 'Python', 'Research'],
            topResponsibilities: ['Develop quantum algorithms'],
            hardConstraints: ['PhD in Physics'],
            conciseSummary: 'Quantum computing research role',
            rawHash: 'quantum_123'
          }),
          tokensUsed: { prompt: 150, completion: 100 }
        })
        .mockResolvedValueOnce({
          text: `# Resume with minimal quantum content
          Software developer with Python experience.`,
          tokensUsed: { prompt: 500, completion: 200 }
        });

      const rawJD = `
        Quantum Computing Specialist
        Must have quantum algorithms and Qiskit experience.
      `;

      await expect(strictPipeline.processJD(rawJD)).rejects.toThrow('Insufficient coverage');
    });

    it('should use caching effectively', async () => {
      const rawJD = `
        React Developer Position
        Requirements: React, JavaScript, CSS
      `;

      // First call - should hit all services
      const result1 = await pipeline.processJD(rawJD);
      expect(result1).toBeDefined();

      const initialLLMCalls = mockAdapters.llm.complete.mock.calls.length;
      const initialVectorCalls = mockAdapters.vectorDB.search.mock.calls.length;

      // Second call with same JD - should use cache
      const result2 = await pipeline.processJD(rawJD);
      expect(result2).toBeDefined();

      // Should have fewer service calls due to caching
      expect(mockAdapters.llm.complete.mock.calls.length).toBeLessThanOrEqual(initialLLMCalls + 1);
      expect(mockAdapters.telemetry.counter).toHaveBeenCalledWith('cache.hit', expect.any(Number));
    });

    it('should handle service failures gracefully', async () => {
      // Mock embedding service failure
      mockAdapters.embedding.embed.mockRejectedValueOnce(new Error('Embedding service down'));

      const rawJD = 'Software Engineer Position';

      await expect(pipeline.processJD(rawJD)).rejects.toThrow('Hybrid retrieval failed');

      // Should track error telemetry
      expect(mockAdapters.telemetry.counter).toHaveBeenCalledWith(
        'pipeline.error',
        1,
        expect.objectContaining({
          errorType: 'RETRIEVAL_ERROR'
        })
      );
    });

    it('should generate session metadata correctly', async () => {
      const rawJD = 'Data Scientist Role';

      const result = await pipeline.processJD(rawJD, 'data_user_456');

      expect(result.metadata?.sessionId).toMatch(/^jd_\d+_[a-z0-9]{9}$/);
      expect(result.metadata?.userId).toBe('data_user_456');
      expect(result.metadata?.processingTimeMs).toBeGreaterThan(0);
      expect(result.metadata?.budgetUtilization).toBeDefined();
    });
  });

  describe('health checks', () => {
    it('should report healthy status when all services work', async () => {
      const health = await pipeline.getHealthStatus();

      expect(health.status).toBe('healthy');
      expect(health.checks.llm).toBe(true);
      expect(health.checks.vectorDB).toBe(true);
      expect(health.checks.embedding).toBe(true);
      expect(health.timestamp).toBeInstanceOf(Date);
    });

    it('should report degraded status with partial failures', async () => {
      // Mock one service failure
      mockAdapters.vectorDB.search.mockRejectedValueOnce(new Error('DB timeout'));

      const health = await pipeline.getHealthStatus();

      expect(health.status).toBe('degraded');
      expect(health.checks.vectorDB).toBe(false);
      expect(health.checks.llm).toBe(true); // Others should still work
    });

    it('should report unhealthy with major failures', async () => {
      // Mock multiple service failures
      mockAdapters.llm.complete.mockRejectedValue(new Error('LLM down'));
      mockAdapters.embedding.embed.mockRejectedValue(new Error('Embedding down'));

      const health = await pipeline.getHealthStatus();

      expect(health.status).toBe('unhealthy');
      expect(health.checks.llm).toBe(false);
      expect(health.checks.embedding).toBe(false);
    });
  });

  describe('metrics collection', () => {
    it('should collect comprehensive metrics', () => {
      const metrics = pipeline.getMetrics();

      expect(metrics.config).toEqual(config);
      expect(metrics.modelLimits).toBeDefined();
      expect(metrics.modelLimits.contextLimit).toBeGreaterThan(0);
      expect(metrics.uptime).toBeGreaterThan(0);
    });

    it('should adapt to different model configurations', () => {
      const gpt4Config = { ...config, modelName: 'gpt-4' };
      const gpt4Pipeline = createJDPipeline(gpt4Config, mockAdapters);

      const metrics = gpt4Pipeline.getMetrics();
      expect(metrics.modelLimits.contextLimit).toBe(8192); // GPT-4 limit
    });
  });
});