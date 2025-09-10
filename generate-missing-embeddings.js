#!/usr/bin/env node

import { supabase } from './config/database.js';
import EmbeddingService from './services/embeddings.js';

async function generateMissingEmbeddings() {
  console.log('🚀 Generating missing embeddings for all chunks...\n');
  
  try {
    const embeddings = new EmbeddingService();
    
    // Get all chunks without embeddings
    console.log('1️⃣ Finding chunks without embeddings...');
    const chunksResult = await supabase
      .from('content_chunks')
      .select('id, title, content, user_id')
      .is('embedding_vector', null);
      
    if (chunksResult.error) {
      console.error('❌ Query failed:', chunksResult.error);
      return;
    }
    
    const chunks = chunksResult.data || [];
    console.log(`📊 Found ${chunks.length} chunks without embeddings`);
    
    if (chunks.length === 0) {
      console.log('✅ All chunks already have embeddings!');
      return;
    }
    
    // Process each chunk
    let processed = 0;
    let errors = 0;
    
    console.log('\n2️⃣ Generating embeddings...');
    for (const chunk of chunks) {
      try {
        console.log(`   Processing chunk ${chunk.id}: "${chunk.title?.substring(0, 50)}..."`);
        
        // Create text for embedding (title + content)
        const textContent = `${chunk.title || ''}\n${chunk.content || ''}`.trim();
        
        if (!textContent) {
          console.log(`   ⚠️ Skipping chunk ${chunk.id} - no text content`);
          continue;
        }
        
        // Generate embedding
        const embedding = await embeddings.embedText(textContent, 'search_document');
        
        if (!embedding || embedding.length === 0) {
          console.log(`   ❌ Failed to generate embedding for chunk ${chunk.id}`);
          errors++;
          continue;
        }
        
        console.log(`   ✅ Generated ${embedding.length}-dim embedding`);
        
        // Update chunk with embedding
        const updateResult = await supabase
          .from('content_chunks')
          .update({ 
            embedding_vector: embedding,
            embedding: embedding // Also update the embedding field if it exists
          })
          .eq('id', chunk.id);
          
        if (updateResult.error) {
          console.log(`   ❌ Failed to save embedding for chunk ${chunk.id}:`, updateResult.error.message);
          errors++;
        } else {
          console.log(`   💾 Saved embedding to database`);
          processed++;
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        console.error(`   ❌ Error processing chunk ${chunk.id}:`, error.message);
        errors++;
      }
    }
    
    console.log(`\n3️⃣ Summary:`);
    console.log(`   ✅ Successfully processed: ${processed} chunks`);
    console.log(`   ❌ Errors: ${errors} chunks`);
    console.log(`   📊 Total chunks: ${chunks.length}`);
    
    if (processed > 0) {
      console.log('\n🎉 Embeddings generated! Now testing pgvector search...');
      
      // Test the pgvector search with a simple query
      console.log('\n4️⃣ Testing pgvector search...');
      const testEmbedding = await embeddings.embedText("Tell me about PMO experience", 'search_query');
      
      const testResult = await supabase.rpc('fast_similarity_search', {
        query_embedding: testEmbedding,
        similarity_threshold: 0.1,
        max_results: 3,
        filter_user_id: '345850e8-4f02-48cb-9789-d40e9cc3ee8e' // Use correct Scott user ID
      });
      
      if (testResult.error) {
        console.log('   ❌ Test search failed:', testResult.error);
      } else {
        console.log(`   ✅ Test search returned ${testResult.data?.length || 0} results`);
        testResult.data?.slice(0, 3).forEach((result, i) => {
          console.log(`      ${i+1}. "${result.title?.substring(0,40)}..." - Similarity: ${result.similarity?.toFixed(4)}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Script error:', error);
  }
}

generateMissingEmbeddings().finally(() => process.exit(0));