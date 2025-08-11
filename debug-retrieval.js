import SimpleRetrievalService from './services/simple-retrieval.js';

async function debugRetrieval() {
  console.log('=== DEBUGGING RETRIEVAL ===');
  
  const retrieval = new SimpleRetrievalService();
  const query = "Tell me about Scott's IoT experience";
  
  try {
    console.log(`🔍 Testing retrieval for: "${query}"`);
    
    const result = await retrieval.retrieveContext(query, {
      maxResults: 10,
      includeMetadata: true,
      rerankResults: true
    });
    
    console.log(`📊 Retrieval result summary:`);
    console.log(`   - Total chunks found: ${result.totalFound}`);
    console.log(`   - Chunks returned: ${result.chunks?.length || 0}`);
    console.log(`   - Average similarity: ${result.avgSimilarity}`);
    console.log(`   - Search method used: ${result.searchMethod || 'semantic'}`);
    console.log(`   - Sources: ${result.sources?.length || 0}`);
    
    if (result.chunks && result.chunks.length > 0) {
      console.log('\n📋 Top chunks:');
      result.chunks.slice(0, 5).forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.similarity?.toFixed(3) || 'N/A'} | ${chunk.sources?.org || 'Unknown'} | ${chunk.title?.substring(0, 60) || 'No title'}`);
        if (chunk.content && chunk.content.toLowerCase().includes('iot')) {
          console.log(`      📍 Contains IoT: ${(chunk.content.match(/iot/gi) || []).length} mentions`);
        }
      });
    }
    
    // Test specifically for IoT content that should exist
    console.log('\n🔍 Direct search for known IoT content...');
    const { supabase } = await import('./config/database.js');
    
    const { data: iotChunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content, similarity: embedding,
        sources (title, org)
      `)
      .ilike('title', '%IoT%')
      .limit(5);
      
    if (error) {
      console.error('Direct IoT search error:', error);
    } else {
      console.log(`📋 Direct IoT title search found: ${iotChunks.length} chunks`);
      iotChunks.forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.sources?.org || 'Unknown'} | ${chunk.title}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugRetrieval();