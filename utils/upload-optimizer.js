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
    uploadCache = new Map(Object.entries(cache.fileHashes || {}));
    console.log(`📋 Loaded ${uploadCache.size} file upload hashes`);
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

// Generate file hash for duplicate detection
export function generateFileHash(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex').substring(0, 16);
}

// Check if file content is duplicate
export async function checkForDuplicate(filePath, fileName) {
  try {
    const buffer = await fs.readFile(filePath);
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
    
    // Not a duplicate, add to cache
    uploadCache.set(fileHash, {
      originalName: fileName,
      uploadedAt: new Date().toISOString(),
      size: fileSize,
      filePath
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
      message: `Error reading file: ${error.message}`
    };
  }
}

// Process multiple uploaded files and detect duplicates
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
  
  console.log(`🔍 Checking ${files.length} uploaded files for duplicates...`);
  
  for (const file of files) {
    const checkResult = await checkForDuplicate(file.path, file.originalname);
    
    const fileInfo = {
      originalName: file.originalname,
      filePath: file.path,
      size: checkResult.size,
      hash: checkResult.hash,
      isDuplicate: checkResult.isDuplicate,
      message: checkResult.message
    };
    
    results.processed.push(fileInfo);
    results.totalSize += checkResult.size;
    results.stats.totalSizeBytes += checkResult.size;
    
    if (checkResult.isDuplicate) {
      results.duplicates.push(fileInfo);
      results.duplicateSize += checkResult.size;
      results.stats.duplicateFiles++;
      results.stats.duplicateSizeBytes += checkResult.size;
      
      console.log(`♻️  [DUPLICATE] ${file.originalname} (${(checkResult.size/1024).toFixed(1)}KB)`);
      console.log(`   📄 Same as: ${checkResult.existingFile}`);
      
      // Remove duplicate file from incoming to prevent processing
      try {
        await fs.unlink(file.path);
        console.log(`🗑️  Deleted duplicate file: ${file.path}`);
      } catch (unlinkError) {
        console.warn(`⚠️  Could not delete duplicate: ${unlinkError.message}`);
      }
      
    } else {
      results.unique.push(fileInfo);
      results.stats.uniqueFiles++;
      
      console.log(`✨ [UNIQUE] ${file.originalname} (${(checkResult.size/1024).toFixed(1)}KB)`);
      console.log(`   🔑 Hash: ${checkResult.hash.substring(0, 8)}...`);
    }
  }
  
  // Save updated cache
  await saveUploadCache();
  
  // Summary
  console.log('\n📊 UPLOAD DEDUPLICATION SUMMARY:');
  console.log('=' .repeat(40));
  console.log(`📁 Total files: ${results.stats.totalFiles}`);
  console.log(`✨ Unique files: ${results.stats.uniqueFiles}`);
  console.log(`♻️  Duplicate files: ${results.stats.duplicateFiles}`);
  console.log(`💾 Total size: ${(results.stats.totalSizeBytes/1024).toFixed(1)}KB`);
  console.log(`🗑️  Duplicate size: ${(results.stats.duplicateSizeBytes/1024).toFixed(1)}KB`);
  
  if (results.stats.duplicateFiles > 0) {
    const percentDuplicate = (results.stats.duplicateFiles / results.stats.totalFiles * 100).toFixed(1);
    const sizeSaved = (results.stats.duplicateSizeBytes/1024).toFixed(1);
    console.log(`⚡ Efficiency: ${percentDuplicate}% duplicates skipped, ${sizeSaved}KB processing avoided`);
  }
  
  return results;
}

// Get cache statistics
export function getCacheStats() {
  return {
    totalCachedFiles: uploadCache.size,
    cacheEntries: Array.from(uploadCache.entries()).map(([hash, entry]) => ({
      hash: hash.substring(0, 8),
      fileName: entry.originalName,
      uploadedAt: entry.uploadedAt,
      size: entry.size
    }))
  };
}

// Clear cache (for debugging)
export async function clearUploadCache() {
  uploadCache.clear();
  try {
    await fs.unlink(UPLOAD_CACHE_FILE);
    console.log('🗑️  Upload cache cleared');
  } catch (error) {
    console.log('✅ Cache file already cleared');
  }
}