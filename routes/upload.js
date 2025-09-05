import express from 'express';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import rateLimit from 'express-rate-limit';
import { api as logger } from '../utils/logger.js';
import { processBatchUploads, clearUploadCache, getCacheStats as getUploadCacheStats, loadUploadCache } from '../utils/upload-optimizer.js';
import processLogger from '../utils/process-logger.js';
import CONFIG from '../config/app-config.js';
import dotenv from 'dotenv';

// Ensure environment variables are loaded
dotenv.config();

const router = express.Router();
const execAsync = promisify(exec);

// Create upload-specific rate limit (only for actual file uploads)
const uploadFileLimit = rateLimit({
  windowMs: CONFIG.rateLimiting.upload.windowMs,
  max: CONFIG.rateLimiting.upload.maxRequests,
  message: { error: CONFIG.rateLimiting.upload.message },
  standardHeaders: true,
  legacyHeaders: false
});

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
  await loadUploadCache();
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

// POST /api/upload - Upload files with duplicate detection
router.post('/', uploadFileLimit, upload.array('files', 10), async (req, res) => {
  const uploadStartTime = Date.now();
  
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    console.log(`📤 [UPLOAD] Processing ${req.files.length} uploaded files...`);
    
    // Process uploads with duplicate detection
    const deduplicationResults = await processBatchUploads(req.files);
    const uploadDuration = Date.now() - uploadStartTime;

    // Prepare response with detailed information
    const uploadedFiles = deduplicationResults.unique.map(file => ({
      originalName: file.originalName,
      filename: path.basename(file.filePath),
      size: file.size,
      hash: file.hash,
      isDuplicate: false
    }));

    const duplicateFiles = deduplicationResults.duplicates.map(file => ({
      originalName: file.originalName,
      size: file.size,
      hash: file.hash,
      isDuplicate: true,
      message: file.message
    }));

    // Enhanced logging with performance metrics
    logger.info('Files uploaded with deduplication', {
      totalFiles: req.files.length,
      uniqueFiles: deduplicationResults.stats.uniqueFiles,
      duplicateFiles: deduplicationResults.stats.duplicateFiles,
      totalSize: deduplicationResults.stats.totalSizeBytes,
      duplicateSizeSkipped: deduplicationResults.stats.duplicateSizeBytes,
      uploadDuration: `${uploadDuration}ms`,
      ip: req.ip
    });

    // Response includes both uploaded and skipped files
    const responseMessage = deduplicationResults.stats.duplicateFiles > 0
      ? `${deduplicationResults.stats.uniqueFiles} unique files uploaded, ${deduplicationResults.stats.duplicateFiles} duplicates skipped`
      : `${deduplicationResults.stats.uniqueFiles} files uploaded successfully`;

    res.json({
      success: true,
      message: responseMessage,
      stats: {
        totalSubmitted: req.files.length,
        uniqueUploaded: deduplicationResults.stats.uniqueFiles,
        duplicatesSkipped: deduplicationResults.stats.duplicateFiles,
        totalSizeBytes: deduplicationResults.stats.totalSizeBytes,
        duplicateSizeSavedBytes: deduplicationResults.stats.duplicateSizeBytes,
        uploadDurationMs: uploadDuration
      },
      files: uploadedFiles,
      duplicates: duplicateFiles.length > 0 ? duplicateFiles : undefined
    });

  } catch (error) {
    const uploadDuration = Date.now() - uploadStartTime;
    
    logger.error('File upload failed', {
      error: error.message,
      stack: error.stack,
      uploadDuration: `${uploadDuration}ms`,
      ip: req.ip
    });
    
    console.error(`❌ [UPLOAD ERROR] ${error.message}`);
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

// Global process state management
let isProcessingActive = false;
let activeProcessAbortController = null;

// Timeout utility function
const createTimeoutPromise = (ms, stepName) => {
  return new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`${stepName} timed out after ${ms}ms`)), ms);
  });
};

// Progress utility with heartbeat
const createProgressReporter = (sendProgress, stepName, timeoutMs) => {
  const startTime = Date.now();
  let heartbeatInterval;
  
  const start = () => {
    sendProgress(`📍 [${new Date().toLocaleTimeString()}] Starting ${stepName}...`);
    
    // Send heartbeat every 5 seconds during long operations
    heartbeatInterval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      sendProgress(`💓 [${new Date().toLocaleTimeString()}] ${stepName} running... (${elapsed}s elapsed)`);
    }, 5000);
  };
  
  const end = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    sendProgress(`✅ [${new Date().toLocaleTimeString()}] ${stepName} completed in ${elapsed}s`);
  };
  
  const error = (err) => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    sendProgress(`❌ [${new Date().toLocaleTimeString()}] ${stepName} failed after ${elapsed}s: ${err.message}`);
  };
  
  return { start, end, error };
};

// POST /api/upload/process - Run the ingestion pipeline with Node.js direct execution
router.post('/process', async (req, res) => {
  // Check if already processing
  if (isProcessingActive) {
    return res.status(409).json({ 
      error: 'Pipeline already running. Please wait for it to complete or use /api/upload/stop to terminate.' 
    });
  }

  // Set processing state
  isProcessingActive = true;
  activeProcessAbortController = new AbortController();
  
  // Start logging
  processLogger.startLogging('pipeline-process');

  // Simple JSON response - frontend will poll for logs
  res.json({ success: true, message: 'Processing started, check /api/upload/logs for progress' });

  // Run processing in background
  (async () => {
    try {
      processLogger.log('🚀 [INIT] Pipeline starting - Node.js direct execution mode');
      processLogger.log(`📅 [INIT] Started at: ${new Date().toISOString()}`);

    // Check if there are files to process
    let incomingFiles;
    try {
      incomingFiles = await fs.readdir('incoming/');
    } catch (error) {
      if (error.code === 'ENOENT') {
        processLogger.error('[INIT] No incoming directory found');
        return;
      }
      throw error;
    }

    const validFiles = incomingFiles.filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f));
    
    if (validFiles.length === 0) {
      processLogger.error('[INIT] No valid files found in incoming directory');
      processLogger.log('   Please upload files first, then try processing again');
      return;
    }

    processLogger.log(`📁 [INIT] Found ${validFiles.length} files: ${validFiles.join(', ')}`);

    // Pipeline steps with timeouts
    const steps = [
      { name: 'Normalize', script: '../scripts/normalize.js', timeout: 30000 },
      { name: 'Extract', script: '../scripts/extract.js', timeout: 120000 },
      { name: 'Validate', script: '../scripts/validate.js', timeout: 30000 },
      { name: 'Write', script: '../scripts/write.js', timeout: 30000 },
      { name: 'Index', script: '../scripts/indexer.js', timeout: 180000 }
    ];

    // Execute each step
    for (const step of steps) {
      if (activeProcessAbortController.signal.aborted) {
        processLogger.error('[ABORT] Pipeline terminated by user request');
        break;
      }

      const reporter = createProgressReporter(processLogger.log.bind(processLogger), step.name, step.timeout);
      
      try {
        reporter.start();

        // Create timeout promise
        const timeoutPromise = createTimeoutPromise(step.timeout, step.name);
        
        // Execute the step with enhanced error handling and console capture
        const stepPromise = (async () => {
          let module;
          try {
            processLogger.log(`📦 [${step.name.toUpperCase()}] Importing module: ${step.script}`);
            module = await import(step.script);
          } catch (importError) {
            processLogger.error(`[${step.name.toUpperCase()}] Module import failed: ${importError.message}`);
            throw new Error(`Failed to import ${step.name} script: ${importError.message}`);
          }

          if (typeof module.default === 'function') {
            processLogger.log(`🔧 [${step.name.toUpperCase()}] Executing step function`);
            
            // Capture console output and redirect to stream
            const originalConsoleLog = console.log;
            const originalConsoleError = console.error;
            const originalConsoleWarn = console.warn;
            
            console.log = (...args) => {
              const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
              ).join(' ');
              // Log to our process logger
              processLogger.log(message);
              originalConsoleLog(...args); // Also keep server console logging
            };
            
            console.error = (...args) => {
              const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
              ).join(' ');
              processLogger.error(message);
              originalConsoleError(...args);
            };
            
            console.warn = (...args) => {
              const message = args.map(arg => 
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
              ).join(' ');
              processLogger.warn(message);
              originalConsoleWarn(...args);
            };
            
            try {
              const result = await module.default();
              
              // Restore original console methods
              console.log = originalConsoleLog;
              console.error = originalConsoleError;
              console.warn = originalConsoleWarn;
              
              return result;
            } catch (error) {
              // Restore original console methods even on error
              console.log = originalConsoleLog;
              console.error = originalConsoleError;
              console.warn = originalConsoleWarn;
              throw error;
            }
          } else {
            throw new Error(`${step.name} script does not export a default function`);
          }
        })();

        // Race between step execution and timeout
        await Promise.race([stepPromise, timeoutPromise]);
        
        reporter.end();

      } catch (error) {
        reporter.error(error);
        
        // Log detailed error
        processLogger.log(`🔍 [ERROR] ${step.name} error details:`);
        processLogger.log(`   Message: ${error.message}`);
        processLogger.log(`   Stack: ${error.stack ? error.stack.split('\n')[1] : 'No stack trace'}`);
        
        throw error;
      }
    }

    // Final cleanup - move files to processed/
    const cleanupReporter = createProgressReporter(processLogger.log.bind(processLogger), 'File Cleanup', 10000);
    try {
      cleanupReporter.start();
      
      // Ensure processed directory exists
      await fs.mkdir('processed', { recursive: true });
      
      let movedCount = 0;
      const currentFiles = await fs.readdir('incoming/');
      
      for (const file of currentFiles) {
        if (file.startsWith('.')) continue; // Skip hidden files
        if (/\.(pdf|docx|doc|txt|md)$/i.test(file)) {
          const src = `incoming/${file}`;
          const dest = `processed/${file}`;
          await fs.rename(src, dest);
          processLogger.log(`   📁 Moved: ${file}`);
          movedCount++;
        }
      }
      
      processLogger.log(`📦 [CLEANUP] Archived ${movedCount} processed files`);
      cleanupReporter.end();
      
    } catch (error) {
      cleanupReporter.error(error);
      processLogger.warn('[CLEANUP] File cleanup failed, but pipeline processing succeeded');
    }

    // Success
    processLogger.log('🎉 [SUCCESS] Complete pipeline execution finished!');
    processLogger.log(`📊 [SUCCESS] Files processed and indexed successfully`);
    processLogger.log(`⏱️  [SUCCESS] Completed at: ${new Date().toISOString()}`);
    
    } catch (error) {
      processLogger.error(`[FATAL] Pipeline failed: ${error.message}`);
      processLogger.log(`🔍 [DEBUG] Error type: ${error.constructor.name}`);
      processLogger.log(`📋 [DEBUG] Files remain in incoming/ for retry`);
      console.error('Pipeline error:', error);
    } finally {
      // Reset process state
      isProcessingActive = false;
      activeProcessAbortController = null;
      processLogger.stopLogging();
    }
  })(); // End async IIFE
}); // End route handler

// POST /api/upload/stop - Stop running pipeline process
router.post('/stop', (req, res) => {
  try {
    if (!isProcessingActive) {
      return res.json({ success: false, message: 'No pipeline process is currently running' });
    }

    if (activeProcessAbortController) {
      activeProcessAbortController.abort();
      console.log('[PIPELINE] Process termination requested by user');
    }

    // Force reset state after a short delay
    setTimeout(() => {
      isProcessingActive = false;
      activeProcessAbortController = null;
    }, 1000);

    res.json({ success: true, message: 'Pipeline termination requested' });
  } catch (error) {
    console.error('Stop process error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/upload/status - Get current pipeline status
router.get('/status', (req, res) => {
  res.json({
    isProcessingActive,
    hasAbortController: !!activeProcessAbortController,
    timestamp: new Date().toISOString(),
    logger: processLogger.getStatus()
  });
});

// GET /api/upload/logs - Get process logs
router.get('/logs', (req, res) => {
  const since = parseInt(req.query.since) || 0;
  const logs = processLogger.getLogs(since);
  
  res.json({
    success: true,
    logs: logs,
    status: processLogger.getStatus(),
    hasMore: logs.length > 0
  });
});

// GET /api/upload/cache-stats - Get upload cache statistics
router.get('/cache-stats', (req, res) => {
  try {
    const cacheStats = getUploadCacheStats();
    
    res.json({
      success: true,
      cache: cacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get cache statistics',
      details: error.message 
    });
  }
});

// POST /api/upload/clear-cache - Clear the upload deduplication cache
router.post('/clear-cache', async (req, res) => {
  try {
    const result = await clearUploadCache();
    
    res.json({
      success: true,
      message: `Upload cache cleared successfully (was ${result.previousSize} files)`,
      result: result,
      timestamp: new Date().toISOString()
    });
    
    logger.info('Upload cache cleared', {
      previousSize: result.previousSize,
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    
  } catch (error) {
    console.error('Clear cache error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to clear upload cache',
      details: error.message 
    });
  }
});

// Individual script testing endpoints
router.post('/test-normalize', async (req, res) => {
  await testIndividualStep(res, 'normalize', '../scripts/normalize.js', 30000);
});

router.post('/test-extract', async (req, res) => {
  await testIndividualStep(res, 'extract', '../scripts/extract.js', 120000);
});

router.post('/test-validate', async (req, res) => {
  await testIndividualStep(res, 'validate', '../scripts/validate.js', 30000);
});

router.post('/test-write', async (req, res) => {
  await testIndividualStep(res, 'write', '../scripts/write.js', 30000);
});

router.post('/test-indexer', async (req, res) => {
  await testIndividualStep(res, 'indexer', '../scripts/indexer.js', 180000);
});

// Utility function for individual step testing
async function testIndividualStep(res, stepName, scriptPath, timeoutMs) {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked'
    });

    const sendProgress = (message) => {
      console.log(`[TEST-${stepName.toUpperCase()}] ${message}`);
      res.write(`${message}\n`);
      res.flush && res.flush(); // Force flush
    };

    sendProgress(`🧪 [TEST] Starting individual test of ${stepName} step`);
    sendProgress(`📅 [TEST] Started at: ${new Date().toISOString()}`);
    sendProgress(`⏱️  [TEST] Timeout: ${timeoutMs}ms`);

    // Check prerequisites
    try {
      const incomingFiles = await fs.readdir('incoming/');
      const validFiles = incomingFiles.filter(f => /\.(pdf|docx|doc|txt|md)$/i.test(f));
      sendProgress(`📁 [TEST] Found ${validFiles.length} files in incoming/`);
    } catch (error) {
      sendProgress(`⚠️  [TEST] Warning: Could not check incoming files: ${error.message}`);
    }

    const reporter = createProgressReporter(sendProgress, `Test-${stepName}`, timeoutMs);
    
    try {
      reporter.start();

      // Create timeout promise
      const timeoutPromise = createTimeoutPromise(timeoutMs, `Test-${stepName}`);
      
      // Execute the step with enhanced error handling and console capture
      const stepPromise = (async () => {
        let module;
        try {
          sendProgress(`📦 [TEST] Importing ${scriptPath}`);
          module = await import(scriptPath);
        } catch (importError) {
          sendProgress(`❌ [TEST] Module import failed: ${importError.message}`);
          sendProgress(`🔍 [TEST] Import path: ${scriptPath}`);
          throw new Error(`Failed to import ${stepName} script: ${importError.message}`);
        }
        
        if (typeof module.default === 'function') {
          sendProgress(`🔧 [TEST] Executing ${stepName} function`);
          
          // Capture console output and redirect to stream
          const originalConsoleLog = console.log;
          const originalConsoleError = console.error;
          const originalConsoleWarn = console.warn;
          
          console.log = (...args) => {
            const message = args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            // Stream to client
            try {
              res.write(`${message}\n`);
              res.flush && res.flush(); // Force flush
            } catch (writeError) {
              originalConsoleError('Error writing to response:', writeError);
            }
            originalConsoleLog(...args);
          };
          
          console.error = (...args) => {
            const message = args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            // Stream to client
            try {
              res.write(`❌ ${message}\n`);
              res.flush && res.flush(); // Force flush
            } catch (writeError) {
              originalConsoleError('Error writing to response:', writeError);
            }
            originalConsoleError(...args);
          };
          
          console.warn = (...args) => {
            const message = args.map(arg => 
              typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            // Stream to client
            try {
              res.write(`⚠️ ${message}\n`);
              res.flush && res.flush(); // Force flush
            } catch (writeError) {
              originalConsoleError('Error writing to response:', writeError);
            }
            originalConsoleWarn(...args);
          };
          
          try {
            const result = await module.default();
            
            // Restore original console methods
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
            
            return result;
          } catch (error) {
            // Restore original console methods even on error
            console.log = originalConsoleLog;
            console.error = originalConsoleError;
            console.warn = originalConsoleWarn;
            throw error;
          }
        } else {
          sendProgress(`❌ [TEST] Module does not export a default function`);
          sendProgress(`🔍 [TEST] Available exports: ${Object.keys(module).join(', ')}`);
          throw new Error(`${stepName} script does not export a default function`);
        }
      })();

      // Race between step execution and timeout
      const result = await Promise.race([stepPromise, timeoutPromise]);
      
      reporter.end();
      sendProgress(`🎉 [TEST] ${stepName} test completed successfully`);
      
      if (result !== undefined) {
        sendProgress(`📊 [TEST] Result: ${JSON.stringify(result, null, 2)}`);
      }

    } catch (error) {
      reporter.error(error);
      
      sendProgress(`❌ [TEST] ${stepName} test failed`);
      sendProgress(`🔍 [ERROR] Message: ${error.message}`);
      sendProgress(`🔍 [ERROR] Type: ${error.constructor.name}`);
      if (error.stack) {
        sendProgress(`🔍 [STACK] ${error.stack.split('\n').slice(0, 3).join('; ')}`);
      }
    }

    sendProgress(`⏹️  [TEST] ${stepName} test completed at: ${new Date().toISOString()}`);
    res.end();

  } catch (error) {
    console.error(`Individual test error (${stepName}):`, error);
    res.write(`❌ Test setup failed: ${error.message}\n`);
    res.end();
  }
}

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
      'Connection': 'keep-alive',
      'Transfer-Encoding': 'chunked'
    });

    const sendProgress = (message) => {
      res.write(`${message}\n`);
      res.flush && res.flush(); // Force flush
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
      const { stdout, stderr } = await execAsync('node scripts/indexer.js', {
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

// GET /api/upload/incoming - Debug endpoint to show files in incoming directory
router.get('/incoming', async (req, res) => {
  try {
    const incomingDir = 'incoming/';
    let files;
    
    try {
      files = await fs.readdir(incomingDir);
    } catch (error) {
      if (error.code === 'ENOENT') {
        return res.json({
          success: true,
          incoming: [],
          message: 'Incoming directory does not exist'
        });
      }
      throw error;
    }
    
    // Get file details
    const fileDetails = [];
    for (const file of files) {
      if (file.startsWith('.')) continue; // Skip hidden files
      
      const filePath = path.join(incomingDir, file);
      try {
        const stats = await fs.stat(filePath);
        if (stats.isFile()) {
          fileDetails.push({
            name: file,
            size: stats.size,
            modified: stats.mtime,
            isDocument: /\.(pdf|docx|doc|txt|md)$/i.test(file)
          });
        }
      } catch (statError) {
        // File might have been deleted between readdir and stat
        console.warn(`Could not stat file ${file}:`, statError.message);
      }
    }
    
    res.json({
      success: true,
      incoming: fileDetails,
      count: fileDetails.length,
      validDocuments: fileDetails.filter(f => f.isDocument).length
    });
    
  } catch (error) {
    console.error('Incoming directory check error:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to check incoming directory' 
    });
  }
});

// GET /api/upload/cache-stats - Get upload cache statistics  
router.get('/cache-stats', (req, res) => {
  try {
    const cacheStats = getUploadCacheStats();
    res.json({
      success: true,
      cache: cacheStats,
      summary: {
        totalCachedFiles: cacheStats.totalCachedFiles,
        oldestEntry: cacheStats.cacheEntries.length > 0 
          ? cacheStats.cacheEntries.reduce((oldest, entry) => 
              entry.uploadedAt < oldest.uploadedAt ? entry : oldest
            ).uploadedAt
          : null,
        newestEntry: cacheStats.cacheEntries.length > 0
          ? cacheStats.cacheEntries.reduce((newest, entry) => 
              entry.uploadedAt > newest.uploadedAt ? entry : newest
            ).uploadedAt
          : null
      }
    });
  } catch (error) {
    console.error('Cache stats error:', error);
    res.status(500).json({ success: false, error: 'Failed to get cache statistics' });
  }
});

export default router;