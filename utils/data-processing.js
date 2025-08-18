/**
 * Data Processing Utilities
 * Handles skills normalization, deduplication, and data transformation
 */

import winston from 'winston';
import CompanyGroupingService from './company-grouping.js';

export class DataProcessingService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/data-processing.log' })
      ]
    });

    // Skill normalization mappings
    this.skillMappings = new Map([
      // Programming Languages
      ['javascript', 'JavaScript'],
      ['js', 'JavaScript'],
      ['node.js', 'Node.js'],
      ['nodejs', 'Node.js'],
      ['python', 'Python'],
      ['java', 'Java'],
      ['c++', 'C++'],
      ['c#', 'C#'],
      ['typescript', 'TypeScript'],
      ['ts', 'TypeScript'],
      ['react', 'React'],
      ['reactjs', 'React'],
      ['vue', 'Vue.js'],
      ['vuejs', 'Vue.js'],
      ['angular', 'Angular'],
      ['angularjs', 'Angular'],

      // Databases
      ['mysql', 'MySQL'],
      ['postgresql', 'PostgreSQL'],
      ['postgres', 'PostgreSQL'],
      ['mongodb', 'MongoDB'],
      ['mongo', 'MongoDB'],
      ['redis', 'Redis'],
      ['sql', 'SQL'],
      ['sqlite', 'SQLite'],

      // Cloud & DevOps
      ['aws', 'AWS'],
      ['amazon web services', 'AWS'],
      ['azure', 'Microsoft Azure'],
      ['gcp', 'Google Cloud Platform'],
      ['google cloud', 'Google Cloud Platform'],
      ['docker', 'Docker'],
      ['kubernetes', 'Kubernetes'],
      ['k8s', 'Kubernetes'],
      ['terraform', 'Terraform'],
      ['jenkins', 'Jenkins'],
      ['ci/cd', 'CI/CD'],
      ['devops', 'DevOps'],

      // AI/ML
      ['artificial intelligence', 'AI/ML'],
      ['machine learning', 'AI/ML'],
      ['ai', 'AI/ML'],
      ['ml', 'AI/ML'],
      ['tensorflow', 'TensorFlow'],
      ['pytorch', 'PyTorch'],
      ['scikit-learn', 'Scikit-learn'],
      ['deep learning', 'Deep Learning'],
      ['neural networks', 'Neural Networks'],
      ['nlp', 'Natural Language Processing'],
      ['computer vision', 'Computer Vision'],

      // Project Management
      ['project management', 'Project Management'],
      ['pm', 'Project Management'],
      ['agile', 'Agile'],
      ['scrum', 'Scrum'],
      ['kanban', 'Kanban'],
      ['lean', 'Lean'],
      ['six sigma', 'Six Sigma'],
      ['pmp', 'PMP'],

      // Leadership
      ['leadership', 'Leadership'],
      ['team lead', 'Team Leadership'],
      ['team leadership', 'Team Leadership'],
      ['management', 'Management'],
      ['people management', 'People Management'],
      ['mentoring', 'Mentoring'],
      ['coaching', 'Coaching'],

      // Other Technologies
      ['iot', 'IoT'],
      ['internet of things', 'IoT'],
      ['blockchain', 'Blockchain'],
      ['api', 'API Development'],
      ['rest api', 'REST API'],
      ['graphql', 'GraphQL'],
      ['microservices', 'Microservices'],
      ['git', 'Git'],
      ['github', 'GitHub'],
      ['gitlab', 'GitLab'],
      ['jira', 'JIRA'],
      ['confluence', 'Confluence']
    ]);

    // Skill categories for better organization
    this.skillCategories = new Map([
      ['JavaScript', 'Programming Languages'],
      ['Python', 'Programming Languages'],
      ['Java', 'Programming Languages'],
      ['TypeScript', 'Programming Languages'],
      ['C++', 'Programming Languages'],
      ['C#', 'Programming Languages'],
      ['React', 'Frontend Frameworks'],
      ['Vue.js', 'Frontend Frameworks'],
      ['Angular', 'Frontend Frameworks'],
      ['Node.js', 'Backend Technologies'],
      ['MySQL', 'Databases'],
      ['PostgreSQL', 'Databases'],
      ['MongoDB', 'Databases'],
      ['Redis', 'Databases'],
      ['AWS', 'Cloud Platforms'],
      ['Microsoft Azure', 'Cloud Platforms'],
      ['Google Cloud Platform', 'Cloud Platforms'],
      ['Docker', 'DevOps Tools'],
      ['Kubernetes', 'DevOps Tools'],
      ['Terraform', 'DevOps Tools'],
      ['Jenkins', 'DevOps Tools'],
      ['AI/ML', 'Artificial Intelligence'],
      ['TensorFlow', 'AI/ML Frameworks'],
      ['PyTorch', 'AI/ML Frameworks'],
      ['Deep Learning', 'Artificial Intelligence'],
      ['Natural Language Processing', 'Artificial Intelligence'],
      ['Computer Vision', 'Artificial Intelligence'],
      ['Project Management', 'Management Skills'],
      ['Leadership', 'Management Skills'],
      ['Team Leadership', 'Management Skills'],
      ['Agile', 'Methodologies'],
      ['Scrum', 'Methodologies'],
      ['IoT', 'Emerging Technologies'],
      ['Blockchain', 'Emerging Technologies']
    ]);

    // Initialize company grouping service for analytics
    this.companyGroupingService = new CompanyGroupingService();

    // Company size indicators based on common knowledge
    this.companySizeIndicators = new Map([
      // Large corporations (>10,000 employees)
      ['microsoft', 'Large'],
      ['google', 'Large'],
      ['alphabet', 'Large'],
      ['amazon', 'Large'],
      ['apple', 'Large'],
      ['facebook', 'Large'],
      ['meta', 'Large'],
      ['ibm', 'Large'],
      ['oracle', 'Large'],
      ['salesforce', 'Large'],
      ['intel', 'Large'],
      ['cisco', 'Large'],
      ['adobe', 'Large'],
      ['netflix', 'Large'],
      ['uber', 'Large'],
      ['airbnb', 'Large'],
      ['tesla', 'Large'],
      ['jpmorgan', 'Large'],
      ['goldman sachs', 'Large'],
      ['mckinsey', 'Large'],
      ['deloitte', 'Large'],
      ['accenture', 'Large'],
      ['pwc', 'Large'],
      ['ernst & young', 'Large'],
      ['kpmg', 'Large'],
      
      // Medium corporations (1,000-10,000 employees)
      ['stripe', 'Medium'],
      ['slack', 'Medium'],
      ['zoom', 'Medium'],
      ['dropbox', 'Medium'],
      ['square', 'Medium'],
      ['reddit', 'Medium'],
      ['pinterest', 'Medium'],
      ['snapchat', 'Medium'],
      ['doordash', 'Medium'],
      ['instacart', 'Medium'],
      
      // General indicators
      ['startup', 'Startup'],
      ['inc', 'Small-Medium'], // Default for Inc companies
      ['corp', 'Medium-Large'], // Default for Corp companies
      ['corporation', 'Medium-Large'],
      ['llc', 'Small-Medium'],
      ['ltd', 'Small-Medium']
    ]);

    // Industry indicators
    this.industryIndicators = new Map([
      ['tech', 'Technology'],
      ['software', 'Technology'],
      ['consulting', 'Consulting'],
      ['financial', 'Finance'],
      ['bank', 'Finance'],
      ['healthcare', 'Healthcare'],
      ['pharmaceutical', 'Healthcare'],
      ['retail', 'Retail'],
      ['manufacturing', 'Manufacturing'],
      ['automotive', 'Automotive'],
      ['aerospace', 'Aerospace'],
      ['defense', 'Defense'],
      ['education', 'Education'],
      ['government', 'Government'],
      ['non-profit', 'Non-Profit'],
      ['startup', 'Technology'] // Default startups to tech
    ]);
  }

  /**
   * Process and normalize job data
   * @param {Object} jobData - Raw job data
   * @returns {Object} Processed job data
   */
  processJobData(jobData) {
    const processed = { ...jobData };
    
    try {
      // Normalize skills
      if (processed.skills && Array.isArray(processed.skills)) {
        processed.skills = this.normalizeSkills(processed.skills);
      }

      // Clean and format text fields
      processed.title = this.cleanText(processed.title);
      processed.org = this.cleanText(processed.org);
      processed.location = this.cleanText(processed.location);
      
      if (processed.description) {
        processed.description = this.cleanDescription(processed.description);
      }

      // Normalize dates
      processed.date_start = this.normalizeDate(processed.date_start);
      if (processed.date_end) {
        processed.date_end = this.normalizeDate(processed.date_end);
      }

      // Generate derived fields
      processed.duration_months = this.calculateDuration(processed.date_start, processed.date_end);
      processed.skill_categories = this.categorizeSkills(processed.skills);
      processed.processed_at = new Date().toISOString();

      this.logger.info('Job data processed successfully', {
        jobId: processed.id,
        skillsCount: processed.skills?.length,
        durationMonths: processed.duration_months
      });

    } catch (error) {
      this.logger.error('Error processing job data', {
        error: error.message,
        jobData: jobData
      });
      throw new Error(`Data processing failed: ${error.message}`);
    }

    return processed;
  }

  /**
   * Normalize skills array
   * @param {Array} skills - Array of skill strings
   * @returns {Array} Normalized and deduplicated skills
   */
  normalizeSkills(skills) {
    if (!Array.isArray(skills)) return [];

    const normalized = skills
      .map(skill => this.normalizeSkill(skill))
      .filter(skill => skill && skill.length > 0)
      .filter((skill, index, array) => array.indexOf(skill) === index); // Deduplicate

    return normalized.sort(); // Sort alphabetically
  }

  /**
   * Normalize individual skill
   * @param {string} skill - Skill string
   * @returns {string} Normalized skill
   */
  normalizeSkill(skill) {
    if (typeof skill !== 'string') return '';

    // Clean the skill
    let normalized = skill.toLowerCase().trim();
    
    // Remove special characters and extra spaces
    normalized = normalized.replace(/[^\w\s\-\+\#\.\/]/g, ' ');
    normalized = normalized.replace(/\s+/g, ' ').trim();

    // Apply skill mappings
    if (this.skillMappings.has(normalized)) {
      return this.skillMappings.get(normalized);
    }

    // If no mapping found, return title case
    return this.toTitleCase(skill.trim());
  }

  /**
   * Clean text fields
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (typeof text !== 'string') return '';

    return text
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n+/g, ' ') // Replace newlines with spaces
      .replace(/[^\w\s\-\.\,\(\)&]/g, ''); // Remove special characters except basic punctuation
  }

  /**
   * Clean description text
   * @param {string} description - Description to clean
   * @returns {string} Cleaned description
   */
  cleanDescription(description) {
    if (typeof description !== 'string') return '';

    return description
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\n\s*\n/g, '\n\n') // Normalize paragraph breaks
      .replace(/[^\w\s\-\.\,\(\)&\n\:\;\!\?]/g, ''); // Keep more punctuation for descriptions
  }

  /**
   * Normalize date format
   * @param {string} date - Date string
   * @returns {string} Normalized date in YYYY-MM-DD format
   */
  normalizeDate(date) {
    if (!date) return null;

    try {
      const dateObj = new Date(date);
      if (isNaN(dateObj.getTime())) return null;
      
      return dateObj.toISOString().substr(0, 10);
    } catch (error) {
      this.logger.warn('Invalid date format', { date });
      return null;
    }
  }

  /**
   * Calculate employment duration in months
   * @param {string} startDate - Start date
   * @param {string} endDate - End date (null for current)
   * @returns {number} Duration in months
   */
  calculateDuration(startDate, endDate = null) {
    if (!startDate) return 0;

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0;

    const months = (end.getFullYear() - start.getFullYear()) * 12 + 
                   (end.getMonth() - start.getMonth());

    return Math.max(0, months);
  }

  /**
   * Categorize skills
   * @param {Array} skills - Normalized skills array
   * @returns {Object} Skills grouped by category
   */
  categorizeSkills(skills) {
    if (!Array.isArray(skills)) return {};

    const categories = {};

    skills.forEach(skill => {
      const category = this.skillCategories.get(skill) || 'Other';
      
      if (!categories[category]) {
        categories[category] = [];
      }
      
      categories[category].push(skill);
    });

    // Sort skills within each category
    Object.keys(categories).forEach(category => {
      categories[category].sort();
    });

    return categories;
  }

  /**
   * Find potential duplicate entries
   * @param {Array} jobs - Array of job entries
   * @returns {Array} Potential duplicates
   */
  findDuplicates(jobs) {
    const duplicates = [];
    const seen = new Map();

    jobs.forEach((job, index) => {
      // Create a signature for duplicate detection
      const signature = this.createJobSignature(job);
      
      if (seen.has(signature)) {
        const originalIndex = seen.get(signature);
        duplicates.push({
          type: 'potential_duplicate',
          jobs: [
            { index: originalIndex, job: jobs[originalIndex] },
            { index, job }
          ],
          similarity: this.calculateJobSimilarity(jobs[originalIndex], job),
          signature
        });
      } else {
        seen.set(signature, index);
      }
    });

    // Also check for partial matches (similar but not identical)
    const partialDuplicates = this.findPartialDuplicates(jobs);
    duplicates.push(...partialDuplicates);

    return duplicates;
  }

  /**
   * Create job signature for duplicate detection
   * @param {Object} job - Job data
   * @returns {string} Job signature
   */
  createJobSignature(job) {
    const normalizedTitle = this.cleanText(job.title || '').toLowerCase();
    const normalizedOrg = this.cleanText(job.org || '').toLowerCase();
    const startDate = job.date_start || '';
    
    return `${normalizedTitle}|${normalizedOrg}|${startDate}`;
  }

  /**
   * Find partial duplicates (similar jobs)
   * @param {Array} jobs - Array of job entries
   * @returns {Array} Partial duplicates
   */
  findPartialDuplicates(jobs) {
    const partialDuplicates = [];

    for (let i = 0; i < jobs.length; i++) {
      for (let j = i + 1; j < jobs.length; j++) {
        const similarity = this.calculateJobSimilarity(jobs[i], jobs[j]);
        
        if (similarity > 0.7) { // 70% similarity threshold
          partialDuplicates.push({
            type: 'similar_entry',
            jobs: [
              { index: i, job: jobs[i] },
              { index: j, job: jobs[j] }
            ],
            similarity,
            reasons: this.getSimilarityReasons(jobs[i], jobs[j])
          });
        }
      }
    }

    return partialDuplicates;
  }

  /**
   * Calculate similarity between two jobs
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {number} Similarity score (0-1)
   */
  calculateJobSimilarity(job1, job2) {
    let score = 0;
    let factors = 0;

    // Title similarity
    const titleSim = this.stringSimilarity(job1.title || '', job2.title || '');
    score += titleSim * 0.4;
    factors += 0.4;

    // Organization similarity
    const orgSim = this.stringSimilarity(job1.org || '', job2.org || '');
    score += orgSim * 0.3;
    factors += 0.3;

    // Date overlap
    const dateOverlap = this.calculateDateOverlap(job1, job2);
    score += dateOverlap * 0.2;
    factors += 0.2;

    // Skills similarity
    const skillsSim = this.calculateSkillsSimilarity(job1.skills || [], job2.skills || []);
    score += skillsSim * 0.1;
    factors += 0.1;

    return factors > 0 ? score / factors : 0;
  }

  /**
   * Get reasons for similarity between jobs
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {Array} Similarity reasons
   */
  getSimilarityReasons(job1, job2) {
    const reasons = [];

    if (this.stringSimilarity(job1.title || '', job2.title || '') > 0.8) {
      reasons.push('Very similar job titles');
    }

    if (this.stringSimilarity(job1.org || '', job2.org || '') > 0.9) {
      reasons.push('Same organization');
    }

    if (this.calculateDateOverlap(job1, job2) > 0.5) {
      reasons.push('Overlapping employment dates');
    }

    const skillsSim = this.calculateSkillsSimilarity(job1.skills || [], job2.skills || []);
    if (skillsSim > 0.6) {
      reasons.push('Similar skill sets');
    }

    return reasons;
  }

  /**
   * Calculate string similarity using Jaccard index
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} Similarity score (0-1)
   */
  stringSimilarity(str1, str2) {
    const clean1 = this.cleanText(str1).toLowerCase();
    const clean2 = this.cleanText(str2).toLowerCase();

    if (clean1 === clean2) return 1;
    if (!clean1 || !clean2) return 0;

    const words1 = new Set(clean1.split(/\s+/));
    const words2 = new Set(clean2.split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate date overlap between two jobs
   * @param {Object} job1 - First job
   * @param {Object} job2 - Second job
   * @returns {number} Overlap score (0-1)
   */
  calculateDateOverlap(job1, job2) {
    if (!job1.date_start || !job2.date_start) return 0;

    const start1 = new Date(job1.date_start);
    const end1 = job1.date_end ? new Date(job1.date_end) : new Date();
    const start2 = new Date(job2.date_start);
    const end2 = job2.date_end ? new Date(job2.date_end) : new Date();

    const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
    const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));

    if (overlapStart >= overlapEnd) return 0; // No overlap

    const overlapDuration = overlapEnd.getTime() - overlapStart.getTime();
    const totalDuration = Math.max(
      end1.getTime() - start1.getTime(),
      end2.getTime() - start2.getTime()
    );

    return totalDuration > 0 ? overlapDuration / totalDuration : 0;
  }

  /**
   * Calculate skills similarity
   * @param {Array} skills1 - First skills array
   * @param {Array} skills2 - Second skills array
   * @returns {number} Similarity score (0-1)
   */
  calculateSkillsSimilarity(skills1, skills2) {
    if (!Array.isArray(skills1) || !Array.isArray(skills2)) return 0;
    if (skills1.length === 0 && skills2.length === 0) return 1;
    if (skills1.length === 0 || skills2.length === 0) return 0;

    const normalized1 = new Set(skills1.map(skill => skill.toLowerCase()));
    const normalized2 = new Set(skills2.map(skill => skill.toLowerCase()));

    const intersection = new Set([...normalized1].filter(skill => normalized2.has(skill)));
    const union = new Set([...normalized1, ...normalized2]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Convert string to title case
   * @param {string} str - String to convert
   * @returns {string} Title case string
   */
  toTitleCase(str) {
    return str.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  /**
   * Generate comprehensive analytics for job data including company-level insights
   * @param {Array} jobs - Array of job data
   * @returns {Object} Analytics summary with company analysis
   */
  generateAnalytics(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return {
        totalJobs: 0,
        totalDuration: 0,
        averageDuration: 0,
        skillFrequency: {},
        organizationHistory: {},
        skillCategories: {},
        duplicateCount: 0,
        companies: {
          totalCompanies: 0,
          multiRoleCompanies: 0,
          longestTenure: null,
          shortestTenure: null,
          careerProgressions: [],
          boomerangCompanies: [],
          averageTenurePerCompany: 0,
          companySizeProgression: [],
          industryDiversity: {
            totalIndustries: 0,
            industries: [],
            transitions: []
          }
        }
      };
    }

    // Basic analytics (existing functionality)
    const analytics = {
      totalJobs: jobs.length,
      totalDuration: 0,
      averageDuration: 0,
      skillFrequency: {},
      organizationHistory: {},
      skillCategories: {},
      duplicateCount: 0
    };

    // Calculate durations and collect skills
    jobs.forEach(job => {
      const duration = this.calculateDuration(job.date_start, job.date_end);
      analytics.totalDuration += duration;

      // Count skills
      if (job.skills && Array.isArray(job.skills)) {
        job.skills.forEach(skill => {
          analytics.skillFrequency[skill] = (analytics.skillFrequency[skill] || 0) + 1;
        });
      }

      // Count organizations
      if (job.org) {
        analytics.organizationHistory[job.org] = (analytics.organizationHistory[job.org] || 0) + 1;
      }
    });

    analytics.averageDuration = jobs.length > 0 ? analytics.totalDuration / jobs.length : 0;

    // Find duplicates
    const duplicates = this.findDuplicates(jobs);
    analytics.duplicateCount = duplicates.length;

    // Categorize skills
    const allSkills = Object.keys(analytics.skillFrequency);
    analytics.skillCategories = this.categorizeSkills(allSkills);

    // ========================================================================
    // ENHANCED COMPANY-LEVEL ANALYTICS
    // ========================================================================

    // Get company groupings for detailed analysis
    const companyGroups = this.companyGroupingService.groupJobsByCompany(jobs);

    // Company tenure analysis
    const tenureAnalysis = this.analyzeCompanyTenures(companyGroups);
    
    // Career progression patterns
    const progressionAnalysis = this.analyzeCareerProgressions(companyGroups);
    
    // Multi-role company identification
    const multiRoleAnalysis = this.analyzeMultiRoleCompanies(companyGroups);
    
    // Industry diversity metrics
    const industryAnalysis = this.analyzeIndustryDiversity(jobs, companyGroups);
    
    // Company size progression analysis
    const sizeProgressionAnalysis = this.analyzeCompanySizeProgression(companyGroups, jobs);

    // Boomerang company analysis
    const boomerangAnalysis = this.analyzeBoomerangCompanies(companyGroups);

    // Combine all company analytics
    analytics.companies = {
      totalCompanies: companyGroups.length,
      multiRoleCompanies: multiRoleAnalysis.count,
      longestTenure: tenureAnalysis.longest,
      shortestTenure: tenureAnalysis.shortest,
      averageTenurePerCompany: tenureAnalysis.average,
      tenureDistribution: tenureAnalysis.distribution,
      
      careerProgressions: progressionAnalysis.patterns,
      promotionSummary: progressionAnalysis.summary,
      
      boomerangCompanies: boomerangAnalysis.companies,
      boomerangSummary: boomerangAnalysis.summary,
      
      multiRoleCompanyDetails: multiRoleAnalysis.details,
      
      companySizeProgression: sizeProgressionAnalysis.progression,
      sizeDistribution: sizeProgressionAnalysis.distribution,
      
      industryDiversity: {
        totalIndustries: industryAnalysis.totalIndustries,
        industries: industryAnalysis.industries,
        transitions: industryAnalysis.transitions,
        diversityScore: industryAnalysis.diversityScore
      },
      
      // Company loyalty metrics
      loyaltyMetrics: {
        averageCompaniesPerYear: this.calculateAverageCompaniesPerYear(jobs),
        longestGapBetweenCompanies: this.calculateLongestCompanyGap(companyGroups),
        companyRetentionScore: this.calculateCompanyRetentionScore(companyGroups),
        careerStabilityIndex: this.calculateCareerStabilityIndex(companyGroups, jobs)
      }
    };

    return analytics;
  }

  /**
   * Analyze company tenure patterns
   */
  analyzeCompanyTenures(companyGroups) {
    if (companyGroups.length === 0) {
      return {
        longest: null,
        shortest: null,
        average: 0,
        distribution: {}
      };
    }

    const tenures = companyGroups.map(company => ({
      company: company.originalNames[0],
      normalizedName: company.normalizedName,
      months: company.tenure.months,
      formatted: company.tenure.formatted,
      positions: company.totalPositions
    }));

    tenures.sort((a, b) => b.months - a.months);

    const totalTenureMonths = tenures.reduce((sum, t) => sum + t.months, 0);
    const averageTenure = totalTenureMonths / tenures.length;

    // Tenure distribution analysis
    const distribution = {
      shortTerm: tenures.filter(t => t.months < 12).length, // < 1 year
      mediumTerm: tenures.filter(t => t.months >= 12 && t.months < 36).length, // 1-3 years
      longTerm: tenures.filter(t => t.months >= 36).length // 3+ years
    };

    return {
      longest: tenures[0],
      shortest: tenures[tenures.length - 1],
      average: Math.round(averageTenure),
      averageFormatted: this.formatDurationFromMonths(averageTenure),
      distribution
    };
  }

  /**
   * Analyze career progression patterns within companies
   */
  analyzeCareerProgressions(companyGroups) {
    const patterns = [];
    const summary = {
      companiesWithPromotions: 0,
      totalPromotions: 0,
      companiesWithLateralMoves: 0,
      totalLateralMoves: 0,
      strongProgressionCompanies: 0
    };

    companyGroups.forEach(company => {
      if (company.totalPositions > 1) {
        const progression = company.careerProgression;
        
        const pattern = {
          company: company.originalNames[0],
          normalizedName: company.normalizedName,
          pattern: progression.pattern,
          progressionScore: progression.progressionScore,
          positions: company.positions.map(pos => pos.title),
          promotions: progression.promotions.map(promo => ({
            from: promo.from.title,
            to: promo.to.title,
            date: promo.to.date
          })),
          promotionCount: progression.promotions.length,
          lateralMoves: progression.lateralMoves.length,
          totalRoleChanges: progression.totalRoleChanges,
          timeline: this.generateProgressionTimeline(company.positions)
        };

        patterns.push(pattern);

        // Update summary
        if (progression.promotions.length > 0) {
          summary.companiesWithPromotions++;
          summary.totalPromotions += progression.promotions.length;
        }
        
        if (progression.lateralMoves.length > 0) {
          summary.companiesWithLateralMoves++;
          summary.totalLateralMoves += progression.lateralMoves.length;
        }

        if (progression.pattern === 'strong_upward') {
          summary.strongProgressionCompanies++;
        }
      }
    });

    return { patterns, summary };
  }

  /**
   * Analyze multi-role companies
   */
  analyzeMultiRoleCompanies(companyGroups) {
    const multiRoleCompanies = companyGroups.filter(company => company.totalPositions > 1);
    
    const details = multiRoleCompanies.map(company => ({
      company: company.originalNames[0],
      normalizedName: company.normalizedName,
      positionCount: company.totalPositions,
      positions: company.positions.map(pos => ({
        title: pos.title,
        startDate: pos.date_start,
        endDate: pos.date_end,
        duration: pos.duration || this.calculateDuration(pos.date_start, pos.date_end)
      })),
      totalTenure: company.tenure.formatted,
      careerPattern: company.careerProgression.pattern,
      isBoomerang: company.boomerangPattern.isBoomerang,
      skillEvolution: company.aggregatedSkills.skillEvolution?.length || 0
    }));

    return {
      count: multiRoleCompanies.length,
      details
    };
  }

  /**
   * Analyze industry diversity
   */
  analyzeIndustryDiversity(jobs, companyGroups) {
    // Extract industries from job titles, company names, and skills
    const industries = new Set();
    const industryByCompany = new Map();
    const transitions = [];

    // Analyze each job for industry indicators
    jobs.forEach((job, index) => {
      const inferredIndustries = this.inferIndustries(job);
      inferredIndustries.forEach(industry => industries.add(industry));
      
      const companyName = this.companyGroupingService.normalizeCompanyName(job.org || '');
      if (!industryByCompany.has(companyName)) {
        industryByCompany.set(companyName, new Set());
      }
      inferredIndustries.forEach(industry => {
        industryByCompany.get(companyName).add(industry);
      });

      // Check for industry transitions
      if (index > 0) {
        const previousJob = jobs[index - 1];
        const previousIndustries = this.inferIndustries(previousJob);
        const currentIndustries = inferredIndustries;

        const isTransition = !previousIndustries.some(industry => 
          currentIndustries.includes(industry)
        );

        if (isTransition && previousIndustries.length > 0 && currentIndustries.length > 0) {
          transitions.push({
            from: {
              job: previousJob.title,
              company: previousJob.org,
              industries: previousIndustries,
              date: previousJob.date_end || previousJob.date_start
            },
            to: {
              job: job.title,
              company: job.org,
              industries: currentIndustries,
              date: job.date_start
            },
            transitionType: this.categorizeIndustryTransition(previousIndustries, currentIndustries)
          });
        }
      }
    });

    // Calculate diversity score (0-1 based on industry spread and transitions)
    const diversityScore = this.calculateIndustryDiversityScore(industries, transitions, jobs);

    return {
      totalIndustries: industries.size,
      industries: Array.from(industries),
      transitions,
      diversityScore,
      industriesByCompany: Object.fromEntries(
        Array.from(industryByCompany.entries()).map(([company, industriesSet]) => 
          [company, Array.from(industriesSet)]
        )
      )
    };
  }

  /**
   * Analyze company size progression
   */
  analyzeCompanySizeProgression(companyGroups, jobs) {
    const sizeProgression = [];
    const sizeDistribution = {
      Startup: 0,
      Small: 0,
      'Small-Medium': 0,
      Medium: 0,
      'Medium-Large': 0,
      Large: 0,
      Unknown: 0
    };

    // Sort companies by earliest start date to see progression over time
    const sortedCompanies = [...companyGroups].sort((a, b) => {
      const aEarliest = Math.min(...a.positions.map(p => new Date(p.date_start || '9999-12-31')));
      const bEarliest = Math.min(...b.positions.map(p => new Date(p.date_start || '9999-12-31')));
      return aEarliest - bEarliest;
    });

    sortedCompanies.forEach((company, index) => {
      const inferredSize = this.inferCompanySize(company.normalizedName, company.originalNames);
      const earliestDate = Math.min(...company.positions.map(p => new Date(p.date_start || '9999-12-31')));
      
      sizeProgression.push({
        company: company.originalNames[0],
        normalizedName: company.normalizedName,
        inferredSize,
        startDate: new Date(earliestDate).toISOString().split('T')[0],
        tenure: company.tenure.formatted,
        positions: company.totalPositions,
        careerStage: this.determineCareerStage(index, sortedCompanies.length, new Date(earliestDate))
      });

      // Update distribution
      sizeDistribution[inferredSize] = (sizeDistribution[inferredSize] || 0) + 1;
    });

    return {
      progression: sizeProgression,
      distribution: sizeDistribution,
      insights: this.generateCompanySizeInsights(sizeProgression)
    };
  }

  /**
   * Analyze boomerang companies (companies returned to)
   */
  analyzeBoomerangCompanies(companyGroups) {
    const boomerangCompanies = companyGroups.filter(company => 
      company.boomerangPattern.isBoomerang
    );

    const companies = boomerangCompanies.map(company => ({
      company: company.originalNames[0],
      normalizedName: company.normalizedName,
      stints: company.boomerangPattern.stints,
      gaps: company.boomerangPattern.gaps.map(gap => ({
        duration: gap.durationFormatted,
        start: gap.start,
        end: gap.end
      })),
      totalGapTime: company.boomerangPattern.totalGapTimeFormatted,
      insights: company.boomerangPattern.insights,
      reasonsForReturn: this.inferReturnReasons(company)
    }));

    const summary = {
      count: boomerangCompanies.length,
      averageStints: boomerangCompanies.length > 0 ? 
        boomerangCompanies.reduce((sum, c) => sum + c.boomerangPattern.stints, 0) / boomerangCompanies.length : 0,
      totalGapTimeAcrossAll: boomerangCompanies.reduce((sum, c) => sum + c.boomerangPattern.totalGapTime, 0),
      longestGap: boomerangCompanies.length > 0 ?
        Math.max(...boomerangCompanies.flatMap(c => c.boomerangPattern.gaps.map(g => g.duration))) : 0
    };

    return { companies, summary };
  }

  // ========================================================================
  // HELPER METHODS FOR COMPANY ANALYTICS
  // ========================================================================

  /**
   * Infer industries from job data
   */
  inferIndustries(job) {
    const industries = [];
    const searchText = [
      job.title || '',
      job.org || '',
      (job.skills || []).join(' '),
      job.description || ''
    ].join(' ').toLowerCase();

    // Check against industry indicators
    for (const [keyword, industry] of this.industryIndicators.entries()) {
      if (searchText.includes(keyword)) {
        industries.push(industry);
      }
    }

    // If no specific industry found, try to infer from company name patterns
    if (industries.length === 0) {
      const companyName = (job.org || '').toLowerCase();
      if (companyName.includes('bank') || companyName.includes('financial')) {
        industries.push('Finance');
      } else if (companyName.includes('health') || companyName.includes('medical')) {
        industries.push('Healthcare');
      } else if (companyName.includes('tech') || companyName.includes('software')) {
        industries.push('Technology');
      } else {
        industries.push('General Business');
      }
    }

    return [...new Set(industries)]; // Remove duplicates
  }

  /**
   * Infer company size from normalized name and original names
   */
  inferCompanySize(normalizedName, originalNames) {
    // Check known companies first
    if (this.companySizeIndicators.has(normalizedName)) {
      return this.companySizeIndicators.get(normalizedName);
    }

    // Check original names for size indicators
    for (const name of originalNames) {
      const lowerName = name.toLowerCase();
      
      // Check for explicit size indicators
      for (const [indicator, size] of this.companySizeIndicators.entries()) {
        if (lowerName.includes(indicator)) {
          return size;
        }
      }
    }

    // Default inference based on name patterns
    for (const name of originalNames) {
      const lowerName = name.toLowerCase();
      
      if (lowerName.includes('startup') || lowerName.includes('llc')) {
        return 'Small-Medium';
      } else if (lowerName.includes('corporation') || lowerName.includes('corp')) {
        return 'Medium-Large';
      } else if (lowerName.includes('inc')) {
        return 'Small-Medium';
      } else if (lowerName.includes('group') || lowerName.includes('holdings')) {
        return 'Large';
      }
    }

    return 'Unknown';
  }

  /**
   * Generate progression timeline for a company
   */
  generateProgressionTimeline(positions) {
    return positions
      .sort((a, b) => new Date(a.date_start || '1900-01-01') - new Date(b.date_start || '1900-01-01'))
      .map(pos => `${pos.title} (${pos.date_start || 'Unknown'} - ${pos.date_end || 'Present'})`)
      .join(' → ');
  }

  /**
   * Calculate various company loyalty metrics
   */
  calculateAverageCompaniesPerYear(jobs) {
    if (jobs.length === 0) return 0;

    const dates = jobs
      .map(job => job.date_start)
      .filter(Boolean)
      .map(date => new Date(date));

    if (dates.length === 0) return 0;

    const earliest = new Date(Math.min(...dates));
    const latest = new Date(Math.max(...dates));
    const yearSpan = (latest - earliest) / (1000 * 60 * 60 * 24 * 365);

    return yearSpan > 0 ? jobs.length / yearSpan : jobs.length;
  }

  calculateLongestCompanyGap(companyGroups) {
    // Implementation for calculating gaps between companies
    // This would require sorting companies by date and finding gaps
    return 0; // Placeholder
  }

  calculateCompanyRetentionScore(companyGroups) {
    const multiRoleCompanies = companyGroups.filter(c => c.totalPositions > 1).length;
    return companyGroups.length > 0 ? multiRoleCompanies / companyGroups.length : 0;
  }

  calculateCareerStabilityIndex(companyGroups, jobs) {
    const avgTenure = companyGroups.reduce((sum, c) => sum + c.tenure.months, 0) / companyGroups.length;
    const jobChangesPerYear = this.calculateAverageCompaniesPerYear(jobs);
    
    // Higher tenure and fewer job changes = higher stability
    return avgTenure / (12 * jobChangesPerYear);
  }

  /**
   * Generate timeline data optimized for visualization
   * @param {Array} jobs - Array of job data
   * @returns {Object} Timeline data with company blocks and career patterns
   */
  generateCompanyTimeline(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return {
        timeline: [],
        patterns: {
          longestTenure: 0,
          averageTenure: 0,
          totalCareerMonths: 0,
          jobHoppingScore: 0,
          progressionScore: 0,
          stabilityIndex: 0,
          careerPattern: 'unknown'
        },
        gaps: [],
        overlaps: [],
        insights: []
      };
    }

    // Get company groupings for timeline generation
    const companyGroups = this.companyGroupingService.groupJobsByCompany(jobs);
    
    // Calculate total career span for percentage calculations
    const { totalCareerMonths, careerStart, careerEnd } = this._calculateTotalCareerSpan(jobs);
    
    // Generate timeline blocks for each company
    const timeline = companyGroups.map(company => {
      const companyBlock = this._generateCompanyBlock(company, totalCareerMonths);
      return companyBlock;
    }).filter(block => block !== null);

    // Sort timeline by start date
    timeline.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    // Detect and handle gaps and overlaps
    const { gaps, overlaps } = this._analyzeTimelineGapsAndOverlaps(timeline);

    // Generate career pattern analysis
    const patterns = this._analyzeCareerPatterns(timeline, totalCareerMonths, companyGroups);

    // Generate insights based on timeline analysis
    const insights = this._generateTimelineInsights(timeline, patterns, gaps, overlaps);

    return {
      timeline,
      patterns: {
        ...patterns,
        totalCareerMonths,
        careerStart,
        careerEnd
      },
      gaps,
      overlaps,
      insights,
      metadata: {
        totalCompanies: timeline.length,
        timelineSpan: `${careerStart} - ${careerEnd}`,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate total career span from all jobs
   */
  _calculateTotalCareerSpan(jobs) {
    const startDates = jobs
      .map(job => job.date_start)
      .filter(Boolean)
      .map(date => new Date(date));

    const endDates = jobs
      .map(job => job.date_end || new Date().toISOString().split('T')[0])
      .filter(Boolean)
      .map(date => new Date(date));

    if (startDates.length === 0) {
      return { totalCareerMonths: 0, careerStart: null, careerEnd: null };
    }

    const careerStart = new Date(Math.min(...startDates));
    const careerEnd = new Date(Math.max(...endDates));
    
    const totalCareerMonths = (careerEnd - careerStart) / (1000 * 60 * 60 * 24 * 30.44); // Average days per month

    return {
      totalCareerMonths: Math.round(totalCareerMonths),
      careerStart: careerStart.toISOString().split('T')[0],
      careerEnd: careerEnd.toISOString().split('T')[0]
    };
  }

  /**
   * Generate timeline block for a single company
   */
  _generateCompanyBlock(company, totalCareerMonths) {
    if (!company.positions || company.positions.length === 0) return null;

    // Sort positions by start date
    const sortedPositions = company.positions
      .sort((a, b) => new Date(a.date_start || '1900-01-01') - new Date(b.date_start || '1900-01-01'));

    // Calculate company date range
    const companyStart = sortedPositions[0].date_start;
    const companyEnd = sortedPositions[sortedPositions.length - 1].date_end || 
                      new Date().toISOString().split('T')[0];

    if (!companyStart) return null;

    // Calculate total months at company (accounting for gaps in boomerang patterns)
    const totalMonths = company.tenure.months;
    
    // Calculate career percentage
    const careerPercentage = totalCareerMonths > 0 ? 
      Math.round((totalMonths / totalCareerMonths) * 100 * 10) / 10 : 0;

    // Generate position blocks within the company
    const positions = sortedPositions.map(position => ({
      title: position.title,
      start: position.date_start,
      end: position.date_end,
      duration: this.calculateDuration(position.date_start, position.date_end),
      durationFormatted: this._formatPositionDuration(position.date_start, position.date_end),
      skills: position.skills || [],
      isCurrentPosition: !position.date_end
    }));

    // Analyze internal progression
    const internalProgression = this._analyzeInternalProgression(positions);

    return {
      company: company.originalNames[0],
      normalizedName: company.normalizedName,
      startDate: companyStart,
      endDate: companyEnd,
      totalMonths,
      totalMonthsFormatted: company.tenure.formatted,
      positions,
      careerPercentage,
      
      // Company-specific insights
      isBoomerang: company.boomerangPattern.isBoomerang,
      stints: company.boomerangPattern.stints,
      gaps: company.boomerangPattern.gaps.map(gap => ({
        start: gap.start,
        end: gap.end,
        duration: gap.duration,
        durationFormatted: gap.durationFormatted
      })),
      
      // Career progression within company
      progression: {
        pattern: company.careerProgression.pattern,
        promotions: company.careerProgression.promotions.length,
        lateralMoves: company.careerProgression.lateralMoves.length,
        progressionScore: company.careerProgression.progressionScore,
        timeline: internalProgression.timeline,
        advancement: internalProgression.advancement
      },
      
      // Skills and growth
      skillsCount: company.aggregatedSkills.skillCount,
      topSkills: this._getTopSkills(company.aggregatedSkills.skillFrequency, 5),
      skillEvolution: company.aggregatedSkills.skillEvolution || [],
      
      // Visual styling hints for timeline display
      displayHints: {
        color: this._getCompanyColor(company.normalizedName),
        intensity: this._getCompanyIntensity(totalMonths, careerPercentage),
        pattern: company.careerProgression.pattern,
        isHighlight: careerPercentage > 25 || totalMonths > 36 // Highlight major employers
      }
    };
  }

  /**
   * Analyze gaps and overlaps in the timeline
   */
  _analyzeTimelineGapsAndOverlaps(timeline) {
    const gaps = [];
    const overlaps = [];

    for (let i = 0; i < timeline.length - 1; i++) {
      const current = timeline[i];
      const next = timeline[i + 1];

      const currentEnd = new Date(current.endDate);
      const nextStart = new Date(next.startDate);
      const timeDiff = nextStart - currentEnd;
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      if (daysDiff > 7) { // Gap of more than a week
        gaps.push({
          after: current.company,
          before: next.company,
          start: current.endDate,
          end: next.startDate,
          duration: daysDiff,
          durationFormatted: this._formatDuration(daysDiff),
          type: this._classifyGap(daysDiff)
        });
      } else if (daysDiff < -7) { // Overlap of more than a week
        overlaps.push({
          companies: [current.company, next.company],
          overlapStart: next.startDate,
          overlapEnd: current.endDate,
          duration: Math.abs(daysDiff),
          durationFormatted: this._formatDuration(Math.abs(daysDiff)),
          type: 'employment_overlap'
        });
      }
    }

    return { gaps, overlaps };
  }

  /**
   * Analyze career patterns from timeline data
   */
  _analyzeCareerPatterns(timeline, totalCareerMonths, companyGroups) {
    if (timeline.length === 0) {
      return {
        longestTenure: 0,
        averageTenure: 0,
        jobHoppingScore: 0,
        progressionScore: 0,
        stabilityIndex: 0,
        careerPattern: 'unknown'
      };
    }

    // Basic statistics
    const tenures = timeline.map(block => block.totalMonths);
    const longestTenure = Math.max(...tenures);
    const averageTenure = Math.round((tenures.reduce((sum, t) => sum + t, 0) / tenures.length) * 10) / 10;

    // Job hopping score (0 = stable, 1 = frequent job changes)
    const jobHoppingScore = this._calculateJobHoppingScore(timeline, totalCareerMonths);

    // Progression score (0 = no advancement, 1 = strong advancement)
    const progressionScore = this._calculateProgressionScore(companyGroups);

    // Stability index (combination of tenure length and job hopping)
    const stabilityIndex = this._calculateStabilityIndex(averageTenure, jobHoppingScore);

    // Overall career pattern classification
    const careerPattern = this._classifyCareerPattern(jobHoppingScore, progressionScore, stabilityIndex, timeline);

    // Additional pattern insights
    const patternInsights = {
      // Tenure patterns
      shortTermJobs: tenures.filter(t => t < 12).length, // < 1 year
      mediumTermJobs: tenures.filter(t => t >= 12 && t < 36).length, // 1-3 years
      longTermJobs: tenures.filter(t => t >= 36).length, // 3+ years
      
      // Company size progression
      companySizeProgression: this._analyzeCompanySizeInTimeline(timeline),
      
      // Career growth velocity
      growthVelocity: this._calculateGrowthVelocity(timeline),
      
      // Industry diversity
      industryChanges: this._countIndustryChanges(timeline)
    };

    return {
      longestTenure,
      averageTenure,
      jobHoppingScore: Math.round(jobHoppingScore * 100) / 100,
      progressionScore: Math.round(progressionScore * 100) / 100,
      stabilityIndex: Math.round(stabilityIndex * 100) / 100,
      careerPattern,
      ...patternInsights
    };
  }

  /**
   * Calculate job hopping score based on tenure patterns
   */
  _calculateJobHoppingScore(timeline, totalCareerMonths) {
    if (timeline.length <= 1) return 0;

    // Factors that indicate job hopping:
    // 1. Number of companies relative to career length
    // 2. Average tenure length
    // 3. Frequency of short-term positions

    const companiesPerYear = timeline.length / (totalCareerMonths / 12);
    const shortTermJobs = timeline.filter(block => block.totalMonths < 18).length; // < 1.5 years
    const shortTermRatio = shortTermJobs / timeline.length;

    // Normalize scores
    const frequencyScore = Math.min(companiesPerYear / 2, 1); // 2+ companies per year = max score
    const shortTermScore = shortTermRatio; // Direct ratio
    
    return (frequencyScore * 0.6 + shortTermScore * 0.4); // Weighted average
  }

  /**
   * Calculate overall progression score across all companies
   */
  _calculateProgressionScore(companyGroups) {
    if (companyGroups.length === 0) return 0;

    let totalPromotions = 0;
    let totalPositions = 0;
    let companiesWithProgression = 0;

    companyGroups.forEach(company => {
      totalPositions += company.totalPositions;
      totalPromotions += company.careerProgression.promotions.length;
      
      if (company.careerProgression.promotions.length > 0 || 
          company.careerProgression.pattern === 'upward' ||
          company.careerProgression.pattern === 'strong_upward') {
        companiesWithProgression++;
      }
    });

    // Score based on promotion ratio and companies with progression
    const promotionRatio = totalPositions > 0 ? totalPromotions / (totalPositions - companyGroups.length) : 0;
    const progressionCompanyRatio = companiesWithProgression / companyGroups.length;

    return Math.min((promotionRatio * 0.7 + progressionCompanyRatio * 0.3), 1);
  }

  /**
   * Calculate stability index
   */
  _calculateStabilityIndex(averageTenure, jobHoppingScore) {
    // Higher tenure and lower job hopping = higher stability
    const tenureScore = Math.min(averageTenure / 36, 1); // 3 years = max tenure score
    const stabilityScore = (tenureScore + (1 - jobHoppingScore)) / 2;
    return stabilityScore;
  }

  /**
   * Classify overall career pattern
   */
  _classifyCareerPattern(jobHoppingScore, progressionScore, stabilityIndex, timeline) {
    if (timeline.length === 1) return 'single_company_career';
    
    if (stabilityIndex > 0.7 && progressionScore > 0.6) {
      return 'stable_growth_career';
    } else if (jobHoppingScore > 0.6 && progressionScore > 0.5) {
      return 'strategic_job_hopping';
    } else if (jobHoppingScore > 0.7) {
      return 'frequent_job_changing';
    } else if (stabilityIndex > 0.6) {
      return 'stable_career';
    } else if (progressionScore > 0.7) {
      return 'advancement_focused';
    } else {
      return 'mixed_pattern_career';
    }
  }

  /**
   * Additional helper methods for timeline generation
   */

  /**
   * Format position duration for timeline display
   */
  _formatPositionDuration(startDate, endDate) {
    if (!startDate) return 'Unknown duration';
    
    const duration = this.calculateDuration(startDate, endDate);
    return this.formatDurationFromMonths(duration);
  }

  /**
   * Analyze internal progression within a company
   */
  _analyzeInternalProgression(positions) {
    if (positions.length <= 1) {
      return {
        timeline: positions.map(p => p.title).join(''),
        advancement: 'single_role'
      };
    }

    // Create progression timeline
    const timeline = positions.map(pos => 
      `${pos.title} (${pos.start || 'Unknown'} - ${pos.end || 'Present'})`
    ).join(' → ');

    // Determine advancement pattern
    let advancement = 'lateral';
    const titles = positions.map(p => p.title.toLowerCase());
    
    // Check for promotion indicators
    const hasPromotion = titles.some((title, i) => {
      if (i === 0) return false;
      const prevTitle = titles[i - 1];
      return (
        title.includes('senior') && !prevTitle.includes('senior') ||
        title.includes('lead') && !prevTitle.includes('lead') ||
        title.includes('principal') && !prevTitle.includes('principal') ||
        title.includes('director') && !prevTitle.includes('director') ||
        title.includes('manager') && !prevTitle.includes('manager')
      );
    });

    if (hasPromotion) {
      advancement = 'promoted';
    } else if (positions.length > 2) {
      advancement = 'multiple_roles';
    }

    return { timeline, advancement };
  }

  /**
   * Get top skills for a company
   */
  _getTopSkills(skillFrequency, limit = 5) {
    if (!skillFrequency || typeof skillFrequency !== 'object') return [];
    
    return Object.entries(skillFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([skill, count]) => ({ skill, count }));
  }

  /**
   * Get color hint for company visualization
   */
  _getCompanyColor(normalizedName) {
    // Simple hash-based color assignment for consistency
    const colors = [
      '#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6',
      '#1abc9c', '#e67e22', '#34495e', '#95a5a6', '#27ae60'
    ];
    
    const hash = normalizedName.split('').reduce((acc, char) => 
      acc + char.charCodeAt(0), 0
    );
    
    return colors[hash % colors.length];
  }

  /**
   * Get intensity hint for company visualization
   */
  _getCompanyIntensity(totalMonths, careerPercentage) {
    // Higher intensity for longer tenures and higher career percentages
    const tenureScore = Math.min(totalMonths / 48, 1); // 4 years = max
    const percentageScore = careerPercentage / 100;
    
    return Math.round(((tenureScore + percentageScore) / 2) * 100) / 100;
  }

  /**
   * Classify gap types
   */
  _classifyGap(daysDuration) {
    if (daysDuration < 30) return 'short_gap'; // < 1 month
    if (daysDuration < 90) return 'medium_gap'; // < 3 months
    if (daysDuration < 365) return 'long_gap'; // < 1 year
    return 'extended_gap'; // 1+ years
  }

  /**
   * Analyze company size progression in timeline
   */
  _analyzeCompanySizeInTimeline(timeline) {
    const sizeProgression = timeline.map((company, index) => {
      const inferredSize = this.inferCompanySize(company.normalizedName, [company.company]);
      return {
        company: company.company,
        size: inferredSize,
        order: index + 1,
        timeframe: `${company.startDate} - ${company.endDate}`
      };
    });

    // Analyze progression pattern
    const sizes = sizeProgression.map(s => s.size);
    const sizeOrder = ['Startup', 'Small', 'Small-Medium', 'Medium', 'Medium-Large', 'Large'];
    
    let progressionPattern = 'varied';
    if (sizes.length > 1) {
      const firstIndex = sizeOrder.indexOf(sizes[0]);
      const lastIndex = sizeOrder.indexOf(sizes[sizes.length - 1]);
      
      if (lastIndex > firstIndex) {
        progressionPattern = 'scaling_up';
      } else if (lastIndex < firstIndex) {
        progressionPattern = 'scaling_down';
      } else {
        progressionPattern = 'consistent_size';
      }
    }

    return {
      progression: sizeProgression,
      pattern: progressionPattern,
      summary: `${sizeProgression.length} companies, progression: ${progressionPattern}`
    };
  }

  /**
   * Calculate career growth velocity
   */
  _calculateGrowthVelocity(timeline) {
    if (timeline.length <= 1) return 0;

    // Count total promotions and role changes
    const totalPromotions = timeline.reduce((sum, company) => 
      sum + (company.progression?.promotions || 0), 0
    );
    
    const totalRoleChanges = timeline.reduce((sum, company) => 
      sum + (company.positions?.length || 1), 0
    );

    // Calculate career span in years
    const firstStart = new Date(timeline[0].startDate);
    const lastEnd = new Date(timeline[timeline.length - 1].endDate);
    const careerYears = (lastEnd - firstStart) / (1000 * 60 * 60 * 24 * 365);

    // Velocity = (promotions + role changes) per year
    return careerYears > 0 ? 
      Math.round(((totalPromotions * 2 + totalRoleChanges) / careerYears) * 100) / 100 : 0;
  }

  /**
   * Count industry changes in timeline
   */
  _countIndustryChanges(timeline) {
    let changes = 0;
    let previousIndustries = [];

    timeline.forEach((company, index) => {
      // Infer industries for this company
      const mockJob = { 
        title: company.positions?.[0]?.title || '', 
        org: company.company,
        skills: company.topSkills?.map(s => s.skill) || []
      };
      
      const currentIndustries = this.inferIndustries(mockJob);
      
      if (index > 0) {
        // Check if there's a significant industry change
        const hasCommonIndustry = previousIndustries.some(prev => 
          currentIndustries.includes(prev)
        );
        
        if (!hasCommonIndustry && previousIndustries.length > 0 && currentIndustries.length > 0) {
          changes++;
        }
      }
      
      previousIndustries = currentIndustries;
    });

    return changes;
  }

  /**
   * Generate timeline insights
   */
  _generateTimelineInsights(timeline, patterns, gaps, overlaps) {
    const insights = [];

    // Career span insights
    if (timeline.length > 0) {
      const firstCompany = timeline[0];
      const lastCompany = timeline[timeline.length - 1];
      const careerYears = Math.round((new Date(lastCompany.endDate) - new Date(firstCompany.startDate)) / 
        (1000 * 60 * 60 * 24 * 365) * 10) / 10;
      
      insights.push(`Career spans ${careerYears} years across ${timeline.length} companies`);
    }

    // Pattern-based insights
    switch (patterns.careerPattern) {
      case 'stable_growth_career':
        insights.push('Shows stable career growth with consistent advancement');
        break;
      case 'strategic_job_hopping':
        insights.push('Demonstrates strategic job changes with career progression');
        break;
      case 'frequent_job_changing':
        insights.push('Exhibits frequent job changes - may indicate exploration or market responsiveness');
        break;
      case 'stable_career':
        insights.push('Shows career stability with long-term commitments');
        break;
      case 'advancement_focused':
        insights.push('Strong focus on career advancement and progression');
        break;
      default:
        insights.push('Mixed career pattern with varied approaches to career development');
    }

    // Tenure insights
    if (patterns.longestTenure >= 36) {
      insights.push(`Longest tenure: ${Math.round(patterns.longestTenure / 12)} years - demonstrates commitment capability`);
    }

    if (patterns.averageTenure > 24) {
      insights.push(`Above-average tenure (${Math.round(patterns.averageTenure)} months) indicates loyalty and stability`);
    }

    // Gap insights
    if (gaps.length > 0) {
      const longGaps = gaps.filter(g => g.type === 'extended_gap');
      if (longGaps.length > 0) {
        insights.push(`${longGaps.length} extended career gap${longGaps.length > 1 ? 's' : ''} - may indicate education, travel, or life transitions`);
      }
    }

    // Overlap insights
    if (overlaps.length > 0) {
      insights.push(`${overlaps.length} employment overlap${overlaps.length > 1 ? 's' : ''} - indicates smooth transitions or consulting work`);
    }

    // Company size insights
    if (patterns.companySizeProgression?.pattern === 'scaling_up') {
      insights.push('Career progression from smaller to larger companies');
    } else if (patterns.companySizeProgression?.pattern === 'scaling_down') {
      insights.push('Transition from larger corporations to smaller companies - may indicate entrepreneurial interests');
    }

    // Skills and growth insights
    const totalUniqueSkills = new Set(
      timeline.flatMap(company => 
        company.topSkills?.map(s => s.skill) || []
      )
    ).size;
    
    if (totalUniqueSkills > 15) {
      insights.push(`Diverse skill portfolio with ${totalUniqueSkills}+ demonstrated competencies`);
    }

    return insights;
  }

  formatDurationFromMonths(months) {
    const years = Math.floor(months / 12);
    const remainingMonths = Math.round(months % 12);
    
    if (years === 0) {
      return `${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    } else if (remainingMonths === 0) {
      return `${years} year${years !== 1 ? 's' : ''}`;
    } else {
      return `${years} year${years !== 1 ? 's' : ''} ${remainingMonths} month${remainingMonths !== 1 ? 's' : ''}`;
    }
  }

  categorizeIndustryTransition(fromIndustries, toIndustries) {
    // Analyze the type of industry transition
    if (fromIndustries.includes('Technology') && toIndustries.includes('Finance')) {
      return 'Tech to Finance';
    } else if (fromIndustries.includes('Finance') && toIndustries.includes('Technology')) {
      return 'Finance to Tech';
    } else if (fromIndustries.length === 1 && toIndustries.length === 1) {
      return `${fromIndustries[0]} to ${toIndustries[0]}`;
    }
    return 'Cross-Industry';
  }

  calculateIndustryDiversityScore(industries, transitions, jobs) {
    // Simple diversity score based on number of industries and transitions
    const industryFactor = Math.min(industries.size / 5, 1); // Normalize to max of 5 industries
    const transitionFactor = Math.min(transitions.length / (jobs.length - 1), 1);
    return (industryFactor + transitionFactor) / 2;
  }

  determineCareerStage(index, totalCompanies, startDate) {
    const yearsAgo = (new Date() - startDate) / (1000 * 60 * 60 * 24 * 365);
    
    if (yearsAgo > 15) return 'Early Career';
    if (yearsAgo > 8) return 'Mid Career';
    if (yearsAgo > 3) return 'Recent Career';
    return 'Current Career';
  }

  generateCompanySizeInsights(progression) {
    const insights = [];
    
    if (progression.length > 1) {
      const startSize = progression[0].inferredSize;
      const endSize = progression[progression.length - 1].inferredSize;
      
      if (startSize !== endSize) {
        insights.push(`Company size progression: ${startSize} → ${endSize}`);
      }
    }

    const largeCompanies = progression.filter(p => p.inferredSize === 'Large').length;
    if (largeCompanies > 0) {
      insights.push(`Experience at ${largeCompanies} large corporation${largeCompanies > 1 ? 's' : ''}`);
    }

    const startups = progression.filter(p => p.inferredSize === 'Startup').length;
    if (startups > 0) {
      insights.push(`Experience at ${startups} startup${startups > 1 ? 's' : ''}`);
    }

    return insights;
  }

  inferReturnReasons(company) {
    const reasons = [];
    
    if (company.careerProgression.promotions.length > 0) {
      reasons.push('Career advancement opportunity');
    }
    
    if (company.aggregatedSkills.skillEvolution && company.aggregatedSkills.skillEvolution.length > 0) {
      reasons.push('Skills development and learning');
    }
    
    if (company.tenure.years >= 2) {
      reasons.push('Strong cultural fit and loyalty');
    }

    return reasons.length > 0 ? reasons : ['Professional relationship and mutual value'];
  }
}

export default DataProcessingService;