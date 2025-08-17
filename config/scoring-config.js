/**
 * ScottGPT Relevance Scoring Configuration
 * =======================================
 * 
 * This module provides transparent, configurable relevance scoring for search results.
 * It replaces artificial score manipulations with documented, tunable algorithms.
 */

/**
 * Default scoring configuration
 * All weights are normalized to sum to 1.0 for transparency
 */
export const DEFAULT_SCORING_CONFIG = {
  // Semantic search scoring weights
  semantic: {
    similarity: 0.75,      // Primary factor: how semantically similar is the content
    recency: 0.15,         // Secondary: how recent is the information
    metadata_match: 0.10,  // Tertiary: skills/tags alignment
    
    // Recency decay configuration
    recency_decay: {
      max_years: 2,        // Content older than this gets minimum recency score
      decay_function: 'linear' // 'linear', 'exponential', or 'step'
    },
    
    // Metadata matching configuration
    metadata: {
      skill_boost_per_match: 0.02,    // Boost per matching skill (max 0.10)
      tag_boost_per_match: 0.02,      // Boost per matching tag (max 0.10)
      max_total_boost: 0.10           // Cap total metadata boost
    }
  },
  
  // Text search scoring (when semantic search fails)
  text: {
    base_relevance: 0.40,   // Base relevance for text matches (conservative)
    keyword_match: 0.30,    // Boost for direct keyword matches
    phrase_match: 0.20,     // Boost for phrase matches
    recency: 0.10,          // Lower weight on recency for text search
    
    // Text matching configuration
    matching: {
      exact_match_boost: 0.20,     // Boost for exact phrase matches
      partial_match_boost: 0.10,   // Boost for partial matches
      title_match_multiplier: 1.5, // Extra weight for matches in title
      case_sensitive: false        // Whether matching is case sensitive
    }
  },
  
  // Thresholds for filtering results
  thresholds: {
    semantic: {
      minimum_similarity: 0.25,     // Minimum cosine similarity to include result
      good_similarity: 0.70,        // Threshold for "high confidence" results
      excellent_similarity: 0.85    // Threshold for "excellent" results
    },
    
    text: {
      minimum_relevance: 0.30,      // Minimum relevance for text search results
      good_relevance: 0.60,         // Good text search relevance
      excellent_relevance: 0.80     // Excellent text search relevance
    }
  },
  
  // Quality indicators for debugging and optimization
  quality_bands: {
    excellent: { min: 0.85, label: 'Excellent match' },
    good: { min: 0.70, label: 'Good match' },
    fair: { min: 0.50, label: 'Fair match' },
    poor: { min: 0.25, label: 'Poor match' }
  },
  
  // Logging configuration
  logging: {
    enabled: true,
    log_score_breakdown: true,      // Log how each score is calculated
    log_threshold_decisions: true,  // Log why results are included/excluded
    max_logged_results: 5          // Maximum results to log detailed scoring for
  }
};

/**
 * Calculates relevance score for semantic search results
 * @param {Object} chunk - Content chunk with similarity and metadata
 * @param {Object} searchContext - Search context and filters
 * @param {Object} config - Scoring configuration (defaults to DEFAULT_SCORING_CONFIG.semantic)
 * @returns {Object} - Detailed scoring breakdown
 */
export function calculateSemanticScore(chunk, searchContext = {}, config = DEFAULT_SCORING_CONFIG.semantic) {
  const { skills = [], tags = [] } = searchContext;
  
  // 1. Base similarity score (from cosine similarity)
  const baseSimilarity = chunk.similarity || 0;
  
  // 2. Calculate recency score
  const recencyScore = calculateRecencyScore(chunk, config.recency_decay);
  
  // 3. Calculate metadata match score
  const metadataScore = calculateMetadataScore(chunk, { skills, tags }, config.metadata);
  
  // 4. Combine scores using configured weights
  const weightedSimilarity = baseSimilarity * config.similarity;
  const weightedRecency = recencyScore * config.recency;
  const weightedMetadata = metadataScore * config.metadata_match;
  
  const finalScore = weightedSimilarity + weightedRecency + weightedMetadata;
  
  // 5. Determine quality band
  const qualityBand = determineQualityBand(finalScore, DEFAULT_SCORING_CONFIG.quality_bands);
  
  return {
    final_score: finalScore,
    components: {
      similarity: { raw: baseSimilarity, weighted: weightedSimilarity, weight: config.similarity },
      recency: { raw: recencyScore, weighted: weightedRecency, weight: config.recency },
      metadata: { raw: metadataScore, weighted: weightedMetadata, weight: config.metadata_match }
    },
    quality_band: qualityBand,
    search_method: 'semantic',
    meets_threshold: finalScore >= DEFAULT_SCORING_CONFIG.thresholds.semantic.minimum_similarity
  };
}

/**
 * Calculates relevance score for text search results
 * @param {Object} chunk - Content chunk from text search
 * @param {Object} searchContext - Search context (query, filters)
 * @param {Object} config - Scoring configuration (defaults to DEFAULT_SCORING_CONFIG.text)
 * @returns {Object} - Detailed scoring breakdown
 */
export function calculateTextScore(chunk, searchContext = {}, config = DEFAULT_SCORING_CONFIG.text) {
  const { query = '', skills = [], tags = [] } = searchContext;
  
  // 1. Base relevance (conservative for text search)
  const baseRelevance = config.base_relevance;
  
  // 2. Calculate keyword/phrase matching scores
  const matchingScore = calculateTextMatchingScore(chunk, query, config.matching);
  
  // 3. Calculate recency score (lower weight than semantic)
  const recencyScore = calculateRecencyScore(chunk, DEFAULT_SCORING_CONFIG.semantic.recency_decay);
  
  // 4. Combine scores
  const weightedBase = baseRelevance * 1.0; // Base weight is implicit
  const weightedMatching = matchingScore * (config.keyword_match + config.phrase_match);
  const weightedRecency = recencyScore * config.recency;
  
  const finalScore = weightedBase + weightedMatching + weightedRecency;
  
  // 5. Determine quality band
  const qualityBand = determineQualityBand(finalScore, DEFAULT_SCORING_CONFIG.quality_bands);
  
  return {
    final_score: Math.min(finalScore, 1.0), // Cap at 1.0
    components: {
      base_relevance: { raw: baseRelevance, weighted: weightedBase, weight: 1.0 },
      text_matching: { raw: matchingScore, weighted: weightedMatching, weight: config.keyword_match + config.phrase_match },
      recency: { raw: recencyScore, weighted: weightedRecency, weight: config.recency }
    },
    quality_band: qualityBand,
    search_method: 'text',
    meets_threshold: finalScore >= DEFAULT_SCORING_CONFIG.thresholds.text.minimum_relevance
  };
}

/**
 * Calculate recency score based on content age
 * @param {Object} chunk - Content chunk with date information
 * @param {Object} config - Recency decay configuration
 * @returns {number} - Recency score between 0 and 1
 */
function calculateRecencyScore(chunk, config) {
  if (!chunk.date_end) {
    return 0.5; // Neutral score for undated content
  }
  
  const endDate = new Date(chunk.date_end);
  const now = new Date();
  const ageInYears = (now - endDate) / (365 * 24 * 60 * 60 * 1000);
  
  if (ageInYears <= 0) {
    return 1.0; // Future or current content gets max score
  }
  
  if (ageInYears >= config.max_years) {
    return 0.1; // Very old content gets minimum score
  }
  
  switch (config.decay_function) {
    case 'exponential':
      return Math.exp(-ageInYears / config.max_years);
    
    case 'step':
      return ageInYears <= 1 ? 1.0 : (ageInYears <= 2 ? 0.7 : 0.3);
    
    case 'linear':
    default:
      return Math.max(0.1, 1.0 - (ageInYears / config.max_years));
  }
}

/**
 * Calculate metadata matching score
 * @param {Object} chunk - Content chunk with skills/tags
 * @param {Object} filters - Search filters
 * @param {Object} config - Metadata scoring configuration
 * @returns {number} - Metadata score between 0 and config.max_total_boost
 */
function calculateMetadataScore(chunk, filters, config) {
  let totalBoost = 0;
  
  // Skills matching
  if (filters.skills.length > 0 && chunk.skills) {
    const matchingSkills = filters.skills.filter(skill => 
      chunk.skills.some(chunkSkill => 
        chunkSkill.toLowerCase().includes(skill.toLowerCase())
      )
    ).length;
    totalBoost += Math.min(matchingSkills * config.skill_boost_per_match, config.max_total_boost / 2);
  }
  
  // Tags matching
  if (filters.tags.length > 0 && chunk.tags) {
    const matchingTags = filters.tags.filter(tag => 
      chunk.tags.some(chunkTag => 
        chunkTag.toLowerCase().includes(tag.toLowerCase())
      )
    ).length;
    totalBoost += Math.min(matchingTags * config.tag_boost_per_match, config.max_total_boost / 2);
  }
  
  return Math.min(totalBoost, config.max_total_boost);
}

/**
 * Calculate text matching score based on keyword/phrase matches
 * @param {Object} chunk - Content chunk
 * @param {string} query - Search query
 * @param {Object} config - Text matching configuration
 * @returns {number} - Matching score between 0 and 1
 */
function calculateTextMatchingScore(chunk, query, config) {
  if (!query || !chunk.content) {
    return 0;
  }
  
  const queryLower = config.case_sensitive ? query : query.toLowerCase();
  const contentLower = config.case_sensitive ? chunk.content : chunk.content.toLowerCase();
  const titleLower = config.case_sensitive ? (chunk.title || '') : (chunk.title || '').toLowerCase();
  
  let score = 0;
  
  // Exact phrase match
  if (contentLower.includes(queryLower)) {
    score += config.exact_match_boost;
  }
  
  // Title match (extra weight)
  if (titleLower.includes(queryLower)) {
    score += config.exact_match_boost * config.title_match_multiplier;
  }
  
  // Individual keyword matches
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  const matchingWords = queryWords.filter(word => contentLower.includes(word)).length;
  
  if (queryWords.length > 0) {
    const wordMatchRatio = matchingWords / queryWords.length;
    score += wordMatchRatio * config.partial_match_boost;
  }
  
  return Math.min(score, 1.0);
}

/**
 * Determine quality band for a score
 * @param {number} score - Final relevance score
 * @param {Object} bands - Quality band configuration
 * @returns {Object} - Quality band information
 */
function determineQualityBand(score, bands) {
  if (score >= bands.excellent.min) return bands.excellent;
  if (score >= bands.good.min) return bands.good;
  if (score >= bands.fair.min) return bands.fair;
  return bands.poor;
}

/**
 * Log detailed scoring breakdown for debugging
 * @param {Array} results - Scored results
 * @param {Object} config - Logging configuration
 */
export function logScoringBreakdown(results, config = DEFAULT_SCORING_CONFIG.logging) {
  if (!config.enabled || !config.log_score_breakdown) {
    return;
  }
  
  const resultsToLog = results.slice(0, config.max_logged_results);
  
  console.log('\\n📊 Scoring Breakdown:');
  console.log('===================');
  
  resultsToLog.forEach((result, index) => {
    const score = result.scoring || {};
    console.log(`\\n${index + 1}. ${result.title?.substring(0, 50)}...`);
    console.log(`   Final Score: ${score.final_score?.toFixed(3) || 'N/A'} (${score.quality_band?.label || 'Unknown'})`);
    console.log(`   Method: ${score.search_method || 'Unknown'}`);
    
    if (score.components) {
      Object.entries(score.components).forEach(([component, data]) => {
        console.log(`   - ${component}: ${data.raw?.toFixed(3)} × ${data.weight} = ${data.weighted?.toFixed(3)}`);
      });
    }
    
    console.log(`   Meets Threshold: ${score.meets_threshold ? '✅' : '❌'}`);
  });
  
  console.log('\\n');
}

/**
 * Create a custom scoring configuration by merging with defaults
 * @param {Object} customConfig - Custom configuration overrides
 * @returns {Object} - Merged configuration
 */
export function createScoringConfig(customConfig = {}) {
  return {
    ...DEFAULT_SCORING_CONFIG,
    semantic: { ...DEFAULT_SCORING_CONFIG.semantic, ...customConfig.semantic },
    text: { ...DEFAULT_SCORING_CONFIG.text, ...customConfig.text },
    thresholds: { ...DEFAULT_SCORING_CONFIG.thresholds, ...customConfig.thresholds },
    quality_bands: { ...DEFAULT_SCORING_CONFIG.quality_bands, ...customConfig.quality_bands },
    logging: { ...DEFAULT_SCORING_CONFIG.logging, ...customConfig.logging }
  };
}