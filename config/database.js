import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

/**
 * Clean, minimal RAG/Vector search implementation
 * Based on working pre-multi-tenancy approach
 */
class VectorDatabase {
  constructor(client) {
    this.supabase = client;
  }

  /**
   * Core vector search - no fallbacks, no complexity
   * Uses pgvector with cosine similarity
   */
  async searchSimilar(queryEmbedding, options = {}) {
    const {
      threshold = 0.3,
      maxResults = 20,
      userFilter = null
    } = options;

    // Validate embedding
    if (!Array.isArray(queryEmbedding) || queryEmbedding.length !== 1024) {
      throw new Error(`Invalid embedding: expected array of 1024 numbers, got ${typeof queryEmbedding} with length ${queryEmbedding?.length}`);
    }

    console.log(`🔍 Vector search: threshold=${threshold}, maxResults=${maxResults}, userFilter=${userFilter || 'none'}`);
    
    const startTime = Date.now();

    // Simple direct pgvector query using cosine distance
    const { data, error } = await this.supabase
      .from('content_chunks')
      .select(`
        id,
        title,
        content,
        content_summary,
        skills,
        tags,
        date_start,
        date_end,
        embedding,
        sources (
          id,
          type,
          title,
          org,
          location
        )
      `)
      .not('embedding', 'is', null)
      .eq('user_id', userFilter || '345850e8-4f02-48cb-9789-d40e9cc3ee8e')
      .limit(maxResults * 3); // Get more for similarity calculation

    if (error) {
      console.error('❌ Vector search failed:', error.message);
      throw new Error(`Vector search failed: ${error.message}`);
    }

    if (!data || data.length === 0) {
      console.log('⚠️ No chunks found for user');
      return [];
    }

    console.log(`📊 Retrieved ${data.length} chunks in ${Date.now() - startTime}ms`);

    // Calculate similarities and apply threshold
    const results = [];
    for (const chunk of data) {
      if (!chunk.embedding) continue;
      
      // Parse embedding from database
      let embeddingArray;
      try {
        if (typeof chunk.embedding === 'string') {
          embeddingArray = JSON.parse(chunk.embedding);
        } else {
          embeddingArray = chunk.embedding;
        }
      } catch (e) {
        console.warn(`⚠️ Could not parse embedding for chunk ${chunk.id}`);
        continue;
      }

      // Calculate cosine similarity
      const similarity = this.cosineSimilarity(queryEmbedding, embeddingArray);
      
      if (similarity >= threshold) {
        results.push({
          ...chunk,
          similarity,
          source_id: chunk.sources?.id,
          source_type: chunk.sources?.type,
          source_title: chunk.sources?.title,
          source_org: chunk.sources?.org,
          source_location: chunk.sources?.location
        });
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity);
    
    const finalResults = results.slice(0, maxResults);
    console.log(`✅ Found ${finalResults.length} results above threshold ${threshold}`);
    
    if (finalResults.length > 0) {
      console.log(`🎯 Top similarity: ${finalResults[0].similarity.toFixed(3)}`);
    }

    return finalResults;
  }

  /**
   * Simple cosine similarity calculation
   */
  cosineSimilarity(vecA, vecB) {
    if (!Array.isArray(vecA) || !Array.isArray(vecB) || vecA.length !== vecB.length) {
      return 0;
    }

    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }

    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);

    if (magnitudeA === 0 || magnitudeB === 0) {
      return 0;
    }

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Insert content chunk with embedding
   */
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
        embedding: Array.isArray(chunkData.embedding) 
          ? `[${chunkData.embedding.join(',')}]`
          : chunkData.embedding,
        user_id: chunkData.user_id || '345850e8-4f02-48cb-9789-d40e9cc3ee8e'
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Insert source
   */
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
        outcomes: sourceData.outcomes // Add outcomes field
      })
      .select('id')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get database stats
   */
  async getStats() {
    const [sourcesResult, chunksResult] = await Promise.all([
      this.supabase.from('sources').select('id', { count: 'exact' }),
      this.supabase.from('content_chunks').select('id', { count: 'exact' })
    ]);

    return {
      total_sources: sourcesResult.count || 0,
      total_chunks: chunksResult.count || 0
    };
  }
}

export const db = new VectorDatabase(supabase);