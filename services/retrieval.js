import { db } from '../config/database.js';
import EmbeddingService from './embeddings.js';
import { 
  calculateTextScore, 
  logScoringBreakdown,
  DEFAULT_SCORING_CONFIG 
} from '../config/scoring-config.js';
import { 
  retryOperation, 
  circuitBreakers, 
  handleError, 
  ProcessingError,
  DatabaseError,
  RecoveryStrategies 
} from '../utils/error-handling.js';

class RetrievalService {
  constructor() {
    this.embeddings = new EmbeddingService();
  }

  /**
   * Retrieve relevant context chunks for a query
   * @param {string} query - User query
   * @param {Object} options - Search options
   * @returns {Promise<Object>} - Retrieved chunks with metadata
   */
  async retrieveContext(query, options = {}) {
    try {
      const {
        maxResults = 12,
        minSimilarity = null,
        includeMetadata = true,
        rerankResults = true,
        userFilter = null
      } = options;

      console.log(`🔍 Retrieving context for: "${query}"`);
      
      // Step 1: Expand query with synonyms (with fallback)
      let expandedQuery;
      try {
        expandedQuery = await this.embeddings.expandQuery(query);
        console.log(`📝 Expanded query: "${expandedQuery}"`);
      } catch (error) {
        console.log(`⚠️  Query expansion failed, using original query: ${error.message}`);
        expandedQuery = query;
      }

      // Step 2: Generate query embedding
      const queryEmbedding = await this.embeddings.embedText(expandedQuery, 'search_query');
      console.log(`🎯 Generated embedding (${queryEmbedding?.length || 'failed'} dimensions)`);

      // Step 3: Extract filters from query
      const filters = this.embeddings.extractFilters(query);
      console.log('🏷️  Extracted filters:', filters);

      // Step 4: Calculate dynamic similarity threshold
      const similarityThreshold = minSimilarity || this.embeddings.calculateSimilarityThreshold(query);
      console.log(`📊 Similarity threshold: ${similarityThreshold}`);

      // Step 5: Search database using semantic search (primary method) with retry logic
      let searchResults = await circuitBreakers.supabase.execute(async () => {
        return await retryOperation(
          async () => await db.searchChunks(queryEmbedding, {
            skills: filters.skills,
            tags: filters.tags,
            threshold: similarityThreshold,
            limit: Math.max(maxResults * 2, 20), // Get more results for reranking
            dateRange: filters.dateAfter ? { start: filters.dateAfter, end: null } : null,
            userFilter: userFilter
          }),
          { 
            service: 'retrieval', 
            operation: 'semantic_search',
            query: query.substring(0, 50) // First 50 chars for context
          }
        );
      });

      console.log(`💾 Semantic search returned ${searchResults.length} chunks`);

      // Step 5b: Only use text search as a true fallback when semantic search returns NO results
      // This ensures we always prioritize semantic understanding over keyword matching
      if (searchResults.length === 0) {
        console.log('🔄 No semantic results found, trying text search as fallback...');
        const textSearchResults = await this.performTextSearch(query, filters, maxResults, userFilter);
        if (textSearchResults.length > 0) {
          console.log(`📝 Text search found ${textSearchResults.length} results as fallback`);
          searchResults = textSearchResults; // Replace empty semantic results with text results
        }
      }
      
      // Step 5c: Validate and clean all results
      searchResults = this.validateSearchResults(searchResults);
      
      if (searchResults.length > 0) {
        const avgSimilarity = searchResults.reduce((sum, r) => sum + r.similarity, 0) / searchResults.length;
        const searchMethod = searchResults[0].search_method || 'semantic';
        console.log(`📊 Using ${searchMethod} search: ${searchResults.length} results, avg similarity: ${avgSimilarity.toFixed(3)}`);
      }

      if (searchResults.length === 0) {
        return {
          chunks: [],
          totalFound: 0,
          query: query,
          expandedQuery: expandedQuery,
          filters: filters,
          similarityThreshold,
          message: 'No relevant information found. This could mean:\\n\\n• The information hasn\'t been indexed yet\\n• Try rephrasing your question or using different keywords\\n• The topic might be outside of Scott\'s documented experience\\n\\nSuggestions:\\n• Ask about specific companies (e.g., \"Coca-Cola\", \"Lockheed Martin\")\\n• Try broader terms (e.g., \"leadership\" instead of \"team management\")\\n• Ask about general topics (e.g., \"cybersecurity\", \"AI projects\")'
        };
      }

      // Step 6: Rerank and enhance results
      let processedChunks = searchResults;

      if (rerankResults) {
        processedChunks = this.rerankChunks(searchResults, query, filters);
        console.log(`📈 Reranked ${processedChunks.length} chunks`);
      }

      // Step 7: Limit to final results
      processedChunks = processedChunks.slice(0, maxResults);

      // Step 8: Add metadata and group by source
      const enrichedChunks = await this.enrichChunks(processedChunks, includeMetadata);

      // Step 9: Generate context summary
      const contextSummary = this.generateContextSummary(enrichedChunks, query);

      return {
        chunks: enrichedChunks,
        totalFound: searchResults.length,
        query: query,
        expandedQuery: expandedQuery,
        filters: filters,
        similarityThreshold,
        contextSummary,
        avgSimilarity: this.calculateAverageSimilarity(enrichedChunks),
        sources: this.extractUniqueSources(enrichedChunks)
      };

    } catch (error) {
      const handledError = handleError(error, {
        service: 'retrieval',
        operation: 'retrieveContext',
        query: query.substring(0, 100) // First 100 chars for context
      });
      
      // Provide user-friendly error messages based on error type
      if (handledError.name === 'DatabaseError') {
        throw new ProcessingError(
          'Search service temporarily unavailable. Please try again in a moment.',
          'retrieveContext',
          { userFriendly: true }
        );
      } else if (handledError.name === 'NetworkError') {
        throw new ProcessingError(
          'Network connectivity issue. Please check your connection and try again.',
          'retrieveContext',
          { userFriendly: true }
        );
      } else {
        throw new ProcessingError(
          `Failed to retrieve context: ${handledError.message}`,
          'retrieveContext',
          { userFriendly: true, originalError: handledError }
        );
      }
    }
  }

  /**
   * Rerank chunks using transparent scoring algorithm
   * @param {Array} chunks - Raw search results  
   * @param {string} query - Original query
   * @param {Object} filters - Extracted filters
   * @returns {Array} - Reranked chunks with proper scoring
   */
  rerankChunks(chunks, query, filters) {
    console.log('🔄 Reranking chunks with transparent scoring algorithm...');
    
    const searchContext = { 
      query, 
      skills: filters.skills || [], 
      tags: filters.tags || [] 
    };
    
    const rankedChunks = chunks.map(chunk => {
      // Use proper scoring based on search method
      let scoring;
      
      if (chunk.search_method === 'text') {
        // For text search results, recalculate with query context
        scoring = calculateTextScore(chunk, searchContext);
      } else {
        // For semantic search results, use existing scoring or recalculate if needed
        if (chunk.scoring) {
          scoring = chunk.scoring; // Use existing scoring from database query
        } else {
          // Fallback: create basic semantic scoring
          scoring = {
            final_score: chunk.similarity || chunk.combined_score || 0,
            components: {
              similarity: { raw: chunk.similarity || 0, weighted: chunk.similarity || 0, weight: 1.0 },
              recency: { raw: chunk.recency_score || 0.5, weighted: 0, weight: 0 },
              metadata: { raw: 0, weighted: 0, weight: 0 }
            },
            quality_band: { label: 'Legacy scoring' },
            search_method: 'semantic',
            meets_threshold: true
          };
        }
      }
      
      return { 
        ...chunk, 
        rerank_score: scoring.final_score,
        scoring: scoring // Ensure scoring is available for logging
      };
    })
    .sort((a, b) => b.rerank_score - a.rerank_score);
    
    // Log scoring breakdown for top results
    logScoringBreakdown(rankedChunks);
    
    return rankedChunks;
  }

  /**
   * Enrich chunks with additional metadata
   * @param {Array} chunks - Processed chunks
   * @param {boolean} includeMetadata - Whether to include metadata
   * @returns {Promise<Array>} - Enriched chunks
   */
  async enrichChunks(chunks, includeMetadata) {
    if (!includeMetadata) {
      return chunks;
    }

    return chunks.map(chunk => ({
      ...chunk,
      // Add computed fields
      confidence: this.calculateConfidence(chunk),
      relevanceReason: this.generateRelevanceReason(chunk),
      // Format dates for display
      displayDateRange: this.formatDateRange(chunk.date_start, chunk.date_end),
      // Extract key phrases
      keyPhrases: this.extractKeyPhrases(chunk.content)
    }));
  }

  /**
   * Calculate confidence score for a chunk
   * @param {Object} chunk - Chunk data
   * @returns {string} - Confidence level
   */
  calculateConfidence(chunk) {
    const score = chunk.rerank_score || chunk.similarity;
    
    if (score >= 0.85) {return 'very-high';}
    if (score >= 0.80) {return 'high';}
    if (score >= 0.75) {return 'medium';}
    if (score >= 0.70) {return 'low';}
    return 'very-low';
  }

  /**
   * Generate explanation for why this chunk is relevant
   * @param {Object} chunk - Chunk data
   * @returns {string} - Relevance explanation
   */
  generateRelevanceReason(chunk) {
    const reasons = [];
    
    if (chunk.similarity >= 0.85) {
      reasons.push('high semantic similarity');
    }
    
    if (chunk.recency_score > 0.8) {
      reasons.push('recent experience');
    }
    
    if (chunk.skills && chunk.skills.length > 0) {
      reasons.push(`relevant skills: ${chunk.skills.slice(0, 3).join(', ')}`);
    }
    
    if (chunk.source_type === 'project') {
      reasons.push('project experience');
    } else if (chunk.source_type === 'job') {
      reasons.push('work experience');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'content similarity';
  }

  /**
   * Format date range for display
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @returns {string} - Formatted date range
   */
  formatDateRange(startDate, endDate) {
    if (!startDate) {return 'Date unknown';}
    
    const start = new Date(startDate);
    const startFormatted = start.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    
    if (!endDate) {return `${startFormatted} - Present`;}
    
    const end = new Date(endDate);
    const endFormatted = end.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
    
    return `${startFormatted} - ${endFormatted}`;
  }

  /**
   * Extract key phrases from content
   * @param {string} content - Chunk content
   * @returns {Array} - Key phrases
   */
  extractKeyPhrases(content) {
    // Simple extraction - could be enhanced with NLP
    const sentences = content.split(/[.!?]+/);
    const keyPhrases = [];
    
    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed.length > 20 && trimmed.length < 100) {
        // Look for sentences with numbers (likely achievements)
        if (/\d+[%$]?/.test(trimmed)) {
          keyPhrases.push(trimmed);
        }
      }
    });
    
    return keyPhrases.slice(0, 3); // Limit to top 3
  }

  /**
   * Generate context summary
   * @param {Array} chunks - Retrieved chunks
   * @param {string} query - Original query
   * @returns {string} - Context summary
   */
  generateContextSummary(chunks, query) {
    if (chunks.length === 0) {
      return 'No relevant context found.';
    }
    
    const sources = this.extractUniqueSources(chunks);
    const timeSpan = this.calculateTimeSpan(chunks);
    const topSkills = this.extractTopSkills(chunks);
    
    const parts = [`Found ${chunks.length} relevant pieces of information`];
    
    if (sources.length > 0) {
      parts.push(`from ${sources.length} source${sources.length > 1 ? 's' : ''}`);
    }
    
    if (timeSpan) {
      parts.push(`spanning ${timeSpan}`);
    }
    
    if (topSkills.length > 0) {
      parts.push(`covering ${topSkills.slice(0, 3).join(', ')}`);
    }
    
    return `${parts.join(' ')  }.`;
  }

  /**
   * Extract unique sources from chunks
   * @param {Array} chunks - Retrieved chunks
   * @returns {Array} - Unique sources
   */
  extractUniqueSources(chunks) {
    const sources = new Map();
    
    chunks.forEach(chunk => {
      let sourceData;
      
      // Handle the actual data structure from database
      if (chunk.sources && typeof chunk.sources === 'object') {
        // Nested sources object (this is the actual structure)
        sourceData = {
          id: chunk.sources.id,
          title: chunk.sources.title,
          type: chunk.sources.type,
          org: chunk.sources.org
        };
      } else {
        // Fallback for flat structure (shouldn't happen but just in case)
        sourceData = {
          id: chunk.source_id,
          title: chunk.source_title || chunk.title,
          type: chunk.source_type,
          org: chunk.source_org
        };
      }
      
      if (sourceData.id && sourceData.title) {
        sources.set(sourceData.id, sourceData);
      }
    });
    
    return Array.from(sources.values());
  }

  /**
   * Calculate time span covered by chunks
   * @param {Array} chunks - Retrieved chunks
   * @returns {string|null} - Time span description
   */
  calculateTimeSpan(chunks) {
    const dates = chunks
      .map(chunk => chunk.date_start)
      .filter(date => date)
      .map(date => new Date(date))
      .sort((a, b) => a - b);
    
    if (dates.length < 2) {return null;}
    
    const earliest = dates[0];
    const latest = dates[dates.length - 1];
    const yearDiff = latest.getFullYear() - earliest.getFullYear();
    
    if (yearDiff === 0) {return 'recent experience';}
    if (yearDiff === 1) {return '2 years of experience';}
    return `${yearDiff + 1} years of experience`;
  }

  /**
   * Extract top skills from chunks
   * @param {Array} chunks - Retrieved chunks
   * @returns {Array} - Top skills
   */
  extractTopSkills(chunks) {
    const skillCounts = {};
    
    chunks.forEach(chunk => {
      if (chunk.skills) {
        chunk.skills.forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      }
    });
    
    return Object.entries(skillCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([skill]) => skill)
      .slice(0, 5);
  }

  /**
   * Calculate average similarity score
   * @param {Array} chunks - Retrieved chunks
   * @returns {number} - Average similarity
   */
  calculateAverageSimilarity(chunks) {
    if (chunks.length === 0) {return 0;}
    
    const totalSimilarity = chunks.reduce((sum, chunk) => sum + (chunk.similarity || 0), 0);
    return Math.round((totalSimilarity / chunks.length) * 100) / 100;
  }

  /**
   * Perform text-based search as backup when semantic search fails
   * @param {string} query - Original query
   * @param {Object} filters - Search filters
   * @param {number} maxResults - Maximum results to return
   * @param {string|null} userFilter - User ID to filter content (for multi-tenant)
   * @returns {Promise<Array>} - Text search results
   */
  async performTextSearch(query, filters, maxResults, userFilter = null) {
    try {
      const { db } = await import('../config/database.js');
      const queryLower = query.toLowerCase();
      
      // Simplified text search approach - use individual queries and merge results
      let allResults = [];
      
      // Search patterns with proper escaping
      const searchPatterns = [];
      
      if (queryLower.includes('iot') || queryLower.includes('internet of things')) {
        searchPatterns.push('iot', 'internet');
      }
      
      if (queryLower.includes('coca-cola') || queryLower.includes('coca cola')) {
        searchPatterns.push('coca');
      }
      
      if (queryLower.includes('mckesson')) {
        searchPatterns.push('mckesson');
      }
      
      if (queryLower.includes('oldp') || queryLower.includes('operations leadership') || queryLower.includes('leadership development')) {
        searchPatterns.push('oldp', 'leadership');
      }
      
      if (searchPatterns.length === 0) {
        // Generic search - use the main query words
        const words = query.split(/\s+/).filter(word => word.length > 2);
        searchPatterns.push(...words.slice(0, 3)); // Limit to first 3 words
      }
      
      if (searchPatterns.length === 0) return [];
      
      // Execute multiple simple searches and merge results
      const seenIds = new Set();
      
      for (const pattern of searchPatterns) {
        try {
          let dbQuery = db.supabase
            .from('content_chunks')
            .select(`
              id, source_id, title, content, skills, tags,
              date_start, date_end, token_count,
              sources (id, type, title, org, location)
            `)
            .or(`content.ilike.%${pattern}%,title.ilike.%${pattern}%`);

          // Apply user filter for multi-tenant support
          if (userFilter) {
            dbQuery = dbQuery.eq('user_id', userFilter);
          }

          const { data, error } = await dbQuery.limit(10);
          
          if (!error && data) {
            // Add unique results
            data.forEach(item => {
              if (!seenIds.has(item.id)) {
                seenIds.add(item.id);
                allResults.push(item);
              }
            });
          }
        } catch (patternError) {
          console.warn(`Text search pattern '${pattern}' failed:`, patternError.message);
        }
      }

      // Use the collected results
      const data = allResults.slice(0, maxResults * 2);
      
      // Calculate proper text search scores instead of artificial similarity
      const searchContext = { query, skills: filters.skills || [], tags: filters.tags || [] };
      
      return (data || []).map(chunk => {
        // Calculate transparent text relevance score
        const scoring = calculateTextScore(chunk, searchContext);
        
        return {
          ...chunk,
          similarity: scoring.final_score, // Use calculated relevance, not artificial score
          recency_score: scoring.components.recency.raw,
          combined_score: scoring.final_score,
          scoring: scoring, // Include full scoring breakdown for debugging
          search_method: 'text'
        };
      });
      
    } catch (error) {
      console.error('Text search error:', error);
      return [];
    }
  }

  /**
   * Merge semantic and text search results, removing duplicates
   * @param {Array} semanticResults - Results from semantic search
   * @param {Array} textResults - Results from text search
   * @returns {Array} - Merged and deduplicated results
   */
  mergeSearchResults(semanticResults, textResults) {
    const seenIds = new Set(semanticResults.map(r => r.id));
    const uniqueTextResults = textResults.filter(r => !seenIds.has(r.id));
    
    console.log(`🔗 Merging ${semanticResults.length} semantic + ${uniqueTextResults.length} unique text results`);
    
    // Combine and sort by score
    const combined = [...semanticResults, ...uniqueTextResults]
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
      
    return combined;
  }
  
  /**
   * Validate and clean search results
   * @param {Array} results - Raw search results
   * @returns {Array} - Cleaned results
   */
  validateSearchResults(results) {
    return results.filter(result => {
      // Basic validation
      if (!result.id || !result.content) {
        console.warn('⚠️ Filtered out invalid result:', result.id);
        return false;
      }
      
      // Content quality check
      if (result.content.length < 50) {
        console.warn('⚠️ Filtered out short content:', result.id);
        return false;
      }
      
      // Similarity score validation
      if (typeof result.similarity !== 'number' || result.similarity < 0 || result.similarity > 1) {
        console.warn('⚠️ Invalid similarity score for:', result.id, result.similarity);
        result.similarity = Math.max(0, Math.min(1, result.similarity || 0));
      }
      
      return true;
    });
  }
}

export default RetrievalService;