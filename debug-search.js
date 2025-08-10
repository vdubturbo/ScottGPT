import { db, supabase } from './config/database.js';
import EmbeddingService from './services/embeddings.js';

async function debugSearch() {
  try {
    console.log('🔍 Starting debug search...');
    
    // Test 1: Direct database query without embeddings
    console.log('\n=== Test 1: Database connection ===');
    const testChunks = await supabase
      .from('content_chunks')
      .select('id, title, skills, tags')
      .limit(5);
    
    console.log('Database query result:', testChunks);
    
    // Test 2: Search for AI-related chunks by skills
    console.log('\n=== Test 2: Skills-based search ===');
    const aiChunks = await supabase
      .from('content_chunks')
      .select('id, title, content, skills, tags')
      .overlaps('skills', ['AI/ML']);
    
    console.log(`Found ${aiChunks.data?.length || 0} chunks with AI/ML skill`);
    if (aiChunks.data?.length > 0) {
      console.log('Sample AI chunk:', {
        id: aiChunks.data[0].id,
        title: aiChunks.data[0].title,
        skills: aiChunks.data[0].skills,
        content: aiChunks.data[0].content?.substring(0, 200) + '...'
      });
    }
    
    // Test 3: Test embedding service
    console.log('\n=== Test 3: Embedding service ===');
    const embeddingService = new EmbeddingService();
    const testEmbedding = await embeddingService.embedText('AI experience', 'search_query');
    console.log(`Embedding generated: ${testEmbedding?.length || 'failed'} dimensions`);
    
    // Test 4: Test database search with null embedding (should return data without similarity)
    console.log('\n=== Test 4: Database search with null embedding ===');
    const searchResults = await db.searchChunks(null, {
      similarityThreshold: 0.0,
      maxResults: 5
    });
    
    console.log(`Search without embedding returned: ${searchResults?.length || 0} results`);
    
    // Test 5: Test database search with real embedding
    console.log('\n=== Test 5: Database search with embedding ===');
    if (testEmbedding) {
      const embeddingSearchResults = await db.searchChunks(testEmbedding, {
        similarityThreshold: 0.5,
        maxResults: 5
      });
      
      console.log(`Search with embedding returned: ${embeddingSearchResults?.length || 0} results`);
      if (embeddingSearchResults?.length > 0) {
        console.log('Top result:', {
          id: embeddingSearchResults[0].chunk_id,
          title: embeddingSearchResults[0].title,
          similarity: embeddingSearchResults[0].similarity,
          skills: embeddingSearchResults[0].skills
        });
      }
    }
    
  } catch (error) {
    console.error('Debug search error:', error);
  }
}

debugSearch();