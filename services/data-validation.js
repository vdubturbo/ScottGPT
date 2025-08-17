/**
 * Data Validation Service
 * Provides comprehensive validation for user work history data
 * Implements hard validation (reject) and soft validation (warn) rules
 */

import winston from 'winston';

export class DataValidationService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/data-validation.log' })
      ]
    });
  }

  /**
   * Validate job data with hard and soft validation rules
   * @param {Object} jobData - Job data to validate
   * @param {Array} existingJobs - Existing jobs for timeline validation
   * @returns {Object} Validation result with errors and warnings
   */
  validateJobData(jobData, existingJobs = []) {
    const result = {
      isValid: true,
      errors: [],
      warnings: [],
      processedData: { ...jobData }
    };

    try {
      // Hard validation (critical errors that prevent saving)
      this._validateRequired(jobData, result);
      this._validateDates(jobData, result);
      this._validateDataTypes(jobData, result);
      this._validateBusinessRules(jobData, result);

      // Soft validation (warnings that allow saving but notify user)
      if (result.errors.length === 0) {
        this._validateTimeline(jobData, existingJobs, result);
        this._validateBusinessLogic(jobData, result);
        this._validateDataQuality(jobData, result);
      }

      // Set overall validity
      result.isValid = result.errors.length === 0;

      this.logger.info('Job data validation completed', {
        jobId: jobData.id,
        isValid: result.isValid,
        errorCount: result.errors.length,
        warningCount: result.warnings.length
      });

    } catch (error) {
      this.logger.error('Validation error occurred', { error: error.message });
      result.errors.push({
        field: 'system',
        code: 'VALIDATION_ERROR',
        message: 'An error occurred during validation',
        severity: 'critical'
      });
      result.isValid = false;
    }

    return result;
  }

  /**
   * Validate required fields (hard validation)
   */
  _validateRequired(jobData, result) {
    const requiredFields = [
      { field: 'title', message: 'Job title is required' },
      { field: 'org', message: 'Company/organization is required' },
      { field: 'date_start', message: 'Start date is required' }
    ];

    requiredFields.forEach(({ field, message }) => {
      if (!jobData[field] || (typeof jobData[field] === 'string' && jobData[field].trim() === '')) {
        result.errors.push({
          field,
          code: 'REQUIRED_FIELD',
          message,
          severity: 'critical'
        });
      }
    });
  }

  /**
   * Validate date formats and logic (hard validation)
   */
  _validateDates(jobData, result) {
    const { date_start, date_end } = jobData;

    // Validate start date format
    if (date_start && !this._isValidDate(date_start)) {
      result.errors.push({
        field: 'date_start',
        code: 'INVALID_DATE_FORMAT',
        message: 'Start date must be in YYYY-MM-DD format',
        severity: 'critical'
      });
      return;
    }

    // Validate end date format (if provided)
    if (date_end && date_end !== null && !this._isValidDate(date_end)) {
      result.errors.push({
        field: 'date_end',
        code: 'INVALID_DATE_FORMAT',
        message: 'End date must be in YYYY-MM-DD format or null for current position',
        severity: 'critical'
      });
      return;
    }

    // Validate date logic (start date must be before end date)
    if (date_start && date_end) {
      const startDate = new Date(date_start);
      const endDate = new Date(date_end);

      if (startDate >= endDate) {
        result.errors.push({
          field: 'date_end',
          code: 'INVALID_DATE_RANGE',
          message: 'End date must be after start date',
          severity: 'critical'
        });
      }
    }

    // Validate dates are not in the future (with reasonable buffer)
    const now = new Date();
    const futureBuffer = new Date();
    futureBuffer.setMonth(futureBuffer.getMonth() + 6); // Allow 6 months in future

    if (date_start && new Date(date_start) > futureBuffer) {
      result.errors.push({
        field: 'date_start',
        code: 'FUTURE_DATE',
        message: 'Start date cannot be more than 6 months in the future',
        severity: 'critical'
      });
    }
  }

  /**
   * Validate data types (hard validation)
   */
  _validateDataTypes(jobData, result) {
    const validations = [
      {
        field: 'title',
        type: 'string',
        maxLength: 200,
        message: 'Job title must be a string with maximum 200 characters'
      },
      {
        field: 'org',
        type: 'string',
        maxLength: 150,
        message: 'Organization must be a string with maximum 150 characters'
      },
      {
        field: 'description',
        type: 'string',
        maxLength: 5000,
        message: 'Description must be a string with maximum 5000 characters'
      },
      {
        field: 'skills',
        type: 'array',
        message: 'Skills must be an array of strings'
      },
      {
        field: 'location',
        type: 'string',
        maxLength: 100,
        message: 'Location must be a string with maximum 100 characters'
      }
    ];

    validations.forEach(({ field, type, maxLength, message }) => {
      const value = jobData[field];

      if (value !== undefined && value !== null) {
        if (type === 'string' && typeof value !== 'string') {
          result.errors.push({
            field,
            code: 'INVALID_TYPE',
            message,
            severity: 'critical'
          });
        } else if (type === 'array' && !Array.isArray(value)) {
          result.errors.push({
            field,
            code: 'INVALID_TYPE',
            message,
            severity: 'critical'
          });
        } else if (type === 'string' && maxLength && value.length > maxLength) {
          result.errors.push({
            field,
            code: 'MAX_LENGTH_EXCEEDED',
            message,
            severity: 'critical'
          });
        }
      }
    });

    // Validate skills array contents
    if (jobData.skills && Array.isArray(jobData.skills)) {
      jobData.skills.forEach((skill, index) => {
        if (typeof skill !== 'string') {
          result.errors.push({
            field: `skills[${index}]`,
            code: 'INVALID_SKILL_TYPE',
            message: 'Each skill must be a string',
            severity: 'critical'
          });
        } else if (skill.length > 50) {
          result.errors.push({
            field: `skills[${index}]`,
            code: 'SKILL_TOO_LONG',
            message: 'Each skill must be 50 characters or less',
            severity: 'critical'
          });
        }
      });
    }
  }

  /**
   * Validate business rules (hard validation)
   */
  _validateBusinessRules(jobData, result) {
    // Validate minimum employment duration (if ended)
    if (jobData.date_start && jobData.date_end) {
      const startDate = new Date(jobData.date_start);
      const endDate = new Date(jobData.date_end);
      const durationDays = (endDate - startDate) / (1000 * 60 * 60 * 24);

      if (durationDays < 1) {
        result.errors.push({
          field: 'date_end',
          code: 'INVALID_DURATION',
          message: 'Employment duration must be at least 1 day',
          severity: 'critical'
        });
      }
    }

    // Validate historical dates (not too far in the past)
    if (jobData.date_start) {
      const startDate = new Date(jobData.date_start);
      const now = new Date();
      const yearsDiff = (now - startDate) / (1000 * 60 * 60 * 24 * 365);

      if (yearsDiff > 60) {
        result.errors.push({
          field: 'date_start',
          code: 'HISTORICAL_DATE',
          message: 'Start date cannot be more than 60 years in the past',
          severity: 'critical'
        });
      }
    }
  }

  /**
   * Validate timeline consistency (soft validation)
   */
  _validateTimeline(jobData, existingJobs, result) {
    if (!jobData.date_start) return;

    const currentJob = {
      ...jobData,
      date_start: new Date(jobData.date_start),
      date_end: jobData.date_end ? new Date(jobData.date_end) : null
    };

    // Filter out the current job if it's an update
    const otherJobs = existingJobs
      .filter(job => job.id !== jobData.id)
      .map(job => ({
        ...job,
        date_start: new Date(job.date_start),
        date_end: job.date_end ? new Date(job.date_end) : null
      }));

    // Check for overlapping employment
    const overlaps = otherJobs.filter(job => this._datesOverlap(currentJob, job));
    if (overlaps.length > 0) {
      result.warnings.push({
        field: 'timeline',
        code: 'DATE_OVERLAP',
        message: `Employment dates overlap with ${overlaps.length} other position(s): ${overlaps.map(j => j.title).join(', ')}`,
        severity: 'warning',
        details: overlaps.map(j => ({ id: j.id, title: j.title, org: j.org }))
      });
    }

    // Check for gaps in employment
    const sortedJobs = [...otherJobs, currentJob].sort((a, b) => a.date_start - b.date_start);
    const gaps = this._findEmploymentGaps(sortedJobs);
    if (gaps.length > 0) {
      result.warnings.push({
        field: 'timeline',
        code: 'EMPLOYMENT_GAP',
        message: `${gaps.length} employment gap(s) detected in timeline`,
        severity: 'info',
        details: gaps
      });
    }
  }

  /**
   * Validate business logic (soft validation)
   */
  _validateBusinessLogic(jobData, result) {
    // Check for very short employment duration
    if (jobData.date_start && jobData.date_end) {
      const startDate = new Date(jobData.date_start);
      const endDate = new Date(jobData.date_end);
      const durationMonths = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30);

      if (durationMonths < 1) {
        result.warnings.push({
          field: 'duration',
          code: 'SHORT_DURATION',
          message: 'Employment duration is less than 1 month',
          severity: 'warning'
        });
      }
    }

    // Check for very long employment duration
    if (jobData.date_start) {
      const startDate = new Date(jobData.date_start);
      const endDate = jobData.date_end ? new Date(jobData.date_end) : new Date();
      const durationYears = (endDate - startDate) / (1000 * 60 * 60 * 24 * 365);

      if (durationYears > 20) {
        result.warnings.push({
          field: 'duration',
          code: 'LONG_DURATION',
          message: 'Employment duration is more than 20 years',
          severity: 'info'
        });
      }
    }

    // Check for excessive number of skills
    if (jobData.skills && jobData.skills.length > 20) {
      result.warnings.push({
        field: 'skills',
        code: 'MANY_SKILLS',
        message: `${jobData.skills.length} skills listed - consider consolidating related skills`,
        severity: 'info'
      });
    }

    // Check for very few skills for long-term positions
    if (jobData.skills && jobData.date_start && jobData.date_end) {
      const startDate = new Date(jobData.date_start);
      const endDate = new Date(jobData.date_end);
      const durationMonths = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30);

      if (durationMonths > 12 && jobData.skills.length < 3) {
        result.warnings.push({
          field: 'skills',
          code: 'FEW_SKILLS',
          message: 'Consider adding more skills for positions longer than 1 year',
          severity: 'info'
        });
      }
    }
  }

  /**
   * Validate data quality (soft validation)
   */
  _validateDataQuality(jobData, result) {
    // Check for missing description
    if (!jobData.description || jobData.description.trim().length < 50) {
      result.warnings.push({
        field: 'description',
        code: 'SHORT_DESCRIPTION',
        message: 'Consider adding a more detailed job description (at least 50 characters)',
        severity: 'info'
      });
    }

    // Check for missing location
    if (!jobData.location || jobData.location.trim() === '') {
      result.warnings.push({
        field: 'location',
        code: 'MISSING_LOCATION',
        message: 'Consider adding a location for this position',
        severity: 'info'
      });
    }

    // Check for all caps text
    if (jobData.title && jobData.title === jobData.title.toUpperCase()) {
      result.warnings.push({
        field: 'title',
        code: 'ALL_CAPS',
        message: 'Consider using proper case for job title',
        severity: 'info'
      });
    }

    if (jobData.org && jobData.org === jobData.org.toUpperCase()) {
      result.warnings.push({
        field: 'org',
        code: 'ALL_CAPS',
        message: 'Consider using proper case for organization name',
        severity: 'info'
      });
    }

    // Check for duplicate skills
    if (jobData.skills && Array.isArray(jobData.skills)) {
      const lowercaseSkills = jobData.skills.map(skill => skill.toLowerCase());
      const uniqueSkills = [...new Set(lowercaseSkills)];
      
      if (lowercaseSkills.length !== uniqueSkills.length) {
        result.warnings.push({
          field: 'skills',
          code: 'DUPLICATE_SKILLS',
          message: 'Duplicate skills detected (case-insensitive)',
          severity: 'info'
        });
      }
    }
  }

  /**
   * Helper method to validate date format
   */
  _isValidDate(dateString) {
    if (typeof dateString !== 'string') return false;
    
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(dateString)) return false;
    
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date) && date.toISOString().substr(0, 10) === dateString;
  }

  /**
   * Helper method to check if two employment periods overlap
   */
  _datesOverlap(job1, job2) {
    const start1 = job1.date_start;
    const end1 = job1.date_end || new Date(); // Current position if no end date
    const start2 = job2.date_start;
    const end2 = job2.date_end || new Date();

    return start1 < end2 && start2 < end1;
  }

  /**
   * Helper method to find gaps in employment timeline
   */
  _findEmploymentGaps(sortedJobs) {
    const gaps = [];
    
    for (let i = 0; i < sortedJobs.length - 1; i++) {
      const currentJob = sortedJobs[i];
      const nextJob = sortedJobs[i + 1];
      
      if (currentJob.date_end) {
        const gapStart = new Date(currentJob.date_end);
        const gapEnd = new Date(nextJob.date_start);
        const gapDays = (gapEnd - gapStart) / (1000 * 60 * 60 * 24);
        
        // Only report gaps longer than 30 days
        if (gapDays > 30) {
          gaps.push({
            start: gapStart.toISOString().substr(0, 10),
            end: gapEnd.toISOString().substr(0, 10),
            durationDays: Math.floor(gapDays),
            beforeJob: currentJob.title,
            afterJob: nextJob.title
          });
        }
      }
    }
    
    return gaps;
  }

  /**
   * Validate bulk data operations
   */
  validateBulkOperation(jobs) {
    const results = {
      validJobs: [],
      invalidJobs: [],
      warnings: [],
      summary: {
        total: jobs.length,
        valid: 0,
        invalid: 0,
        warnings: 0
      }
    };

    jobs.forEach((job, index) => {
      const validation = this.validateJobData(job, jobs);
      
      if (validation.isValid) {
        results.validJobs.push({ index, job: validation.processedData });
        results.summary.valid++;
      } else {
        results.invalidJobs.push({ 
          index, 
          job, 
          errors: validation.errors 
        });
        results.summary.invalid++;
      }

      if (validation.warnings.length > 0) {
        results.warnings.push({
          index,
          jobTitle: job.title,
          warnings: validation.warnings
        });
        results.summary.warnings++;
      }
    });

    return results;
  }
}

export default DataValidationService;