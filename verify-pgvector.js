#!/usr/bin/env node

/**
 * Verify pgvector setup and test performance improvements
 */

import { supabase } from './config/database.js';

async function verifyPgVector() {
  console.log('🔍 Verifying pgvector setup and performance...');
  console.log('================================================\n');

  try {
    // Test 1: Check if pgvector functions are available
    console.log('1. Testing pgvector functions...');
    
    const { data: stats, error: statsError } = await supabase
      .rpc('get_vector_search_stats');
    
    if (statsError) {
      console.log(`❌ pgvector functions not available: ${statsError.message}`);
      console.log('Please run the SQL commands in PGVECTOR-SETUP-COMMANDS.sql first');
      return;
    }
    
    console.log('✅ pgvector functions working');
    console.log(`📊 Stats: ${stats[0].chunks_with_vectors}/${stats[0].total_chunks} chunks have vectors`);
    
    if (stats[0].chunks_with_vectors === 0) {
      console.log('❌ No vector embeddings found. Migration may have failed.');
      return;
    }
    
    // Test 2: Check if embedding_vector column exists and has data
    console.log('\n2. Checking embedding_vector column...');
    
    const { data: sampleChunk, error: chunkError } = await supabase
      .from('content_chunks')
      .select('id, embedding_vector, embedding')
      .not('embedding_vector', 'is', null)
      .limit(1);
    
    if (chunkError) {
      console.log(`❌ Cannot access embedding_vector column: ${chunkError.message}`);
      return;
    }
    
    if (!sampleChunk || sampleChunk.length === 0) {
      console.log('❌ No chunks with vector embeddings found');
      return;
    }
    
    console.log('✅ embedding_vector column populated');
    
    // Test 3: Performance comparison
    console.log('\n3. Testing search performance...');
    
    const testEmbedding = JSON.parse(sampleChunk[0].embedding);
    
    // Test JavaScript similarity (legacy method)
    console.log('   Testing legacy JavaScript similarity...');
    const jsStartTime = Date.now();
    
    const { data: jsResults, error: jsError } = await supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, skills, tags, date_start, date_end, embedding,
        sources (id, type, title, org, location)
      `)
      .not('embedding', 'is', null)
      .limit(1000); // Legacy approach loads many records
    
    if (jsError) {
      console.log(`❌ Legacy query failed: ${jsError.message}`);
      return;
    }
    
    const jsEndTime = Date.now();
    const jsTime = jsEndTime - jsStartTime;
    console.log(`   📊 Legacy method: ${jsTime}ms (${jsResults.length} chunks loaded for processing)`);
    
    // Test pgvector similarity (optimized method)
    console.log('   Testing pgvector similarity...');
    const vectorStartTime = Date.now();
    
    const { data: vectorResults, error: vectorError } = await supabase
      .rpc('fast_similarity_search', {
        query_embedding: testEmbedding,
        similarity_threshold: 0.3,
        max_results: 10
      });
    
    if (vectorError) {
      console.log(`❌ Vector search failed: ${vectorError.message}`);
      return;
    }
    
    const vectorEndTime = Date.now();
    const vectorTime = vectorEndTime - vectorStartTime;
    console.log(`   📊 pgvector method: ${vectorTime}ms (${vectorResults.length} results)`);
    
    // Calculate improvement
    if (vectorTime > 0) {
      const improvement = Math.round(jsTime / vectorTime * 10) / 10;
      console.log(`   🚀 Performance improvement: ${improvement}x faster`);
    }
    
    // Test 4: Verify the system auto-detects pgvector
    console.log('\n4. Testing automatic pgvector detection...');
    
    const { db } = await import('./config/database.js');
    
    const appStartTime = Date.now();
    const appResults = await db.searchChunks(testEmbedding, {
      threshold: 0.3,
      limit: 10
    });
    const appEndTime = Date.now();
    const appTime = appEndTime - appStartTime;
    
    const perfStats = db.getPerformanceStats();
    
    console.log(`   📊 Application search: ${appTime}ms (${appResults.length} results)`);
    console.log(`   🔧 Search method: ${perfStats.searchMethod}`);
    console.log(`   📈 Average query time: ${perfStats.avgTimeMs}ms`);
    
    if (perfStats.searchMethod === 'pgvector') {
      console.log('   ✅ Application automatically using pgvector');
    } else {
      console.log('   ⚠️  Application still using legacy method');
    }
    
    // Test 5: Index verification
    console.log('\n5. Checking vector indexes...');
    
    const { data: indexes, error: indexError } = await supabase
      .from('pg_indexes')
      .select('indexname, indexdef')
      .like('indexdef', '%embedding_vector%');
    
    if (indexError) {
      console.log('⚠️  Could not check indexes');
    } else if (indexes.length > 0) {
      console.log(`✅ ${indexes.length} vector index(es) found`);
      indexes.forEach(idx => {
        console.log(`   - ${idx.indexname}`);
      });
    } else {
      console.log('⚠️  No vector indexes found - creating index will improve performance');
    }
    
    // Final status
    console.log('\n🎉 pgvector Verification Complete!');
    console.log('===================================');
    
    if (perfStats.searchMethod === 'pgvector' && vectorTime < jsTime) {
      console.log('✅ pgvector is working perfectly');
      console.log('✅ Performance dramatically improved');
      console.log('✅ System automatically using optimized queries');
      console.log(`✅ Average speed improvement: ${Math.round(jsTime / vectorTime)}x faster`);
    } else if (stats[0].chunks_with_vectors > 0) {
      console.log('⚠️  pgvector is set up but may not be fully optimized');
      console.log('💡 Try creating the vector index for better performance');
    } else {
      console.log('❌ pgvector setup incomplete');
      console.log('🔧 Run the migration SQL commands again');
    }
    
  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('1. Ensure you ran all SQL commands in PGVECTOR-SETUP-COMMANDS.sql');
    console.log('2. Check that pgvector extension is enabled in your Supabase project');
    console.log('3. Verify you have proper database permissions');
  }
}

// Run verification if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  verifyPgVector().catch(console.error);
}

export default verifyPgVector;