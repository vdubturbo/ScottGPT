import RetrievalService from './services/retrieval.js';

async function debugOLDPSearch() {
  console.log('=== DEBUGGING FULL OLDP RETRIEVAL ===');
  
  const retrieval = new RetrievalService();
  const query = "Tell me about Scott's OLDP experience at Lockheed Martin";
  
  try {
    console.log(`🔍 Testing full retrieval for: "${query}"`);
    
    const result = await retrieval.retrieveContext(query, {
      maxResults: 20,
      includeMetadata: true,
      rerankResults: true
    });
    
    console.log(`📊 Full retrieval result:`);
    console.log(`   - Total chunks found: ${result.totalFound}`);
    console.log(`   - Chunks returned: ${result.chunks?.length || 0}`);
    console.log(`   - Average similarity: ${result.avgSimilarity}`);
    console.log(`   - Filters used: ${JSON.stringify(result.filters)}`);
    console.log(`   - Threshold used: ${result.similarityThreshold}`);
    
    if (result.chunks && result.chunks.length > 0) {
      console.log('\n📋 All returned chunks:');
      result.chunks.forEach((chunk, i) => {
        const orgInfo = chunk.sources?.org || 'Unknown';
        const isOLDP = chunk.title?.toLowerCase().includes('operations leadership') || chunk.title?.toLowerCase().includes('oldp');
        const isLockheed = orgInfo.toLowerCase().includes('lockheed');
        console.log(`   ${i+1}. ${chunk.similarity?.toFixed(3) || 'N/A'} ${isOLDP ? '🎯' : '  '} ${isLockheed ? '🏢' : '  '} | ${orgInfo} | ${chunk.title?.substring(0, 60) || 'No title'}`);
      });
      
      // Look specifically for OLDP content
      const oldpChunks = result.chunks.filter(chunk => 
        chunk.title?.toLowerCase().includes('operations leadership') || 
        chunk.title?.toLowerCase().includes('oldp')
      );
      
      console.log(`\n🎯 OLDP chunks in results: ${oldpChunks.length}`);
      if (oldpChunks.length === 0) {
        console.log('❌ No OLDP chunks found in retrieval results - this is the problem!');
      } else {
        oldpChunks.forEach((chunk, i) => {
          console.log(`   ${i+1}. ${chunk.similarity?.toFixed(3)} | ${chunk.title}`);
        });
      }
    }
    
    // Test with a different query that should definitely find OLDP
    console.log('\n=== TESTING DIRECT OLDP QUERY ===');
    const directQuery = "Operations Leadership Development Program";
    const directResult = await retrieval.retrieveContext(directQuery, {
      maxResults: 10,
      includeMetadata: true,
      rerankResults: true
    });
    
    console.log(`📊 Direct OLDP query result:`);
    console.log(`   - Chunks returned: ${directResult.chunks?.length || 0}`);
    console.log(`   - Average similarity: ${directResult.avgSimilarity}`);
    
    if (directResult.chunks) {
      directResult.chunks.slice(0, 5).forEach((chunk, i) => {
        const orgInfo = chunk.sources?.org || 'Unknown';
        const isOLDP = chunk.title?.toLowerCase().includes('operations leadership') || chunk.title?.toLowerCase().includes('oldp');
        console.log(`   ${i+1}. ${chunk.similarity?.toFixed(3) || 'N/A'} ${isOLDP ? '🎯' : '  '} | ${orgInfo} | ${chunk.title?.substring(0, 60) || 'No title'}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugOLDPSearch();