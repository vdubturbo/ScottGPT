import { supabase } from './config/database.js';

async function checkEmbeddings() {
  console.log('=== EMBEDDING STATUS ANALYSIS ===');
  
  const { data: chunks, error } = await supabase
    .from('content_chunks')
    .select('id, source_id, title, embedding, created_at')
    .order('id', { ascending: false })
    .limit(20);
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Recent chunks embedding status:');
  chunks.forEach(chunk => {
    const hasEmbedding = chunk.embedding !== null;
    const embeddingInfo = hasEmbedding ? 
      (Array.isArray(chunk.embedding) ? 
        chunk.embedding.length + 'D' : 
        JSON.parse(chunk.embedding).length + 'D') 
      : 'NULL';
    
    console.log('ID ' + chunk.id + ': ' + embeddingInfo + ' | ' + chunk.title.substring(0, 50));
  });
  
  // Check total embedding stats
  const { data: embeddingStats, error: statsError } = await supabase
    .from('content_chunks')
    .select('id, embedding')
    .not('embedding', 'is', null);
    
  console.log('\nTotal chunks with embeddings: ' + (embeddingStats?.length || 0) + ' out of 531');
  
  if (embeddingStats && embeddingStats.length > 0) {
    console.log('Sample embedding preview:');
    const sampleEmbedding = embeddingStats[0].embedding;
    const embedding = Array.isArray(sampleEmbedding) ? sampleEmbedding : JSON.parse(sampleEmbedding);
    console.log('First few values:', embedding.slice(0, 5));
    console.log('Dimension:', embedding.length);
  }
}

checkEmbeddings();