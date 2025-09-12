/**
 * Unit tests for Token Budget Planner
 * Tests budget allocation, trimming strategies, and model configurations
 */

import { TokenBudgetPlanner } from '../../../services/jd-pipeline/token-budget';
import { CompressedEvidence, JDSchema } from '../../../services/jd-pipeline/types';
import { createMockTelemetry } from '../../mocks/adapters';

describe('TokenBudgetPlanner', () => {
  let planner: TokenBudgetPlanner;
  let mockTelemetry: any;

  beforeEach(() => {
    mockTelemetry = createMockTelemetry();
    planner = new TokenBudgetPlanner(mockTelemetry);
  });

  describe('planBudget', () => {
    it('should plan budget within limits', () => {
      const params = {
        modelContextTokens: 4000,
        systemTokens: 300,
        layoutTokens: 200,
        jdTokens: 400,
        evidenceTokens: 2000,
        headroom: 0.20
      };

      const plan = planner.planBudget(params);

      expect(plan.withinBudget).toBe(true);
      expect(plan.allocations.system).toBe(300);
      expect(plan.allocations.jd).toBe(400);
      expect(plan.allocations.layout).toBe(200);
      expect(plan.allocations.buffer).toBe(800); // 20% of 4000
      expect(plan.allocations.available).toBe(4000);
      expect(plan.allocations.total).toBe(2900); // 300+400+200+2000
    });

    it('should detect budget overrun', () => {
      const params = {
        modelContextTokens: 2000,
        systemTokens: 500,
        layoutTokens: 200,
        jdTokens: 300,
        evidenceTokens: 1500,
        headroom: 0.10
      };

      const plan = planner.planBudget(params);

      expect(plan.withinBudget).toBe(false);
      expect(plan.recommendations).toBeDefined();
      expect(plan.recommendations!.length).toBeGreaterThan(0);
      expect(plan.recommendations![0]).toContain('Reduce evidence');
    });

    it('should provide optimization recommendations', () => {
      const params = {
        modelContextTokens: 4000,
        systemTokens: 600, // High system tokens
        layoutTokens: 200,
        jdTokens: 600, // High JD tokens
        evidenceTokens: 3000,
        headroom: 0.25 // High headroom
      };

      const plan = planner.planBudget(params);

      expect(plan.recommendations).toContain('Consider shortening JD summary');
      expect(plan.recommendations).toContain('Optimize system prompt');
      expect(plan.recommendations).toContain('Reduce safety headroom to 15%');
    });

    it('should track telemetry metrics', () => {
      const params = {
        modelContextTokens: 8000,
        systemTokens: 400,
        layoutTokens: 250,
        jdTokens: 500,
        evidenceTokens: 5000,
        headroom: 0.15
      };

      planner.planBudget(params);

      expect(mockTelemetry.gauge).toHaveBeenCalledWith('budget.model_context', 8000);
      expect(mockTelemetry.gauge).toHaveBeenCalledWith('budget.total_used', expect.any(Number));
      expect(mockTelemetry.gauge).toHaveBeenCalledWith('budget.utilization', expect.any(Number));
      expect(mockTelemetry.counter).toHaveBeenCalledWith('budget.within_limit', expect.any(Number));
    });
  });

  describe('trimEvidence', () => {
    it('should trim evidence by relevance score', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['High relevance line'],
          tokens: 50,
          relevanceScore: 0.9
        },
        {
          id: 'chunk2',
          lines: ['Medium relevance line'],
          tokens: 60,
          relevanceScore: 0.6
        },
        {
          id: 'chunk3',
          lines: ['Low relevance line'],
          tokens: 40,
          relevanceScore: 0.3
        }
      ];

      const result = planner.trimEvidence(evidence, 100);

      expect(result.trimmed).toHaveLength(2); // Should keep top 2
      expect(result.trimmed[0].relevanceScore).toBe(0.9);
      expect(result.trimmed[1].relevanceScore).toBe(0.6);
      expect(result.removedIds).toEqual(['chunk3']);
    });

    it('should handle partial evidence trimming', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['Line 1', 'Line 2', 'Line 3'],
          tokens: 100,
          relevanceScore: 0.8
        }
      ];

      const result = planner.trimEvidence(evidence, 75);

      expect(result.trimmed).toHaveLength(1);
      expect(result.trimmed[0].tokens).toBeLessThan(100);
      expect(result.trimmed[0].lines.length).toBeLessThan(3);
      expect(result.removedIds).toEqual([]);
    });

    it('should respect minimum viable chunk size', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['Very important line'],
          tokens: 20,
          relevanceScore: 0.9
        },
        {
          id: 'chunk2',
          lines: ['Another line'],
          tokens: 25,
          relevanceScore: 0.7
        }
      ];

      const result = planner.trimEvidence(evidence, 30);

      expect(result.trimmed).toHaveLength(1);
      expect(result.trimmed[0].id).toBe('chunk1'); // Higher relevance kept
    });

    it('should track trimming telemetry', () => {
      const evidence: CompressedEvidence[] = [
        { id: 'c1', lines: ['test'], tokens: 100, relevanceScore: 0.8 },
        { id: 'c2', lines: ['test'], tokens: 50, relevanceScore: 0.5 }
      ];

      planner.trimEvidence(evidence, 80);

      expect(mockTelemetry.gauge).toHaveBeenCalledWith('budget.evidence_trimmed', expect.any(Number));
      expect(mockTelemetry.gauge).toHaveBeenCalledWith('budget.evidence_retained', expect.any(Number));
    });
  });

  describe('optimizeForCoverage', () => {
    const mockJD: JDSchema = {
      roleTitle: 'Software Engineer',
      seniority: 'mid-level',
      domain: ['software'],
      mustHaves: ['Python', 'Django', 'AWS'],
      topResponsibilities: ['Build APIs', 'Deploy code'],
      hardConstraints: [],
      conciseSummary: 'Python developer role',
      rawHash: 'test123'
    };

    it('should ensure each must-have has evidence', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['Python development experience'],
          tokens: 50,
          relevanceScore: 0.8,
          mappedToRequirements: ['Python']
        },
        {
          id: 'chunk2',
          lines: ['Django framework usage'],
          tokens: 60,
          relevanceScore: 0.7,
          mappedToRequirements: ['Django']
        },
        {
          id: 'chunk3',
          lines: ['AWS cloud deployment'],
          tokens: 40,
          relevanceScore: 0.9,
          mappedToRequirements: ['AWS']
        },
        {
          id: 'chunk4',
          lines: ['General programming'],
          tokens: 30,
          relevanceScore: 0.6
        }
      ];

      const optimized = planner.optimizeForCoverage(evidence, mockJD, 200);

      // Should include at least one evidence per must-have
      const mappedReqs = new Set();
      optimized.forEach(e => {
        e.mappedToRequirements?.forEach(req => mappedReqs.add(req));
      });

      expect(mappedReqs).toContain('Python');
      expect(mappedReqs).toContain('Django');
      expect(mappedReqs).toContain('AWS');
    });

    it('should prioritize high-relevance evidence after coverage', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['Python experience'],
          tokens: 50,
          relevanceScore: 0.5,
          mappedToRequirements: ['Python']
        },
        {
          id: 'chunk2',
          lines: ['High quality Django work'],
          tokens: 40,
          relevanceScore: 0.9,
          mappedToRequirements: ['Django']
        }
      ];

      const optimized = planner.optimizeForCoverage(evidence, mockJD, 100);

      // Should include both within budget, prioritizing higher relevance
      expect(optimized).toHaveLength(2);
      expect(optimized[0].relevanceScore).toBeGreaterThanOrEqual(optimized[1].relevanceScore);
    });

    it('should handle evidence without mapped requirements', () => {
      const evidence: CompressedEvidence[] = [
        {
          id: 'chunk1',
          lines: ['General software experience'],
          tokens: 50,
          relevanceScore: 0.8
          // No mappedToRequirements
        }
      ];

      const optimized = planner.optimizeForCoverage(evidence, mockJD, 100);

      expect(optimized).toHaveLength(1);
      expect(optimized[0].id).toBe('chunk1');
    });
  });

  describe('calculateTokens', () => {
    it('should calculate tokens for different content types', () => {
      const content = {
        systemPrompt: 'You are a helpful assistant.',
        jdSummary: 'Software Engineer position requiring Python skills.',
        evidence: [
          { id: 'c1', lines: ['test'], tokens: 50, relevanceScore: 0.8 },
          { id: 'c2', lines: ['test'], tokens: 30, relevanceScore: 0.6 }
        ] as CompressedEvidence[],
        layoutInstructions: 'Format as markdown resume.'
      };

      const result = planner.calculateTokens(content);

      expect(result.system).toBeGreaterThan(0);
      expect(result.jd).toBeGreaterThan(0);
      expect(result.evidence).toBe(80); // 50 + 30
      expect(result.layout).toBeGreaterThan(0);
      expect(result.total).toBe(
        result.system + result.jd + result.evidence + result.layout
      );
    });

    it('should handle missing content gracefully', () => {
      const content = {
        evidence: [
          { id: 'c1', lines: ['test'], tokens: 25, relevanceScore: 0.7 }
        ] as CompressedEvidence[]
      };

      const result = planner.calculateTokens(content);

      expect(result.system).toBe(0);
      expect(result.jd).toBe(0);
      expect(result.evidence).toBe(25);
      expect(result.layout).toBe(0);
      expect(result.total).toBe(25);
    });
  });

  describe('getRecommendedAllocation', () => {
    it('should return GPT-3.5 turbo configuration', () => {
      const config = planner.getRecommendedAllocation('gpt-3.5-turbo');

      expect(config.contextLimit).toBe(4096);
      expect(config.systemBudget).toBe(300);
      expect(config.jdBudget).toBe(400);
      expect(config.evidenceBudget).toBe(2400);
      expect(config.headroom).toBe(0.20);
    });

    it('should return GPT-4 configuration', () => {
      const config = planner.getRecommendedAllocation('gpt-4');

      expect(config.contextLimit).toBe(8192);
      expect(config.systemBudget).toBe(400);
      expect(config.headroom).toBe(0.15);
    });

    it('should return Claude-3 configuration', () => {
      const config = planner.getRecommendedAllocation('claude-3');

      expect(config.contextLimit).toBe(200000);
      expect(config.evidenceBudget).toBe(150000);
      expect(config.headroom).toBe(0.10);
    });

    it('should default to GPT-3.5 for unknown models', () => {
      const config = planner.getRecommendedAllocation('unknown-model');

      expect(config.contextLimit).toBe(4096);
      expect(config.headroom).toBe(0.20);
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens accurately for typical text', () => {
      const text = 'Hello world, this is a test sentence with some words.';
      const tokens = (planner as any).estimateTokens(text);

      // Should be reasonable estimate (around 10-15 tokens for this text)
      expect(tokens).toBeGreaterThan(8);
      expect(tokens).toBeLessThan(20);
    });

    it('should handle empty text', () => {
      const tokens = (planner as any).estimateTokens('');
      expect(tokens).toBe(0);
    });

    it('should handle code-heavy content', () => {
      const code = `
        function calculateTokens(text) {
          const words = text.split(' ');
          return words.length * 1.3;
        }
      `;
      
      const tokens = (planner as any).estimateTokens(code);
      expect(tokens).toBeGreaterThan(10);
    });
  });
});