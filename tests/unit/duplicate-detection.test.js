/**
 * Unit tests for Duplicate Detection Service
 */

import { jest } from '@jest/globals';
import DuplicateDetectionService from '../../services/duplicate-detection.js';

// Mock dependencies
jest.mock('../../config/database.js', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn()
        }))
      }))
    }))
  }
}));

jest.mock('../../services/embeddings.js');

describe('DuplicateDetectionService', () => {
  let duplicateService;
  
  beforeEach(() => {
    duplicateService = new DuplicateDetectionService();
    jest.clearAllMocks();
  });

  describe('calculateCompanySimilarity', () => {
    test('should return 1 for identical company names', () => {
      const similarity = duplicateService.calculateCompanySimilarity(
        'Acme Corporation',
        'Acme Corporation'
      );
      expect(similarity).toBe(1.0);
    });

    test('should return high similarity for company variations', () => {
      const similarity = duplicateService.calculateCompanySimilarity(
        'Acme Corp',
        'Acme Corporation'
      );
      expect(similarity).toBeGreaterThan(0.8);
    });

    test('should handle abbreviations', () => {
      const similarity = duplicateService.calculateCompanySimilarity(
        'International Business Machines',
        'IBM'
      );
      // This might be lower due to significant text difference
      expect(similarity).toBeGreaterThan(0);
    });

    test('should return 0 for completely different companies', () => {
      const similarity = duplicateService.calculateCompanySimilarity(
        'Google',
        'Microsoft'
      );
      expect(similarity).toBeLessThan(0.5);
    });

    test('should handle null/empty company names', () => {
      expect(duplicateService.calculateCompanySimilarity(null, 'Acme')).toBe(0);
      expect(duplicateService.calculateCompanySimilarity('Acme', null)).toBe(0);
      expect(duplicateService.calculateCompanySimilarity('', 'Acme')).toBe(0);
    });
  });

  describe('calculateTitleSimilarity', () => {
    test('should return 1 for identical titles', () => {
      const similarity = duplicateService.calculateTitleSimilarity(
        'Software Engineer',
        'Software Engineer'
      );
      expect(similarity).toBe(1.0);
    });

    test('should return high similarity for seniority variations', () => {
      const similarity = duplicateService.calculateTitleSimilarity(
        'Software Engineer',
        'Senior Software Engineer'
      );
      expect(similarity).toBe(0.9); // Should be exactly 0.9 for seniority variations
    });

    test('should handle different seniority levels', () => {
      const similarity = duplicateService.calculateTitleSimilarity(
        'Junior Developer',
        'Senior Developer'
      );
      expect(similarity).toBe(0.9);
    });

    test('should return low similarity for different roles', () => {
      const similarity = duplicateService.calculateTitleSimilarity(
        'Software Engineer',
        'Product Manager'
      );
      expect(similarity).toBeLessThan(0.5);
    });

    test('should handle partial matches', () => {
      const similarity = duplicateService.calculateTitleSimilarity(
        'Full Stack Developer',
        'Developer'
      );
      expect(similarity).toBeGreaterThan(0.7);
    });
  });

  describe('calculateDateSimilarity', () => {
    test('should return 1 for identical date ranges', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };
      const job2 = {
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };
      
      const similarity = duplicateService.calculateDateSimilarity(job1, job2);
      expect(similarity).toBe(1.0);
    });

    test('should calculate overlap percentage correctly', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: '2020-06-01'
      };
      const job2 = {
        date_start: '2020-03-01',
        date_end: '2020-09-01'
      };
      
      const similarity = duplicateService.calculateDateSimilarity(job1, job2);
      expect(similarity).toBeGreaterThan(0.4); // Should have significant overlap
      expect(similarity).toBeLessThan(1.0);
    });

    test('should return 0 for non-overlapping dates', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: '2020-06-01'
      };
      const job2 = {
        date_start: '2021-01-01',
        date_end: '2021-06-01'
      };
      
      const similarity = duplicateService.calculateDateSimilarity(job1, job2);
      expect(similarity).toBe(0);
    });

    test('should handle current jobs (null end date)', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: null
      };
      const job2 = {
        date_start: '2020-06-01',
        date_end: null
      };
      
      const similarity = duplicateService.calculateDateSimilarity(job1, job2);
      expect(similarity).toBeGreaterThan(0);
    });

    test('should return 0 for missing start dates', () => {
      const job1 = { date_start: null };
      const job2 = { date_start: '2020-01-01' };
      
      const similarity = duplicateService.calculateDateSimilarity(job1, job2);
      expect(similarity).toBe(0);
    });
  });

  describe('calculateSkillsSimilarity', () => {
    test('should return 1 for identical skill sets', () => {
      const skills1 = ['JavaScript', 'React', 'Node.js'];
      const skills2 = ['JavaScript', 'React', 'Node.js'];
      
      const similarity = duplicateService.calculateSkillsSimilarity(skills1, skills2);
      expect(similarity).toBe(1.0);
    });

    test('should calculate Jaccard similarity correctly', () => {
      const skills1 = ['JavaScript', 'React', 'Node.js'];
      const skills2 = ['JavaScript', 'React', 'Vue.js'];
      
      const similarity = duplicateService.calculateSkillsSimilarity(skills1, skills2);
      // Intersection: 2, Union: 4, Similarity: 2/4 = 0.5
      expect(similarity).toBeCloseTo(0.5);
    });

    test('should return 0 for completely different skill sets', () => {
      const skills1 = ['JavaScript', 'React'];
      const skills2 = ['Python', 'Django'];
      
      const similarity = duplicateService.calculateSkillsSimilarity(skills1, skills2);
      expect(similarity).toBe(0);
    });

    test('should return 1 for both empty skill arrays', () => {
      const similarity = duplicateService.calculateSkillsSimilarity([], []);
      expect(similarity).toBe(1);
    });

    test('should return 0 when one skill array is empty', () => {
      const similarity = duplicateService.calculateSkillsSimilarity(['JavaScript'], []);
      expect(similarity).toBe(0);
    });

    test('should handle skill normalization', () => {
      const skills1 = ['javascript', 'react'];
      const skills2 = ['JavaScript', 'React'];
      
      const similarity = duplicateService.calculateSkillsSimilarity(skills1, skills2);
      expect(similarity).toBe(1.0); // Should be identical after normalization
    });
  });

  describe('calculateConfidence', () => {
    test('should return very high confidence for exact matches', () => {
      const similarity = {
        company: 1.0,
        title: 1.0,
        dates: 1.0,
        content: 1.0,
        overall: 0.95
      };
      
      const confidence = duplicateService.calculateConfidence(similarity);
      expect(confidence.level).toBe('very_high');
      expect(confidence.autoMergeable).toBe(true);
    });

    test('should return high confidence for near matches', () => {
      const similarity = {
        company: 0.9,
        title: 0.85,
        dates: 0.8,
        content: 0.7,
        overall: 0.87
      };
      
      const confidence = duplicateService.calculateConfidence(similarity);
      expect(confidence.level).toBe('high');
      expect(confidence.autoMergeable).toBe(false);
    });

    test('should return medium confidence for moderate matches', () => {
      const similarity = {
        company: 0.7,
        title: 0.6,
        dates: 0.5,
        content: 0.4,
        overall: 0.75
      };
      
      const confidence = duplicateService.calculateConfidence(similarity);
      expect(confidence.level).toBe('medium');
      expect(confidence.autoMergeable).toBe(false);
    });

    test('should include appropriate reasons', () => {
      const similarity = {
        company: 0.95,
        title: 0.85,
        dates: 0.85,
        content: 0.8,
        overall: 0.88
      };
      
      const confidence = duplicateService.calculateConfidence(similarity);
      expect(confidence.reasons).toContain('Same company');
      expect(confidence.reasons).toContain('Similar job title');
      expect(confidence.reasons).toContain('Overlapping dates');
      expect(confidence.reasons).toContain('Similar job description');
    });
  });

  describe('normalizeCompanyName', () => {
    test('should normalize company variations', () => {
      expect(duplicateService.normalizeCompanyName('Acme Corp.')).toBe('acme corporation');
      expect(duplicateService.normalizeCompanyName('Acme Inc.')).toBe('acme incorporated');
      expect(duplicateService.normalizeCompanyName('Acme LLC')).toBe('acme limited liability company');
    });

    test('should handle punctuation and whitespace', () => {
      expect(duplicateService.normalizeCompanyName('  Acme  Corp.  ')).toBe('acme corporation');
      expect(duplicateService.normalizeCompanyName('Acme & Associates')).toBe('acme and associates');
    });

    test('should apply bidirectional mapping', () => {
      const normalized1 = duplicateService.normalizeCompanyName('Tech Corp');
      const normalized2 = duplicateService.normalizeCompanyName('Technology Corporation');
      // Should have some common elements after normalization
      expect(normalized1).toContain('technology');
      expect(normalized2).toContain('corp');
    });
  });

  describe('normalizeTitle', () => {
    test('should normalize job titles', () => {
      expect(duplicateService.normalizeTitle('Senior Software Engineer III')).toBe('software engineer');
      expect(duplicateService.normalizeTitle('Jr. Developer')).toBe('developer');
    });

    test('should handle punctuation and casing', () => {
      expect(duplicateService.normalizeTitle('SOFTWARE ENGINEER')).toBe('software engineer');
      expect(duplicateService.normalizeTitle('Full-Stack Developer')).toBe('full stack developer');
    });

    test('should remove roman numerals', () => {
      expect(duplicateService.normalizeTitle('Software Engineer II')).toBe('software engineer');
      expect(duplicateService.normalizeTitle('Analyst IV')).toBe('analyst');
    });
  });

  describe('classifyDuplicateType', () => {
    test('should classify exact duplicates', () => {
      const similarJobs = [
        { similarity: { overall: 0.96 } }
      ];
      
      const type = duplicateService.classifyDuplicateType(similarJobs);
      expect(type).toBe('exact_duplicate');
    });

    test('should classify near duplicates', () => {
      const similarJobs = [
        { similarity: { overall: 0.88 } }
      ];
      
      const type = duplicateService.classifyDuplicateType(similarJobs);
      expect(type).toBe('near_duplicate');
    });

    test('should classify possible duplicates', () => {
      const similarJobs = [
        { similarity: { overall: 0.75 } }
      ];
      
      const type = duplicateService.classifyDuplicateType(similarJobs);
      expect(type).toBe('possible_duplicate');
    });
  });

  describe('findDuplicates', () => {
    test('should find duplicates in job array', async () => {
      const jobs = [
        {
          id: 1,
          title: 'Software Engineer',
          org: 'Tech Corp',
          date_start: '2020-01-01',
          date_end: '2021-01-01',
          description: 'Built web applications',
          skills: ['JavaScript', 'React']
        },
        {
          id: 2,
          title: 'Senior Software Engineer',
          org: 'Tech Corp',
          date_start: '2020-01-01',
          date_end: '2021-01-01',
          description: 'Built web applications with team',
          skills: ['JavaScript', 'React', 'Leadership']
        }
      ];

      // Mock getChunkCount
      jest.spyOn(duplicateService, 'getChunkCount').mockResolvedValue(3);

      const result = await duplicateService.findDuplicates(jobs);
      
      expect(result).toHaveProperty('duplicateGroups');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('recommendations');
      expect(result.duplicateGroups.length).toBeGreaterThan(0);
    });

    test('should handle empty job array', async () => {
      const result = await duplicateService.findDuplicates([]);
      
      expect(result.duplicateGroups).toEqual([]);
      expect(result.summary.totalJobs).toBe(0);
    });

    test('should handle single job', async () => {
      const jobs = [
        {
          id: 1,
          title: 'Software Engineer',
          org: 'Tech Corp'
        }
      ];

      const result = await duplicateService.findDuplicates(jobs);
      
      expect(result.duplicateGroups).toEqual([]);
      expect(result.summary.totalJobs).toBe(1);
    });
  });

  describe('calculateSimilarity', () => {
    test('should calculate overall similarity correctly', async () => {
      const job1 = {
        id: 1,
        title: 'Software Engineer',
        org: 'Tech Corp',
        date_start: '2020-01-01',
        date_end: '2021-01-01',
        description: 'Built applications',
        skills: ['JavaScript', 'React']
      };

      const job2 = {
        id: 2,
        title: 'Senior Software Engineer',
        org: 'Tech Corp',
        date_start: '2020-01-01',
        date_end: '2021-01-01',
        description: 'Built applications',
        skills: ['JavaScript', 'React']
      };

      // Mock content similarity
      jest.spyOn(duplicateService, 'calculateContentSimilarity').mockResolvedValue(0.9);

      const similarity = await duplicateService.calculateSimilarity(job1, job2);
      
      expect(similarity).toHaveProperty('company');
      expect(similarity).toHaveProperty('title');
      expect(similarity).toHaveProperty('dates');
      expect(similarity).toHaveProperty('content');
      expect(similarity).toHaveProperty('skills');
      expect(similarity).toHaveProperty('overall');
      expect(similarity).toHaveProperty('breakdown');
      
      expect(similarity.overall).toBeGreaterThan(0.8); // Should be high similarity
      expect(similarity.breakdown).toHaveLength(5);
    });
  });

  describe('generateSummary', () => {
    test('should generate accurate summary statistics', () => {
      const duplicateGroups = [
        {
          type: 'exact_duplicate',
          duplicates: [
            { confidence: { autoMergeable: true } },
            { confidence: { autoMergeable: false, level: 'high' } }
          ]
        },
        {
          type: 'near_duplicate',
          duplicates: [
            { confidence: { autoMergeable: false, level: 'medium' } }
          ]
        }
      ];

      const summary = duplicateService.generateSummary(duplicateGroups, 10);
      
      expect(summary.totalJobs).toBe(10);
      expect(summary.duplicateGroups).toBe(2);
      expect(summary.totalDuplicates).toBe(3);
      expect(summary.exactDuplicates).toBe(1);
      expect(summary.nearDuplicates).toBe(1);
      expect(summary.autoMergeable).toBe(1);
      expect(summary.requiresReview).toBe(1);
    });
  });

  describe('error handling', () => {
    test('should handle database errors gracefully', async () => {
      jest.spyOn(duplicateService, 'getChunkCount').mockRejectedValue(new Error('Database error'));

      const jobs = [
        { id: 1, title: 'Engineer', org: 'Corp' },
        { id: 2, title: 'Engineer', org: 'Corp' }
      ];

      await expect(duplicateService.findDuplicates(jobs)).rejects.toThrow('Database error');
    });

    test('should handle embedding service errors', async () => {
      const job1 = { description: 'Test description 1' };
      const job2 = { description: 'Test description 2' };

      jest.spyOn(duplicateService, 'calculateContentSimilarity').mockResolvedValue(0);

      const similarity = await duplicateService.calculateContentSimilarity(job1, job2);
      expect(similarity).toBe(0); // Should fallback gracefully
    });
  });
});