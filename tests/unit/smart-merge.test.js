/**
 * Unit tests for Smart Merge Service
 */

import { jest } from '@jest/globals';
import SmartMergeService from '../../services/smart-merge.js';

// Mock dependencies
jest.mock('../../config/database.js', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          single: jest.fn(),
          order: jest.fn()
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn()
      })),
      delete: jest.fn(() => ({
        eq: jest.fn()
      })),
      insert: jest.fn()
    })),
    rpc: jest.fn()
  }
}));

jest.mock('../../services/embeddings.js');
jest.mock('../../utils/data-processing.js');

describe('SmartMergeService', () => {
  let mergeService;
  
  beforeEach(() => {
    mergeService = new SmartMergeService();
    jest.clearAllMocks();
  });

  describe('applyFieldStrategy', () => {
    test('should prefer detailed values', () => {
      const result = mergeService.applyFieldStrategy(
        'title',
        'Engineer',
        'Senior Software Engineer',
        'prefer_detailed'
      );
      expect(result).toBe('Senior Software Engineer');
    });

    test('should prefer complete values', () => {
      const result = mergeService.applyFieldStrategy(
        'location',
        'SF',
        'San Francisco, CA',
        'prefer_complete'
      );
      expect(result).toBe('San Francisco, CA');
    });

    test('should prefer longest values', () => {
      const result = mergeService.applyFieldStrategy(
        'description',
        'Built apps',
        'Built comprehensive web applications using modern frameworks',
        'prefer_longest'
      );
      expect(result).toBe('Built comprehensive web applications using modern frameworks');
    });

    test('should merge unique arrays', () => {
      const result = mergeService.applyFieldStrategy(
        'skills',
        ['JavaScript', 'React'],
        ['JavaScript', 'Node.js'],
        'merge_unique'
      );
      expect(result).toEqual(expect.arrayContaining(['JavaScript', 'React', 'Node.js']));
      expect(result).toHaveLength(3);
    });

    test('should use earliest date', () => {
      const result = mergeService.applyFieldStrategy(
        'date_start',
        '2020-01-01',
        '2020-06-01',
        'use_earliest'
      );
      expect(result).toBe('2020-01-01');
    });

    test('should use latest date', () => {
      const result = mergeService.applyFieldStrategy(
        'date_end',
        '2021-01-01',
        '2021-06-01',
        'use_latest'
      );
      expect(result).toBe('2021-06-01');
    });

    test('should prefer source value', () => {
      const result = mergeService.applyFieldStrategy(
        'field',
        'source_value',
        'target_value',
        'prefer_source'
      );
      expect(result).toBe('source_value');
    });

    test('should prefer target value', () => {
      const result = mergeService.applyFieldStrategy(
        'field',
        'source_value',
        'target_value',
        'prefer_target'
      );
      expect(result).toBe('target_value');
    });

    test('should handle null latest dates for current jobs', () => {
      const result = mergeService.applyFieldStrategy(
        'date_end',
        null,
        '2021-06-01',
        'use_latest'
      );
      expect(result).toBe(null); // Should keep null for current jobs
    });
  });

  describe('preferDetailed', () => {
    test('should choose longer string with more words', () => {
      const result = mergeService.preferDetailed(
        'Engineer',
        'Senior Software Engineer'
      );
      expect(result).toBe('Senior Software Engineer');
    });

    test('should choose longer string when word count is same', () => {
      const result = mergeService.preferDetailed(
        'Software Engineer',
        'Software Development Engineer'
      );
      expect(result).toBe('Software Development Engineer');
    });

    test('should handle null values', () => {
      expect(mergeService.preferDetailed(null, 'value')).toBe('value');
      expect(mergeService.preferDetailed('value', null)).toBe('value');
    });
  });

  describe('mergeUnique', () => {
    test('should merge arrays and remove duplicates', () => {
      const result = mergeService.mergeUnique(
        ['JavaScript', 'React'],
        ['JavaScript', 'Node.js', 'React']
      );
      expect(result).toEqual(expect.arrayContaining(['JavaScript', 'React', 'Node.js']));
      expect(result).toHaveLength(3);
    });

    test('should handle empty arrays', () => {
      expect(mergeService.mergeUnique([], ['skill'])).toEqual(['skill']);
      expect(mergeService.mergeUnique(['skill'], [])).toEqual(['skill']);
      expect(mergeService.mergeUnique([], [])).toEqual([]);
    });

    test('should handle non-array inputs', () => {
      expect(mergeService.mergeUnique('not-array', [])).toEqual([]);
      expect(mergeService.mergeUnique([], 'not-array')).toEqual([]);
    });

    test('should normalize skills and sort result', () => {
      const result = mergeService.mergeUnique(
        ['javascript', 'React'],
        ['JavaScript', 'node.js']
      );
      // Should be normalized and sorted
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('calculateMergedData', () => {
    test('should calculate merged data using strategies', () => {
      const sourceJob = {
        id: 1,
        title: 'Engineer',
        org: 'Corp',
        description: 'Short description',
        skills: ['JavaScript'],
        location: 'SF',
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };

      const targetJob = {
        id: 2,
        title: 'Senior Software Engineer',
        org: 'Corporation Inc',
        description: 'Detailed description of work',
        skills: ['JavaScript', 'React'],
        location: 'San Francisco, CA',
        date_start: '2020-06-01',
        date_end: '2021-06-01'
      };

      const merged = mergeService.calculateMergedData(sourceJob, targetJob);

      expect(merged.title).toBe('Senior Software Engineer'); // More detailed
      expect(merged.org).toBe('Corporation Inc'); // More complete
      expect(merged.description).toBe('Detailed description of work'); // Longer
      expect(merged.skills).toEqual(expect.arrayContaining(['JavaScript', 'React'])); // Merged
      expect(merged.location).toBe('San Francisco, CA'); // More complete
      expect(merged.date_start).toBe('2020-01-01'); // Earliest
      expect(merged.date_end).toBe('2021-06-01'); // Latest
      expect(merged.merge_source_id).toBe(1);
      expect(merged.merge_timestamp).toBeDefined();
    });

    test('should apply custom field strategies', () => {
      const sourceJob = { title: 'Source Title' };
      const targetJob = { title: 'Target Title' };
      const options = {
        fieldStrategies: {
          title: 'prefer_source'
        }
      };

      const merged = mergeService.calculateMergedData(sourceJob, targetJob, options);
      expect(merged.title).toBe('Source Title');
    });
  });

  describe('analyzeChanges', () => {
    test('should identify changed fields', () => {
      const original = {
        title: 'Engineer',
        org: 'Corp',
        skills: ['JavaScript']
      };

      const merged = {
        title: 'Senior Engineer',
        org: 'Corp',
        skills: ['JavaScript', 'React']
      };

      const analysis = mergeService.analyzeChanges(original, merged);

      expect(analysis.changedFields).toContain('title');
      expect(analysis.changedFields).toContain('skills');
      expect(analysis.changedFields).not.toContain('org');
      expect(analysis.changes.title.from).toBe('Engineer');
      expect(analysis.changes.title.to).toBe('Senior Engineer');
      expect(analysis.hasSignificantChanges).toBe(true);
    });

    test('should categorize change types', () => {
      const analysis = mergeService.analyzeChanges(
        { description: null },
        { description: 'New description' }
      );

      expect(analysis.changes.description.changeType).toBe('added');
    });
  });

  describe('assessMergeQuality', () => {
    test('should assess merge quality', () => {
      const sourceJob = {
        description: 'Short',
        skills: ['JavaScript'],
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };

      const targetJob = {
        description: 'Original description',
        skills: ['React'],
        date_start: '2020-06-01',
        date_end: '2020-12-01'
      };

      const mergedData = {
        description: 'Original description that is longer',
        skills: ['JavaScript', 'React'],
        date_start: '2020-01-01',
        date_end: '2021-01-01'
      };

      const quality = mergeService.assessMergeQuality(sourceJob, targetJob, mergedData);

      expect(quality).toHaveProperty('score');
      expect(quality).toHaveProperty('grade');
      expect(quality).toHaveProperty('factors');
      expect(quality.score).toBeGreaterThan(0);
      expect(['Poor', 'Fair', 'Good', 'Excellent']).toContain(quality.grade);
    });
  });

  describe('identifyMergeRisks', () => {
    test('should identify content divergence risk', () => {
      const sourceJob = {
        description: 'Completely different description about data science',
        skills: ['Python', 'TensorFlow'],
        date_start: '2020-01-01'
      };

      const targetJob = {
        description: 'Web development work with JavaScript',
        skills: ['JavaScript', 'React'],
        date_start: '2020-01-01'
      };

      const mergedData = {};

      const risks = mergeService.identifyMergeRisks(sourceJob, targetJob, mergedData);

      const contentRisk = risks.find(risk => risk.type === 'content_divergence');
      expect(contentRisk).toBeDefined();
      expect(contentRisk.severity).toBe('medium');
    });

    test('should identify skills mismatch risk', () => {
      const sourceJob = {
        skills: ['Python', 'Django', 'Machine Learning'],
        description: 'Data science work'
      };

      const targetJob = {
        skills: ['JavaScript', 'React', 'Node.js'],
        description: 'Web development work'
      };

      const mergedData = {};

      const risks = mergeService.identifyMergeRisks(sourceJob, targetJob, mergedData);

      const skillsRisk = risks.find(risk => risk.type === 'skills_mismatch');
      expect(skillsRisk).toBeDefined();
      expect(skillsRisk.severity).toBe('low');
    });

    test('should identify date mismatch risk', () => {
      const sourceJob = {
        date_start: '2020-01-01',
        description: 'Job description'
      };

      const targetJob = {
        date_start: '2022-01-01',
        description: 'Job description'
      };

      const mergedData = {};

      const risks = mergeService.identifyMergeRisks(sourceJob, targetJob, mergedData);

      const dateRisk = risks.find(risk => risk.type === 'date_mismatch');
      expect(dateRisk).toBeDefined();
      expect(dateRisk.severity).toBe('high');
    });
  });

  describe('generateMergeRecommendations', () => {
    test('should recommend proceeding for high quality merges', () => {
      const quality = { score: 0.85, factors: ['Enhanced content detail'] };
      const risks = [];

      const recommendations = mergeService.generateMergeRecommendations(
        {}, {}, quality, risks
      );

      const proceedRec = recommendations.find(rec => rec.type === 'proceed');
      expect(proceedRec).toBeDefined();
      expect(proceedRec.priority).toBe('high');
    });

    test('should recommend caution for low quality merges', () => {
      const quality = { score: 0.3, factors: [] };
      const risks = [];

      const recommendations = mergeService.generateMergeRecommendations(
        {}, {}, quality, risks
      );

      const cautionRec = recommendations.find(rec => rec.type === 'caution');
      expect(cautionRec).toBeDefined();
      expect(cautionRec.priority).toBe('low');
    });

    test('should recommend investigation for high risks', () => {
      const quality = { score: 0.7, factors: [] };
      const risks = [{ severity: 'high' }];

      const recommendations = mergeService.generateMergeRecommendations(
        {}, {}, quality, risks
      );

      const investigateRec = recommendations.find(rec => rec.type === 'investigate');
      expect(investigateRec).toBeDefined();
      expect(investigateRec.priority).toBe('high');
    });
  });

  describe('calculateCompleteness', () => {
    test('should calculate data completeness correctly', () => {
      const job = {
        title: 'Software Engineer',
        org: 'Tech Corp',
        description: 'Detailed job description',
        skills: ['JavaScript', 'React'],
        location: 'San Francisco',
        date_start: '2020-01-01'
      };

      const completeness = mergeService.calculateCompleteness(job);
      expect(completeness).toBe(1.0); // All fields present
    });

    test('should handle missing fields', () => {
      const job = {
        title: 'Software Engineer',
        org: 'Tech Corp'
        // Missing other fields
      };

      const completeness = mergeService.calculateCompleteness(job);
      expect(completeness).toBe(0.4); // Only title (0.2) and org (0.2)
    });

    test('should handle empty arrays and strings', () => {
      const job = {
        title: '',
        org: 'Tech Corp',
        skills: [],
        description: ''
      };

      const completeness = mergeService.calculateCompleteness(job);
      expect(completeness).toBe(0.2); // Only org field has value
    });
  });

  describe('estimateMergeDuration', () => {
    test('should estimate duration based on chunk count', () => {
      const sourceJob = { chunks: [{}, {}, {}] }; // 3 chunks
      const targetJob = { chunks: [{}, {}] }; // 2 chunks

      const duration = mergeService.estimateMergeDuration(sourceJob, targetJob);
      
      expect(typeof duration).toBe('string');
      expect(duration).toMatch(/\d+\s+(seconds?|minutes?)/);
    });

    test('should return minutes for longer operations', () => {
      const sourceJob = { chunks: new Array(100).fill({}) };
      const targetJob = { chunks: new Array(50).fill({}) };

      const duration = mergeService.estimateMergeDuration(sourceJob, targetJob);
      
      expect(duration).toContain('minutes');
    });
  });

  describe('sanitizeJobForPreview', () => {
    test('should remove chunks and add chunk count', () => {
      const job = {
        id: 1,
        title: 'Engineer',
        chunks: [{}, {}, {}],
        secret_field: 'sensitive'
      };

      const sanitized = mergeService.sanitizeJobForPreview(job);

      expect(sanitized).not.toHaveProperty('chunks');
      expect(sanitized.chunkCount).toBe(3);
      expect(sanitized.id).toBe(1);
      expect(sanitized.title).toBe('Engineer');
    });
  });

  describe('getMergeStatus', () => {
    test('should return operation status', () => {
      const mergeId = 'test-merge-123';
      const mockOperation = {
        id: mergeId,
        status: 'completed',
        sourceId: 1,
        targetId: 2,
        startTime: new Date(),
        endTime: new Date(),
        duration: 1000
      };

      mergeService.mergeOperations.set(mergeId, mockOperation);

      const status = mergeService.getMergeStatus(mergeId);

      expect(status.id).toBe(mergeId);
      expect(status.status).toBe('completed');
      expect(status.sourceId).toBe(1);
      expect(status.targetId).toBe(2);
    });

    test('should return not_found for non-existent operation', () => {
      const status = mergeService.getMergeStatus('non-existent');
      expect(status.status).toBe('not_found');
    });
  });

  describe('error handling', () => {
    test('should handle missing jobs gracefully', async () => {
      jest.spyOn(mergeService, 'getJobWithChunks')
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 2 });

      await expect(mergeService.previewMerge(1, 2))
        .rejects.toThrow('One or both jobs not found');
    });

    test('should handle database errors in getJobWithChunks', async () => {
      const { supabase } = await import('../../config/database.js');
      supabase.from().select().eq().single.mockRejectedValue(new Error('Database error'));

      await expect(mergeService.getJobWithChunks(1))
        .rejects.toThrow('Database error');
    });
  });

  describe('integration scenarios', () => {
    test('should handle complete merge preview workflow', async () => {
      const sourceJob = {
        id: 1,
        title: 'Engineer',
        org: 'Corp',
        description: 'Basic description',
        skills: ['JavaScript'],
        chunks: [{ id: 101 }, { id: 102 }]
      };

      const targetJob = {
        id: 2,
        title: 'Senior Engineer',
        org: 'Corporation',
        description: 'Detailed description of work',
        skills: ['JavaScript', 'React'],
        chunks: [{ id: 201 }, { id: 202 }, { id: 203 }]
      };

      jest.spyOn(mergeService, 'getJobWithChunks')
        .mockResolvedValueOnce(sourceJob)
        .mockResolvedValueOnce(targetJob);

      const preview = await mergeService.previewMerge(1, 2);

      expect(preview).toHaveProperty('preview');
      expect(preview).toHaveProperty('analysis');
      expect(preview).toHaveProperty('operations');
      expect(preview.preview.mergedResult.title).toBe('Senior Engineer');
      expect(preview.operations.chunksToMerge).toBe(2);
      expect(preview.operations.chunksToUpdate).toBe(3);
      expect(preview.reversible).toBe(true);
    });
  });
});