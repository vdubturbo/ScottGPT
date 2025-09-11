/**
 * Database-Only Processing Pipeline for ScottGPT
 * Replaces file-based pipeline with pure database processing
 * 
 * Flow: Upload → Normalize → Extract → Validate → Embed → Searchable
 * All steps work entirely with database, no file system dependencies
 */

import normalize from './normalize.js';
import extract from './extract.js';
import validate from './validate.js';
import embedPipelineChunks from './embed.js';
import { pipelineStorage } from '../services/pipeline-storage.js';
import 'dotenv/config';

/**
 * Run the complete database-only pipeline
 */
async function runDatabasePipeline() {
  const startTime = Date.now();
  console.log('🚀 [PIPELINE] Starting database-only processing pipeline...');
  console.log('📅 Started at:', new Date().toISOString());
  
  // Check environment variables
  const requiredVars = ['OPENAI_API_KEY', 'COHERE_API_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:');
    missingVars.forEach(varName => console.error(`   - ${varName}`));
    console.error('Please check your .env file and ensure all variables are set.');
    process.exit(1);
  }
  
  console.log('✅ All required environment variables present');
  
  try {
    // Check database connectivity
    console.log('\n📋 Checking database connectivity...');
    await pipelineStorage.initializeStorage();
    const stats = await pipelineStorage.getPipelineStats();
    console.log(`✅ Database connected - Documents: ${JSON.stringify(stats.documents)}`);
    
    // Step 1: Normalize uploaded documents
    console.log('\n📄 STEP 1: Normalizing uploaded documents...');
    try {
      await normalize();
      console.log('✅ Step 1 completed: Document normalization');
    } catch (error) {
      console.error('❌ Step 1 failed:', error.message);
      throw error;
    }
    
    // Step 2: Extract structured data
    console.log('\n🧠 STEP 2: Extracting structured data with OpenAI...');
    try {
      await extract();
      console.log('✅ Step 2 completed: Data extraction');
    } catch (error) {
      console.error('❌ Step 2 failed:', error.message);
      throw error;
    }
    
    // Step 3: Validate extracted content
    console.log('\n🔍 STEP 3: Validating extracted content...');
    try {
      await validate();
      console.log('✅ Step 3 completed: Content validation');
    } catch (error) {
      console.error('❌ Step 3 failed:', error.message);
      throw error;
    }
    
    // Step 4: Generate embeddings (replaces file-based indexer)
    console.log('\n🔗 STEP 4: Generating embeddings with Cohere...');
    try {
      await embedPipelineChunks();
      console.log('✅ Step 4 completed: Embedding generation');
    } catch (error) {
      console.error('❌ Step 4 failed:', error.message);
      throw error;
    }
    
    // Pipeline completion summary
    const totalDuration = Date.now() - startTime;
    const finalStats = await pipelineStorage.getPipelineStats();
    
    console.log('\n🎉 DATABASE PIPELINE COMPLETED SUCCESSFULLY!');
    console.log('=' .repeat(60));
    console.log(`⏱️  Total pipeline time: ${(totalDuration/1000).toFixed(1)}s`);
    console.log(`📊 Final database state:`);
    console.log(`   Documents: ${JSON.stringify(finalStats.documents)}`);
    console.log(`   Chunks: ${JSON.stringify(finalStats.chunks)}`);
    console.log(`📅 Completed at: ${new Date().toISOString()}`);
    
    // Verify searchable content
    console.log('\n🔍 Verifying searchable content...');
    const searchableChunks = await getSearchableChunkCount();
    if (searchableChunks > 0) {
      console.log(`✅ ${searchableChunks} chunks are now searchable in the database`);
      console.log('🎯 Pipeline successful - content is ready for RAG queries!');
    } else {
      console.warn('⚠️ No searchable chunks found - check embedding generation step');
    }
    
    console.log('\n💡 Database-only benefits:');
    console.log('   ✅ No file system dependencies');
    console.log('   ✅ Serverless deployment ready');
    console.log('   ✅ Atomic operations with rollback capability');
    console.log('   ✅ Real-time status tracking');
    console.log('   ✅ Horizontal scaling support');
    
  } catch (error) {
    console.error('\n❌ DATABASE PIPELINE FAILED');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    console.log('\n🔧 Troubleshooting tips:');
    console.log('   1. Check all environment variables are set correctly');
    console.log('   2. Ensure database tables exist (run setup-pipeline-tables.sql)');
    console.log('   3. Add embedding columns (run add-pipeline-embeddings.sql)');
    console.log('   4. Verify API keys have proper permissions');
    console.log('   5. Check network connectivity to external services');
    
    process.exit(1);
  }
}

/**
 * Get count of chunks that are searchable (validated + embedded)
 */
async function getSearchableChunkCount() {
  try {
    const { data, error } = await pipelineStorage.supabase
      .from('pipeline_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('validation_status', 'valid')
      .eq('embedding_status', 'completed');
      
    if (error) {
      console.warn('Warning: Could not count searchable chunks:', error.message);
      return 0;
    }
    
    return data || 0;
  } catch (error) {
    console.warn('Warning: Error counting searchable chunks:', error.message);
    return 0;
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runDatabasePipeline().catch(error => {
    console.error('Pipeline failed:', error);
    process.exit(1);
  });
}

export default runDatabasePipeline;