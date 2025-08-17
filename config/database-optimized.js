import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { 
  parseStoredEmbedding, 
  prepareEmbeddingForStorage, 
  calculateCosineSimilarity,
  validateEmbedding 
} from '../utils/embedding-utils.js';

// Load environment variables
dotenv.config();

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Enhanced Database helper functions with pgvector optimization
class OptimizedDatabase {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.useVectorOptimization = null; // Will be determined at runtime
    this.performanceMetrics = {
      queryTimes: [],
      searchMethod: 'unknown',
      totalQueries: 0
    };
  }

  /**
   * Check if pgvector optimization is available and working
   */
  async checkVectorOptimization() {
    if (this.useVectorOptimization !== null) {
      return this.useVectorOptimization;
    }

    try {
      console.log('🔍 Checking pgvector optimization availability...');
      
      // Test if the fast_similarity_search function exists and works
      const { data, error } = await this.supabase
        .rpc('get_vector_search_stats');
      
      if (error) {
        console.log('⚠️ pgvector optimization not available:', error.message);
        this.useVectorOptimization = false;
      } else {
        console.log('✅ pgvector optimization available');
        console.log(`📊 Database stats: ${data[0]?.chunks_with_vectors || 0} vectors indexed`);
        this.useVectorOptimization = true;
      }
    } catch (error) {
      console.log('⚠️ Cannot check pgvector optimization:', error.message);
      this.useVectorOptimization = false;
    }

    return this.useVectorOptimization;
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
    } catch (error) {
      console.error(`❌ Invalid embedding for chunk ${chunkData.title}:`, error.message);
      throw new Error(`Cannot store chunk with invalid embedding: ${error.message}`);
    }

    const insertData = {
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
    };

    // If pgvector is available, also store as native vector
    const useVector = await this.checkVectorOptimization();
    if (useVector) {
      const parsed = parseStoredEmbedding(chunkData.embedding);
      if (parsed.isValid) {
        insertData.embedding_vector = parsed.embedding;
      }
    }

    const { data, error } = await this.supabase
      .from('content_chunks')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Optimized search using pgvector when available
   */
  async searchChunksOptimized(queryEmbedding, options = {}) {
    const { 
      limit = 10, 
      threshold = 0.3, 
      skills = [], 
      tags = [], 
      dateRange = null 
    } = options;

    console.log(`🚀 Using optimized pgvector search (threshold: ${threshold})`);
    const startTime = Date.now();

    try {
      const { data, error } = await this.supabase
        .rpc('fast_similarity_search', {
          query_embedding: queryEmbedding,
          similarity_threshold: threshold,
          max_results: limit * 2, // Get extra results for filtering
          filter_skills: skills.length > 0 ? skills : null,
          filter_tags: tags.length > 0 ? tags : null,
          date_after: dateRange?.start || null,
          date_before: dateRange?.end || null
        });

      if (error) {
        console.error('❌ Optimized search failed:', error);
        throw error;
      }

      const queryTime = Date.now() - startTime;
      this.recordPerformanceMetric('pgvector', queryTime);

      console.log(`⚡ pgvector search: ${queryTime}ms, ${data.length} results`);
      
      // Convert to format expected by application
      const results = data.map(chunk => ({
        ...chunk,
        // Add computed fields for compatibility
        recency_score: chunk.date_end ? 
          Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 0.5,
        combined_score: chunk.similarity,
        sources: {
          id: chunk.source_id,
          type: chunk.source_type,
          title: chunk.source_title,
          org: chunk.source_org,
          location: chunk.source_location
        }
      }));

      return results.slice(0, limit);

    } catch (error) {
      console.error('❌ Optimized search error:', error);
      throw error;
    }
  }

  /**
   * Legacy search using JavaScript similarity calculation
   */
  async searchChunksLegacy(queryEmbedding, options = {}) {
    const { limit = 10, threshold = 0.3, skills = [], tags = [], dateRange = null } = options;

    console.log(`🔄 Using legacy JavaScript search (threshold: ${threshold})`);
    console.log(`📊 Query embedding dimensions: ${queryEmbedding?.length || 'none'}`);
    
    const startTime = Date.now();
    
    // Get chunks - use a reasonable limit to balance performance vs quality
    // This is the original workaround approach
    let query = this.supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, content_summary, skills, tags,
        date_start, date_end, token_count, embedding,
        sources (id, type, title, org, location)
      `);

    // Apply date filters at query level
    if (dateRange?.start) query = query.gte('date_start', dateRange.start);
    if (dateRange?.end) query = query.lte('date_end', dateRange.end);

    // Limit to 1000 records (the current workaround)
    query = query.limit(1000);
    
    const { data, error } = await query;
    if (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }

    console.log(`📊 Retrieved ${data?.length || 0} chunks for similarity calculation`);

    if (!data || data.length === 0) {
      return [];
    }

    // Calculate similarity for all chunks (JavaScript approach)
    const resultsWithSimilarity = data
      .map(chunk => {
        let similarity = 0;
        
        if (chunk.embedding && queryEmbedding) {
          // Use embedding utilities for consistent parsing and calculation
          similarity = calculateCosineSimilarity(queryEmbedding, chunk.embedding);
        }
        
        const recencyScore = chunk.date_end ? 
          Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 0.5;
        
        let filterBoost = 0;
        if (skills.length > 0 && chunk.skills) {
          const matchingSkills = skills.filter(skill => chunk.skills.includes(skill)).length;
          filterBoost += matchingSkills * 0.02;
        }
        if (tags.length > 0 && chunk.tags) {
          const matchingTags = tags.filter(tag => chunk.tags.includes(tag)).length;
          filterBoost += matchingTags * 0.02;
        }
        
        const combinedScore = (similarity * 0.8) + (recencyScore * 0.1) + (filterBoost * 0.1);
        
        return {
          ...chunk,
          similarity,
          recency_score: recencyScore,
          filter_boost: filterBoost,
          combined_score: combinedScore
        };
      });

    // Sort by similarity and apply threshold
    const rankedResults = resultsWithSimilarity
      .sort((a, b) => b.similarity - a.similarity)
      .filter(chunk => chunk.similarity >= threshold)
      .slice(0, limit * 2);

    // Apply soft filtering
    let finalResults = rankedResults;
    if (skills.length > 0 || tags.length > 0) {
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
      
      finalResults = [...matching, ...nonMatching].slice(0, limit);
    } else {
      finalResults = rankedResults.slice(0, limit);
    }

    const queryTime = Date.now() - startTime;
    this.recordPerformanceMetric('javascript', queryTime);

    console.log(`🔄 JavaScript search: ${queryTime}ms, ${finalResults.length} results`);

    return finalResults;
  }

  /**
   * Main search function that automatically uses the best available method
   */
  async searchChunks(queryEmbedding, options = {}) {
    const useVector = await this.checkVectorOptimization();
    
    if (useVector && Array.isArray(queryEmbedding) && queryEmbedding.length === 1024) {
      try {
        return await this.searchChunksOptimized(queryEmbedding, options);
      } catch (error) {
        console.warn('⚠️ Optimized search failed, falling back to legacy:', error.message);
        this.useVectorOptimization = false; // Disable for this session
        return await this.searchChunksLegacy(queryEmbedding, options);
      }
    } else {
      return await this.searchChunksLegacy(queryEmbedding, options);
    }
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

  // Legacy cosine similarity - now delegated to embedding utils
  cosineSimilarity(vecA, vecB) {
    return calculateCosineSimilarity(vecA, vecB);
  }

  // Existing methods remain the same for compatibility
  async getStats() {
    try {
      const [sourcesResult, chunksResult] = await Promise.all([
        this.supabase.from('sources').select('id', { count: 'exact' }),
        this.supabase.from('content_chunks').select('id', { count: 'exact' })
      ]);

      return {
        total_sources: sourcesResult.count || 0,
        total_chunks: chunksResult.count || 0,
        source_breakdown: [],
        performance: this.getPerformanceStats()
      };
    } catch (error) {
      console.error('Stats error:', error);
      return {
        total_sources: 0,
        total_chunks: 0,
        source_breakdown: [],
        performance: this.getPerformanceStats()
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
      latest_chunk: totalChunks > 0 ? data[data.length - 1].created_at : null,
      performance: this.getPerformanceStats()
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
}

export const db = new OptimizedDatabase(supabase);