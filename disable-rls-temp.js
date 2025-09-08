// Temporarily disable RLS for testing registration
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function disableRLS() {
  try {
    console.log('Temporarily disabling RLS for testing...');
    
    // Use the SQL editor functionality through REST API
    const tables = ['user_profiles', 'sources', 'skills', 'chunks'];
    
    for (const table of tables) {
      console.log(`Disabling RLS for ${table}...`);
      
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .limit(1);
      
      if (error && error.message.includes('row-level security')) {
        console.log(`RLS is enabled for ${table}, but we need to disable it via SQL`);
      }
    }
    
    console.log('\n⚠️  IMPORTANT: Temporarily disable RLS for testing');
    console.log('Run these commands in your Supabase SQL Editor:');
    console.log('');
    console.log('ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE sources DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE skills DISABLE ROW LEVEL SECURITY;');
    console.log('ALTER TABLE chunks DISABLE ROW LEVEL SECURITY;');
    console.log('');
    console.log('After testing registration, re-enable with proper policies:');
    console.log('ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;');
    console.log('-- Then add proper RLS policies');
    
  } catch (err) {
    console.error('Error:', err.message);
  }
}

disableRLS();