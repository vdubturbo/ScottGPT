#!/usr/bin/env node

/**
 * Add test resume content to the database for extraction testing
 */

import fs from 'fs/promises';
import { pipelineStorage } from './services/pipeline-storage.js';
import crypto from 'crypto';

async function addTestResume() {
  console.log('📄 Adding test resume content to database...');
  
  try {
    // Read the test resume content
    const content = await fs.readFile('./test-resume-content.md', 'utf8');
    const buffer = Buffer.from(content, 'utf8');
    
    // Create file metadata
    const uploadHash = crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 32);
    const fileData = {
      buffer: buffer,
      metadata: {
        originalName: 'test-resume-content.md',
        size: buffer.length
      }
    };
    
    console.log(`📝 Content: ${content.length} characters`);
    console.log(`🔗 Upload hash: ${uploadHash}`);
    
    // Store document in database
    const document = await pipelineStorage.storeDocument(uploadHash, fileData);
    console.log(`📄 Document stored with ID: ${document.id}`);
    
    // Store normalized content (same as source for markdown)
    await pipelineStorage.storeNormalizedContent(document.id, content, {
      converter: 'native',
      processingTime: 0
    });
    
    console.log('✅ Test resume content added to database');
    console.log('💡 You can now run the extract script to process this content');
    
  } catch (error) {
    console.error('❌ Error adding test resume:', error.message);
  }
}

// Run the addition
addTestResume().catch(console.error);