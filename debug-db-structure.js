import { db, supabase } from './config/database.js';

async function debugDatabaseStructure() {
  try {
    console.log('🔍 Debugging database query structure...\n');

    // Test the exact query that's failing
    console.log('=== Test 1: Direct Database Query ===');
    const { data: chunks, error } = await supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, skills, tags,
        date_start, date_end, token_count, embedding,
        sources (id, type, title, org, location)
      `)
      .limit(5);

    if (error) {
      console.error('❌ Database error:', error);
      return;
    }

    console.log(`Found ${chunks.length} chunks`);
    console.log('\nSample chunk structure:');
    console.log(JSON.stringify(chunks[0], null, 2));

    // Test search specifically for OLDP content
    console.log('\n=== Test 2: OLDP Content Search ===');
    const { data: oldpChunks } = await supabase
      .from('content_chunks')
      .select(`
        id, source_id, title, content, skills, tags,
        sources (id, type, title, org, location)
      `)
      .ilike('title', '%leadership%')
      .limit(3);

    console.log(`OLDP chunks found: ${oldpChunks?.length || 0}`);
    if (oldpChunks && oldpChunks.length > 0) {
      oldpChunks.forEach((chunk, i) => {
        console.log(`\n${i + 1}. ${chunk.title}`);
        console.log(`   Source ID: ${chunk.source_id}`);
        console.log(`   Sources: ${JSON.stringify(chunk.sources)}`);
        console.log(`   Skills: ${chunk.skills}`);
        console.log(`   Content preview: ${chunk.content?.substring(0, 200)}...`);
      });
    }

    // Test embedding search
    console.log('\n=== Test 3: Embedding Search ===');
    const testResults = await db.searchChunks(null, {
      threshold: 0.3,
      limit: 5
    });

    console.log(`Search results: ${testResults.length}`);
    if (testResults.length > 0) {
      console.log('\nFirst result structure:');
      console.log('Keys:', Object.keys(testResults[0]));
      console.log('Sources field:', testResults[0].sources);
      console.log('Source_id field:', testResults[0].source_id);
      console.log('Source_title field:', testResults[0].source_title);
    }

  } catch (error) {
    console.error('Debug error:', error);
  }
}

debugDatabaseStructure();
