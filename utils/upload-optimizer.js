import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';

const UPLOAD_CACHE_FILE = '.work/upload-cache.json';
let uploadCache = new Map();

// Load existing upload cache
export async function loadUploadCache() {
  try {
    const cacheData = await fs.readFile(UPLOAD_CACHE_FILE, 'utf8');
    const cache = JSON.parse(cacheData);
    
    // Convert cache entries back to Map and restore Buffer objects
    const entries = Object.entries(cache.fileHashes || {}).map(([hash, entry]) => {
      // Restore Buffer from JSON serialization
      if (entry.buffer && entry.buffer.type === 'Buffer' && entry.buffer.data) {
        entry.buffer = Buffer.from(entry.buffer.data);
      }
      return [hash, entry];
    });
    
    uploadCache = new Map(entries);
    console.log(`📋 Loaded ${uploadCache.size} file upload hashes with buffers`);
    return uploadCache.size;
  } catch (error) {
    console.log('📋 No existing upload cache found');
    uploadCache = new Map();
    return 0;
  }
}

// Save upload cache
export async function saveUploadCache() {
  try {
    await fs.mkdir(path.dirname(UPLOAD_CACHE_FILE), { recursive: true });
    const cacheData = {
      fileHashes: Object.fromEntries(uploadCache),
      lastUpdated: new Date().toISOString()
    };
    await fs.writeFile(UPLOAD_CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`💾 Saved upload cache with ${uploadCache.size} entries`);
  } catch (error) {
    console.warn('⚠️  Failed to save upload cache:', error.message);
  }
}


// Clear processed files from cache
export async function clearProcessedFiles() {
  try {
    const originalSize = uploadCache.size;
    let processedCount = 0;
    
    // Remove processed files from cache
    for (const [hash, entry] of uploadCache) {
      if (entry.processed) {
        uploadCache.delete(hash);
        processedCount++;
      }
    }
    
    console.log(`🧹 [CACHE] Cleared ${processedCount} processed files from cache (${originalSize} → ${uploadCache.size})`);
    
    // Save the updated cache
    await saveUploadCache();
    
    return {
      success: true,
      processedFilesCleared: processedCount,
      remainingFiles: uploadCache.size,
      originalSize: originalSize
    };
  } catch (error) {
    console.error('❌ [CACHE] Failed to clear processed files:', error.message);
    throw error;
  }
}

// Clear upload cache (for development/testing)
export async function clearUploadCache() {
  try {
    const oldSize = uploadCache.size;
    uploadCache.clear();
    
    // Try to delete the cache file
    try {
      await fs.unlink(UPLOAD_CACHE_FILE);
      console.log(`🗑️  Deleted cache file: ${UPLOAD_CACHE_FILE}`);
    } catch (unlinkError) {
      if (unlinkError.code !== 'ENOENT') {
        console.warn('⚠️  Warning: Could not delete cache file:', unlinkError.message);
      }
    }
    
    console.log(`🧹 Upload cache cleared (was ${oldSize} entries)`);
    return {
      success: true,
      previousSize: oldSize,
      cleared: true
    };
  } catch (error) {
    console.error('❌ Failed to clear upload cache:', error);
    throw error;
  }
}


// Generate file hash for duplicate detection
export function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
}

// Check if file content is duplicate using buffer
export function checkForDuplicateBuffer(buffer, fileName) {
  try {
    const fileHash = generateFileHash(buffer);
    const fileSize = buffer.length;
    
    if (uploadCache.has(fileHash)) {
      const existingEntry = uploadCache.get(fileHash);
      return {
        isDuplicate: true,
        hash: fileHash,
        size: fileSize,
        existingFile: existingEntry.originalName,
        uploadedAt: existingEntry.uploadedAt,
        message: `Duplicate of "${existingEntry.originalName}" uploaded ${existingEntry.uploadedAt}`
      };
    }
    
    // Not a duplicate, add to cache with buffer reference
    uploadCache.set(fileHash, {
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
      size: fileSize,
      buffer: buffer, // Store buffer reference for processing
      processed: false
    });
    
    return {
      isDuplicate: false,
      hash: fileHash,
      size: fileSize,
      message: 'New unique file'
    };
    
  } catch (error) {
    console.error(`❌ Error checking file ${fileName}:`, error.message);
    return {
      isDuplicate: false,
      hash: null,
      size: 0,
      message: `Error processing file: ${error.message}`
    };
  }
}

// Legacy function for backwards compatibility (if needed)
export async function checkForDuplicate(filePath, fileName) {
  try {
    const buffer = await fs.readFile(filePath);
    return checkForDuplicateBuffer(buffer, fileName);
  } catch (error) {
    console.error(`❌ Error reading file ${fileName}:`, error.message);
    return {
      isDuplicate: false,
      hash: null,
      size: 0,
      message: `Error reading file: ${error.message}`
    };
  }
}

// Process multiple uploaded files and detect duplicates (memory-based)
export async function processBatchUploads(files) {
  await loadUploadCache();
  
  const results = {
    processed: [],
    duplicates: [],
    unique: [],
    totalSize: 0,
    duplicateSize: 0,
    stats: {
      totalFiles: files.length,
      uniqueFiles: 0,
      duplicateFiles: 0,
      totalSizeBytes: 0,
      duplicateSizeBytes: 0
    }
  };
  
  console.log(`🔍 Checking ${files.length} uploaded files for duplicates (memory-based)...`);
  
  for (const file of files) {
    // Use buffer from multer memory storage
    const checkResult = checkForDuplicateBuffer(file.buffer, file.originalname);
    
    const fileInfo = {
      originalName: file.originalname,
      buffer: file.buffer, // Store buffer reference instead of file path
      size: checkResult.size,
      hash: checkResult.hash,
      isDuplicate: checkResult.isDuplicate,
      message: checkResult.message,
      mimeType: file.mimetype
    };
    
    results.processed.push(fileInfo);
    results.totalSize += checkResult.size;
    results.stats.totalSizeBytes += checkResult.size;
    
    if (checkResult.isDuplicate) {
      results.duplicates.push(fileInfo);
      results.duplicateSize += checkResult.size;
      results.stats.duplicateFiles++;
      results.stats.duplicateSizeBytes += checkResult.size;
      
      console.log(`♻️  [DUPLICATE] ${file.originalname} (${(checkResult.size/1024).toFixed(1)}KB) - In Memory`);
      console.log(`   📄 Same as: ${checkResult.existingFile}`);
      console.log(`   🗑️  Duplicate buffer discarded automatically`);
      
    } else {
      results.unique.push(fileInfo);
      results.stats.uniqueFiles++;
      
      console.log(`✨ [UNIQUE] ${file.originalname} (${(checkResult.size/1024).toFixed(1)}KB) - Stored in Memory`);
      console.log(`   🔑 Hash: ${checkResult.hash.substring(0, 8)}...`);
    }
  }
  
  // Save updated cache
  await saveUploadCache();
  
  // Summary
  console.log('\n📊 MEMORY-BASED UPLOAD DEDUPLICATION SUMMARY:');
  console.log('=' .repeat(50));
  console.log(`📁 Total files: ${results.stats.totalFiles}`);
  console.log(`✨ Unique files: ${results.stats.uniqueFiles} (stored in memory)`);
  console.log(`♻️  Duplicate files: ${results.stats.duplicateFiles} (buffers discarded)`);
  console.log(`💾 Total size: ${(results.stats.totalSizeBytes/1024).toFixed(1)}KB`);
  console.log(`🗑️  Duplicate size: ${(results.stats.duplicateSizeBytes/1024).toFixed(1)}KB saved`);
  console.log(`🚀 Storage: In-memory buffers (no disk writes)`);
  
  if (results.stats.duplicateFiles > 0) {
    const percentDuplicate = (results.stats.duplicateFiles / results.stats.totalFiles * 100).toFixed(1);
    const sizeSaved = (results.stats.duplicateSizeBytes/1024).toFixed(1);
    console.log(`⚡ Efficiency: ${percentDuplicate}% duplicates skipped, ${sizeSaved}KB processing avoided`);
  }
  
  return results;
}

// Get cache statistics
export function getCacheStats() {
  // Calculate total cache size
  let totalSizeBytes = 0;
  let buffersInMemory = 0;
  
  for (const [hash, entry] of uploadCache) {
    totalSizeBytes += entry.size || 0;
    if (entry.buffer) {
      buffersInMemory++;
    }
  }
  
  return {
    totalCachedFiles: uploadCache.size,
    totalSizeBytes: totalSizeBytes,
    totalSizeMB: Math.round((totalSizeBytes / 1024 / 1024) * 100) / 100,
    buffersInMemory: buffersInMemory,
    averageFileSize: uploadCache.size > 0 ? Math.round(totalSizeBytes / uploadCache.size) : 0,
    cacheEntries: Array.from(uploadCache.entries()).map(([hash, entry]) => ({
      hash: hash.substring(0, 8),
      fileName: entry.originalName,
      uploadedAt: entry.uploadedAt,
      processedAt: entry.processedAt || null,
      size: entry.size,
      processed: entry.processed || false,
      hasBuffer: !!entry.buffer
    })),
    memoryInfo: {
      totalFiles: uploadCache.size,
      filesWithBuffers: buffersInMemory,
      totalMemoryUsageMB: Math.round((totalSizeBytes / 1024 / 1024) * 100) / 100,
      estimatedMemoryOverhead: Math.round((uploadCache.size * 200) / 1024) // ~200 bytes per cache entry
    }
  };
}

// Get file buffer by hash
export function getFileBuffer(fileHash) {
  const entry = uploadCache.get(fileHash);
  return entry ? entry.buffer : null;
}

// Get file buffer by filename (finds first match)
export function getFileBufferByName(fileName) {
  for (const [hash, entry] of uploadCache) {
    if (entry.originalName === fileName && entry.buffer) {
      return {
        buffer: entry.buffer,
        hash: hash,
        metadata: {
          originalName: entry.originalName,
          size: entry.size,
          uploadedAt: entry.uploadedAt,
          processed: entry.processed || false
        }
      };
    }
  }
  return null;
}

// Get all cached files with buffers
export function getAllCachedFiles() {
  const files = [];
  for (const [hash, entry] of uploadCache) {
    if (entry.buffer) {
      files.push({
        hash: hash,
        buffer: entry.buffer,
        metadata: {
          originalName: entry.originalName,
          size: entry.size,
          uploadedAt: entry.uploadedAt,
          processed: entry.processed || false
        }
      });
    }
  }
  return files;
}

// Mark file as processed
export function markFileAsProcessed(fileHash) {
  const entry = uploadCache.get(fileHash);
  if (entry) {
    entry.processed = true;
    return true;
  }
  return false;
}

// Mark file as processed by name
export function markFileAsProcessedByName(fileName) {
  for (const [hash, entry] of uploadCache) {
    if (entry.originalName === fileName) {
      entry.processed = true;
      return true;
    }
  }
  return false;
}

// Export the upload cache for direct access when needed
export { uploadCache };

