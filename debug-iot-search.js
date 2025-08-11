import { db, supabase } from './config/database.js';
import EmbeddingService from './services/embeddings.js';

async function debugIoTSearch() {
  try {
    console.log('🔍 Debugging IoT search specifically...');
    
    // Test 1: Direct search for IoT in database
    console.log('\n=== Test 1: Direct IoT search ===');
    const iotChunks = await supabase
      .from('content_chunks')
      .select('*')
      .or('title.ilike.%IoT%,content.ilike.%IoT%,skills.cs.{IoT}');
    
    console.log(`Found ${iotChunks.data?.length || 0} chunks with IoT content`);
    if (iotChunks.data?.length > 0) {
      console.log('IoT chunks found:', iotChunks.data.map(chunk => ({
        id: chunk.id,
        title: chunk.title,
        skills: chunk.skills,
        tags: chunk.tags,
        content_preview: chunk.content?.substring(0, 200) + '...'
      })));
    }
    
    // Test 2: Search for IoT using the embedding service
    console.log('\n=== Test 2: IoT embedding search ===');
    const embeddingService = new EmbeddingService();
    const iotEmbedding = await embeddingService.embedText('IoT Internet of Things experience', 'search_query');
    console.log(`IoT embedding generated: ${iotEmbedding?.length || 'failed'} dimensions`);
    
    if (iotEmbedding) {
      const iotSearchResults = await db.searchChunks(iotEmbedding, {
        similarityThreshold: 0.3,
        maxResults: 10
      });
      
      console.log(`IoT embedding search returned: ${iotSearchResults?.length || 0} results`);
      if (iotSearchResults?.length > 0) {
        console.log('IoT search results:');
        iotSearchResults.forEach((result, i) => {
          console.log(`  ${i + 1}. ${result.title} (similarity: ${result.similarity})`);
          console.log(`     Skills: ${result.skills}`);
          console.log(`     Tags: ${result.tags}`);
        });
      }
    }
    
    // Test 3: Check recent chunks to see what was just indexed
    console.log('\n=== Test 3: Recent chunks ===');
    const recentChunks = await supabase
      .from('content_chunks')
      .select('id, title, skills, tags, created_at')
      .order('created_at', { ascending: false })
      .limit(10);
    
    console.log('Recently created chunks:');
    recentChunks.data?.forEach((chunk, i) => {
      console.log(`  ${i + 1}. ${chunk.title} (${chunk.created_at})`);
      console.log(`     Skills: ${chunk.skills}`);
      console.log(`     Tags: ${chunk.tags}`);
    });
    
    // Test 4: Test the actual chat endpoint logic
    console.log('\n=== Test 4: Simulating chat query ===');
    const chatQuery = "What IoT experience does Scott have?";
    const chatEmbedding = await embeddingService.embedText(chatQuery, 'search_query');
    
    if (chatEmbedding) {
      const chatResults = await db.searchChunks(chatEmbedding, {
        similarityThreshold: 0.7,
        maxResults: 5
      });
      
      console.log(`Chat simulation returned: ${chatResults?.length || 0} results for "${chatQuery}"`);
      if (chatResults?.length > 0) {
        console.log('Chat search results:');
        chatResults.forEach((result, i) => {
          console.log(`  ${i + 1}. ${result.title} (similarity: ${result.similarity})`);
        });
      } else {
        console.log('❌ No results found for IoT chat query - this explains the "no information" response!');
      }
    }
    
  } catch (error) {
    console.error('IoT search debug error:', error);
  }
}

debugIoTSearch();
