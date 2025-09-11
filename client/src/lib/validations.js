// client/src/lib/validations.js
// Zod validation schemas for resume generator

import { z } from 'zod';

// Job Description validation schema
export const jobDescriptionSchema = z.object({
  content: z
    .string()
    .min(50, 'Job description must be at least 50 characters long')
    .max(10000, 'Job description cannot exceed 10,000 characters')
    .refine(
      (content) => {
        // Check for common JD indicators
        const indicators = [
          'responsibilities',
          'requirements',
          'qualifications', 
          'experience',
          'skills',
          'job',
          'role',
          'position'
        ];
        const lowerContent = content.toLowerCase();
        return indicators.some(indicator => lowerContent.includes(indicator));
      },
      'Content does not appear to be a valid job description'
    ),
  title: z.string().optional(),
  company: z.string().optional()
});

// Resume generation options schema
export const resumeGenerationSchema = z.object({
  jobDescription: jobDescriptionSchema,
  style: z.enum(['professional', 'modern', 'minimal']).default('professional'),
  includeSkillsMatch: z.boolean().default(true),
  maxBulletPoints: z.number().min(3).max(8).default(5),
  prioritizeKeywords: z.boolean().default(true)
});

// Export options schema
export const exportOptionsSchema = z.object({
  format: z.enum(['docx', 'pdf']),
  fileName: z.string().min(1).max(100).optional(),
  includeHeader: z.boolean().default(true),
  fontSize: z.number().min(10).max(16).default(11),
  margin: z.enum(['narrow', 'normal', 'wide']).default('normal')
});

// Validation helper functions
export const validateJobDescription = (content) => {
  try {
    return jobDescriptionSchema.parse({ content });
  } catch (error) {
    if (error.issues && error.issues.length > 0) {
      throw new Error(error.issues[0].message);
    }
    throw new Error('Invalid job description');
  }
};

export const validateResumeGeneration = (data) => {
  try {
    return resumeGenerationSchema.parse(data);
  } catch (error) {
    throw new Error(error.errors[0]?.message || 'Invalid resume generation options');
  }
};

export const validateExportOptions = (options) => {
  try {
    return exportOptionsSchema.parse(options);
  } catch (error) {
    throw new Error(error.errors[0]?.message || 'Invalid export options');
  }
};