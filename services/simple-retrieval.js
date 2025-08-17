import { db } from '../config/database.js';
import EmbeddingService from './embeddings.js';

/**
 * @deprecated This service has been deprecated in favor of the consolidated RetrievalService.
 * The main RetrievalService now includes all the functionality from SimpleRetrievalService
 * with improved semantic search, better fallback logic, and no artificial similarity scores.
 * 
 * Use RetrievalService from './retrieval.js' instead.
 * 
 * This file will be removed in a future version.
 */
class SimpleRetrievalService {
  constructor() {
    this.embeddings = new EmbeddingService();
    
    console.warn('⚠️ SimpleRetrievalService is deprecated. Use RetrievalService from ./retrieval.js instead.');
  }

  /**
   * Simplified search that actually works
   */
  async retrieveContext(query, options = {}) {
    try {
      console.log(`🔍 Simple search for: "${query}"`);
      
      const { maxResults = 12 } = options;

      // Step 1: Try text search first (most reliable)
      const textResults = await this.textSearch(query, maxResults);
      console.log(`📝 Text search found: ${textResults.length} results`);

      // Step 2: If text search finds good results, use them
      if (textResults.length >= 3) {
        return this.formatResults(textResults, query, 'text_search');
      }

      // Step 3: Otherwise try semantic search with very low threshold
      console.log(`🧠 Trying semantic search...`);
      const embedding = await this.embeddings.embedText(query, 'search_query');
      const semanticResults = await db.searchChunks(embedding, {
        threshold: 0.1, // Very low threshold
        limit: maxResults * 2
      });
      
      console.log(`🧠 Semantic search found: ${semanticResults.length} results`);

      // Step 4: Combine and deduplicate if needed
      const allResults = this.mergeResults(textResults, semanticResults);
      
      return this.formatResults(allResults.slice(0, maxResults), query, 'combined_search');

    } catch (error) {
      console.error('Simple search error:', error);
      throw error;
    }
  }

  /**
   * Text-based search that actually works
   */
  async textSearch(query, limit) {
    try {
      const queryLower = query.toLowerCase();
      const searchTerms = [];

      // Build search terms based on query
      if (queryLower.includes('leadership') || queryLower.includes('oldp')) {
        searchTerms.push(
          'title.ilike.%leadership%',
          'content.ilike.%leadership%',
          'content.ilike.%oldp%'
        );
      }

      if (queryLower.includes('internship') || queryLower.includes('intern')) {
        searchTerms.push(
          'title.ilike.%intern%',
          'content.ilike.%intern%'
        );
      }

      if (queryLower.includes('lockheed')) {
        searchTerms.push(
          'content.ilike.%lockheed%',
          'sources.org.ilike.%lockheed%'
        );
      }

      // Generic word search if no specific terms
      if (searchTerms.length === 0) {
        const words = query.split(/\s+/).filter(word => word.length > 2);
        words.forEach(word => {
          searchTerms.push(`content.ilike.%${word}%`);
        });
      }

      if (searchTerms.length === 0) return [];

      console.log(`🔍 Text search terms: ${searchTerms.slice(0, 3).join(', ')}...`);

      const { data, error } = await db.supabase
        .from('content_chunks')
        .select(`
          id, source_id, title, content, skills, tags,
          date_start, date_end, token_count,
          sources (id, type, title, org, location)
        `)
        .or(searchTerms.join(','))
        .limit(limit * 2);

      if (error) {
        console.error('Text search error:', error);
        return [];
      }

      // DEPRECATED: This service uses artificial similarity scores
      // Use RetrievalService instead for transparent scoring
      console.warn('⚠️ SimpleRetrievalService uses deprecated artificial scoring');
      console.warn('   Consider migrating to RetrievalService for transparent, configurable scoring');
      
      return (data || []).map(chunk => ({
        ...chunk,
        similarity: 0.8, // ARTIFICIAL: High score for text matches (deprecated)
        search_method: 'text_deprecated',
        scoring: {
          final_score: 0.8,
          components: { artificial: { raw: 0.8, weighted: 0.8, weight: 1.0 } },
          quality_band: { label: 'Artificial scoring (deprecated)' },
          search_method: 'text_deprecated',
          meets_threshold: true
        }
      }));

    } catch (error) {
      console.error('Text search error:', error);
      return [];
    }
  }

  /**
   * Merge and deduplicate results
   */
  mergeResults(textResults, semanticResults) {
    const seenIds = new Set(textResults.map(r => r.id));
    const uniqueSemanticResults = semanticResults.filter(r => !seenIds.has(r.id));
    
    return [
      ...textResults,
      ...uniqueSemanticResults.map(r => ({ ...r, search_method: 'semantic' }))
    ].sort((a, b) => (b.similarity || 0) - (a.similarity || 0));
  }

  /**
   * Format results properly
   */
  formatResults(chunks, query, searchMethod) {
    const sources = this.extractSources(chunks);
    
    console.log(`📊 Final results: ${chunks.length} chunks, ${sources.length} sources`);
    console.log(`📚 Sources: ${sources.map(s => s.title).join(', ')}`);

    return {
      chunks: chunks,
      sources: sources,
      totalFound: chunks.length,
      query: query,
      searchMethod: searchMethod,
      avgSimilarity: this.calculateAvgSimilarity(chunks)
    };
  }

  /**
   * Extract sources correctly (fix the bug)
   */
  extractSources(chunks) {
    const sourceMap = new Map();
    
    chunks.forEach(chunk => {
      let sourceId, sourceTitle, sourceType, sourceOrg;
      
      // Handle different data structures
      if (chunk.sources) {
        // Nested sources object
        sourceId = chunk.sources.id;
        sourceTitle = chunk.sources.title;
        sourceType = chunk.sources.type;
        sourceOrg = chunk.sources.org;
      } else {
        // Flat structure
        sourceId = chunk.source_id;
        sourceTitle = chunk.source_title || chunk.title;
        sourceType = chunk.source_type;
        sourceOrg = chunk.source_org;
      }

      if (sourceId && sourceTitle) {
        sourceMap.set(sourceId, {
          id: sourceId,
          title: sourceTitle,
          type: sourceType,
          org: sourceOrg
        });
      }
    });
    
    return Array.from(sourceMap.values());
  }

  calculateAvgSimilarity(chunks) {
    if (chunks.length === 0) return 0;
    const total = chunks.reduce((sum, chunk) => sum + (chunk.similarity || 0), 0);
    return Math.round((total / chunks.length) * 100) / 100;
  }
}

export default SimpleRetrievalService;
