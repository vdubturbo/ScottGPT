import { supabase } from './config/database.js';

async function testOLDPFilter() {
  console.log('=== TESTING OLDP FILTER MATCH ===');
  
  try {
    // Test the exact filter that should include OLDP chunks
    console.log('1. Testing the exact OR filter used in search...');
    
    const { data: filterResults, error: filterError } = await supabase
      .from('content_chunks')
      .select(`
        id, title, skills, tags,
        sources (title, org)
      `)
      .or('skills.ov.{Team Leadership,Strategic Planning,Program Management},tags.ov.{Government,Regulated Industries}')
      .limit(10);
    
    if (filterError) {
      console.error('Filter error:', filterError);
    } else {
      console.log(`📊 Filter returned ${filterResults.length} chunks`);
      
      let foundOLDP = false;
      filterResults.forEach((chunk, i) => {
        const isOLDP = chunk.title?.toLowerCase().includes('operations leadership') || 
                       chunk.title?.toLowerCase().includes('oldp');
        if (isOLDP) {
          foundOLDP = true;
          console.log(`   ✅ OLDP FOUND: ${i+1}. ${chunk.sources?.org} | ${chunk.title}`);
          console.log(`      Skills: ${JSON.stringify(chunk.skills)}`);
          console.log(`      Tags: ${JSON.stringify(chunk.tags)}`);
        }
      });
      
      if (!foundOLDP) {
        console.log('   ❌ No OLDP chunks found in filter results');
        console.log('   📊 Sample results:');
        filterResults.slice(0, 5).forEach((chunk, i) => {
          console.log(`      ${i+1}. ${chunk.sources?.org} | ${chunk.title?.substring(0, 40)}`);
        });
      }
    }
    
    // Test 2: Check OLDP chunks directly
    console.log('\n2. Checking OLDP chunks directly...');
    const { data: oldpChunks, error: oldpError } = await supabase
      .from('content_chunks')
      .select(`
        id, title, skills, tags,
        sources (title, org)
      `)
      .or('title.ilike.%operations leadership%,title.ilike.%oldp%');
    
    if (oldpError) {
      console.error('OLDP check error:', oldpError);
    } else {
      console.log(`📊 Found ${oldpChunks.length} OLDP chunks`);
      
      oldpChunks.forEach((chunk, i) => {
        console.log(`   ${i+1}. ${chunk.sources?.org} | ${chunk.title}`);
        console.log(`      Skills: ${JSON.stringify(chunk.skills)}`);
        console.log(`      Tags: ${JSON.stringify(chunk.tags)}`);
        
        // Check if this chunk should match the filter
        const hasMatchingSkills = ['Team Leadership', 'Strategic Planning', 'Program Management'].some(skill => 
          chunk.skills && chunk.skills.includes(skill)
        );
        const hasMatchingTags = ['Government', 'Regulated Industries'].some(tag => 
          chunk.tags && chunk.tags.includes(tag)
        );
        
        console.log(`      Should match skills filter: ${hasMatchingSkills}`);
        console.log(`      Should match tags filter: ${hasMatchingTags}`);
        console.log(`      Should match OR filter: ${hasMatchingSkills || hasMatchingTags}`);
        console.log('');
      });
    }
    
    // Test 3: Direct test of one OLDP chunk with the filter
    console.log('3. Testing direct filter on known OLDP chunk...');
    const { data: specificTest, error: specificError } = await supabase
      .from('content_chunks')
      .select('id, title, skills, tags')
      .or('title.ilike.%operations leadership%')
      .or('skills.ov.{Team Leadership,Strategic Planning,Program Management},tags.ov.{Government,Regulated Industries}')
      .limit(1);
      
    if (specificError) {
      console.error('Specific test error:', specificError);
    } else {
      console.log(`📊 Specific test returned ${specificTest.length} chunks`);
      if (specificTest.length > 0) {
        console.log('   ✅ Found:', specificTest[0].title);
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testOLDPFilter();