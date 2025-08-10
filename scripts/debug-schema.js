const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing environment variables:');
  console.error('SUPABASE_URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseKey ? '✅ Set' : '❌ Missing');
  process.exit(1);
}

console.log('🔍 Debugging Supabase schema access...');
console.log('URL:', supabaseUrl);

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function debugSchema() {
  try {
    console.log('\n1. Testing basic connection with health endpoint...');
    
    // Simple connection test
    try {
      const { data, error } = await supabase.auth.getSession();
      console.log('✅ Supabase client connected successfully');
    } catch (e) {
      console.log('⚠️  Auth session check failed, but client may still work');
    }

    console.log('\n2. Testing table access approaches...');
    
    // Try different approaches to access scottgpt schema
    const approaches = [
      { name: 'Direct scottgpt.sources', query: () => supabase.from('scottgpt.sources').select('*').limit(1) },
      { name: 'Public sources table', query: () => supabase.from('sources').select('*').limit(1) }
    ];

    for (const approach of approaches) {
      try {
        console.log(`\n   Trying: ${approach.name}`);
        const { data, error } = await approach.query();
        
        if (error) {
          console.log(`   ❌ ${approach.name} failed:`, error.message);
        } else {
          console.log(`   ✅ ${approach.name} works! Found ${data?.length || 0} rows`);
        }
      } catch (e) {
        console.log(`   ❌ ${approach.name} exception:`, e.message);
      }
    }

    console.log('\n3. Testing content_chunks table...');
    
    const chunkApproaches = [
      { name: 'Direct scottgpt.content_chunks', query: () => supabase.from('scottgpt.content_chunks').select('*').limit(1) },
      { name: 'Public content_chunks table', query: () => supabase.from('content_chunks').select('*').limit(1) }
    ];

    for (const approach of chunkApproaches) {
      try {
        console.log(`\n   Trying: ${approach.name}`);
        const { data, error } = await approach.query();
        
        if (error) {
          console.log(`   ❌ ${approach.name} failed:`, error.message);
        } else {
          console.log(`   ✅ ${approach.name} works! Found ${data?.length || 0} rows`);
        }
      } catch (e) {
        console.log(`   ❌ ${approach.name} exception:`, e.message);
      }
    }

    console.log('\n4. Attempting test insert to verify write access...');
    
    try {
      const testSource = {
        id: 'test-debug-source',
        type: 'project',
        title: 'Debug Test',
        org: 'Test Org',
        location: 'Test Location',
        date_start: '2025-01-01',
        date_end: null,
        industry_tags: ['Test'],
        skills: ['Testing'],
        outcomes: ['Debug verification'],
        summary: 'Test source for debugging schema access',
        pii_allow: false
      };

      // Try public schema first
      const { data: publicInsert, error: publicInsertError } = await supabase
        .from('sources')
        .insert(testSource)
        .select()
        .single();

      if (publicInsertError) {
        console.log('   ❌ Public sources insert failed:', publicInsertError.message);
        
        // Try scottgpt schema
        const { data: scottgptInsert, error: scottgptInsertError } = await supabase
          .from('scottgpt.sources')
          .insert(testSource)
          .select()
          .single();

        if (scottgptInsertError) {
          console.log('   ❌ Scottgpt sources insert failed:', scottgptInsertError.message);
        } else {
          console.log('   ✅ Scottgpt sources insert works!');
          
          // Clean up test data
          await supabase.from('scottgpt.sources').delete().eq('id', 'test-debug-source');
          console.log('   🧹 Cleaned up test data');
        }
      } else {
        console.log('   ✅ Public sources insert works!');
        
        // Clean up test data
        await supabase.from('sources').delete().eq('id', 'test-debug-source');
        console.log('   🧹 Cleaned up test data');
      }
    } catch (e) {
      console.log('   ❌ Insert test exception:', e.message);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

debugSchema().then(() => {
  console.log('\n🏁 Schema debugging complete');
  process.exit(0);
}).catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});