/**
 * Mock adapters for testing JD Pipeline components
 * Provides consistent, controllable test doubles for all external dependencies
 */

import {
  LLMAdapter,
  VectorDBAdapter,
  BM25Adapter,
  EmbeddingAdapter,
  RerankAdapter,
  CacheAdapter,
  TelemetryAdapter,
  RetrievedItem,
  EvidenceChunk
} from '../../services/jd-pipeline/types';

/**
 * Mock LLM Adapter
 */
export function createMockLLM(): jest.Mocked<LLMAdapter> {
  return {
    complete: jest.fn().mockResolvedValue({
      text: 'Mock LLM response',
      tokensUsed: { prompt: 100, completion: 50 }
    })
  };
}

/**
 * Mock Vector Database Adapter
 */
export function createMockVectorDB(): jest.Mocked<VectorDBAdapter> {
  return {
    search: jest.fn().mockResolvedValue([
      {
        chunk: {
          id: 'mock_chunk_1',
          text: 'Mock chunk content with relevant experience',
          meta: {
            role: 'Software Engineer',
            skills: ['JavaScript', 'React'],
            company: 'TechCorp',
            startDate: '2020-01-01',
            endDate: '2023-01-01'
          }
        },
        score: 0.85,
        retrievalMethod: 'dense'
      },
      {
        chunk: {
          id: 'mock_chunk_2',
          text: 'Another mock chunk with backend experience',
          meta: {
            role: 'Backend Developer',
            skills: ['Python', 'Django', 'PostgreSQL'],
            company: 'DataCorp',
            startDate: '2019-01-01',
            endDate: '2022-01-01'
          }
        },
        score: 0.78,
        retrievalMethod: 'dense'
      }
    ])
  };
}

/**
 * Mock BM25 Search Adapter
 */
export function createMockBM25(): jest.Mocked<BM25Adapter> {
  return {
    search: jest.fn().mockResolvedValue([
      {
        chunk: {
          id: 'bm25_chunk_1',
          text: 'Full-stack development with modern frameworks',
          meta: {
            role: 'Full Stack Developer',
            skills: ['Node.js', 'Vue.js', 'MySQL'],
            company: 'WebStartup'
          }
        },
        score: 0.72,
        retrievalMethod: 'bm25'
      }
    ])
  };
}

/**
 * Mock Embedding Adapter
 */
export function createMockEmbedding(): jest.Mocked<EmbeddingAdapter> {
  return {
    embed: jest.fn().mockResolvedValue(
      // Return 1024-dimensional mock embedding
      Array(1024).fill(0).map((_, i) => Math.sin(i * 0.01))
    )
  };
}

/**
 * Mock Rerank Adapter
 */
export function createMockRerank(): jest.Mocked<RerankAdapter> {
  return {
    rerank: jest.fn().mockResolvedValue([
      { index: 0, score: 0.92 },
      { index: 1, score: 0.88 },
      { index: 2, score: 0.81 }
    ])
  };
}

/**
 * Mock Cache Adapter
 */
export function createMockCache(): jest.Mocked<CacheAdapter> {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
    del: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined)
  };
}

/**
 * Mock Telemetry Adapter
 */
export function createMockTelemetry(): jest.Mocked<TelemetryAdapter> {
  return {
    counter: jest.fn(),
    gauge: jest.fn(),
    timer: jest.fn(),
    histogram: jest.fn(),
    log: jest.fn()
  };
}

/**
 * Create mock retrieved items for testing
 */
export function createMockRetrievedItems(count: number = 3): RetrievedItem[] {
  return Array.from({ length: count }, (_, i) => ({
    chunk: {
      id: `mock_chunk_${i}`,
      text: `Mock chunk ${i} with relevant professional experience and skills`,
      meta: {
        role: i % 2 === 0 ? 'Software Engineer' : 'Data Scientist',
        skills: i % 2 === 0 ? ['JavaScript', 'React'] : ['Python', 'ML'],
        company: `Company${i}`,
        startDate: `202${i}-01-01`,
        endDate: `202${i + 1}-01-01`,
        achievements: [`Achievement ${i}`],
        metrics: [`${(i + 1) * 10}% improvement`]
      }
    },
    score: 0.9 - (i * 0.1),
    retrievalMethod: i % 2 === 0 ? 'dense' : 'bm25'
  }));
}

/**
 * Create mock evidence chunks
 */
export function createMockEvidenceChunks(count: number = 5): EvidenceChunk[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evidence_chunk_${i}`,
    text: `Evidence chunk ${i} containing detailed work experience and accomplishments`,
    meta: {
      role: `Role ${i}`,
      skills: [`Skill${i}A`, `Skill${i}B`],
      company: `Company ${i}`,
      startDate: `202${i}-01-01`,
      endDate: `202${i + 1}-01-01`,
      achievements: [`Major achievement ${i}`, `Key contribution ${i}`],
      metrics: [`${i * 25}% performance increase`, `$${i * 100}K cost savings`],
      technologies: [`Tech${i}`, `Framework${i}`],
      teamSize: i + 3,
      budget: (i + 1) * 500000,
      industry: i % 2 === 0 ? 'Technology' : 'Finance'
    }
  }));
}

/**
 * Advanced mock factory for complex testing scenarios
 */
export class MockAdapterFactory {
  /**
   * Create LLM mock that simulates parsing failures
   */
  static createFailingLLM(failureRate: number = 0.5): jest.Mocked<LLMAdapter> {
    const mock = createMockLLM();
    
    let callCount = 0;
    mock.complete.mockImplementation(async () => {
      callCount++;
      if (Math.random() < failureRate) {
        throw new Error(`Mock LLM failure on call ${callCount}`);
      }
      
      return {
        text: `Mock response ${callCount}`,
        tokensUsed: { prompt: 50 + callCount, completion: 25 + callCount }
      };
    });
    
    return mock;
  }

  /**
   * Create VectorDB mock with realistic score distribution
   */
  static createRealisticVectorDB(numResults: number = 10): jest.Mocked<VectorDBAdapter> {
    const mock = createMockVectorDB();
    
    mock.search.mockImplementation(async (embedding, topK, filters) => {
      const results: RetrievedItem[] = [];
      const actualK = Math.min(topK, numResults);
      
      for (let i = 0; i < actualK; i++) {
        // Realistic score decay
        const score = 0.95 - (i * 0.08) + (Math.random() * 0.05);
        
        results.push({
          chunk: {
            id: `realistic_chunk_${i}`,
            text: `Realistic chunk ${i} with domain-specific content and professional experience`,
            meta: {
              role: i < 3 ? 'Senior Engineer' : 'Engineer',
              skills: [`Skill${i % 5}`, `Tool${i % 3}`],
              company: `Company${Math.floor(i / 3)}`,
              startDate: `20${18 + i % 5}-01-01`,
              relevanceScore: score,
              domain: filters?.domain || ['software']
            }
          },
          score,
          retrievalMethod: 'dense'
        });
      }
      
      return results.sort((a, b) => b.score - a.score);
    });
    
    return mock;
  }

  /**
   * Create cache mock with realistic hit/miss behavior
   */
  static createRealisticCache(hitRate: number = 0.7): jest.Mocked<CacheAdapter> {
    const mock = createMockCache();
    const cache = new Map<string, { data: any; expiry: number }>();
    
    mock.get.mockImplementation(async (key) => {
      const entry = cache.get(key);
      
      if (!entry || Date.now() > entry.expiry) {
        cache.delete(key);
        return null;
      }
      
      // Simulate cache miss rate
      if (Math.random() > hitRate) {
        return null;
      }
      
      return entry.data;
    });
    
    mock.set.mockImplementation(async (key, data, ttl = 3600) => {
      cache.set(key, {
        data,
        expiry: Date.now() + (ttl * 1000)
      });
    });
    
    mock.del.mockImplementation(async (key) => {
      cache.delete(key);
    });
    
    mock.clear.mockImplementation(async () => {
      cache.clear();
    });
    
    return mock;
  }

  /**
   * Create telemetry mock that tracks all calls
   */
  static createTrackingTelemetry(): jest.Mocked<TelemetryAdapter> & {
    getCalls: () => Array<{ method: string; name: string; value: number; tags?: any }>;
    getMetrics: () => Record<string, any>;
  } {
    const mock = createMockTelemetry();
    const calls: Array<{ method: string; name: string; value: number; tags?: any }> = [];
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const timers: Record<string, number[]> = {};
    
    mock.counter.mockImplementation((name, value = 1, tags) => {
      calls.push({ method: 'counter', name, value, tags });
      counters[name] = (counters[name] || 0) + value;
    });
    
    mock.gauge.mockImplementation((name, value, tags) => {
      calls.push({ method: 'gauge', name, value, tags });
      gauges[name] = value;
    });
    
    mock.timer.mockImplementation((name, value, tags) => {
      calls.push({ method: 'timer', name, value, tags });
      if (!timers[name]) timers[name] = [];
      timers[name].push(value);
    });
    
    return Object.assign(mock, {
      getCalls: () => [...calls],
      getMetrics: () => ({
        counters: { ...counters },
        gauges: { ...gauges },
        timers: Object.fromEntries(
          Object.entries(timers).map(([name, values]) => [
            name,
            {
              count: values.length,
              min: Math.min(...values),
              max: Math.max(...values),
              avg: values.reduce((sum, v) => sum + v, 0) / values.length
            }
          ])
        )
      })
    });
  }
}