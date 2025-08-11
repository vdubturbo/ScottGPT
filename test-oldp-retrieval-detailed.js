import { db } from './config/database.js';
import EmbeddingService from './services/embeddings.js';

async function testDetailedOLDP() {
  console.log('=== DETAILED OLDP SEARCH DEBUG ===');
  
  const embeddings = new EmbeddingService();
  const query = "Tell me about Scott's OLDP experience at Lockheed Martin";
  
  try {
    // Step 1: Get query embedding and filters
    const queryEmbedding = await embeddings.embedText(query, 'search_query');
    const filters = embeddings.extractFilters(query);
    const threshold = embeddings.calculateSimilarityThreshold(query);
    
    console.log(`🔍 Query: "${query}"`);
    console.log(`🎯 Threshold: ${threshold}`);
    console.log(`🏷️ Filters:`, filters);
    
    // Step 2: Direct database call
    console.log('\n=== DIRECT DATABASE SEARCH ===');
    const directResults = await db.searchChunks(queryEmbedding, {
      skills: filters.skills,
      tags: filters.tags,
      threshold: threshold,
      limit: 50 // Get more results to see what's available
    });
    
    console.log(`📊 Direct search returned: ${directResults.length} chunks`);
    
    // Look for OLDP in direct results
    console.log('\n🔍 Looking for OLDP in direct results:');
    let foundOLDP = false;
    directResults.forEach((result, i) => {
      const isOLDP = result.title?.toLowerCase().includes('operations leadership') || 
                     result.title?.toLowerCase().includes('oldp');
      if (isOLDP) {
        foundOLDP = true;
        console.log(`   ✅ FOUND: ${i+1}. Similarity: ${result.similarity.toFixed(3)} | ${result.sources?.org} | ${result.title}`);
      }
    });
    
    if (!foundOLDP) {
      console.log('   ❌ No OLDP chunks found in direct results');
      
      // Check what the top results are
      console.log('\n📊 Top 10 direct results:');
      directResults.slice(0, 10).forEach((result, i) => {
        console.log(`   ${i+1}. ${result.similarity.toFixed(3)} | ${result.sources?.org} | ${result.title?.substring(0, 50)}`);
      });
    }
    
    // Step 3: Test without filters
    console.log('\n=== SEARCH WITHOUT FILTERS ===');
    const noFilterResults = await db.searchChunks(queryEmbedding, {
      skills: [],
      tags: [],
      threshold: 0.1,
      limit: 100 // Get many results
    });
    
    console.log(`📊 No-filter search returned: ${noFilterResults.length} chunks`);
    
    // Look for OLDP in no-filter results
    console.log('\n🔍 Looking for OLDP in no-filter results:');
    foundOLDP = false;
    noFilterResults.forEach((result, i) => {
      const isOLDP = result.title?.toLowerCase().includes('operations leadership') || 
                     result.title?.toLowerCase().includes('oldp');
      if (isOLDP) {
        foundOLDP = true;
        console.log(`   ✅ FOUND: Position ${i+1}. Similarity: ${result.similarity.toFixed(3)} | ${result.sources?.org} | ${result.title}`);
      }
    });
    
    if (!foundOLDP) {
      console.log('   ❌ No OLDP chunks found even without filters - this suggests a deeper issue');
    }
    
    // Step 4: Manual similarity calculation for known OLDP chunks
    console.log('\n=== MANUAL OLDP SIMILARITY CHECK ===');
    const { supabase } = await import('./config/database.js');
    const { data: oldpChunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, title, embedding,
        sources (title, org)
      `)
      .or('title.ilike.%operations leadership%,title.ilike.%oldp%')
      .not('embedding', 'is', null);
    
    if (error) {
      console.error('Error getting OLDP chunks:', error);
    } else {
      console.log(`📋 Found ${oldpChunks.length} OLDP chunks for manual similarity test:`);
      
      oldpChunks.forEach((chunk, i) => {
        let chunkEmbedding = chunk.embedding;
        if (typeof chunkEmbedding === 'string') {
          chunkEmbedding = JSON.parse(chunkEmbedding);
        }
        
        const similarity = db.cosineSimilarity(queryEmbedding, chunkEmbedding);
        const aboveThreshold = similarity >= threshold;
        console.log(`   ${i+1}. ${similarity.toFixed(3)} ${aboveThreshold ? '✅' : '❌'} | ${chunk.sources?.org} | ${chunk.title}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testDetailedOLDP();