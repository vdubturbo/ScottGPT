import { db } from './config/database.js';

async function checkSkillsTags() {
  console.log('=== SKILLS & TAGS ANALYSIS ===');
  
  try {
    // Get all unique skills
    console.log('\n1. Checking unique skills in database...');
    const skills = await db.getUniqueSkills();
    console.log(`📊 Total unique skills: ${skills.length}`);
    console.log('Skills list:', skills);
    
    // Get all unique tags
    console.log('\n2. Checking unique tags in database...');
    const tags = await db.getUniqueTags();
    console.log(`📊 Total unique tags: ${tags.length}`);
    console.log('Tags list:', tags);
    
    // Search for IoT-related content without filters
    console.log('\n3. Searching for IoT content without filters...');
    const { data: iotSearch, error: iotError } = await db.supabase
      .from('content_chunks')
      .select(`
        id, title, content, skills, tags,
        sources (title, org)
      `)
      .ilike('content', '%iot%')
      .limit(5);
      
    if (iotError) {
      console.error('IoT content search error:', iotError);
    } else {
      console.log(`📋 IoT content found: ${iotSearch.length} chunks`);
      iotSearch.forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.sources?.org || 'Unknown'} | ${chunk.title}`);
        console.log(`      Skills: ${JSON.stringify(chunk.skills)}`);
        console.log(`      Tags: ${JSON.stringify(chunk.tags)}`);
        const iotMatches = (chunk.content.match(/iot/gi) || []).length;
        console.log(`      IoT mentions: ${iotMatches}`);
      });
    }
    
    // Search for Coca-Cola content
    console.log('\n4. Searching for Coca-Cola content...');
    const { data: cokeSearch, error: cokeError } = await db.supabase
      .from('content_chunks')
      .select(`
        id, title, content, skills, tags,
        sources (title, org)
      `)
      .or('content.ilike.%coca%,sources.org.ilike.%coca%')
      .limit(10);
      
    if (cokeError) {
      console.error('Coca-Cola search error:', cokeError);
    } else {
      console.log(`📋 Coca-Cola content found: ${cokeSearch.length} chunks`);
      cokeSearch.forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.sources?.org || 'Unknown'} | ${chunk.title}`);
        console.log(`      Skills: ${JSON.stringify(chunk.skills)}`);
        console.log(`      Tags: ${JSON.stringify(chunk.tags)}`);
      });
    }
    
    // Test search without any filters
    console.log('\n5. Testing search without filters...');
    const { data: noFilterSearch, error: noFilterError } = await db.supabase
      .from('content_chunks')
      .select(`
        id, title, embedding,
        sources (title, org)
      `)
      .not('embedding', 'is', null)
      .limit(5);
      
    if (noFilterError) {
      console.error('No filter search error:', noFilterError);
    } else {
      console.log(`📋 Chunks with embeddings: ${noFilterSearch.length}`);
      noFilterSearch.forEach((chunk, i) => {
        const embeddingLength = chunk.embedding ? 
          (Array.isArray(chunk.embedding) ? chunk.embedding.length : JSON.parse(chunk.embedding).length) 
          : 0;
        console.log(`   ${i+1}. ${chunk.sources?.org || 'Unknown'} | Embedding: ${embeddingLength}D`);
      });
    }
    
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  }
}

checkSkillsTags();