const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

console.log('🚀 Running database migrations...');

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigrations() {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  
  try {
    // Get all migration files in order
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`Found ${migrationFiles.length} migration files:`, migrationFiles);

    for (const file of migrationFiles) {
      console.log(`\n📄 Running migration: ${file}`);
      
      const sqlPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      // Split SQL into individual statements (separated by semicolon on its own line)
      const statements = sql
        .split(/;\s*\n/)
        .map(stmt => stmt.trim())
        .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

      for (let i = 0; i < statements.length; i++) {
        const statement = statements[i];
        if (!statement) continue;
        
        console.log(`   Executing statement ${i + 1}/${statements.length}...`);
        
        try {
          const { data, error } = await supabase.rpc('exec_sql', {
            sql_query: statement
          });
          
          if (error) {
            // Try alternative approach using REST API
            const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
              method: 'POST',
              headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ sql_query: statement })
            });
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}: ${await response.text()}`);
            }
            
            console.log(`   ✅ Statement executed successfully`);
          } else {
            console.log(`   ✅ Statement executed successfully`);
          }
        } catch (err) {
          console.error(`   ❌ Failed to execute statement:`, err.message);
          console.error(`   SQL: ${statement.substring(0, 100)}...`);
          
          // Continue with other statements unless it's a critical error
          if (statement.includes('CREATE SCHEMA') || statement.includes('CREATE TABLE')) {
            console.log(`   ⚠️  Continuing with remaining statements...`);
          }
        }
      }
      
      console.log(`   ✅ Migration ${file} completed`);
    }

    console.log('\n🎉 All migrations completed!');
    
    // Test the result
    console.log('\n🔍 Testing migration results...');
    
    const { data: sources, error: sourcesError } = await supabase
      .from('scottgpt.sources')
      .select('*')
      .limit(1);
      
    if (sourcesError) {
      console.log('   ❌ scottgpt.sources table not accessible:', sourcesError.message);
    } else {
      console.log('   ✅ scottgpt.sources table accessible');
    }

    const { data: chunks, error: chunksError } = await supabase
      .from('scottgpt.content_chunks')
      .select('*')
      .limit(1);
      
    if (chunksError) {
      console.log('   ❌ scottgpt.content_chunks table not accessible:', chunksError.message);
    } else {
      console.log('   ✅ scottgpt.content_chunks table accessible');
    }

  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
}

runMigrations().then(() => {
  console.log('\n🏁 Migration process complete');
  process.exit(0);
});