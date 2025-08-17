/**
 * Intelligent Duplicate Detection Service
 * Advanced duplicate detection with fuzzy matching, confidence scoring,
 * and smart merging strategies for job entries
 */

import winston from 'winston';
import { distance as levenshteinDistance } from 'fastest-levenshtein';
import { supabase } from '../config/database.js';
import EmbeddingService from './embeddings.js';
import DataProcessingService from '../utils/data-processing.js';

export class DuplicateDetectionService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/duplicate-detection.log' })
      ]
    });

    this.embeddingService = new EmbeddingService();
    this.processingService = new DataProcessingService();

    // Detection thresholds
    this.thresholds = {
      exactDuplicate: 0.95,     // 95%+ similarity = exact duplicate
      nearDuplicate: 0.85,      // 85%+ similarity = near duplicate  
      possibleDuplicate: 0.70,  // 70%+ similarity = possible duplicate
      dateOverlapThreshold: 0.8, // 80%+ date overlap = significant
      titleSimilarityThreshold: 0.8,
      companySimilarityThreshold: 0.9,
      contentSimilarityThreshold: 0.75
    };

    // Scoring weights for overall similarity
    this.weights = {
      company: 0.35,      // Company match is most important
      title: 0.25,        // Job title similarity
      dates: 0.20,        // Date overlap
      content: 0.15,      // Description/content similarity
      skills: 0.05        // Skills overlap (least important due to normalization)
    };

    // Company name variations mapping for better matching
    this.companyVariations = new Map([
      ['corp', 'corporation'],
      ['inc', 'incorporated'],
      ['llc', 'limited liability company'],
      ['ltd', 'limited'],
      ['co', 'company'],
      ['&', 'and'],
      ['tech', 'technology'],
      ['sys', 'systems'],
      ['intl', 'international'],
      ['grp', 'group']
    ]);
  }

  /**
   * Find all potential duplicates in job data
   * @param {Array} jobs - Array of job objects
   * @returns {Object} Duplicate analysis results
   */
  async findDuplicates(jobs) {
    try {
      this.logger.info('Starting duplicate detection', { jobCount: jobs.length });

      const duplicateGroups = [];
      const processed = new Set();

      // Compare each job with every other job
      for (let i = 0; i < jobs.length; i++) {
        if (processed.has(i)) continue;

        const job1 = jobs[i];
        const similarJobs = [];

        for (let j = i + 1; j < jobs.length; j++) {
          if (processed.has(j)) continue;

          const job2 = jobs[j];
          const similarity = await this.calculateSimilarity(job1, job2);

          if (similarity.overall >= this.thresholds.possibleDuplicate) {
            similarJobs.push({
              index: j,
              job: job2,
              similarity,
              confidence: this.calculateConfidence(similarity)
            });
          }
        }

        if (similarJobs.length > 0) {
          // Add the primary job
          const group = {
            type: this.classifyDuplicateType(similarJobs),
            primaryJob: {
              index: i,
              job: job1,
              chunkCount: await this.getChunkCount(job1.id)
            },
            duplicates: await Promise.all(similarJobs.map(async (item) => ({
              ...item,
              chunkCount: await this.getChunkCount(item.job.id)
            }))),
            groupSimilarity: this.calculateGroupSimilarity(similarJobs),
            mergeRecommendation: this.generateMergeRecommendation(job1, similarJobs),
            riskFactors: this.identifyRiskFactors(job1, similarJobs)
          };

          duplicateGroups.push(group);

          // Mark all jobs in this group as processed
          processed.add(i);
          similarJobs.forEach(item => processed.add(item.index));
        }
      }

      const summary = this.generateSummary(duplicateGroups, jobs.length);

      this.logger.info('Duplicate detection completed', {
        totalJobs: jobs.length,
        duplicateGroups: duplicateGroups.length,
        autoMergeable: summary.autoMergeable
      });

      return {
        duplicateGroups,
        summary,
        recommendations: this.generateGlobalRecommendations(duplicateGroups),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this.logger.error('Error in duplicate detection', { error: error.message });
      throw error;
    }
  }

  /**
   * Calculate similarity between two jobs
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job  
   * @returns {Object} Similarity scores
   */
  async calculateSimilarity(job1, job2) {
    const scores = {
      company: this.calculateCompanySimilarity(job1.org, job2.org),
      title: this.calculateTitleSimilarity(job1.title, job2.title),
      dates: this.calculateDateSimilarity(job1, job2),
      content: await this.calculateContentSimilarity(job1, job2),
      skills: this.calculateSkillsSimilarity(job1.skills || [], job2.skills || [])
    };

    // Calculate weighted overall similarity
    const overall = Object.entries(scores).reduce((total, [key, score]) => {
      return total + (score * this.weights[key]);
    }, 0);

    return {
      ...scores,
      overall: Math.round(overall * 1000) / 1000,
      breakdown: Object.entries(scores).map(([category, score]) => ({
        category,
        score,
        weight: this.weights[category],
        contribution: score * this.weights[category]
      }))
    };
  }

  /**
   * Calculate company name similarity with fuzzy matching
   * @param {string} company1 - First company name
   * @param {string} company2 - Second company name
   * @returns {number} Similarity score 0-1
   */
  calculateCompanySimilarity(company1, company2) {
    if (!company1 || !company2) return 0;

    // Normalize company names
    const normalized1 = this.normalizeCompanyName(company1);
    const normalized2 = this.normalizeCompanyName(company2);

    // Exact match after normalization
    if (normalized1 === normalized2) return 1.0;

    // Fuzzy string matching
    const maxLength = Math.max(normalized1.length, normalized2.length);
    if (maxLength === 0) return 0;

    const distance = levenshteinDistance(normalized1, normalized2);
    const similarity = 1 - (distance / maxLength);

    // Boost similarity if one name contains the other
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return Math.max(similarity, 0.85);
    }

    return Math.max(similarity, 0);
  }

  /**
   * Normalize company name for better matching
   * @param {string} company - Company name
   * @returns {string} Normalized company name
   */
  normalizeCompanyName(company) {
    let normalized = company.toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .trim();

    // Apply company variation mappings
    for (const [short, long] of this.companyVariations) {
      const shortPattern = new RegExp(`\\b${short}\\b`, 'g');
      const longPattern = new RegExp(`\\b${long}\\b`, 'g');
      
      // Replace both directions for better matching
      normalized = normalized.replace(shortPattern, long);
      normalized = normalized.replace(longPattern, short);
    }

    return normalized;
  }

  /**
   * Calculate job title similarity
   * @param {string} title1 - First job title
   * @param {string} title2 - Second job title
   * @returns {number} Similarity score 0-1
   */
  calculateTitleSimilarity(title1, title2) {
    if (!title1 || !title2) return 0;

    // Normalize titles
    const normalized1 = this.normalizeTitle(title1);
    const normalized2 = this.normalizeTitle(title2);

    // Exact match
    if (normalized1 === normalized2) return 1.0;

    // Check for seniority variations (e.g., "Engineer" vs "Senior Engineer")
    const seniorityPattern = /\b(senior|sr|lead|principal|staff|junior|jr)\b/gi;
    const base1 = normalized1.replace(seniorityPattern, '').trim();
    const base2 = normalized2.replace(seniorityPattern, '').trim();

    if (base1 === base2 && base1.length > 0) {
      return 0.9; // High similarity for seniority variations
    }

    // Fuzzy string matching
    const maxLength = Math.max(normalized1.length, normalized2.length);
    if (maxLength === 0) return 0;

    const distance = levenshteinDistance(normalized1, normalized2);
    const similarity = 1 - (distance / maxLength);

    // Boost for partial matches
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      return Math.max(similarity, 0.8);
    }

    return Math.max(similarity, 0);
  }

  /**
   * Normalize job title for comparison
   * @param {string} title - Job title
   * @returns {string} Normalized title
   */
  normalizeTitle(title) {
    return title.toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/\b(i{1,3}|iv|v|vi{1,3})\b/g, '') // Remove roman numerals
      .trim();
  }

  /**
   * Calculate date overlap similarity
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {number} Similarity score 0-1
   */
  calculateDateSimilarity(job1, job2) {
    if (!job1.date_start || !job2.date_start) return 0;

    const start1 = new Date(job1.date_start);
    const end1 = job1.date_end ? new Date(job1.date_end) : new Date();
    const start2 = new Date(job2.date_start);
    const end2 = job2.date_end ? new Date(job2.date_end) : new Date();

    // Calculate overlap
    const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
    
    if (overlapStart >= overlapEnd) return 0; // No overlap

    const overlapDays = (overlapEnd - overlapStart) / (1000 * 60 * 60 * 24);
    const totalDays1 = (end1 - start1) / (1000 * 60 * 60 * 24);
    const totalDays2 = (end2 - start2) / (1000 * 60 * 60 * 24);
    
    // Calculate overlap percentage relative to both periods
    const overlapPercent1 = overlapDays / totalDays1;
    const overlapPercent2 = overlapDays / totalDays2;
    
    // Use the maximum overlap percentage
    return Math.max(overlapPercent1, overlapPercent2);
  }

  /**
   * Calculate content similarity using embeddings
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {number} Similarity score 0-1
   */
  async calculateContentSimilarity(job1, job2) {
    try {
      const desc1 = job1.description || '';
      const desc2 = job2.description || '';

      if (!desc1 || !desc2) return 0;

      // For short descriptions, use simple text similarity
      if (desc1.length < 100 || desc2.length < 100) {
        const maxLength = Math.max(desc1.length, desc2.length);
        if (maxLength === 0) return 0;
        
        const distance = levenshteinDistance(desc1.toLowerCase(), desc2.toLowerCase());
        return Math.max(0, 1 - (distance / maxLength));
      }

      // Use embedding similarity for longer descriptions
      const embedding1 = await this.embeddingService.embedText(desc1, 'search_query');
      const embedding2 = await this.embeddingService.embedText(desc2, 'search_query');

      if (!embedding1 || !embedding2) {
        // Fallback to text similarity
        const maxLength = Math.max(desc1.length, desc2.length);
        const distance = levenshteinDistance(desc1.toLowerCase(), desc2.toLowerCase());
        return Math.max(0, 1 - (distance / maxLength));
      }

      return this.embeddingService.calculateCosineSimilarity(embedding1, embedding2);

    } catch (error) {
      this.logger.warn('Error calculating content similarity', { 
        error: error.message,
        job1Id: job1.id,
        job2Id: job2.id
      });
      return 0;
    }
  }

  /**
   * Calculate skills similarity
   * @param {Array} skills1 - First job skills
   * @param {Array} skills2 - Second job skills
   * @returns {number} Similarity score 0-1
   */
  calculateSkillsSimilarity(skills1, skills2) {
    if (!skills1.length && !skills2.length) return 1;
    if (!skills1.length || !skills2.length) return 0;

    // Normalize skills
    const normalized1 = skills1.map(skill => this.processingService.normalizeSkill(skill));
    const normalized2 = skills2.map(skill => this.processingService.normalizeSkill(skill));

    const set1 = new Set(normalized1);
    const set2 = new Set(normalized2);

    const intersection = new Set([...set1].filter(skill => set2.has(skill)));
    const union = new Set([...set1, ...set2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate confidence score for a duplicate match
   * @param {Object} similarity - Similarity scores
   * @returns {Object} Confidence assessment
   */
  calculateConfidence(similarity) {
    const { company, title, dates, content, overall } = similarity;

    let confidence = overall;
    let level = 'low';
    let reasons = [];

    // Boost confidence for strong indicators
    if (company >= this.thresholds.companySimilarityThreshold) {
      confidence += 0.05;
      reasons.push('Same company');
    }

    if (title >= this.thresholds.titleSimilarityThreshold) {
      confidence += 0.05;
      reasons.push('Similar job title');
    }

    if (dates >= this.thresholds.dateOverlapThreshold) {
      confidence += 0.05;
      reasons.push('Overlapping dates');
    }

    if (content >= this.thresholds.contentSimilarityThreshold) {
      confidence += 0.03;
      reasons.push('Similar job description');
    }

    // Determine confidence level
    if (confidence >= this.thresholds.exactDuplicate) {
      level = 'very_high';
    } else if (confidence >= this.thresholds.nearDuplicate) {
      level = 'high';
    } else if (confidence >= this.thresholds.possibleDuplicate) {
      level = 'medium';
    }

    return {
      score: Math.min(confidence, 1),
      level,
      reasons,
      autoMergeable: confidence >= this.thresholds.exactDuplicate && 
                     company >= this.thresholds.companySimilarityThreshold
    };
  }

  /**
   * Classify the type of duplicate
   * @param {Array} similarJobs - Array of similar jobs
   * @returns {string} Duplicate type
   */
  classifyDuplicateType(similarJobs) {
    const maxSimilarity = Math.max(...similarJobs.map(job => job.similarity.overall));

    if (maxSimilarity >= this.thresholds.exactDuplicate) {
      return 'exact_duplicate';
    } else if (maxSimilarity >= this.thresholds.nearDuplicate) {
      return 'near_duplicate';
    } else {
      return 'possible_duplicate';
    }
  }

  /**
   * Calculate group similarity for multiple duplicates
   * @param {Array} similarJobs - Array of similar jobs
   * @returns {number} Group similarity score
   */
  calculateGroupSimilarity(similarJobs) {
    if (similarJobs.length === 0) return 0;
    
    const avgSimilarity = similarJobs.reduce((sum, job) => sum + job.similarity.overall, 0) / similarJobs.length;
    return Math.round(avgSimilarity * 1000) / 1000;
  }

  /**
   * Generate merge recommendation for a duplicate group
   * @param {Object} primaryJob - Primary job
   * @param {Array} similarJobs - Similar jobs
   * @returns {Object} Merge recommendation
   */
  generateMergeRecommendation(primaryJob, similarJobs) {
    const recommendations = [];
    let strategy = 'manual_review';
    let confidence = 'low';

    // Analyze each duplicate
    similarJobs.forEach((duplicate, index) => {
      const sim = duplicate.similarity;
      const conf = duplicate.confidence;

      if (conf.autoMergeable) {
        strategy = 'auto_merge';
        confidence = 'high';
        recommendations.push({
          action: 'merge',
          target: duplicate.job.id,
          reason: `Very high similarity (${Math.round(sim.overall * 100)}%) - safe to auto-merge`,
          priority: 'high'
        });
      } else if (conf.level === 'high') {
        strategy = strategy === 'auto_merge' ? 'auto_merge' : 'review_recommended';
        confidence = confidence === 'high' ? 'high' : 'medium';
        recommendations.push({
          action: 'review_merge',
          target: duplicate.job.id,
          reason: `High similarity (${Math.round(sim.overall * 100)}%) - recommend manual review`,
          priority: 'medium'
        });
      } else {
        recommendations.push({
          action: 'investigate',
          target: duplicate.job.id,
          reason: `Moderate similarity (${Math.round(sim.overall * 100)}%) - investigate potential duplicate`,
          priority: 'low'
        });
      }
    });

    return {
      strategy,
      confidence,
      actions: recommendations,
      estimatedTimesSaved: this.estimateTimeSaved(similarJobs.length, strategy)
    };
  }

  /**
   * Identify risk factors for merging
   * @param {Object} primaryJob - Primary job
   * @param {Array} similarJobs - Similar jobs
   * @returns {Array} Risk factors
   */
  identifyRiskFactors(primaryJob, similarJobs) {
    const risks = [];

    similarJobs.forEach(duplicate => {
      const job = duplicate.job;
      const sim = duplicate.similarity;

      // Date range conflicts
      if (sim.dates < 0.5 && sim.dates > 0) {
        risks.push({
          type: 'date_conflict',
          severity: 'medium',
          message: `Date ranges don't align well with ${job.title} at ${job.org}`,
          details: `${primaryJob.date_start} to ${primaryJob.date_end} vs ${job.date_start} to ${job.date_end}`
        });
      }

      // Significant content differences
      if (sim.content < 0.3 && (primaryJob.description?.length > 100 && job.description?.length > 100)) {
        risks.push({
          type: 'content_mismatch',
          severity: 'high',
          message: `Job descriptions are significantly different`,
          details: 'May represent different roles or responsibilities'
        });
      }

      // Different skill sets
      if (sim.skills < 0.3 && (primaryJob.skills?.length > 0 && job.skills?.length > 0)) {
        risks.push({
          type: 'skills_mismatch',
          severity: 'low',
          message: `Different skill sets may indicate different responsibilities`,
          details: 'Review before merging to ensure accuracy'
        });
      }

      // Title mismatch with high company similarity
      if (sim.company > 0.9 && sim.title < 0.5) {
        risks.push({
          type: 'title_progression',
          severity: 'low',
          message: `Same company but different titles - may be career progression`,
          details: `${primaryJob.title} vs ${job.title}`
        });
      }
    });

    return risks;
  }

  /**
   * Get chunk count for a job
   * @param {number} jobId - Job ID
   * @returns {number} Number of chunks
   */
  async getChunkCount(jobId) {
    try {
      const { count, error } = await supabase
        .from('content_chunks')
        .select('id', { count: 'exact' })
        .eq('source_id', jobId);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      this.logger.warn('Error getting chunk count', { jobId, error: error.message });
      return 0;
    }
  }

  /**
   * Generate summary statistics
   * @param {Array} duplicateGroups - Duplicate groups
   * @param {number} totalJobs - Total number of jobs
   * @returns {Object} Summary statistics
   */
  generateSummary(duplicateGroups, totalJobs) {
    const exactDuplicates = duplicateGroups.filter(group => group.type === 'exact_duplicate').length;
    const nearDuplicates = duplicateGroups.filter(group => group.type === 'near_duplicate').length;
    const possibleDuplicates = duplicateGroups.filter(group => group.type === 'possible_duplicate').length;

    const autoMergeable = duplicateGroups.reduce((count, group) => {
      return count + group.duplicates.filter(dup => dup.confidence.autoMergeable).length;
    }, 0);

    const requiresReview = duplicateGroups.reduce((count, group) => {
      return count + group.duplicates.filter(dup => 
        dup.confidence.level === 'high' && !dup.confidence.autoMergeable
      ).length;
    }, 0);

    const totalDuplicates = duplicateGroups.reduce((count, group) => count + group.duplicates.length, 0);

    return {
      totalJobs,
      duplicateGroups: duplicateGroups.length,
      totalDuplicates,
      exactDuplicates,
      nearDuplicates,
      possibleDuplicates,
      autoMergeable,
      requiresReview,
      investigationNeeded: totalDuplicates - autoMergeable - requiresReview,
      potentialTimeSavings: this.estimateTimeSaved(totalDuplicates, 'mixed')
    };
  }

  /**
   * Generate global recommendations
   * @param {Array} duplicateGroups - Duplicate groups
   * @returns {Array} Global recommendations
   */
  generateGlobalRecommendations(duplicateGroups) {
    const recommendations = [];

    const autoMergeableCount = duplicateGroups.reduce((count, group) => {
      return count + group.duplicates.filter(dup => dup.confidence.autoMergeable).length;
    }, 0);

    if (autoMergeableCount > 0) {
      recommendations.push({
        type: 'auto_merge',
        priority: 'high',
        count: autoMergeableCount,
        message: `${autoMergeableCount} duplicates can be safely auto-merged`,
        action: 'Use bulk auto-merge to clean up obvious duplicates',
        estimatedTime: `${Math.ceil(autoMergeableCount * 0.5)} minutes saved`
      });
    }

    const reviewCount = duplicateGroups.reduce((count, group) => {
      return count + group.duplicates.filter(dup => 
        dup.confidence.level === 'high' && !dup.confidence.autoMergeable
      ).length;
    }, 0);

    if (reviewCount > 0) {
      recommendations.push({
        type: 'manual_review',
        priority: 'medium',
        count: reviewCount,
        message: `${reviewCount} high-confidence duplicates need manual review`,
        action: 'Review merge previews for high-similarity matches',
        estimatedTime: `${Math.ceil(reviewCount * 2)} minutes required`
      });
    }

    const investigateCount = duplicateGroups.reduce((count, group) => {
      return count + group.duplicates.filter(dup => dup.confidence.level === 'medium').length;
    }, 0);

    if (investigateCount > 0) {
      recommendations.push({
        type: 'investigate',
        priority: 'low',
        count: investigateCount,
        message: `${investigateCount} possible duplicates need investigation`,
        action: 'Review when time permits - may be legitimate separate entries',
        estimatedTime: `${Math.ceil(investigateCount * 1)} minutes to review`
      });
    }

    return recommendations;
  }

  /**
   * Estimate time saved by removing duplicates
   * @param {number} duplicateCount - Number of duplicates
   * @param {string} strategy - Merge strategy
   * @returns {string} Time estimate
   */
  estimateTimeSaved(duplicateCount, strategy) {
    let minutesPerDuplicate;
    
    switch (strategy) {
      case 'auto_merge':
        minutesPerDuplicate = 0.5;
        break;
      case 'review_recommended':
        minutesPerDuplicate = 2;
        break;
      case 'manual_review':
        minutesPerDuplicate = 3;
        break;
      default:
        minutesPerDuplicate = 1.5;
    }

    const totalMinutes = duplicateCount * minutesPerDuplicate;
    
    if (totalMinutes < 60) {
      return `${Math.ceil(totalMinutes)} minutes`;
    } else {
      return `${Math.round(totalMinutes / 60 * 10) / 10} hours`;
    }
  }
}

export default DuplicateDetectionService;