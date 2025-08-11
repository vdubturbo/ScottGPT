import { supabase } from './config/database.js';

async function checkOLDPEmbeddings() {
  console.log('=== CHECKING OLDP EMBEDDINGS ===');
  
  try {
    // Get OLDP chunks with embeddings
    const { data: oldpChunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, content, embedding, created_at,
        sources (title, org)
      `)
      .or('title.ilike.%operations leadership%,title.ilike.%oldp%')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error('Error:', error);
      return;
    }
    
    console.log(`📋 OLDP chunks found: ${oldpChunks.length}`);
    
    oldpChunks.forEach((chunk, i) => {
      const hasEmbedding = chunk.embedding !== null;
      const embeddingInfo = hasEmbedding ? 
        (Array.isArray(chunk.embedding) ? 
          chunk.embedding.length + 'D' : 
          JSON.parse(chunk.embedding).length + 'D') 
        : 'NULL';
      
      console.log(`${i+1}. ID ${chunk.id} | Embedding: ${embeddingInfo}`);
      console.log(`   Title: ${chunk.title}`);
      console.log(`   Org: ${chunk.sources?.org || 'Unknown'}`);
      console.log(`   Created: ${chunk.created_at}`);
      
      if (chunk.content && chunk.content.toLowerCase().includes('oldp')) {
        const preview = chunk.content.substring(0, 150).replace(/\n/g, ' ');
        console.log(`   Content preview: ${preview}...`);
      }
    });
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

checkOLDPEmbeddings();