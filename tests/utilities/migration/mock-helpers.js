/**
 * Mock Utilities for Migration Testing
 * Provides helper functions for testing document processing migration
 */

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Create a mock buffer with specified size and content type
 * @param {number} size - Size of buffer in bytes
 * @param {string} contentType - Type of content ('text', 'binary', 'unicode')
 * @returns {Buffer} Mock buffer
 */
export function createMockBuffer(size = 1024, contentType = 'text') {
  switch (contentType) {
    case 'text':
      const text = 'A'.repeat(size);
      return Buffer.from(text);
    
    case 'binary':
      return Buffer.alloc(size, 0xFF);
    
    case 'unicode':
      const unicodeText = '🚀💻🎯⭐'.repeat(Math.ceil(size / 16)) + 'José María González-Pérez';
      return Buffer.from(unicodeText.substring(0, size), 'utf8');
    
    case 'random':
      const randomBuffer = Buffer.alloc(size);
      for (let i = 0; i < size; i++) {
        randomBuffer[i] = Math.floor(Math.random() * 256);
      }
      return randomBuffer;
    
    default:
      return Buffer.alloc(size, 'X');
  }
}

/**
 * Create a temporary file for testing
 * @param {string} filename - Name of the temp file
 * @param {Buffer|string} content - Content to write
 * @returns {Promise<string>} Path to created temp file
 */
export async function createTempFile(filename, content) {
  const tempDir = os.tmpdir();
  const tempPath = path.join(tempDir, `scottgpt-test-${Date.now()}-${filename}`);
  
  if (Buffer.isBuffer(content)) {
    await fs.writeFile(tempPath, content);
  } else {
    await fs.writeFile(tempPath, content, 'utf8');
  }
  
  return tempPath;
}

/**
 * Delete a temporary file
 * @param {string} filePath - Path to file to delete
 * @returns {Promise<boolean>} Success status
 */
export async function deleteTempFile(filePath) {
  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    console.warn(`Failed to delete temp file ${filePath}:`, error.message);
    return false;
  }
}

/**
 * Simulate a file upload with buffer data
 * @param {Buffer} buffer - File buffer
 * @param {Object} metadata - File metadata
 * @returns {Object} Simulated upload object
 */
export function simulateUpload(buffer, metadata = {}) {
  const uploadId = crypto.randomBytes(16).toString('hex');
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  
  return {
    uploadId,
    buffer,
    originalName: metadata.originalName || 'test-file.bin',
    mimeType: metadata.mimeType || 'application/octet-stream',
    size: buffer.length,
    hash,
    uploadedAt: new Date().toISOString(),
    metadata: {
      ...metadata,
      contentHash: hash,
      bufferLength: buffer.length
    }
  };
}

/**
 * Compare processing results for equivalence
 * @param {Object} result1 - First processing result
 * @param {Object} result2 - Second processing result
 * @param {Object} options - Comparison options
 * @returns {boolean} True if results are equivalent
 */
export function compareResults(result1, result2, options = {}) {
  const {
    ignoreTimestamps = true,
    ignorePaths = true,
    contentTolerance = 0.95, // 95% similarity threshold
    normalizeWhitespace = true
  } = options;
  
  // Check basic properties
  if (result1.processedSuccessfully !== result2.processedSuccessfully) {
    return false;
  }
  
  if (result1.format !== result2.format) {
    return false;
  }
  
  // Compare content
  let content1 = result1.content || result1.extractedText || '';
  let content2 = result2.content || result2.extractedText || '';
  
  if (normalizeWhitespace) {
    content1 = normalizeOutput(content1);
    content2 = normalizeOutput(content2);
  }
  
  // Check content similarity
  const similarity = calculateContentSimilarity(content1, content2);
  if (similarity < contentTolerance) {
    return false;
  }
  
  // Compare metadata (with optional ignores)
  if (result1.metadata && result2.metadata) {
    const meta1 = { ...result1.metadata };
    const meta2 = { ...result2.metadata };
    
    if (ignoreTimestamps) {
      delete meta1.createdAt;
      delete meta1.modifiedAt;
      delete meta1.processedAt;
      delete meta2.createdAt;
      delete meta2.modifiedAt;
      delete meta2.processedAt;
    }
    
    if (ignorePaths) {
      delete meta1.filePath;
      delete meta1.tempPath;
      delete meta2.filePath;
      delete meta2.tempPath;
    }
    
    // Compare remaining metadata
    const metaKeys1 = Object.keys(meta1).sort();
    const metaKeys2 = Object.keys(meta2).sort();
    
    if (JSON.stringify(metaKeys1) !== JSON.stringify(metaKeys2)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Normalize output for consistent comparison
 * @param {string} text - Text to normalize
 * @returns {string} Normalized text
 */
export function normalizeOutput(text) {
  if (!text || typeof text !== 'string') {
    return '';
  }
  
  return text
    .replace(/\r\n/g, '\n')           // Normalize line endings
    .replace(/\r/g, '\n')            // Handle old Mac line endings
    .replace(/\n+/g, '\n')           // Collapse multiple newlines
    .replace(/[ \t]+/g, ' ')         // Normalize whitespace
    .replace(/^\s+|\s+$/g, '')       // Trim start/end
    .toLowerCase();                   // Case insensitive
}

/**
 * Calculate content similarity between two strings
 * @param {string} str1 - First string
 * @param {string} str2 - Second string
 * @returns {number} Similarity score (0-1)
 */
function calculateContentSimilarity(str1, str2) {
  if (str1 === str2) return 1;
  if (!str1 || !str2) return 0;
  
  // Simple Jaccard similarity on words
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

/**
 * Track memory usage during processing
 * @returns {Object} Memory tracker object
 */
export function trackMemoryUsage() {
  const measurements = [];
  let isTracking = false;
  let intervalId = null;
  
  return {
    start(intervalMs = 100) {
      if (isTracking) return;
      
      isTracking = true;
      measurements.length = 0; // Clear previous measurements
      
      // Take initial measurement
      measurements.push({
        timestamp: Date.now(),
        memory: process.memoryUsage()
      });
      
      // Start periodic measurements
      intervalId = setInterval(() => {
        measurements.push({
          timestamp: Date.now(),
          memory: process.memoryUsage()
        });
      }, intervalMs);
    },
    
    stop() {
      if (!isTracking) return null;
      
      isTracking = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      
      // Take final measurement
      measurements.push({
        timestamp: Date.now(),
        memory: process.memoryUsage()
      });
      
      return this.getStats();
    },
    
    getStats() {
      if (measurements.length < 2) return null;
      
      const initial = measurements[0];
      const final = measurements[measurements.length - 1];
      const peak = measurements.reduce((max, current) => 
        current.memory.heapUsed > max.memory.heapUsed ? current : max
      );
      
      return {
        duration: final.timestamp - initial.timestamp,
        initial: initial.memory,
        final: final.memory,
        peak: peak.memory,
        totalIncrease: {
          heapUsed: final.memory.heapUsed - initial.memory.heapUsed,
          heapTotal: final.memory.heapTotal - initial.memory.heapTotal,
          external: final.memory.external - initial.memory.external,
          rss: final.memory.rss - initial.memory.rss
        },
        peakIncrease: {
          heapUsed: peak.memory.heapUsed - initial.memory.heapUsed,
          heapTotal: peak.memory.heapTotal - initial.memory.heapTotal,
          external: peak.memory.external - initial.memory.external,
          rss: peak.memory.rss - initial.memory.rss
        },
        measurements: measurements.length,
        memoryEfficient: (peak.memory.heapUsed - initial.memory.heapUsed) < (50 * 1024 * 1024) // 50MB threshold
      };
    },
    
    getCurrentUsage() {
      return process.memoryUsage();
    }
  };
}

/**
 * Measure processing performance
 * @param {Function} processingFn - Function to measure
 * @param {Array} testData - Array of test data items
 * @param {Object} options - Measurement options
 * @returns {Promise<Object>} Performance measurements
 */
export async function measurePerformance(processingFn, testData = [], options = {}) {
  const {
    iterations = 1,
    warmupIterations = 0,
    trackMemory = true,
    concurrent = false,
    concurrentLimit = 5
  } = options;
  
  const measurements = {
    warmup: [],
    actual: [],
    memory: null,
    errors: []
  };
  
  // Warmup phase
  for (let i = 0; i < warmupIterations; i++) {
    try {
      const start = performance.now();
      if (testData.length > 0) {
        const testItem = testData[i % testData.length];
        await processingFn(testItem);
      } else {
        await processingFn();
      }
      measurements.warmup.push(performance.now() - start);
    } catch (error) {
      measurements.errors.push({ phase: 'warmup', iteration: i, error });
    }
  }
  
  // Memory tracking setup
  let memoryTracker = null;
  if (trackMemory) {
    memoryTracker = trackMemoryUsage();
    memoryTracker.start();
  }
  
  // Actual measurement phase
  const startTime = performance.now();
  
  if (concurrent && testData.length > 0) {
    // Concurrent processing
    const chunks = [];
    for (let i = 0; i < testData.length; i += concurrentLimit) {
      chunks.push(testData.slice(i, i + concurrentLimit));
    }
    
    for (const chunk of chunks) {
      const promises = chunk.map(async (testItem, index) => {
        const itemStart = performance.now();
        try {
          await processingFn(testItem);
          return performance.now() - itemStart;
        } catch (error) {
          measurements.errors.push({ phase: 'actual', item: index, error });
          return null;
        }
      });
      
      const results = await Promise.all(promises);
      measurements.actual.push(...results.filter(r => r !== null));
    }
  } else {
    // Sequential processing
    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        if (testData.length > 0) {
          const testItem = testData[i % testData.length];
          await processingFn(testItem);
        } else {
          await processingFn();
        }
        measurements.actual.push(performance.now() - start);
      } catch (error) {
        measurements.errors.push({ phase: 'actual', iteration: i, error });
      }
    }
  }
  
  const totalTime = performance.now() - startTime;
  
  // Stop memory tracking
  if (memoryTracker) {
    measurements.memory = memoryTracker.stop();
  }
  
  // Calculate statistics
  const actualTimes = measurements.actual;
  const stats = {
    totalTime,
    iterations: actualTimes.length,
    errors: measurements.errors.length,
    times: {
      min: Math.min(...actualTimes),
      max: Math.max(...actualTimes),
      mean: actualTimes.reduce((a, b) => a + b, 0) / actualTimes.length,
      median: actualTimes.sort((a, b) => a - b)[Math.floor(actualTimes.length / 2)],
      p95: actualTimes.sort((a, b) => a - b)[Math.floor(actualTimes.length * 0.95)],
      p99: actualTimes.sort((a, b) => a - b)[Math.floor(actualTimes.length * 0.99)]
    },
    throughput: {
      operationsPerSecond: (actualTimes.length / totalTime) * 1000,
      averageTimePerOperation: totalTime / actualTimes.length
    },
    memory: measurements.memory
  };
  
  return stats;
}

/**
 * Format benchmark results for display
 * @param {Object} results - Benchmark results
 * @param {Object} options - Formatting options
 * @returns {string} Formatted results
 */
export function formatBenchmarkResults(results, options = {}) {
  const { includeMemory = true, precision = 2 } = options;
  
  const lines = [];
  lines.push('📊 Performance Benchmark Results');
  lines.push('================================');
  lines.push('');
  
  // Time statistics
  lines.push('⏱️  Timing Statistics:');
  lines.push(`  Total Time: ${results.totalTime.toFixed(precision)}ms`);
  lines.push(`  Iterations: ${results.iterations}`);
  lines.push(`  Errors: ${results.errors}`);
  lines.push('');
  
  if (results.times) {
    lines.push('  Time Distribution:');
    lines.push(`    Min:    ${results.times.min.toFixed(precision)}ms`);
    lines.push(`    Mean:   ${results.times.mean.toFixed(precision)}ms`);
    lines.push(`    Median: ${results.times.median.toFixed(precision)}ms`);
    lines.push(`    Max:    ${results.times.max.toFixed(precision)}ms`);
    lines.push(`    P95:    ${results.times.p95.toFixed(precision)}ms`);
    lines.push(`    P99:    ${results.times.p99.toFixed(precision)}ms`);
    lines.push('');
  }
  
  // Throughput
  if (results.throughput) {
    lines.push('🚀 Throughput:');
    lines.push(`  Operations/sec: ${results.throughput.operationsPerSecond.toFixed(precision)}`);
    lines.push(`  Avg time/op:    ${results.throughput.averageTimePerOperation.toFixed(precision)}ms`);
    lines.push('');
  }
  
  // Memory statistics
  if (includeMemory && results.memory) {
    const mem = results.memory;
    lines.push('💾 Memory Usage:');
    lines.push(`  Duration: ${mem.duration}ms`);
    lines.push(`  Initial Heap: ${formatBytes(mem.initial.heapUsed)}`);
    lines.push(`  Final Heap:   ${formatBytes(mem.final.heapUsed)}`);
    lines.push(`  Peak Heap:    ${formatBytes(mem.peak.heapUsed)}`);
    lines.push(`  Heap Increase: ${formatBytes(mem.totalIncrease.heapUsed)}`);
    lines.push(`  Peak Increase: ${formatBytes(mem.peakIncrease.heapUsed)}`);
    lines.push(`  Memory Efficient: ${mem.memoryEfficient ? '✅' : '❌'}`);
    lines.push('');
  }
  
  return lines.join('\n');
}

/**
 * Format bytes for human-readable display
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Create a test suite helper for running multiple test scenarios
 * @param {Array} scenarios - Array of test scenarios
 * @param {Function} testFn - Test function to run
 * @param {Object} options - Test options
 * @returns {Promise<Object>} Test results summary
 */
export async function runTestScenarios(scenarios, testFn, options = {}) {
  const { parallel = false, continueOnError = true } = options;
  
  const results = {
    total: scenarios.length,
    passed: 0,
    failed: 0,
    errors: [],
    results: []
  };
  
  const runScenario = async (scenario, index) => {
    try {
      const result = await testFn(scenario, index);
      results.results.push({ 
        scenario: scenario.name || `Scenario ${index}`, 
        success: true, 
        result 
      });
      results.passed++;
      return result;
    } catch (error) {
      results.results.push({ 
        scenario: scenario.name || `Scenario ${index}`, 
        success: false, 
        error: error.message 
      });
      results.errors.push({ scenario: index, error });
      results.failed++;
      
      if (!continueOnError) {
        throw error;
      }
      
      return null;
    }
  };
  
  if (parallel) {
    await Promise.all(scenarios.map(runScenario));
  } else {
    for (let i = 0; i < scenarios.length; i++) {
      await runScenario(scenarios[i], i);
    }
  }
  
  results.successRate = (results.passed / results.total) * 100;
  
  return results;
}

/**
 * Mock sleep/delay function for testing
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate realistic test data
 * @param {string} type - Type of test data
 * @param {number} count - Number of items to generate
 * @returns {Array} Generated test data
 */
export function generateTestData(type, count = 10) {
  const data = [];
  
  for (let i = 0; i < count; i++) {
    switch (type) {
      case 'documents':
        data.push({
          id: `doc-${i}`,
          name: `document-${i}.docx`,
          size: Math.floor(Math.random() * 1000000) + 10000, // 10KB - 1MB
          type: ['docx', 'pdf', 'md', 'txt'][i % 4],
          content: `Sample document content ${i}`.repeat(Math.floor(Math.random() * 100) + 1)
        });
        break;
        
      case 'buffers':
        data.push(createMockBuffer(
          Math.floor(Math.random() * 500000) + 1000, // 1KB - 500KB
          ['text', 'binary', 'unicode'][i % 3]
        ));
        break;
        
      case 'metadata':
        data.push({
          originalName: `file-${i}.txt`,
          mimeType: 'text/plain',
          size: Math.floor(Math.random() * 100000) + 1000,
          uploadedAt: new Date(Date.now() - Math.random() * 86400000).toISOString(),
          tags: [`tag${i % 3}`, `category${i % 5}`]
        });
        break;
        
      default:
        data.push({ id: i, value: `test-${i}` });
    }
  }
  
  return data;
}

export default {
  createMockBuffer,
  createTempFile,
  deleteTempFile,
  simulateUpload,
  compareResults,
  normalizeOutput,
  trackMemoryUsage,
  measurePerformance,
  formatBenchmarkResults,
  runTestScenarios,
  delay,
  generateTestData
};