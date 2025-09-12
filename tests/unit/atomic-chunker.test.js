import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { AtomicChunker } from '../../services/atomic-chunker.js';

describe('AtomicChunker', () => {
  let chunker;

  beforeEach(() => {
    chunker = new AtomicChunker();
  });

  afterEach(() => {
    chunker.reset();
  });

  describe('createAtomicChunks', () => {
    const mockYamlData = {
      id: 'test_job',
      title: 'Software Engineer',
      org: 'TechCorp',
      date_start: '2022-01-01',
      date_end: '2023-12-31',
      skills: ['JavaScript', 'React', 'Node.js'],
      outcomes: [
        'Reduced deployment time by 40% through CI/CD improvements',
        'Led team of 5 developers on major product launch'
      ],
      industry_tags: ['Software Development'],
      summary: 'Built scalable web applications using modern technologies'
    };

    const mockDescriptiveContent = `
# Software Engineer at TechCorp

## Role Overview
This Software Engineer position focused on building scalable web applications using React and Node.js.

## Key Responsibilities & Achievements
- Built 12 new features using React and Node.js
- Reduced deployment time by 40% through CI/CD pipeline improvements
- Led cross-functional team of 5 developers on major product launch
- Implemented automated testing reducing bugs by 30%

## Skills & Technologies Used  
- JavaScript/ES6+ for frontend and backend development
- React for building interactive user interfaces
- Node.js for server-side application development
`;

    it('should create multiple atomic chunks from YAML and descriptive content', async () => {
      const chunks = await chunker.createAtomicChunks(mockYamlData, mockDescriptiveContent);
      
      expect(chunks).toHaveLength(expect.any(Number));
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks.length).toBeLessThan(15); // Reasonable upper bound
      
      chunks.forEach(chunk => {
        expect(chunk).toHaveProperty('content');
        expect(chunk).toHaveProperty('metadata');
        expect(chunk).toHaveProperty('token_count');
        expect(chunk.content).toBeTruthy();
        expect(chunk.token_count).toBeGreaterThan(0);
      });
    });

    it('should enforce token budget constraints', async () => {
      const chunks = await chunker.createAtomicChunks(mockYamlData, mockDescriptiveContent);
      
      chunks.forEach(chunk => {
        expect(chunk.token_count).toBeLessThanOrEqual(180); // Hard cap
        expect(chunk.token_count).toBeGreaterThan(10); // Minimum meaningful content
      });
    });

    it('should create achievement chunks with quantified outcomes', async () => {
      const chunks = await chunker.createAtomicChunks(mockYamlData, mockDescriptiveContent);
      
      const achievementChunks = chunks.filter(c => c.metadata.chunk_type === 'achievement');
      expect(achievementChunks.length).toBeGreaterThan(0);
      
      achievementChunks.forEach(chunk => {
        expect(chunk.content).toContain('•');
        expect(chunk.achievements).toHaveLength(1);
        expect(chunk.metadata.evidence_strength).toBeGreaterThan(0);
      });
    });

    it('should create skill evidence chunks', async () => {
      const chunks = await chunker.createAtomicChunks(mockYamlData, mockDescriptiveContent);
      
      const skillChunks = chunks.filter(c => c.metadata.chunk_type === 'skill_evidence');
      expect(skillChunks.length).toBeGreaterThan(0);
      
      skillChunks.forEach(chunk => {
        expect(chunk.metadata.primary_skill).toBeTruthy();
        expect(chunk.skills).toContain(chunk.metadata.primary_skill);
      });
    });

    it('should include proper metadata for all chunks', async () => {
      const chunks = await chunker.createAtomicChunks(mockYamlData, mockDescriptiveContent);
      
      chunks.forEach(chunk => {
        expect(chunk.title).toBe(mockYamlData.title);
        expect(chunk.organization).toBe(mockYamlData.org);
        expect(chunk.start_date).toBe('2022-01-01');
        expect(chunk.end_date).toBe('2023-12-31');
        expect(chunk.domain).toEqual(mockYamlData.industry_tags);
        expect(chunk.metadata.chunk_type).toBeTruthy();
      });
    });
  });

  describe('extractAchievements', () => {
    it('should extract quantified achievements from YAML outcomes', () => {
      const yamlData = {
        outcomes: [
          'Reduced deployment time by 40%',
          'Increased user satisfaction by 25%',
          'Generated $2M in additional revenue'
        ]
      };

      const achievements = chunker.extractAchievements(yamlData, '');
      
      expect(achievements).toHaveLength(3);
      expect(achievements[0]).toContain('40%');
      expect(achievements[1]).toContain('25%');
      expect(achievements[2]).toContain('$2M');
    });

    it('should extract achievements from descriptive content', () => {
      const descriptiveContent = `
        • Reduced MTTR by 38% through automated runbooks
        • Led ATO to FedRAMP Moderate for 12 services
        • Improved performance by 50% in 90 days
      `;

      const achievements = chunker.extractAchievements({}, descriptiveContent);
      
      expect(achievements.length).toBeGreaterThan(0);
      expect(achievements.some(a => a.includes('38%'))).toBe(true);
      expect(achievements.some(a => a.includes('12 services'))).toBe(true);
    });

    it('should limit number of achievements', () => {
      const yamlData = {
        outcomes: new Array(15).fill(0).map((_, i) => `Achievement ${i + 1} with ${i * 10}% improvement`)
      };

      const achievements = chunker.extractAchievements(yamlData, '');
      
      expect(achievements.length).toBeLessThanOrEqual(10);
    });
  });

  describe('extractSkillEvidence', () => {
    it('should find evidence for skills in descriptive content', () => {
      const yamlData = {
        skills: ['Python', 'JavaScript', 'AWS']
      };
      
      const descriptiveContent = `
        Built automation scripts using Python for data processing.
        Developed frontend applications with JavaScript and React.
        Deployed infrastructure on AWS using CloudFormation.
      `;

      const skillEvidence = chunker.extractSkillEvidence(yamlData, descriptiveContent);
      
      expect(skillEvidence.length).toBeGreaterThan(0);
      expect(skillEvidence.some(se => se.skill === 'Python')).toBe(true);
      expect(skillEvidence.some(se => se.skill === 'JavaScript')).toBe(true);
      expect(skillEvidence.some(se => se.skill === 'AWS')).toBe(true);
    });

    it('should provide default context for skills without explicit evidence', () => {
      const yamlData = {
        org: 'TechCorp',
        skills: ['Docker', 'Kubernetes']
      };

      const skillEvidence = chunker.extractSkillEvidence(yamlData, '');
      
      expect(skillEvidence.length).toBeGreaterThan(0);
      skillEvidence.forEach(se => {
        expect(se.evidence).toContain('TechCorp');
        expect(se.evidence).toContain(se.skill);
      });
    });

    it('should limit number of skills processed', () => {
      const yamlData = {
        skills: new Array(20).fill(0).map((_, i) => `Skill${i + 1}`)
      };

      const skillEvidence = chunker.extractSkillEvidence(yamlData, '');
      
      expect(skillEvidence.length).toBeLessThanOrEqual(8);
    });
  });

  describe('calculateEvidenceStrength', () => {
    it('should give high strength to quantified achievements', () => {
      const text = 'Reduced costs by 45% saving $500K annually over 6 months';
      const strength = chunker.calculateEvidenceStrength(text);
      
      expect(strength).toBeGreaterThan(0.8);
    });

    it('should give medium strength to achievements with time metrics', () => {
      const text = 'Led team through project completion in 90 days';
      const strength = chunker.calculateEvidenceStrength(text);
      
      expect(strength).toBeGreaterThan(0.5);
      expect(strength).toBeLessThan(0.8);
    });

    it('should give lower strength to generic descriptions', () => {
      const text = 'Worked on various projects';
      const strength = chunker.calculateEvidenceStrength(text);
      
      expect(strength).toBeLessThanOrEqual(0.6);
    });
  });

  describe('deduplication', () => {
    it('should detect and prevent duplicate chunks', async () => {
      const yamlData = {
        title: 'Test Role',
        org: 'Test Org',
        outcomes: ['Same achievement', 'Same achievement'] // Intentional duplicate
      };

      const chunks = await chunker.createAtomicChunks(yamlData, '');
      
      // Should not create duplicate chunks for identical content
      const contentHashes = chunks.map(c => c.content);
      const uniqueContent = [...new Set(contentHashes)];
      
      expect(contentHashes.length).toBe(uniqueContent.length);
    });

    it('should track deduplication metrics', () => {
      const content1 = 'This is some content';
      const content2 = 'This is different content';
      const content3 = 'This is some content'; // Duplicate

      expect(chunker.isDuplicate(content1)).toBe(false);
      expect(chunker.isDuplicate(content2)).toBe(false);
      expect(chunker.isDuplicate(content3)).toBe(true);

      const metrics = chunker.getMetrics();
      expect(metrics.deduplicationRate).toBeGreaterThan(0);
    });
  });

  describe('date normalization', () => {
    it('should normalize various date formats', () => {
      expect(chunker.normalizeDate('2022')).toBe('2022-01-01');
      expect(chunker.normalizeDate('2022-06-15')).toBe('2022-06-15');
      expect(chunker.normalizeDate('present')).toBe(null);
      expect(chunker.normalizeDate('current')).toBe(null);
      expect(chunker.normalizeDate(null)).toBe(null);
    });
  });

  describe('chunk validation', () => {
    it('should create valid chunks with required fields', async () => {
      const yamlData = {
        title: 'Developer',
        org: 'Company',
        skills: ['JavaScript'],
        outcomes: ['Built 5 features']
      };

      const chunks = await chunker.createAtomicChunks(yamlData, '');
      
      chunks.forEach(chunk => {
        expect(chunk.content).toBeTruthy();
        expect(chunk.content_summary).toBeTruthy();
        expect(chunk.metadata).toBeTruthy();
        expect(chunk.token_count).toBeGreaterThan(0);
        expect(chunk.title).toBe(yamlData.title);
        expect(chunk.organization).toBe(yamlData.org);
      });
    });
  });

  describe('metrics and observability', () => {
    it('should provide comprehensive metrics', async () => {
      const yamlData = {
        title: 'Test Role',
        org: 'Test Company',
        skills: ['Skill1', 'Skill2'],
        outcomes: ['Achievement 1', 'Achievement 2']
      };

      await chunker.createAtomicChunks(yamlData, 'Some descriptive content');
      
      const metrics = chunker.getMetrics();
      
      expect(metrics).toHaveProperty('totalChunks');
      expect(metrics).toHaveProperty('averageTokens');
      expect(metrics).toHaveProperty('histogram');
      expect(metrics).toHaveProperty('deduplicationRate');
      expect(metrics.totalChunks).toBeGreaterThan(0);
    });

    it('should reset metrics properly', async () => {
      const yamlData = {
        title: 'Test',
        org: 'Test',
        outcomes: ['Test achievement']
      };

      await chunker.createAtomicChunks(yamlData, '');
      expect(chunker.getMetrics().totalChunks).toBeGreaterThan(0);
      
      chunker.reset();
      expect(chunker.getMetrics().totalChunks).toBe(0);
    });
  });
});