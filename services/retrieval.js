import { db } from '../config/database.js';
import EmbeddingService from './embeddings.js';

/**
 * Clean, minimal retrieval service
 * Uses only pgvector - no fallbacks, no complexity
 */
class RetrievalService {
  constructor() {
    this.embeddings = new EmbeddingService();
  }

  /**
   * Retrieve relevant context using vector search only
   */
  async retrieveContext(query, options = {}) {
    const {
      maxResults = 12,
      userFilter = null,
      similarityThreshold = 0.3
    } = options;

    console.log(`🔍 Retrieving context for: "${query.substring(0, 50)}..."`);

    try {
      // 1. Generate query embedding
      const queryEmbedding = await this.embeddings.embedText(query, 'search_query');
      console.log(`🎯 Generated ${queryEmbedding.length}-dim embedding`);

      // 2. Calculate similarity threshold  
      const threshold = this.embeddings.calculateSimilarityThreshold(query);
      console.log(`📊 Using similarity threshold: ${threshold}`);

      // 3. Vector search only - no fallbacks
      const results = await db.searchSimilar(queryEmbedding, {
        threshold: Math.min(threshold, similarityThreshold),
        maxResults: maxResults,
        userFilter: userFilter
      });

      console.log(`✅ Found ${results.length} results`);

      if (results.length === 0) {
        console.log('❌ No results found - vector search failed');
        throw new Error('No relevant content found for query');
      }

      // 4. Return results in expected format
      return {
        chunks: results,
        totalFound: results.length,
        avgSimilarity: results.reduce((sum, r) => sum + r.similarity, 0) / results.length,
        searchMethod: 'vector',
        threshold: threshold
      };

    } catch (error) {
      console.error('❌ Retrieval failed:', error.message);
      throw error; // No fallbacks - fail fast
    }
  }
}

export default RetrievalService;