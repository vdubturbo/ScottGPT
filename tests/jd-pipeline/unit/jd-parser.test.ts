/**
 * Unit tests for JD Parser
 * Tests boilerplate removal, schema extraction, and fallback behavior
 */

import { JDParser } from '../../../services/jd-pipeline/jd-parser';
import { JDSchema, JDFlowConfig, LLMAdapter } from '../../../services/jd-pipeline/types';
import { createMockLLM, createMockTelemetry } from '../../mocks/adapters';

describe('JDParser', () => {
  let parser: JDParser;
  let mockLLM: jest.Mocked<LLMAdapter>;
  let mockTelemetry: any;
  let config: JDFlowConfig;

  beforeEach(() => {
    mockLLM = createMockLLM();
    mockTelemetry = createMockTelemetry();
    config = {
      modelName: 'gpt-3.5-turbo',
      temperature: 0.1,
      topKAnn: 20,
      keepAfterRerank: 10,
      evidenceTokenBudget: 2000,
      minCoveragePercent: 0.95,
      strictCoverage: true,
      cacheEnabled: true,
      cacheTTLSeconds: 3600,
      tokenHeadroom: 0.15
    };

    parser = new JDParser(mockLLM, undefined, mockTelemetry);
  });

  describe('parseJD', () => {
    it('should parse a well-formed JD successfully', async () => {
      const rawJD = `
        Senior Software Engineer - AI/ML
        
        We are looking for a Senior Software Engineer to join our AI/ML team.
        
        Requirements:
        - 5+ years Python experience
        - Machine learning expertise
        - AWS cloud experience
        
        Responsibilities:
        - Build ML models
        - Deploy to production
        - Mentor junior developers
        
        Salary: $120,000 - $150,000
        Apply now!
      `;

      const mockSchema: JDSchema = {
        roleTitle: 'Senior Software Engineer - AI/ML',
        seniority: 'senior',
        domain: ['software engineering', 'ai/ml'],
        mustHaves: ['Python experience', 'Machine learning expertise', 'AWS cloud experience'],
        topResponsibilities: ['Build ML models', 'Deploy to production', 'Mentor junior developers'],
        hardConstraints: [],
        conciseSummary: 'Senior Software Engineer role focused on AI/ML development',
        rawHash: expect.any(String)
      };

      mockLLM.complete.mockResolvedValueOnce({
        text: JSON.stringify(mockSchema),
        tokensUsed: { prompt: 100, completion: 150 }
      });

      const result = await parser.parseJD(rawJD, config);

      expect(result).toEqual(expect.objectContaining({
        roleTitle: 'Senior Software Engineer - AI/ML',
        seniority: 'senior',
        mustHaves: expect.arrayContaining(['Python experience', 'Machine learning expertise'])
      }));

      expect(mockLLM.complete).toHaveBeenCalledWith(
        expect.stringContaining('Extract structured data'),
        expect.stringContaining(rawJD),
        1500,
        0.1
      );

      expect(mockTelemetry.timer).toHaveBeenCalledWith('parser.parse_ms', expect.any(Number));
    });

    it('should remove boilerplate content', async () => {
      const rawJD = `
        URGENT: APPLY NOW!!!
        🔥 HOT OPPORTUNITY 🔥
        
        Senior Developer Position
        
        We are an equal opportunity employer.
        No agencies please.
        Salary negotiable.
        Apply today!
        
        Requirements:
        - JavaScript experience
        
        This is a great opportunity to join our team!
      `;

      mockLLM.complete.mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Senior Developer Position',
          mustHaves: ['JavaScript experience'],
          topResponsibilities: [],
          hardConstraints: [],
          conciseSummary: 'Senior Developer role requiring JavaScript',
          rawHash: 'test123'
        }),
        tokensUsed: { prompt: 80, completion: 100 }
      });

      await parser.parseJD(rawJD, config);

      const [systemPrompt, userPrompt] = mockLLM.complete.mock.calls[0];
      
      // Should not contain boilerplate phrases
      expect(userPrompt).not.toContain('URGENT');
      expect(userPrompt).not.toContain('🔥');
      expect(userPrompt).not.toContain('equal opportunity');
      expect(userPrompt).not.toContain('No agencies');
      expect(userPrompt).not.toContain('great opportunity');
    });

    it('should handle LLM parsing failures with fallback', async () => {
      const rawJD = `
        Data Scientist Position
        
        Requirements:
        - Python
        - SQL
        - Machine Learning
      `;

      // Mock LLM to return invalid JSON
      mockLLM.complete.mockResolvedValueOnce({
        text: 'invalid json response',
        tokensUsed: { prompt: 50, completion: 20 }
      });

      const result = await parser.parseJD(rawJD, config);

      // Should fallback to rule-based parsing
      expect(result.roleTitle).toBe('Data Scientist Position');
      expect(result.mustHaves).toContain('Python');
      expect(result.mustHaves).toContain('SQL');
      expect(result.mustHaves).toContain('Machine Learning');

      expect(mockTelemetry.counter).toHaveBeenCalledWith('parser.llm_fallback', 1);
    });

    it('should extract seniority levels correctly', async () => {
      const testCases = [
        { input: 'Junior Software Engineer', expected: 'junior' },
        { input: 'Senior Data Scientist', expected: 'senior' },
        { input: 'Principal Engineer', expected: 'staff' },
        { input: 'Engineering Manager', expected: 'manager' },
        { input: 'Director of Engineering', expected: 'director' },
        { input: 'Software Engineer II', expected: 'mid-level' }
      ];

      for (const testCase of testCases) {
        mockLLM.complete.mockResolvedValueOnce({
          text: JSON.stringify({
            roleTitle: testCase.input,
            seniority: testCase.expected,
            mustHaves: [],
            topResponsibilities: [],
            hardConstraints: [],
            conciseSummary: testCase.input,
            rawHash: 'test'
          }),
          tokensUsed: { prompt: 50, completion: 30 }
        });

        const result = await parser.parseJD(testCase.input, config);
        expect(result.seniority).toBe(testCase.expected);
      }
    });

    it('should detect hard constraints', async () => {
      const rawJD = `
        Security Engineer Position
        
        Must have active security clearance.
        US citizen required.
        On-site work only.
        
        Requirements:
        - Cybersecurity experience
      `;

      mockLLM.complete.mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Security Engineer Position',
          hardConstraints: ['security clearance required', 'US citizen required', 'on-site only'],
          mustHaves: ['Cybersecurity experience'],
          topResponsibilities: [],
          conciseSummary: 'Security Engineer with clearance requirement',
          rawHash: 'test'
        }),
        tokensUsed: { prompt: 100, completion: 80 }
      });

      const result = await parser.parseJD(rawJD, config);

      expect(result.hardConstraints).toContain('security clearance required');
      expect(result.hardConstraints).toContain('US citizen required');
      expect(result.hardConstraints).toContain('on-site only');
    });

    it('should handle empty or minimal JDs', async () => {
      const rawJD = 'Software Engineer';

      mockLLM.complete.mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Software Engineer',
          mustHaves: [],
          topResponsibilities: [],
          hardConstraints: [],
          conciseSummary: 'Software Engineer position',
          rawHash: 'test'
        }),
        tokensUsed: { prompt: 20, completion: 30 }
      });

      const result = await parser.parseJD(rawJD, config);

      expect(result.roleTitle).toBe('Software Engineer');
      expect(result.mustHaves).toEqual([]);
      expect(result.topResponsibilities).toEqual([]);
    });

    it('should generate consistent hash for same content', async () => {
      const rawJD = 'Backend Developer - Node.js';

      mockLLM.complete.mockResolvedValue({
        text: JSON.stringify({
          roleTitle: 'Backend Developer',
          mustHaves: ['Node.js'],
          topResponsibilities: [],
          hardConstraints: [],
          conciseSummary: 'Backend Developer role',
          rawHash: 'hash1'
        }),
        tokensUsed: { prompt: 50, completion: 40 }
      });

      const result1 = await parser.parseJD(rawJD, config);
      const result2 = await parser.parseJD(rawJD, config);

      expect(result1.rawHash).toBe(result2.rawHash);
    });

    it('should respect token limits', async () => {
      const longJD = 'Software Engineer\n' + 'Very detailed requirements. '.repeat(1000);

      mockLLM.complete.mockResolvedValueOnce({
        text: JSON.stringify({
          roleTitle: 'Software Engineer',
          mustHaves: ['Experience'],
          topResponsibilities: [],
          hardConstraints: [],
          conciseSummary: 'Software Engineer role',
          rawHash: 'test'
        }),
        tokensUsed: { prompt: 1400, completion: 100 }
      });

      await parser.parseJD(longJD, config);

      // Should limit prompt tokens to 1500
      expect(mockLLM.complete).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        1500,
        0.1
      );
    });

    it('should handle LLM errors gracefully', async () => {
      const rawJD = 'Frontend Developer';

      mockLLM.complete.mockRejectedValueOnce(new Error('LLM service unavailable'));

      const result = await parser.parseJD(rawJD, config);

      // Should fallback to rule-based parsing
      expect(result.roleTitle).toBe('Frontend Developer');
      expect(mockTelemetry.counter).toHaveBeenCalledWith('parser.llm_error', 1);
    });
  });

  describe('boilerplate removal', () => {
    it('should remove marketing language', () => {
      const input = `
        🚀 AMAZING OPPORTUNITY 🚀
        Join our rockstar team!
        This is a game-changer role!
        
        Software Engineer Position
        
        We're looking for ninjas and unicorns!
      `;

      const cleaned = (parser as any).removeBoilerplate(input);

      expect(cleaned).not.toContain('🚀');
      expect(cleaned).not.toContain('AMAZING OPPORTUNITY');
      expect(cleaned).not.toContain('rockstar');
      expect(cleaned).not.toContain('game-changer');
      expect(cleaned).not.toContain('ninjas');
      expect(cleaned).not.toContain('unicorns');
      expect(cleaned).toContain('Software Engineer Position');
    });

    it('should preserve important technical content', () => {
      const input = `
        Senior Python Developer
        
        Requirements:
        - 5+ years Python
        - Django framework
        - PostgreSQL database
        
        Responsibilities:
        - Build APIs
        - Code reviews
      `;

      const cleaned = (parser as any).removeBoilerplate(input);

      expect(cleaned).toContain('Senior Python Developer');
      expect(cleaned).toContain('5+ years Python');
      expect(cleaned).toContain('Django framework');
      expect(cleaned).toContain('PostgreSQL database');
      expect(cleaned).toContain('Build APIs');
      expect(cleaned).toContain('Code reviews');
    });
  });
});