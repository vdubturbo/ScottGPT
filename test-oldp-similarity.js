import EmbeddingService from './services/embeddings.js';
import { db } from './config/database.js';

async function testOLDPSimilarity() {
  console.log('=== TESTING OLDP SIMILARITY ===');
  
  const embeddings = new EmbeddingService();
  const queries = [
    "Tell me about Scott's OLDP experience at Lockheed Martin",
    "What leadership development programs did Scott participate in?",
    "Operations Leadership Development Program",
    "OLDP Lockheed Martin"
  ];
  
  try {
    // Get OLDP chunks directly
    const { supabase } = await import('./config/database.js');
    const { data: oldpChunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content, embedding,
        sources (title, org)
      `)
      .or('title.ilike.%operations leadership%,title.ilike.%oldp%')
      .not('embedding', 'is', null);
    
    if (error) {
      console.error('Error getting OLDP chunks:', error);
      return;
    }
    
    console.log(`📋 Found ${oldpChunks.length} OLDP chunks with embeddings`);
    
    for (const query of queries) {
      console.log(`\n🔍 Testing query: "${query}"`);
      
      const queryEmbedding = await embeddings.embedText(query, 'search_query');
      
      // Calculate similarity with each OLDP chunk
      oldpChunks.forEach((chunk, i) => {
        let chunkEmbedding = chunk.embedding;
        
        // Parse embedding if it's a string
        if (typeof chunkEmbedding === 'string') {
          chunkEmbedding = JSON.parse(chunkEmbedding);
        }
        
        if (Array.isArray(chunkEmbedding) && chunkEmbedding.length === queryEmbedding.length) {
          const similarity = db.cosineSimilarity(queryEmbedding, chunkEmbedding);
          console.log(`   ${i+1}. Similarity: ${similarity.toFixed(3)} | ${chunk.sources?.org} | ${chunk.title}`);
          
          if (similarity > 0.3) {
            const preview = chunk.content.substring(0, 100).replace(/\n/g, ' ');
            console.log(`      📋 Content: ${preview}...`);
          }
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOLDPSimilarity();