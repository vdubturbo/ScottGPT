/**
 * Tests for Company Grouping Service
 * 
 * Tests all functionality including edge cases:
 * - Company name normalization
 * - Career progression detection
 * - Boomerang employee patterns
 * - Skills aggregation
 * - Date handling edge cases
 */

import CompanyGroupingService from '../../utils/company-grouping.js';

describe('CompanyGroupingService', () => {
  let service;
  let mockJobs;

  beforeEach(() => {
    service = new CompanyGroupingService();
    
    // Mock job data for testing
    mockJobs = [
      {
        id: 'job1',
        title: 'Software Engineer',
        org: 'Microsoft Corp',
        date_start: '2020-01-01',
        date_end: '2021-06-30',
        skills: ['JavaScript', 'React', 'Node.js']
      },
      {
        id: 'job2',
        title: 'Senior Software Engineer',
        org: 'Microsoft Corporation',
        date_start: '2022-01-01',
        date_end: null,
        skills: ['JavaScript', 'React', 'TypeScript', 'Azure']
      },
      {
        id: 'job3',
        title: 'Developer',
        org: 'Google Inc',
        date_start: '2019-03-01',
        date_end: '2019-12-31',
        skills: ['Python', 'TensorFlow', 'GCP']
      },
      {
        id: 'job4',
        title: 'Lead Software Engineer',
        org: 'Microsoft',
        date_start: '2023-01-01',
        date_end: null,
        skills: ['JavaScript', 'React', 'TypeScript', 'Azure', 'Leadership']
      }
    ];
  });

  describe('normalizeCompanyName', () => {
    test('should normalize company suffixes', () => {
      expect(service.normalizeCompanyName('Microsoft Corp')).toBe('microsoft');
      expect(service.normalizeCompanyName('Microsoft Corporation')).toBe('microsoft');
      expect(service.normalizeCompanyName('Microsoft Inc.')).toBe('microsoft');
      expect(service.normalizeCompanyName('Apple Inc')).toBe('apple');
    });

    test('should handle company aliases', () => {
      expect(service.normalizeCompanyName('Google Inc')).toBe('google');
      expect(service.normalizeCompanyName('Alphabet Inc')).toBe('google');
      expect(service.normalizeCompanyName('Meta')).toBe('facebook');
      expect(service.normalizeCompanyName('Facebook Inc')).toBe('facebook');
    });

    test('should handle edge cases', () => {
      expect(service.normalizeCompanyName('')).toBe('unknown');
      expect(service.normalizeCompanyName(null)).toBe('unknown');
      expect(service.normalizeCompanyName(undefined)).toBe('unknown');
      expect(service.normalizeCompanyName('   ')).toBe('unknown');
    });

    test('should remove common words', () => {
      expect(service.normalizeCompanyName('Microsoft Global Systems')).toBe('microsoft');
      expect(service.normalizeCompanyName('The Apple Company')).toBe('apple');
    });

    test('should handle punctuation', () => {
      expect(service.normalizeCompanyName('AT&T Inc.')).toBe('at&t');
      expect(service.normalizeCompanyName('Johnson & Johnson')).toBe('johnson & johnson');
    });
  });

  describe('groupJobsByCompany', () => {
    test('should group jobs by normalized company names', () => {
      const result = service.groupJobsByCompany(mockJobs);
      
      expect(result).toHaveLength(2); // Microsoft and Google groups
      
      const microsoftGroup = result.find(g => g.normalizedName === 'microsoft');
      expect(microsoftGroup).toBeDefined();
      expect(microsoftGroup.positions).toHaveLength(3);
      expect(microsoftGroup.originalNames).toContain('Microsoft Corp');
      expect(microsoftGroup.originalNames).toContain('Microsoft Corporation');
      expect(microsoftGroup.originalNames).toContain('Microsoft');
      
      const googleGroup = result.find(g => g.normalizedName === 'google');
      expect(googleGroup).toBeDefined();
      expect(googleGroup.positions).toHaveLength(1);
    });

    test('should handle empty input', () => {
      expect(service.groupJobsByCompany([])).toEqual([]);
      expect(service.groupJobsByCompany(null)).toEqual([]);
      expect(service.groupJobsByCompany(undefined)).toEqual([]);
    });

    test('should sort positions by date within groups', () => {
      const result = service.groupJobsByCompany(mockJobs);
      const microsoftGroup = result.find(g => g.normalizedName === 'microsoft');
      
      const dates = microsoftGroup.positions.map(p => p.date_start);
      expect(dates).toEqual(['2020-01-01', '2022-01-01', '2023-01-01']);
    });

    test('should calculate total tenure correctly', () => {
      const result = service.groupJobsByCompany(mockJobs);
      const microsoftGroup = result.find(g => g.normalizedName === 'microsoft');
      
      expect(microsoftGroup.tenure.years).toBeGreaterThan(0);
      expect(microsoftGroup.tenure.formatted).toContain('year');
    });
  });

  describe('calculateCareerProgression', () => {
    test('should detect promotions', () => {
      const positions = [
        { title: 'Software Engineer', date_start: '2020-01-01', date_end: '2021-01-01' },
        { title: 'Senior Software Engineer', date_start: '2021-01-01', date_end: '2022-01-01' },
        { title: 'Lead Software Engineer', date_start: '2022-01-01', date_end: null }
      ];

      const result = service.calculateCareerProgression(positions);
      
      expect(result.pattern).toBe('strong_upward');
      expect(result.promotions).toHaveLength(2);
      expect(result.progressionScore).toBeGreaterThan(1.5);
    });

    test('should detect lateral moves', () => {
      const positions = [
        { title: 'Frontend Developer', date_start: '2020-01-01', date_end: '2021-01-01' },
        { title: 'Backend Developer', date_start: '2021-01-01', date_end: null }
      ];

      const result = service.calculateCareerProgression(positions);
      
      expect(result.lateralMoves).toHaveLength(1);
      expect(result.promotions).toHaveLength(0);
    });

    test('should handle single role', () => {
      const positions = [
        { title: 'Software Engineer', date_start: '2020-01-01', date_end: null }
      ];

      const result = service.calculateCareerProgression(positions);
      
      expect(result.pattern).toBe('single_role');
      expect(result.promotions).toHaveLength(0);
      expect(result.progressionScore).toBe(0);
    });

    test('should handle empty positions', () => {
      const result = service.calculateCareerProgression([]);
      
      expect(result.pattern).toBe('single_role');
      expect(result.promotions).toHaveLength(0);
    });
  });

  describe('detectBoomerangPattern', () => {
    test('should detect boomerang employment', () => {
      const positions = [
        { title: 'Engineer', date_start: '2018-01-01', date_end: '2019-12-31' },
        { title: 'Senior Engineer', date_start: '2021-06-01', date_end: null } // Gap of ~18 months
      ];

      const result = service.detectBoomerangPattern(positions);
      
      expect(result.isBoomerang).toBe(true);
      expect(result.stints).toBe(2);
      expect(result.gaps).toHaveLength(1);
      expect(result.gaps[0].duration).toBeGreaterThan(500); // ~18 months
    });

    test('should not detect boomerang for continuous employment', () => {
      const positions = [
        { title: 'Engineer', date_start: '2020-01-01', date_end: '2021-01-01' },
        { title: 'Senior Engineer', date_start: '2021-01-15', date_end: null } // 15 day gap (promotion delay)
      ];

      const result = service.detectBoomerangPattern(positions);
      
      expect(result.isBoomerang).toBe(false);
      expect(result.stints).toBe(1);
    });

    test('should handle single position', () => {
      const positions = [
        { title: 'Engineer', date_start: '2020-01-01', date_end: null }
      ];

      const result = service.detectBoomerangPattern(positions);
      
      expect(result.isBoomerang).toBe(false);
      expect(result.stints).toBe(1);
      expect(result.gaps).toHaveLength(0);
    });

    test('should handle complex boomerang pattern', () => {
      const positions = [
        { title: 'Engineer', date_start: '2018-01-01', date_end: '2019-06-30' },
        { title: 'Senior Engineer', date_start: '2020-01-01', date_end: '2021-12-31' }, // 6 month gap
        { title: 'Lead Engineer', date_start: '2023-01-01', date_end: null } // 1 year gap
      ];

      const result = service.detectBoomerangPattern(positions);
      
      expect(result.isBoomerang).toBe(true);
      expect(result.stints).toBe(3);
      expect(result.gaps).toHaveLength(2);
    });
  });

  describe('aggregateCompanySkills', () => {
    test('should aggregate unique skills', () => {
      const positions = [
        { title: 'Engineer', skills: ['JavaScript', 'React', 'Node.js'] },
        { title: 'Senior Engineer', skills: ['JavaScript', 'React', 'TypeScript', 'Azure'] }
      ];

      const result = service.aggregateCompanySkills(positions);
      
      expect(result.uniqueSkills).toHaveLength(5);
      expect(result.uniqueSkills).toContain('JavaScript');
      expect(result.uniqueSkills).toContain('TypeScript');
      expect(result.skillFrequency['JavaScript']).toBe(2);
      expect(result.skillFrequency['TypeScript']).toBe(1);
    });

    test('should analyze skill evolution', () => {
      const positions = [
        { 
          title: 'Junior Developer', 
          date_start: '2020-01-01',
          skills: ['JavaScript', 'HTML', 'CSS'] 
        },
        { 
          title: 'Developer', 
          date_start: '2021-01-01',
          skills: ['JavaScript', 'React', 'Node.js'] 
        }
      ];

      const result = service.aggregateCompanySkills(positions);
      
      expect(result.skillEvolution).toHaveLength(1);
      expect(result.skillEvolution[0].added).toContain('React');
      expect(result.skillEvolution[0].added).toContain('Node.js');
      expect(result.skillEvolution[0].removed).toContain('HTML');
      expect(result.skillEvolution[0].retained).toContain('JavaScript');
    });

    test('should categorize skills', () => {
      const positions = [
        { skills: ['JavaScript', 'React', 'Python', 'AWS', 'Project Management'] }
      ];

      const result = service.aggregateCompanySkills(positions);
      
      expect(result.categoryDistribution['Programming Languages']).toBeGreaterThan(0);
      expect(result.categoryDistribution['Frameworks & Libraries']).toBeGreaterThan(0);
      expect(result.categoryDistribution['Cloud & DevOps']).toBeGreaterThan(0);
      expect(result.categoryDistribution['Project Management']).toBeGreaterThan(0);
    });

    test('should handle empty skills', () => {
      const positions = [
        { title: 'Engineer', skills: [] },
        { title: 'Senior Engineer', skills: null },
        { title: 'Lead Engineer' } // no skills property
      ];

      const result = service.aggregateCompanySkills(positions);
      
      expect(result.uniqueSkills).toHaveLength(0);
      expect(result.skillCount).toBe(0);
      expect(result.skillEvolution).toHaveLength(2); // transitions between positions
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing or invalid dates', () => {
      const jobsWithBadDates = [
        {
          title: 'Engineer',
          org: 'TestCorp',
          date_start: 'invalid-date',
          date_end: '2021-12-31',
          skills: ['JavaScript']
        },
        {
          title: 'Senior Engineer',
          org: 'TestCorp',
          date_start: '2022-01-01',
          date_end: null,
          skills: ['JavaScript', 'React']
        }
      ];

      const result = service.groupJobsByCompany(jobsWithBadDates);
      
      expect(result).toHaveLength(1);
      expect(result[0].positions).toHaveLength(2);
      // Should still work despite bad dates
    });

    test('should handle overlapping dates within same company', () => {
      const overlappingJobs = [
        {
          title: 'Software Engineer',
          org: 'TechCorp',
          date_start: '2020-01-01',
          date_end: '2021-06-30',
          skills: ['JavaScript']
        },
        {
          title: 'Team Lead', // Promotion with overlap
          org: 'TechCorp',
          date_start: '2021-06-01', // 1 month overlap
          date_end: null,
          skills: ['JavaScript', 'Leadership']
        }
      ];

      const result = service.groupJobsByCompany(overlappingJobs);
      const company = result[0];
      
      expect(company.positions).toHaveLength(2);
      expect(company.careerProgression.promotions).toHaveLength(1);
      
      // Should still detect as continuous employment (not boomerang)
      expect(company.boomerangPattern.isBoomerang).toBe(false);
    });

    test('should handle jobs with minimal data', () => {
      const minimalJobs = [
        { org: 'MinimalCorp' }, // Only company name
        { title: 'Unknown Role', org: 'MinimalCorp' } // No dates or skills
      ];

      const result = service.groupJobsByCompany(minimalJobs);
      
      expect(result).toHaveLength(1);
      expect(result[0].positions).toHaveLength(2);
      expect(result[0].aggregatedSkills.uniqueSkills).toHaveLength(0);
    });

    test('should handle very similar company names', () => {
      const similarCompanies = [
        { title: 'Engineer', org: 'Acme Corp' },
        { title: 'Developer', org: 'Acme Corporation' },
        { title: 'Architect', org: 'Acme Inc' },
        { title: 'Manager', org: 'ACME CORP' } // Different case
      ];

      const result = service.groupJobsByCompany(similarCompanies);
      
      // Should all be grouped together
      expect(result).toHaveLength(1);
      expect(result[0].positions).toHaveLength(4);
      expect(result[0].originalNames).toHaveLength(4);
    });

    test('should handle long career with many positions', () => {
      const longCareer = Array.from({ length: 10 }, (_, i) => ({
        title: `Role ${i + 1}`,
        org: 'LongCorp',
        date_start: `${2010 + i}-01-01`,
        date_end: i < 9 ? `${2010 + i + 1}-01-01` : null,
        skills: [`Skill${i + 1}`, 'Common Skill']
      }));

      const result = service.groupJobsByCompany(longCareer);
      const company = result[0];
      
      expect(company.positions).toHaveLength(10);
      expect(company.tenure.years).toBeGreaterThan(10);
      expect(company.aggregatedSkills.uniqueSkills).toContain('Common Skill');
      expect(company.careerProgression.totalRoleChanges).toBe(9);
    });
  });

  describe('Insights Generation', () => {
    test('should generate meaningful company insights', () => {
      const result = service.groupJobsByCompany(mockJobs);
      const microsoftGroup = result.find(g => g.normalizedName === 'microsoft');
      
      expect(microsoftGroup.insights).toContain('Held 3 different positions at this company');
      expect(microsoftGroup.insights.some(insight => insight.includes('promotion'))).toBe(true);
    });

    test('should generate progression insights', () => {
      const positions = [
        { title: 'Engineer', date_start: '2020-01-01', date_end: '2021-01-01' },
        { title: 'Senior Engineer', date_start: '2021-01-01', date_end: '2022-01-01' },
        { title: 'Lead Engineer', date_start: '2022-01-01', date_end: null }
      ];

      const result = service.calculateCareerProgression(positions);
      
      expect(result.insights).toContain('Career advancement: 2 promotions');
      expect(result.insights.some(insight => insight.includes('Strong promotion rate'))).toBe(true);
    });

    test('should generate skills insights', () => {
      const positions = [
        { skills: ['JavaScript', 'React', 'Node.js', 'TypeScript', 'Azure'] }
      ];

      const result = service.aggregateCompanySkills(positions);
      
      expect(result.insights).toContain('5 unique skills across all positions');
      expect(result.insights.some(insight => insight.startsWith('Core skills:'))).toBe(true);
    });
  });
});