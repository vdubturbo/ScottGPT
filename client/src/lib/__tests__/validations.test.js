// client/src/lib/__tests__/validations.test.js
// Unit tests for validation schemas

import {
  validateJobDescription,
  validateResumeGeneration,
  validateExportOptions,
  jobDescriptionSchema,
  resumeGenerationSchema,
  exportOptionsSchema
} from '../validations';

describe('Validation Schemas', () => {
  describe('jobDescriptionSchema', () => {
    test('validates valid job description', () => {
      const validJD = {
        content: 'We are looking for a software engineer with experience in JavaScript and React. The candidate should have strong problem-solving skills and at least 3 years of experience.'
      };
      
      const result = jobDescriptionSchema.parse(validJD);
      expect(result.content).toBe(validJD.content);
    });

    test('rejects job description that is too short', () => {
      const shortJD = { content: 'Too short' };
      
      expect(() => {
        jobDescriptionSchema.parse(shortJD);
      }).toThrow('Job description must be at least 50 characters long');
    });

    test('rejects job description that is too long', () => {
      const longJD = { content: 'a'.repeat(10001) };
      
      expect(() => {
        jobDescriptionSchema.parse(longJD);
      }).toThrow('Job description cannot exceed 10,000 characters');
    });

    test('rejects content that does not appear to be a job description', () => {
      const invalidJD = { content: 'This is just random text that does not contain any related keywords or indicators.' };
      
      expect(() => {
        jobDescriptionSchema.parse(invalidJD);
      }).toThrow('Content does not appear to be a valid job description');
    });

    test('accepts optional title and company', () => {
      const jdWithExtras = {
        content: 'Software engineer position requiring JavaScript skills and experience with modern frameworks.',
        title: 'Senior Software Engineer',
        company: 'Tech Corp'
      };
      
      const result = jobDescriptionSchema.parse(jdWithExtras);
      expect(result.title).toBe('Senior Software Engineer');
      expect(result.company).toBe('Tech Corp');
    });
  });

  describe('validateJobDescription', () => {
    test('validates and returns parsed job description', () => {
      const content = 'Software engineer role requiring programming skills and experience with web development technologies.';
      
      const result = validateJobDescription(content);
      expect(result.content).toBe(content);
    });

    test('throws meaningful error for invalid input', () => {
      expect(() => {
        validateJobDescription('short');
      }).toThrow('Job description must be at least 50 characters long');
    });
  });

  describe('resumeGenerationSchema', () => {
    test('validates valid resume generation options', () => {
      const validOptions = {
        jobDescription: {
          content: 'Software engineer position with JavaScript and React requirements for web development projects.'
        },
        style: 'professional',
        includeSkillsMatch: true,
        maxBulletPoints: 5,
        prioritizeKeywords: true
      };
      
      const result = resumeGenerationSchema.parse(validOptions);
      expect(result.style).toBe('professional');
      expect(result.includeSkillsMatch).toBe(true);
    });

    test('applies default values', () => {
      const minimalOptions = {
        jobDescription: {
          content: 'Software engineer position requiring programming skills and web development experience.'
        }
      };
      
      const result = resumeGenerationSchema.parse(minimalOptions);
      expect(result.style).toBe('professional');
      expect(result.includeSkillsMatch).toBe(true);
      expect(result.maxBulletPoints).toBe(5);
      expect(result.prioritizeKeywords).toBe(true);
    });

    test('validates style enum', () => {
      const invalidStyle = {
        jobDescription: {
          content: 'Software engineer position requiring programming skills.'
        },
        style: 'invalid-style'
      };
      
      expect(() => {
        resumeGenerationSchema.parse(invalidStyle);
      }).toThrow();
    });

    test('validates maxBulletPoints range', () => {
      const tooManyBullets = {
        jobDescription: {
          content: 'Software engineer position requiring programming skills.'
        },
        maxBulletPoints: 10
      };
      
      expect(() => {
        resumeGenerationSchema.parse(tooManyBullets);
      }).toThrow();
    });
  });

  describe('exportOptionsSchema', () => {
    test('validates valid export options', () => {
      const validOptions = {
        format: 'pdf',
        fileName: 'my-resume',
        includeHeader: true,
        fontSize: 11,
        margin: 'normal'
      };
      
      const result = exportOptionsSchema.parse(validOptions);
      expect(result.format).toBe('pdf');
      expect(result.fileName).toBe('my-resume');
    });

    test('applies default values', () => {
      const minimalOptions = {
        format: 'docx'
      };
      
      const result = exportOptionsSchema.parse(minimalOptions);
      expect(result.includeHeader).toBe(true);
      expect(result.fontSize).toBe(11);
      expect(result.margin).toBe('normal');
    });

    test('validates format enum', () => {
      const invalidFormat = {
        format: 'txt'
      };
      
      expect(() => {
        exportOptionsSchema.parse(invalidFormat);
      }).toThrow();
    });

    test('validates fontSize range', () => {
      const invalidFontSize = {
        format: 'pdf',
        fontSize: 8
      };
      
      expect(() => {
        exportOptionsSchema.parse(invalidFontSize);
      }).toThrow();
    });

    test('validates fileName length', () => {
      const longFileName = {
        format: 'pdf',
        fileName: 'a'.repeat(101)
      };
      
      expect(() => {
        exportOptionsSchema.parse(longFileName);
      }).toThrow();
    });
  });

  describe('validateResumeGeneration', () => {
    test('validates and returns parsed resume generation options', () => {
      const options = {
        jobDescription: {
          content: 'Software engineer position requiring JavaScript skills and programming experience.'
        },
        style: 'modern'
      };
      
      const result = validateResumeGeneration(options);
      expect(result.style).toBe('modern');
    });

    test('throws meaningful error for invalid input', () => {
      const invalidOptions = {
        jobDescription: {
          content: 'short'
        }
      };
      
      expect(() => {
        validateResumeGeneration(invalidOptions);
      }).toThrow();
    });
  });

  describe('validateExportOptions', () => {
    test('validates and returns parsed export options', () => {
      const options = {
        format: 'docx',
        fontSize: 12
      };
      
      const result = validateExportOptions(options);
      expect(result.format).toBe('docx');
      expect(result.fontSize).toBe(12);
    });

    test('throws meaningful error for invalid input', () => {
      expect(() => {
        validateExportOptions({ format: 'invalid' });
      }).toThrow();
    });
  });
});