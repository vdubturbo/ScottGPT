/**
 * Advanced Data Validation Service
 * Extends basic validation with content quality scoring, advanced duplicate detection,
 * and comprehensive data health analysis
 */

import winston from 'winston';
import DataValidationService from './data-validation.js';
import DataProcessingService from '../utils/data-processing.js';

export class AdvancedValidationService extends DataValidationService {
  constructor() {
    super();
    this.processingService = new DataProcessingService();
    
    // Content quality scoring weights
    this.qualityWeights = {
      description: 0.3,
      skills: 0.25,
      duration: 0.2,
      completeness: 0.15,
      consistency: 0.1
    };

    // Quality thresholds
    this.qualityThresholds = {
      excellent: 0.85,
      good: 0.7,
      fair: 0.5,
      poor: 0.3
    };
  }

  /**
   * Comprehensive data validation with quality scoring
   * @param {Array} jobs - All job data
   * @returns {Object} Comprehensive validation report
   */
  validateDataQuality(jobs) {
    const report = {
      overall: {
        score: 0,
        grade: 'Poor',
        issues: [],
        recommendations: []
      },
      jobs: [],
      timeline: this.validateTimeline(jobs),
      duplicates: this.detectAdvancedDuplicates(jobs),
      skills: this.analyzeSkillsConsistency(jobs),
      gaps: this.identifyTimelineGaps(jobs),
      summary: {
        totalJobs: jobs.length,
        excellentQuality: 0,
        goodQuality: 0,
        fairQuality: 0,
        poorQuality: 0,
        criticalIssues: 0,
        warnings: 0
      }
    };

    // Validate each job with quality scoring
    jobs.forEach((job, index) => {
      const jobValidation = this.validateJobWithQuality(job, jobs);
      report.jobs.push({
        index,
        id: job.id,
        title: job.title,
        org: job.org,
        validation: jobValidation.validation,
        quality: jobValidation.quality
      });

      // Update summary counts
      const grade = jobValidation.quality.grade;
      switch (grade) {
        case 'Excellent': report.summary.excellentQuality++; break;
        case 'Good': report.summary.goodQuality++; break;
        case 'Fair': report.summary.fairQuality++; break;
        case 'Poor': report.summary.poorQuality++; break;
      }

      report.summary.criticalIssues += jobValidation.validation.errors.length;
      report.summary.warnings += jobValidation.validation.warnings.length;
    });

    // Calculate overall quality score
    report.overall = this.calculateOverallQuality(report);

    this.logger.info('Data quality validation completed', {
      totalJobs: jobs.length,
      overallScore: report.overall.score,
      criticalIssues: report.summary.criticalIssues
    });

    return report;
  }

  /**
   * Validate individual job with quality scoring
   * @param {Object} job - Job data
   * @param {Array} allJobs - All jobs for context
   * @returns {Object} Validation with quality score
   */
  validateJobWithQuality(job, allJobs) {
    // Standard validation
    const validation = this.validateJobData(job, allJobs);

    // Quality scoring
    const quality = this.calculateContentQuality(job);

    return { validation, quality };
  }

  /**
   * Calculate content quality score for a job
   * @param {Object} job - Job data
   * @returns {Object} Quality analysis
   */
  calculateContentQuality(job) {
    const scores = {
      description: this.scoreDescription(job.description),
      skills: this.scoreSkills(job.skills),
      duration: this.scoreDuration(job.date_start, job.date_end),
      completeness: this.scoreCompleteness(job),
      consistency: this.scoreConsistency(job)
    };

    // Calculate weighted overall score
    const overallScore = Object.entries(scores).reduce((total, [category, score]) => {
      return total + (score * this.qualityWeights[category]);
    }, 0);

    const grade = this.getQualityGrade(overallScore);
    const issues = this.identifyQualityIssues(job, scores);

    return {
      score: Math.round(overallScore * 100) / 100,
      grade,
      scores,
      issues,
      recommendations: this.generateQualityRecommendations(job, scores)
    };
  }

  /**
   * Score job description quality
   * @param {string} description - Job description
   * @returns {number} Score 0-1
   */
  scoreDescription(description) {
    if (!description || description.trim().length === 0) return 0;

    const text = description.trim();
    let score = 0.2; // Base score for having description

    // Length scoring
    if (text.length >= 100) score += 0.2;
    if (text.length >= 300) score += 0.2;
    if (text.length >= 500) score += 0.1;

    // Content quality indicators
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length >= 3) score += 0.1;

    // Action verbs and achievements
    const actionVerbs = [
      'led', 'managed', 'developed', 'implemented', 'created', 'designed',
      'improved', 'optimized', 'achieved', 'delivered', 'built', 'established'
    ];
    const hasActionVerbs = actionVerbs.some(verb => 
      text.toLowerCase().includes(verb)
    );
    if (hasActionVerbs) score += 0.1;

    // Numbers and metrics
    const hasMetrics = /\d+[%\$]?/.test(text) || 
                      /\b(million|thousand|billion|percent)\b/i.test(text);
    if (hasMetrics) score += 0.1;

    return Math.min(score, 1);
  }

  /**
   * Score skills quality
   * @param {Array} skills - Skills array
   * @returns {number} Score 0-1
   */
  scoreSkills(skills) {
    if (!Array.isArray(skills) || skills.length === 0) return 0;

    let score = 0.2; // Base score for having skills

    // Quantity scoring
    if (skills.length >= 3) score += 0.2;
    if (skills.length >= 5) score += 0.2;
    if (skills.length >= 8) score += 0.1;

    // Quality indicators
    const normalizedSkills = this.processingService.normalizeSkills(skills);
    const categories = this.processingService.categorizeSkills(normalizedSkills);
    const categoryCount = Object.keys(categories).length;

    // Diversity bonus
    if (categoryCount >= 2) score += 0.1;
    if (categoryCount >= 3) score += 0.1;

    // Penalty for too many skills
    if (skills.length > 20) score -= 0.1;

    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * Score employment duration appropriateness
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {number} Score 0-1
   */
  scoreDuration(startDate, endDate) {
    if (!startDate) return 0;

    const durationMonths = this.processingService.calculateDuration(startDate, endDate);
    
    // Optimal duration scoring (bell curve around 12-36 months)
    if (durationMonths < 1) return 0.1;
    if (durationMonths < 3) return 0.3;
    if (durationMonths < 6) return 0.5;
    if (durationMonths < 12) return 0.7;
    if (durationMonths <= 36) return 1.0;
    if (durationMonths <= 60) return 0.9;
    if (durationMonths <= 120) return 0.7;
    return 0.5; // Very long tenures
  }

  /**
   * Score data completeness
   * @param {Object} job - Job data
   * @returns {number} Score 0-1
   */
  scoreCompleteness(job) {
    const fields = ['title', 'org', 'date_start', 'description', 'skills', 'location'];
    const requiredFields = ['title', 'org', 'date_start'];
    const optionalFields = ['description', 'skills', 'location'];

    let score = 0;

    // Required fields (60% of score)
    const requiredScore = requiredFields.every(field => 
      job[field] && job[field].toString().trim().length > 0
    ) ? 0.6 : 0;
    score += requiredScore;

    // Optional fields (40% of score)
    const optionalScore = optionalFields.reduce((total, field) => {
      if (job[field]) {
        if (field === 'skills' && Array.isArray(job[field])) {
          return total + (job[field].length > 0 ? 0.133 : 0);
        } else if (typeof job[field] === 'string') {
          return total + (job[field].trim().length > 0 ? 0.133 : 0);
        }
      }
      return total;
    }, 0);
    score += optionalScore;

    return Math.min(score, 1);
  }

  /**
   * Score data consistency
   * @param {Object} job - Job data
   * @returns {number} Score 0-1
   */
  scoreConsistency(job) {
    let score = 1.0;

    // Check for consistent formatting
    if (job.title && job.title !== job.title.trim()) score -= 0.1;
    if (job.org && job.org !== job.org.trim()) score -= 0.1;

    // Check for reasonable date formats
    if (job.date_start && !this._isValidDate(job.date_start)) score -= 0.2;
    if (job.date_end && job.date_end !== null && !this._isValidDate(job.date_end)) score -= 0.2;

    // Check for consistent casing
    if (job.title && job.title === job.title.toUpperCase()) score -= 0.1;
    if (job.org && job.org === job.org.toUpperCase()) score -= 0.1;

    // Check for duplicate skills
    if (job.skills && Array.isArray(job.skills)) {
      const uniqueSkills = new Set(job.skills.map(s => s.toLowerCase()));
      if (uniqueSkills.size < job.skills.length) score -= 0.1;
    }

    return Math.max(score, 0);
  }

  /**
   * Get quality grade from score
   * @param {number} score - Quality score 0-1
   * @returns {string} Quality grade
   */
  getQualityGrade(score) {
    if (score >= this.qualityThresholds.excellent) return 'Excellent';
    if (score >= this.qualityThresholds.good) return 'Good';
    if (score >= this.qualityThresholds.fair) return 'Fair';
    return 'Poor';
  }

  /**
   * Identify specific quality issues
   * @param {Object} job - Job data
   * @param {Object} scores - Quality scores
   * @returns {Array} Quality issues
   */
  identifyQualityIssues(job, scores) {
    const issues = [];

    if (scores.description < 0.3) {
      issues.push({
        category: 'description',
        severity: 'warning',
        message: 'Job description is too brief or missing key details'
      });
    }

    if (scores.skills < 0.3) {
      issues.push({
        category: 'skills',
        severity: 'warning',
        message: 'Limited skills listed for this position'
      });
    }

    if (scores.duration < 0.3) {
      issues.push({
        category: 'duration',
        severity: 'info',
        message: 'Unusual employment duration detected'
      });
    }

    if (scores.completeness < 0.7) {
      issues.push({
        category: 'completeness',
        severity: 'warning',
        message: 'Missing important job details'
      });
    }

    if (scores.consistency < 0.8) {
      issues.push({
        category: 'consistency',
        severity: 'info',
        message: 'Data formatting could be improved'
      });
    }

    return issues;
  }

  /**
   * Generate quality improvement recommendations
   * @param {Object} job - Job data
   * @param {Object} scores - Quality scores
   * @returns {Array} Recommendations
   */
  generateQualityRecommendations(job, scores) {
    const recommendations = [];

    if (scores.description < 0.5) {
      recommendations.push({
        category: 'description',
        priority: 'medium',
        action: 'Expand job description with specific achievements and responsibilities'
      });
    }

    if (scores.skills < 0.5) {
      recommendations.push({
        category: 'skills',
        priority: 'medium',
        action: 'Add more relevant skills and technologies used in this role'
      });
    }

    if (!job.location || job.location.trim() === '') {
      recommendations.push({
        category: 'completeness',
        priority: 'low',
        action: 'Add job location for better context'
      });
    }

    if (scores.consistency < 0.8) {
      recommendations.push({
        category: 'consistency',
        priority: 'low',
        action: 'Review data formatting and remove duplicates'
      });
    }

    return recommendations;
  }

  /**
   * Detect advanced duplicates with similarity analysis
   * @param {Array} jobs - All job data
   * @returns {Object} Advanced duplicate analysis
   */
  detectAdvancedDuplicates(jobs) {
    const duplicates = this.processingService.findDuplicates(jobs);
    
    // Enhanced duplicate detection
    const enhancedDuplicates = duplicates.map(duplicate => {
      const enhancement = this.analyzeDuplicateContext(duplicate);
      return { ...duplicate, ...enhancement };
    });

    // Group by confidence level
    const highConfidence = enhancedDuplicates.filter(d => d.similarity > 0.9);
    const mediumConfidence = enhancedDuplicates.filter(d => d.similarity > 0.7 && d.similarity <= 0.9);
    const lowConfidence = enhancedDuplicates.filter(d => d.similarity <= 0.7);

    return {
      total: enhancedDuplicates.length,
      highConfidence,
      mediumConfidence,
      lowConfidence,
      autoMergeable: highConfidence.filter(d => d.autoMergeable).length,
      requiresReview: mediumConfidence.length + highConfidence.filter(d => !d.autoMergeable).length
    };
  }

  /**
   * Analyze duplicate context for better recommendations
   * @param {Object} duplicate - Duplicate entry
   * @returns {Object} Enhanced duplicate analysis
   */
  analyzeDuplicateContext(duplicate) {
    const [job1, job2] = duplicate.jobs.map(j => j.job);
    
    const analysis = {
      autoMergeable: false,
      mergeStrategy: null,
      contextFactors: [],
      risks: []
    };

    // Check for auto-merge conditions
    if (duplicate.similarity > 0.95) {
      const sameTitle = job1.title === job2.title;
      const sameOrg = job1.org === job2.org;
      const sameDates = job1.date_start === job2.date_start && job1.date_end === job2.date_end;

      if (sameTitle && sameOrg && sameDates) {
        analysis.autoMergeable = true;
        analysis.mergeStrategy = 'exact_duplicate';
        analysis.contextFactors.push('Identical job details detected');
      }
    }

    // Identify context factors
    if (job1.org === job2.org) {
      analysis.contextFactors.push('Same organization');
    }

    if (this.datePeriodsOverlap(job1, job2)) {
      analysis.contextFactors.push('Overlapping time periods');
      analysis.risks.push('Timeline conflict');
    }

    // Skills analysis
    const skillsSimilarity = this.processingService.calculateSkillsSimilarity(
      job1.skills || [], job2.skills || []
    );
    if (skillsSimilarity > 0.8) {
      analysis.contextFactors.push('Very similar skill sets');
    }

    return analysis;
  }

  /**
   * Analyze skills consistency across all jobs
   * @param {Array} jobs - All job data
   * @returns {Object} Skills consistency analysis
   */
  analyzeSkillsConsistency(jobs) {
    const allSkills = jobs.flatMap(job => job.skills || []);
    const skillFrequency = {};
    const skillVariations = {};

    // Count skill frequency and detect variations
    allSkills.forEach(skill => {
      const normalized = skill.toLowerCase().trim();
      skillFrequency[normalized] = (skillFrequency[normalized] || 0) + 1;
      
      if (!skillVariations[normalized]) {
        skillVariations[normalized] = new Set();
      }
      skillVariations[normalized].add(skill);
    });

    // Find inconsistent skill names
    const inconsistencies = Object.entries(skillVariations)
      .filter(([_, variations]) => variations.size > 1)
      .map(([normalized, variations]) => ({
        skill: normalized,
        variations: Array.from(variations),
        frequency: skillFrequency[normalized],
        suggestedNormalization: this.processingService.normalizeSkill(normalized)
      }));

    return {
      totalSkills: Object.keys(skillFrequency).length,
      inconsistencies,
      topSkills: Object.entries(skillFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([skill, count]) => ({ skill, count }))
    };
  }

  /**
   * Identify timeline gaps with detailed analysis
   * @param {Array} jobs - All job data
   * @returns {Object} Timeline gap analysis
   */
  identifyTimelineGaps(jobs) {
    const validJobs = jobs
      .filter(job => job.date_start)
      .map(job => ({
        ...job,
        start: new Date(job.date_start),
        end: job.date_end ? new Date(job.date_end) : new Date()
      }))
      .sort((a, b) => a.start - b.start);

    const gaps = [];
    const overlaps = [];

    for (let i = 0; i < validJobs.length - 1; i++) {
      const current = validJobs[i];
      const next = validJobs[i + 1];

      if (current.end < next.start) {
        // Gap detected
        const gapDays = (next.start - current.end) / (1000 * 60 * 60 * 24);
        if (gapDays > 30) { // Only report gaps > 30 days
          gaps.push({
            start: current.end.toISOString().substr(0, 10),
            end: next.start.toISOString().substr(0, 10),
            durationDays: Math.floor(gapDays),
            durationMonths: Math.round(gapDays / 30),
            beforeJob: { id: current.id, title: current.title, org: current.org },
            afterJob: { id: next.id, title: next.title, org: next.org },
            severity: gapDays > 365 ? 'high' : gapDays > 180 ? 'medium' : 'low'
          });
        }
      } else if (current.end > next.start) {
        // Overlap detected
        const overlapDays = (current.end - next.start) / (1000 * 60 * 60 * 24);
        overlaps.push({
          start: next.start.toISOString().substr(0, 10),
          end: current.end.toISOString().substr(0, 10),
          durationDays: Math.floor(overlapDays),
          job1: { id: current.id, title: current.title, org: current.org },
          job2: { id: next.id, title: next.title, org: next.org },
          severity: overlapDays > 90 ? 'high' : overlapDays > 30 ? 'medium' : 'low'
        });
      }
    }

    return {
      gaps,
      overlaps,
      totalGapDays: gaps.reduce((sum, gap) => sum + gap.durationDays, 0),
      longestGap: gaps.length > 0 ? Math.max(...gaps.map(g => g.durationDays)) : 0,
      recommendations: this.generateTimelineRecommendations(gaps, overlaps)
    };
  }

  /**
   * Generate timeline improvement recommendations
   * @param {Array} gaps - Timeline gaps
   * @param {Array} overlaps - Timeline overlaps
   * @returns {Array} Recommendations
   */
  generateTimelineRecommendations(gaps, overlaps) {
    const recommendations = [];

    gaps.forEach(gap => {
      if (gap.severity === 'high') {
        recommendations.push({
          type: 'gap',
          priority: 'high',
          message: `Large gap detected: ${gap.durationMonths} months between ${gap.beforeJob.title} and ${gap.afterJob.title}`,
          action: 'Consider adding education, freelance work, or other activities during this period'
        });
      }
    });

    overlaps.forEach(overlap => {
      if (overlap.severity === 'medium' || overlap.severity === 'high') {
        recommendations.push({
          type: 'overlap',
          priority: 'medium',
          message: `Date overlap detected between ${overlap.job1.title} and ${overlap.job2.title}`,
          action: 'Review and correct employment dates to resolve timeline conflict'
        });
      }
    });

    return recommendations;
  }

  /**
   * Calculate overall data quality
   * @param {Object} report - Validation report
   * @returns {Object} Overall quality assessment
   */
  calculateOverallQuality(report) {
    const jobScores = report.jobs.map(job => job.quality.score);
    const avgJobQuality = jobScores.reduce((sum, score) => sum + score, 0) / jobScores.length;

    let overallScore = avgJobQuality * 0.6; // 60% from job quality

    // Timeline health (20%)
    const timelineScore = this.calculateTimelineScore(report.timeline);
    overallScore += timelineScore * 0.2;

    // Duplicate health (10%)
    const duplicateScore = 1 - (report.duplicates.total / Math.max(report.summary.totalJobs, 1));
    overallScore += duplicateScore * 0.1;

    // Skills consistency (10%)
    const skillsScore = 1 - (report.skills.inconsistencies.length / Math.max(report.skills.totalSkills, 1));
    overallScore += skillsScore * 0.1;

    const grade = this.getQualityGrade(overallScore);
    const issues = this.identifyOverallIssues(report);
    const recommendations = this.generateOverallRecommendations(report);

    return {
      score: Math.round(overallScore * 100) / 100,
      grade,
      issues,
      recommendations
    };
  }

  /**
   * Calculate timeline quality score
   * @param {Object} timeline - Timeline analysis
   * @returns {number} Timeline score 0-1
   */
  calculateTimelineScore(timeline) {
    let score = 1.0;

    // Penalty for gaps
    const majorGaps = timeline.gaps.filter(g => g.severity === 'high').length;
    score -= majorGaps * 0.2;

    // Penalty for overlaps
    const majorOverlaps = timeline.overlaps.filter(o => o.severity === 'high').length;
    score -= majorOverlaps * 0.3;

    return Math.max(score, 0);
  }

  /**
   * Identify overall data issues
   * @param {Object} report - Validation report
   * @returns {Array} Overall issues
   */
  identifyOverallIssues(report) {
    const issues = [];

    if (report.summary.criticalIssues > 0) {
      issues.push({
        severity: 'critical',
        category: 'validation',
        message: `${report.summary.criticalIssues} critical validation errors need immediate attention`
      });
    }

    if (report.duplicates.highConfidence.length > 0) {
      issues.push({
        severity: 'warning',
        category: 'duplicates',
        message: `${report.duplicates.highConfidence.length} potential duplicate entries detected`
      });
    }

    const majorGaps = report.timeline.gaps.filter(g => g.severity === 'high').length;
    if (majorGaps > 0) {
      issues.push({
        severity: 'warning',
        category: 'timeline',
        message: `${majorGaps} significant gaps in employment timeline`
      });
    }

    return issues;
  }

  /**
   * Generate overall improvement recommendations
   * @param {Object} report - Validation report
   * @returns {Array} Recommendations
   */
  generateOverallRecommendations(report) {
    const recommendations = [];

    const poorQualityJobs = report.summary.poorQuality;
    if (poorQualityJobs > 0) {
      recommendations.push({
        priority: 'high',
        category: 'quality',
        action: `Improve data quality for ${poorQualityJobs} job entries`,
        details: 'Focus on expanding descriptions and adding missing skills'
      });
    }

    if (report.duplicates.autoMergeable > 0) {
      recommendations.push({
        priority: 'medium',
        category: 'duplicates',
        action: `Merge ${report.duplicates.autoMergeable} auto-mergeable duplicate entries`,
        details: 'These can be safely merged automatically'
      });
    }

    if (report.skills.inconsistencies.length > 0) {
      recommendations.push({
        priority: 'low',
        category: 'skills',
        action: `Normalize ${report.skills.inconsistencies.length} inconsistent skill names`,
        details: 'Standardize skill naming for better consistency'
      });
    }

    return recommendations;
  }

  /**
   * Check if date periods overlap
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {boolean} Whether periods overlap
   */
  datePeriodsOverlap(job1, job2) {
    if (!job1.date_start || !job2.date_start) return false;

    const start1 = new Date(job1.date_start);
    const end1 = job1.date_end ? new Date(job1.date_end) : new Date();
    const start2 = new Date(job2.date_start);
    const end2 = job2.date_end ? new Date(job2.date_end) : new Date();

    return start1 < end2 && start2 < end1;
  }
}

export default AdvancedValidationService;