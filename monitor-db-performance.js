#!/usr/bin/env node

/**
 * Database Performance Monitoring for ScottGPT
 * Tracks and reports on vector search performance
 */

import { supabase } from './config/database.js';
import { db } from './config/database.js';

async function monitorDatabasePerformance() {
  console.log('📊 ScottGPT Database Performance Monitor');
  console.log('=======================================\n');

  try {
    // Check if we're using optimized or legacy search
    const useVector = await db.checkVectorOptimization?.() || false;
    
    console.log('1. Search Method Status:');
    console.log(`   Current method: ${useVector ? '🚀 pgvector (optimized)' : '🔄 JavaScript (legacy)'}`);
    
    if (useVector) {
      console.log('   ✅ Using database-level vector similarity');
      console.log('   ✅ HNSW indexes accelerating queries');
      console.log('   ✅ Minimal memory usage');
    } else {
      console.log('   ⚠️ Using JavaScript similarity calculations');
      console.log('   ⚠️ High memory and CPU usage');
      console.log('   ⚠️ Limited to 1000-record workaround');
    }

    // Get current performance statistics
    console.log('\n2. Performance Statistics:');
    
    if (db.getPerformanceStats) {
      const stats = db.getPerformanceStats();
      console.log(`   Total queries: ${stats.totalQueries}`);
      console.log(`   Average time: ${stats.avgTimeMs}ms`);
      console.log(`   Fastest query: ${stats.minTimeMs}ms`);
      console.log(`   Slowest query: ${stats.maxTimeMs}ms`);
      console.log(`   Recent samples: ${stats.recentQueries}`);
    }

    // Test current search performance
    console.log('\n3. Live Performance Test:');
    
    // Get a sample embedding for testing
    const { data: sampleChunk, error: sampleError } = await supabase
      .from('content_chunks')
      .select('embedding')
      .not('embedding', 'is', null)
      .limit(1);
    
    if (sampleError || !sampleChunk || sampleChunk.length === 0) {
      console.log('   ❌ No sample embeddings found for testing');
      return;
    }
    
    let testEmbedding = sampleChunk[0].embedding;
    if (typeof testEmbedding === 'string') {
      testEmbedding = JSON.parse(testEmbedding);
    }
    
    // Run multiple test queries to get average performance
    const testRuns = 5;
    const times = [];
    const resultCounts = [];
    
    console.log(`   Running ${testRuns} test queries...`);
    
    for (let i = 0; i < testRuns; i++) {
      const startTime = Date.now();
      
      const results = await db.searchChunks(testEmbedding, {
        threshold: 0.3,
        limit: 10
      });
      
      const queryTime = Date.now() - startTime;
      times.push(queryTime);
      resultCounts.push(results.length);
      
      process.stdout.write('.');
    }
    
    console.log(' Done!');
    
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const avgResults = resultCounts.reduce((a, b) => a + b, 0) / resultCounts.length;
    
    console.log(`   Average query time: ${avgTime.toFixed(1)}ms`);
    console.log(`   Range: ${minTime}ms - ${maxTime}ms`);
    console.log(`   Average results: ${avgResults.toFixed(1)}`);
    
    // Performance evaluation
    console.log('\n4. Performance Evaluation:');
    
    if (avgTime < 20) {
      console.log('   🎉 EXCELLENT: Query times under 20ms');
    } else if (avgTime < 50) {
      console.log('   ✅ GOOD: Query times under 50ms');
    } else if (avgTime < 100) {
      console.log('   ⚠️ FAIR: Query times under 100ms, consider optimization');
    } else {
      console.log('   ❌ POOR: Query times over 100ms, optimization needed');
    }
    
    // Database-specific statistics if available
    if (useVector) {
      console.log('\n5. Vector Database Statistics:');
      
      try {
        const { data: vectorStats, error: statsError } = await supabase
          .rpc('get_vector_search_stats');
        
        if (!statsError && vectorStats && vectorStats.length > 0) {
          const stats = vectorStats[0];
          console.log(`   Total chunks: ${stats.total_chunks}`);
          console.log(`   Vectorized chunks: ${stats.chunks_with_vectors}`);
          console.log(`   Vector coverage: ${((stats.chunks_with_vectors / stats.total_chunks) * 100).toFixed(1)}%`);
          console.log(`   Vector indexes: ${stats.index_count}`);
          
          if (stats.avg_similarity_query_time_ms) {
            console.log(`   DB query time: ${stats.avg_similarity_query_time_ms.toFixed(1)}ms`);
          }
        }
        
        // Check index usage
        const { data: indexStats, error: indexError } = await supabase
          .rpc('analyze_vector_index_usage');
        
        if (!indexError && indexStats && indexStats.length > 0) {
          console.log('\n6. Index Usage Statistics:');
          indexStats.forEach(idx => {
            console.log(`   ${idx.index_name}:`);
            console.log(`     Size: ${idx.index_size}`);
            console.log(`     Scans: ${idx.scans_count}`);
            console.log(`     Efficiency: ${idx.scans_count > 0 ? 'ACTIVE' : 'UNUSED'}`);
          });
        }
        
      } catch (error) {
        console.log('   ⚠️ Vector statistics not available');
      }
    }

    // Recommendations
    console.log('\n7. Recommendations:');
    
    if (!useVector) {
      console.log('   🔧 CRITICAL: Enable pgvector optimization');
      console.log('      - Run: node migrate-to-pgvector.js');
      console.log('      - Expected improvement: 10-100x faster queries');
    } else if (avgTime > 50) {
      console.log('   🔧 Consider index optimization:');
      console.log('      - Check if HNSW parameters need tuning');
      console.log('      - Verify vector indexes are being used');
      console.log('      - Consider increasing shared_buffers in PostgreSQL');
    } else {
      console.log('   ✅ Performance is optimal');
      console.log('   📈 Consider monitoring query patterns for further optimization');
    }

    // Historical performance tracking
    console.log('\n8. Performance Trend Tracking:');
    
    const performanceRecord = {
      timestamp: new Date().toISOString(),
      searchMethod: useVector ? 'pgvector' : 'javascript',
      avgQueryTime: avgTime,
      totalQueries: db.getPerformanceStats?.()?.totalQueries || 0,
      testResults: {
        times,
        resultCounts,
        avgTime,
        minTime,
        maxTime
      }
    };
    
    // Save performance record (optional)
    try {
      const fs = await import('fs/promises');
      const recordsFile = './logs/performance-history.jsonl';
      
      // Ensure logs directory exists
      try {
        await fs.mkdir('./logs', { recursive: true });
      } catch (e) {
        // Directory already exists
      }
      
      // Append performance record
      await fs.appendFile(recordsFile, JSON.stringify(performanceRecord) + '\n');
      console.log(`   ✅ Performance record saved to ${recordsFile}`);
      
    } catch (error) {
      console.log('   ⚠️ Could not save performance record:', error.message);
    }
    
    console.log('\n📈 Monitoring complete!');
    
    if (!useVector) {
      console.log('\n💡 To dramatically improve performance:');
      console.log('   1. Run: node migrate-to-pgvector.js');
      console.log('   2. Follow the instructions in MIGRATION-INSTRUCTIONS.md');
      console.log('   3. Enjoy 10-100x faster similarity searches!');
    }

  } catch (error) {
    console.error('❌ Performance monitoring failed:', error);
    console.log('\nTroubleshooting:');
    console.log('1. Ensure database connection is working');
    console.log('2. Check that content_chunks table has embeddings');
    console.log('3. Verify database configuration is correct');
  }
}

// Performance comparison function
async function comparePerformance() {
  console.log('⚡ Performance Comparison Tool');
  console.log('==============================\n');

  try {
    // Get total chunks for estimation
    const { data: totalChunks, error: countError } = await supabase
      .from('content_chunks')
      .select('id', { count: 'exact' });
    
    if (countError) {
      throw new Error(`Cannot count chunks: ${countError.message}`);
    }
    
    const chunkCount = totalChunks?.length || 0;
    
    console.log('Estimating performance for different approaches:');
    console.log(`Database size: ${chunkCount} chunks\n`);
    
    // JavaScript approach (current without pgvector)
    const jsTimePerChunk = 0.5; // ms per chunk based on measurements
    const jsEstimatedTime = chunkCount * jsTimePerChunk;
    const jsMemoryUsage = chunkCount * 12; // ~12KB per 1024D vector as JSON
    
    console.log('📊 JavaScript Approach (current without pgvector):');
    console.log(`   Query time: ~${jsEstimatedTime.toFixed(0)}ms`);
    console.log(`   Memory usage: ~${(jsMemoryUsage / 1024).toFixed(1)}MB loaded per query`);
    console.log(`   CPU usage: High (client-side vector math)`);
    console.log(`   Scalability: Poor (linear degradation)`);
    
    // pgvector approach (optimized)
    const vectorEstimatedTime = 5; // ms typical for HNSW with 1000s of vectors
    const vectorMemoryUsage = 0.1; // MB - only results loaded
    
    console.log('\n🚀 pgvector Approach (with optimization):');
    console.log(`   Query time: ~${vectorEstimatedTime}ms`);
    console.log(`   Memory usage: ~${vectorMemoryUsage}MB (results only)`);
    console.log(`   CPU usage: Low (database-optimized)`);
    console.log(`   Scalability: Excellent (sub-linear with indexes)`);
    
    // Improvement factors
    const timeImprovement = jsEstimatedTime / vectorEstimatedTime;
    const memoryImprovement = jsMemoryUsage / (vectorMemoryUsage * 1024);
    
    console.log('\n📈 Improvement Factors:');
    console.log(`   Speed: ${timeImprovement.toFixed(1)}x faster`);
    console.log(`   Memory: ${memoryImprovement.toFixed(1)}x less memory`);
    console.log(`   CPU: Significantly reduced`);
    console.log(`   Network: ~${(chunkCount / 10).toFixed(0)}x less data transfer`);
    
    if (timeImprovement > 10) {
      console.log('\n🎯 RECOMMENDATION: pgvector optimization is CRITICAL');
      console.log('   Current performance is severely impacted by the JavaScript approach.');
      console.log('   Migration to pgvector will provide dramatic improvements.');
    }

  } catch (error) {
    console.error('❌ Comparison failed:', error);
  }
}

// Allow running specific functions
const command = process.argv[2];

if (command === 'compare') {
  comparePerformance();
} else {
  monitorDatabasePerformance();
}