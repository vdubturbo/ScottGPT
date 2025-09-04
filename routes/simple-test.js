import express from 'express';
import fs from 'fs/promises';

const router = express.Router();

// Simple test endpoint to bypass the complex pipeline
router.post('/simple-test', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
      console.log(message); // Also log to server console
    };

    sendProgress('🧪 Simple Pipeline Test Starting...');
    
    // Test 1: Check files
    const files = await fs.readdir('incoming/');
    const validFiles = files.filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f));
    sendProgress(`📁 Found ${validFiles.length} files: ${validFiles.join(', ')}`);
    
    if (validFiles.length === 0) {
      sendProgress('❌ No files to process');
      res.end();
      return;
    }
    
    // Test 2: Try normalize step only
    sendProgress('🔄 Testing normalize step...');
    
    try {
      const { default: normalize } = await import('../scripts/normalize.js');
      await Promise.race([
        normalize(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Normalize timeout')), 30000))
      ]);
      sendProgress('✅ Normalize completed');
    } catch (error) {
      sendProgress(`❌ Normalize failed: ${error.message}`);
      res.end();
      return;
    }
    
    // Test 3: Check if normalized files exist
    try {
      const normalizedFiles = await fs.readdir('.work/normalized');
      sendProgress(`✅ Created ${normalizedFiles.length} normalized files`);
    } catch (error) {
      sendProgress(`❌ No normalized files found: ${error.message}`);
    }
    
    sendProgress('🎉 Simple test completed!');
    res.end();
    
  } catch (error) {
    console.error('Simple test error:', error);
    res.write(`❌ Test failed: ${error.message}\n`);
    res.end();
  }
});

export default router;