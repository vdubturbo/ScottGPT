/**
 * Company Grouping Service - Browser Compatible Version
 *
 * Intelligently groups job positions by company while handling various edge cases:
 * - Company name variations (Microsoft vs Microsoft Corp)
 * - Career progression detection
 * - Boomerang employees (returning to same company)
 * - Skills aggregation
 * - Date handling (overlapping, missing, invalid dates)
 */

class CompanyGroupingService {
  constructor() {
    // Browser-compatible logging (console only)
    this.logger = {
      info: (message, meta) => console.log('[CompanyGrouping]', message, meta),
      warn: (message, meta) => console.warn('[CompanyGrouping]', message, meta),
      error: (message, meta) => console.error('[CompanyGrouping]', message, meta)
    };

    // Comprehensive company suffixes (prioritized by specificity)
    this.companySuffixes = {
      // Most specific first for better matching
      'corporation': ['corporation', 'corp', 'corp.'],
      'incorporated': ['incorporated', 'inc', 'inc.'],
      'company': ['company', 'co', 'co.'],
      'limited': ['limited', 'ltd', 'ltd.'],
      'liability company': ['liability company', 'llc', 'l.l.c.'],
      'limited liability partnership': ['limited liability partnership', 'llp', 'l.l.p.'],
      'limited partnership': ['limited partnership', 'lp', 'l.p.'],
      'public limited company': ['public limited company', 'plc'],
      'sociedad anónima': ['sociedad anónima', 'sa', 's.a.'],
      'gesellschaft mit beschränkter haftung': ['gesellschaft mit beschränkter haftung', 'gmbh'],
      'aktiengesellschaft': ['aktiengesellschaft', 'ag'],
      'besloten vennootschap': ['besloten vennootschap', 'bv', 'b.v.'],
      'société anonyme': ['société anonyme', 's.a.'],
      'société à responsabilité limitée': ['société à responsabilité limitée', 'sarl'],
      'kabushiki kaisha': ['kabushiki kaisha', 'kk', 'k.k.'],
      'yugen kaisha': ['yugen kaisha', 'yk', 'y.k.']
    };

    // Known acquisitions and ownership changes
    this.acquisitionMappings = {
      'instagram': 'meta platforms',
      'whatsapp': 'meta platforms',
      'oculus': 'meta platforms',
      'youtube': 'google',
      'doubleclick': 'google',
      'nest': 'google',
      'fitbit': 'google',
      'linkedin': 'microsoft',
      'github': 'microsoft',
      'skype': 'microsoft',
      'nokia': 'microsoft', // Mobile division
      'activision blizzard': 'microsoft',
      'whole foods': 'amazon',
      'audible': 'amazon',
      'twitch': 'amazon',
      'zappos': 'amazon',
      'slack': 'salesforce',
      'tableau': 'salesforce',
      'mulesoft': 'salesforce',
      'red hat': 'ibm',
      'weather company': 'ibm',
      'softlayer': 'ibm'
    };

    // Division/subsidiary mappings
    this.divisionMappings = {
      'google cloud': 'google',
      'google ads': 'google',
      'google play': 'google',
      'android': 'google',
      'chrome': 'google',
      'gmail': 'google',
      'google maps': 'google',
      'aws': 'amazon',
      'amazon web services': 'amazon',
      'prime video': 'amazon',
      'alexa': 'amazon',
      'kindle': 'amazon',
      'azure': 'microsoft',
      'office 365': 'microsoft',
      'windows': 'microsoft',
      'xbox': 'microsoft',
      'teams': 'microsoft',
      'sharepoint': 'microsoft',
      'facebook': 'meta platforms',
      'meta': 'meta platforms',
      'facebook ads': 'meta platforms',
      'messenger': 'meta platforms'
    };

    // Common company aliases and alternative names
    this.companyAliases = {
      'google': ['alphabet', 'alphabet inc'],
      'meta platforms': ['facebook', 'meta', 'facebook inc'],
      'microsoft': ['msft', 'microsoft corporation'],
      'amazon': ['amzn', 'amazon.com'],
      'apple': ['aapl', 'apple computer'],
      'ibm': ['international business machines'],
      'oracle': ['oracle corporation'],
      'salesforce': ['salesforce.com'],
      'adobe': ['adobe systems'],
      'intel': ['intel corporation'],
      'cisco': ['cisco systems'],
      'dell': ['dell technologies', 'dell computer'],
      'hp': ['hewlett packard', 'hewlett-packard'],
      'nvidia': ['nvidia corporation'],
      'amd': ['advanced micro devices'],
      'qualcomm': ['qualcomm incorporated'],
      'broadcom': ['broadcom inc'],
      'vmware': ['vmware inc'],
      'servicenow': ['service now'],
      'workday': ['workday inc'],
      'splunk': ['splunk inc'],
      'mongodb': ['mongo db'],
      'elasticsearch': ['elastic'],
      'databricks': ['data bricks'],
      'snowflake': ['snowflake computing'],
      'palantir': ['palantir technologies'],
      'uber': ['uber technologies'],
      'lyft': ['lyft inc'],
      'airbnb': ['air bnb'],
      'spotify': ['spotify technology'],
      'netflix': ['netflix inc'],
      'zoom': ['zoom video communications'],
      'slack': ['slack technologies'],
      'atlassian': ['atlassian corporation'],
      'square': ['block', 'square inc'],
      'stripe': ['stripe inc'],
      'paypal': ['paypal holdings'],
      'tesla': ['tesla motors', 'tesla inc'],
      'spacex': ['space exploration technologies'],
      'twitter': ['x corp', 'twitter inc'],
      'reddit': ['reddit inc'],
      'discord': ['discord inc'],
      'pinterest': ['pinterest inc'],
      'snapchat': ['snap inc'],
      'tiktok': ['bytedance'],
      'shopify': ['shopify inc'],
      'etsy': ['etsy inc'],
      'ebay': ['ebay inc'],
      'yelp': ['yelp inc'],
      'trivago': ['trivago nv'],
      'booking': ['booking holdings', 'priceline'],
      'expedia': ['expedia group'],
      'zillow': ['zillow group'],
      'redfin': ['redfin corporation'],
      'robinhood': ['robinhood markets'],
      'coinbase': ['coinbase global'],
      'kraken': ['payward'],
      'binance': ['binance holdings']
    };

    // Performance metrics
    this.metrics = {
      normalizationCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lowConfidenceNormalizations: 0
    };

    // Normalization cache for performance
    this.normalizationCache = new Map();
  }

  /**
   * Main entry point: Group jobs by company with comprehensive analysis
   * @param {Array} jobs - Array of job objects
   * @param {Object} options - Grouping options
   * @returns {Array} Array of company group objects
   */
  groupJobsByCompany(jobs, options = {}) {
    const {
      includeProgression = true,
      includeBoomerangAnalysis = true,
      includeSkillsAnalysis = true,
      sortByTenure = false,
      minPositionsForAnalysis = 1
    } = options;

    if (!Array.isArray(jobs)) {
      this.logger.warn('Invalid input: jobs must be an array', { jobs });
      return [];
    }

    // Group jobs by normalized company name
    const companyGroups = new Map();
    const companyNameVariations = new Map();

    for (const job of jobs) {
      if (!job || !job.org) continue;

      const normalizedName = this.normalizeCompanyName(job.org);
      const originalName = job.org;

      if (!companyGroups.has(normalizedName)) {
        companyGroups.set(normalizedName, {
          normalizedName,
          originalNames: new Set(),
          positions: [],
          totalPositions: 0
        });
        companyNameVariations.set(normalizedName, new Set());
      }

      const group = companyGroups.get(normalizedName);
      group.originalNames.add(originalName);
      group.positions.push(job);
      group.totalPositions++;
      companyNameVariations.get(normalizedName).add(originalName);
    }

    // Convert to array and enhance with analysis
    const result = Array.from(companyGroups.values()).map(group => {
      // Convert sets to arrays for JSON serialization
      group.originalNames = Array.from(group.originalNames);

      // Sort positions chronologically
      group.positions.sort((a, b) => {
        const dateA = a.date_start ? new Date(a.date_start) : new Date('1900-01-01');
        const dateB = b.date_start ? new Date(b.date_start) : new Date('1900-01-01');
        return dateA - dateB;
      });

      // Add comprehensive analysis
      if (group.totalPositions >= minPositionsForAnalysis) {
        if (includeProgression) {
          group.careerProgression = this.calculateCareerProgression(group.positions);
        }

        if (includeBoomerangAnalysis) {
          group.boomerangPattern = this.detectBoomerangPattern(group.positions);
        }

        if (includeSkillsAnalysis) {
          group.aggregatedSkills = this.aggregateCompanySkills(group.positions);
        }
      }

      // Calculate tenure
      group.tenure = this.calculateCompanyTenure(group.positions);

      // Generate insights
      group.insights = this.generateCompanyInsights(group);

      return group;
    });

    // Sort results
    if (sortByTenure) {
      result.sort((a, b) => (b.tenure?.totalDays || 0) - (a.tenure?.totalDays || 0));
    } else {
      result.sort((a, b) => b.totalPositions - a.totalPositions);
    }

    this.logger.info('Company grouping completed', {
      totalJobs: jobs.length,
      totalCompanies: result.length,
      performance: this.getPerformanceMetrics()
    });

    return result;
  }

  /**
   * Normalize company name for consistent grouping
   * @param {string} companyName - Original company name
   * @returns {string} Normalized company name
   */
  normalizeCompanyName(companyName) {
    this.metrics.normalizationCalls++;

    if (!companyName || typeof companyName !== 'string') {
      return 'unknown';
    }

    // Check cache first
    if (this.normalizationCache.has(companyName)) {
      this.metrics.cacheHits++;
      return this.normalizationCache.get(companyName);
    }

    this.metrics.cacheMisses++;

    let normalized = companyName.toLowerCase().trim();
    let confidenceScore = 1.0;
    let normalizationMethod = 'standard';

    // Remove extra whitespace
    normalized = normalized.replace(/\s+/g, ' ');

    // Check for acquisition mappings first
    for (const [subsidiary, parent] of Object.entries(this.acquisitionMappings)) {
      if (normalized.includes(subsidiary)) {
        normalized = parent;
        normalizationMethod = 'acquisition';
        this.logger.info('Acquisition mapping applied', {
          original: companyName,
          subsidiary,
          parent,
          confidence: confidenceScore
        });
        break;
      }
    }

    // Check division mappings
    if (normalizationMethod === 'standard') {
      for (const [division, parent] of Object.entries(this.divisionMappings)) {
        if (normalized.includes(division)) {
          normalized = parent;
          normalizationMethod = 'division';
          break;
        }
      }
    }

    // Check company aliases
    if (normalizationMethod === 'standard') {
      for (const [canonical, aliases] of Object.entries(this.companyAliases)) {
        if (aliases.some(alias => normalized.includes(alias)) || normalized.includes(canonical)) {
          normalized = canonical;
          normalizationMethod = 'alias';
          break;
        }
      }
    }

    // Remove corporate suffixes if still standard normalization
    if (normalizationMethod === 'standard') {
      for (const [canonical, variations] of Object.entries(this.companySuffixes)) {
        for (const variation of variations) {
          const pattern = new RegExp(`\\b${variation.replace('.', '\\.')}\\b$`, 'i');
          if (pattern.test(normalized)) {
            normalized = normalized.replace(pattern, '').trim();
            normalizationMethod = 'suffix_removal';
            break;
          }
        }
        if (normalizationMethod === 'suffix_removal') break;
      }
    }

    // Fallback: basic cleanup
    if (normalizationMethod === 'standard') {
      // Remove common words and punctuation
      normalized = normalized
        .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
        .replace(/\b(the|and|&|inc|corp|ltd|llc|company|co)\b/g, '') // Remove common words
        .replace(/\s+/g, ' ')
        .trim();

      if (normalized.length === 0) {
        normalized = companyName.toLowerCase().replace(/[^\w]/g, '');
        confidenceScore = 0.3;
      } else {
        confidenceScore = 0.5; // Lower confidence for basic cleanup
      }
      normalizationMethod = 'passthrough';
    }

    // Final cleanup
    normalized = normalized.replace(/\s+/g, ' ').trim();

    if (normalized.length === 0) {
      normalized = 'unknown';
      confidenceScore = 0.1;
    }

    // Log low confidence normalizations
    if (confidenceScore < 0.7) {
      this.metrics.lowConfidenceNormalizations++;
      this.logger.warn('Low confidence normalization', {
        original_name: companyName,
        canonical_name: normalized,
        confidence_score: confidenceScore,
        normalization_method: normalizationMethod,
        requires_review: true,
        metadata: {
          timestamp: new Date().toISOString()
        }
      });
    }

    // Cache the result
    this.normalizationCache.set(companyName, normalized);

    return normalized;
  }

  /**
   * Calculate career progression within a company
   * @param {Array} positions - Array of job positions
   * @returns {Object} Career progression analysis
   */
  calculateCareerProgression(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
      return {
        progressionScore: 0,
        totalPromotions: 0,
        avgTenureMonths: 0,
        progressionType: 'none'
      };
    }

    if (positions.length === 1) {
      const singleTenure = this.calculatePositionTenure(positions[0]);
      return {
        progressionScore: 0,
        totalPromotions: 0,
        avgTenureMonths: singleTenure,
        progressionType: 'single'
      };
    }

    // Sort positions chronologically
    const sortedPositions = [...positions].sort((a, b) => {
      const dateA = a.date_start ? new Date(a.date_start) : new Date('1900-01-01');
      const dateB = b.date_start ? new Date(b.date_start) : new Date('1900-01-01');
      return dateA - dateB;
    });

    let progressionScore = 0;
    let totalPromotions = 0;
    let totalTenure = 0;

    // Analyze transitions between positions
    for (let i = 1; i < sortedPositions.length; i++) {
      const prev = sortedPositions[i - 1];
      const curr = sortedPositions[i];

      const transitionType = this.analyzeCareerTransition(prev, curr);

      switch (transitionType) {
        case 'promotion':
          progressionScore += 2;
          totalPromotions++;
          break;
        case 'lateral':
          progressionScore += 1;
          break;
        case 'step_back':
          progressionScore -= 1;
          break;
        default:
          progressionScore += 0.5; // Similar role
      }

      totalTenure += this.calculatePositionTenure(prev);
    }

    // Add tenure for last position
    totalTenure += this.calculatePositionTenure(sortedPositions[sortedPositions.length - 1]);

    const avgTenureMonths = Math.round(totalTenure / positions.length);

    // Determine progression type
    let progressionType;
    const avgProgression = progressionScore / (positions.length - 1);

    if (avgProgression >= 1.5) {
      progressionType = 'strong';
    } else if (avgProgression >= 1.0) {
      progressionType = 'moderate';
    } else if (avgProgression >= 0.5) {
      progressionType = 'stable';
    } else {
      progressionType = 'mixed';
    }

    return {
      progressionScore: Math.round(progressionScore * 10) / 10,
      totalPromotions,
      avgTenureMonths,
      progressionType
    };
  }

  /**
   * Detect boomerang employment patterns
   * @param {Array} positions - Array of job positions
   * @returns {Object} Boomerang pattern analysis
   */
  detectBoomerangPattern(positions) {
    if (!Array.isArray(positions) || positions.length < 2) {
      return {
        hasBoomerang: false,
        totalStints: positions.length > 0 ? 1 : 0,
        longestGapMonths: 0,
        gaps: []
      };
    }

    // Sort positions chronologically
    const sortedPositions = [...positions].sort((a, b) => {
      const dateA = a.date_start ? new Date(a.date_start) : new Date('1900-01-01');
      const dateB = b.date_start ? new Date(b.date_start) : new Date('1900-01-01');
      return dateA - dateB;
    });

    const gaps = [];
    let totalStints = 1;
    let longestGapMonths = 0;

    // Look for gaps between positions that indicate separate employment periods
    for (let i = 1; i < sortedPositions.length; i++) {
      const prev = sortedPositions[i - 1];
      const curr = sortedPositions[i];

      const prevEnd = prev.date_end ? new Date(prev.date_end) : new Date();
      const currStart = curr.date_start ? new Date(curr.date_start) : new Date();

      // Calculate gap in months
      const gapMonths = (currStart - prevEnd) / (1000 * 60 * 60 * 24 * 30.44);

      // Consider gaps > 3 months as separate stints
      if (gapMonths > 3) {
        totalStints++;
        gaps.push({
          startDate: prev.date_end,
          endDate: curr.date_start,
          gapMonths: Math.round(gapMonths)
        });

        if (gapMonths > longestGapMonths) {
          longestGapMonths = Math.round(gapMonths);
        }
      }
    }

    return {
      hasBoomerang: totalStints > 1,
      totalStints,
      longestGapMonths,
      gaps
    };
  }

  /**
   * Aggregate skills across all positions at a company
   * @param {Array} positions - Array of job positions
   * @returns {Object} Aggregated skills analysis
   */
  aggregateCompanySkills(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
      return {
        uniqueSkills: [],
        totalSkillsCount: 0,
        skillFrequency: {},
        skillEvolution: []
      };
    }

    const skillFrequency = {};
    const allSkills = new Set();
    const skillsByPeriod = [];

    // Process each position
    positions.forEach((position, index) => {
      const skills = position.skills || [];
      const positionSkills = Array.isArray(skills) ? skills : [];

      // Track skills by time period
      const period = this.getTimePeriod(position.date_start, position.date_end);
      skillsByPeriod.push({
        period,
        position: position.title,
        skills: positionSkills
      });

      // Count skill frequency
      positionSkills.forEach(skill => {
        if (typeof skill === 'string' && skill.trim()) {
          const normalizedSkill = skill.trim();
          allSkills.add(normalizedSkill);
          skillFrequency[normalizedSkill] = (skillFrequency[normalizedSkill] || 0) + 1;
        }
      });
    });

    // Create skill evolution timeline
    const skillEvolution = this.createSkillEvolution(skillsByPeriod);

    return {
      uniqueSkills: Array.from(allSkills).sort(),
      totalSkillsCount: Object.values(skillFrequency).reduce((sum, count) => sum + count, 0),
      skillFrequency,
      skillEvolution
    };
  }

  /**
   * Calculate total tenure at a company
   * @param {Array} positions - Array of job positions
   * @returns {Object} Tenure information
   */
  calculateCompanyTenure(positions) {
    if (!Array.isArray(positions) || positions.length === 0) {
      return {
        totalDays: 0,
        totalMonths: 0,
        totalYears: 0,
        startDate: null,
        endDate: null
      };
    }

    // Sort positions chronologically
    const sortedPositions = [...positions].sort((a, b) => {
      const dateA = a.date_start ? new Date(a.date_start) : new Date('1900-01-01');
      const dateB = b.date_start ? new Date(b.date_start) : new Date('1900-01-01');
      return dateA - dateB;
    });

    const startDate = sortedPositions[0].date_start;
    const lastPosition = sortedPositions[sortedPositions.length - 1];
    const endDate = lastPosition.date_end || new Date().toISOString().split('T')[0];

    if (!startDate) {
      return {
        totalDays: 0,
        totalMonths: 0,
        totalYears: 0,
        startDate: null,
        endDate: null
      };
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
    const totalMonths = Math.round(totalDays / 30.44);
    const totalYears = Math.round(totalMonths / 12 * 10) / 10;

    return {
      totalDays,
      totalMonths,
      totalYears,
      startDate,
      endDate
    };
  }

  /**
   * Generate insights about company career patterns
   * @param {Object} companyGroup - Company group data
   * @returns {Array} Array of insight strings
   */
  generateCompanyInsights(companyGroup) {
    const insights = [];

    if (!companyGroup || !companyGroup.positions) {
      return insights;
    }

    const { totalPositions, careerProgression, boomerangPattern, tenure, aggregatedSkills } = companyGroup;

    // Career progression insights
    if (careerProgression) {
      if (careerProgression.totalPromotions > 0) {
        insights.push(`Strong career progression with ${careerProgression.totalPromotions} promotion${careerProgression.totalPromotions > 1 ? 's' : ''}`);
      }

      if (careerProgression.progressionType === 'strong') {
        insights.push('Demonstrated exceptional growth and advancement');
      } else if (careerProgression.progressionType === 'moderate') {
        insights.push('Consistent career development and skill building');
      }
    }

    // Tenure insights
    if (tenure && tenure.totalYears > 0) {
      if (tenure.totalYears >= 5) {
        insights.push(`Long-term commitment with ${tenure.totalYears} years of tenure`);
      } else if (tenure.totalYears >= 2) {
        insights.push(`Solid tenure of ${tenure.totalYears} years`);
      }
    }

    // Boomerang insights
    if (boomerangPattern && boomerangPattern.hasBoomerang) {
      insights.push(`Boomerang employee with ${boomerangPattern.totalStints} separate employment periods`);
    }

    // Skills insights
    if (aggregatedSkills && aggregatedSkills.uniqueSkills.length > 0) {
      const skillCount = aggregatedSkills.uniqueSkills.length;
      if (skillCount >= 20) {
        insights.push(`Extensive skill portfolio with ${skillCount} technologies`);
      } else if (skillCount >= 10) {
        insights.push(`Diverse skill set spanning ${skillCount} technologies`);
      }

      // Check for skill evolution
      if (aggregatedSkills.skillEvolution && aggregatedSkills.skillEvolution.length > 1) {
        insights.push('Consistent skill development and technology adoption');
      }
    }

    // Multi-position insights
    if (totalPositions > 1) {
      insights.push(`Versatile contributor across ${totalPositions} different roles`);
    }

    return insights;
  }

  // Helper methods

  /**
   * Analyze career transition between two positions
   * @param {Object} prevPosition - Previous position
   * @param {Object} currPosition - Current position
   * @returns {string} Transition type
   */
  analyzeCareerTransition(prevPosition, currPosition) {
    if (!prevPosition || !currPosition) return 'unknown';

    const prevTitle = (prevPosition.title || '').toLowerCase();
    const currTitle = (currPosition.title || '').toLowerCase();

    // Check for promotion keywords
    const promotionIndicators = [
      { from: 'engineer', to: 'senior engineer' },
      { from: 'senior engineer', to: 'principal engineer' },
      { from: 'senior engineer', to: 'staff engineer' },
      { from: 'engineer', to: 'lead engineer' },
      { from: 'developer', to: 'senior developer' },
      { from: 'developer', to: 'lead developer' },
      { from: 'analyst', to: 'senior analyst' },
      { from: 'specialist', to: 'senior specialist' },
      { from: 'consultant', to: 'senior consultant' },
      { from: 'manager', to: 'senior manager' },
      { from: 'manager', to: 'director' },
      { from: 'director', to: 'vice president' },
      { from: 'vice president', to: 'president' }
    ];

    for (const indicator of promotionIndicators) {
      if (prevTitle.includes(indicator.from) && currTitle.includes(indicator.to)) {
        return 'promotion';
      }
    }

    // Check for seniority level changes
    const seniorityLevels = ['intern', 'junior', 'associate', '', 'senior', 'staff', 'principal', 'distinguished'];

    let prevLevel = -1;
    let currLevel = -1;

    seniorityLevels.forEach((level, index) => {
      if (level && prevTitle.includes(level)) prevLevel = index;
      if (level && currTitle.includes(level)) currLevel = index;
    });

    if (prevLevel >= 0 && currLevel >= 0) {
      if (currLevel > prevLevel) return 'promotion';
      if (currLevel < prevLevel) return 'step_back';
    }

    // Check for role type changes
    const coreRole = this.extractCoreRole(prevTitle);
    const newCoreRole = this.extractCoreRole(currTitle);

    if (coreRole === newCoreRole) {
      return 'similar';
    } else {
      return 'lateral';
    }
  }

  /**
   * Extract core role from job title
   * @param {string} title - Job title
   * @returns {string} Core role
   */
  extractCoreRole(title) {
    if (!title) return 'unknown';

    const normalizedTitle = title.toLowerCase();

    if (normalizedTitle.includes('engineer')) return 'engineer';
    if (normalizedTitle.includes('developer')) return 'developer';
    if (normalizedTitle.includes('manager')) return 'manager';
    if (normalizedTitle.includes('director')) return 'director';
    if (normalizedTitle.includes('analyst')) return 'analyst';
    if (normalizedTitle.includes('consultant')) return 'consultant';
    if (normalizedTitle.includes('architect')) return 'architect';
    if (normalizedTitle.includes('designer')) return 'designer';
    if (normalizedTitle.includes('product')) return 'product';
    if (normalizedTitle.includes('marketing')) return 'marketing';
    if (normalizedTitle.includes('sales')) return 'sales';
    if (normalizedTitle.includes('operations')) return 'operations';

    return 'other';
  }

  /**
   * Calculate tenure for a single position in months
   * @param {Object} position - Job position
   * @returns {number} Tenure in months
   */
  calculatePositionTenure(position) {
    if (!position || !position.date_start) return 0;

    const startDate = new Date(position.date_start);
    const endDate = position.date_end ? new Date(position.date_end) : new Date();

    const months = (endDate - startDate) / (1000 * 60 * 60 * 24 * 30.44);
    return Math.max(0, Math.round(months));
  }

  /**
   * Get time period string for a position
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {string} Time period
   */
  getTimePeriod(startDate, endDate) {
    if (!startDate) return 'Unknown Period';

    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();

    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    if (startYear === endYear) {
      return startYear.toString();
    } else {
      return `${startYear}-${endYear}`;
    }
  }

  /**
   * Create skill evolution timeline
   * @param {Array} skillsByPeriod - Skills organized by time period
   * @returns {Array} Skill evolution data
   */
  createSkillEvolution(skillsByPeriod) {
    const evolution = [];
    const periodMap = new Map();

    // Group skills by time period
    skillsByPeriod.forEach(item => {
      if (!periodMap.has(item.period)) {
        periodMap.set(item.period, new Set());
      }
      item.skills.forEach(skill => {
        if (typeof skill === 'string' && skill.trim()) {
          periodMap.get(item.period).add(skill.trim());
        }
      });
    });

    // Convert to array format
    periodMap.forEach((skills, period) => {
      evolution.push({
        period,
        skills: Array.from(skills).sort()
      });
    });

    // Sort by period
    evolution.sort((a, b) => a.period.localeCompare(b.period));

    return evolution;
  }

  /**
   * Get performance metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.metrics,
      cacheSize: this.normalizationCache.size,
      cacheHitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
    };
  }

  /**
   * Clear caches and reset metrics
   */
  reset() {
    this.normalizationCache.clear();
    this.metrics = {
      normalizationCalls: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lowConfidenceNormalizations: 0
    };
  }
}

export default CompanyGroupingService;