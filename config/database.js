const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

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
  // Search chunks with filters and ranking
  async searchChunks(queryEmbedding, options = {}) {
    const {
      filterSkills = [],
      filterTags = [],
      filterIndustries = [],
      dateAfter = null,
      similarityThreshold = 0.78,
      maxResults = 12
    } = options;

    // Use public schema since tables were created there
    let query = supabase
      .from('content_chunks')
      .select('*');

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

    query = query.limit(maxResults);

    const { data, error } = await query;

    if (error) {
      console.error('Database search error:', error);
      throw new Error(`Search failed: ${error.message}`);
    }

    // Transform the data to match expected format
    const transformedData = (data || []).map(chunk => ({
      chunk_id: chunk.id,
      source_id: chunk.source_id,
      title: chunk.title,
      content: chunk.content,
      content_summary: chunk.content_summary,
      skills: chunk.skills,
      tags: chunk.tags,
      similarity: 0.85, // Mock similarity for now - would come from vector search
      recency_score: chunk.date_end ? 
        Math.max(0, 1.0 - (Date.now() - new Date(chunk.date_end).getTime()) / (365 * 24 * 60 * 60 * 1000 * 2)) : 1.0,
      source_title: 'Fed Fusion AI', // Mock data for now
      source_type: 'project',
      source_org: 'Self-Developed',
      date_start: chunk.date_start,
      date_end: chunk.date_end
    }));

    return transformedData;
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
  }
};

module.exports = { supabase, db };