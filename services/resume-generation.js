/**
 * Resume Generation Service
 * Creates professional resumes in multiple formats using existing data
 * Integrates with OpenAI for content enhancement and formatting
 */

import winston from 'winston';
// import OpenAI from 'openai'; // DISABLED: AI features temporarily disabled for cost protection
import { DataExportService } from './data-export.js';
import EmbeddingService from './embeddings.js';
// import openaiProtection from '../utils/openai-protection.js'; // DISABLED: No longer needed
import fs from 'fs/promises';
import path from 'path';

export class ResumeGenerationService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/resume-generation.log' })
      ]
    });

    // this.openai = new OpenAI({ // DISABLED: AI features temporarily disabled
    //   apiKey: process.env.OPENAI_API_KEY
    // });

    this.exportService = new DataExportService();
    this.embeddingService = new EmbeddingService();

    // Resume templates and styles
    this.templates = {
      professional: {
        name: 'Professional',
        description: 'Clean, traditional format suitable for corporate environments',
        features: ['Conservative styling', 'Clear sections', 'ATS-friendly']
      },
      modern: {
        name: 'Modern',
        description: 'Contemporary design with subtle styling elements',
        features: ['Modern typography', 'Strategic use of color', 'Visual hierarchy']
      },
      technical: {
        name: 'Technical',
        description: 'Optimized for technical roles with emphasis on skills',
        features: ['Detailed technical skills', 'Project highlights', 'Code samples']
      },
      executive: {
        name: 'Executive',
        description: 'Sophisticated format for leadership positions',
        features: ['Leadership focus', 'Strategic achievements', 'Board-ready']
      }
    };

    // Supported output formats
    this.outputFormats = {
      markdown: { extension: 'md', mimeType: 'text/markdown' },
      html: { extension: 'html', mimeType: 'text/html' },
      pdf: { extension: 'pdf', mimeType: 'application/pdf' },
      docx: { extension: 'docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    };
  }

  /**
   * Generate a complete resume from user data
   * @param {Object} options - Resume generation options
   * @returns {Object} Generated resume content and metadata
   */
  async generateResume(options = {}) {
    try {
      const {
        template = 'professional',
        outputFormat = 'markdown',
        targetRole = null,
        maxPositions = 8,
        skillCategories = 'auto',
        includeProjects = true,
        includeEducation = true,
        customSections = [],
        enhanceContent = true, // User option preserved but ignored
        personalInfo = {}
      } = options;

      // AI enhancement permanently disabled to prevent OpenAI API abuse
      const actualEnhanceContent = false;

      this.logger.info('Generating resume (AI enhancement disabled)', { 
        template, 
        outputFormat, 
        targetRole,
        maxPositions,
        requestedEnhancement: enhanceContent,
        actualEnhancement: actualEnhanceContent,
        message: 'AI content enhancement permanently disabled to prevent OpenAI API abuse'
      });

      // Get optimized resume data
      const resumeData = await this.exportService.exportResumeData({
        maxJobs: maxPositions,
        skillLimit: 50,
        includeOutcomes: true,
        minDurationMonths: 1
      });

      // AI enhancement disabled - use original data
      let enhancedData = resumeData;
      this.logger.info('Skipping AI content enhancement', {
        message: 'Resume generation continues with original data only'
      });

      // Protection service code preserved for future re-implementation:
      // if (actualEnhanceContent) {
      //   const requestKey = `resume-enhancement-${Date.now()}`;
      //   const protection = openaiProtection.canMakeRequest(requestKey);
      //   if (protection.allowed) {
      //     try {
      //       openaiProtection.registerRequest(requestKey);
      //       enhancedData = await this.enhanceResumeContent(resumeData, targetRole);
      //       openaiProtection.recordSuccess(requestKey);
      //     } catch (error) {
      //       openaiProtection.recordFailure(error, requestKey);
      //       this.logger.error('Error enhancing resume content', { error: error.message });
      //       enhancedData = resumeData;
      //     }
      //   } else {
      //     this.logger.warn('Resume enhancement blocked by protection service', { 
      //       reason: protection.reason 
      //     });
      //     enhancedData = resumeData;
      //   }
      // }

      // Build resume structure
      const resumeStructure = await this.buildResumeStructure(
        enhancedData, 
        template, 
        personalInfo,
        {
          targetRole,
          skillCategories,
          includeProjects,
          includeEducation,
          customSections
        }
      );

      // Generate content in requested format
      const content = await this.formatResume(resumeStructure, outputFormat, template);

      // Generate metadata
      const metadata = {
        generatedAt: new Date().toISOString(),
        template,
        outputFormat,
        targetRole,
        positionsIncluded: enhancedData.positions.length,
        skillsIncluded: enhancedData.skills.top.length,
        enhancementRequested: enhanceContent,
        enhancementUsed: false, // Always false - AI enhancement disabled
        estimatedAtsScore: await this.calculateAtsScore(resumeStructure),
        wordCount: this.countWords(content),
        sections: Object.keys(resumeStructure),
        aiDisabledReason: 'AI content enhancement permanently disabled to prevent OpenAI API abuse'
      };

      return {
        content,
        metadata,
        resumeData: enhancedData,
        structure: resumeStructure,
        recommendations: await this.generateResumeRecommendations(resumeStructure, targetRole)
      };

    } catch (error) {
      this.logger.error('Error generating resume', { error: error.message });
      throw error;
    }
  }

  /**
   * Enhance resume content using AI (DISABLED)
   * @param {Object} resumeData - Raw resume data
   * @param {string} targetRole - Target role for optimization
   * @returns {Object} Original resume data unchanged
   */
  async enhanceResumeContent(resumeData, targetRole) {
    // AI enhancement permanently disabled to prevent OpenAI API abuse
    this.logger.info('Resume content enhancement disabled - returning original data', { 
      targetRole,
      message: 'AI content enhancement permanently disabled to prevent OpenAI API abuse'
    });

    // Original AI enhancement code preserved for future re-implementation:
    // try {
    //   this.logger.info('Enhancing resume content with AI', { targetRole });
    //   const enhancedPositions = await Promise.all(
    //     resumeData.positions.map(async (position) => {
    //       const enhancedPosition = await this.enhancePositionContent(position, targetRole);
    //       return enhancedPosition;
    //     })
    //   );
    //   const enhancedSummary = await this.generateProfessionalSummary(
    //     resumeData.profile, 
    //     resumeData.skills.top, 
    //     targetRole
    //   );
    //   const optimizedSkills = await this.optimizeSkillsForRole(
    //     resumeData.skills, 
    //     targetRole
    //   );
    //   return {
    //     ...resumeData,
    //     positions: enhancedPositions,
    //     profile: {
    //       ...resumeData.profile,
    //       enhancedSummary
    //     },
    //     skills: optimizedSkills
    //   };
    // } catch (error) {
    //   this.logger.error('Error enhancing resume content', { error: error.message });
    //   return resumeData;
    // }

    // Return original data unchanged
    return resumeData;
  }

  /**
   * Enhance individual position content (DISABLED)
   */
  async enhancePositionContent(position, targetRole) {
    // AI position enhancement permanently disabled to prevent OpenAI API abuse
    this.logger.info('Position enhancement disabled - returning original position', {
      positionId: position.id,
      targetRole,
      message: 'AI position enhancement permanently disabled to prevent OpenAI API abuse'
    });

    // Original OpenAI API call code preserved for future re-implementation:
    // const requestKey = `position-enhancement-${position.id}-${Date.now()}`;
    // const protection = openaiProtection.canMakeRequest(requestKey);
    // if (!protection.allowed) {
    //   this.logger.warn('Position enhancement blocked by protection service', { 
    //     positionId: position.id, 
    //     reason: protection.reason 
    //   });
    //   return position;
    // }
    // try {
    //   openaiProtection.registerRequest(requestKey);
    //   const prompt = this.buildPositionEnhancementPrompt(position, targetRole);
    //   const completion = await this.openai.chat.completions.create({
    //     model: 'gpt-4',
    //     messages: [
    //       {
    //         role: 'system',
    //         content: 'You are an expert resume writer. Enhance job descriptions to be more compelling and achievement-focused while maintaining accuracy.'
    //       },
    //       {
    //         role: 'user',
    //         content: prompt
    //       }
    //     ],
    //     max_tokens: 500,
    //     temperature: 0.3
    //   });
    //   const enhancedContent = completion.choices[0]?.message?.content;
    //   if (!enhancedContent) {
    //     openaiProtection.recordSuccess(requestKey);
    //     return position;
    //   }
    //   const parsed = this.parseEnhancedPosition(enhancedContent);
    //   openaiProtection.recordSuccess(requestKey);
    //   return {
    //     ...position,
    //     enhancedSummary: parsed.summary || position.summary,
    //     enhancedAchievements: parsed.achievements || position.keyAchievements,
    //     optimizedForRole: targetRole
    //   };
    // } catch (error) {
    //   openaiProtection.recordFailure(error, requestKey);
    //   this.logger.error('Error enhancing position content', { 
    //     positionId: position.id, 
    //     error: error.message 
    //   });
    //   return position;
    // }

    // Return original position unchanged
    return position;
  }

  /**
   * Generate professional summary (DISABLED)
   */
  async generateProfessionalSummary(profile, topSkills, targetRole) {
    // AI professional summary generation permanently disabled to prevent OpenAI API abuse
    this.logger.info('Professional summary generation disabled - returning null', {
      targetRole,
      message: 'AI professional summary generation permanently disabled to prevent OpenAI API abuse'
    });

    // Original OpenAI API call code preserved for future re-implementation:
    // const requestKey = `professional-summary-${Date.now()}`;
    // const protection = openaiProtection.canMakeRequest(requestKey);
    // if (!protection.allowed) {
    //   this.logger.warn('Professional summary generation blocked by protection service', { 
    //     reason: protection.reason 
    //   });
    //   return null;
    // }
    // try {
    //   openaiProtection.registerRequest(requestKey);
    //   const prompt = `Create a compelling professional summary for a resume targeting ${targetRole || 'senior technical roles'}.
    //
    // Current Profile:
    // - Total Experience: ${profile.totalExperienceYears} years
    // - Top Skills: ${topSkills.slice(0, 10).map(s => s.skill).join(', ')}
    // - Industries: ${profile.primaryIndustries.join(', ')}
    // - Experience Level: ${profile.experienceLevel}
    //
    // Create a 3-4 sentence professional summary that:
    // 1. Highlights years of experience and key expertise
    // 2. Mentions most relevant skills for the target role
    // 3. Emphasizes leadership/impact where appropriate
    // 4. Uses strong action words and quantifiable impact
    //
    // Keep it professional, concise, and compelling.`;
    //   const completion = await this.openai.chat.completions.create({
    //     model: 'gpt-4',
    //     messages: [
    //       {
    //         role: 'system',
    //         content: 'You are an expert resume writer specializing in professional summaries that get results.'
    //       },
    //       {
    //         role: 'user',
    //         content: prompt
    //       }
    //     ],
    //     max_tokens: 200,
    //     temperature: 0.4
    //   });
    //   const result = completion.choices[0]?.message?.content || null;
    //   openaiProtection.recordSuccess(requestKey);
    //   return result;
    // } catch (error) {
    //   openaiProtection.recordFailure(error, requestKey);
    //   this.logger.error('Error generating professional summary', { error: error.message });
    //   return null;
    // }

    // Always return null - no AI-generated summary
    return null;
  }

  /**
   * Optimize skills for target role (DISABLED)
   */
  async optimizeSkillsForRole(skills, targetRole) {
    // AI skills optimization permanently disabled to prevent OpenAI API abuse
    this.logger.info('Skills optimization disabled - returning original skills', {
      targetRole,
      message: 'AI skills optimization permanently disabled to prevent OpenAI API abuse'
    });

    // Original OpenAI API call code preserved for future re-implementation:
    // if (!targetRole) return skills;
    // const requestKey = `skills-optimization-${targetRole}-${Date.now()}`;
    // const protection = openaiProtection.canMakeRequest(requestKey);
    // if (!protection.allowed) {
    //   this.logger.warn('Skills optimization blocked by protection service', { 
    //     targetRole, 
    //     reason: protection.reason 
    //   });
    //   return skills;
    // }
    // try {
    //   openaiProtection.registerRequest(requestKey);
    //   const prompt = `Given these skills and a target role of "${targetRole}", rank the top 15 most relevant skills.
    //
    // Available Skills: ${skills.top.map(s => s.skill).join(', ')}
    //
    // Return only a comma-separated list of the most relevant skills in order of importance for the role.`;
    //   const completion = await this.openai.chat.completions.create({
    //     model: 'gpt-4',
    //     messages: [
    //       {
    //         role: 'system',
    //         content: 'You are a technical recruiter expert at matching skills to job requirements.'
    //       },
    //       {
    //         role: 'user',
    //         content: prompt
    //       }
    //     ],
    //     max_tokens: 150,
    //     temperature: 0.2
    //   });
    //   const optimizedSkillsText = completion.choices[0]?.message?.content;
    //   if (!optimizedSkillsText) {
    //     openaiProtection.recordSuccess(requestKey);
    //     return skills;
    //   }
    //   const optimizedSkillNames = optimizedSkillsText
    //     .split(',')
    //     .map(s => s.trim())
    //     .filter(s => s.length > 0);
    //   const optimizedSkills = optimizedSkillNames.map(skillName => {
    //     const originalSkill = skills.top.find(s => s.skill === skillName);
    //     return originalSkill || { skill: skillName, frequency: 1 };
    //   });
    //   openaiProtection.recordSuccess(requestKey);
    //   return {
    //     ...skills,
    //     top: optimizedSkills,
    //     optimizedFor: targetRole
    //   };
    // } catch (error) {
    //   openaiProtection.recordFailure(error, requestKey);
    //   this.logger.error('Error optimizing skills for role', { error: error.message });
    //   return skills;
    // }

    // Return original skills unchanged
    return skills;
  }

  /**
   * Build resume structure based on template and data
   */
  async buildResumeStructure(resumeData, template, personalInfo, options) {
    const structure = {
      header: this.buildHeaderSection(personalInfo),
      summary: this.buildSummarySection(resumeData.profile),
      experience: this.buildExperienceSection(resumeData.positions, template),
      skills: this.buildSkillsSection(resumeData.skills, options.skillCategories),
      education: options.includeEducation ? this.buildEducationSection() : null,
      projects: options.includeProjects ? this.buildProjectsSection(resumeData.positions) : null,
      customSections: this.buildCustomSections(options.customSections)
    };

    // Filter out null sections
    return Object.fromEntries(
      Object.entries(structure).filter(([key, value]) => value !== null)
    );
  }

  /**
   * Build header section
   */
  buildHeaderSection(personalInfo) {
    return {
      name: personalInfo.name || 'Scott Lovett',
      title: personalInfo.title || 'Senior Technology Leader',
      contact: {
        email: personalInfo.email || '',
        phone: personalInfo.phone || '',
        location: personalInfo.location || 'Atlanta, GA',
        linkedin: personalInfo.linkedin || '',
        website: personalInfo.website || '',
        github: personalInfo.github || ''
      }
    };
  }

  /**
   * Build summary section
   */
  buildSummarySection(profile) {
    return {
      enhanced: profile.enhancedSummary,
      fallback: this.generateFallbackSummary(profile),
      keyHighlights: [
        `${profile.totalExperienceYears}+ years of experience`,
        `${profile.organizationCount} organizations`,
        `${profile.primaryIndustries.join(', ')} expertise`
      ]
    };
  }

  /**
   * Build experience section
   */
  buildExperienceSection(positions, template) {
    return positions.map(position => ({
      title: position.title,
      organization: position.organization,
      location: position.location,
      duration: position.duration,
      startDate: position.startDate,
      endDate: position.endDate,
      summary: position.enhancedSummary || position.summary,
      achievements: position.enhancedAchievements || position.keyAchievements,
      skills: position.skills.slice(0, 8), // Limit skills per position
      isCurrent: position.isCurrentPosition,
      template: template
    }));
  }

  /**
   * Build skills section
   */
  buildSkillsSection(skills, categorization) {
    if (categorization === 'auto' && skills.categorized) {
      return {
        type: 'categorized',
        categories: skills.categorized
      };
    } else {
      return {
        type: 'list',
        skills: skills.top.slice(0, 20).map(s => s.skill)
      };
    }
  }

  /**
   * Build education section (placeholder - would integrate with education data)
   */
  buildEducationSection() {
    return {
      degrees: [],
      certifications: [],
      placeholder: true,
      note: 'Education data would be integrated here'
    };
  }

  /**
   * Build projects section from job outcomes
   */
  buildProjectsSection(positions) {
    const projects = [];
    
    positions.forEach(position => {
      if (position.keyAchievements && position.keyAchievements.length > 0) {
        position.keyAchievements.forEach(achievement => {
          if (achievement.length > 50) { // Substantial achievements
            projects.push({
              title: `${position.title} Initiative`,
              organization: position.organization,
              description: achievement,
              timeframe: position.duration,
              skills: position.skills.slice(0, 5)
            });
          }
        });
      }
    });

    return projects.slice(0, 6); // Limit to 6 key projects
  }

  /**
   * Build custom sections
   */
  buildCustomSections(customSections) {
    return customSections.map(section => ({
      title: section.title,
      content: section.content,
      type: section.type || 'text'
    }));
  }

  /**
   * Format resume in requested output format
   */
  async formatResume(structure, outputFormat, template) {
    switch (outputFormat) {
      case 'markdown':
        return this.formatAsMarkdown(structure, template);
      case 'html':
        return this.formatAsHTML(structure, template);
      case 'pdf':
        return await this.formatAsPDF(structure, template);
      case 'docx':
        return await this.formatAsDocx(structure, template);
      default:
        throw new Error(`Unsupported output format: ${outputFormat}`);
    }
  }

  /**
   * Format as Markdown
   */
  formatAsMarkdown(structure, template) {
    let markdown = '';

    // Header
    markdown += `# ${structure.header.name}\n`;
    if (structure.header.title) {
      markdown += `## ${structure.header.title}\n`;
    }
    markdown += '\n';

    // Contact
    const contact = structure.header.contact;
    const contactInfo = [
      contact.email,
      contact.phone,
      contact.location,
      contact.linkedin,
      contact.website
    ].filter(Boolean);
    
    if (contactInfo.length > 0) {
      markdown += `**Contact:** ${contactInfo.join(' • ')}\n\n`;
    }

    // Summary
    if (structure.summary) {
      markdown += '## Professional Summary\n\n';
      const summary = structure.summary.enhanced || structure.summary.fallback;
      markdown += `${summary}\n\n`;
    }

    // Experience
    if (structure.experience && structure.experience.length > 0) {
      markdown += '## Professional Experience\n\n';
      
      structure.experience.forEach(job => {
        markdown += `### ${job.title}\n`;
        markdown += `**${job.organization}** • ${job.location} • ${job.duration}\n\n`;
        
        if (job.summary) {
          markdown += `${job.summary}\n\n`;
        }
        
        if (job.achievements && job.achievements.length > 0) {
          markdown += '**Key Achievements:**\n';
          job.achievements.forEach(achievement => {
            markdown += `- ${achievement}\n`;
          });
          markdown += '\n';
        }
        
        if (job.skills && job.skills.length > 0) {
          markdown += `**Technologies:** ${job.skills.join(', ')}\n\n`;
        }
      });
    }

    // Skills
    if (structure.skills) {
      markdown += '## Core Competencies\n\n';
      
      if (structure.skills.type === 'categorized') {
        Object.entries(structure.skills.categories).forEach(([category, skills]) => {
          if (skills.length > 0) {
            markdown += `**${category}:** ${skills.join(', ')}\n\n`;
          }
        });
      } else {
        markdown += `${structure.skills.skills.join(' • ')}\n\n`;
      }
    }

    // Projects
    if (structure.projects && structure.projects.length > 0) {
      markdown += '## Key Projects & Initiatives\n\n';
      
      structure.projects.forEach(project => {
        markdown += `### ${project.title}\n`;
        markdown += `**${project.organization}** • ${project.timeframe}\n\n`;
        markdown += `${project.description}\n\n`;
        if (project.skills && project.skills.length > 0) {
          markdown += `**Technologies:** ${project.skills.join(', ')}\n\n`;
        }
      });
    }

    return markdown;
  }

  /**
   * Format as HTML
   */
  formatAsHTML(structure, template) {
    // This would generate a complete HTML resume
    // For now, convert markdown to basic HTML
    const markdown = this.formatAsMarkdown(structure, template);
    
    // Basic markdown to HTML conversion
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${structure.header.name} - Resume</title>
    <style>
        body { 
            font-family: 'Arial', sans-serif; 
            line-height: 1.6; 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            color: #333;
        }
        h1 { color: #2c3e50; border-bottom: 2px solid #3498db; }
        h2 { color: #34495e; margin-top: 30px; }
        h3 { color: #7f8c8d; }
        .contact { margin-bottom: 20px; }
        .achievements { margin: 10px 0; }
        .achievements li { margin-bottom: 5px; }
    </style>
</head>
<body>`;

    // Convert basic markdown elements to HTML
    html += markdown
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^\*\*(.+?)\*\*/gm, '<strong>$1</strong>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^<p>/, '<p>')
      .replace(/<\/p>$/, '</p>');

    html += '</body></html>';
    
    return html;
  }

  /**
   * Format as PDF (placeholder - would use PDF generation library)
   */
  async formatAsPDF(structure, template) {
    // This would use a library like Puppeteer or PDFKit
    throw new Error('PDF generation not yet implemented - would require additional dependencies');
  }

  /**
   * Format as DOCX (placeholder - would use DOCX generation library)
   */
  async formatAsDocx(structure, template) {
    // This would use a library like docx or officegen
    throw new Error('DOCX generation not yet implemented - would require additional dependencies');
  }

  /**
   * Calculate ATS (Applicant Tracking System) score
   */
  async calculateAtsScore(structure) {
    let score = 0;
    let maxScore = 100;

    // Check for essential sections
    if (structure.header && structure.header.name) score += 10;
    if (structure.summary) score += 15;
    if (structure.experience && structure.experience.length > 0) score += 25;
    if (structure.skills) score += 20;

    // Check content quality
    if (structure.experience) {
      const avgAchievements = structure.experience.reduce((sum, job) => 
        sum + (job.achievements ? job.achievements.length : 0), 0) / structure.experience.length;
      
      if (avgAchievements >= 2) score += 10;
      if (avgAchievements >= 3) score += 5;
    }

    // Check for contact information
    const contact = structure.header.contact;
    if (contact.email) score += 5;
    if (contact.phone) score += 5;
    if (contact.linkedin) score += 5;

    return Math.min(score, maxScore);
  }

  /**
   * Generate resume recommendations
   */
  async generateResumeRecommendations(structure, targetRole) {
    const recommendations = [];

    // Check length
    const wordCount = this.countWords(JSON.stringify(structure));
    if (wordCount < 300) {
      recommendations.push({
        type: 'content',
        priority: 'high',
        message: 'Resume content is quite brief - consider adding more detail to achievements'
      });
    } else if (wordCount > 800) {
      recommendations.push({
        type: 'content',
        priority: 'medium',
        message: 'Resume is quite lengthy - consider condensing to key achievements'
      });
    }

    // Check for achievements
    const totalAchievements = structure.experience?.reduce((sum, job) => 
      sum + (job.achievements ? job.achievements.length : 0), 0) || 0;
    
    if (totalAchievements < structure.experience?.length * 2) {
      recommendations.push({
        type: 'achievements',
        priority: 'high',
        message: 'Add more quantifiable achievements to each position'
      });
    }

    // Check contact information
    const contact = structure.header.contact;
    if (!contact.linkedin) {
      recommendations.push({
        type: 'contact',
        priority: 'medium',
        message: 'Consider adding LinkedIn profile for better networking'
      });
    }

    // Target role specific recommendations
    if (targetRole) {
      recommendations.push({
        type: 'optimization',
        priority: 'medium',
        message: `Review skills and experience relevance to ${targetRole} role`
      });
    }

    return recommendations;
  }

  /**
   * Helper methods
   */

  buildPositionEnhancementPrompt(position, targetRole) {
    return `Enhance this job description for a resume targeting ${targetRole || 'senior roles'}:

Position: ${position.title} at ${position.organization}
Current Summary: ${position.summary || 'No summary provided'}
Current Achievements: ${(position.keyAchievements || []).join('; ') || 'None listed'}
Skills Used: ${(position.skills || []).join(', ')}

Create an enhanced version with:
1. A compelling 1-2 sentence summary emphasizing impact
2. 3-4 bullet points of quantifiable achievements
3. Focus on results and leadership where appropriate

Format as:
SUMMARY: [enhanced summary]
ACHIEVEMENTS:
- [achievement 1]
- [achievement 2]
- [achievement 3]`;
  }

  parseEnhancedPosition(content) {
    const lines = content.split('\n');
    let summary = '';
    const achievements = [];
    let currentSection = '';

    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith('SUMMARY:')) {
        summary = trimmed.replace('SUMMARY:', '').trim();
        currentSection = 'summary';
      } else if (trimmed.startsWith('ACHIEVEMENTS:')) {
        currentSection = 'achievements';
      } else if (trimmed.startsWith('- ') && currentSection === 'achievements') {
        achievements.push(trimmed.replace('- ', ''));
      }
    });

    return { summary, achievements };
  }

  generateFallbackSummary(profile) {
    return `Experienced ${profile.experienceLevel} professional with ${profile.totalExperienceYears}+ years in ${profile.primaryIndustries.join(' and ')}. Proven track record across ${profile.organizationCount} organizations with expertise in ${profile.topSkills.slice(0, 5).join(', ')}.`;
  }

  countWords(text) {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get available templates
   */
  getAvailableTemplates() {
    return this.templates;
  }

  /**
   * Get supported output formats
   */
  getSupportedFormats() {
    return this.outputFormats;
  }

  /**
   * Get OpenAI protection status for debugging
   */
  getProtectionStatus() {
    return openaiProtection.getUsageStats();
  }
}

export default ResumeGenerationService;