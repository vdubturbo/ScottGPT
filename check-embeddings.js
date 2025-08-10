import { supabase } from './config/database.js';

async function checkEmbeddings() {
  console.log('🔍 Checking embedding storage...');
  
  // Check if any chunks have embeddings
  const { data, error } = await supabase
    .from('content_chunks')
    .select('id, title, embedding')
    .not('embedding', 'is', null)
    .limit(5);
  
  if (error) {
    console.error('❌ Query error:', error);
    return;
  }
  
  console.log(`📊 Found ${data?.length || 0} chunks WITH embeddings`);
  
  // Check total count
  const { count } = await supabase
    .from('content_chunks')
    .select('id', { count: 'exact' });
  
  console.log(`📊 Total chunks in database: ${count}`);
  
  // Check how many have null embeddings
  const { count: nullCount } = await supabase
    .from('content_chunks')
    .select('id', { count: 'exact' })
    .is('embedding', null);
    
  console.log(`❌ Chunks with NULL embeddings: ${nullCount}`);
  console.log(`✅ Chunks with embeddings: ${count - nullCount}`);
}

checkEmbeddings();