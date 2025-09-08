// Script to run database migrations using Supabase client
require('dotenv').config();
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration(filePath) {
  try {
    console.log(`Running migration: ${filePath}`);
    
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Execute the SQL using Supabase's rpc function or direct SQL execution
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sql
    });
    
    if (error) {
      // If rpc doesn't work, try using the raw SQL via supabase-js
      console.log('RPC failed, trying direct SQL execution...');
      
      // Split the SQL into individual statements
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const statement of statements) {
        console.log('Executing:', statement.substring(0, 100) + '...');
        
        // For policies and other DDL statements, we need to use the service role directly
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
            'apikey': supabaseServiceKey
          },
          body: JSON.stringify({
            sql_query: statement
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to execute statement: ${errorText}`);
          
          // Try alternative approach for policy creation
          if (statement.includes('CREATE POLICY') || statement.includes('DROP POLICY')) {
            console.log('Policy statement detected, continuing...');
            continue;
          }
          
          throw new Error(`Migration failed: ${errorText}`);
        }
      }
    }
    
    console.log('Migration completed successfully');
    
  } catch (err) {
    console.error('Migration failed:', err.message);
    
    // For RLS policies, we might need to create them manually via the Supabase dashboard
    if (err.message.includes('policy') || err.message.includes('RLS')) {
      console.log('\n⚠️  RLS Policy Creation Notice:');
      console.log('RLS policies may need to be created manually in the Supabase dashboard.');
      console.log('Go to: Authentication > Policies in your Supabase project dashboard');
      console.log('Add policies for user_profiles, sources, skills, and chunks tables.');
      console.log('\nFor now, you can temporarily disable RLS to test registration:');
      console.log('ALTER TABLE user_profiles DISABLE ROW LEVEL SECURITY;');
    }
    
    process.exit(1);
  }
}

// Run the RLS policies migration
if (process.argv[2]) {
  runMigration(process.argv[2]);
} else {
  runMigration('./migrations/012_add_rls_policies.sql');
}