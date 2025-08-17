import { CohereClient } from 'cohere-ai';
import CONFIG from '../config/app-config.js';

class EmbeddingService {
  constructor() {
    // Configuration validation handled by centralized config
    this.cohere = new CohereClient({ token: CONFIG.ai.cohere.apiKey });
    this.model = CONFIG.ai.cohere.model;
    this.config = CONFIG.ai.cohere;
  }

  /**
   * Generate embedding for a single text
   * @param {string} text - Text to embed
   * @param {string} inputType - 'search_query' or 'search_document'
   * @returns {Promise<number[]>} - Embedding vector
   */
  async embedText(text, inputType = null) {
    try {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('Text input is required and must be a non-empty string');
      }

      const response = await this.cohere.embed({
        texts: [text.trim()],
        model: this.model,
        inputType: inputType || this.config.inputType.query
      });

      if (!response.embeddings || response.embeddings.length === 0) {
        throw new Error('No embeddings returned from Cohere API');
      }

      return response.embeddings[0];
    } catch (error) {
      console.error('Embedding generation error:', error);
      
      // Handle specific Cohere API errors
      if (error.statusCode === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      } else if (error.statusCode === 401) {
        throw new Error('Invalid Cohere API key');
      } else if (error.statusCode >= 500) {
        throw new Error('Cohere API service unavailable');
      }
      
      throw new Error(`Embedding failed: ${error.message}`);
    }
  }

  /**
   * Generate embeddings for multiple texts (batch processing)
   * @param {string[]} texts - Array of texts to embed
   * @param {string} inputType - 'search_query' or 'search_document'
   * @returns {Promise<number[][]>} - Array of embedding vectors
   */
  async embedTexts(texts, inputType = null) {
    try {
      if (!Array.isArray(texts) || texts.length === 0) {
        throw new Error('Texts input must be a non-empty array');
      }

      // Filter out empty texts
      const validTexts = texts.filter(text => 
        text && typeof text === 'string' && text.trim().length > 0
      ).map(text => text.trim());

      if (validTexts.length === 0) {
        throw new Error('No valid texts provided for embedding');
      }

      // Cohere API has limits on batch size, so we'll process in chunks if needed
      const batchSize = this.config.batchSize;
      const allEmbeddings = [];

      for (let i = 0; i < validTexts.length; i += batchSize) {
        const batch = validTexts.slice(i, i + batchSize);
        
        const response = await this.cohere.embed({
          texts: batch,
          model: this.model,
          inputType: inputType || this.config.inputType.document
        });

        if (!response.embeddings) {
          throw new Error(`No embeddings returned for batch starting at index ${i}`);
        }

        allEmbeddings.push(...response.embeddings);

        // Rate limiting between batches
        if (i + batchSize < validTexts.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      return allEmbeddings;
    } catch (error) {
      console.error('Batch embedding generation error:', error);
      throw new Error(`Batch embedding failed: ${error.message}`);
    }
  }

  /**
   * Expand query with synonyms and related terms
   * @param {string} query - Original query
   * @returns {Promise<string>} - Expanded query
   */
  async expandQuery(query) {
    try {
      // Load synonyms from database
      const { db } = await import('../config/database.js');
      const words = query.toLowerCase().split(/\s+/);
      const expandedTerms = new Set([query]);
      
      for (const word of words) {
        const synonyms = await db.getSynonyms(word);
        synonyms.forEach(synonym => {
          if (synonym.toLowerCase() !== word) {
            expandedTerms.add(synonym);
          }
        });
      }

      // Create expanded query by combining original with key synonyms
      const expanded = Array.from(expandedTerms).join(' ');
      return expanded;
    } catch (error) {
      console.error('Query expansion error:', error);
      // If expansion fails, return original query
      return query;
    }
  }

  /**
   * Extract filters from query using simple keyword matching
   * @param {string} query - User query
   * @returns {Object} - Extracted filters
   */
  extractFilters(query) {
    const filters = {
      skills: [],
      tags: [],
      industries: [],
      dateAfter: null
    };

    const queryLower = query.toLowerCase();

    // IoT-specific filtering
    if (queryLower.includes('iot') || queryLower.includes('internet of things') || queryLower.includes('connected devices')) {
      filters.tags.push('IoT');
      filters.skills.push('IoT', 'Internet of Things');
    }

    // OLDP and leadership program specific filtering
    if (queryLower.includes('oldp') || queryLower.includes('operations leadership development') || queryLower.includes('leadership development program')) {
      filters.skills.push('Team Leadership', 'Strategic Planning', 'Program Management');
      filters.tags.push('Government', 'Regulated Industries');
    }

    // Company-specific filtering
    if (queryLower.includes('coca-cola') || queryLower.includes('coca cola') || queryLower.includes('coke')) {
      filters.tags.push('IoT', 'Digital Transformation'); // Coca-Cola had IoT projects
    }

    // Industry/domain keywords
    const industryMap = {
      'healthcare': ['Healthcare'],
      'health': ['Healthcare'], 
      'medical': ['Healthcare'],
      'government': ['Government'],
      'gov': ['Government'],
      'federal': ['Government'],
      'public sector': ['Government'],
      'cybersecurity': ['Cybersecurity'],
      'security': ['Cybersecurity'],
      'ai': ['AI/ML'],
      'artificial intelligence': ['AI/ML'],
      'machine learning': ['AI/ML'],
      'ml': ['AI/ML']
    };

    // Tag keywords
    const tagMap = {
      'leadership': ['Technical Leadership'],
      'management': ['Technical Leadership'],
      'project': ['Technical Leadership'],
      'platform': ['Platform Development'],
      'product': ['AI Product'],
      'startup': ['AI Product']
    };

    // Skill keywords
    const skillMap = {
      'rag': ['RAG'],
      'retrieval': ['RAG'],
      'vector': ['Vector Database'],
      'embedding': ['Vector Database'],
      'program management': ['Program Management'],
      'pm': ['Program Management'],
      'pmo': ['Program Management']
    };

    // Extract industries
    Object.entries(industryMap).forEach(([keyword, industries]) => {
      if (queryLower.includes(keyword)) {
        filters.industries.push(...industries);
      }
    });

    // Extract tags
    Object.entries(tagMap).forEach(([keyword, tags]) => {
      if (queryLower.includes(keyword)) {
        filters.tags.push(...tags);
      }
    });

    // Extract skills
    Object.entries(skillMap).forEach(([keyword, skills]) => {
      if (queryLower.includes(keyword)) {
        filters.skills.push(...skills);
      }
    });

    // Extract time filters
    const timePatterns = [
      { pattern: /recent|current|latest|now/i, months: 24 },
      { pattern: /past year|last year/i, months: 12 },
      { pattern: /past.{0,5}years?/i, months: 36 }
    ];

    for (const { pattern, months } of timePatterns) {
      if (pattern.test(query)) {
        const date = new Date();
        date.setMonth(date.getMonth() - months);
        filters.dateAfter = date.toISOString().split('T')[0];
        break;
      }
    }

    return filters;
  }

  /**
   * Calculate similarity threshold based on query type
   * @param {string} query - User query
   * @returns {number} - Similarity threshold
   */
  calculateSimilarityThreshold(query) {
    const queryLength = query.split(/\s+/).length;
    const queryLower = query.toLowerCase();
    let threshold;
    let queryType;
    
    // Special handling for IoT queries - lowered threshold for better recall
    if (queryLower.includes('iot') || queryLower.includes('internet of things') || queryLower.includes('connected devices')) {
      threshold = 0.25;
      queryType = 'IoT';
    }
    // Special handling for OLDP and leadership queries
    else if (queryLower.includes('oldp') || queryLower.includes('operations leadership') || queryLower.includes('leadership development')) {
      threshold = 0.25;
      queryType = 'OLDP/Leadership';
    }
    // Special handling for common resume queries
    else {
      const resumeQueries = [
        'job', 'work', 'position', 'role', 'employment', 'career',
        'experience', 'background', 'history', 'resume', 'cv'
      ];
      
      const isResumeQuery = resumeQueries.some(term => queryLower.includes(term));
      
      if (isResumeQuery) {
        if (queryLength >= 8) {
          threshold = 0.35;
          queryType = 'Resume (very specific)';
        } else if (queryLength >= 5) {
          threshold = 0.30;
          queryType = 'Resume (moderately specific)';
        } else if (queryLength >= 3) {
          threshold = 0.25;
          queryType = 'Resume (somewhat specific)';
        } else {
          threshold = 0.25;
          queryType = 'Resume (general)';
        }
      } else {
        // Standard thresholds for other queries - lowered for better recall
        if (queryLength >= 8) {
          threshold = 0.35;
          queryType = 'General (very specific)';
        } else if (queryLength >= 5) {
          threshold = 0.30;
          queryType = 'General (moderately specific)';
        } else if (queryLength >= 3) {
          threshold = 0.25;
          queryType = 'General (somewhat specific)';
        } else {
          threshold = 0.20;
          queryType = 'General (basic)';
        }
      }
    }
    
    console.log(`🎯 Using similarity threshold: ${threshold} for query: "${query.substring(0, 50)}..."`);
    return threshold;
  }
}

export default EmbeddingService;