// client/src/lib/__tests__/keywordExtraction.test.js
// Unit tests for keyword extraction functionality

import {
  extractKeywords,
  calculateMatchScore,
  prioritizeContent,
  extractHardSkills
} from '../keywordExtraction';

describe('Keyword Extraction', () => {
  const sampleJobDescription = `
    We are looking for a Senior Software Engineer with expertise in JavaScript, React, and Node.js.
    The ideal candidate should have experience with AWS, Docker, and PostgreSQL.
    Strong problem-solving skills and leadership experience are required.
    You will work on microservices architecture and implement CI/CD pipelines.
  `;

  const sampleResume = `
    Experienced software engineer specializing in React and Node.js development.
    Built scalable applications using Docker and deployed on AWS.
    Led team of 5 developers and implemented microservices architecture.
  `;

  describe('extractKeywords', () => {
    test('extracts technical skills correctly', () => {
      const keywords = extractKeywords(sampleJobDescription);
      
      expect(keywords.technical).toContain('javascript');
      expect(keywords.technical).toContain('react');
      expect(keywords.technical).toContain('node.js');
      expect(keywords.technical).toContain('aws');
      expect(keywords.technical).toContain('docker');
      expect(keywords.technical).toContain('postgresql');
    });

    test('extracts soft skills correctly', () => {
      const keywords = extractKeywords(sampleJobDescription);
      
      expect(keywords.soft).toContain('problem-solving');
      expect(keywords.soft).toContain('leadership');
    });

    test('handles empty input gracefully', () => {
      const keywords = extractKeywords('');
      
      expect(keywords.technical).toEqual([]);
      expect(keywords.soft).toEqual([]);
      expect(keywords.other).toEqual([]);
    });

    test('handles null input gracefully', () => {
      const keywords = extractKeywords(null);
      
      expect(keywords.technical).toEqual([]);
      expect(keywords.soft).toEqual([]);
      expect(keywords.other).toEqual([]);
    });

    test('extracts other keywords', () => {
      const keywords = extractKeywords(sampleJobDescription);
      
      expect(keywords.other.length).toBeGreaterThan(0);
      expect(keywords.other).toContain('engineer');
      expect(keywords.other).toContain('experience');
    });
  });

  describe('calculateMatchScore', () => {
    test('calculates correct match score', () => {
      const jobKeywords = extractKeywords(sampleJobDescription);
      const score = calculateMatchScore(jobKeywords, sampleResume);
      
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(typeof score).toBe('number');
    });

    test('returns 0 for empty inputs', () => {
      const score = calculateMatchScore(null, '');
      expect(score).toBe(0);
    });

    test('returns higher score for better matches', () => {
      const jobKeywords = extractKeywords('React Node.js AWS Docker');
      const highMatchResume = 'Expert in React, Node.js, AWS, and Docker development';
      const lowMatchResume = 'Experience with PHP and MySQL databases';
      
      const highScore = calculateMatchScore(jobKeywords, highMatchResume);
      const lowScore = calculateMatchScore(jobKeywords, lowMatchResume);
      
      expect(highScore).toBeGreaterThan(lowScore);
    });
  });

  describe('prioritizeContent', () => {
    test('prioritizes content with keyword matches', () => {
      const jobKeywords = extractKeywords('React Node.js AWS');
      const resumeContent = `
        Experience with React development
        
        Built applications with Node.js
        
        Worked with Python and Django
        
        Deployed on AWS infrastructure
      `;
      
      const prioritized = prioritizeContent(resumeContent, jobKeywords);
      
      expect(Array.isArray(prioritized)).toBe(true);
      expect(prioritized.length).toBeGreaterThan(0);
      expect(prioritized[0]).toHaveProperty('content');
      expect(prioritized[0]).toHaveProperty('matchScore');
      expect(prioritized[0]).toHaveProperty('priority');
    });

    test('sorts by match score descending', () => {
      const jobKeywords = extractKeywords('React');
      const resumeContent = `
        Experience with Vue.js
        
        Expert in React development with 5 years experience
        
        Python programming background
      `;
      
      const prioritized = prioritizeContent(resumeContent, jobKeywords);
      
      // First item should have highest match score
      expect(prioritized[0].matchScore).toBeGreaterThanOrEqual(prioritized[1].matchScore);
    });

    test('handles empty content gracefully', () => {
      const jobKeywords = extractKeywords('React');
      const prioritized = prioritizeContent('', jobKeywords);
      
      expect(Array.isArray(prioritized)).toBe(true);
    });
  });

  describe('extractHardSkills', () => {
    test('extracts hard skills from job description', () => {
      const hardSkills = extractHardSkills(sampleJobDescription);
      
      expect(Array.isArray(hardSkills)).toBe(true);
      expect(hardSkills.length).toBeLessThanOrEqual(15);
      expect(hardSkills).toContain('javascript');
      expect(hardSkills).toContain('react');
      expect(hardSkills).toContain('aws');
    });

    test('limits to 15 skills maximum', () => {
      const longJobDescription = `
        JavaScript TypeScript React Angular Vue Node.js Express Django Flask
        Python Java C++ C# Go Rust Swift Kotlin Scala Ruby PHP
        PostgreSQL MySQL MongoDB Redis Docker Kubernetes AWS Azure GCP
      `;
      
      const hardSkills = extractHardSkills(longJobDescription);
      expect(hardSkills.length).toBeLessThanOrEqual(15);
    });

    test('handles empty input', () => {
      const hardSkills = extractHardSkills('');
      expect(hardSkills).toEqual([]);
    });
  });
});