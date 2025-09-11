#!/usr/bin/env node

/**
 * Simple table creation attempt using Supabase client
 */

import { supabase } from './config/database.js';

async function createTablesSimple() {
  console.log('🔧 Attempting to create pipeline tables...');
  
  try {
    // First, let's check if the tables already exist by trying to query them
    console.log('🔍 Checking if pipeline_documents table exists...');
    const { data, error } = await supabase
      .from('pipeline_documents')
      .select('id')
      .limit(1);
    
    if (error) {
      if (error.message.includes('does not exist') || error.message.includes('not found')) {
        console.log('❌ pipeline_documents table does not exist');
        console.log('📋 Please create the tables manually in Supabase SQL editor');
        console.log('📄 Use the provided SQL script: setup-pipeline-tables.sql');
        console.log('\n🚨 Manual Steps Required:');
        console.log('1. Open your Supabase project dashboard');
        console.log('2. Go to SQL Editor');
        console.log('3. Copy and paste the contents of setup-pipeline-tables.sql');
        console.log('4. Run the script to create all required tables');
        console.log('5. Then run this normalize script again\n');
      } else {
        console.log('⚠️ Unexpected error querying pipeline_documents:', error.message);
      }
      return false;
    } else {
      console.log('✅ pipeline_documents table exists and is accessible');
      
      // Check pipeline_chunks table
      const { data: chunksData, error: chunksError } = await supabase
        .from('pipeline_chunks')
        .select('id')
        .limit(1);
        
      if (chunksError) {
        console.log('❌ pipeline_chunks table does not exist or is not accessible');
        return false;
      } else {
        console.log('✅ pipeline_chunks table exists and is accessible');
        console.log('🎉 All required tables are ready for use!');
        return true;
      }
    }
    
  } catch (error) {
    console.error('❌ Error during table check:', error.message);
    return false;
  }
}

// Run the check
createTablesSimple().then(success => {
  if (!success) {
    process.exit(1);
  }
}).catch(console.error);