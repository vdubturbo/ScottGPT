import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { api as logger } from '../utils/logger.js';

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

// POST /api/upload/process - Run the ingestion pipeline
router.post('/process', async (req, res) => {
  try {
    // Set up Server-Sent Events for real-time progress
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
    };

    sendProgress('🚀 Starting ingestion pipeline...');

    // Check if there are files to process
    const incomingFiles = await fs.readdir('incoming/');
    const validFiles = incomingFiles.filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f));
    
    if (validFiles.length === 0) {
      sendProgress('❌ No valid files found in incoming directory');
      res.end();
      return;
    }

    sendProgress(`📁 Found ${validFiles.length} files to process`);

    // Run each step of the pipeline
    const steps = [
      { name: 'normalize', script: 'scripts/normalize.js', description: 'Converting documents to markdown' },
      { name: 'extract', script: 'scripts/extract.js', description: 'Extracting structured data with AI' },
      { name: 'validate', script: 'scripts/validate.js', description: 'Validating content and stripping PII' },
      { name: 'write', script: 'scripts/write.js', description: 'Organizing files by type' },
      { name: 'index', script: 'scripts/indexer.cjs', description: 'Creating embeddings and indexing' }
    ];

    for (const step of steps) {
      sendProgress(`\n📋 Step: ${step.description}...`);
      
      try {
        let command = `node ${step.script}`;
        if (step.name === 'index') {
          command = `COHERE_API_KEY=${process.env.COHERE_API_KEY} node ${step.script}`;
        } else if (step.name === 'extract') {
          command = `OPENAI_API_KEY=${process.env.OPENAI_API_KEY} node ${step.script}`;
        }
        const { stdout, stderr } = await execAsync(command);
        
        if (stdout) {
          stdout.split('\n').forEach(line => {
            if (line.trim()) {sendProgress(`   ${line}`);}
          });
        }
        
        if (stderr) {
          stderr.split('\n').forEach(line => {
            if (line.trim()) {sendProgress(`   ⚠️ ${line}`);}
          });
        }
        
        sendProgress(`✅ ${step.name} completed`);
        
      } catch (error) {
        sendProgress(`❌ Error in ${step.name}: ${error.message}`);
        if (error.stdout) {
          sendProgress(`stdout: ${error.stdout}`);
        }
        if (error.stderr) {
          sendProgress(`stderr: ${error.stderr}`);
        }
      }
    }

    // Clean up processed files
    sendProgress('\n🧹 Cleaning up...');
    try {
      // Move processed files to a processed folder
      await fs.mkdir('processed', { recursive: true });
      for (const file of validFiles) {
        const src = path.join('incoming', file);
        const dest = path.join('processed', file);
        await fs.rename(src, dest);
      }
      sendProgress(`📦 Moved ${validFiles.length} files to processed/`);
    } catch (cleanupError) {
      sendProgress(`⚠️ Cleanup warning: ${cleanupError.message}`);
    }

    sendProgress('\n✅ Ingestion pipeline completed successfully!');
    sendProgress('🎉 Your knowledge base has been updated.');
    
    res.end();

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