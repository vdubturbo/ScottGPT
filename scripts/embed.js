/**
 * Database-Based Embedding Generator for ScottGPT Pipeline
 * Replaces file-based indexer with pure database processing
 * 
 * Process: Read validated chunks from pipeline_chunks → Generate embeddings → Store in database
 */

import { pipelineStorage } from '../services/pipeline-storage.js';
import { generateEmbedding } from '../services/embeddings.js';
import 'dotenv/config';

// Performance tracking
let performanceStats = {
  totalChunks: 0,
  successfulEmbeddings: 0,
  failedEmbeddings: 0,
  skippedChunks: 0,
  totalTime: 0,
  averageEmbeddingTime: 0
};

/**
 * Generate embeddings for validated chunks in database
 */
async function embedPipelineChunks() {
  const startTime = Date.now();
  console.log('🚀 [EMBED] Starting database-based embedding generation...');
  console.log('📅 Started at:', new Date().toISOString());
  
  // Check environment variables
  if (!process.env.COHERE_API_KEY) {
    console.error('❌ COHERE_API_KEY not found in environment');
    process.exit(1);
  }
  
  console.log('✅ Cohere API key found');
  
  // Check if database tables are available
  let useDatabase = false;
  try {
    await pipelineStorage.initializeStorage();
    useDatabase = true;
    console.log('✅ Database tables available - proceeding with database embedding');
  } catch (error) {
    console.error('❌ Database tables not available - cannot proceed');
    console.error(`   Error: ${error.message}`);
    console.error('💡 Run setup-pipeline-tables.sql and add-pipeline-embeddings.sql first');
    process.exit(1);
  }
  
  try {
    // Get validated documents that need embedding
    const validatedDocs = await pipelineStorage.getDocumentsByStatus('validated');
    console.log(`📋 Found ${validatedDocs.length} validated documents`);
    
    if (validatedDocs.length === 0) {
      console.log('📄 No validated documents found for embedding');
      console.log('💡 Run validate script first to validate extracted chunks');
      return;
    }
    
    // Process each document's chunks
    for (let i = 0; i < validatedDocs.length; i++) {
      const doc = validatedDocs[i];
      console.log(`\n📖 [${i + 1}/${validatedDocs.length}] Processing: ${doc.original_name}`);
      
      try {
        // Get validated chunks for this document
        const docWithChunks = await pipelineStorage.getDocumentWithChunks(doc.id);
        const validChunks = docWithChunks.pipeline_chunks.filter(
          chunk => chunk.validation_status === 'valid'
        );
        
        console.log(`📋 Found ${validChunks.length} valid chunks for embedding`);
        
        if (validChunks.length === 0) {
          console.log('⚠️ No valid chunks found for document, skipping');
          continue;
        }
        
        // Generate embeddings for each chunk
        for (let j = 0; j < validChunks.length; j++) {
          const chunk = validChunks[j];
          console.log(`\n🧠 [CHUNK ${j + 1}/${validChunks.length}] Generating embeddings...`);
          
          try {
            // Skip if already embedded
            if (chunk.embedding_status === 'completed') {
              console.log('✅ Chunk already has embeddings, skipping');
              performanceStats.skippedChunks++;
              continue;
            }
            
            // Mark as processing
            await updateChunkEmbeddingStatus(chunk.id, 'processing');
            
            const embedStartTime = Date.now();
            
            // Generate content embedding
            console.log(`📝 Content preview: ${chunk.content.substring(0, 100)}...`);
            const contentEmbedding = await generateEmbedding(chunk.content);
            
            // Generate summary embedding (if chunk has title/summary)
            let summaryEmbedding = null;
            const summaryText = chunk.title || chunk.summary;
            if (summaryText) {
              console.log(`📋 Summary: ${summaryText.substring(0, 50)}...`);
              summaryEmbedding = await generateEmbedding(summaryText);
            }
            
            const embedTime = Date.now() - embedStartTime;
            
            // Store embeddings in database
            await storeChunkEmbeddings(chunk.id, {
              embedding: contentEmbedding,
              summary_embedding: summaryEmbedding,
              embedding_status: 'completed'
            });
            
            console.log(`✅ Embeddings generated in ${embedTime}ms`);
            console.log(`   Content embedding: ${contentEmbedding.length}D vector`);
            if (summaryEmbedding) {
              console.log(`   Summary embedding: ${summaryEmbedding.length}D vector`);
            }
            
            performanceStats.successfulEmbeddings++;
            performanceStats.totalTime += embedTime;
            
          } catch (chunkError) {
            console.error(`❌ [CHUNK ERROR] Failed to embed chunk ${chunk.id}:`, chunkError.message);
            
            // Mark chunk as failed
            try {
              await updateChunkEmbeddingStatus(chunk.id, 'failed');
            } catch (statusError) {
              console.error(`❌ Failed to update chunk status:`, statusError.message);
            }
            
            performanceStats.failedEmbeddings++;
            
            // Continue with other chunks rather than failing entire document
          }
        }
        
        // Mark document as embedded if all valid chunks are processed
        const completedChunks = validChunks.filter(async chunk => {
          const updated = await getChunkById(chunk.id);
          return updated.embedding_status === 'completed';
        });
        
        if (completedChunks.length === validChunks.length) {
          console.log(`🎉 All chunks embedded for ${doc.original_name}`);
          // Optionally update document status to 'embedded' 
          // await pipelineStorage.storeStatus(doc.id, 'embedded');
        }
        
        performanceStats.totalChunks += validChunks.length;
        
      } catch (docError) {
        console.error(`❌ [DOCUMENT ERROR] Failed to process ${doc.original_name}:`, docError.message);
        continue;
      }
    }
    
  } catch (error) {
    console.error('❌ [PIPELINE ERROR] Embedding generation failed:', error.message);
    throw error;
  }
  
  // Performance summary
  const totalDuration = Date.now() - startTime;
  performanceStats.averageEmbeddingTime = performanceStats.successfulEmbeddings > 0 
    ? performanceStats.totalTime / performanceStats.successfulEmbeddings 
    : 0;
  
  console.log('\n🎯 DATABASE EMBEDDING SUMMARY:');
  console.log('=' .repeat(50));
  console.log(`⏱️  Total processing time: ${(totalDuration/1000).toFixed(1)}s`);
  console.log(`📊 Total chunks processed: ${performanceStats.totalChunks}`);
  console.log(`✅ Successful embeddings: ${performanceStats.successfulEmbeddings}`);
  console.log(`❌ Failed embeddings: ${performanceStats.failedEmbeddings}`);
  console.log(`⏭️  Skipped chunks: ${performanceStats.skippedChunks}`);
  console.log(`⚡ Average embedding time: ${performanceStats.averageEmbeddingTime.toFixed(0)}ms`);
  
  if (performanceStats.successfulEmbeddings > 0) {
    console.log(`🎉 Successfully generated ${performanceStats.successfulEmbeddings} embeddings!`);
    console.log(`🔍 Chunks are now searchable in the database`);
  }
  
  if (performanceStats.failedEmbeddings > 0) {
    console.log(`⚠️ ${performanceStats.failedEmbeddings} chunks failed - check logs above`);
  }
  
  console.log(`📅 Completed at: ${new Date().toISOString()}`);
}

/**
 * Update chunk embedding status
 */
async function updateChunkEmbeddingStatus(chunkId, status) {
  const { error } = await pipelineStorage.supabase
    .from('pipeline_chunks')
    .update({
      embedding_status: status,
      updated_at: new Date().toISOString()
    })
    .eq('id', chunkId);
    
  if (error) throw error;
}

/**
 * Store embeddings in database
 */
async function storeChunkEmbeddings(chunkId, embeddings) {
  const updateData = {
    embedding_status: embeddings.embedding_status,
    updated_at: new Date().toISOString()
  };
  
  if (embeddings.embedding) {
    updateData.embedding = `[${embeddings.embedding.join(',')}]`;
  }
  
  if (embeddings.summary_embedding) {
    updateData.summary_embedding = `[${embeddings.summary_embedding.join(',')}]`;
  }
  
  const { error } = await pipelineStorage.supabase
    .from('pipeline_chunks')
    .update(updateData)
    .eq('id', chunkId);
    
  if (error) throw error;
}

/**
 * Get chunk by ID (for status checking)
 */
async function getChunkById(chunkId) {
  const { data, error } = await pipelineStorage.supabase
    .from('pipeline_chunks')
    .select('embedding_status')
    .eq('id', chunkId)
    .single();
    
  if (error) throw error;
  return data;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  embedPipelineChunks().catch(error => {
    console.error('Embedding generation failed:', error);
    process.exit(1);
  });
}

export default embedPipelineChunks;