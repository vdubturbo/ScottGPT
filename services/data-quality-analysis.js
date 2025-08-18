/**
 * Data Quality Analysis Service
 * Provides comprehensive analysis of data health, completeness, and consistency
 * Builds on existing validation services with advanced analytics and recommendations
 */

import winston from 'winston';
import { supabase } from '../config/database.js';
import { AdvancedValidationService } from './advanced-validation.js';
import { DataProcessingService } from '../utils/data-processing.js';
import { SmartEnhancementService } from './smart-enhancement.js';

export class DataQualityAnalysisService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/data-quality-analysis.log' })
      ]
    });

    this.validationService = new AdvancedValidationService();
    this.processingService = new DataProcessingService();
    this.enhancementService = new SmartEnhancementService();

    // Quality scoring weights and thresholds
    this.qualityWeights = {
      completeness: 0.25,
      consistency: 0.20,
      accuracy: 0.20,
      timeline: 0.15,
      content: 0.10,
      skills: 0.10
    };

    this.qualityThresholds = {
      excellent: 0.9,
      good: 0.75,
      fair: 0.6,
      poor: 0.4,
      critical: 0.2
    };
  }

  /**
   * Generate comprehensive data health report
   * @param {Object} options - Analysis options
   * @returns {Object} Complete data quality analysis
   */
  async generateDataHealthReport(options = {}) {
    try {
      const {
        includeRecommendations = true,
        includeEnhancements = true,
        detailedAnalysis = true,
        generateActionPlan = true
      } = options;

      this.logger.info('Generating comprehensive data health report', { options });

      // Get all job data
      const { data: jobs, error } = await supabase
        .from('sources')
        .select('*')
        .eq('type', 'job')
        .order('date_start', { ascending: false });

      if (error) throw error;

      // Get content chunks for additional analysis
      const { data: chunks } = await supabase
        .from('content_chunks')
        .select('*');

      // Run core quality analysis
      const coreAnalysis = await this.runCoreQualityAnalysis(jobs, chunks);

      // Timeline and gap analysis
      const timelineAnalysis = await this.analyzeTimelineQuality(jobs);

      // Content quality analysis
      const contentAnalysis = await this.analyzeContentQuality(jobs, chunks);

      // Skills analysis
      const skillsAnalysis = await this.analyzeSkillsQuality(jobs);

      // Data consistency analysis
      const consistencyAnalysis = await this.analyzeDataConsistency(jobs);

      // Calculate overall health score
      const overallScore = this.calculateOverallHealthScore({
        core: coreAnalysis,
        timeline: timelineAnalysis,
        content: contentAnalysis,
        skills: skillsAnalysis,
        consistency: consistencyAnalysis
      });

      // Generate recommendations if requested
      let recommendations = null;
      if (includeRecommendations) {
        recommendations = await this.generateQualityRecommendations({
          jobs,
          coreAnalysis,
          timelineAnalysis,
          contentAnalysis,
          skillsAnalysis,
          consistencyAnalysis,
          overallScore
        });
      }

      // Generate enhancement suggestions if requested
      let enhancements = null;
      if (includeEnhancements) {
        enhancements = await this.generateEnhancementSuggestions(jobs);
      }

      // Generate action plan if requested
      let actionPlan = null;
      if (generateActionPlan) {
        actionPlan = await this.generateDataQualityActionPlan({
          overallScore,
          recommendations,
          jobs: jobs.length
        });
      }

      const report = {
        metadata: {
          reportGenerated: new Date().toISOString(),
          totalJobs: jobs.length,
          totalChunks: chunks?.length || 0,
          analysisDepth: detailedAnalysis ? 'detailed' : 'standard',
          includesEnhancements: includeEnhancements,
          includesRecommendations: includeRecommendations
        },
        overallHealth: {
          score: overallScore.total,
          grade: this.getQualityGrade(overallScore.total),
          status: this.getHealthStatus(overallScore.total),
          breakdown: overallScore.breakdown,
          trend: await this.calculateQualityTrend(jobs)
        },
        analysis: {
          core: coreAnalysis,
          timeline: timelineAnalysis,
          content: contentAnalysis,
          skills: skillsAnalysis,
          consistency: consistencyAnalysis
        },
        issues: {
          critical: this.extractCriticalIssues({
            coreAnalysis,
            timelineAnalysis,
            contentAnalysis,
            skillsAnalysis,
            consistencyAnalysis
          }),
          warnings: this.extractWarnings({
            coreAnalysis,
            timelineAnalysis,
            contentAnalysis,
            skillsAnalysis,
            consistencyAnalysis
          })
        },
        recommendations,
        enhancements,
        actionPlan,
        benchmarks: await this.generateQualityBenchmarks(overallScore)
      };

      this.logger.info('Data health report generated', {
        overallScore: overallScore.total,
        criticalIssues: report.issues.critical.length,
        recommendations: recommendations?.length || 0
      });

      return report;

    } catch (error) {
      this.logger.error('Error generating data health report', { error: error.message });
      throw error;
    }
  }

  /**
   * Run core quality analysis using existing validation service
   */
  async runCoreQualityAnalysis(jobs, chunks) {
    try {
      const validationReport = this.validationService.validateDataQuality(jobs);
      
      return {
        totalJobs: jobs.length,
        validJobs: validationReport.jobs.filter(j => j.validation.isValid).length,
        averageQualityScore: validationReport.jobs.reduce((sum, j) => sum + j.quality.score, 0) / validationReport.jobs.length,
        gradeDistribution: {
          excellent: validationReport.summary.excellentQuality,
          good: validationReport.summary.goodQuality,
          fair: validationReport.summary.fairQuality,
          poor: validationReport.summary.poorQuality
        },
        criticalErrors: validationReport.summary.criticalIssues,
        warnings: validationReport.summary.warnings,
        completenessScore: this.calculateCompletenessScore(jobs),
        validationDetails: validationReport
      };
    } catch (error) {
      this.logger.error('Error in core quality analysis', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze timeline quality and consistency
   */
  async analyzeTimelineQuality(jobs) {
    try {
      const gapAnalysis = await this.enhancementService.identifyTimelineGaps(jobs);
      
      // Calculate timeline coverage
      const jobsWithDates = jobs.filter(job => job.date_start);
      const timelineCoverage = jobsWithDates.length / jobs.length;
      
      // Analyze date consistency
      const dateConsistency = this.analyzeDateConsistency(jobs);
      
      // Calculate average tenure
      const averageTenure = this.calculateAverageTenure(jobsWithDates);
      
      // Identify timeline anomalies
      const anomalies = this.identifyTimelineAnomalies(jobsWithDates);

      return {
        coverage: timelineCoverage,
        dateConsistency,
        gaps: {
          total: gapAnalysis.gaps?.length || 0,
          criticalGaps: gapAnalysis.gaps?.filter(g => g.severity === 'high').length || 0,
          totalGapMonths: gapAnalysis.summary?.totalGapMonths || 0
        },
        overlaps: {
          total: gapAnalysis.overlaps?.length || 0,
          criticalOverlaps: gapAnalysis.overlaps?.filter(o => o.severity === 'high').length || 0
        },
        averageTenure,
        anomalies,
        timelineScore: this.calculateTimelineScore({
          coverage: timelineCoverage,
          dateConsistency,
          gaps: gapAnalysis.gaps?.length || 0,
          overlaps: gapAnalysis.overlaps?.length || 0,
          anomalies: anomalies.length
        }),
        recommendations: gapAnalysis.recommendations || []
      };
    } catch (error) {
      this.logger.error('Error in timeline quality analysis', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze content quality and richness
   */
  async analyzeContentQuality(jobs, chunks) {
    try {
      // Description analysis
      const descriptionAnalysis = this.analyzeDescriptions(jobs);
      
      // Chunk analysis
      const chunkAnalysis = this.analyzeChunks(chunks || []);
      
      // Content depth analysis
      const depthAnalysis = this.analyzeContentDepth(jobs, chunks || []);
      
      // Keyword and content richness
      const richnessAnalysis = this.analyzeContentRichness(jobs);

      return {
        descriptions: descriptionAnalysis,
        chunks: chunkAnalysis,
        depth: depthAnalysis,
        richness: richnessAnalysis,
        contentScore: this.calculateContentScore({
          descriptionAnalysis,
          chunkAnalysis,
          depthAnalysis,
          richnessAnalysis
        })
      };
    } catch (error) {
      this.logger.error('Error in content quality analysis', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze skills quality and coverage
   */
  async analyzeSkillsQuality(jobs) {
    try {
      const allSkills = jobs.flatMap(job => job.skills || []);
      const uniqueSkills = [...new Set(allSkills)];
      
      // Skills distribution
      const skillsDistribution = this.analyzeSkillsDistribution(jobs);
      
      // Skills consistency
      const skillsConsistency = this.validationService.analyzeSkillsConsistency(jobs);
      
      // Skills categorization
      const categorization = this.processingService.categorizeSkills(uniqueSkills);
      
      // Skills evolution
      const evolution = this.analyzeSkillsEvolution(jobs);
      
      // Skills gaps
      const gaps = this.identifySkillGaps(jobs, categorization);

      return {
        total: uniqueSkills.length,
        distribution: skillsDistribution,
        consistency: skillsConsistency,
        categorization,
        evolution,
        gaps,
        coverage: this.calculateSkillsCoverage(jobs),
        skillsScore: this.calculateSkillsScore({
          distribution: skillsDistribution,
          consistency: skillsConsistency.inconsistencies.length,
          coverage: this.calculateSkillsCoverage(jobs)
        })
      };
    } catch (error) {
      this.logger.error('Error in skills quality analysis', { error: error.message });
      throw error;
    }
  }

  /**
   * Analyze data consistency across all dimensions
   */
  async analyzeDataConsistency(jobs) {
    try {
      // Naming consistency
      const namingConsistency = this.analyzeNamingConsistency(jobs);
      
      // Format consistency
      const formatConsistency = this.analyzeFormatConsistency(jobs);
      
      // Structure consistency
      const structureConsistency = this.analyzeStructureConsistency(jobs);
      
      // Cross-references consistency
      const crossRefConsistency = this.analyzeCrossReferences(jobs);

      return {
        naming: namingConsistency,
        format: formatConsistency,
        structure: structureConsistency,
        crossReferences: crossRefConsistency,
        consistencyScore: this.calculateConsistencyScore({
          namingConsistency,
          formatConsistency,
          structureConsistency,
          crossRefConsistency
        })
      };
    } catch (error) {
      this.logger.error('Error in data consistency analysis', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate overall health score
   */
  calculateOverallHealthScore(analyses) {
    const scores = {
      completeness: analyses.core?.completenessScore || 0,
      consistency: analyses.consistency?.consistencyScore || 0,
      accuracy: this.calculateAccuracyScore(analyses),
      timeline: analyses.timeline?.timelineScore || 0,
      content: analyses.content?.contentScore || 0,
      skills: analyses.skills?.skillsScore || 0
    };

    const weightedTotal = Object.entries(scores).reduce((total, [category, score]) => {
      const weight = this.qualityWeights[category] || 0;
      return total + ((score || 0) * weight);
    }, 0);

    return {
      total: Math.round(weightedTotal * 100) / 100,
      breakdown: scores
    };
  }

  /**
   * Generate quality recommendations
   */
  async generateQualityRecommendations(analysisData) {
    const recommendations = [];
    const { overallScore, coreAnalysis, timelineAnalysis, contentAnalysis, skillsAnalysis, consistencyAnalysis } = analysisData;

    // Critical issues first
    if (coreAnalysis.criticalErrors > 0) {
      recommendations.push({
        priority: 'critical',
        category: 'data_integrity',
        title: 'Fix Critical Data Errors',
        description: `${coreAnalysis.criticalErrors} critical validation errors need immediate attention`,
        impact: 'high',
        effort: 'medium',
        actionItems: [
          'Review jobs with validation errors',
          'Add missing required fields',
          'Correct invalid date formats'
        ]
      });
    }

    // Timeline issues
    if (timelineAnalysis.gaps.criticalGaps > 0) {
      recommendations.push({
        priority: 'high',
        category: 'timeline',
        title: 'Address Critical Timeline Gaps',
        description: `${timelineAnalysis.gaps.criticalGaps} significant gaps in employment timeline`,
        impact: 'high',
        effort: 'high',
        actionItems: [
          'Add missing employment periods',
          'Include education or training during gaps',
          'Document freelance or contract work'
        ]
      });
    }

    // Content quality
    if (contentAnalysis.descriptions.averageLength < 100) {
      recommendations.push({
        priority: 'medium',
        category: 'content',
        title: 'Enhance Job Descriptions',
        description: 'Job descriptions are too brief and lack detail',
        impact: 'medium',
        effort: 'medium',
        actionItems: [
          'Expand descriptions with specific achievements',
          'Add quantifiable metrics and outcomes',
          'Include key technologies and methodologies'
        ]
      });
    }

    // Skills coverage
    if ((skillsAnalysis?.coverage || 0) < 0.7) {
      recommendations.push({
        priority: 'medium',
        category: 'skills',
        title: 'Improve Skills Coverage',
        description: 'Many positions lack comprehensive skill listings',
        impact: 'medium',
        effort: 'low',
        actionItems: [
          'Add skills to positions missing them',
          'Include both technical and soft skills',
          'Use consistent skill naming conventions'
        ]
      });
    }

    // Consistency issues
    if (consistencyAnalysis.consistencyScore < 0.8) {
      recommendations.push({
        priority: 'low',
        category: 'consistency',
        title: 'Improve Data Consistency',
        description: 'Data formatting and naming could be more consistent',
        impact: 'low',
        effort: 'low',
        actionItems: [
          'Standardize organization names',
          'Use consistent date formats',
          'Normalize skill naming conventions'
        ]
      });
    }

    // Overall score recommendations
    if (overallScore.total < 0.6) {
      recommendations.push({
        priority: 'high',
        category: 'overall',
        title: 'Comprehensive Data Quality Improvement',
        description: 'Overall data quality needs significant improvement',
        impact: 'high',
        effort: 'high',
        actionItems: [
          'Focus on high-impact improvements first',
          'Systematically address each quality dimension',
          'Consider using AI enhancement tools'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Generate enhancement suggestions using existing enhancement service
   */
  async generateEnhancementSuggestions(jobs, options = {}) {
    try {
      // AI enhancement suggestions are completely disabled to prevent API abuse
      // This method now only returns metadata about jobs that could benefit from enhancement
      
      const lowSkillJobs = jobs.filter(job => !job.skills || job.skills.length < 3);
      
      this.logger.info('AI enhancement suggestions permanently disabled to prevent OpenAI API abuse', { 
        lowSkillJobsCount: lowSkillJobs.length,
        message: 'Use individual enhancement endpoints for selective AI suggestions'
      });

      // Return empty suggestions array but maintain expected structure for backward compatibility
      const suggestions = [];
      
      // Add metadata about jobs that could benefit from enhancement (without AI suggestions)
      lowSkillJobs.slice(0, 10).forEach(job => {
        suggestions.push({
          type: 'skills',
          jobId: job.id,
          jobTitle: job.title,
          current: job.skills || [],
          suggested: [], // Always empty - no AI suggestions
          confidence: null,
          note: 'Use individual skill suggestion API endpoint for AI-powered suggestions'
        });
      });

      return suggestions;
    } catch (error) {
      this.logger.error('Error generating enhancement suggestions', { error: error.message });
      return [];
    }
  }

  /**
   * Generate action plan for data quality improvement
   */
  async generateDataQualityActionPlan(data) {
    const { overallScore, recommendations, jobs } = data;
    
    const actionPlan = {
      overview: {
        currentScore: overallScore.total,
        targetScore: Math.min(overallScore.total + 0.2, 1.0),
        estimatedImprovementTime: this.estimateImprovementTime(recommendations, jobs),
        priority: overallScore.total < 0.4 ? 'critical' : overallScore.total < 0.7 ? 'high' : 'medium'
      },
      phases: []
    };

    // Phase 1: Critical fixes (immediate)
    const criticalRecommendations = recommendations?.filter(r => r.priority === 'critical') || [];
    if (criticalRecommendations.length > 0) {
      actionPlan.phases.push({
        phase: 1,
        title: 'Critical Issues Resolution',
        timeframe: '1-2 weeks',
        priority: 'critical',
        recommendations: criticalRecommendations,
        expectedScoreImprovement: 0.1
      });
    }

    // Phase 2: High priority improvements (short term)
    const highPriorityRecommendations = recommendations?.filter(r => r.priority === 'high') || [];
    if (highPriorityRecommendations.length > 0) {
      actionPlan.phases.push({
        phase: criticalRecommendations.length > 0 ? 2 : 1,
        title: 'High Priority Improvements',
        timeframe: '2-4 weeks',
        priority: 'high',
        recommendations: highPriorityRecommendations,
        expectedScoreImprovement: 0.15
      });
    }

    // Phase 3: Medium priority improvements (medium term)
    const mediumPriorityRecommendations = recommendations?.filter(r => r.priority === 'medium') || [];
    if (mediumPriorityRecommendations.length > 0) {
      actionPlan.phases.push({
        phase: actionPlan.phases.length + 1,
        title: 'Content and Skills Enhancement',
        timeframe: '1-2 months',
        priority: 'medium',
        recommendations: mediumPriorityRecommendations,
        expectedScoreImprovement: 0.1
      });
    }

    // Phase 4: Consistency and polish (long term)
    const lowPriorityRecommendations = recommendations?.filter(r => r.priority === 'low') || [];
    if (lowPriorityRecommendations.length > 0) {
      actionPlan.phases.push({
        phase: actionPlan.phases.length + 1,
        title: 'Consistency and Polish',
        timeframe: '1-3 months',
        priority: 'low',
        recommendations: lowPriorityRecommendations,
        expectedScoreImprovement: 0.05
      });
    }

    return actionPlan;
  }

  // Helper methods for detailed analysis

  calculateCompletenessScore(jobs) {
    const requiredFields = ['title', 'org', 'date_start'];
    const optionalFields = ['description', 'skills', 'location', 'date_end'];
    
    let totalScore = 0;
    let maxScore = jobs.length * (requiredFields.length + optionalFields.length);
    
    jobs.forEach(job => {
      // Required fields (full weight)
      requiredFields.forEach(field => {
        if (job[field] && job[field].toString().trim().length > 0) {
          totalScore += 1;
        }
      });
      
      // Optional fields (full weight)
      optionalFields.forEach(field => {
        if (field === 'skills') {
          if (job[field] && Array.isArray(job[field]) && job[field].length > 0) {
            totalScore += 1;
          }
        } else {
          if (job[field] && job[field].toString().trim().length > 0) {
            totalScore += 1;
          }
        }
      });
    });
    
    return maxScore > 0 ? totalScore / maxScore : 0;
  }

  analyzeDateConsistency(jobs) {
    const issues = [];
    let validDates = 0;
    let totalDates = 0;
    
    jobs.forEach(job => {
      if (job.date_start) {
        totalDates++;
        if (this.isValidDate(job.date_start)) {
          validDates++;
        } else {
          issues.push({ jobId: job.id, field: 'date_start', value: job.date_start });
        }
      }
      
      if (job.date_end) {
        totalDates++;
        if (this.isValidDate(job.date_end)) {
          validDates++;
        } else {
          issues.push({ jobId: job.id, field: 'date_end', value: job.date_end });
        }
      }
    });
    
    return {
      consistency: totalDates > 0 ? validDates / totalDates : 1,
      issues,
      validDates,
      totalDates
    };
  }

  calculateAverageTenure(jobs) {
    const tenures = jobs
      .filter(job => job.date_start)
      .map(job => this.processingService.calculateDuration(job.date_start, job.date_end))
      .filter(tenure => tenure > 0);
    
    return tenures.length > 0 ? tenures.reduce((sum, tenure) => sum + tenure, 0) / tenures.length : 0;
  }

  identifyTimelineAnomalies(jobs) {
    const anomalies = [];
    
    jobs.forEach(job => {
      const duration = this.processingService.calculateDuration(job.date_start, job.date_end);
      
      // Very short tenures (less than 1 month)
      if (duration < 1) {
        anomalies.push({
          jobId: job.id,
          type: 'very_short_tenure',
          severity: 'medium',
          description: `Very short tenure: ${duration} months`
        });
      }
      
      // Very long tenures (more than 15 years)
      if (duration > 180) {
        anomalies.push({
          jobId: job.id,
          type: 'very_long_tenure',
          severity: 'low',
          description: `Very long tenure: ${Math.round(duration/12)} years`
        });
      }
      
      // Future start dates
      const startDate = new Date(job.date_start);
      if (startDate > new Date()) {
        anomalies.push({
          jobId: job.id,
          type: 'future_start_date',
          severity: 'high',
          description: `Start date is in the future: ${job.date_start}`
        });
      }
    });
    
    return anomalies;
  }

  calculateTimelineScore(factors) {
    let score = 1.0;
    
    // Penalize for low coverage
    score *= factors.coverage || 1;
    
    // Penalize for date inconsistency
    score *= factors.dateConsistency?.consistency || 1;
    
    // Penalize for gaps (more gaps = lower score)
    if (factors.gaps > 0) {
      score *= Math.max(0.5, 1 - (factors.gaps * 0.1));
    }
    
    // Penalize for overlaps
    if (factors.overlaps > 0) {
      score *= Math.max(0.5, 1 - (factors.overlaps * 0.15));
    }
    
    // Penalize for anomalies
    if (factors.anomalies > 0) {
      score *= Math.max(0.7, 1 - (factors.anomalies * 0.05));
    }
    
    return Math.max(0, Math.min(1, score));
  }

  analyzeDescriptions(jobs) {
    const descriptions = jobs.filter(job => job.description);
    const lengths = descriptions.map(job => job.description.length);
    
    return {
      coverage: descriptions.length / jobs.length,
      averageLength: lengths.length > 0 ? lengths.reduce((sum, len) => sum + len, 0) / lengths.length : 0,
      minLength: lengths.length > 0 ? Math.min(...lengths) : 0,
      maxLength: lengths.length > 0 ? Math.max(...lengths) : 0,
      emptyDescriptions: jobs.filter(job => !job.description || job.description.trim() === '').length
    };
  }

  analyzeChunks(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        total: 0,
        withEmbeddings: 0,
        averageLength: 0,
        embeddingCoverage: 0
      };
    }
    
    const withEmbeddings = chunks.filter(chunk => chunk.embedding);
    const lengths = chunks.map(chunk => (chunk.content || '').length);
    
    return {
      total: chunks.length,
      withEmbeddings: withEmbeddings.length,
      averageLength: lengths.reduce((sum, len) => sum + len, 0) / lengths.length,
      embeddingCoverage: withEmbeddings.length / chunks.length
    };
  }

  analyzeContentDepth(jobs, chunks) {
    const jobsWithChunks = jobs.filter(job => 
      chunks.some(chunk => chunk.source_id === job.id)
    );
    
    return {
      jobsWithChunks: jobsWithChunks.length,
      chunksPerJob: jobsWithChunks.length > 0 ? chunks.length / jobsWithChunks.length : 0,
      depthCoverage: jobsWithChunks.length / jobs.length
    };
  }

  analyzeContentRichness(jobs) {
    const keywordAnalysis = jobs.map(job => {
      const text = [job.title, job.description, job.summary].filter(Boolean).join(' ').toLowerCase();
      const words = text.split(/\s+/).filter(word => word.length > 3);
      const uniqueWords = [...new Set(words)];
      
      return {
        jobId: job.id,
        totalWords: words.length,
        uniqueWords: uniqueWords.length,
        richness: uniqueWords.length > 0 ? uniqueWords.length / words.length : 0
      };
    });
    
    return {
      averageRichness: keywordAnalysis.reduce((sum, analysis) => sum + analysis.richness, 0) / keywordAnalysis.length,
      averageWords: keywordAnalysis.reduce((sum, analysis) => sum + analysis.totalWords, 0) / keywordAnalysis.length,
      jobsWithRichContent: keywordAnalysis.filter(analysis => analysis.richness > 0.3).length
    };
  }

  calculateContentScore(analyses) {
    let score = 0;
    let maxScore = 4;
    
    // Description coverage
    score += analyses.descriptions?.coverage || 0;
    
    // Description quality
    if ((analyses.descriptions?.averageLength || 0) > 100) score += 0.5;
    if ((analyses.descriptions?.averageLength || 0) > 300) score += 0.5;
    
    // Chunk coverage
    score += analyses.depth?.depthCoverage || 0;
    
    // Content richness
    if ((analyses.richness?.averageRichness || 0) > 0.3) score += 0.5;
    if ((analyses.richness?.averageWords || 0) > 50) score += 0.5;
    
    return score / maxScore;
  }

  analyzeSkillsDistribution(jobs) {
    const skillCounts = jobs.map(job => (job.skills || []).length);
    const jobsWithSkills = skillCounts.filter(count => count > 0).length;
    
    return {
      coverage: jobsWithSkills / jobs.length,
      averageSkillsPerJob: skillCounts.reduce((sum, count) => sum + count, 0) / jobs.length,
      jobsWithoutSkills: jobs.length - jobsWithSkills,
      distribution: {
        none: skillCounts.filter(count => count === 0).length,
        few: skillCounts.filter(count => count > 0 && count <= 3).length,
        moderate: skillCounts.filter(count => count > 3 && count <= 8).length,
        many: skillCounts.filter(count => count > 8).length
      }
    };
  }

  analyzeSkillsEvolution(jobs) {
    const jobsWithDates = jobs
      .filter(job => job.date_start && job.skills)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));
    
    const evolution = jobsWithDates.map(job => ({
      date: job.date_start,
      skillCount: job.skills.length,
      skills: job.skills
    }));
    
    return {
      timeline: evolution,
      trend: this.calculateSkillGrowthTrend(evolution),
      newSkillsOverTime: this.calculateNewSkillsOverTime(evolution)
    };
  }

  identifySkillGaps(jobs, categorization) {
    const commonCategories = ['Technical', 'Leadership', 'Communication', 'Project Management'];
    const gaps = [];
    
    commonCategories.forEach(category => {
      const categorySkills = categorization[category] || [];
      if (categorySkills.length === 0) {
        gaps.push({
          category,
          severity: 'medium',
          description: `No skills listed in ${category} category`
        });
      } else if (categorySkills.length < 3) {
        gaps.push({
          category,
          severity: 'low',
          description: `Limited skills in ${category} category`
        });
      }
    });
    
    return gaps;
  }

  calculateSkillsCoverage(jobs) {
    const jobsWithSkills = jobs.filter(job => job.skills && job.skills.length > 0);
    return jobsWithSkills.length / jobs.length;
  }

  calculateSkillsScore(factors) {
    let score = 0;
    let maxScore = 3;
    
    // Coverage score
    score += factors.coverage || 0;
    
    // Distribution score
    if ((factors.distribution?.averageSkillsPerJob || 0) >= 5) score += 0.5;
    if ((factors.distribution?.averageSkillsPerJob || 0) >= 8) score += 0.5;
    
    // Consistency penalty
    const consistencyPenalty = Math.min(0.5, (factors.consistency || 0) * 0.1);
    score -= consistencyPenalty;
    
    return Math.max(0, score / maxScore);
  }

  // Additional helper methods
  
  analyzeNamingConsistency(jobs) {
    const orgNames = jobs.map(job => job.org).filter(Boolean);
    const normalizedOrgs = orgNames.map(name => name.toLowerCase().trim());
    const uniqueNormalizedOrgs = [...new Set(normalizedOrgs)];
    
    return {
      consistency: uniqueNormalizedOrgs.length / orgNames.length,
      potentialDuplicates: orgNames.length - uniqueNormalizedOrgs.length
    };
  }

  analyzeFormatConsistency(jobs) {
    // Analyze date formats, text case, etc.
    const dateFormats = new Set();
    jobs.forEach(job => {
      if (job.date_start) {
        const dateStr = job.date_start.toString();
        if (dateStr.includes('-')) dateFormats.add('ISO');
        else if (dateStr.includes('/')) dateFormats.add('US');
        else dateFormats.add('OTHER');
      }
    });
    
    return {
      dateFormatConsistency: dateFormats.size <= 1 ? 1 : 1 - (dateFormats.size - 1) * 0.2,
      dateFormatsUsed: Array.from(dateFormats)
    };
  }

  analyzeStructureConsistency(jobs) {
    const structures = jobs.map(job => ({
      hasTitle: !!job.title,
      hasOrg: !!job.org,
      hasDescription: !!job.description,
      hasSkills: !!(job.skills && job.skills.length > 0),
      hasLocation: !!job.location,
      hasStartDate: !!job.date_start,
      hasEndDate: !!job.date_end
    }));
    
    const structureTypes = structures.map(s => JSON.stringify(s));
    const uniqueStructures = [...new Set(structureTypes)];
    
    return {
      consistency: uniqueStructures.length <= 3 ? 1 : 1 - (uniqueStructures.length - 3) * 0.1,
      structureVariants: uniqueStructures.length
    };
  }

  analyzeCrossReferences(jobs) {
    // This would analyze relationships between jobs, skills, organizations, etc.
    return {
      organizationReferences: this.analyzeOrganizationReferences(jobs),
      skillReferences: this.analyzeSkillReferences(jobs),
      consistency: 0.9 // Placeholder
    };
  }

  analyzeOrganizationReferences(jobs) {
    const orgCounts = {};
    jobs.forEach(job => {
      if (job.org) {
        orgCounts[job.org] = (orgCounts[job.org] || 0) + 1;
      }
    });
    
    return {
      uniqueOrganizations: Object.keys(orgCounts).length,
      multiplePositions: Object.values(orgCounts).filter(count => count > 1).length
    };
  }

  analyzeSkillReferences(jobs) {
    const skillCounts = {};
    jobs.forEach(job => {
      (job.skills || []).forEach(skill => {
        skillCounts[skill] = (skillCounts[skill] || 0) + 1;
      });
    });
    
    return {
      uniqueSkills: Object.keys(skillCounts).length,
      frequentSkills: Object.entries(skillCounts).filter(([skill, count]) => count >= 3).length
    };
  }

  calculateConsistencyScore(factors) {
    return (
      factors.namingConsistency.consistency * 0.3 +
      factors.formatConsistency.dateFormatConsistency * 0.3 +
      factors.structureConsistency.consistency * 0.4
    );
  }

  calculateAccuracyScore(analyses) {
    // Combine various accuracy indicators
    let score = 1.0;
    
    // Timeline accuracy
    const timelineAccuracy = analyses.timeline.dateConsistency.consistency;
    score *= timelineAccuracy;
    
    // Data validation accuracy
    const validationAccuracy = analyses.core.validJobs / analyses.core.totalJobs;
    score *= validationAccuracy;
    
    return score;
  }

  getQualityGrade(score) {
    if (score >= this.qualityThresholds.excellent) return 'Excellent';
    if (score >= this.qualityThresholds.good) return 'Good';
    if (score >= this.qualityThresholds.fair) return 'Fair';
    if (score >= this.qualityThresholds.poor) return 'Poor';
    return 'Critical';
  }

  getHealthStatus(score) {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.75) return 'Good';
    if (score >= 0.6) return 'Needs Improvement';
    if (score >= 0.4) return 'Poor';
    return 'Critical';
  }

  async calculateQualityTrend(jobs) {
    // This would analyze how data quality has changed over time
    // For now, return a placeholder
    return {
      direction: 'stable',
      change: 0,
      period: '30 days'
    };
  }

  extractCriticalIssues(analyses) {
    const critical = [];
    
    if (analyses.coreAnalysis.criticalErrors > 0) {
      critical.push({
        type: 'validation_errors',
        count: analyses.coreAnalysis.criticalErrors,
        description: 'Critical validation errors in job data'
      });
    }
    
    if (analyses.timelineAnalysis.gaps.criticalGaps > 0) {
      critical.push({
        type: 'timeline_gaps',
        count: analyses.timelineAnalysis.gaps.criticalGaps,
        description: 'Critical gaps in employment timeline'
      });
    }
    
    return critical;
  }

  extractWarnings(analyses) {
    const warnings = [];
    
    if ((analyses.skillsAnalysis?.coverage || 0) < 0.5) {
      warnings.push({
        type: 'skills_coverage',
        description: 'Low skills coverage across positions'
      });
    }
    
    if ((analyses.contentAnalysis?.descriptions?.coverage || 0) < 0.7) {
      warnings.push({
        type: 'content_coverage',
        description: 'Many positions lack detailed descriptions'
      });
    }
    
    return warnings;
  }

  async generateQualityBenchmarks(overallScore) {
    return {
      current: overallScore.total,
      industryAverage: 0.75, // Would be based on real benchmarks
      topQuartile: 0.85,
      recommendations: {
        nextMilestone: Math.ceil(overallScore.total * 10) / 10 + 0.1,
        timeToImprove: '2-4 weeks'
      }
    };
  }

  estimateImprovementTime(recommendations, jobCount) {
    if (!recommendations) return 'Unknown';
    
    const basetime = jobCount * 2; // 2 minutes per job
    const additionalTime = recommendations.length * 15; // 15 minutes per recommendation
    
    const totalMinutes = basetime + additionalTime;
    
    if (totalMinutes < 60) return `${totalMinutes} minutes`;
    if (totalMinutes < 240) return `${Math.round(totalMinutes / 60)} hours`;
    return `${Math.round(totalMinutes / 60 / 8)} days`;
  }

  calculateSkillGrowthTrend(evolution) {
    if (evolution.length < 2) return 'stable';
    
    const first = evolution[0].skillCount;
    const last = evolution[evolution.length - 1].skillCount;
    
    if (last > first * 1.2) return 'growing';
    if (last < first * 0.8) return 'declining';
    return 'stable';
  }

  calculateNewSkillsOverTime(evolution) {
    const newSkills = [];
    const seenSkills = new Set();
    
    evolution.forEach(entry => {
      const currentNewSkills = entry.skills.filter(skill => !seenSkills.has(skill));
      currentNewSkills.forEach(skill => seenSkills.add(skill));
      
      newSkills.push({
        date: entry.date,
        newSkillsCount: currentNewSkills.length,
        newSkills: currentNewSkills
      });
    });
    
    return newSkills;
  }

  isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
  }
}

export default DataQualityAnalysisService;