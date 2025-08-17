/**
 * Unit tests for Advanced Validation Service
 */

import { jest } from '@jest/globals';
import AdvancedValidationService from '../../services/advanced-validation.js';

describe('AdvancedValidationService', () => {
  let validationService;
  
  beforeEach(() => {
    validationService = new AdvancedValidationService();
  });

  describe('calculateContentQuality', () => {
    test('should calculate quality scores for complete job', () => {
      const job = {
        title: 'Senior Software Engineer',
        org: 'Tech Company',
        date_start: '2020-01-01',
        date_end: '2023-01-01',
        description: 'Led development of scalable web applications using React and Node.js. Managed team of 5 developers and improved system performance by 40%. Delivered multiple high-impact projects on time and under budget.',
        skills: ['JavaScript', 'React', 'Node.js', 'Leadership', 'Project Management'],
        location: 'San Francisco, CA'
      };

      const quality = validationService.calculateContentQuality(job);

      expect(quality.score).toBeGreaterThan(0.7);
      expect(quality.grade).toBe('Good');
      expect(quality.scores).toHaveProperty('description');
      expect(quality.scores).toHaveProperty('skills');
      expect(quality.scores).toHaveProperty('duration');
      expect(quality.scores).toHaveProperty('completeness');
      expect(quality.scores).toHaveProperty('consistency');
    });

    test('should score poor quality job appropriately', () => {
      const job = {
        title: 'Dev',
        org: 'Company',
        date_start: '2023-01-01',
        date_end: '2023-01-15', // Very short duration
        description: 'Worked.',
        skills: ['Code']
      };

      const quality = validationService.calculateContentQuality(job);

      expect(quality.score).toBeLessThan(0.5);
      expect(quality.grade).toBe('Poor');
      expect(quality.issues.length).toBeGreaterThan(0);
    });
  });

  describe('scoreDescription', () => {
    test('should give high score for detailed description', () => {
      const description = 'Led development of scalable web applications using React and Node.js. Managed team of 5 developers and improved system performance by 40%. Delivered multiple high-impact projects on time and under budget. Implemented CI/CD pipelines and reduced deployment time by 60%.';
      
      const score = validationService.scoreDescription(description);
      expect(score).toBeGreaterThan(0.8);
    });

    test('should give low score for minimal description', () => {
      const description = 'Worked on stuff.';
      
      const score = validationService.scoreDescription(description);
      expect(score).toBeLessThan(0.4);
    });

    test('should return 0 for empty description', () => {
      const score = validationService.scoreDescription('');
      expect(score).toBe(0);
    });
  });

  describe('scoreSkills', () => {
    test('should give high score for diverse, well-categorized skills', () => {
      const skills = ['JavaScript', 'React', 'Node.js', 'AWS', 'Docker', 'Leadership', 'Project Management'];
      
      const score = validationService.scoreSkills(skills);
      expect(score).toBeGreaterThan(0.7);
    });

    test('should give low score for minimal skills', () => {
      const skills = ['Programming'];
      
      const score = validationService.scoreSkills(skills);
      expect(score).toBeLessThan(0.4);
    });

    test('should penalize too many skills', () => {
      const manySkills = Array.from({length: 25}, (_, i) => `Skill${i}`);
      
      const score = validationService.scoreSkills(manySkills);
      expect(score).toBeLessThan(1.0);
    });
  });

  describe('detectAdvancedDuplicates', () => {
    test('should detect high confidence duplicates', () => {
      const jobs = [
        {
          id: 1,
          title: 'Software Engineer',
          org: 'Tech Corp',
          date_start: '2020-01-01',
          date_end: '2021-01-01',
          skills: ['JavaScript', 'React']
        },
        {
          id: 2,
          title: 'Software Engineer',
          org: 'Tech Corp',
          date_start: '2020-01-01',
          date_end: '2021-01-01',
          skills: ['JavaScript', 'React']
        }
      ];

      const result = validationService.detectAdvancedDuplicates(jobs);
      
      expect(result.total).toBeGreaterThan(0);
      expect(result.highConfidence.length).toBeGreaterThan(0);
    });

    test('should not detect duplicates for different jobs', () => {
      const jobs = [
        {
          id: 1,
          title: 'Software Engineer',
          org: 'Tech Corp',
          date_start: '2020-01-01',
          date_end: '2021-01-01',
          skills: ['JavaScript', 'React']
        },
        {
          id: 2,
          title: 'Data Scientist',
          org: 'Data Corp',
          date_start: '2022-01-01',
          date_end: '2023-01-01',
          skills: ['Python', 'Machine Learning']
        }
      ];

      const result = validationService.detectAdvancedDuplicates(jobs);
      
      expect(result.highConfidence.length).toBe(0);
    });
  });

  describe('identifyTimelineGaps', () => {
    test('should identify gaps between jobs', () => {
      const jobs = [
        {
          id: 1,
          title: 'Job 1',
          org: 'Company 1',
          date_start: '2020-01-01',
          date_end: '2020-06-01'
        },
        {
          id: 2,
          title: 'Job 2',
          org: 'Company 2',
          date_start: '2021-01-01',
          date_end: '2021-06-01'
        }
      ];

      const result = validationService.identifyTimelineGaps(jobs);
      
      expect(result.gaps.length).toBeGreaterThan(0);
      expect(result.totalGapDays).toBeGreaterThan(0);
    });

    test('should identify overlapping jobs', () => {
      const jobs = [
        {
          id: 1,
          title: 'Job 1',
          org: 'Company 1',
          date_start: '2020-01-01',
          date_end: '2020-06-01'
        },
        {
          id: 2,
          title: 'Job 2',
          org: 'Company 2',
          date_start: '2020-03-01',
          date_end: '2020-09-01'
        }
      ];

      const result = validationService.identifyTimelineGaps(jobs);
      
      expect(result.overlaps.length).toBeGreaterThan(0);
    });
  });

  describe('validateDataQuality', () => {
    test('should provide comprehensive quality report', () => {
      const jobs = [
        {
          id: 1,
          title: 'Senior Software Engineer',
          org: 'Tech Company',
          date_start: '2020-01-01',
          date_end: '2023-01-01',
          description: 'Led development of scalable applications.',
          skills: ['JavaScript', 'React', 'Leadership'],
          location: 'San Francisco, CA'
        }
      ];

      const report = validationService.validateDataQuality(jobs);
      
      expect(report).toHaveProperty('overall');
      expect(report).toHaveProperty('jobs');
      expect(report).toHaveProperty('timeline');
      expect(report).toHaveProperty('duplicates');
      expect(report).toHaveProperty('skills');
      expect(report).toHaveProperty('summary');
      
      expect(report.overall.score).toBeGreaterThan(0);
      expect(report.overall.grade).toBeDefined();
      expect(report.jobs.length).toBe(1);
      expect(report.summary.totalJobs).toBe(1);
    });
  });

  describe('getQualityGrade', () => {
    test('should return correct grades for different scores', () => {
      expect(validationService.getQualityGrade(0.9)).toBe('Excellent');
      expect(validationService.getQualityGrade(0.75)).toBe('Good');
      expect(validationService.getQualityGrade(0.6)).toBe('Fair');
      expect(validationService.getQualityGrade(0.3)).toBe('Poor');
    });
  });

  describe('scoreDuration', () => {
    test('should score optimal duration highly', () => {
      const score = validationService.scoreDuration('2020-01-01', '2022-01-01');
      expect(score).toBe(1.0);
    });

    test('should score very short duration poorly', () => {
      const score = validationService.scoreDuration('2020-01-01', '2020-01-15');
      expect(score).toBeLessThan(0.5);
    });

    test('should handle current jobs (no end date)', () => {
      const score = validationService.scoreDuration('2020-01-01', null);
      expect(score).toBeGreaterThan(0);
    });
  });
});