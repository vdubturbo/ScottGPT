/**
 * Company Grouping Service
 * 
 * Intelligently groups job positions by company while handling various edge cases:
 * - Company name variations (Microsoft vs Microsoft Corp)
 * - Career progression detection
 * - Boomerang employees (returning to same company)
 * - Skills aggregation
 * - Date handling (overlapping, missing, invalid dates)
 * 
 * Enhanced with intelligent normalization:
 * - Corporate suffixes handling
 * - Acquisition tracking (Instagram → Meta)
 * - Division mapping (Google Cloud → Google)
 * - Fuzzy matching for typos
 * - Learning system for continuous improvement
 */

import winston from 'winston';

class CompanyGroupingService {
  constructor() {
    // Setup logging for normalization decisions
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console({ level: 'warn' }),
        new winston.transports.File({ filename: 'logs/company-normalization.log' })
      ]
    });

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
      'naamloze vennootschap': ['naamloze vennootschap', 'nv', 'n.v.']
    };

    // Words that modify but don't change company identity
    this.modifierWords = {
      'size': ['the', 'a', 'an'],
      'scope': ['international', 'global', 'worldwide', 'national', 'local'],
      'structure': ['group', 'holdings', 'holding', 'companies', 'enterprises'],
      'industry': ['systems', 'technologies', 'solutions', 'services', 'consulting', 'partners'],
      'temporal': ['former', 'formerly', 'now', 'current', 'currently']
    };

    // Comprehensive company knowledge base
    this.companyKnowledgeBase = {
      // Tech giants with all variations
      'microsoft': {
        canonical: 'microsoft',
        aliases: [
          'microsoft corp', 'microsoft corporation', 'msft', 'microsoft inc',
          'microsoft company', 'microsoft systems', 'microsoft technologies'
        ],
        divisions: [
          'microsoft azure', 'azure', 'microsoft cloud', 'microsoft office',
          'microsoft xbox', 'xbox', 'microsoft surface', 'microsoft dynamics'
        ],
        acquisitions: [],
        typos: ['microsft', 'mircosoft', 'microsof', 'microsofy'],
        confidence: 'high'
      },

      'google': {
        canonical: 'google',
        aliases: [
          'google inc', 'google llc', 'alphabet inc', 'alphabet',
          'alphabet llc', 'google company'
        ],
        divisions: [
          'google cloud', 'gcp', 'google cloud platform', 'google workspace',
          'google ads', 'google search', 'youtube', 'android', 'chrome',
          'google maps', 'google drive', 'gmail'
        ],
        acquisitions: [
          'youtube', 'android', 'nest', 'fitbit', 'motorola mobility',
          'deepmind', 'waze', 'doubleclick'
        ],
        typos: ['goggle', 'googel', 'gogle', 'googl'],
        confidence: 'high'
      },

      'meta': {
        canonical: 'meta',
        aliases: [
          'facebook', 'facebook inc', 'meta platforms', 'meta platforms inc',
          'facebook company', 'facebook corp'
        ],
        divisions: [
          'instagram', 'whatsapp', 'messenger', 'oculus', 'meta quest',
          'facebook reality labs', 'reality labs'
        ],
        acquisitions: [
          'instagram', 'whatsapp', 'oculus', 'oculus vr', 'whatsapp inc',
          'instagram inc'
        ],
        typos: ['facebok', 'facbook', 'facebook', 'mata'],
        confidence: 'high'
      },

      'amazon': {
        canonical: 'amazon',
        aliases: [
          'amazon inc', 'amazon.com', 'amazon.com inc', 'amazon corp',
          'amazon company', 'amazon services'
        ],
        divisions: [
          'amazon web services', 'aws', 'amazon prime', 'amazon marketplace',
          'amazon logistics', 'amazon studios', 'audible', 'twitch',
          'whole foods', 'whole foods market'
        ],
        acquisitions: [
          'whole foods', 'whole foods market', 'twitch', 'audible',
          'zappos', 'imdb'
        ],
        typos: ['amazom', 'amazon', 'amazone', 'amzon'],
        confidence: 'high'
      },

      'apple': {
        canonical: 'apple',
        aliases: [
          'apple inc', 'apple computer', 'apple computer inc',
          'apple corp', 'apple company'
        ],
        divisions: [
          'app store', 'icloud', 'apple music', 'apple tv', 'apple pay',
          'apple retail', 'apple stores'
        ],
        acquisitions: ['beats', 'beats electronics', 'beats music'],
        typos: ['aple', 'appel', 'appl', 'apple'],
        confidence: 'high'
      },

      'netflix': {
        canonical: 'netflix',
        aliases: ['netflix inc', 'netflix corp', 'netflix company'],
        divisions: ['netflix studios', 'netflix originals'],
        acquisitions: [],
        typos: ['netlix', 'netflix', 'netflx'],
        confidence: 'high'
      },

      'uber': {
        canonical: 'uber',
        aliases: [
          'uber technologies', 'uber technologies inc', 'uber inc',
          'uber corp', 'uber company'
        ],
        divisions: ['uber eats', 'uber freight', 'uber for business'],
        acquisitions: ['postmates'],
        typos: ['uber', 'uber'],
        confidence: 'high'
      },

      'tesla': {
        canonical: 'tesla',
        aliases: [
          'tesla inc', 'tesla motors', 'tesla motors inc',
          'tesla corp', 'tesla company'
        ],
        divisions: ['tesla energy', 'spacex'], // SpaceX often confused
        acquisitions: ['solarcity'],
        typos: ['tesla', 'teslas'],
        confidence: 'high'
      },

      // Aerospace & Defense
      'lockheed martin': {
        canonical: 'lockheed martin',
        aliases: [
          'lockheed martin corp', 'lockheed martin corporation',
          'lockheed corp', 'lockheed corporation'
        ],
        divisions: [
          'lockheed martin ms2', 'lockheed martin ms2 undersea systems',
          'lockheed martin aeronautics', 'lockheed martin missiles and fire control',
          'lockheed martin rotary and mission systems', 'lockheed martin space'
        ],
        acquisitions: [],
        typos: ['lockhead martin', 'lockheed marin'],
        confidence: 'high'
      },

      // Financial Services
      'equifax': {
        canonical: 'equifax',
        aliases: ['equifax inc', 'equifax corp', 'equifax corporation'],
        divisions: ['equifax workforce solutions', 'equifax identity & fraud'],
        acquisitions: [],
        typos: ['equifacts', 'equifac'],
        confidence: 'high'
      },

      // Healthcare
      'mayo clinic': {
        canonical: 'mayo clinic',
        aliases: ['the mayo clinic', 'mayo clinic health system', 'mayo foundation'],
        divisions: ['mayo one', 'mayo clinic laboratories', 'mayo clinic ventures'],
        acquisitions: [],
        typos: ['mayo clinc', 'mayo clinic'],
        confidence: 'high'
      },

      // Hospitality
      'ihg': {
        canonical: 'ihg',
        aliases: [
          'intercontinental hotels group', 'intercontinental hotels group ihg',
          'ihg hotels & resorts', 'intercontinental hotels and resorts'
        ],
        divisions: [
          'holiday inn', 'intercontinental', 'crowne plaza',
          'holiday inn express', 'kimpton', 'even hotels'
        ],
        acquisitions: ['kimpton hotels'],
        typos: ['intercontinetal', 'ihg hotels'],
        confidence: 'high'
      },

      // Software/SaaS
      'leasequery': {
        canonical: 'leasequery',
        aliases: ['leasequery inc', 'leasequery corp', 'lease query'],
        divisions: [],
        acquisitions: [],
        typos: ['leasquery', 'lease-query'],
        confidence: 'medium'
      },

      // Consulting
      'strategic solutions': {
        canonical: 'strategic solutions',
        aliases: [
          'strategic solutions international', 'strategic solutions inc',
          'strategic solutions corp'
        ],
        divisions: [],
        acquisitions: [],
        typos: ['strategic solution', 'stratigic solutions'],
        confidence: 'medium'
      },

      // Cybersecurity  
      'binary defense': {
        canonical: 'binary defense',
        aliases: ['binary defense inc', 'binary defense corp', 'binary defense systems'],
        divisions: [],
        acquisitions: [],
        typos: ['binary defence', 'binarydefense'],
        confidence: 'medium'
      },

      // Consulting Services
      'imaginex': {
        canonical: 'imaginex',
        aliases: [
          'imaginex consulting', 'imaginex corp', 'imaginex inc',
          'imagine x', 'imaginex solutions'
        ],
        divisions: [],
        acquisitions: [],
        typos: ['imagine-x', 'imaginx'],
        confidence: 'medium'
      }
    };

    // Manual overrides and confirmations
    this.manualOverrides = new Map();
    this.pendingConfirmations = new Map();
    this.normalizationHistory = [];
    
    // Fuzzy matching thresholds
    this.matchingThresholds = {
      exact: 1.0,
      high_confidence: 0.95,
      medium_confidence: 0.85,
      low_confidence: 0.75,
      minimum_acceptable: 0.65,
      typo_threshold: 0.80
    };
  }

  /**
   * Main method to group jobs by company
   * @param {Array} jobs - Array of job objects
   * @returns {Array} Array of company groups with aggregated data
   */
  groupJobsByCompany(jobs) {
    if (!Array.isArray(jobs) || jobs.length === 0) {
      return [];
    }

    // Normalize and group jobs
    const companyGroups = this._createCompanyGroups(jobs);
    
    // Process each group
    const processedGroups = companyGroups.map(group => {
      const sortedPositions = this._sortPositionsByDate(group.positions);
      const careerProgression = this.calculateCareerProgression(sortedPositions);
      const boomerangPattern = this.detectBoomerangPattern(sortedPositions);
      const aggregatedSkills = this.aggregateCompanySkills(sortedPositions);
      const tenure = this._calculateTotalTenure(sortedPositions);

      return {
        normalizedName: group.normalizedName,
        originalNames: group.originalNames,
        positions: sortedPositions,
        totalPositions: sortedPositions.length,
        careerProgression,
        boomerangPattern,
        aggregatedSkills,
        tenure,
        dateRange: this._getCompanyDateRange(sortedPositions),
        insights: this._generateCompanyInsights(sortedPositions, careerProgression, boomerangPattern)
      };
    });

    // Sort groups by most recent activity
    return processedGroups.sort((a, b) => {
      const aLatest = this._getLatestDate(a.positions);
      const bLatest = this._getLatestDate(b.positions);
      return new Date(bLatest || '1900-01-01') - new Date(aLatest || '1900-01-01');
    });
  }

  /**
   * Intelligent company name normalization with fuzzy matching
   * @param {string} name - Original company name
   * @param {Object} options - Normalization options
   * @returns {Object} Normalization result with canonical name and metadata
   */
  normalizeCompanyName(name, options = {}) {
    if (!name || typeof name !== 'string') {
      return this._createNormalizationResult('unknown', name, 'empty_input', 0);
    }

    const originalName = name.trim();
    if (!originalName) {
      return this._createNormalizationResult('unknown', name, 'empty_string', 0);
    }

    // Check for manual overrides first
    const override = this.manualOverrides.get(originalName.toLowerCase());
    if (override) {
      this._logNormalization(originalName, override.canonical, 'manual_override', 1.0, {
        override_reason: override.reason,
        override_date: override.date
      });
      return this._createNormalizationResult(override.canonical, originalName, 'manual_override', 1.0);
    }

    // Multi-stage normalization approach
    const stages = [
      this._exactMatch.bind(this),
      this._aliasMatch.bind(this),
      this._divisionMatch.bind(this),
      this._acquisitionMatch.bind(this),
      this._suffixNormalization.bind(this),
      this._typoDetection.bind(this),
      this._fuzzyMatch.bind(this),
      this._conservativeNormalization.bind(this)
    ];

    let bestMatch = null;
    let preprocessed = this._preprocessName(originalName);

    for (const stage of stages) {
      const result = stage(preprocessed, originalName, options);
      if (result && this._isAcceptableMatch(result)) {
        bestMatch = result;
        break;
      }
    }

    // Final result - if no match found, something went wrong - force conservative normalization
    const finalResult = bestMatch || this._conservativeNormalization(preprocessed, originalName, options);

    // Log the normalization decision
    this._logNormalization(
      originalName,
      finalResult.canonical,
      finalResult.method,
      finalResult.confidence,
      finalResult.metadata
    );

    // Add to learning system if confidence is uncertain
    if (finalResult.confidence < this.matchingThresholds.medium_confidence) {
      this._addToLearningQueue(originalName, finalResult);
    }

    return finalResult;
  }

  /**
   * Preprocess company name for normalization
   */
  _preprocessName(name) {
    let processed = name.trim().toLowerCase();

    // Remove common punctuation but preserve meaningful ones
    processed = processed.replace(/[",;:'"()[\]{}]/g, '');
    
    // Normalize dots (periods) - keep meaningful ones like "Inc."
    processed = processed.replace(/\.+/g, '.');
    
    // Normalize whitespace
    processed = processed.replace(/\s+/g, ' ').trim();
    
    // Remove leading/trailing "the"
    processed = processed.replace(/^the\s+/i, '');
    processed = processed.replace(/\s+the$/i, '');

    // Handle "via" consulting arrangements - extract the primary company
    if (processed.includes(' via ')) {
      const parts = processed.split(' via ');
      if (parts.length === 2) {
        // Use the first part (primary company) and note the consulting arrangement
        processed = parts[0].trim();
      }
    }

    // Handle parenthetical information that might contain key company indicators
    const parenMatch = processed.match(/^(.+?)\s*\(([^)]+)\)/);
    if (parenMatch) {
      const mainName = parenMatch[1].trim();
      const parenContent = parenMatch[2].trim().toLowerCase();
      
      // If parenthetical content contains known company abbreviations, use it
      if (parenContent.length <= 5 && /^[a-z0-9&]+$/.test(parenContent)) {
        processed = parenContent; // Use abbreviation like "IHG"
      } else {
        processed = mainName; // Use main name
      }
    }

    return processed;
  }

  /**
   * Stage 1: Exact match against knowledge base
   */
  _exactMatch(preprocessed, original, options) {
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      if (preprocessed === canonical) {
        return this._createNormalizationResult(canonical, original, 'exact_match', 1.0);
      }
    }
    return null;
  }

  /**
   * Stage 2: Alias matching
   */
  _aliasMatch(preprocessed, original, options) {
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      if (data.aliases && data.aliases.includes(preprocessed)) {
        return this._createNormalizationResult(canonical, original, 'alias_match', 0.98);
      }
    }
    return null;
  }

  /**
   * Stage 3: Division/subsidiary matching
   */
  _divisionMatch(preprocessed, original, options) {
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      if (data.divisions) {
        for (const division of data.divisions) {
          if (preprocessed === division.toLowerCase()) {
            return this._createNormalizationResult(
              canonical,
              original,
              'division_match',
              0.90,
              { division: division, parent: canonical }
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Stage 4: Acquisition matching (Instagram → Meta)
   */
  _acquisitionMatch(preprocessed, original, options) {
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      if (data.acquisitions) {
        for (const acquisition of data.acquisitions) {
          if (preprocessed === acquisition.toLowerCase()) {
            return this._createNormalizationResult(
              canonical,
              original,
              'acquisition_match',
              0.85,
              { acquisition: acquisition, acquirer: canonical }
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Stage 5: Corporate suffix normalization
   */
  _suffixNormalization(preprocessed, original, options) {
    let coreName = preprocessed;
    let removedSuffix = null;

    // Remove suffixes and try to match
    for (const [canonical, variations] of Object.entries(this.companySuffixes)) {
      for (const variation of variations) {
        const suffixRegex = new RegExp(`\\s+${this._escapeRegex(variation)}$`, 'i');
        if (suffixRegex.test(coreName)) {
          const withoutSuffix = coreName.replace(suffixRegex, '').trim();
          removedSuffix = variation;
          
          // Check if core name matches any known company
          for (const [knownCanonical, data] of Object.entries(this.companyKnowledgeBase)) {
            if (withoutSuffix === knownCanonical) {
              return this._createNormalizationResult(
                knownCanonical,
                original,
                'suffix_normalization',
                0.95,
                { removed_suffix: removedSuffix }
              );
            }
          }
          
          coreName = withoutSuffix;
          break;
        }
      }
    }

    return coreName !== preprocessed ? 
      this._createNormalizationResult(coreName, original, 'suffix_removal', 0.80, { removed_suffix: removedSuffix }) :
      null;
  }

  /**
   * Stage 6: Typo detection using known typos
   */
  _typoDetection(preprocessed, original, options) {
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      if (data.typos) {
        for (const typo of data.typos) {
          if (preprocessed === typo.toLowerCase()) {
            return this._createNormalizationResult(
              canonical,
              original,
              'typo_correction',
              0.85,
              { corrected_from: typo }
            );
          }
        }
      }
    }
    return null;
  }

  /**
   * Stage 7: Fuzzy matching using string similarity
   */
  _fuzzyMatch(preprocessed, original, options) {
    let bestMatch = null;
    let bestScore = 0;

    // Check against all known companies
    for (const [canonical, data] of Object.entries(this.companyKnowledgeBase)) {
      // Check canonical name
      const canonicalScore = this._calculateStringSimilarity(preprocessed, canonical);
      if (canonicalScore > bestScore && canonicalScore >= this.matchingThresholds.minimum_acceptable) {
        bestScore = canonicalScore;
        bestMatch = { canonical, method: 'fuzzy_canonical' };
      }

      // Check aliases
      if (data.aliases) {
        for (const alias of data.aliases) {
          const aliasScore = this._calculateStringSimilarity(preprocessed, alias);
          if (aliasScore > bestScore && aliasScore >= this.matchingThresholds.minimum_acceptable) {
            bestScore = aliasScore;
            bestMatch = { canonical, method: 'fuzzy_alias', alias };
          }
        }
      }
    }

    if (bestMatch && bestScore >= this.matchingThresholds.minimum_acceptable) {
      return this._createNormalizationResult(
        bestMatch.canonical,
        original,
        bestMatch.method,
        bestScore,
        bestMatch.alias ? { matched_alias: bestMatch.alias } : {}
      );
    }

    return null;
  }

  /**
   * Stage 8: Conservative normalization (last resort)
   */
  _conservativeNormalization(preprocessed, original, options) {
    // Remove modifier words and see if we get a meaningful result
    let cleaned = preprocessed;
    let modifiersRemoved = false;
    
    for (const [category, words] of Object.entries(this.modifierWords)) {
      for (const word of words) {
        // Remove modifier words but be careful not to destroy meaningful names
        const wordRegex = new RegExp(`\\b${this._escapeRegex(word)}\\b`, 'gi');
        if (wordRegex.test(cleaned)) {
          cleaned = cleaned.replace(wordRegex, ' ').replace(/\s+/g, ' ').trim();
          modifiersRemoved = true;
        }
      }
    }

    // Remove corporate suffixes if present
    let suffixRemoved = false;
    for (const [canonical, variations] of Object.entries(this.companySuffixes)) {
      for (const variation of variations) {
        const suffixRegex = new RegExp(`\\s+${this._escapeRegex(variation)}$`, 'i');
        if (suffixRegex.test(cleaned)) {
          cleaned = cleaned.replace(suffixRegex, '').trim();
          suffixRemoved = true;
          break;
        }
      }
      if (suffixRemoved) break;
    }

    // If we made meaningful changes and result looks reasonable, return the cleaned version
    if ((modifiersRemoved || suffixRemoved) && cleaned.length >= 2 && cleaned.split(' ').length <= 4) {
      return this._createNormalizationResult(
        cleaned,
        original,
        'conservative_cleanup',
        0.70,
        { removed_modifiers: modifiersRemoved, removed_suffix: suffixRemoved }
      );
    }

    // Final fallback - return preprocessed name with reasonable confidence
    // This ensures unknown companies are handled gracefully
    return this._createNormalizationResult(
      preprocessed,
      original,
      'passthrough',
      0.50  // Increased from 0.40 to reduce excessive warnings
    );
  }

  /**
   * Calculate string similarity using multiple algorithms
   */
  _calculateStringSimilarity(str1, str2) {
    if (str1 === str2) return 1.0;
    if (!str1 || !str2) return 0.0;

    // Use multiple similarity algorithms and take the best
    const scores = [
      this._jaccardSimilarity(str1, str2),
      this._levenshteinSimilarity(str1, str2),
      this._longestCommonSubsequence(str1, str2)
    ];

    return Math.max(...scores);
  }

  /**
   * Jaccard similarity for word-based comparison
   */
  _jaccardSimilarity(str1, str2) {
    const set1 = new Set(str1.split(/\s+/));
    const set2 = new Set(str2.split(/\s+/));
    
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Levenshtein distance similarity
   */
  _levenshteinSimilarity(str1, str2) {
    const distance = this._levenshteinDistance(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength > 0 ? 1 - (distance / maxLength) : 1;
  }

  /**
   * Levenshtein distance calculation
   */
  _levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Longest common subsequence similarity
   */
  _longestCommonSubsequence(str1, str2) {
    const lcs = this._lcsLength(str1, str2);
    const maxLength = Math.max(str1.length, str2.length);
    return maxLength > 0 ? lcs / maxLength : 1;
  }

  /**
   * Calculate LCS length
   */
  _lcsLength(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
    
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    return dp[m][n];
  }

  // ========================================================================
  // HELPER METHODS FOR INTELLIGENT NORMALIZATION
  // ========================================================================

  /**
   * Create a standardized normalization result
   */
  _createNormalizationResult(canonical, original, method, confidence, metadata = {}) {
    return {
      canonical: canonical || 'unknown',
      original,
      method,
      confidence: Math.max(0, Math.min(1, confidence)),
      metadata: {
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };
  }

  /**
   * Check if a normalization result is acceptable
   */
  _isAcceptableMatch(result) {
    if (!result || !result.confidence) return false;
    
    // Conservative approach - higher thresholds for uncertain methods
    const methodThresholds = {
      exact_match: 0.0,
      manual_override: 0.0,
      alias_match: 0.0,
      division_match: 0.85,
      acquisition_match: 0.80,
      suffix_normalization: 0.90,
      typo_correction: 0.80,
      fuzzy_canonical: this.matchingThresholds.low_confidence,
      fuzzy_alias: this.matchingThresholds.low_confidence,
      conservative_cleanup: 0.50, // Lower threshold for cleanup results
      passthrough: 0.0  // Always accept passthrough - it's the final fallback
    };

    const threshold = methodThresholds[result.method] || this.matchingThresholds.minimum_acceptable;
    return result.confidence >= threshold;
  }

  /**
   * Escape special regex characters
   */
  _escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Log normalization decisions for review and learning
   */
  _logNormalization(original, canonical, method, confidence, metadata = {}) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      original_name: original,
      canonical_name: canonical,
      normalization_method: method,
      confidence_score: confidence,
      metadata,
      requires_review: confidence < this.matchingThresholds.medium_confidence
    };

    // Add to history
    this.normalizationHistory.push(logEntry);

    // Log for monitoring - be more selective about warnings
    if (confidence < this.matchingThresholds.minimum_acceptable) {
      this.logger.warn('Low confidence normalization', logEntry);
    } else if (method === 'fuzzy_canonical' || method === 'fuzzy_alias' || method === 'typo_correction') {
      this.logger.info('Fuzzy/typo normalization', logEntry);
    } else if (method === 'passthrough' && confidence < 0.6) {
      this.logger.info('Unknown company passed through', logEntry);
    }

    // Keep history manageable (last 1000 entries)
    if (this.normalizationHistory.length > 1000) {
      this.normalizationHistory = this.normalizationHistory.slice(-1000);
    }
  }

  /**
   * Add to learning queue for future improvement
   */
  _addToLearningQueue(original, result) {
    const learningEntry = {
      original_name: original,
      suggested_canonical: result.canonical,
      confidence: result.confidence,
      method: result.method,
      timestamp: new Date().toISOString(),
      status: 'pending_review'
    };

    this.pendingConfirmations.set(original.toLowerCase(), learningEntry);
  }

  // ========================================================================
  // MANUAL OVERRIDE AND CONFIRMATION SYSTEM
  // ========================================================================

  /**
   * Add manual override for company normalization
   */
  addManualOverride(originalName, canonicalName, reason = 'manual_correction') {
    const override = {
      canonical: canonicalName,
      reason,
      date: new Date().toISOString(),
      confidence: 1.0
    };

    this.manualOverrides.set(originalName.toLowerCase(), override);
    
    this.logger.info('Manual override added', {
      original: originalName,
      canonical: canonicalName,
      reason
    });

    return override;
  }

  /**
   * Remove manual override
   */
  removeManualOverride(originalName) {
    const removed = this.manualOverrides.delete(originalName.toLowerCase());
    
    if (removed) {
      this.logger.info('Manual override removed', { original: originalName });
    }
    
    return removed;
  }

  /**
   * Get all manual overrides
   */
  getManualOverrides() {
    return Array.from(this.manualOverrides.entries()).map(([original, override]) => ({
      original,
      ...override
    }));
  }

  /**
   * Get pending confirmations for review
   */
  getPendingConfirmations() {
    return Array.from(this.pendingConfirmations.values());
  }

  /**
   * Confirm a pending normalization (promotes to knowledge base)
   */
  confirmNormalization(originalName, confirmed = true) {
    const pending = this.pendingConfirmations.get(originalName.toLowerCase());
    if (!pending) {
      return false;
    }

    if (confirmed) {
      // Add to manual overrides as confirmed normalization
      this.addManualOverride(
        pending.original_name,
        pending.suggested_canonical,
        'user_confirmed'
      );
    }

    // Remove from pending
    this.pendingConfirmations.delete(originalName.toLowerCase());
    
    this.logger.info('Normalization confirmation processed', {
      original: originalName,
      confirmed,
      canonical: pending.suggested_canonical
    });

    return true;
  }

  /**
   * Bulk confirm multiple normalizations
   */
  bulkConfirmNormalizations(confirmations) {
    const results = [];
    
    for (const { original, confirmed } of confirmations) {
      const result = this.confirmNormalization(original, confirmed);
      results.push({ original, confirmed, success: result });
    }
    
    return results;
  }

  // ========================================================================
  // LEARNING SYSTEM AND CONTINUOUS IMPROVEMENT
  // ========================================================================

  /**
   * Learn from user corrections and improve future normalization
   */
  learnFromCorrection(originalName, correctCanonical, userFeedback = {}) {
    // Add to knowledge base if it's a new pattern
    if (!this.companyKnowledgeBase[correctCanonical.toLowerCase()]) {
      this.companyKnowledgeBase[correctCanonical.toLowerCase()] = {
        canonical: correctCanonical.toLowerCase(),
        aliases: [],
        divisions: [],
        acquisitions: [],
        typos: [],
        confidence: 'learned',
        learned_from: originalName,
        learned_date: new Date().toISOString()
      };
    }

    // Add original as alias if it's significantly different
    const canonical = correctCanonical.toLowerCase();
    const original = originalName.toLowerCase();
    const similarity = this._calculateStringSimilarity(original, canonical);
    
    if (similarity < 0.9) {
      const company = this.companyKnowledgeBase[canonical];
      
      // Determine what type of variation this is
      if (similarity < 0.6) {
        // Likely typo or major variation
        if (!company.aliases.includes(original)) {
          company.aliases.push(original);
        }
      } else if (this._isLikelyTypo(original, canonical)) {
        // Add to typos list
        if (!company.typos.includes(original)) {
          company.typos.push(original);
        }
      } else {
        // Add to aliases
        if (!company.aliases.includes(original)) {
          company.aliases.push(original);
        }
      }
    }

    // Add manual override for immediate effect
    this.addManualOverride(originalName, correctCanonical, 'user_correction');

    this.logger.info('Learning from user correction', {
      original: originalName,
      canonical: correctCanonical,
      similarity,
      feedback: userFeedback
    });

    return true;
  }

  /**
   * Detect if a variation is likely a typo
   */
  _isLikelyTypo(original, canonical) {
    // Simple heuristics for typo detection
    const lengthDiff = Math.abs(original.length - canonical.length);
    const levenshtein = this._levenshteinDistance(original, canonical);
    
    // Single character differences in similar length strings
    return levenshtein <= 2 && lengthDiff <= 1 && 
           this._levenshteinSimilarity(original, canonical) > 0.8;
  }

  /**
   * Generate learning suggestions based on normalization history
   */
  generateLearningSuggestions() {
    const suggestions = [];
    const patterns = new Map();

    // Analyze normalization history for patterns
    for (const entry of this.normalizationHistory) {
      if (entry.confidence < this.matchingThresholds.medium_confidence) {
        const key = `${entry.normalization_method}_${entry.canonical_name}`;
        if (!patterns.has(key)) {
          patterns.set(key, []);
        }
        patterns.get(key).push(entry);
      }
    }

    // Generate suggestions for patterns that occur multiple times
    for (const [key, entries] of patterns.entries()) {
      if (entries.length >= 2) {
        const avgConfidence = entries.reduce((sum, e) => sum + e.confidence_score, 0) / entries.length;
        
        suggestions.push({
          type: 'pattern_recognition',
          canonical: entries[0].canonical_name,
          variations: entries.map(e => e.original_name),
          average_confidence: avgConfidence,
          frequency: entries.length,
          suggestion: avgConfidence > 0.7 ? 'add_to_aliases' : 'requires_manual_review',
          examples: entries.slice(0, 3)
        });
      }
    }

    return suggestions.sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Export normalization data for backup/analysis
   */
  exportNormalizationData() {
    return {
      knowledge_base: this.companyKnowledgeBase,
      manual_overrides: Object.fromEntries(this.manualOverrides),
      normalization_history: this.normalizationHistory.slice(-100), // Last 100 entries
      pending_confirmations: Object.fromEntries(this.pendingConfirmations),
      learning_suggestions: this.generateLearningSuggestions(),
      export_timestamp: new Date().toISOString()
    };
  }

  /**
   * Import normalization data (for initialization or backup restoration)
   */
  importNormalizationData(data) {
    if (data.knowledge_base) {
      // Merge with existing knowledge base
      this.companyKnowledgeBase = { ...this.companyKnowledgeBase, ...data.knowledge_base };
    }

    if (data.manual_overrides) {
      this.manualOverrides = new Map([
        ...this.manualOverrides,
        ...Object.entries(data.manual_overrides)
      ]);
    }

    if (data.normalization_history) {
      this.normalizationHistory.push(...data.normalization_history);
    }

    this.logger.info('Normalization data imported', {
      knowledge_base_entries: Object.keys(data.knowledge_base || {}).length,
      manual_overrides: Object.keys(data.manual_overrides || {}).length,
      history_entries: (data.normalization_history || []).length
    });

    return true;
  }

  // ========================================================================
  // ANALYSIS AND REPORTING METHODS
  // ========================================================================

  /**
   * Get normalization statistics
   */
  getNormalizationStats() {
    const history = this.normalizationHistory;
    const methodCounts = {};
    const confidenceDistribution = { high: 0, medium: 0, low: 0 };

    for (const entry of history) {
      // Method distribution
      methodCounts[entry.normalization_method] = (methodCounts[entry.normalization_method] || 0) + 1;
      
      // Confidence distribution
      if (entry.confidence_score >= this.matchingThresholds.high_confidence) {
        confidenceDistribution.high++;
      } else if (entry.confidence_score >= this.matchingThresholds.medium_confidence) {
        confidenceDistribution.medium++;
      } else {
        confidenceDistribution.low++;
      }
    }

    return {
      total_normalizations: history.length,
      method_distribution: methodCounts,
      confidence_distribution: confidenceDistribution,
      knowledge_base_size: Object.keys(this.companyKnowledgeBase).length,
      manual_overrides_count: this.manualOverrides.size,
      pending_confirmations_count: this.pendingConfirmations.size,
      success_rate: history.length > 0 ? 
        (confidenceDistribution.high + confidenceDistribution.medium) / history.length : 0
    };
  }

  /**
   * Wrapper method for backward compatibility
   * Returns just the canonical name string (old behavior)
   */
  normalizeCompanyNameSimple(name) {
    const result = this.normalizeCompanyName(name);
    return result.canonical;
  }

  /**
   * Calculate career progression patterns within a company
   * @param {Array} positions - Sorted positions within the company
   * @returns {Object} Career progression analysis
   */
  calculateCareerProgression(positions) {
    if (!positions || positions.length <= 1) {
      return {
        pattern: 'single_role',
        progressionScore: 0,
        promotions: [],
        lateralMoves: [],
        insights: []
      };
    }

    const progressions = [];
    const promotions = [];
    const lateralMoves = [];

    for (let i = 1; i < positions.length; i++) {
      const current = positions[i];
      const previous = positions[i - 1];

      const progression = this._analyzeRoleProgression(previous, current);
      progressions.push(progression);

      if (progression.type === 'promotion') {
        promotions.push({
          from: { title: previous.title, date: previous.date_end },
          to: { title: current.title, date: current.date_start },
          indicators: progression.indicators
        });
      } else if (progression.type === 'lateral') {
        lateralMoves.push({
          from: { title: previous.title, date: previous.date_end },
          to: { title: current.title, date: current.date_start },
          indicators: progression.indicators
        });
      }
    }

    const promotionCount = promotions.length;
    const progressionScore = this._calculateProgressionScore(progressions);
    const pattern = this._determineProgressionPattern(progressions, positions.length);

    return {
      pattern,
      progressionScore,
      promotions,
      lateralMoves,
      totalRoleChanges: progressions.length,
      insights: this._generateProgressionInsights(progressions, promotions, lateralMoves)
    };
  }

  /**
   * Detect boomerang employment patterns
   * @param {Array} positions - Sorted positions within the company
   * @returns {Object} Boomerang pattern analysis
   */
  detectBoomerangPattern(positions) {
    if (!positions || positions.length <= 1) {
      return {
        isBoomerang: false,
        stints: 1,
        gaps: [],
        totalGapTime: 0,
        insights: []
      };
    }

    const stints = [];
    let currentStint = [positions[0]];

    for (let i = 1; i < positions.length; i++) {
      const current = positions[i];
      const previous = positions[i - 1];

      const gap = this._calculateDateGap(previous.date_end, current.date_start);
      
      // Consider a gap of more than 30 days as a separate stint
      if (gap > 30) {
        stints.push({
          positions: [...currentStint],
          startDate: currentStint[0].date_start,
          endDate: currentStint[currentStint.length - 1].date_end
        });
        currentStint = [current];
      } else {
        currentStint.push(current);
      }
    }

    // Add the final stint
    if (currentStint.length > 0) {
      stints.push({
        positions: [...currentStint],
        startDate: currentStint[0].date_start,
        endDate: currentStint[currentStint.length - 1].date_end
      });
    }

    const isBoomerang = stints.length > 1;
    const gaps = [];
    let totalGapTime = 0;

    if (isBoomerang) {
      for (let i = 1; i < stints.length; i++) {
        const gapStart = stints[i - 1].endDate;
        const gapEnd = stints[i].startDate;
        const gapDays = this._calculateDateGap(gapStart, gapEnd);
        
        gaps.push({
          start: gapStart,
          end: gapEnd,
          duration: gapDays,
          durationFormatted: this._formatDuration(gapDays)
        });
        
        totalGapTime += gapDays;
      }
    }

    return {
      isBoomerang,
      stints: stints.length,
      stintDetails: stints,
      gaps,
      totalGapTime,
      totalGapTimeFormatted: this._formatDuration(totalGapTime),
      insights: this._generateBoomerangInsights(stints, gaps)
    };
  }

  /**
   * Aggregate unique skills across all positions in a company
   * @param {Array} positions - Positions within the company
   * @returns {Object} Aggregated skills analysis
   */
  aggregateCompanySkills(positions) {
    if (!positions || positions.length === 0) {
      return {
        allSkills: [],
        uniqueSkills: [],
        skillFrequency: {},
        categoryDistribution: {},
        skillEvolution: []
      };
    }

    const allSkills = [];
    const skillFrequency = {};
    const skillsByPosition = [];

    positions.forEach((position, index) => {
      const positionSkills = Array.isArray(position.skills) ? position.skills : [];
      skillsByPosition.push({
        position: position.title,
        date: position.date_start,
        skills: positionSkills
      });

      positionSkills.forEach(skill => {
        if (skill && typeof skill === 'string') {
          const normalizedSkill = skill.trim();
          allSkills.push(normalizedSkill);
          skillFrequency[normalizedSkill] = (skillFrequency[normalizedSkill] || 0) + 1;
        }
      });
    });

    const uniqueSkills = [...new Set(allSkills)];
    const categoryDistribution = this._categorizeSkills(uniqueSkills);
    const skillEvolution = this._analyzeSkillEvolution(skillsByPosition);

    return {
      allSkills,
      uniqueSkills,
      skillCount: uniqueSkills.length,
      skillFrequency,
      categoryDistribution,
      skillEvolution,
      insights: this._generateSkillInsights(uniqueSkills, skillFrequency, skillEvolution)
    };
  }

  // Private helper methods

  _createCompanyGroups(jobs) {
    const groups = new Map();
    const normalizationResults = new Map();

    jobs.forEach(job => {
      // Use the intelligent normalization system
      const normalizationResult = this.normalizeCompanyName(job.org);
      const normalizedName = normalizationResult.canonical;
      
      // Store normalization result for analysis
      normalizationResults.set(job.id || job.org, normalizationResult);
      
      if (!groups.has(normalizedName)) {
        groups.set(normalizedName, {
          normalizedName,
          originalNames: new Set(),
          positions: [],
          normalizationMethods: new Set(),
          confidenceScores: [],
          normalizationResults: []
        });
      }

      const group = groups.get(normalizedName);
      group.originalNames.add(job.org);
      group.positions.push(job);
      group.normalizationMethods.add(normalizationResult.method);
      group.confidenceScores.push(normalizationResult.confidence);
      group.normalizationResults.push(normalizationResult);
    });

    return Array.from(groups.values()).map(group => {
      // Calculate average confidence for the group
      const avgConfidence = group.confidenceScores.length > 0 ?
        group.confidenceScores.reduce((sum, c) => sum + c, 0) / group.confidenceScores.length : 0;

      // Determine if group needs review
      const needsReview = avgConfidence < this.matchingThresholds.medium_confidence ||
                         group.normalizationMethods.has('fuzzy_match') ||
                         group.normalizationMethods.has('typo_correction');

      return {
        ...group,
        originalNames: Array.from(group.originalNames),
        averageConfidence: avgConfidence,
        needsReview,
        primaryNormalizationMethod: this._getPrimaryNormalizationMethod(group.normalizationMethods),
        // Remove internal arrays to clean up the output
        normalizationMethods: undefined,
        confidenceScores: undefined,
        normalizationResults: undefined
      };
    });
  }

  /**
   * Determine the primary normalization method for a group
   */
  _getPrimaryNormalizationMethod(methods) {
    const methodPriority = [
      'exact_match', 'manual_override', 'alias_match',
      'division_match', 'acquisition_match', 'suffix_normalization',
      'typo_correction', 'fuzzy_canonical', 'fuzzy_alias',
      'conservative_cleanup', 'passthrough'
    ];

    for (const method of methodPriority) {
      if (methods.has(method)) {
        return method;
      }
    }

    return 'unknown';
  }

  _sortPositionsByDate(positions) {
    return positions.sort((a, b) => {
      const dateA = new Date(a.date_start || '1900-01-01');
      const dateB = new Date(b.date_start || '1900-01-01');
      return dateA - dateB;
    });
  }

  _analyzeRoleProgression(fromRole, toRole) {
    const indicators = [];
    let type = 'lateral';

    // Check title progression indicators
    const promotionKeywords = ['senior', 'sr', 'lead', 'principal', 'director', 'manager', 'vp', 'vice president', 'chief', 'head'];
    const fromTitle = (fromRole.title || '').toLowerCase();
    const toTitle = (toRole.title || '').toLowerCase();

    let fromLevel = 0;
    let toLevel = 0;

    promotionKeywords.forEach((keyword, index) => {
      if (fromTitle.includes(keyword)) fromLevel = Math.max(fromLevel, index + 1);
      if (toTitle.includes(keyword)) toLevel = Math.max(toLevel, index + 1);
    });

    if (toLevel > fromLevel) {
      type = 'promotion';
      indicators.push('Title level increase detected');
    } else if (toLevel < fromLevel) {
      type = 'demotion';
      indicators.push('Title level decrease detected');
    }

    // Check for specific progression words
    if (toTitle.includes('senior') && !fromTitle.includes('senior')) {
      type = 'promotion';
      indicators.push('Gained "Senior" designation');
    }

    if (toTitle.includes('lead') && !fromTitle.includes('lead')) {
      type = 'promotion';
      indicators.push('Gained "Lead" designation');
    }

    // If still lateral, check for domain changes
    if (type === 'lateral') {
      const fromWords = fromTitle.split(' ');
      const toWords = toTitle.split(' ');
      const commonWords = fromWords.filter(word => toWords.includes(word));
      
      if (commonWords.length < Math.min(fromWords.length, toWords.length) * 0.5) {
        indicators.push('Significant role change - domain shift');
      }
    }

    return { type, indicators, fromLevel, toLevel };
  }

  _calculateProgressionScore(progressions) {
    if (progressions.length === 0) return 0;

    let score = 0;
    progressions.forEach(prog => {
      if (prog.type === 'promotion') score += 2;
      else if (prog.type === 'lateral') score += 1;
      else if (prog.type === 'demotion') score -= 1;
    });

    return Math.max(0, score / progressions.length);
  }

  _determineProgressionPattern(progressions, totalPositions) {
    if (totalPositions === 1) return 'single_role';
    
    const promotions = progressions.filter(p => p.type === 'promotion').length;
    const demotions = progressions.filter(p => p.type === 'demotion').length;
    
    if (promotions >= progressions.length * 0.7) return 'strong_upward';
    if (promotions >= progressions.length * 0.5) return 'upward';
    if (demotions > promotions) return 'downward';
    return 'mixed';
  }

  _calculateDateGap(endDate, startDate) {
    if (!endDate || !startDate) return 0;
    
    const end = new Date(endDate);
    const start = new Date(startDate);
    
    if (isNaN(end.getTime()) || isNaN(start.getTime())) return 0;
    
    const diffTime = start - end;
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
  }

  _calculateTotalTenure(positions) {
    if (!positions || positions.length === 0) return { days: 0, months: 0, years: 0, formatted: '0 days' };

    let totalDays = 0;
    positions.forEach(position => {
      const start = new Date(position.date_start || '1900-01-01');
      const end = new Date(position.date_end || new Date());
      
      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        const diffTime = Math.abs(end - start);
        totalDays += Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }
    });

    const years = Math.floor(totalDays / 365);
    const months = Math.floor((totalDays % 365) / 30);
    const days = totalDays % 30;

    return {
      days: totalDays,
      months: Math.floor(totalDays / 30),
      years,
      formatted: this._formatDuration(totalDays)
    };
  }

  _formatDuration(days) {
    if (days === 0) return '0 days';
    
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainingDays = days % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} year${years !== 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months !== 1 ? 's' : ''}`);
    if (remainingDays > 0 && parts.length === 0) parts.push(`${remainingDays} day${remainingDays !== 1 ? 's' : ''}`);

    return parts.join(' ') || '0 days';
  }

  _getCompanyDateRange(positions) {
    if (!positions || positions.length === 0) return null;

    const startDates = positions.map(p => p.date_start).filter(Boolean);
    const endDates = positions.map(p => p.date_end).filter(Boolean);

    const earliest = startDates.length > 0 ? 
      startDates.reduce((min, date) => date < min ? date : min) : null;
    
    const latest = endDates.length > 0 ? 
      endDates.reduce((max, date) => date > max ? date : max) : null;

    return {
      start: earliest,
      end: latest,
      formatted: `${earliest || 'Unknown'} - ${latest || 'Present'}`
    };
  }

  _getLatestDate(positions) {
    const dates = positions.map(p => p.date_end || p.date_start).filter(Boolean);
    return dates.length > 0 ? dates.reduce((max, date) => date > max ? date : max) : null;
  }

  _categorizeSkills(skills) {
    const categories = {
      'Programming Languages': ['javascript', 'python', 'java', 'c#', 'c++', 'ruby', 'php', 'swift', 'kotlin'],
      'Frameworks & Libraries': ['react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring'],
      'Databases': ['mysql', 'postgresql', 'mongodb', 'redis', 'oracle', 'sql server', 'sqlite'],
      'Cloud & DevOps': ['aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'terraform', 'ansible'],
      'Project Management': ['agile', 'scrum', 'kanban', 'pmp', 'jira', 'confluence', 'project management'],
      'Leadership': ['team leadership', 'management', 'mentoring', 'strategic planning', 'stakeholder management']
    };

    const distribution = {};
    const uncategorized = [];

    skills.forEach(skill => {
      const normalizedSkill = skill.toLowerCase();
      let categorized = false;

      for (const [category, keywords] of Object.entries(categories)) {
        if (keywords.some(keyword => normalizedSkill.includes(keyword))) {
          distribution[category] = (distribution[category] || 0) + 1;
          categorized = true;
          break;
        }
      }

      if (!categorized) {
        uncategorized.push(skill);
      }
    });

    if (uncategorized.length > 0) {
      distribution['Other'] = uncategorized.length;
    }

    return distribution;
  }

  _analyzeSkillEvolution(skillsByPosition) {
    if (skillsByPosition.length <= 1) return [];

    const evolution = [];
    for (let i = 1; i < skillsByPosition.length; i++) {
      const current = skillsByPosition[i];
      const previous = skillsByPosition[i - 1];

      const previousSkills = new Set(previous.skills);
      const currentSkills = new Set(current.skills);

      const added = [...currentSkills].filter(skill => !previousSkills.has(skill));
      const removed = [...previousSkills].filter(skill => !currentSkills.has(skill));
      const retained = [...currentSkills].filter(skill => previousSkills.has(skill));

      evolution.push({
        fromPosition: previous.position,
        toPosition: current.position,
        date: current.date,
        added,
        removed,
        retained,
        addedCount: added.length,
        removedCount: removed.length,
        retainedCount: retained.length
      });
    }

    return evolution;
  }

  _generateCompanyInsights(positions, careerProgression, boomerangPattern) {
    const insights = [];

    if (positions.length > 1) {
      insights.push(`Held ${positions.length} different positions at this company`);
    }

    if (careerProgression.promotions.length > 0) {
      insights.push(`${careerProgression.promotions.length} promotion${careerProgression.promotions.length > 1 ? 's' : ''} identified`);
    }

    if (boomerangPattern.isBoomerang) {
      insights.push(`Boomerang employee: ${boomerangPattern.stints} separate employment periods`);
    }

    if (careerProgression.pattern === 'strong_upward') {
      insights.push('Strong upward career trajectory');
    } else if (careerProgression.pattern === 'upward') {
      insights.push('Generally upward career progression');
    }

    return insights;
  }

  _generateProgressionInsights(progressions, promotions, lateralMoves) {
    const insights = [];

    if (promotions.length > 0) {
      insights.push(`Career advancement: ${promotions.length} promotion${promotions.length > 1 ? 's' : ''}`);
    }

    if (lateralMoves.length > 0) {
      insights.push(`${lateralMoves.length} lateral move${lateralMoves.length > 1 ? 's' : ''} (skill diversification)`);
    }

    const avgProgression = progressions.reduce((sum, p) => sum + (p.type === 'promotion' ? 1 : 0), 0);
    if (avgProgression / progressions.length > 0.5) {
      insights.push('Strong promotion rate within company');
    }

    return insights;
  }

  _generateBoomerangInsights(stints, gaps) {
    const insights = [];

    if (stints.length > 1) {
      insights.push(`${stints.length} separate employment periods`);
      
      if (gaps.length > 0) {
        const avgGap = gaps.reduce((sum, gap) => sum + gap.duration, 0) / gaps.length;
        if (avgGap < 365) {
          insights.push('Short gaps between employment periods');
        } else {
          insights.push('Extended breaks between employment periods');
        }
      }

      insights.push('Demonstrates company loyalty and mutual value');
    }

    return insights;
  }

  _generateSkillInsights(uniqueSkills, skillFrequency, skillEvolution) {
    const insights = [];

    insights.push(`${uniqueSkills.length} unique skills across all positions`);

    const mostFrequentSkills = Object.entries(skillFrequency)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([skill]) => skill);

    if (mostFrequentSkills.length > 0) {
      insights.push(`Core skills: ${mostFrequentSkills.join(', ')}`);
    }

    if (skillEvolution.length > 0) {
      const totalAdded = skillEvolution.reduce((sum, evo) => sum + evo.addedCount, 0);
      if (totalAdded > 0) {
        insights.push(`${totalAdded} new skills acquired during tenure`);
      }
    }

    return insights;
  }
}

export default CompanyGroupingService;