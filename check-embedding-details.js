import { supabase } from './config/database.js';

async function checkEmbeddingDetails() {
  console.log('🔍 Checking embedding details...');
  
  // Get one chunk with its embedding details
  const { data, error } = await supabase
    .from('content_chunks')
    .select('id, title, embedding')
    .limit(1)
    .single();
  
  if (error) {
    console.error('❌ Query error:', error);
    return;
  }
  
  console.log('📊 Sample chunk embedding details:');
  console.log('- ID:', data.id);
  console.log('- Title:', data.title);
  console.log('- Embedding type:', typeof data.embedding);
  console.log('- Embedding is array:', Array.isArray(data.embedding));
  
  if (data.embedding) {
    console.log('- Embedding length:', data.embedding.length);
    console.log('- First 5 values:', data.embedding.slice(0, 5));
    console.log('- Is all zeros?', data.embedding.every(x => x === 0));
  }
  
  // Check if the issue is dimension mismatch
  console.log('\n🔍 Schema check - expected vs actual dimensions:');
  console.log('- Expected: 1024 (Cohere v3.0)');
  console.log('- Schema says: 1536 (OpenAI ada-002)'); 
  console.log('- Actual:', data.embedding?.length || 'null');
}

checkEmbeddingDetails();