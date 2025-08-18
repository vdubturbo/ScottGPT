/**
 * Data Export Service
 * Provides comprehensive export capabilities for user data in multiple formats
 * Integrates with existing database structure and validation systems
 */

import winston from 'winston';
import { supabase } from '../config/database.js';
import { DataProcessingService } from '../utils/data-processing.js';
import { DataValidationService } from './data-validation.js';
import CompanyGroupingService from '../utils/company-grouping.js';
import { Parser } from 'json2csv';

export class DataExportService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/data-export.log' })
      ]
    });

    this.processingService = new DataProcessingService();
    this.validationService = new DataValidationService();
    this.companyGroupingService = new CompanyGroupingService();

    // Export format configurations
    this.exportFormats = {
      json: {
        mimeType: 'application/json',
        extension: 'json'
      },
      csv: {
        mimeType: 'text/csv',
        extension: 'csv'
      },
      resumeData: {
        mimeType: 'application/json',
        extension: 'json'
      },
      resumeDataGrouped: {
        mimeType: 'application/json',
        extension: 'json'
      },
      timeline: {
        mimeType: 'application/json',
        extension: 'json'
      }
    };
  }

  /**
   * Export complete work history as structured JSON
   * @param {Object} options - Export options
   * @returns {Object} Complete structured data
   */
  async exportJSON(options = {}) {
    try {
      const {
        includeChunks = false,
        includeEmbeddings = false,
        validate = true,
        dateRange = null
      } = options;

      this.logger.info('Exporting data as JSON', { options });

      // Get all job sources with optional date filtering
      let query = supabase
        .from('sources')
        .select('*')
        .eq('type', 'job')
        .order('date_start', { ascending: false });

      if (dateRange) {
        if (dateRange.start) {
          query = query.gte('date_start', dateRange.start);
        }
        if (dateRange.end) {
          query = query.lte('date_start', dateRange.end);
        }
      }

      const { data: jobs, error } = await query;
      if (error) throw error;

      // Process and enrich the data
      const enrichedJobs = await Promise.all(
        jobs.map(async (job) => {
          const processedJob = this.processingService.processJobData(job);
          
          // Add chunks if requested
          if (includeChunks) {
            const { data: chunks } = await supabase
              .from('content_chunks')
              .select(includeEmbeddings ? '*' : 'id, title, content, skills, created_at, updated_at')
              .eq('source_id', job.id)
              .order('created_at', { ascending: true });
            
            processedJob.chunks = chunks || [];
          }

          // Add validation if requested
          if (validate) {
            processedJob.validation = this.validationService.validateJobData(job, jobs);
          }

          return processedJob;
        })
      );

      // Generate export metadata
      const exportMetadata = {
        exportDate: new Date().toISOString(),
        exportFormat: 'json',
        exportOptions: options,
        totalJobs: enrichedJobs.length,
        dateRange: dateRange || 'all',
        dataVersion: '1.0',
        source: 'ScottGPT Data Export Service'
      };

      // Generate analytics
      const analytics = this.processingService.generateAnalytics(enrichedJobs);

      return {
        metadata: exportMetadata,
        jobs: enrichedJobs,
        analytics: {
          totalJobs: analytics.totalJobs,
          totalDurationMonths: analytics.totalDuration,
          averageDurationMonths: Math.round(analytics.averageDuration),
          skillFrequency: analytics.skillFrequency,
          organizationHistory: analytics.organizationHistory,
          industryTags: analytics.industryTags,
          careerProgression: this.analyzeCareerProgression(enrichedJobs)
        },
        exportSummary: {
          earliestPosition: enrichedJobs.length > 0 
            ? enrichedJobs[enrichedJobs.length - 1]?.date_start 
            : null,
          latestPosition: enrichedJobs.length > 0 
            ? enrichedJobs[0]?.date_start 
            : null,
          uniqueOrganizations: Object.keys(analytics.organizationHistory).length,
          totalSkills: Object.keys(analytics.skillFrequency).length
        }
      };

    } catch (error) {
      this.logger.error('Error exporting JSON data', { error: error.message });
      throw error;
    }
  }

  /**
   * Export data in CSV format for spreadsheet tools
   * @param {Object} options - Export options
   * @returns {string} CSV formatted data
   */
  async exportCSV(options = {}) {
    try {
      const { includeSkills = true, dateRange = null } = options;

      this.logger.info('Exporting data as CSV', { options });

      // Get structured data
      const jsonData = await this.exportJSON({ 
        includeChunks: false, 
        includeEmbeddings: false,
        validate: false,
        dateRange 
      });

      // Prepare CSV data with flattened structure
      const csvData = jsonData.jobs.map(job => {
        const flatJob = {
          id: job.id,
          title: job.title,
          organization: job.org,
          location: job.location || '',
          startDate: job.date_start || '',
          endDate: job.date_end || '',
          durationMonths: job.duration_months || 0,
          industryTags: (job.industry_tags || []).join('; '),
          summary: (job.summary || '').replace(/\n/g, ' ').replace(/"/g, '""'),
          description: (job.description || '').replace(/\n/g, ' ').replace(/"/g, '""'),
          outcomes: (job.outcomes || []).join('; '),
          createdAt: job.created_at,
          updatedAt: job.updated_at
        };

        // Add skills if requested
        if (includeSkills) {
          flatJob.skills = (job.skills || []).join('; ');
          flatJob.skillCount = (job.skills || []).length;
        }

        return flatJob;
      });

      // Define CSV fields
      const csvFields = [
        { label: 'ID', value: 'id' },
        { label: 'Job Title', value: 'title' },
        { label: 'Organization', value: 'organization' },
        { label: 'Location', value: 'location' },
        { label: 'Start Date', value: 'startDate' },
        { label: 'End Date', value: 'endDate' },
        { label: 'Duration (Months)', value: 'durationMonths' },
        { label: 'Industry Tags', value: 'industryTags' },
        { label: 'Summary', value: 'summary' },
        { label: 'Description', value: 'description' },
        { label: 'Key Outcomes', value: 'outcomes' },
        { label: 'Created At', value: 'createdAt' },
        { label: 'Updated At', value: 'updatedAt' }
      ];

      if (includeSkills) {
        csvFields.push(
          { label: 'Skills', value: 'skills' },
          { label: 'Skill Count', value: 'skillCount' }
        );
      }

      // Generate CSV
      const json2csvParser = new Parser({ 
        fields: csvFields,
        quote: '"',
        delimiter: ',',
        header: true
      });

      return json2csvParser.parse(csvData);

    } catch (error) {
      this.logger.error('Error exporting CSV data', { error: error.message });
      throw error;
    }
  }

  /**
   * Export clean data optimized for resume generation
   * @param {Object} options - Export options
   * @returns {Object} Resume-optimized data structure
   */
  async exportResumeData(options = {}) {
    try {
      const {
        maxJobs = null,
        skillLimit = 50,
        includeOutcomes = true,
        minDurationMonths = 1,
        excludeIndustries = []
      } = options;

      this.logger.info('Exporting resume-optimized data', { options });

      // Get base data
      const jsonData = await this.exportJSON({ 
        includeChunks: false, 
        validate: true 
      });

      // Filter and optimize jobs for resume
      let resumeJobs = jsonData.jobs
        .filter(job => {
          // Filter by minimum duration
          if (minDurationMonths && job.duration_months < minDurationMonths) {
            return false;
          }
          
          // Filter by excluded industries
          if (excludeIndustries.length > 0 && job.industry_tags) {
            const hasExcludedIndustry = job.industry_tags.some(tag => 
              excludeIndustries.includes(tag)
            );
            if (hasExcludedIndustry) return false;
          }

          // Only include valid jobs
          return job.validation?.isValid !== false;
        })
        .slice(0, maxJobs || undefined);

      // Process jobs for resume format
      const processedJobs = resumeJobs.map(job => ({
        id: job.id,
        title: job.title,
        organization: job.org,
        location: job.location,
        startDate: job.date_start,
        endDate: job.date_end,
        duration: this.formatDuration(job.date_start, job.date_end),
        summary: job.summary,
        keyAchievements: includeOutcomes ? (job.outcomes || []) : [],
        skills: job.skills || [],
        industryTags: job.industry_tags || [],
        isCurrentPosition: !job.date_end
      }));

      // Aggregate and prioritize skills
      const allSkills = processedJobs.flatMap(job => job.skills);
      const skillFrequency = {};
      allSkills.forEach(skill => {
        skillFrequency[skill] = (skillFrequency[skill] || 0) + 1;
      });

      const topSkills = Object.entries(skillFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, skillLimit)
        .map(([skill, count]) => ({ skill, frequency: count }));

      // Categorize skills
      const categorizedSkills = this.processingService.categorizeSkills(
        topSkills.map(s => s.skill)
      );

      // Generate career summary
      const careerSummary = this.generateCareerSummary(processedJobs, topSkills);

      // Generate company groupings for additional insights
      const companyGroups = this.companyGroupingService.groupJobsByCompany(processedJobs);

      return {
        metadata: {
          exportDate: new Date().toISOString(),
          exportFormat: 'resume-data',
          totalJobs: processedJobs.length,
          jobsFiltered: jsonData.jobs.length - processedJobs.length,
          skillsIncluded: topSkills.length,
          generatedFor: 'resume-generation',
          includesCompanyGrouping: true
        },
        profile: careerSummary,
        positions: processedJobs,
        companyGroups: companyGroups.map(company => ({
          name: company.normalizedName,
          originalNames: company.originalNames,
          totalTenure: company.tenure.formatted,
          positionCount: company.totalPositions,
          careerProgression: company.careerProgression.pattern,
          isBoomerang: company.boomerangPattern.isBoomerang,
          keySkills: company.aggregatedSkills.uniqueSkills.slice(0, 10),
          insights: company.insights
        })),
        skills: {
          top: topSkills,
          categorized: categorizedSkills,
          total: topSkills.length
        },
        timeline: this.generateResumeTimeline(processedJobs),
        statistics: {
          totalExperience: this.calculateTotalExperience(processedJobs),
          uniqueOrganizations: [...new Set(processedJobs.map(j => j.organization))].length,
          industries: [...new Set(processedJobs.flatMap(j => j.industryTags))],
          averagePositionDuration: this.calculateAveragePositionDuration(processedJobs)
        }
      };

    } catch (error) {
      this.logger.error('Error exporting resume data', { error: error.message });
      throw error;
    }
  }

  /**
   * Export resume data with company-focused grouping and hierarchy
   * @param {Object} options - Export options
   * @returns {Object} Company-grouped resume data structure
   */
  async exportResumeDataGrouped(options = {}) {
    try {
      const {
        maxCompanies = null,
        skillLimit = 50,
        includeProgressionDetails = true,
        includeBoomerangAnalysis = true,
        minCompanyTenureMonths = 3,
        showCompanyInsights = true
      } = options;

      this.logger.info('Exporting company-grouped resume data', { options });

      // Get base resume data first
      const baseData = await this.exportResumeData({
        maxJobs: null, // Get all jobs for proper company analysis
        skillLimit,
        includeOutcomes: true
      });

      // Group jobs by company with full analysis
      const companyGroups = this.companyGroupingService.groupJobsByCompany(baseData.positions);

      // Filter companies by minimum tenure if specified
      const filteredCompanies = companyGroups
        .filter(company => {
          if (minCompanyTenureMonths && company.tenure.days < (minCompanyTenureMonths * 30)) {
            return false;
          }
          return true;
        })
        .slice(0, maxCompanies || undefined);

      // Process companies for resume format with hierarchical structure
      const processedCompanies = filteredCompanies.map(company => {
        // Sort positions within company chronologically (most recent first for resume display)
        const sortedPositions = [...company.positions].sort((a, b) => {
          const aDate = new Date(a.startDate || '1900-01-01');
          const bDate = new Date(b.startDate || '1900-01-01');
          return bDate - aDate; // Most recent first
        });

        // Format positions for resume display
        const resumePositions = sortedPositions.map(position => ({
          title: position.title,
          startDate: position.startDate,
          endDate: position.endDate,
          duration: position.duration,
          summary: position.summary,
          keyAchievements: position.keyAchievements || [],
          skills: position.skills || [],
          isCurrentPosition: position.isCurrentPosition
        }));

        // Generate company-level achievements by combining all positions
        const allAchievements = sortedPositions
          .flatMap(pos => pos.keyAchievements || [])
          .filter(Boolean);

        // Create hierarchical company structure
        const companyData = {
          // Basic company information
          name: company.originalNames.length > 1 ? 
            company.originalNames[0] : // Use first/primary name
            company.originalNames[0],
          normalizedName: company.normalizedName,
          alternativeNames: company.originalNames.length > 1 ? 
            company.originalNames.slice(1) : [],
          
          // Tenure and position information
          totalTenure: company.tenure.formatted,
          tenureDetails: {
            years: company.tenure.years,
            months: company.tenure.months,
            days: company.tenure.days
          },
          positionCount: company.totalPositions,
          
          // Date range
          dateRange: {
            start: company.dateRange.start,
            end: company.dateRange.end,
            formatted: company.dateRange.formatted
          },
          
          // Hierarchical positions (most recent first)
          positions: resumePositions,
          
          // Aggregated company-level data
          skills: {
            all: company.aggregatedSkills.uniqueSkills,
            count: company.aggregatedSkills.skillCount,
            byFrequency: Object.entries(company.aggregatedSkills.skillFrequency)
              .sort(([,a], [,b]) => b - a)
              .slice(0, skillLimit)
              .map(([skill, frequency]) => ({ skill, frequency })),
            evolution: includeProgressionDetails ? company.aggregatedSkills.skillEvolution : null
          },
          
          // Combined achievements across all positions
          keyAchievements: [...new Set(allAchievements)].slice(0, 10),
          
          // Career progression analysis
          careerProgression: includeProgressionDetails ? {
            pattern: company.careerProgression.pattern,
            progressionScore: company.careerProgression.progressionScore,
            promotions: company.careerProgression.promotions.map(promo => ({
              from: promo.from.title,
              to: promo.to.title,
              date: promo.to.date,
              indicators: promo.indicators
            })),
            lateralMoves: company.careerProgression.lateralMoves.length,
            totalRoleChanges: company.careerProgression.totalRoleChanges,
            insights: company.careerProgression.insights
          } : {
            pattern: company.careerProgression.pattern,
            promotionCount: company.careerProgression.promotions.length
          },
          
          // Boomerang analysis
          boomerangPattern: includeBoomerangAnalysis ? {
            isBoomerang: company.boomerangPattern.isBoomerang,
            stints: company.boomerangPattern.stints,
            gaps: company.boomerangPattern.gaps.map(gap => ({
              duration: gap.durationFormatted,
              start: gap.start,
              end: gap.end
            })),
            insights: company.boomerangPattern.insights
          } : {
            isBoomerang: company.boomerangPattern.isBoomerang,
            stints: company.boomerangPattern.stints
          },
          
          // Company insights
          insights: showCompanyInsights ? company.insights : [],
          
          // Display formatting helpers
          displayFormat: this.formatCompanyForResume(company, resumePositions)
        };

        return companyData;
      });

      // Generate overall career insights across companies
      const careerInsights = this.generateCrossCompanyInsights(filteredCompanies);
      
      // Aggregate skills across all companies
      const allCompanySkills = filteredCompanies
        .flatMap(company => company.aggregatedSkills.uniqueSkills);
      const globalSkillFrequency = {};
      allCompanySkills.forEach(skill => {
        globalSkillFrequency[skill] = (globalSkillFrequency[skill] || 0) + 1;
      });

      const topGlobalSkills = Object.entries(globalSkillFrequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, skillLimit)
        .map(([skill, frequency]) => ({ skill, frequency }));

      return {
        metadata: {
          exportDate: new Date().toISOString(),
          exportFormat: 'resume-data-grouped',
          totalCompanies: processedCompanies.length,
          companiesFiltered: companyGroups.length - processedCompanies.length,
          totalPositions: processedCompanies.reduce((sum, company) => sum + company.positionCount, 0),
          skillsIncluded: topGlobalSkills.length,
          generatedFor: 'company-grouped-resume-generation',
          includesProgressionDetails: includeProgressionDetails,
          includesBoomerangAnalysis: includeBoomerangAnalysis
        },
        
        // Enhanced profile with company-level insights
        profile: {
          ...baseData.profile,
          companyCount: processedCompanies.length,
          averageCompanyTenure: this.calculateAverageCompanyTenure(processedCompanies),
          boomerangCompanies: processedCompanies.filter(c => c.boomerangPattern.isBoomerang).length,
          careerProgressionSummary: this.summarizeCareerProgression(processedCompanies)
        },
        
        // Company-grouped structure (primary output)
        companies: processedCompanies,
        
        // Global skills across all companies
        skills: {
          global: {
            top: topGlobalSkills,
            total: topGlobalSkills.length,
            categorized: this.processingService.categorizeSkills(topGlobalSkills.map(s => s.skill))
          },
          byCompany: processedCompanies.map(company => ({
            company: company.name,
            skills: company.skills.byFrequency.slice(0, 10)
          }))
        },
        
        // Cross-company insights
        careerInsights,
        
        // Statistics
        statistics: {
          ...baseData.statistics,
          companyStatistics: {
            totalCompanies: processedCompanies.length,
            averageTenurePerCompany: this.calculateAverageCompanyTenure(processedCompanies),
            longestTenure: Math.max(...processedCompanies.map(c => c.tenureDetails.days)),
            shortestTenure: Math.min(...processedCompanies.map(c => c.tenureDetails.days)),
            companiesWithPromotions: processedCompanies.filter(c => c.careerProgression.promotionCount > 0).length,
            boomerangCompanies: processedCompanies.filter(c => c.boomerangPattern.isBoomerang).length
          }
        },
        
        // Formatting templates for different resume styles
        resumeTemplates: {
          hierarchical: this.generateHierarchicalTemplate(processedCompanies),
          chronological: this.generateChronologicalTemplate(processedCompanies),
          skills_based: this.generateSkillsBasedTemplate(processedCompanies, topGlobalSkills)
        }
      };

    } catch (error) {
      this.logger.error('Error exporting company-grouped resume data', { error: error.message });
      throw error;
    }
  }

  /**
   * Export chronological timeline data
   * @param {Object} options - Export options
   * @returns {Object} Timeline-structured data
   */
  async exportTimeline(options = {}) {
    try {
      const { 
        includeGaps = true, 
        includeOverlaps = true,
        groupByYear = false,
        includeSkillEvolution = true
      } = options;

      this.logger.info('Exporting timeline data', { options });

      // Get base data
      const jsonData = await this.exportJSON({ 
        includeChunks: false, 
        validate: true 
      });

      // Sort jobs chronologically
      const chronologicalJobs = jsonData.jobs
        .filter(job => job.date_start)
        .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

      // Build timeline entries
      const timelineEntries = chronologicalJobs.map(job => ({
        id: job.id,
        type: 'position',
        title: job.title,
        organization: job.org,
        location: job.location,
        startDate: job.date_start,
        endDate: job.date_end,
        duration: job.duration_months,
        skills: job.skills || [],
        industryTags: job.industry_tags || [],
        summary: job.summary,
        outcomes: job.outcomes || [],
        isValid: job.validation?.isValid !== false
      }));

      // Add gaps if requested
      if (includeGaps) {
        const gaps = this.identifyTimelineGaps(chronologicalJobs);
        gaps.forEach(gap => {
          timelineEntries.push({
            id: `gap-${gap.start}-${gap.end}`,
            type: 'gap',
            startDate: gap.start,
            endDate: gap.end,
            duration: gap.durationMonths,
            severity: gap.severity,
            suggestions: gap.suggestions || []
          });
        });
      }

      // Add overlaps if requested
      if (includeOverlaps) {
        const overlaps = this.identifyTimelineOverlaps(chronologicalJobs);
        overlaps.forEach(overlap => {
          timelineEntries.push({
            id: `overlap-${overlap.job1.id}-${overlap.job2.id}`,
            type: 'overlap',
            startDate: overlap.start,
            endDate: overlap.end,
            duration: overlap.durationDays,
            severity: overlap.severity,
            affectedJobs: [overlap.job1, overlap.job2]
          });
        });
      }

      // Sort all entries chronologically
      timelineEntries.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

      // Group by year if requested
      let groupedTimeline = null;
      if (groupByYear) {
        groupedTimeline = this.groupTimelineByYear(timelineEntries);
      }

      // Track skill evolution
      let skillEvolution = null;
      if (includeSkillEvolution) {
        skillEvolution = this.trackSkillEvolution(chronologicalJobs);
      }

      return {
        metadata: {
          exportDate: new Date().toISOString(),
          exportFormat: 'timeline',
          totalEntries: timelineEntries.length,
          positions: timelineEntries.filter(e => e.type === 'position').length,
          gaps: timelineEntries.filter(e => e.type === 'gap').length,
          overlaps: timelineEntries.filter(e => e.type === 'overlap').length,
          timespan: this.calculateTimespan(chronologicalJobs)
        },
        timeline: timelineEntries,
        groupedByYear: groupedTimeline,
        skillEvolution,
        analysis: {
          careerProgression: this.analyzeCareerProgression(chronologicalJobs),
          industryTransitions: this.analyzeIndustryTransitions(chronologicalJobs),
          skillDevelopment: this.analyzeSkillDevelopment(chronologicalJobs),
          gapAnalysis: includeGaps ? this.analyzeGapPatterns(timelineEntries.filter(e => e.type === 'gap')) : null
        }
      };

    } catch (error) {
      this.logger.error('Error exporting timeline data', { error: error.message });
      throw error;
    }
  }

  /**
   * Validate export data before generation
   * @param {string} format - Export format
   * @param {Object} options - Export options
   * @returns {Object} Validation result
   */
  async validateExportRequest(format, options = {}) {
    try {
      const validation = {
        isValid: true,
        errors: [],
        warnings: [],
        recommendations: []
      };

      // Validate format
      if (!this.exportFormats[format]) {
        validation.isValid = false;
        validation.errors.push(`Unsupported export format: ${format}`);
      }

      // Validate date range
      if (options.dateRange) {
        const { start, end } = options.dateRange;
        if (start && end && new Date(start) > new Date(end)) {
          validation.isValid = false;
          validation.errors.push('Start date cannot be after end date');
        }
      }

      // Check data availability
      const { count } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'job');

      if (count === 0) {
        validation.isValid = false;
        validation.errors.push('No job data available for export');
      } else if (count < 5) {
        validation.warnings.push('Limited job data available - export may be incomplete');
      }

      // Format-specific validations
      switch (format) {
        case 'csv':
          if (options.includeChunks) {
            validation.warnings.push('CSV format does not support chunks - option will be ignored');
          }
          break;
        
        case 'resumeData':
          if (options.maxJobs && options.maxJobs < 3) {
            validation.warnings.push('Very few jobs selected for resume - consider including more positions');
          }
          break;

        case 'resumeDataGrouped':
          if (options.maxCompanies && options.maxCompanies < 2) {
            validation.warnings.push('Very few companies selected for grouped resume - consider including more organizations');
          }
          if (options.minCompanyTenureMonths && options.minCompanyTenureMonths > 12) {
            validation.warnings.push('High minimum tenure may exclude valuable short-term positions');
          }
          break;

        case 'timeline':
          if (count < 2) {
            validation.warnings.push('Timeline analysis requires at least 2 positions');
          }
          break;
      }

      // Add recommendations
      if (count > 0) {
        validation.recommendations.push('Consider validating your data quality before export');
        
        if (format === 'resumeData') {
          validation.recommendations.push('Review skill selections to ensure they align with your target roles');
        }
      }

      return validation;

    } catch (error) {
      this.logger.error('Error validating export request', { format, error: error.message });
      return {
        isValid: false,
        errors: [`Validation failed: ${error.message}`],
        warnings: [],
        recommendations: []
      };
    }
  }

  /**
   * Generate preview of export data
   * @param {string} format - Export format
   * @param {Object} options - Export options
   * @returns {Object} Preview data
   */
  async generateExportPreview(format, options = {}) {
    try {
      this.logger.info('Generating export preview', { format, options });

      // Limit preview data
      const previewOptions = {
        ...options,
        maxJobs: Math.min(options.maxJobs || 5, 5), // Limit to 5 jobs for preview
        includeChunks: false, // Never include chunks in preview
        includeEmbeddings: false
      };

      let previewData;
      switch (format) {
        case 'json':
          previewData = await this.exportJSON(previewOptions);
          // Truncate for preview
          previewData.jobs = previewData.jobs.slice(0, 3);
          break;

        case 'csv':
          const csvData = await this.exportCSV(previewOptions);
          // Show first few lines
          const lines = csvData.split('\n');
          previewData = {
            header: lines[0],
            sampleRows: lines.slice(1, 4),
            totalRows: lines.length - 1,
            truncated: lines.length > 4
          };
          break;

        case 'resumeData':
          previewData = await this.exportResumeData(previewOptions);
          // Truncate positions
          previewData.positions = previewData.positions.slice(0, 3);
          break;

        case 'resumeDataGrouped':
          previewData = await this.exportResumeDataGrouped({
            ...previewOptions,
            maxCompanies: Math.min(previewOptions.maxCompanies || 3, 3)
          });
          // Truncate companies and positions within companies
          previewData.companies = previewData.companies.slice(0, 2).map(company => ({
            ...company,
            positions: company.positions.slice(0, 2)
          }));
          break;

        case 'timeline':
          previewData = await this.exportTimeline(previewOptions);
          // Truncate timeline
          previewData.timeline = previewData.timeline.slice(0, 5);
          break;

        default:
          throw new Error(`Unsupported format for preview: ${format}`);
      }

      return {
        format,
        preview: previewData,
        isPreview: true,
        previewLimitations: {
          maxJobsShown: previewOptions.maxJobs,
          chunksExcluded: true,
          embeddingsExcluded: true
        },
        estimatedFullSize: await this.estimateExportSize(format, options)
      };

    } catch (error) {
      this.logger.error('Error generating export preview', { format, error: error.message });
      throw error;
    }
  }

  // Helper methods

  /**
   * Analyze career progression patterns
   */
  analyzeCareerProgression(jobs) {
    if (jobs.length < 2) return null;

    const chronological = jobs
      .filter(job => job.date_start)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    const progression = {
      totalPositions: chronological.length,
      averageTenure: this.calculateAveragePositionDuration(chronological),
      organizationChanges: this.countOrganizationChanges(chronological),
      titleProgression: this.analyzeTitleProgression(chronological),
      skillGrowth: this.analyzeSkillGrowth(chronological),
      industryMobility: this.analyzeIndustryMobility(chronological)
    };

    return progression;
  }

  /**
   * Format duration in human-readable form
   */
  formatDuration(startDate, endDate) {
    if (!startDate) return 'Unknown duration';
    
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const months = this.processingService.calculateDuration(startDate, endDate);

    if (months < 12) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    } else {
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      
      let duration = `${years} year${years !== 1 ? 's' : ''}`;
      if (remainingMonths > 0) {
        duration += ` ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
      }
      return duration;
    }
  }

  /**
   * Generate career summary for resume
   */
  generateCareerSummary(jobs, topSkills) {
    const totalExperience = this.calculateTotalExperience(jobs);
    const industries = [...new Set(jobs.flatMap(j => j.industryTags))];
    const organizations = [...new Set(jobs.map(j => j.organization))];

    return {
      totalExperienceYears: Math.floor(totalExperience / 12),
      totalExperienceMonths: totalExperience % 12,
      primaryIndustries: industries.slice(0, 3),
      organizationCount: organizations.length,
      topSkills: topSkills.slice(0, 10).map(s => s.skill),
      currentRole: jobs.find(j => j.isCurrentPosition),
      experienceLevel: this.determineExperienceLevel(totalExperience)
    };
  }

  /**
   * Identify timeline gaps
   */
  identifyTimelineGaps(jobs) {
    const gaps = [];
    const sortedJobs = jobs
      .filter(job => job.date_start)
      .sort((a, b) => new Date(a.date_start) - new Date(b.date_start));

    for (let i = 0; i < sortedJobs.length - 1; i++) {
      const current = sortedJobs[i];
      const next = sortedJobs[i + 1];
      
      const currentEnd = current.date_end ? new Date(current.date_end) : new Date();
      const nextStart = new Date(next.date_start);
      
      const gapMs = nextStart - currentEnd;
      const gapMonths = Math.round(gapMs / (1000 * 60 * 60 * 24 * 30));
      
      if (gapMonths > 1) {
        gaps.push({
          start: currentEnd.toISOString().split('T')[0],
          end: nextStart.toISOString().split('T')[0],
          durationMonths: gapMonths,
          severity: gapMonths > 12 ? 'high' : gapMonths > 6 ? 'medium' : 'low',
          beforeJob: { id: current.id, title: current.title },
          afterJob: { id: next.id, title: next.title }
        });
      }
    }

    return gaps;
  }

  /**
   * Identify timeline overlaps
   */
  identifyTimelineOverlaps(jobs) {
    const overlaps = [];
    
    for (let i = 0; i < jobs.length; i++) {
      for (let j = i + 1; j < jobs.length; j++) {
        const job1 = jobs[i];
        const job2 = jobs[j];
        
        if (!job1.date_start || !job2.date_start) continue;
        
        const job1Start = new Date(job1.date_start);
        const job1End = job1.date_end ? new Date(job1.date_end) : new Date();
        const job2Start = new Date(job2.date_start);
        const job2End = job2.date_end ? new Date(job2.date_end) : new Date();
        
        // Check for overlap
        if (job1Start < job2End && job2Start < job1End) {
          const overlapStart = new Date(Math.max(job1Start, job2Start));
          const overlapEnd = new Date(Math.min(job1End, job2End));
          const overlapDays = Math.round((overlapEnd - overlapStart) / (1000 * 60 * 60 * 24));
          
          if (overlapDays > 0) {
            overlaps.push({
              start: overlapStart.toISOString().split('T')[0],
              end: overlapEnd.toISOString().split('T')[0],
              durationDays: overlapDays,
              severity: overlapDays > 90 ? 'high' : overlapDays > 30 ? 'medium' : 'low',
              job1: { id: job1.id, title: job1.title, org: job1.org },
              job2: { id: job2.id, title: job2.title, org: job2.org }
            });
          }
        }
      }
    }

    return overlaps;
  }

  /**
   * Calculate total career experience
   */
  calculateTotalExperience(jobs) {
    return jobs.reduce((total, job) => {
      return total + (job.duration || 0);
    }, 0);
  }

  /**
   * Calculate average position duration
   */
  calculateAveragePositionDuration(jobs) {
    if (jobs.length === 0) return 0;
    const totalMonths = jobs.reduce((sum, job) => sum + (job.duration || 0), 0);
    return Math.round(totalMonths / jobs.length);
  }

  /**
   * Estimate export file size
   */
  async estimateExportSize(format, options) {
    try {
      const { count } = await supabase
        .from('sources')
        .select('*', { count: 'exact', head: true })
        .eq('type', 'job');

      // Rough size estimates based on format and job count
      const baseSizePerJob = {
        json: 2000, // ~2KB per job in JSON
        csv: 500,   // ~500B per job in CSV
        resumeData: 1500, // ~1.5KB per job
        resumeDataGrouped: 3000, // ~3KB per job (includes company analysis)
        timeline: 1800 // ~1.8KB per job
      };

      const baseSize = (baseSizePerJob[format] || 1000) * count;
      
      // Add overhead for metadata, analytics, etc.
      const overhead = format === 'json' ? baseSize * 0.3 : baseSize * 0.1;
      
      const estimatedBytes = baseSize + overhead;
      
      return {
        bytes: Math.round(estimatedBytes),
        humanReadable: this.formatFileSize(estimatedBytes),
        jobCount: count
      };

    } catch (error) {
      this.logger.error('Error estimating export size', { error: error.message });
      return {
        bytes: 0,
        humanReadable: 'Unknown',
        jobCount: 0
      };
    }
  }

  /**
   * Format file size in human-readable format
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Additional helper methods for analysis
   */
  
  countOrganizationChanges(jobs) {
    let changes = 0;
    for (let i = 1; i < jobs.length; i++) {
      if (jobs[i].org !== jobs[i-1].org) {
        changes++;
      }
    }
    return changes;
  }

  analyzeTitleProgression(jobs) {
    return jobs.map(job => ({
      title: job.title,
      organization: job.org,
      startDate: job.date_start,
      seniorityLevel: this.determineSeniorityLevel(job.title)
    }));
  }

  analyzeSkillGrowth(jobs) {
    const skillsByJob = jobs.map(job => ({
      jobId: job.id,
      startDate: job.date_start,
      skills: job.skills || []
    }));

    return skillsByJob;
  }

  analyzeIndustryMobility(jobs) {
    const industries = jobs.map(job => ({
      startDate: job.date_start,
      industries: job.industry_tags || []
    }));

    return industries;
  }

  determineSeniorityLevel(title) {
    const titleLower = title.toLowerCase();
    if (titleLower.includes('director') || titleLower.includes('vp') || titleLower.includes('chief')) {
      return 'executive';
    } else if (titleLower.includes('senior') || titleLower.includes('principal') || titleLower.includes('lead')) {
      return 'senior';
    } else if (titleLower.includes('manager')) {
      return 'management';
    } else if (titleLower.includes('junior') || titleLower.includes('associate') || titleLower.includes('intern')) {
      return 'junior';
    }
    return 'mid';
  }

  determineExperienceLevel(totalMonths) {
    const years = totalMonths / 12;
    if (years < 2) return 'entry';
    if (years < 5) return 'junior';
    if (years < 10) return 'mid';
    if (years < 15) return 'senior';
    return 'executive';
  }

  trackSkillEvolution(jobs) {
    const evolution = [];
    jobs.forEach(job => {
      if (job.date_start && job.skills) {
        evolution.push({
          date: job.date_start,
          skills: job.skills,
          jobTitle: job.title,
          organization: job.org
        });
      }
    });
    return evolution.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  groupTimelineByYear(entries) {
    const grouped = {};
    entries.forEach(entry => {
      const year = new Date(entry.startDate).getFullYear();
      if (!grouped[year]) {
        grouped[year] = [];
      }
      grouped[year].push(entry);
    });
    return grouped;
  }

  calculateTimespan(jobs) {
    if (jobs.length === 0) return null;
    
    const dates = jobs
      .map(job => job.date_start)
      .filter(Boolean)
      .map(date => new Date(date));
    
    if (dates.length === 0) return null;

    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    
    return {
      start: earliest.toISOString().split('T')[0],
      end: latest.toISOString().split('T')[0],
      durationYears: Math.round((latest - earliest) / (1000 * 60 * 60 * 24 * 365))
    };
  }

  analyzeIndustryTransitions(jobs) {
    const transitions = [];
    for (let i = 1; i < jobs.length; i++) {
      const prev = jobs[i-1];
      const curr = jobs[i];
      
      const prevIndustries = prev.industry_tags || [];
      const currIndustries = curr.industry_tags || [];
      
      const isTransition = !prevIndustries.some(tag => currIndustries.includes(tag));
      
      if (isTransition) {
        transitions.push({
          from: {
            job: prev.title,
            organization: prev.org,
            industries: prevIndustries,
            date: prev.date_start
          },
          to: {
            job: curr.title,
            organization: curr.org,
            industries: currIndustries,
            date: curr.date_start
          }
        });
      }
    }
    return transitions;
  }

  analyzeSkillDevelopment(jobs) {
    const skillsByPeriod = {};
    jobs.forEach(job => {
      const year = job.date_start ? new Date(job.date_start).getFullYear() : 'unknown';
      if (!skillsByPeriod[year]) {
        skillsByPeriod[year] = new Set();
      }
      (job.skills || []).forEach(skill => skillsByPeriod[year].add(skill));
    });

    // Convert sets to arrays and calculate growth
    const development = Object.entries(skillsByPeriod).map(([year, skillSet]) => ({
      year: parseInt(year),
      skills: Array.from(skillSet),
      skillCount: skillSet.size
    })).sort((a, b) => a.year - b.year);

    return development;
  }

  analyzeGapPatterns(gaps) {
    if (gaps.length === 0) return null;

    const totalGapMonths = gaps.reduce((sum, gap) => sum + gap.duration, 0);
    const averageGapMonths = Math.round(totalGapMonths / gaps.length);
    
    return {
      totalGaps: gaps.length,
      totalGapMonths,
      averageGapMonths,
      longestGap: Math.max(...gaps.map(g => g.duration)),
      gapsBySeverity: {
        high: gaps.filter(g => g.severity === 'high').length,
        medium: gaps.filter(g => g.severity === 'medium').length,
        low: gaps.filter(g => g.severity === 'low').length
      }
    };
  }

  // ============================================================================
  // COMPANY GROUPING HELPER METHODS
  // ============================================================================

  /**
   * Format company data for resume display
   */
  formatCompanyForResume(company, positions) {
    const header = `${company.originalNames[0]} (${company.dateRange.formatted}, ${company.tenure.formatted})`;
    
    const positionLines = positions.map((position, index) => {
      const isLast = index === positions.length - 1;
      const prefix = isLast ? '└──' : '├──';
      const dateRange = `${this.formatDate(position.startDate)} - ${this.formatDate(position.endDate)}`;
      return `${prefix} ${position.title} (${dateRange})`;
    });

    const skills = `Skills: [${company.aggregatedSkills.uniqueSkills.slice(0, 10).join(', ')}]`;
    const achievements = company.insights.length > 0 ? 
      `Key Achievements: [${company.insights.slice(0, 3).join(', ')}]` : '';

    return {
      header,
      positions: positionLines,
      skills,
      achievements,
      fullText: [header, ...positionLines, skills, achievements].filter(Boolean).join('\n')
    };
  }

  /**
   * Generate cross-company career insights
   */
  generateCrossCompanyInsights(companies) {
    const insights = [];

    // Company loyalty analysis
    const companiesWithMultiplePositions = companies.filter(c => c.totalPositions > 1).length;
    const boomerangCompanies = companies.filter(c => c.boomerangPattern.isBoomerang).length;
    
    if (companiesWithMultiplePositions > 0) {
      insights.push(`Career growth within organizations: ${companiesWithMultiplePositions} companies with multiple positions`);
    }

    if (boomerangCompanies > 0) {
      insights.push(`Boomerang career pattern: Returned to ${boomerangCompanies} company${boomerangCompanies > 1 ? 'ies' : ''}`);
    }

    // Career progression patterns
    const promotionCompanies = companies.filter(c => c.careerProgression.promotions.length > 0);
    if (promotionCompanies.length > 0) {
      const totalPromotions = promotionCompanies.reduce((sum, c) => sum + c.careerProgression.promotions.length, 0);
      insights.push(`Career advancement: ${totalPromotions} promotions across ${promotionCompanies.length} companies`);
    }

    // Tenure patterns
    const longTenureCompanies = companies.filter(c => c.tenure.years >= 3).length;
    if (longTenureCompanies > 0) {
      insights.push(`Long-term commitment: ${longTenureCompanies} companies with 3+ year tenure`);
    }

    // Skills evolution
    const skillEvolutionCompanies = companies.filter(c => 
      c.aggregatedSkills.skillEvolution && c.aggregatedSkills.skillEvolution.length > 0
    );
    if (skillEvolutionCompanies.length > 0) {
      insights.push(`Continuous learning: Skill evolution demonstrated across ${skillEvolutionCompanies.length} companies`);
    }

    return {
      insights,
      summary: {
        totalCompanies: companies.length,
        growthCompanies: companiesWithMultiplePositions,
        boomerangCompanies,
        promotionCompanies: promotionCompanies.length,
        longTenureCompanies
      }
    };
  }

  /**
   * Calculate average company tenure
   */
  calculateAverageCompanyTenure(companies) {
    if (companies.length === 0) return 0;
    
    const totalDays = companies.reduce((sum, company) => sum + company.tenureDetails.days, 0);
    const avgDays = totalDays / companies.length;
    const avgMonths = Math.round(avgDays / 30);
    
    return {
      days: Math.round(avgDays),
      months: avgMonths,
      years: Math.round(avgMonths / 12),
      formatted: this.formatDuration(null, null, avgDays)
    };
  }

  /**
   * Summarize career progression across companies
   */
  summarizeCareerProgression(companies) {
    const totalPromotions = companies.reduce((sum, c) => sum + (c.careerProgression.promotionCount || 0), 0);
    const totalLateralMoves = companies.reduce((sum, c) => sum + (c.careerProgression.lateralMoves || 0), 0);
    
    const progressionPatterns = companies.map(c => c.careerProgression.pattern);
    const strongUpwardCount = progressionPatterns.filter(p => p === 'strong_upward').length;
    const upwardCount = progressionPatterns.filter(p => p === 'upward').length;

    return {
      totalPromotions,
      totalLateralMoves,
      companiesWithStrongProgression: strongUpwardCount,
      companiesWithUpwardProgression: upwardCount,
      overallPattern: strongUpwardCount > companies.length / 2 ? 'strong_upward' : 
                     (strongUpwardCount + upwardCount) > companies.length / 2 ? 'upward' : 'mixed'
    };
  }

  /**
   * Generate hierarchical resume template
   */
  generateHierarchicalTemplate(companies) {
    const template = {
      title: 'Company-Grouped Resume Format',
      description: 'Hierarchical view showing career progression within each company',
      sections: companies.map(company => ({
        companyHeader: {
          name: company.name,
          tenure: company.totalTenure,
          positionCount: company.positionCount,
          formatted: `**${company.name}** | ${company.totalTenure} | ${company.positionCount} position${company.positionCount > 1 ? 's' : ''}`
        },
        positions: company.positions.map((position, index) => ({
          title: position.title,
          dateRange: `${this.formatDate(position.startDate)} - ${this.formatDate(position.endDate)}`,
          duration: position.duration,
          formatted: `  ${position.title} | ${this.formatDate(position.startDate)} - ${this.formatDate(position.endDate)}`
        })),
        skills: {
          list: company.skills.byFrequency.slice(0, 8),
          formatted: `**Skills:** ${company.skills.byFrequency.slice(0, 8).map(s => s.skill).join(', ')}`
        },
        achievements: {
          list: company.keyAchievements.slice(0, 5),
          formatted: company.keyAchievements.slice(0, 5).map(achievement => `  • ${achievement}`).join('\n')
        }
      }))
    };

    return template;
  }

  /**
   * Generate chronological resume template
   */
  generateChronologicalTemplate(companies) {
    // Flatten all positions from all companies and sort chronologically
    const allPositions = companies.flatMap(company => 
      company.positions.map(position => ({
        ...position,
        companyName: company.name,
        companyTenure: company.totalTenure,
        companySkills: company.skills.byFrequency.slice(0, 5)
      }))
    );

    // Sort by start date (most recent first)
    allPositions.sort((a, b) => {
      const aDate = new Date(a.startDate || '1900-01-01');
      const bDate = new Date(b.startDate || '1900-01-01');
      return bDate - aDate;
    });

    return {
      title: 'Chronological Resume Format',
      description: 'Traditional chronological view with company context',
      positions: allPositions.map(position => ({
        header: `${position.title} | ${position.companyName}`,
        dateRange: `${this.formatDate(position.startDate)} - ${this.formatDate(position.endDate)}`,
        duration: position.duration,
        skills: position.skills.slice(0, 6),
        achievements: position.keyAchievements.slice(0, 3),
        formatted: `**${position.title}** | *${position.companyName}* | ${this.formatDate(position.startDate)} - ${this.formatDate(position.endDate)}`
      }))
    };
  }

  /**
   * Generate skills-based resume template
   */
  generateSkillsBasedTemplate(companies, globalSkills) {
    // Group companies by primary skill categories
    const skillCategories = this.processingService.categorizeSkills(globalSkills.map(s => s.skill));
    
    const skillBasedSections = Object.entries(skillCategories).map(([category, count]) => {
      const relevantCompanies = companies.filter(company => {
        const companySkills = company.skills.all.join(' ').toLowerCase();
        return globalSkills
          .filter(gs => this.processingService.categorizeSkills([gs.skill])[category])
          .some(skill => companySkills.includes(skill.skill.toLowerCase()));
      });

      return {
        skillCategory: category,
        skillCount: count,
        companiesWithSkills: relevantCompanies.length,
        companies: relevantCompanies.map(company => ({
          name: company.name,
          positions: company.positions.map(p => p.title).join(', '),
          tenure: company.totalTenure,
          relevantSkills: company.skills.byFrequency
            .filter(skill => this.processingService.categorizeSkills([skill.skill])[category])
            .slice(0, 5)
        }))
      };
    });

    return {
      title: 'Skills-Based Resume Format',
      description: 'Organized by skill categories with supporting company experience',
      skillSections: skillBasedSections
    };
  }

  /**
   * Helper method to format dates consistently
   */
  formatDate(dateStr) {
    if (!dateStr) return 'Present';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short' 
    });
  }

  /**
   * Enhanced duration formatting with days support
   */
  formatDuration(startDate, endDate, totalDays = null) {
    if (totalDays !== null) {
      const years = Math.floor(totalDays / 365);
      const months = Math.floor((totalDays % 365) / 30);
      
      if (years > 0) {
        return months > 0 ? `${years} year${years > 1 ? 's' : ''} ${months} month${months > 1 ? 's' : ''}` : 
                           `${years} year${years > 1 ? 's' : ''}`;
      }
      return `${months} month${months > 1 ? 's' : ''}`;
    }

    // Fall back to existing duration formatting
    return this.formatDuration(startDate, endDate);
  }
}

export default DataExportService;