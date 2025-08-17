/**
 * Data Processing Utilities
 * Handles skills normalization, deduplication, and data transformation
 */

import winston from 'winston';

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
   * Generate analytics for job data
   * @param {Array} jobs - Array of job data
   * @returns {Object} Analytics summary
   */
  generateAnalytics(jobs) {
    if (!Array.isArray(jobs)) return {};

    const analytics = {
      totalJobs: jobs.length,
      totalDuration: 0,
      averageDuration: 0,
      skillFrequency: {},
      organizationHistory: {},
      timelineGaps: [],
      careerProgression: [],
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

    return analytics;
  }
}

export default DataProcessingService;