import EmbeddingService from './services/embeddings.js';
import { db } from './config/database.js';

async function testOLDPSearch() {
  console.log('=== TESTING OLDP SEARCH ===');
  
  const embeddings = new EmbeddingService();
  const query = "Tell me about Scott's OLDP experience at Lockheed Martin";
  
  console.log(`🔍 Testing query: "${query}"`);
  
  try {
    // Step 1: Generate query embedding
    console.log('\n1. Generating query embedding...');
    const queryEmbedding = await embeddings.embedText(query, 'search_query');
    console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions`);
    
    // Step 2: Extract filters
    console.log('\n2. Extracting filters...');
    const filters = embeddings.extractFilters(query);
    console.log('📋 Filters:', filters);
    
    // Step 3: Calculate similarity threshold
    const threshold = embeddings.calculateSimilarityThreshold(query);
    console.log(`🎯 Similarity threshold: ${threshold}`);
    
    // Step 4: Direct database search with embeddings
    console.log('\n4. Testing direct database search...');
    const searchResults = await db.searchChunks(queryEmbedding, {
      skills: filters.skills,
      tags: filters.tags,
      threshold: threshold,
      limit: 20
    });
    
    console.log(`📊 Search results: ${searchResults.length} chunks found`);
    if (searchResults.length > 0) {
      console.log('Top 10 results:');
      searchResults.slice(0, 10).forEach((result, i) => {
        const orgInfo = result.sources?.org || 'Unknown';
        const isOLDP = result.title?.toLowerCase().includes('operations leadership') || result.title?.toLowerCase().includes('oldp');
        console.log(`   ${i+1}. Similarity: ${result.similarity.toFixed(3)} ${isOLDP ? '🎯' : '  '} | ${orgInfo} | ${result.title?.substring(0, 60) || 'No title'}`);
      });
    }
    
    // Step 5: Search specifically for OLDP content without filters
    console.log('\n5. Testing without filters...');
    const noFilterResults = await db.searchChunks(queryEmbedding, {
      skills: [],
      tags: [],
      threshold: 0.1, // Very low threshold
      limit: 20
    });
    
    console.log(`📊 No-filter results: ${noFilterResults.length} chunks found`);
    if (noFilterResults.length > 0) {
      console.log('Top results looking for OLDP:');
      noFilterResults.forEach((result, i) => {
        const orgInfo = result.sources?.org || 'Unknown';
        const isOLDP = result.title?.toLowerCase().includes('operations leadership') || result.title?.toLowerCase().includes('oldp');
        const isLockheed = orgInfo.toLowerCase().includes('lockheed');
        if (isOLDP || isLockheed) {
          console.log(`   ${i+1}. Similarity: ${result.similarity.toFixed(3)} ${isOLDP ? '🎯' : '  '} | ${orgInfo} | ${result.title?.substring(0, 60) || 'No title'}`);
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOLDPSearch();