import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Use service role for server operations

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Database helper functions
const db = {
  // Search chunks with filters and ranking using vector similarity
  async searchChunks(queryEmbedding, options = {}) {
    const {
      filterSkills = [],
      filterTags = [],
      filterIndustries = [], // eslint-disable-line no-unused-vars
      dateAfter = null,
      similarityThreshold = 0.78,
      maxResults = 12
    } = options;

    try {
      // Build the RPC call for vector similarity search
      // This assumes you have a PostgreSQL function for vector similarity
      // If not using pgvector, we'll do a regular search with filters
      
      let query = supabase
        .from('content_chunks')
        .select(`
          *,
          sources(
            title,
            type,
            org
          )
        `);

      // Apply filters
      if (filterSkills.length > 0) {
        query = query.overlaps('skills', filterSkills);
      }
      
      if (filterTags.length > 0) {
        query = query.overlaps('tags', filterTags);
      }
      
      if (dateAfter) {
        query = query.gte('date_end', dateAfter);
      }

      query = query.limit(200); // Get a large sample to ensure we don't miss recent additions

      const { data, error } = await query;

      if (error) {
        console.error('Database search error:', error);
        throw new Error(`Search failed: ${error.message}`);
      }

      console.log(`📊 Found ${data?.length || 0} chunks before similarity filtering`);

      // Calculate cosine similarity for each chunk if we have embeddings
      let rankedResults = [];
      
      console.log(`🧮 Query embedding dimensions: ${queryEmbedding?.length || 'none'}`);
      
      if (queryEmbedding && Array.isArray(queryEmbedding)) {
        rankedResults = (data || []).map(chunk => {
          // Calculate cosine similarity if chunk has embedding
          let similarity = 0;
          let chunkEmbedding = chunk.embedding;
          
          // Handle different embedding formats (string, array, or parsed)
          if (chunkEmbedding) {
            if (typeof chunkEmbedding === 'string') {
              try {
                chunkEmbedding = JSON.parse(chunkEmbedding);
              } catch (e) {
                console.log(`❌ Chunk ${chunk.id}: invalid embedding format`);
                chunkEmbedding = null;
              }
            }
            
            if (Array.isArray(chunkEmbedding) && chunkEmbedding.length > 0) {
              similarity = this.cosineSimilarity(queryEmbedding, chunkEmbedding);
              console.log(`📊 Chunk ${chunk.id}: similarity ${similarity.toFixed(4)} (embedding: ${chunkEmbedding.length}d)`);
            } else {
              console.log(`❌ Chunk ${chunk.id}: embedding not array (${typeof chunkEmbedding})`);
            }
          } else {
            console.log(`❌ Chunk ${chunk.id}: no embedding found`);
          }

          // Calculate recency score (higher for more recent content)
          const recencyScore = chunk.date_end ? 
            Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 1.0;

          return {
            chunk_id: chunk.id,
            source_id: chunk.source_id,
            title: chunk.title,
            content: chunk.content,
            content_summary: chunk.content_summary,
            skills: chunk.skills || [],
            tags: chunk.tags || [],
            similarity: similarity,
            recency_score: recencyScore,
            combined_score: (similarity * 0.8) + (recencyScore * 0.2), // Weighted combination
            source_title: chunk.sources?.title || 'Unknown Source',
            source_type: chunk.sources?.type || chunk.source_type || 'unknown',
            source_org: chunk.sources?.org || 'Unknown',
            date_start: chunk.date_start,
            date_end: chunk.date_end
          };
        });

        console.log(`🔍 Before filtering: ${rankedResults.length} results`);
        console.log(`📊 Similarity threshold: ${similarityThreshold}`);
        
        // Filter by similarity threshold and sort by combined score
        const filtered = rankedResults.filter(r => r.similarity >= similarityThreshold);
        console.log(`✅ After similarity filtering: ${filtered.length} results`);
        
        rankedResults = filtered
          .sort((a, b) => b.combined_score - a.combined_score)
          .slice(0, maxResults);
      } else {
        // No embedding provided, return filtered results without similarity ranking
        rankedResults = (data || []).slice(0, maxResults).map(chunk => ({
          chunk_id: chunk.id,
          source_id: chunk.source_id,
          title: chunk.title,
          content: chunk.content,
          content_summary: chunk.content_summary,
          skills: chunk.skills || [],
          tags: chunk.tags || [],
          similarity: 0.5, // Default similarity when no embedding
          recency_score: chunk.date_end ? 
            Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 1.0,
          source_title: chunk.sources?.title || 'Unknown Source',
          source_type: chunk.sources?.type || chunk.source_type || 'unknown',
          source_org: chunk.sources?.org || 'Unknown',
          date_start: chunk.date_start,
          date_end: chunk.date_end
        }));
      }

      return rankedResults;
    } catch (error) {
      console.error('Search error:', error);
      throw error;
    }
  },

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
  },

  // Insert new source
  async insertSource(sourceData) {
    const { data, error } = await supabase
      .from('sources')
      .insert(sourceData)
      .select()
      .single();

    if (error) {
      console.error('Source insertion error:', error);
      throw new Error(`Failed to insert source: ${error.message}`);
    }

    return data;
  },

  // Insert new content chunk
  async insertChunk(chunkData) {
    const { data, error } = await supabase
      .from('content_chunks')
      .insert(chunkData)
      .select()
      .single();

    if (error) {
      console.error('Chunk insertion error:', error);
      throw new Error(`Failed to insert chunk: ${error.message}`);
    }

    return data;
  },

  // Get all sources
  async getSources() {
    const { data, error } = await supabase
      .from('sources')
      .select('*')
      .order('date_start', { ascending: false });

    if (error) {
      console.error('Sources fetch error:', error);
      throw new Error(`Failed to fetch sources: ${error.message}`);
    }

    return data || [];
  },

  // Get chunks for a specific source
  async getChunksBySource(sourceId) {
    const { data, error } = await supabase
      .from('content_chunks')
      .select('*')
      .eq('source_id', sourceId)
      .order('date_start', { ascending: false });

    if (error) {
      console.error('Chunks fetch error:', error);
      throw new Error(`Failed to fetch chunks: ${error.message}`);
    }

    return data || [];
  },

  // Update chunk embedding
  async updateChunkEmbedding(chunkId, embedding, summaryEmbedding = null) {
    const updateData = { embedding };
    if (summaryEmbedding) {
      updateData.summary_embedding = summaryEmbedding;
    }

    const { data, error } = await supabase
      .from('content_chunks')
      .update(updateData)
      .eq('id', chunkId)
      .select()
      .single();

    if (error) {
      console.error('Embedding update error:', error);
      throw new Error(`Failed to update embedding: ${error.message}`);
    }

    return data;
  },

  // Get synonyms for query expansion
  async getSynonyms(term) {
    const { data, error } = await supabase
      .from('synonyms')
      .select('aliases')
      .ilike('term', `%${term}%`)
      .limit(5);

    if (error) {
      console.error('Synonyms fetch error:', error);
      return [];
    }

    return data?.flatMap(row => row.aliases) || [];
  },

  // Get skills for normalization
  async getSkills() {
    const { data, error } = await supabase
      .from('skills')
      .select('*')
      .order('name');

    if (error) {
      console.error('Skills fetch error:', error);
      return [];
    }

    return data || [];
  },

  // Get database statistics
  async getStats() {
    try {
      const [sourcesResult, chunksResult] = await Promise.all([
        supabase.from('sources').select('type', { count: 'exact' }),
        supabase.from('content_chunks').select('id', { count: 'exact' })
      ]);

      const sourceStats = {};
      if (sourcesResult.data) {
        sourcesResult.data.forEach(source => {
          sourceStats[source.type] = (sourceStats[source.type] || 0) + 1;
        });
      }

      return {
        total_sources: sourcesResult.count || 0,
        total_chunks: chunksResult.count || 0,
        source_breakdown: sourceStats
      };
    } catch (error) {
      console.error('Stats fetch error:', error);
      return {
        total_sources: 0,
        total_chunks: 0,
        source_breakdown: {}
      };
    }
  },

  // Get chunk statistics
  async getChunkStats() {
    try {
      const { data, error, count } = await supabase
        .from('content_chunks')
        .select('created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {throw error;}

      return {
        count: count || 0,
        last_updated: data && data.length > 0 ? data[0].created_at : null
      };
    } catch (error) {
      console.error('Chunk stats error:', error);
      return { count: 0, last_updated: null };
    }
  },

  // Get source statistics
  async getSourceStats() {
    try {
      const { data, error, count } = await supabase
        .from('sources')
        .select('type', { count: 'exact' });

      if (error) {throw error;}

      const types = [...new Set(data?.map(s => s.type) || [])];

      return {
        count: count || 0,
        types: types
      };
    } catch (error) {
      console.error('Source stats error:', error);
      return { count: 0, types: [] };
    }
  },

  // Get unique skills
  async getUniqueSkills() {
    try {
      const { data, error } = await supabase
        .from('content_chunks')
        .select('skills');

      if (error) {throw error;}

      const allSkills = new Set();
      data?.forEach(chunk => {
        if (chunk.skills && Array.isArray(chunk.skills)) {
          chunk.skills.forEach(skill => allSkills.add(skill));
        }
      });

      return Array.from(allSkills).sort();
    } catch (error) {
      console.error('Unique skills error:', error);
      return [];
    }
  },

  // Get unique tags
  async getUniqueTags() {
    try {
      const { data, error } = await supabase
        .from('content_chunks')
        .select('tags');

      if (error) {throw error;}

      const allTags = new Set();
      data?.forEach(chunk => {
        if (chunk.tags && Array.isArray(chunk.tags)) {
          chunk.tags.forEach(tag => allTags.add(tag));
        }
      });

      return Array.from(allTags).sort();
    } catch (error) {
      console.error('Unique tags error:', error);
      return [];
    }
  }
};

export { supabase, db };