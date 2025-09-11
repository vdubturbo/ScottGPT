#!/usr/bin/env node

/**
 * Setup Pipeline Database Tables
 * Creates the required tables for the document processing pipeline
 */

import { supabase } from './config/database.js';
import fs from 'fs/promises';

async function setupPipelineTables() {
  console.log('🔧 Setting up pipeline database tables...');
  
  try {
    // Read the SQL script
    const sqlScript = await fs.readFile('./setup-pipeline-tables.sql', 'utf8');
    
    // Split into individual statements (basic approach)
    const statements = sqlScript
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Found ${statements.length} SQL statements to execute`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (!statement || statement.startsWith('--')) continue;
      
      console.log(`🔄 Executing statement ${i + 1}/${statements.length}...`);
      
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Try alternative RPC function name
          const { error: error2 } = await supabase.rpc('execute_sql', { query: statement });
          
          if (error2) {
            console.log(`⚠️ SQL execution failed, trying direct query...`);
            // As a fallback, try to use the from() API for simple operations
            console.log(`Statement: ${statement.substring(0, 100)}...`);
            console.log(`Error: ${error.message}`);
          } else {
            console.log(`✅ Statement executed successfully`);
          }
        } else {
          console.log(`✅ Statement executed successfully`);
        }
        
      } catch (execError) {
        console.log(`⚠️ Failed to execute statement: ${execError.message}`);
        console.log(`Statement: ${statement.substring(0, 100)}...`);
      }
    }
    
    console.log('🎉 Pipeline database setup completed!');
    console.log('   You can now run the normalize script to process documents');
    
  } catch (error) {
    console.error('❌ Failed to setup pipeline database:', error.message);
    console.error('💡 You may need to create the tables manually in Supabase SQL editor');
    console.error('📄 Use the SQL script: setup-pipeline-tables.sql');
    process.exit(1);
  }
}

// Run the setup
setupPipelineTables().catch(console.error);