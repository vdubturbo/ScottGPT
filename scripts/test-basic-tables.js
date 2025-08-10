const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function testBasicTables() {
  console.log('🧪 Testing basic table creation...\n');

  const tests = [
    { name: 'sources', query: () => supabase.from('sources').select('*').limit(1) },
    { name: 'content_chunks', query: () => supabase.from('content_chunks').select('*').limit(1) },
    { name: 'skills', query: () => supabase.from('skills').select('*').limit(1) },
    { name: 'synonyms', query: () => supabase.from('synonyms').select('*').limit(1) }
  ];

  for (const test of tests) {
    try {
      const { data, error } = await test.query();
      if (error) {
        console.log(`❌ ${test.name}: ${error.message}`);
      } else {
        console.log(`✅ ${test.name}: Table exists and accessible`);
      }
    } catch (e) {
      console.log(`❌ ${test.name}: Exception - ${e.message}`);
    }
  }

  console.log('\n🎯 If all tables show as accessible, try running the indexer:');
  console.log('   npm run ingest:index');
}

testBasicTables();