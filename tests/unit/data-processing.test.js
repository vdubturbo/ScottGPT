/**
 * Unit Tests for Data Processing Service
 * Tests skills normalization, deduplication, and data transformation
 */

import { jest } from '@jest/globals';
import DataProcessingService from '../../utils/data-processing.js';

describe('DataProcessingService', () => {
  let processingService;

  beforeEach(() => {
    processingService = new DataProcessingService();
  });

  describe('processJobData', () => {
    const rawJobData = {
      id: 1,
      title: '  Software Engineer  ',
      org: 'TECH COMPANY',
      date_start: '2020-01-01',
      date_end: '2022-12-31',
      description: 'Developed    software\n\napplications   using modern technologies',
      skills: ['javascript', 'REACT', 'node.js', 'JavaScript'],
      location: 'San Francisco, CA'
    };

    test('should clean and normalize job data', () => {
      const result = processingService.processJobData(rawJobData);

      expect(result.title).toBe('Software Engineer');
      expect(result.org).toBe('TECH COMPANY');
      expect(result.description).toBe('Developed software\n\napplications using modern technologies');
      expect(result.skills).toEqual(['JavaScript', 'Node.js', 'React']);
      expect(result.duration_months).toBe(24);
      expect(result.skill_categories).toBeDefined();
      expect(result.processed_at).toBeDefined();
    });

    test('should handle missing optional fields', () => {
      const minimalData = {
        title: 'Engineer',
        org: 'Company',
        date_start: '2020-01-01'
      };

      const result = processingService.processJobData(minimalData);

      expect(result.title).toBe('Engineer');
      expect(result.skills).toEqual([]);
      expect(result.description).toBe('');
      expect(result.location).toBe('');
    });
  });

  describe('normalizeSkills', () => {
    test('should normalize and deduplicate skills', () => {
      const skills = ['javascript', 'REACT', 'node.js', 'JavaScript', 'react', 'python'];
      const result = processingService.normalizeSkills(skills);

      expect(result).toEqual(['JavaScript', 'Node.js', 'Python', 'React']);
      expect(result).toBeSorted();
    });

    test('should handle empty and invalid skills', () => {
      const skills = ['', null, undefined, 'JavaScript', '   ', 123];
      const result = processingService.normalizeSkills(skills);

      expect(result).toEqual(['JavaScript']);
    });

    test('should map common skill variations', () => {
      const skills = ['js', 'nodejs', 'ai', 'ml', 'aws', 'k8s'];
      const result = processingService.normalizeSkills(skills);

      expect(result).toContain('JavaScript');
      expect(result).toContain('Node.js');
      expect(result).toContain('AI/ML');
      expect(result).toContain('AWS');
      expect(result).toContain('Kubernetes');
    });

    test('should handle non-array input', () => {
      expect(processingService.normalizeSkills(null)).toEqual([]);
      expect(processingService.normalizeSkills(undefined)).toEqual([]);
      expect(processingService.normalizeSkills('JavaScript')).toEqual([]);
    });
  });

  describe('normalizeSkill', () => {
    test('should normalize individual skills correctly', () => {
      expect(processingService.normalizeSkill('javascript')).toBe('JavaScript');
      expect(processingService.normalizeSkill('  REACT  ')).toBe('React');
      expect(processingService.normalizeSkill('node.js')).toBe('Node.js');
      expect(processingService.normalizeSkill('artificial intelligence')).toBe('AI/ML');
    });

    test('should convert unknown skills to title case', () => {
      expect(processingService.normalizeSkill('custom framework')).toBe('Custom Framework');
      expect(processingService.normalizeSkill('SOME-TOOL')).toBe('Some-Tool');
    });

    test('should handle non-string input', () => {
      expect(processingService.normalizeSkill(null)).toBe('');
      expect(processingService.normalizeSkill(undefined)).toBe('');
      expect(processingService.normalizeSkill(123)).toBe('');
    });

    test('should clean special characters', () => {
      expect(processingService.normalizeSkill('C++')).toBe('C++');
      expect(processingService.normalizeSkill('C#')).toBe('C#');
      expect(processingService.normalizeSkill('Node.js')).toBe('Node.js');
    });
  });

  describe('cleanText', () => {
    test('should clean and normalize text', () => {
      const dirtyText = '  Multiple   spaces\n\nand   newlines  ';
      const result = processingService.cleanText(dirtyText);

      expect(result).toBe('Multiple spaces and newlines');
    });

    test('should remove special characters', () => {
      const textWithSpecials = 'Text with @#$%^&*()special!!! characters';
      const result = processingService.cleanText(textWithSpecials);

      expect(result).toBe('Text with special characters');
    });

    test('should handle non-string input', () => {
      expect(processingService.cleanText(null)).toBe('');
      expect(processingService.cleanText(undefined)).toBe('');
      expect(processingService.cleanText(123)).toBe('');
    });
  });

  describe('calculateDuration', () => {
    test('should calculate duration in months', () => {
      expect(processingService.calculateDuration('2020-01-01', '2022-01-01')).toBe(24);
      expect(processingService.calculateDuration('2020-06-01', '2020-12-01')).toBe(6);
      expect(processingService.calculateDuration('2020-01-01', null)).toBeGreaterThan(0);
    });

    test('should handle invalid dates', () => {
      expect(processingService.calculateDuration('invalid', '2020-01-01')).toBe(0);
      expect(processingService.calculateDuration('2020-01-01', 'invalid')).toBe(0);
      expect(processingService.calculateDuration(null, '2020-01-01')).toBe(0);
    });

    test('should not return negative duration', () => {
      expect(processingService.calculateDuration('2022-01-01', '2020-01-01')).toBe(0);
    });
  });

  describe('categorizeSkills', () => {
    test('should categorize skills correctly', () => {
      const skills = ['JavaScript', 'React', 'AWS', 'Docker', 'Project Management'];
      const result = processingService.categorizeSkills(skills);

      expect(result['Programming Languages']).toContain('JavaScript');
      expect(result['Frontend Frameworks']).toContain('React');
      expect(result['Cloud Platforms']).toContain('AWS');
      expect(result['DevOps Tools']).toContain('Docker');
      expect(result['Management Skills']).toContain('Project Management');
    });

    test('should handle unknown skills', () => {
      const skills = ['Unknown Skill', 'Custom Framework'];
      const result = processingService.categorizeSkills(skills);

      expect(result['Other']).toContain('Unknown Skill');
      expect(result['Other']).toContain('Custom Framework');
    });

    test('should handle empty array', () => {
      const result = processingService.categorizeSkills([]);
      expect(result).toEqual({});
    });
  });

  describe('findDuplicates', () => {
    const jobs = [
      {
        id: 1,
        title: 'Software Engineer',
        org: 'Tech Company',
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      },
      {
        id: 2,
        title: 'Software Engineer', // Same title
        org: 'Tech Company', // Same org
        date_start: '2020-01-01', // Same start date
        date_end: '2021-01-01'
      },
      {
        id: 3,
        title: 'Senior Software Engineer', // Similar title
        org: 'Tech Company', // Same org
        date_start: '2020-06-01', // Overlapping dates
        date_end: '2021-06-01'
      }
    ];

    test('should find exact duplicates', () => {
      const result = processingService.findDuplicates(jobs);

      expect(result.length).toBeGreaterThan(0);
      expect(result.some(dup => dup.type === 'potential_duplicate')).toBe(true);
    });

    test('should find similar entries', () => {
      const result = processingService.findDuplicates(jobs);

      expect(result.some(dup => dup.type === 'similar_entry')).toBe(true);
    });

    test('should calculate similarity scores', () => {
      const result = processingService.findDuplicates(jobs);

      result.forEach(duplicate => {
        expect(duplicate.similarity).toBeGreaterThanOrEqual(0);
        expect(duplicate.similarity).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('calculateJobSimilarity', () => {
    const job1 = {
      title: 'Software Engineer',
      org: 'Tech Company',
      date_start: '2020-01-01',
      date_end: '2021-01-01',
      skills: ['JavaScript', 'React']
    };

    test('should calculate high similarity for identical jobs', () => {
      const job2 = { ...job1 };
      const similarity = processingService.calculateJobSimilarity(job1, job2);

      expect(similarity).toBeGreaterThan(0.9);
    });

    test('should calculate lower similarity for different jobs', () => {
      const job2 = {
        title: 'Data Scientist',
        org: 'Data Company',
        date_start: '2022-01-01',
        date_end: '2023-01-01',
        skills: ['Python', 'TensorFlow']
      };
      const similarity = processingService.calculateJobSimilarity(job1, job2);

      expect(similarity).toBeLessThan(0.5);
    });

    test('should handle missing fields', () => {
      const job2 = {
        title: 'Engineer',
        org: 'Company'
      };
      const similarity = processingService.calculateJobSimilarity(job1, job2);

      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });
  });

  describe('stringSimilarity', () => {
    test('should calculate string similarity using Jaccard index', () => {
      expect(processingService.stringSimilarity('hello world', 'hello world')).toBe(1);
      expect(processingService.stringSimilarity('hello world', 'world hello')).toBe(1);
      expect(processingService.stringSimilarity('hello', 'world')).toBe(0);
      expect(processingService.stringSimilarity('hello world', 'hello')).toBe(0.5);
    });

    test('should handle empty strings', () => {
      expect(processingService.stringSimilarity('', '')).toBe(0);
      expect(processingService.stringSimilarity('hello', '')).toBe(0);
      expect(processingService.stringSimilarity('', 'world')).toBe(0);
    });
  });

  describe('calculateDateOverlap', () => {
    test('should calculate overlap for overlapping periods', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };
      const job2 = {
        date_start: '2020-06-01',
        date_end: '2021-06-01'
      };

      const overlap = processingService.calculateDateOverlap(job1, job2);
      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(1);
    });

    test('should return 0 for non-overlapping periods', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: '2020-06-01'
      };
      const job2 = {
        date_start: '2021-01-01',
        date_end: '2021-06-01'
      };

      const overlap = processingService.calculateDateOverlap(job1, job2);
      expect(overlap).toBe(0);
    });

    test('should handle current positions (no end date)', () => {
      const job1 = {
        date_start: '2020-01-01',
        date_end: null
      };
      const job2 = {
        date_start: '2020-06-01',
        date_end: '2021-01-01'
      };

      const overlap = processingService.calculateDateOverlap(job1, job2);
      expect(overlap).toBeGreaterThan(0);
    });
  });

  describe('calculateSkillsSimilarity', () => {
    test('should calculate skills similarity', () => {
      const skills1 = ['JavaScript', 'React', 'Node.js'];
      const skills2 = ['JavaScript', 'Vue.js', 'Node.js'];

      const similarity = processingService.calculateSkillsSimilarity(skills1, skills2);
      expect(similarity).toBeCloseTo(0.5, 1); // 2/4 skills overlap
    });

    test('should handle identical skill sets', () => {
      const skills = ['JavaScript', 'React'];
      const similarity = processingService.calculateSkillsSimilarity(skills, skills);
      expect(similarity).toBe(1);
    });

    test('should handle empty arrays', () => {
      expect(processingService.calculateSkillsSimilarity([], [])).toBe(1);
      expect(processingService.calculateSkillsSimilarity(['JavaScript'], [])).toBe(0);
      expect(processingService.calculateSkillsSimilarity([], ['React'])).toBe(0);
    });

    test('should be case insensitive', () => {
      const skills1 = ['JavaScript', 'React'];
      const skills2 = ['javascript', 'REACT'];

      const similarity = processingService.calculateSkillsSimilarity(skills1, skills2);
      expect(similarity).toBe(1);
    });
  });

  describe('generateAnalytics', () => {
    const jobs = [
      {
        id: 1,
        title: 'Software Engineer',
        org: 'Tech Company A',
        date_start: '2020-01-01',
        date_end: '2021-01-01',
        skills: ['JavaScript', 'React']
      },
      {
        id: 2,
        title: 'Senior Engineer',
        org: 'Tech Company B',
        date_start: '2021-06-01',
        date_end: null,
        skills: ['JavaScript', 'Vue.js']
      }
    ];

    test('should generate comprehensive analytics', () => {
      const analytics = processingService.generateAnalytics(jobs);

      expect(analytics.totalJobs).toBe(2);
      expect(analytics.totalDuration).toBeGreaterThan(0);
      expect(analytics.averageDuration).toBeGreaterThan(0);
      expect(analytics.skillFrequency['JavaScript']).toBe(2);
      expect(analytics.skillFrequency['React']).toBe(1);
      expect(analytics.organizationHistory['Tech Company A']).toBe(1);
      expect(analytics.skillCategories).toBeDefined();
    });

    test('should handle empty job array', () => {
      const analytics = processingService.generateAnalytics([]);

      expect(analytics.totalJobs).toBe(0);
      expect(analytics.totalDuration).toBe(0);
      expect(analytics.averageDuration).toBe(0);
    });

    test('should handle invalid input', () => {
      const analytics = processingService.generateAnalytics(null);
      expect(analytics).toEqual({});
    });
  });

  describe('toTitleCase', () => {
    test('should convert to title case', () => {
      expect(processingService.toTitleCase('hello world')).toBe('Hello World');
      expect(processingService.toTitleCase('JAVASCRIPT')).toBe('Javascript');
      expect(processingService.toTitleCase('node.js')).toBe('Node.js');
    });
  });
});