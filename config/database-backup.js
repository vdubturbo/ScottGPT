import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { 
  parseStoredEmbedding, 
  prepareEmbeddingForStorage, 
  calculateCosineSimilarity,
  createEmbeddingProcessor,
  validateEmbedding 
} from '../utils/embedding-utils.js';

// Load environment variables
dotenv.config();

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Database helper functions
class Database {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.performanceMetrics = {
      queryTimes: [],
      searchMethod: 'javascript',
      totalQueries: 0
    };
  }

  async insertSource(sourceData) {
    const { data, error } = await this.supabase
      .from('sources')
      .insert({
        id: sourceData.id,
        type: sourceData.type,
        title: sourceData.title,
        org: sourceData.org,
        location: sourceData.location,
        date_start: sourceData.date_start,
        date_end: sourceData.date_end,
        industry_tags: sourceData.industry_tags,
        summary: sourceData.summary,
        url: sourceData.url,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  async insertChunk(chunkData) {
    // Validate and prepare embedding for consistent storage
    let preparedEmbedding;
    try {
      const embeddingData = prepareEmbeddingForStorage(chunkData.embedding);
      preparedEmbedding = embeddingData.forTextColumn; // JSON string for TEXT column
      
      // Log storage info for first few chunks
      if (Math.random() < 0.01) { // 1% sampling for monitoring
        console.log(`📊 Embedding storage: ${embeddingData.dimensions}D, ${embeddingData.storageSize} chars, ${embeddingData.originalType} -> json_string`);
      }
    } catch (error) {
      console.error(`❌ Invalid embedding for chunk ${chunkData.title}:`, error.message);
      throw new Error(`Cannot store chunk with invalid embedding: ${error.message}`);
    }

    const { data, error } = await this.supabase
      .from('content_chunks')
      .insert({
        source_id: chunkData.source_id,
        title: chunkData.title,
        content: chunkData.content,
        content_summary: chunkData.content_summary,
        skills: chunkData.skills,
        tags: chunkData.tags,
        date_start: chunkData.date_start,
        date_end: chunkData.date_end,
        token_count: chunkData.token_count,
        embedding: preparedEmbedding, // Consistently stored as JSON string
        file_hash: chunkData.file_hash,
        created_at: new Date().toISOString()
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  async searchChunks(queryEmbedding, options = {}) {
    const { limit = 10, threshold = 0.7, skills = [], tags = [], dateRange = null } = options;

    console.log(`🔍 Searching chunks with threshold: ${threshold}`);
    console.log(`📊 Query embedding dimensions: ${queryEmbedding?.length || 'none'}`);
    
    const startTime = Date.now();
    
    // FIXED: Get ALL chunks first (or a very large sample) WITHOUT filters
    // This ensures we don't miss high-similarity chunks
    let query = this.supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, content_summary, skills, tags,
        date_start, date_end, token_count, embedding,
        sources (id, type, title, org, location)
      `);

    // Only apply date filters at query level (they're not the issue)
    if (dateRange?.start) query = query.gte('date_start', dateRange.start);
    if (dateRange?.end) query = query.lte('date_end', dateRange.end);

    // Get a MUCH larger sample or ALL chunks to ensure we find the best matches
    // This is the key fix - we need to evaluate similarity on a complete dataset
    query = query.limit(1000); // Increased significantly
    
    const { data, error } = await query;
    if (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }

    console.log(`📊 Retrieved ${data?.length || 0} chunks for similarity calculation`);

    if (!data || data.length === 0) {
      console.log('📭 No chunks found in database');
      return [];
    }

    // If no query embedding, return filtered results
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.log('📋 No embedding provided, returning filtered results');
      // Apply filters post-retrieval
      let filteredData = data;
      if (skills.length > 0 || tags.length > 0) {
        filteredData = data.filter(chunk => {
          const hasMatchingSkills = skills.length === 0 || 
            (chunk.skills && skills.some(skill => chunk.skills.includes(skill)));
          const hasMatchingTags = tags.length === 0 || 
            (chunk.tags && tags.some(tag => chunk.tags.includes(tag)));
          return hasMatchingSkills || hasMatchingTags;
        });
      }
      return filteredData.slice(0, limit).map(chunk => ({
        ...chunk,
        similarity: 0.5,
        combined_score: 0.5
      }));
    }

    // Validate query embedding first
    const queryValidation = validateEmbedding(queryEmbedding);
    if (!queryValidation.isValid) {
      console.error('❌ Invalid query embedding:', queryValidation.errors.join(', '));
      return [];
    }

    // Use optimized embedding processor for batch operations
    console.log(`🔄 Processing ${data.length} embeddings for similarity calculation...`);
    const processor = createEmbeddingProcessor(data);
    
    if (processor.invalidEmbeddings > 0) {
      console.warn(`⚠️ Found ${processor.invalidEmbeddings} invalid stored embeddings`);
      if (processor.errors.length > 0) {
        console.warn('   First few errors:', processor.errors.slice(0, 3));
      }
    }

    // Calculate similarity for ALL chunks using optimized processor
    const similarities = processor.calculateAllSimilarities(queryEmbedding);
    
    const resultsWithSimilarity = processor.chunks
      .map((chunk, index) => {
        const similarity = similarities[index];
        
        // Calculate recency score (higher for more recent content)
        const recencyScore = chunk.date_end ? 
          Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 0.5;
        
        // Apply filter boost (if chunk matches filters, slight boost)
        let filterBoost = 0;
        if (skills.length > 0 && chunk.skills) {
          const matchingSkills = skills.filter(skill => chunk.skills.includes(skill)).length;
          filterBoost += matchingSkills * 0.02; // Small boost per matching skill
        }
        if (tags.length > 0 && chunk.tags) {
          const matchingTags = tags.filter(tag => chunk.tags.includes(tag)).length;
          filterBoost += matchingTags * 0.02; // Small boost per matching tag
        }
        
        // Combined score: similarity is PRIMARY, filters are secondary boost
        const combinedScore = (similarity * 0.8) + (recencyScore * 0.1) + (filterBoost * 0.1);
        
        return {
          ...chunk,
          similarity,
          recency_score: recencyScore,
          filter_boost: filterBoost,
          combined_score: combinedScore
        };
      });

    // Debug similarity scores
    console.log(`📊 Similarity scores from ${data.length} chunks:`);
    if (data.length > 0) {
      const similarities = resultsWithSimilarity.map(r => r.similarity).sort((a, b) => b - a);
      console.log(`   - Highest: ${similarities[0]?.toFixed(3) || 'none'}`);
      console.log(`   - Top 5: ${similarities.slice(0, 5).map(s => s.toFixed(3)).join(', ')}`);
      console.log(`   - Median: ${similarities[Math.floor(similarities.length/2)]?.toFixed(3) || 'none'}`);
      console.log(`   - Above threshold (${threshold}): ${similarities.filter(s => s >= threshold).length}`);
    }

    // FIXED: Sort by similarity FIRST, then apply threshold
    // This ensures we get the BEST matches, not random matches that happen to be above threshold
    const rankedResults = resultsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity) // Sort by pure similarity first
      .filter(chunk => chunk.similarity >= threshold) // Then filter by threshold
      .slice(0, limit * 2); // Get more candidates

    // If we have filters, apply them as a soft preference, not a hard requirement
    let finalResults = rankedResults;
    if (skills.length > 0 || tags.length > 0) {
      // Separate into matching and non-matching
      const matching = rankedResults.filter(chunk => {
        const hasMatchingSkills = skills.length === 0 || 
          (chunk.skills && skills.some(skill => chunk.skills.includes(skill)));
        const hasMatchingTags = tags.length === 0 || 
          (chunk.tags && tags.some(tag => chunk.tags.includes(tag)));
        return hasMatchingSkills || hasMatchingTags;
      });
      
      const nonMatching = rankedResults.filter(chunk => {
        const hasMatchingSkills = skills.length === 0 || 
          (chunk.skills && skills.some(skill => chunk.skills.includes(skill)));
        const hasMatchingTags = tags.length === 0 || 
          (chunk.tags && tags.some(tag => chunk.tags.includes(tag)));
        return !(hasMatchingSkills || hasMatchingTags);
      });
      
      // Prioritize matching, but include non-matching if needed
      finalResults = [...matching, ...nonMatching].slice(0, limit);
      
      console.log(`🏷️ Filter results: ${matching.length} matching filters, ${nonMatching.length} without filters`);
    } else {
      finalResults = rankedResults.slice(0, limit);
    }

    const queryTime = Date.now() - startTime;
    this.recordPerformanceMetric('javascript', queryTime);

    console.log(`✅ Returning ${finalResults.length} chunks (best similarity: ${finalResults[0]?.similarity.toFixed(3) || 'N/A'})`);
    
    // Log what we're returning for debugging
    if (finalResults.length > 0) {
      console.log(`📋 Top 3 results:`);
      finalResults.slice(0, 3).forEach((chunk, i) => {
        console.log(`   ${i+1}. Sim: ${chunk.similarity.toFixed(3)} | ${chunk.sources?.org || 'Unknown'} | ${chunk.title?.substring(0, 50)}`);
      });
    }

    return finalResults;
  }

  // Legacy cosine similarity - now delegated to embedding utils
  cosineSimilarity(vecA, vecB) {
    return calculateCosineSimilarity(vecA, vecB);
  }

  async getStats() {
    try {
      const [sourcesResult, chunksResult] = await Promise.all([
        this.supabase.from('sources').select('id', { count: 'exact' }),
        this.supabase.from('content_chunks').select('id', { count: 'exact' })
      ]);

      return {
        total_sources: sourcesResult.count || 0,
        total_chunks: chunksResult.count || 0,
        source_breakdown: []
      };
    } catch (error) {
      console.error('Stats error:', error);
      return {
        total_sources: 0,
        total_chunks: 0,
        source_breakdown: []
      };
    }
  }

  async getChunkStats() {
    const { data, error } = await this.supabase
      .from('content_chunks')
      .select('id, token_count, created_at');

    if (error) throw error;
    const totalChunks = data.length;
    const totalTokens = data.reduce((sum, chunk) => sum + (chunk.token_count || 0), 0);

    return {
      total_chunks: totalChunks,
      total_tokens: totalTokens,
      avg_tokens_per_chunk: totalChunks > 0 ? Math.round(totalTokens / totalChunks) : 0,
      latest_chunk: totalChunks > 0 ? data[data.length - 1].created_at : null
    };
  }

  async getSourceStats() {
    const { data, error } = await this.supabase.from('sources').select('type, created_at');
    if (error) throw error;
    
    const typeBreakdown = data.reduce((acc, source) => {
      acc[source.type] = (acc[source.type] || 0) + 1;
      return acc;
    }, {});

    return {
      total_sources: data.length,
      type_breakdown: typeBreakdown,
      latest_source: data.length > 0 ? data[data.length - 1].created_at : null
    };
  }

  async getUniqueSkills() {
    const { data, error } = await this.supabase.from('content_chunks').select('skills');
    if (error) throw error;

    const allSkills = new Set();
    data.forEach(chunk => {
      if (Array.isArray(chunk.skills)) {
        chunk.skills.forEach(skill => allSkills.add(skill));
      }
    });
    return Array.from(allSkills).sort();
  }

  async getUniqueTags() {
    const { data, error } = await this.supabase.from('content_chunks').select('tags');
    if (error) throw error;

    const allTags = new Set();
    data.forEach(chunk => {
      if (Array.isArray(chunk.tags)) {
        chunk.tags.forEach(tag => allTags.add(tag));
      }
    });
    return Array.from(allTags).sort();
  }

  async getSynonyms(word) {
    return [];
  }

  /**
   * Record performance metrics for monitoring
   */
  recordPerformanceMetric(method, timeMs) {
    this.performanceMetrics.queryTimes.push(timeMs);
    this.performanceMetrics.searchMethod = method;
    this.performanceMetrics.totalQueries++;

    // Keep only last 100 measurements
    if (this.performanceMetrics.queryTimes.length > 100) {
      this.performanceMetrics.queryTimes = this.performanceMetrics.queryTimes.slice(-100);
    }
  }

  /**
   * Get performance statistics
   */
  getPerformanceStats() {
    const times = this.performanceMetrics.queryTimes;
    if (times.length === 0) {
      return {
        searchMethod: this.performanceMetrics.searchMethod,
        totalQueries: 0,
        avgTimeMs: 0,
        minTimeMs: 0,
        maxTimeMs: 0
      };
    }

    return {
      searchMethod: this.performanceMetrics.searchMethod,
      totalQueries: this.performanceMetrics.totalQueries,
      avgTimeMs: Math.round(times.reduce((a, b) => a + b, 0) / times.length),
      minTimeMs: Math.min(...times),
      maxTimeMs: Math.max(...times),
      recentQueries: times.length
    };
  }
}

export const db = new Database(supabase);