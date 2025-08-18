/**
 * Smart Data Enhancement Service
 * Provides AI-powered skill suggestions, gap analysis, and data quality improvements
 */

import winston from 'winston';
import OpenAI from 'openai';
import { supabase } from '../config/database.js';
import { AdvancedValidationService } from './advanced-validation.js';
import { DataProcessingService } from '../utils/data-processing.js';
import openaiProtection from '../utils/openai-protection.js';

export class SmartEnhancementService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/smart-enhancement.log' })
      ]
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.validationService = new AdvancedValidationService();
    this.processingService = new DataProcessingService();

    // Circuit breaker for OpenAI API protection
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 3, // Open circuit after 3 failures
      cooldownPeriod: 5 * 60 * 1000 // 5 minutes cooldown
    };

    // Industry skill mappings and common patterns
    this.industrySkills = new Map([
      ['software', ['JavaScript', 'Python', 'React', 'Node.js', 'Docker', 'AWS', 'Git']],
      ['data', ['Python', 'SQL', 'TensorFlow', 'Pandas', 'Jupyter', 'Machine Learning']],
      ['devops', ['Docker', 'Kubernetes', 'AWS', 'Jenkins', 'Terraform', 'Linux']],
      ['frontend', ['JavaScript', 'React', 'Vue.js', 'CSS', 'HTML', 'TypeScript']],
      ['backend', ['Node.js', 'Python', 'Java', 'PostgreSQL', 'API Development']],
      ['management', ['Leadership', 'Project Management', 'Agile', 'Scrum', 'Team Leadership']],
      ['design', ['UI/UX', 'Figma', 'Adobe Creative Suite', 'Design Systems']],
      ['marketing', ['Digital Marketing', 'SEO', 'Google Analytics', 'Content Marketing']]
    ]);
  }

  /**
   * Suggest skills based on job description (AI functionality disabled)
   * @param {Object} jobData - Job data including title, description, org
   * @param {Object} options - Enhancement options
   * @returns {Object} Skill suggestions and analysis
   */
  async suggestSkills(jobData, options = {}) {
    try {
      this.logger.info('Generating skill suggestions (AI disabled, rule-based only)', { 
        jobId: jobData.id,
        title: jobData.title?.substring(0, 50)
      });

      let { includeAI = true, maxSuggestions = 15, confidenceThreshold = 0.6 } = options;

      // Get industry context (doesn't use API)
      const industryContext = await this.analyzeIndustryContext(jobData);

      // AI-powered suggestions are permanently disabled to prevent API abuse
      let aiSuggestions = [];
      this.logger.info('AI skill suggestions permanently disabled to prevent OpenAI API abuse', {
        jobId: jobData.id,
        requestedAI: includeAI,
        message: 'Using rule-based suggestions only'
      });

      // Protection service usage preserved for future re-implementation
      // const requestKey = `skill-suggestions-${jobData.id}`;
      // const protection = openaiProtection.canMakeRequest(requestKey);
      // if (protection.allowed) {
      //   try {
      //     openaiProtection.registerRequest(requestKey);
      //     aiSuggestions = await this.generateAISkillSuggestions(jobData, industryContext);
      //     openaiProtection.recordSuccess(requestKey);
      //   } catch (error) {
      //     openaiProtection.recordFailure(error, requestKey);
      //   }
      // }

      // Generate rule-based suggestions
      const ruleBased = this.generateRuleBasedSuggestions(jobData, industryContext);

      // Combine and rank suggestions (only rule-based now)
      const combinedSuggestions = this.combineAndRankSuggestions(
        aiSuggestions, // Always empty array
        ruleBased, 
        jobData.skills || []
      );

      // Filter by confidence and limit
      const filteredSuggestions = combinedSuggestions
        .filter(s => s.confidence >= confidenceThreshold)
        .slice(0, maxSuggestions);

      // Categorize suggestions
      const categorized = this.processingService.categorizeSkills(
        filteredSuggestions.map(s => s.skill)
      );

      return {
        suggestions: filteredSuggestions,
        categorized,
        industryContext,
        analysis: {
          currentSkillsCount: (jobData.skills || []).length,
          suggestedSkillsCount: filteredSuggestions.length,
          confidence: this.calculateOverallConfidence(filteredSuggestions),
          sources: {
            ai: 0, // Always 0 - AI disabled
            ruleBased: ruleBased.length
          }
        },
        recommendations: this.generateSkillRecommendations(jobData, filteredSuggestions)
      };

    } catch (error) {
      this.logger.error('Error generating skill suggestions', {
        error: error.message,
        jobId: jobData.id
      });
      throw error;
    }
  }

  /**
   * Identify and analyze timeline gaps
   * @param {Array} jobs - All job data
   * @returns {Object} Gap analysis with suggestions
   */
  async identifyTimelineGaps(jobs) {
    try {
      this.logger.info('Analyzing timeline gaps', { jobCount: jobs.length });

      const gapAnalysis = this.validationService.identifyTimelineGaps(jobs);
      
      // Enhance gaps with suggestions
      const enhancedGaps = await Promise.all(
        gapAnalysis.map(async (gap) => {
          const suggestions = await this.generateGapSuggestions(gap, jobs);
          return { ...gap, suggestions };
        })
      );

      // Calculate gap impact scores
      const gapImpact = this.calculateGapImpact(enhancedGaps);

      // Generate overall recommendations
      const recommendations = this.generateGapRecommendations(enhancedGaps, gapImpact);

      return {
        gaps: enhancedGaps,
        overlaps: gapAnalysis.overlaps,
        impact: gapImpact,
        recommendations,
        summary: {
          totalGaps: enhancedGaps.length,
          totalGapMonths: Math.round(gapAnalysis.totalGapDays / 30),
          criticalGaps: enhancedGaps.filter(g => g.severity === 'high').length,
          averageGapMonths: enhancedGaps.length > 0 
            ? Math.round(gapAnalysis.totalGapDays / 30 / enhancedGaps.length) 
            : 0
        }
      };

    } catch (error) {
      this.logger.error('Error analyzing timeline gaps', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate comprehensive data quality report (AI enhancements disabled)
   * @param {Array} jobs - All job data
   * @returns {Object} Comprehensive quality report
   */
  async generateDataQualityReport(jobs) {
    try {
      this.logger.info('Generating data quality report (AI enhancements disabled)', { jobCount: jobs.length });

      // Run comprehensive validation
      const qualityReport = this.validationService.validateDataQuality(jobs);

      // Add enhancement suggestions (AI disabled)
      this.logger.info('AI enhancements permanently disabled in data quality reports to prevent OpenAI API abuse');
      const enhancements = await this.suggestDataEnhancements(jobs, qualityReport, { includeAI: false });

      // Calculate improvement potential
      const improvementPotential = this.calculateImprovementPotential(qualityReport);

      return {
        ...qualityReport,
        enhancements,
        improvementPotential,
        actionPlan: this.generateActionPlan(qualityReport, enhancements),
        estimatedImprovementTime: this.estimateImprovementTime(enhancements)
      };

    } catch (error) {
      this.logger.error('Error generating data quality report', { error: error.message });
      throw error;
    }
  }

  /**
   * Generate AI-powered skill suggestions (DISABLED)
   * @param {Object} jobData - Job data
   * @param {Object} industryContext - Industry context
   * @returns {Array} AI-generated skill suggestions (always empty)
   */
  async generateAISkillSuggestions(jobData, industryContext) {
    // AI skill suggestions permanently disabled to prevent OpenAI API abuse
    this.logger.info('AI skill suggestions disabled - returning empty array', {
      jobId: jobData.id,
      message: 'Use rule-based suggestions only'
    });

    // Original OpenAI API call commented out for future re-implementation:
    // try {
    //   const prompt = this.buildSkillSuggestionPrompt(jobData, industryContext);
    //   const completion = await this.openai.chat.completions.create({
    //     model: 'gpt-4',
    //     messages: [
    //       {
    //         role: 'system',
    //         content: 'You are an expert career advisor and technical skills analyst. Analyze job descriptions and suggest relevant technical and professional skills that would be associated with the role.'
    //       },
    //       {
    //         role: 'user',
    //         content: prompt
    //       }
    //     ],
    //     max_tokens: 800,
    //     temperature: 0.3
    //   });
    //   const response = completion.choices[0]?.message?.content;
    //   if (!response) return [];
    //   return this.parseAISkillSuggestions(response);
    // } catch (error) {
    //   this.logger.error('Error generating AI skill suggestions', { error: error.message });
    //   return [];
    // }

    return []; // Always return empty array
  }

  /**
   * Build prompt for AI skill suggestions
   * @param {Object} jobData - Job data
   * @param {Object} industryContext - Industry context
   * @returns {string} Formatted prompt
   */
  buildSkillSuggestionPrompt(jobData, industryContext) {
    const currentSkills = jobData.skills ? jobData.skills.join(', ') : 'None listed';
    
    return `
Analyze this job and suggest relevant skills:

Job Title: ${jobData.title}
Company: ${jobData.org}
Industry: ${industryContext.industry}
Job Type: ${industryContext.jobType}
Current Skills: ${currentSkills}

Job Description:
${jobData.description || 'No description provided'}

Based on this information, suggest 10-15 relevant technical and professional skills that someone in this role would likely need or develop. Consider:
1. Technical skills specific to the role and industry
2. Tools and technologies commonly used
3. Professional skills relevant to the seniority level
4. Skills that complement the existing skill set

Format your response as a JSON array of objects with this structure:
[
  {
    "skill": "Skill Name",
    "confidence": 0.85,
    "reasoning": "Why this skill is relevant",
    "category": "Technical/Professional/Tool"
  }
]

Only suggest skills not already in the current skills list.
`;
  }

  /**
   * Parse AI skill suggestions response
   * @param {string} response - AI response
   * @returns {Array} Parsed skill suggestions
   */
  parseAISkillSuggestions(response) {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) return [];

      const suggestions = JSON.parse(jsonMatch[0]);
      
      return suggestions
        .filter(s => s.skill && s.confidence && s.confidence > 0.5)
        .map(s => ({
          skill: this.processingService.normalizeSkill(s.skill),
          confidence: Math.min(s.confidence, 0.95), // Cap AI confidence
          source: 'ai',
          reasoning: s.reasoning,
          category: s.category
        }));

    } catch (error) {
      this.logger.warn('Error parsing AI skill suggestions', { error: error.message });
      return [];
    }
  }

  /**
   * Generate rule-based skill suggestions
   * @param {Object} jobData - Job data
   * @param {Object} industryContext - Industry context
   * @returns {Array} Rule-based skill suggestions
   */
  generateRuleBasedSuggestions(jobData, industryContext) {
    const suggestions = [];
    const currentSkills = (jobData.skills || []).map(s => s.toLowerCase());

    // Industry-based suggestions
    if (this.industrySkills.has(industryContext.industry)) {
      const industrySkillList = this.industrySkills.get(industryContext.industry);
      industrySkillList.forEach(skill => {
        if (!currentSkills.includes(skill.toLowerCase())) {
          suggestions.push({
            skill,
            confidence: 0.7,
            source: 'industry',
            reasoning: `Common skill in ${industryContext.industry} industry`
          });
        }
      });
    }

    // Title-based suggestions
    const titleSuggestions = this.extractSkillsFromTitle(jobData.title, currentSkills);
    suggestions.push(...titleSuggestions);

    // Description-based suggestions
    if (jobData.description) {
      const descriptionSuggestions = this.extractSkillsFromDescription(
        jobData.description, 
        currentSkills
      );
      suggestions.push(...descriptionSuggestions);
    }

    // Seniority-based suggestions
    const senioritySuggestions = this.getSeniorityBasedSkills(
      jobData.title, 
      industryContext.seniority,
      currentSkills
    );
    suggestions.push(...senioritySuggestions);

    return suggestions;
  }

  /**
   * Analyze industry and job context
   * @param {Object} jobData - Job data
   * @returns {Object} Industry context analysis
   */
  analyzeIndustryContext(jobData) {
    const title = (jobData.title || '').toLowerCase();
    const org = (jobData.org || '').toLowerCase();
    const description = (jobData.description || '').toLowerCase();

    // Determine industry
    let industry = 'general';
    if (title.includes('software') || title.includes('developer') || title.includes('engineer')) {
      industry = 'software';
    } else if (title.includes('data') || title.includes('analyst') || title.includes('scientist')) {
      industry = 'data';
    } else if (title.includes('devops') || title.includes('infrastructure')) {
      industry = 'devops';
    } else if (title.includes('manager') || title.includes('director') || title.includes('lead')) {
      industry = 'management';
    } else if (title.includes('design') || title.includes('ux') || title.includes('ui')) {
      industry = 'design';
    }

    // Determine job type
    let jobType = 'individual_contributor';
    if (title.includes('manager') || title.includes('director') || title.includes('vp')) {
      jobType = 'management';
    } else if (title.includes('lead') || title.includes('senior') || title.includes('principal')) {
      jobType = 'senior';
    }

    // Determine seniority level
    let seniority = 'mid';
    if (title.includes('junior') || title.includes('entry') || title.includes('associate')) {
      seniority = 'junior';
    } else if (title.includes('senior') || title.includes('principal') || title.includes('staff')) {
      seniority = 'senior';
    } else if (title.includes('director') || title.includes('vp') || title.includes('chief')) {
      seniority = 'executive';
    }

    return { industry, jobType, seniority };
  }

  /**
   * Extract skills from job title
   * @param {string} title - Job title
   * @param {Array} currentSkills - Current skills (lowercase)
   * @returns {Array} Skill suggestions
   */
  extractSkillsFromTitle(title, currentSkills) {
    const suggestions = [];
    const titleLower = title.toLowerCase();

    // Technology-specific patterns
    const techPatterns = [
      { pattern: /react/i, skill: 'React', confidence: 0.9 },
      { pattern: /node\.?js/i, skill: 'Node.js', confidence: 0.9 },
      { pattern: /python/i, skill: 'Python', confidence: 0.9 },
      { pattern: /java(?!script)/i, skill: 'Java', confidence: 0.9 },
      { pattern: /javascript/i, skill: 'JavaScript', confidence: 0.9 },
      { pattern: /aws/i, skill: 'AWS', confidence: 0.8 },
      { pattern: /docker/i, skill: 'Docker', confidence: 0.8 },
      { pattern: /kubernetes/i, skill: 'Kubernetes', confidence: 0.8 }
    ];

    techPatterns.forEach(({ pattern, skill, confidence }) => {
      if (pattern.test(titleLower) && !currentSkills.includes(skill.toLowerCase())) {
        suggestions.push({
          skill,
          confidence,
          source: 'title',
          reasoning: `Mentioned in job title: ${title}`
        });
      }
    });

    return suggestions;
  }

  /**
   * Extract skills from job description
   * @param {string} description - Job description
   * @param {Array} currentSkills - Current skills (lowercase)
   * @returns {Array} Skill suggestions
   */
  extractSkillsFromDescription(description, currentSkills) {
    const suggestions = [];
    const descLower = description.toLowerCase();

    // Common skill patterns in descriptions
    const skillPatterns = [
      { pattern: /\b(react|reactjs)\b/gi, skill: 'React', confidence: 0.85 },
      { pattern: /\b(vue|vuejs)\b/gi, skill: 'Vue.js', confidence: 0.85 },
      { pattern: /\bangular\b/gi, skill: 'Angular', confidence: 0.85 },
      { pattern: /\b(node\.?js|nodejs)\b/gi, skill: 'Node.js', confidence: 0.85 },
      { pattern: /\btypescript\b/gi, skill: 'TypeScript', confidence: 0.8 },
      { pattern: /\b(postgresql|postgres)\b/gi, skill: 'PostgreSQL', confidence: 0.8 },
      { pattern: /\bmongodb\b/gi, skill: 'MongoDB', confidence: 0.8 },
      { pattern: /\b(machine learning|ml)\b/gi, skill: 'AI/ML', confidence: 0.8 },
      { pattern: /\bkubernetes\b/gi, skill: 'Kubernetes', confidence: 0.8 },
      { pattern: /\bdocker\b/gi, skill: 'Docker', confidence: 0.8 },
      { pattern: /\b(agile|scrum)\b/gi, skill: 'Agile', confidence: 0.7 },
      { pattern: /\bgit\b/gi, skill: 'Git', confidence: 0.7 }
    ];

    skillPatterns.forEach(({ pattern, skill, confidence }) => {
      if (pattern.test(descLower) && !currentSkills.includes(skill.toLowerCase())) {
        suggestions.push({
          skill,
          confidence,
          source: 'description',
          reasoning: `Mentioned in job description`
        });
      }
    });

    return suggestions;
  }

  /**
   * Get seniority-based skill suggestions
   * @param {string} title - Job title
   * @param {string} seniority - Seniority level
   * @param {Array} currentSkills - Current skills (lowercase)
   * @returns {Array} Skill suggestions
   */
  getSeniorityBasedSkills(title, seniority, currentSkills) {
    const suggestions = [];

    const senioritySkills = {
      junior: ['Git', 'Documentation', 'Testing'],
      mid: ['Code Review', 'CI/CD', 'System Design'],
      senior: ['Architecture', 'Mentoring', 'Technical Leadership'],
      executive: ['Strategic Planning', 'Stakeholder Management', 'Budget Management']
    };

    if (senioritySkills[seniority]) {
      senioritySkills[seniority].forEach(skill => {
        if (!currentSkills.includes(skill.toLowerCase())) {
          suggestions.push({
            skill,
            confidence: 0.6,
            source: 'seniority',
            reasoning: `Common skill for ${seniority} level positions`
          });
        }
      });
    }

    return suggestions;
  }

  /**
   * Combine and rank skill suggestions
   * @param {Array} aiSuggestions - AI-generated suggestions
   * @param {Array} ruleBased - Rule-based suggestions
   * @param {Array} currentSkills - Current skills
   * @returns {Array} Combined and ranked suggestions
   */
  combineAndRankSuggestions(aiSuggestions, ruleBased, currentSkills) {
    const skillMap = new Map();
    const currentSkillsLower = currentSkills.map(s => s.toLowerCase());

    // Add AI suggestions
    aiSuggestions.forEach(suggestion => {
      const key = suggestion.skill.toLowerCase();
      if (!currentSkillsLower.includes(key)) {
        skillMap.set(key, {
          ...suggestion,
          sources: ['ai']
        });
      }
    });

    // Add rule-based suggestions (merge if already exists)
    ruleBased.forEach(suggestion => {
      const key = suggestion.skill.toLowerCase();
      if (!currentSkillsLower.includes(key)) {
        if (skillMap.has(key)) {
          const existing = skillMap.get(key);
          existing.confidence = Math.max(existing.confidence, suggestion.confidence);
          existing.sources.push(suggestion.source);
          if (suggestion.reasoning && !existing.reasoning.includes(suggestion.reasoning)) {
            existing.reasoning += '; ' + suggestion.reasoning;
          }
        } else {
          skillMap.set(key, {
            ...suggestion,
            sources: [suggestion.source]
          });
        }
      }
    });

    // Convert to array and sort by confidence
    return Array.from(skillMap.values())
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate overall confidence score
   * @param {Array} suggestions - Skill suggestions
   * @returns {number} Overall confidence
   */
  calculateOverallConfidence(suggestions) {
    if (suggestions.length === 0) return 0;
    
    const avgConfidence = suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length;
    return Math.round(avgConfidence * 100) / 100;
  }

  /**
   * Generate skill recommendations
   * @param {Object} jobData - Job data
   * @param {Array} suggestions - Skill suggestions
   * @returns {Array} Recommendations
   */
  generateSkillRecommendations(jobData, suggestions) {
    const recommendations = [];

    if (suggestions.length === 0) {
      recommendations.push({
        type: 'no_suggestions',
        priority: 'low',
        message: 'Consider adding more details to the job description for better skill suggestions'
      });
    } else {
      const highConfidence = suggestions.filter(s => s.confidence > 0.8);
      if (highConfidence.length > 0) {
        recommendations.push({
          type: 'high_confidence',
          priority: 'high',
          message: `${highConfidence.length} highly relevant skills identified`,
          skills: highConfidence.slice(0, 5).map(s => s.skill)
        });
      }

      const aiSuggestions = suggestions.filter(s => s.sources.includes('ai'));
      if (aiSuggestions.length > 0) {
        recommendations.push({
          type: 'ai_enhanced',
          priority: 'medium',
          message: `AI analysis suggests ${aiSuggestions.length} additional relevant skills`,
          skills: aiSuggestions.slice(0, 3).map(s => s.skill)
        });
      }
    }

    return recommendations;
  }

  /**
   * Generate gap suggestions for timeline gaps
   * @param {Object} gap - Timeline gap
   * @param {Array} jobs - All jobs for context
   * @returns {Array} Gap filling suggestions
   */
  async generateGapSuggestions(gap, jobs) {
    const suggestions = [];

    // Education suggestions
    if (gap.durationMonths >= 6) {
      suggestions.push({
        type: 'education',
        activity: 'Formal Education',
        description: 'Consider adding any degrees, certifications, or courses completed during this period',
        priority: gap.durationMonths >= 24 ? 'high' : 'medium'
      });
    }

    // Freelance/consulting suggestions
    if (gap.durationMonths >= 3) {
      suggestions.push({
        type: 'freelance',
        activity: 'Freelance/Consulting Work',
        description: 'Add any independent projects, consulting, or contract work',
        priority: 'medium'
      });
    }

    // Personal projects
    suggestions.push({
      type: 'projects',
      activity: 'Personal Projects',
      description: 'Include any significant personal or open-source projects',
      priority: 'low'
    });

    return suggestions;
  }

  /**
   * Calculate gap impact on career narrative
   * @param {Array} gaps - Timeline gaps
   * @returns {Object} Gap impact analysis
   */
  calculateGapImpact(gaps) {
    const totalGapMonths = gaps.reduce((sum, gap) => sum + gap.durationMonths, 0);
    const maxGap = gaps.length > 0 ? Math.max(...gaps.map(g => g.durationMonths)) : 0;
    
    let impact = 'low';
    if (totalGapMonths > 24 || maxGap > 12) {
      impact = 'high';
    } else if (totalGapMonths > 12 || maxGap > 6) {
      impact = 'medium';
    }

    return {
      level: impact,
      totalGapMonths,
      maxGapMonths: maxGap,
      gapCount: gaps.length,
      narrativeImpact: this.assessNarrativeImpact(gaps)
    };
  }

  /**
   * Assess narrative impact of gaps
   * @param {Array} gaps - Timeline gaps
   * @returns {string} Narrative impact assessment
   */
  assessNarrativeImpact(gaps) {
    const recentGaps = gaps.filter(gap => {
      const gapEnd = new Date(gap.end);
      const fiveYearsAgo = new Date();
      fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
      return gapEnd > fiveYearsAgo;
    });

    if (recentGaps.length > 0 && recentGaps.some(g => g.durationMonths > 6)) {
      return 'Recent significant gaps may require explanation';
    } else if (gaps.length > 3) {
      return 'Multiple gaps create inconsistent employment pattern';
    } else if (gaps.some(g => g.durationMonths > 12)) {
      return 'Extended gaps may raise questions about career continuity';
    } else {
      return 'Gaps are within normal range and unlikely to impact narrative';
    }
  }

  /**
   * Generate gap recommendations
   * @param {Array} gaps - Enhanced gaps
   * @param {Object} gapImpact - Gap impact analysis
   * @returns {Array} Recommendations
   */
  generateGapRecommendations(gaps, gapImpact) {
    const recommendations = [];

    if (gapImpact.level === 'high') {
      recommendations.push({
        priority: 'high',
        action: 'Address significant employment gaps',
        details: 'Add education, projects, or other activities to fill major gaps',
        impact: 'Improves career narrative continuity'
      });
    }

    const recentGaps = gaps.filter(gap => {
      const gapEnd = new Date(gap.end);
      const twoYearsAgo = new Date();
      twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      return gapEnd > twoYearsAgo;
    });

    if (recentGaps.length > 0) {
      recommendations.push({
        priority: 'medium',
        action: 'Explain recent gaps',
        details: 'Provide context for gaps in the last 2 years',
        impact: 'Addresses potential recruiter concerns'
      });
    }

    return recommendations;
  }

  /**
   * Suggest data enhancements based on quality report (AI disabled)
   * @param {Array} jobs - All jobs
   * @param {Object} qualityReport - Quality validation report
   * @param {Object} options - Enhancement options (AI permanently disabled)
   * @returns {Object} Enhancement suggestions
   */
  async suggestDataEnhancements(jobs, qualityReport, options = {}) {
    const enhancements = {
      skills: [],
      descriptions: [],
      completeness: [],
      consistency: []
    };

    // Skills enhancements - PERMANENTLY DISABLED to prevent bulk OpenAI API calls
    const jobsWithFewSkills = qualityReport.jobs.filter(
      job => job.quality.scores.skills < 0.5
    );
    
    this.logger.info('AI skill enhancement suggestions permanently disabled to prevent OpenAI API abuse', {
      jobsWithFewSkills: jobsWithFewSkills.length,
      requestedAI: options.includeAI,
      message: 'Use individual skill suggestion API endpoint for selective AI suggestions'
    });
    
    // Only add basic job info without AI suggestions
    for (const jobData of jobsWithFewSkills.slice(0, 10)) { // Limit to 10 for UI purposes
      const job = jobs.find(j => j.id === jobData.id);
      if (job) {
        enhancements.skills.push({
          jobId: job.id,
          title: job.title,
          currentSkillsCount: (job.skills || []).length,
          suggestions: [], // Empty - no AI suggestions
          message: 'Use individual skill suggestion feature for AI-powered suggestions'
        });
      }
    }

    // Description enhancements
    const jobsWithPoorDescriptions = qualityReport.jobs.filter(
      job => job.quality.scores.description < 0.5
    );
    
    jobsWithPoorDescriptions.forEach(jobData => {
      const job = jobs.find(j => j.id === jobData.id);
      if (job) {
        enhancements.descriptions.push({
          jobId: job.id,
          title: job.title,
          currentLength: (job.description || '').length,
          suggestions: [
            'Add specific achievements and metrics',
            'Include key responsibilities and technologies used',
            'Describe the impact and scope of your work'
          ]
        });
      }
    });

    return enhancements;
  }

  /**
   * Calculate improvement potential
   * @param {Object} qualityReport - Quality report
   * @returns {Object} Improvement potential analysis
   */
  calculateImprovementPotential(qualityReport) {
    const currentScore = qualityReport.overall.score;
    
    // Calculate potential score if all recommendations were implemented
    let potentialScore = currentScore;
    
    // Skills improvements
    const poorSkillJobs = qualityReport.jobs.filter(j => j.quality.scores.skills < 0.5).length;
    potentialScore += (poorSkillJobs / qualityReport.summary.totalJobs) * 0.1;
    
    // Description improvements
    const poorDescJobs = qualityReport.jobs.filter(j => j.quality.scores.description < 0.5).length;
    potentialScore += (poorDescJobs / qualityReport.summary.totalJobs) * 0.15;
    
    // Completeness improvements
    const incompleteJobs = qualityReport.jobs.filter(j => j.quality.scores.completeness < 0.7).length;
    potentialScore += (incompleteJobs / qualityReport.summary.totalJobs) * 0.1;

    potentialScore = Math.min(potentialScore, 1.0);

    return {
      current: Math.round(currentScore * 100),
      potential: Math.round(potentialScore * 100),
      improvement: Math.round((potentialScore - currentScore) * 100),
      grade: this.validationService.getQualityGrade(potentialScore)
    };
  }

  /**
   * Generate action plan for improvements
   * @param {Object} qualityReport - Quality report
   * @param {Object} enhancements - Enhancement suggestions
   * @returns {Array} Action plan
   */
  generateActionPlan(qualityReport, enhancements) {
    const actions = [];

    // High priority: Fix critical errors
    if (qualityReport.summary.criticalIssues > 0) {
      actions.push({
        priority: 1,
        category: 'Critical Fixes',
        action: `Fix ${qualityReport.summary.criticalIssues} critical validation errors`,
        impact: 'high',
        estimatedTime: '30 minutes'
      });
    }

    // Medium priority: Improve poor quality jobs
    if (qualityReport.summary.poorQuality > 0) {
      actions.push({
        priority: 2,
        category: 'Quality Improvement',
        action: `Enhance ${qualityReport.summary.poorQuality} low-quality job entries`,
        impact: 'medium',
        estimatedTime: `${qualityReport.summary.poorQuality * 10} minutes`
      });
    }

    // Skills enhancements
    if (enhancements.skills.length > 0) {
      actions.push({
        priority: 3,
        category: 'Skills Enhancement',
        action: `Add suggested skills to ${enhancements.skills.length} positions`,
        impact: 'medium',
        estimatedTime: `${enhancements.skills.length * 5} minutes`
      });
    }

    return actions.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Estimate improvement time
   * @param {Object} enhancements - Enhancement suggestions
   * @returns {Object} Time estimates
   */
  estimateImprovementTime(enhancements) {
    const estimates = {
      skills: enhancements.skills.length * 5, // 5 minutes per job
      descriptions: enhancements.descriptions.length * 15, // 15 minutes per description
      completeness: enhancements.completeness.length * 3, // 3 minutes per field
      consistency: enhancements.consistency.length * 2 // 2 minutes per fix
    };

    const totalMinutes = Object.values(estimates).reduce((sum, time) => sum + time, 0);

    return {
      byCategory: estimates,
      total: {
        minutes: totalMinutes,
        hours: Math.round(totalMinutes / 60 * 10) / 10,
        estimate: totalMinutes < 60 ? `${totalMinutes} minutes` : `${Math.round(totalMinutes / 60 * 10) / 10} hours`
      }
    };
  }

  /**
   * Get OpenAI protection status for debugging
   */
  getProtectionStatus() {
    return openaiProtection.getUsageStats();
  }
}

export default SmartEnhancementService;