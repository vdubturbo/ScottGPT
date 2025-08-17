/**
 * Unit Tests for Data Validation Service
 * Tests hard and soft validation rules for job data
 */

import { jest } from '@jest/globals';
import DataValidationService from '../../services/data-validation.js';

describe('DataValidationService', () => {
  let validationService;

  beforeEach(() => {
    validationService = new DataValidationService();
  });

  describe('validateJobData', () => {
    const validJobData = {
      id: 1,
      title: 'Software Engineer',
      org: 'Tech Company',
      date_start: '2020-01-01',
      date_end: '2022-12-31',
      description: 'Developed software applications using modern technologies',
      skills: ['JavaScript', 'React', 'Node.js'],
      location: 'San Francisco, CA'
    };

    test('should pass validation for valid job data', () => {
      const result = validationService.validateJobData(validJobData);

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.processedData).toEqual(validJobData);
    });

    describe('hard validation (critical errors)', () => {
      test('should reject missing required fields', () => {
        const invalidData = { ...validJobData };
        delete invalidData.title;
        delete invalidData.org;

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors[0].code).toBe('REQUIRED_FIELD');
        expect(result.errors[0].field).toBe('title');
        expect(result.errors[1].code).toBe('REQUIRED_FIELD');
        expect(result.errors[1].field).toBe('org');
      });

      test('should reject empty string required fields', () => {
        const invalidData = { 
          ...validJobData, 
          title: '', 
          org: '   ' 
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.every(error => error.code === 'REQUIRED_FIELD')).toBe(true);
      });

      test('should reject invalid date formats', () => {
        const invalidData = { 
          ...validJobData, 
          date_start: '01/01/2020',
          date_end: 'December 2022'
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors.every(error => error.code === 'INVALID_DATE_FORMAT')).toBe(true);
      });

      test('should reject end date before start date', () => {
        const invalidData = { 
          ...validJobData, 
          date_start: '2022-01-01',
          date_end: '2021-12-31'
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_DATE_RANGE');
      });

      test('should reject future start dates', () => {
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 1);
        
        const invalidData = { 
          ...validJobData, 
          date_start: futureDate.toISOString().substr(0, 10)
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('FUTURE_DATE');
      });

      test('should reject invalid data types', () => {
        const invalidData = { 
          ...validJobData, 
          title: 123,
          skills: 'JavaScript, React',
          org: null
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(error => error.code === 'INVALID_TYPE')).toBe(true);
      });

      test('should reject fields exceeding maximum length', () => {
        const invalidData = { 
          ...validJobData, 
          title: 'A'.repeat(201),
          org: 'B'.repeat(151),
          description: 'C'.repeat(5001)
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(3);
        expect(result.errors.every(error => error.code === 'MAX_LENGTH_EXCEEDED')).toBe(true);
      });

      test('should reject invalid skills array', () => {
        const invalidData = { 
          ...validJobData, 
          skills: [123, null, 'ValidSkill', 'A'.repeat(51)]
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors.some(error => error.code === 'INVALID_SKILL_TYPE')).toBe(true);
        expect(result.errors.some(error => error.code === 'SKILL_TOO_LONG')).toBe(true);
      });

      test('should reject extremely short employment duration', () => {
        const invalidData = { 
          ...validJobData, 
          date_start: '2020-01-01',
          date_end: '2020-01-01'
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('INVALID_DURATION');
      });

      test('should reject dates too far in the past', () => {
        const historicalDate = new Date();
        historicalDate.setFullYear(historicalDate.getFullYear() - 65);
        
        const invalidData = { 
          ...validJobData, 
          date_start: historicalDate.toISOString().substr(0, 10)
        };

        const result = validationService.validateJobData(invalidData);

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('HISTORICAL_DATE');
      });
    });

    describe('soft validation (warnings)', () => {
      test('should warn about overlapping employment dates', () => {
        const existingJobs = [
          {
            id: 2,
            title: 'Previous Job',
            org: 'Other Company',
            date_start: '2019-06-01',
            date_end: '2020-06-01'
          }
        ];

        const overlappingData = {
          ...validJobData,
          date_start: '2020-01-01',
          date_end: '2021-01-01'
        };

        const result = validationService.validateJobData(overlappingData, existingJobs);

        expect(result.isValid).toBe(true);
        expect(result.warnings).toHaveLength(1);
        expect(result.warnings[0].code).toBe('DATE_OVERLAP');
        expect(result.warnings[0].severity).toBe('warning');
      });

      test('should warn about short employment duration', () => {
        const shortDurationData = {
          ...validJobData,
          date_start: '2020-01-01',
          date_end: '2020-01-15'
        };

        const result = validationService.validateJobData(shortDurationData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'SHORT_DURATION')).toBe(true);
      });

      test('should warn about very long employment duration', () => {
        const longDurationData = {
          ...validJobData,
          date_start: '2000-01-01',
          date_end: '2023-01-01'
        };

        const result = validationService.validateJobData(longDurationData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'LONG_DURATION')).toBe(true);
      });

      test('should warn about excessive number of skills', () => {
        const manySkillsData = {
          ...validJobData,
          skills: Array.from({ length: 25 }, (_, i) => `Skill${i + 1}`)
        };

        const result = validationService.validateJobData(manySkillsData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'MANY_SKILLS')).toBe(true);
      });

      test('should warn about few skills for long-term positions', () => {
        const fewSkillsData = {
          ...validJobData,
          date_start: '2020-01-01',
          date_end: '2022-01-01',
          skills: ['JavaScript']
        };

        const result = validationService.validateJobData(fewSkillsData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'FEW_SKILLS')).toBe(true);
      });

      test('should warn about missing or short description', () => {
        const shortDescData = {
          ...validJobData,
          description: 'Short desc'
        };

        const result = validationService.validateJobData(shortDescData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'SHORT_DESCRIPTION')).toBe(true);
      });

      test('should warn about missing location', () => {
        const noLocationData = { ...validJobData };
        delete noLocationData.location;

        const result = validationService.validateJobData(noLocationData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'MISSING_LOCATION')).toBe(true);
      });

      test('should warn about ALL CAPS text', () => {
        const allCapsData = {
          ...validJobData,
          title: 'SOFTWARE ENGINEER',
          org: 'TECH COMPANY'
        };

        const result = validationService.validateJobData(allCapsData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.filter(warning => warning.code === 'ALL_CAPS')).toHaveLength(2);
      });

      test('should warn about duplicate skills', () => {
        const duplicateSkillsData = {
          ...validJobData,
          skills: ['JavaScript', 'javascript', 'React', 'REACT']
        };

        const result = validationService.validateJobData(duplicateSkillsData);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'DUPLICATE_SKILLS')).toBe(true);
      });
    });

    describe('employment gap detection', () => {
      test('should detect employment gaps', () => {
        const existingJobs = [
          {
            id: 2,
            title: 'Previous Job',
            org: 'Company A',
            date_start: '2018-01-01',
            date_end: '2019-01-01'
          },
          {
            id: 3,
            title: 'Later Job',
            org: 'Company C',
            date_start: '2021-01-01',
            date_end: null
          }
        ];

        const gapJobData = {
          ...validJobData,
          date_start: '2019-06-01',
          date_end: '2020-01-01'
        };

        const result = validationService.validateJobData(gapJobData, existingJobs);

        expect(result.isValid).toBe(true);
        expect(result.warnings.some(warning => warning.code === 'EMPLOYMENT_GAP')).toBe(true);
      });
    });
  });

  describe('validateBulkOperation', () => {
    test('should validate multiple jobs and categorize results', () => {
      const jobs = [
        {
          title: 'Valid Job 1',
          org: 'Company A',
          date_start: '2020-01-01',
          date_end: '2021-01-01'
        },
        {
          title: '', // Invalid - missing title
          org: 'Company B',
          date_start: '2021-01-01'
        },
        {
          title: 'Valid Job 2',
          org: 'Company C',
          date_start: '2022-01-01',
          skills: Array.from({ length: 25 }, (_, i) => `Skill${i}`) // Warning - many skills
        }
      ];

      const result = validationService.validateBulkOperation(jobs);

      expect(result.summary.total).toBe(3);
      expect(result.summary.valid).toBe(2);
      expect(result.summary.invalid).toBe(1);
      expect(result.summary.warnings).toBe(1);
      expect(result.validJobs).toHaveLength(2);
      expect(result.invalidJobs).toHaveLength(1);
      expect(result.warnings).toHaveLength(1);
    });
  });

  describe('helper methods', () => {
    test('_isValidDate should correctly validate date formats', () => {
      expect(validationService._isValidDate('2020-01-01')).toBe(true);
      expect(validationService._isValidDate('2020-12-31')).toBe(true);
      expect(validationService._isValidDate('01/01/2020')).toBe(false);
      expect(validationService._isValidDate('2020-13-01')).toBe(false);
      expect(validationService._isValidDate('not-a-date')).toBe(false);
      expect(validationService._isValidDate(null)).toBe(false);
      expect(validationService._isValidDate(123)).toBe(false);
    });

    test('_datesOverlap should correctly detect overlapping periods', () => {
      const job1 = {
        date_start: new Date('2020-01-01'),
        date_end: new Date('2021-01-01')
      };
      const job2 = {
        date_start: new Date('2020-06-01'),
        date_end: new Date('2021-06-01')
      };
      const job3 = {
        date_start: new Date('2021-06-01'),
        date_end: new Date('2022-01-01')
      };

      expect(validationService._datesOverlap(job1, job2)).toBe(true);
      expect(validationService._datesOverlap(job1, job3)).toBe(false);
    });

    test('_findEmploymentGaps should identify gaps in timeline', () => {
      const sortedJobs = [
        {
          title: 'Job 1',
          date_start: new Date('2018-01-01'),
          date_end: new Date('2019-01-01')
        },
        {
          title: 'Job 2',
          date_start: new Date('2020-01-01'),
          date_end: new Date('2021-01-01')
        }
      ];

      const gaps = validationService._findEmploymentGaps(sortedJobs);

      expect(gaps).toHaveLength(1);
      expect(gaps[0].durationDays).toBeGreaterThan(300); // About 1 year gap
      expect(gaps[0].beforeJob).toBe('Job 1');
      expect(gaps[0].afterJob).toBe('Job 2');
    });
  });
});