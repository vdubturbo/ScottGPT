import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { 
  parseStoredEmbedding, 
  prepareEmbeddingForStorage, 
  calculateCosineSimilarity,
  validateEmbedding,
  generateContentHash
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
        console.log(`📊 Full stats:`, data[0]); // DEBUG: Show all stats
        // Only enable if we actually have vectors
        this.useVectorOptimization = (data[0]?.chunks_with_vectors || 0) > 0;
        console.log(`🔍 Decision: useVectorOptimization = ${this.useVectorOptimization}`);
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
        skills: sourceData.skills,
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
    // Calculate content hash if not provided
    const contentHash = chunkData.content_hash || generateContentHash(chunkData.content);
    
    // Check if content already exists
    const { data: existing } = await this.supabase
      .from('content_chunks')
      .select('id, source_id, title')
      .eq('content_hash', contentHash)
      .limit(1);
    
    if (existing && existing.length > 0) {
      console.log(`⏭️ Skipping duplicate content (hash: ${contentHash.slice(0, 8)}, existing: ${existing[0].title})`);
      return { id: existing[0].id, skipped: true };
    }

    // Get embedding array (don't validate vector optimization here)
    let embeddingArray;
    
    if (Array.isArray(chunkData.embedding)) {
      embeddingArray = chunkData.embedding;
      console.log(`🔧 Using raw embedding array (${embeddingArray.length} dims)`);
    } else if (typeof chunkData.embedding === 'string') {
      const parsed = parseStoredEmbedding(chunkData.embedding);
      if (parsed.isValid) {
        embeddingArray = parsed.embedding;
        console.log(`🔧 Parsed stored embedding string (${embeddingArray.length} dims)`);
      } else {
        console.error(`❌ Invalid stored embedding, cannot insert chunk`);
        throw new Error(`Cannot store chunk with invalid embedding`);
      }
    } else {
      console.error(`❌ Unknown embedding format: ${typeof chunkData.embedding}`);
      throw new Error(`Invalid embedding format: ${typeof chunkData.embedding}`);
    }

    // Validate embedding dimensions
    if (!embeddingArray || embeddingArray.length !== 1024) {
      throw new Error(`Invalid embedding dimensions: ${embeddingArray?.length || 'none'}, expected 1024`);
    }

    // Prepare insert data WITHOUT embedding field
    const insertData = {
      source_id: chunkData.source_id,
      title: chunkData.title,
      content: chunkData.content,
      content_hash: contentHash,
      content_summary: chunkData.content_summary,
      skills: chunkData.skills,
      tags: chunkData.tags,
      date_start: chunkData.date_start,
      date_end: chunkData.date_end,
      token_count: chunkData.token_count,
      file_hash: chunkData.file_hash,
      created_at: new Date().toISOString()
    };

    // ALWAYS attempt RPC insertion - no optimization check
    try {
      console.log(`✅ Attempting RPC vector insertion`);
      const { data, error } = await this.supabase
        .rpc('insert_chunk_with_vector', {
          chunk_data: insertData,
          vector_data: embeddingArray
        });

      if (error) {
        // Handle unique constraint violation gracefully
        if (error.code === '23505' && error.message.includes('unique_content_hash')) {
          console.log(`⏭️ Content already exists (concurrent insert detected)`);
          return { id: null, skipped: true };
        }
        throw error;
      }
      
      console.log(`✅ RPC vector insertion successful (id: ${data})`);
      return { id: data, skipped: false };
      
    } catch (rpcError) {
      console.error(`❌ RPC vector insert failed: ${rpcError.message}`);
      
      // Only fall back if RPC function doesn't exist or has structural issues
      if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        console.log(`🔄 RPC function missing, attempting direct insert`);
        
        // Direct insert with proper vector conversion
        try {
          const insertDataWithVector = {
            ...insertData,
            embedding: `[${embeddingArray.join(',')}]`  // Convert to PostgreSQL vector format
          };
          
          const { data, error } = await this.supabase
            .from('content_chunks')
            .insert(insertDataWithVector)
            .select('id')
            .single();

          if (error) {
            if (error.code === '23505' && error.message.includes('unique_content_hash')) {
              return { id: null, skipped: true };
            }
            throw error;
          }
          
          console.log(`✅ Direct vector insertion successful`);
          return { id: data.id, skipped: false };
          
        } catch (directError) {
          console.error(`❌ Direct vector insert also failed: ${directError.message}`);
          throw directError;
        }
      } else {
        // For other RPC errors, don't fall back - we want to fix the issue
        throw rpcError;
      }
    }
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
      dateRange = null,
      userFilter = null
    } = options;

    console.log(`🚀 Using optimized pgvector search (threshold: ${threshold})`);
    const startTime = Date.now();

    try {
      // Validate query embedding format
      if (!Array.isArray(queryEmbedding)) {
        throw new Error(`Query embedding must be an array, got ${typeof queryEmbedding}`);
      }
      
      if (queryEmbedding.length !== 1024) {
        console.error(`❌ DIMENSION ERROR: Query embedding has ${queryEmbedding.length} dims, expected 1024`);
        throw new Error(`Invalid query embedding dimensions: ${queryEmbedding.length}, expected 1024`);
      }
      
      const { data, error } = await this.supabase
        .rpc('fast_similarity_search', {
          query_embedding: queryEmbedding,
          similarity_threshold: threshold,
          max_results: limit * 2,
          filter_skills: skills.length > 0 ? skills : null,
          filter_tags: tags.length > 0 ? tags : null,
          date_after: dateRange?.start || null,
          date_before: dateRange?.end || null,
          filter_user_id: userFilter
        });

      if (error) {
        console.error('❌ Optimized search failed:', error);
        throw error;
      }

      console.log(`📊 pgvector returned: ${data?.length || 0} results`);
      if (data && data.length > 0) {
        console.log(`🎯 Top similarity: ${data[0].similarity} (should be ~0.3-0.8 range)`);
      }

      const queryTime = Date.now() - startTime;
      this.recordPerformanceMetric('pgvector', queryTime);

      console.log(`⚡ pgvector search: ${queryTime}ms, ${data.length} results`);
      
      // Convert to format expected by application
      // ✅ No distance-to-similarity conversion needed - SQL function now returns similarities
      const results = data.map(chunk => ({
        ...chunk,
        // Add computed fields for compatibility
        recency_score: chunk.date_end ? 
          Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 0.5,
        combined_score: chunk.similarity, // Already a similarity from SQL function
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
    const { limit = 10, threshold = 0.3, skills = [], tags = [], dateRange = null, userFilter = null } = options;

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

    // Apply user filter for multi-tenant support
    if (userFilter) query = query.eq('user_id', userFilter);

    // Limit to 1000 records (the current workaround)
    query = query.limit(1000);
    
    const { data, error } = await query;
    if (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }

    console.log(`📊 Retrieved ${data?.length || 0} chunks for similarity calculation`);
    
    // 🔍 DEBUG: Check what we actually got from the database
    if (data && data.length > 0) {
      console.log(`🔍 First chunk data analysis:`);
      console.log(`   - embedding type: ${typeof data[0].embedding}`);
      console.log(`   - embedding sample: ${data[0].embedding?.toString().substring(0, 50)}...`);
      console.log(`   - embedding length: ${data[0].embedding?.toString().length}`);
    }

    if (!data || data.length === 0) {
      return [];
    }

    // Calculate similarity for all chunks (JavaScript approach)
    const resultsWithSimilarity = data
      .map(chunk => {
        let similarity = 0;
        
        if (chunk.embedding && queryEmbedding) {
          // 🔍 DEBUG: Add logging to see what's happening
          console.log(`🔍 DEBUG similarity calc for chunk ${chunk.id}:`);
          console.log(`   - chunk.embedding type: ${typeof chunk.embedding}`);
          console.log(`   - chunk.embedding constructor: ${chunk.embedding?.constructor?.name}`);
          
          // Use embedding utilities for consistent parsing and calculation
          similarity = calculateCosineSimilarity(queryEmbedding, chunk.embedding);
          
          console.log(`   - calculated similarity: ${similarity}`);
          
          // Only log for first chunk to avoid spam
          if (chunk.id === data[0].id) {
            console.log(`   - This should be ~0.03 if vector parsing works correctly`);
          }
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
    const { userFilter = null } = options;
    const useVector = await this.checkVectorOptimization();
    
    // DEBUG: Log decision process
    console.log(`🔍 Search method decision:`);
    console.log(`  - useVector: ${useVector}`);
    console.log(`  - isArray: ${Array.isArray(queryEmbedding)}`);
    console.log(`  - embedding length: ${queryEmbedding?.length}`);
    console.log(`  - userFilter: ${userFilter ? 'applied' : 'none'}`);
    
    if (useVector && Array.isArray(queryEmbedding) && queryEmbedding.length === 1024) {
      try {
        console.log('🚀 Attempting pgvector search...');
        return await this.searchChunksOptimized(queryEmbedding, options);
      } catch (error) {
        console.warn('⚠️ Optimized search failed, falling back to legacy:', error.message);
        this.useVectorOptimization = false; // Disable for this session
        return await this.searchChunksLegacy(queryEmbedding, options);
      }
    } else {
      console.log('🔄 Using legacy search (pgvector conditions not met)');
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
      const [sourcesResult, chunksResult, uniqueSkills] = await Promise.all([
        this.supabase.from('sources').select('id', { count: 'exact' }),
        this.supabase.from('content_chunks').select('id', { count: 'exact' }),
        this.getUniqueSkills()
      ]);

      return {
        total_sources: sourcesResult.count || 0,
        total_chunks: chunksResult.count || 0,
        total_skills: uniqueSkills.length,
        source_breakdown: [],
        performance: this.getPerformanceStats()
      };
    } catch (error) {
      console.error('Stats error:', error);
      return {
        total_sources: 0,
        total_chunks: 0,
        total_skills: 0,
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