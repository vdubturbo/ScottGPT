import EmbeddingService from './services/embeddings.js';
import { db } from './config/database.js';

async function testSearchPipeline() {
  console.log('=== SEARCH PIPELINE TEST ===');
  
  const embeddings = new EmbeddingService();
  const query = "Tell me about Scott's IoT experience with Coca-Cola";
  
  console.log(`🔍 Testing query: "${query}"`);
  
  try {
    // Step 1: Generate query embedding
    console.log('\n1. Generating query embedding...');
    const queryEmbedding = await embeddings.embedText(query, 'search_query');
    console.log(`✅ Query embedding generated: ${queryEmbedding.length} dimensions`);
    console.log(`   First few values: ${queryEmbedding.slice(0, 5).map(v => v.toFixed(3)).join(', ')}`);
    
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
      console.log('Top 5 results:');
      searchResults.slice(0, 5).forEach((result, i) => {
        console.log(`   ${i+1}. Similarity: ${result.similarity.toFixed(3)} | ${result.title?.substring(0, 60) || 'No title'}`);
      });
    }
    
    // Step 5: Test with lower threshold
    console.log('\n5. Testing with lower threshold (0.3)...');
    const lowThresholdResults = await db.searchChunks(queryEmbedding, {
      skills: filters.skills,
      tags: filters.tags,
      threshold: 0.3,
      limit: 20
    });
    
    console.log(`📊 Low threshold results: ${lowThresholdResults.length} chunks found`);
    if (lowThresholdResults.length > 0) {
      console.log('Top 5 results:');
      lowThresholdResults.slice(0, 5).forEach((result, i) => {
        console.log(`   ${i+1}. Similarity: ${result.similarity.toFixed(3)} | ${result.title?.substring(0, 60) || 'No title'}`);
      });
    }
    
    // Step 6: Look for IoT and Coca-Cola content specifically
    console.log('\n6. Searching for IoT and Coca-Cola content...');
    const { data: iotContent, error } = await db.supabase
      .from('content_chunks')
      .select(`
        id, title, content, skills, tags,
        sources (title, org)
      `)
      .or('content.ilike.%iot%,content.ilike.%coca%,skills.cs.{IoT},sources.org.ilike.%coca%')
      .limit(10);
      
    if (error) {
      console.error('IoT/Coca-Cola search error:', error);
    } else {
      console.log(`📋 IoT/Coca-Cola content found: ${iotContent.length} chunks`);
      iotContent.forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.sources?.org || 'Unknown'} | ${chunk.title?.substring(0, 50) || 'No title'}`);
        const contentPreview = chunk.content.substring(0, 100).replace(/\n/g, ' ');
        console.log(`      Content preview: ${contentPreview}...`);
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSearchPipeline();