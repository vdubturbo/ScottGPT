const fs = require('fs');
const path = require('path');

console.log('🔧 ScottGPT Database Setup Instructions');
console.log('=====================================\n');

console.log('Your Supabase database needs to be set up with the ScottGPT schema.');
console.log('The tables and functions are missing, which is why the indexer fails.\n');

console.log('📋 Steps to fix this:');
console.log('');
console.log('1. Open your Supabase project dashboard');
console.log('   URL: https://supabase.com/dashboard/projects');
console.log('');
console.log('2. Navigate to SQL Editor');
console.log('');
console.log('3. Copy and paste the entire consolidated.sql file content');
console.log('   File location: migrations/consolidated.sql');
console.log('');
console.log('4. Execute the SQL script');
console.log('');
console.log('5. Verify the setup by running: node scripts/debug-schema.js');
console.log('');

// Display the SQL content with line numbers for easy copy-paste
const sqlPath = path.join(__dirname, '..', 'migrations', 'consolidated.sql');
const sqlContent = fs.readFileSync(sqlPath, 'utf8');

console.log('📄 SQL Script to Execute:');
console.log('========================');
console.log('');

// Add line numbers for easier debugging
const lines = sqlContent.split('\n');
lines.forEach((line, index) => {
  console.log(`${(index + 1).toString().padStart(3)}→ ${line}`);
});

console.log('');
console.log('⚠️  Important Notes:');
console.log('- Make sure vector extension is enabled in your Supabase project');
console.log('- The script creates tables in the "scottgpt" schema, not public');
console.log('- After running, test with: node scripts/debug-schema.js');
console.log('');
console.log('🚀 Once setup is complete, you can run the indexer:');
console.log('   npm run ingest:index');
console.log('');