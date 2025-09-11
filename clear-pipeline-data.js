#!/usr/bin/env node

/**
 * Clear pipeline data to test with fresh documents
 */

import { pipelineStorage } from './services/pipeline-storage.js';

async function clearData() {
  console.log('🧹 Clearing pipeline data...');
  
  try {
    const success = await pipelineStorage.clearPipelineData();
    if (success) {
      console.log('✅ Pipeline data cleared successfully');
      console.log('💡 You can now run normalize script with fresh data');
    }
  } catch (error) {
    console.error('❌ Error clearing pipeline data:', error.message);
  }
}

// Run the clear
clearData().catch(console.error);