import express from 'express';
import EmbeddingService from '../services/embeddings.js';
import { db } from '../config/database.js';
import { api as logger } from '../utils/logger.js';

const router = express.Router();

// POST /api/data/ingest - Ingest resume data into vector database
router.post('/ingest', async (req, res) => {
  try {
    const { data, type = 'resume', metadata = {} } = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Data is required for ingestion' });
    }

    // Initialize embedding service
    const embeddingService = new EmbeddingService();
    
    // Step 1: Process and chunk the resume data
    const chunks = processDataIntoChunks(data, type);
    
    // Step 2: Generate embeddings for all chunks
    const chunkTexts = chunks.map(chunk => chunk.content);
    const embeddings = await embeddingService.embedTexts(chunkTexts, 'search_document');
    
    // Step 3: Store chunks with embeddings in Supabase
    const storedChunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunkData = {
        ...chunks[i],
        embedding: embeddings[i],
        metadata: {
          ...metadata,
          ingested_at: new Date().toISOString(),
          chunk_index: i,
          total_chunks: chunks.length
        }
      };
      
      const stored = await db.insertChunk(chunkData);
      storedChunks.push(stored);
    }
    
    res.json({ 
      success: true,
      message: `Successfully ingested ${storedChunks.length} chunks`,
      chunks_created: storedChunks.length,
      chunk_ids: storedChunks.map(c => c.id)
    });
  } catch (error) {
    logger.error('Data ingestion failed', {
      error: error.message,
      stack: error.stack,
      dataType: req.body.type,
      hasData: !!req.body.data
    });
    res.status(500).json({ error: 'Failed to ingest data' });
  }
});

// Helper function to process data into chunks
function processDataIntoChunks(data, type) {
  const chunks = [];
  const chunkSize = 500; // Characters per chunk
  const overlap = 50; // Overlap between chunks
  
  if (type === 'resume' || type === 'text') {
    // Split text into overlapping chunks
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      const chunkContent = text.slice(i, i + chunkSize);
      
      // Extract skills and tags from chunk content
      const skills = extractSkills(chunkContent);
      const tags = extractTags(chunkContent);
      
      chunks.push({
        content: chunkContent,
        content_summary: chunkContent.slice(0, 200), // First 200 chars as summary
        skills: skills,
        tags: tags,
        source_type: type,
        title: `Chunk ${chunks.length + 1}`
      });
    }
  } else if (type === 'structured') {
    // Handle structured data (JSON format)
    if (data.experiences) {
      data.experiences.forEach(exp => {
        chunks.push({
          content: `${exp.title} at ${exp.company}: ${exp.description}`,
          content_summary: exp.description.slice(0, 200),
          skills: exp.skills || [],
          tags: exp.tags || [],
          source_type: 'experience',
          title: exp.title,
          date_start: exp.date_start,
          date_end: exp.date_end
        });
      });
    }
    
    if (data.projects) {
      data.projects.forEach(proj => {
        chunks.push({
          content: `${proj.name}: ${proj.description}`,
          content_summary: proj.description.slice(0, 200),
          skills: proj.technologies || [],
          tags: proj.tags || [],
          source_type: 'project',
          title: proj.name
        });
      });
    }
  }
  
  return chunks;
}

// Extract skills from text
function extractSkills(text) {
  const skillPatterns = [
    'Python', 'JavaScript', 'TypeScript', 'React', 'Node.js',
    'AWS', 'Docker', 'Kubernetes', 'Machine Learning', 'AI',
    'RAG', 'Vector Database', 'PostgreSQL', 'MongoDB',
    'REST API', 'GraphQL', 'Microservices', 'DevOps',
    'IoT', 'Internet of Things', 'Connected Devices', 'Edge Computing',
    'Sensors', 'Smart Devices', 'Industrial IoT', 'IIoT'
  ];
  
  const foundSkills = [];
  const textLower = text.toLowerCase();
  
  skillPatterns.forEach(skill => {
    if (textLower.includes(skill.toLowerCase())) {
      foundSkills.push(skill);
    }
  });
  
  return [...new Set(foundSkills)];
}

// Extract tags from text
function extractTags(text) {
  const tagPatterns = {
    'Technical Leadership': /lead|manage|architect|principal/i,
    'AI Product': /product|ai|ml|machine learning/i,
    'Platform Development': /platform|infrastructure|system/i,
    'Healthcare': /health|medical|clinical/i,
    'Government': /government|federal|public sector/i,
    'Cybersecurity': /security|cyber|threat|vulnerability/i,
    'IoT': /iot|internet of things|connected devices|smart devices|sensors|edge computing/i
  };
  
  const foundTags = [];
  
  Object.entries(tagPatterns).forEach(([tag, pattern]) => {
    if (pattern.test(text)) {
      foundTags.push(tag);
    }
  });
  
  return [...new Set(foundTags)];
}

// GET /api/data/debug-search - Debug search results for a query
router.get('/debug-search', async (req, res) => {
  try {
    const { q: query = 'AI experience' } = req.query;
    
    // Import services
    const RetrievalService = (await import('../services/retrieval.js')).default;
    const retrieval = new RetrievalService();
    
    console.log(`🔍 DEBUG: Searching for "${query}"`);
    
    // Get raw search results
    const contextResult = await retrieval.retrieveContext(query, {
      maxResults: 10,
      includeMetadata: true,
      rerankResults: true
    });
    
    // Format results for inspection
    const debugResults = {
      query: query,
      total_found: contextResult.totalFound,
      chunks_returned: contextResult.chunks.length,
      avg_similarity: contextResult.avgSimilarity,
      threshold_used: contextResult.similarityThreshold,
      
      chunks: contextResult.chunks.map(chunk => ({
        id: chunk.id,
        source_id: chunk.source_id,
        title: chunk.title,
        similarity: chunk.similarity,
        combined_score: chunk.combined_score,
        content_preview: chunk.content.substring(0, 200) + '...',
        full_content: chunk.content,
        skills: chunk.skills,
        tags: chunk.tags,
        source_info: {
          title: chunk.sources?.title,
          type: chunk.sources?.type,
          org: chunk.sources?.org,
          location: chunk.sources?.location
        },
        date_range: {
          start: chunk.date_start,
          end: chunk.date_end
        }
      })),
      
      sources: contextResult.sources
    };
    
    res.json(debugResults);
    
  } catch (error) {
    console.error('Debug search error:', error);
    res.status(500).json({ 
      error: 'Debug search failed',
      message: error.message 
    });
  }
});

// GET /api/data/all-chunks - List all chunks in database
router.get('/all-chunks', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    // Get all chunks from database
    const { data: chunks, error } = await db.supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, skills, tags,
        date_start, date_end, created_at,
        sources (id, type, title, org, location)
      `)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));
    
    if (error) throw error;
    
    const formatted = chunks.map(chunk => ({
      id: chunk.id,
      source_id: chunk.source_id,
      title: chunk.title,
      content_preview: chunk.content.substring(0, 150) + '...',
      full_content: chunk.content,
      skills: chunk.skills,
      tags: chunk.tags,
      source_info: {
        title: chunk.sources?.title,
        type: chunk.sources?.type,
        org: chunk.sources?.org,
        location: chunk.sources?.location
      },
      date_range: {
        start: chunk.date_start,
        end: chunk.date_end
      },
      created_at: chunk.created_at
    }));
    
    res.json({
      total_chunks: chunks.length,
      chunks: formatted
    });
    
  } catch (error) {
    console.error('All chunks fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch chunks',
      message: error.message 
    });
  }
});

// GET /api/data/test-db - Test database connectivity
router.get('/test-db', async (req, res) => {
  try {
    console.log('🔍 Testing database connectivity...');
    
    // Test 1: Basic connection
    const { data: testQuery, error: testError } = await db.supabase
      .from('content_chunks')
      .select('count')
      .limit(1);
    
    if (testError) {
      return res.json({
        status: 'error',
        message: 'Database connection failed',
        error: testError.message,
        details: testError
      });
    }
    
    // Test 2: Check if tables exist
    const tableChecks = await Promise.allSettled([
      db.supabase.from('sources').select('count').limit(1),
      db.supabase.from('content_chunks').select('count').limit(1),
      db.supabase.from('skills').select('count').limit(1).catch(() => ({ data: null, error: 'Skills table may not exist' }))
    ]);
    
    // Test 3: Get actual counts
    const { data: sourceCount } = await db.supabase
      .from('sources')
      .select('id', { count: 'exact' });
      
    const { data: chunkCount } = await db.supabase
      .from('content_chunks')
      .select('id', { count: 'exact' });
    
    res.json({
      status: 'success',
      connection: 'working',
      tables: {
        sources: tableChecks[0].status === 'fulfilled' ? 'exists' : 'missing/error',
        content_chunks: tableChecks[1].status === 'fulfilled' ? 'exists' : 'missing/error',
        skills: tableChecks[2].status === 'fulfilled' ? 'exists' : 'missing/error'
      },
      counts: {
        sources: sourceCount?.length || 0,
        content_chunks: chunkCount?.length || 0
      },
      supabase_url: process.env.SUPABASE_URL ? 'configured' : 'missing',
      api_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'configured' : 'missing'
    });
    
  } catch (error) {
    console.error('Database test error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Database test failed',
      error: error.message
    });
  }
});

// GET /api/data/stats - Get database statistics
router.get('/stats', async (req, res) => {
  try {
    // Get chunk count and statistics from database
    const chunkStats = await db.getChunkStats();
    const sourceStats = await db.getSourceStats();
    
    // Extract unique skills and tags
    const allSkills = await db.getUniqueSkills();
    const allTags = await db.getUniqueTags();
    
    res.json({
      total_documents: sourceStats.count || 0,
      total_chunks: chunkStats.count || 0,
      total_embeddings: chunkStats.count || 0,
      categories: {
        skills: allSkills || [],
        tags: allTags || [],
        source_types: sourceStats.types || []
      },
      last_updated: chunkStats.last_updated || null
    });
  } catch (error) {
    logger.error('Database stats retrieval failed', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({ error: 'Failed to get database stats' });
  }
});

export default router;
