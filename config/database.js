import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

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
        embedding: chunkData.embedding,
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
    
    // Start with basic query
    let query = this.supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, content_summary, skills, tags,
        date_start, date_end, token_count, embedding,
        sources (id, type, title, org, location)
      `);

    // Apply filters
    if (skills.length > 0) {
      console.log(`🏷️ Filtering by skills: ${skills.join(', ')}`);
      query = query.overlaps('skills', skills);
    }
    if (tags.length > 0) {
      console.log(`🏷️ Filtering by tags: ${tags.join(', ')}`);
      query = query.overlaps('tags', tags);
    }
    if (dateRange?.start) query = query.gte('date_start', dateRange.start);
    if (dateRange?.end) query = query.lte('date_end', dateRange.end);

    // Get a large sample for similarity calculation
    query = query.limit(200);

    const { data, error } = await query;
    if (error) {
      console.error('❌ Database query error:', error);
      throw error;
    }

    console.log(`📊 Retrieved ${data?.length || 0} chunks for similarity calculation`);

    if (!data || data.length === 0) {
      console.log('📭 No chunks found matching filters');
      return [];
    }

    // If no query embedding, return filtered results
    if (!queryEmbedding || !Array.isArray(queryEmbedding)) {
      console.log('📋 No embedding provided, returning filtered results');
      return data.slice(0, limit).map(chunk => ({
        ...chunk,
        similarity: 0.5,
        combined_score: 0.5
      }));
    }

    // Calculate similarity for each chunk
    const rankedResults = data
      .map(chunk => {
        let similarity = 0;
        
        if (chunk.embedding) {
          try {
            let chunkEmbedding = chunk.embedding;
            
            // Parse embedding if it's a string
            if (typeof chunkEmbedding === 'string') {
              chunkEmbedding = JSON.parse(chunkEmbedding);
            }
            
            if (Array.isArray(chunkEmbedding) && chunkEmbedding.length === queryEmbedding.length) {
              similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
            }
          } catch (error) {
            console.warn(`⚠️ Failed to parse embedding for chunk ${chunk.id}:`, error.message);
          }
        }
        
        // Calculate recency score (higher for more recent content)
        const recencyScore = chunk.date_end ? 
          Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 0.5;
        
        const combinedScore = (similarity * 0.8) + (recencyScore * 0.2);
        
        return {
          ...chunk,
          similarity,
          recency_score: recencyScore,
          combined_score: combinedScore
        };
      })
      .filter(chunk => chunk.similarity >= threshold)
      .sort((a, b) => b.combined_score - a.combined_score)
      .slice(0, limit);

    console.log(`✅ Returning ${rankedResults.length} chunks above threshold ${threshold}`);
    if (rankedResults.length > 0) {
      console.log(`📊 Best similarity: ${rankedResults[0].similarity.toFixed(3)}`);
    }

    return rankedResults;
  }

  // Calculate cosine similarity between two vectors
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
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
}

export const db = new Database(supabase);