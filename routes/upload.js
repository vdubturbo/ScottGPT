import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { api as logger } from '../utils/logger.js';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const router = express.Router();
const execAsync = promisify(exec);

// Ensure required directories exist
const ensureDirectoryExists = async (dirPath) => {
  try {
    await fs.access(dirPath);
  } catch (error) {
    await fs.mkdir(dirPath, { recursive: true });
    logger.info(`Created directory: ${dirPath}`);
  }
};

// Initialize required directories
(async () => {
  await ensureDirectoryExists('incoming');
  await ensureDirectoryExists('processed');
  await ensureDirectoryExists('logs');
})();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    await ensureDirectoryExists('incoming');
    cb(null, 'incoming/');
  },
  filename: function (req, file, cb) {
    // Keep original filename with timestamp to avoid conflicts
    const timestamp = Date.now();
    const originalName = file.originalname;
    cb(null, `${timestamp}-${originalName}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Allow only specific file types
    const allowedTypes = /\.(pdf|docx|doc|txt|md)$/i;
    if (allowedTypes.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, DOC, TXT, and MD files are allowed.'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 10 // Maximum 10 files at once
  }
});

// POST /api/upload - Upload files to incoming directory
router.post('/', upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map(file => ({
      originalName: file.originalname,
      filename: file.filename,
      size: file.size,
      mimetype: file.mimetype
    }));

    logger.info('Files uploaded successfully', {
      fileCount: uploadedFiles.length,
      files: uploadedFiles.map(f => ({ name: f.originalName, size: f.size })),
      ip: req.ip
    });

    res.json({
      success: true,
      message: `${uploadedFiles.length} files uploaded successfully`,
      files: uploadedFiles
    });

  } catch (error) {
    logger.error('File upload failed', {
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    res.status(500).json({ error: 'Failed to upload files' });
  }
});

// POST /api/upload/clear - Clear incoming directory
router.post('/clear', async (req, res) => {
  try {
    const files = await fs.readdir('incoming/');
    let deleted = 0;
    
    for (const file of files) {
      const filePath = path.join('incoming', file);
      await fs.unlink(filePath);
      deleted++;
    }
    
    // Also clean up .work directory
    if (await fs.access('.work').then(() => true).catch(() => false)) {
      await fs.rm('.work', { recursive: true, force: true });
    }
    
    res.json({
      success: true,
      message: `Cleared ${deleted} files from incoming directory and cleaned work directory`
    });
  } catch (error) {
    console.error('Clear error:', error);
    res.status(500).json({ error: 'Failed to clear directories' });
  }
});

// POST /api/upload/process - Run the ingestion pipeline
router.post('/process', async (req, res) => {
  try {
    // Set up Server-Sent Events for real-time progress
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
      // Note: Express doesn't have res.flush() - write() automatically flushes
    };

    sendProgress('🚀 PIPELINE STARTING - Initializing ingestion process...');

    // Check if there are files to process
    const incomingFiles = await fs.readdir('incoming/');
    const validFiles = incomingFiles.filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f));
    
    if (validFiles.length === 0) {
      sendProgress('❌ PIPELINE STOPPED - No valid files found in incoming directory');
      sendProgress('   Please upload files first, then try processing again');
      res.end();
      return;
    }

    sendProgress(`📁 FOUND ${validFiles.length} files to process: ${validFiles.map(f => f).join(', ')}`);
    
    // Add a small delay to ensure the UI receives the initial status
    await new Promise(resolve => setTimeout(resolve, 500));

    // Use spawn instead of exec for better streaming
    const { spawn } = await import('child_process');
    
    sendProgress('🔧 EXECUTING PIPELINE - Running ingestion script...');
    
    // Create a unique log file for this run
    const logFile = `./logs/progress-${Date.now()}.log`;
    await fs.writeFile(logFile, ''); // Create empty log file
    
    // Start tailing the log file for real-time updates
    const tailChild = spawn('tail', ['-f', logFile]);
    tailChild.stdout.on('data', (data) => {
      const output = data.toString();
      output.split('\n').forEach(line => {
        if (line.trim()) {
          sendProgress(`   ${line}`);
        }
      });
    });
    
    // Run the main script with log output
    const child = spawn('/bin/bash', ['./scripts/ingest.sh'], {
      env: {
        ...process.env,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        COHERE_API_KEY: process.env.COHERE_API_KEY,
        SUPABASE_URL: process.env.SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        PYTHONUNBUFFERED: '1',
        PROGRESS_LOG: logFile
      },
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    child.stdout.on('data', (data) => {
      const output = data.toString();
      // Send each line immediately as it arrives
      output.split('\n').forEach(line => {
        if (line.trim()) {
          const cleanLine = line.replace(/^\s*[\[✓✗❌✅🔄📝⚡🎯]\s*/, '').trim();
          sendProgress(`   ${cleanLine}`);
        }
      });
    });
    
    child.stderr.on('data', (data) => {
      const output = data.toString();
      output.split('\n').forEach(line => {
        if (line.trim()) {
          sendProgress(`   ⚠️ ${line}`);
        }
      });
    });
    
    child.on('close', async (code) => {
      // Clean up the tail process
      tailChild.kill();
      
      // Clean up the log file
      try {
        await fs.unlink(logFile);
      } catch (error) {
        // Ignore cleanup errors
      }
      
      if (code === 0) {
        sendProgress('🎉 PIPELINE SUCCESS - All processing completed!');
        sendProgress('   ✅ Files processed, extracted, and indexed successfully');
        sendProgress('   📊 Knowledge base has been updated');
      } else {
        sendProgress(`❌ PIPELINE FAILED - Process exited with code ${code}`);
        sendProgress('   Check logs above for error details');
      }
      res.end();
    });
    
    child.on('error', (error) => {
      sendProgress(`❌ PIPELINE ERROR - ${error.message}`);
      sendProgress('   Check server logs and environment configuration');
      res.end();
    });

  } catch (error) {
    console.error('Process error:', error);
    res.write(`❌ Pipeline failed: ${error.message}\n`);
    res.end();
  }
});

// GET /api/upload/stats - Get database statistics
router.get('/stats', async (req, res) => {
  try {
    const { db } = await import('../config/database.js');
    const stats = await db.getStats();
    
    res.json({
      success: true,
      stats: stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

// POST /api/upload/test-stream - Test streaming functionality
router.post('/test-stream', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
    };

    sendProgress('🧪 Testing streaming...');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    sendProgress('📝 Step 1: Starting test');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    sendProgress('🔄 Step 2: Processing');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    sendProgress('✅ Step 3: Complete');
    await new Promise(resolve => setTimeout(resolve, 500));
    
    sendProgress('🎉 Streaming test finished!');
    res.end();

  } catch (error) {
    console.error('Stream test error:', error);
    res.write(`❌ Test failed: ${error.message}\n`);
    res.end();
  }
});

// POST /api/upload/test - Test indexer execution
router.post('/test-indexer', async (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
    };

    sendProgress('🔍 Testing indexer in web context...');
    
    const execEnv = {
      ...process.env,
      COHERE_API_KEY: process.env.COHERE_API_KEY
    };
    
    sendProgress(`Environment: COHERE_API_KEY exists: ${!!execEnv.COHERE_API_KEY}`);
    
    try {
      const { stdout, stderr } = await execAsync('node scripts/indexer.cjs', {
        env: execEnv,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10
      });
      
      sendProgress('✅ Indexer completed successfully');
      if (stdout) {
        stdout.split('\n').slice(0, 5).forEach(line => {
          if (line.trim()) sendProgress(`   ${line}`);
        });
      }
      
    } catch (error) {
      sendProgress(`❌ Indexer failed: ${error.message}`);
      sendProgress(`   Code: ${error.code}`);
      sendProgress(`   Signal: ${error.signal}`);
      if (error.stderr) {
        sendProgress(`   Stderr: ${error.stderr}`);
      }
    }
    
    res.end();
    
  } catch (error) {
    console.error('Test error:', error);
    res.write(`❌ Test failed: ${error.message}\n`);
    res.end();
  }
});

// GET /api/upload/debug - Debug environment variables
router.get('/debug', async (req, res) => {
  try {
    const envCheck = {
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      OPENAI_API_KEY_LENGTH: process.env.OPENAI_API_KEY?.length || 0,
      COHERE_API_KEY: !!process.env.COHERE_API_KEY,
      COHERE_API_KEY_LENGTH: process.env.COHERE_API_KEY?.length || 0,
      SUPABASE_URL: !!process.env.SUPABASE_URL,
      NODE_ENV: process.env.NODE_ENV,
      CWD: process.cwd()
    };
    
    res.json({
      success: true,
      environment: envCheck
    });
  } catch (error) {
    console.error('Debug error:', error);
    res.status(500).json({ error: 'Debug failed' });
  }
});

// GET /api/upload/incoming - List files in incoming directory
router.get('/incoming', async (req, res) => {
  try {
    const files = await fs.readdir('incoming/');
    const fileStats = await Promise.all(
      files
        .filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f))
        .map(async (file) => {
          const filePath = path.join('incoming', file);
          const stats = await fs.stat(filePath);
          return {
            name: file,
            size: stats.size,
            modified: stats.mtime
          };
        })
    );
    
    res.json({
      success: true,
      files: fileStats.sort((a, b) => b.modified - a.modified)
    });
  } catch (error) {
    console.error('Incoming files error:', error);
    res.status(500).json({ error: 'Failed to list incoming files' });
  }
});

export default router;