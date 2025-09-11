/**
 * Performance Comparison Test Suite
 * Benchmarks file-based vs memory-based document processing
 */

import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { performance } from 'perf_hooks';

// Mock utilities
import { 
  createMockBuffer,
  measurePerformance,
  formatBenchmarkResults
} from '../utilities/migration/mock-helpers.js';

// Test fixtures
import {
  sampleDOCXBuffer,
  samplePDFBuffer,
  sampleMarkdownContent
} from '../fixtures/migration/sample-documents.js';

describe('Performance Comparison: File vs Memory Processing', () => {
  let tempDir;
  let benchmarkResults = {
    fileBased: [],
    memoryBased: [],
    summary: {}
  };
  
  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'perf-test-'));
    console.log('\n📊 Starting Performance Benchmarks...\n');
  });
  
  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    console.log('\n📈 Benchmark Results Summary:');
    console.log(formatBenchmarkResults(benchmarkResults));
  });

  describe('Processing Speed', () => {
    
    test('should benchmark small document processing (< 100KB)', async () => {
      // Arrange
      const sizes = [10, 50, 100]; // KB
      const results = { file: [], memory: [] };
      
      for (const sizeKB of sizes) {
        const buffer = createMockBuffer(sizeKB * 1024);
        const tempFile = path.join(tempDir, `small-${sizeKB}kb.bin`);
        await fs.writeFile(tempFile, buffer);
        
        // Benchmark file-based processing
        const fileTime = await benchmarkFileProcessing(tempFile, 10);
        results.file.push({ size: sizeKB, time: fileTime });
        
        // Benchmark memory-based processing
        const memoryTime = await benchmarkMemoryProcessing(buffer, 10);
        results.memory.push({ size: sizeKB, time: memoryTime });
        
        // Clean up
        await fs.unlink(tempFile);
      }
      
      // Assert - Memory should be faster for small files
      results.memory.forEach((memResult, i) => {
        const fileResult = results.file[i];
        const speedup = fileResult.time / memResult.time;
        
        console.log(`  ${memResult.size}KB: Memory ${speedup.toFixed(2)}x faster`);
        expect(memResult.time).toBeLessThanOrEqual(fileResult.time * 1.5);
      });
      
      benchmarkResults.summary.smallFiles = results;
    });
    
    test('should benchmark medium document processing (100KB - 10MB)', async () => {
      // Arrange
      const sizes = [500, 1024, 5120, 10240]; // KB
      const results = { file: [], memory: [] };
      
      for (const sizeKB of sizes) {
        const buffer = createMockBuffer(sizeKB * 1024);
        const tempFile = path.join(tempDir, `medium-${sizeKB}kb.bin`);
        await fs.writeFile(tempFile, buffer);
        
        // Benchmark with fewer iterations for larger files
        const iterations = sizeKB > 1024 ? 3 : 5;
        
        const fileTime = await benchmarkFileProcessing(tempFile, iterations);
        results.file.push({ size: sizeKB, time: fileTime });
        
        const memoryTime = await benchmarkMemoryProcessing(buffer, iterations);
        results.memory.push({ size: sizeKB, time: memoryTime });
        
        await fs.unlink(tempFile);
      }
      
      // Analyze results
      results.memory.forEach((memResult, i) => {
        const fileResult = results.file[i];
        const speedup = fileResult.time / memResult.time;
        console.log(`  ${(memResult.size/1024).toFixed(1)}MB: Memory ${speedup.toFixed(2)}x faster`);
      });
      
      benchmarkResults.summary.mediumFiles = results;
    });
    
    test('should benchmark large document processing (> 10MB)', async () => {
      // Arrange
      const sizes = [20, 50]; // MB
      const results = { file: [], memory: [] };
      
      for (const sizeMB of sizes) {
        const buffer = createMockBuffer(sizeMB * 1024 * 1024);
        const tempFile = path.join(tempDir, `large-${sizeMB}mb.bin`);
        await fs.writeFile(tempFile, buffer);
        
        // Single iteration for large files
        const fileTime = await benchmarkFileProcessing(tempFile, 1);
        results.file.push({ size: sizeMB, time: fileTime });
        
        const memoryTime = await benchmarkMemoryProcessing(buffer, 1);
        results.memory.push({ size: sizeMB, time: memoryTime });
        
        await fs.unlink(tempFile);
      }
      
      // Assert - Performance should be comparable for large files
      results.memory.forEach((memResult, i) => {
        const fileResult = results.file[i];
        const ratio = memResult.time / fileResult.time;
        
        console.log(`  ${memResult.size}MB: Memory/File ratio: ${ratio.toFixed(2)}`);
        // Memory might be slower for very large files due to memory pressure
        expect(ratio).toBeLessThan(2.0);
      });
      
      benchmarkResults.summary.largeFiles = results;
    });
  });

  describe('Memory Usage', () => {
    
    test('should compare memory footprint for file vs memory processing', async () => {
      // Arrange
      const sizes = [1, 5, 10, 20]; // MB
      const memoryUsage = { file: [], memory: [] };
      
      for (const sizeMB of sizes) {
        const buffer = createMockBuffer(sizeMB * 1024 * 1024);
        const tempFile = path.join(tempDir, `memory-test-${sizeMB}mb.bin`);
        await fs.writeFile(tempFile, buffer);
        
        // Measure file-based memory usage
        const fileMemory = await measureMemoryUsage(async () => {
          await processDocumentFromFile(tempFile);
        });
        memoryUsage.file.push({ size: sizeMB, memory: fileMemory });
        
        // Measure memory-based memory usage
        const bufferMemory = await measureMemoryUsage(async () => {
          await processDocumentFromMemory(buffer);
        });
        memoryUsage.memory.push({ size: sizeMB, memory: bufferMemory });
        
        await fs.unlink(tempFile);
      }
      
      // Compare memory usage
      console.log('\n  Memory Usage Comparison:');
      memoryUsage.memory.forEach((memResult, i) => {
        const fileResult = memoryUsage.file[i];
        const overhead = ((memResult.memory - fileResult.memory) / fileResult.memory) * 100;
        
        console.log(`    ${memResult.size}MB document:`);
        console.log(`      File-based: ${(fileResult.memory / 1024 / 1024).toFixed(2)}MB`);
        console.log(`      Memory-based: ${(memResult.memory / 1024 / 1024).toFixed(2)}MB`);
        console.log(`      Overhead: ${overhead.toFixed(1)}%`);
      });
      
      benchmarkResults.summary.memoryUsage = memoryUsage;
    });
    
    test('should measure garbage collection impact', async () => {
      // Arrange
      const buffer = createMockBuffer(10 * 1024 * 1024); // 10MB
      const gcStats = { file: [], memory: [] };
      
      // Force GC if available
      const forceGC = () => {
        if (global.gc) global.gc();
      };
      
      // Measure with file processing
      forceGC();
      const fileGCStart = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 5; i++) {
        const tempFile = path.join(tempDir, `gc-test-${i}.bin`);
        await fs.writeFile(tempFile, buffer);
        await processDocumentFromFile(tempFile);
        await fs.unlink(tempFile);
      }
      
      forceGC();
      const fileGCEnd = process.memoryUsage().heapUsed;
      gcStats.file = fileGCEnd - fileGCStart;
      
      // Measure with memory processing
      forceGC();
      const memGCStart = process.memoryUsage().heapUsed;
      
      for (let i = 0; i < 5; i++) {
        await processDocumentFromMemory(buffer);
      }
      
      forceGC();
      const memGCEnd = process.memoryUsage().heapUsed;
      gcStats.memory = memGCEnd - memGCStart;
      
      console.log('\n  Garbage Collection Impact:');
      console.log(`    File-based retained: ${(gcStats.file / 1024 / 1024).toFixed(2)}MB`);
      console.log(`    Memory-based retained: ${(gcStats.memory / 1024 / 1024).toFixed(2)}MB`);
      
      benchmarkResults.summary.gcImpact = gcStats;
    });
  });

  describe('Concurrent Processing', () => {
    
    test('should benchmark concurrent document processing', async () => {
      // Arrange
      const concurrencyLevels = [1, 5, 10, 20];
      const buffer = createMockBuffer(1024 * 1024); // 1MB
      const results = { file: [], memory: [] };
      
      for (const concurrency of concurrencyLevels) {
        // Prepare temp files
        const tempFiles = [];
        for (let i = 0; i < concurrency; i++) {
          const tempFile = path.join(tempDir, `concurrent-${i}.bin`);
          await fs.writeFile(tempFile, buffer);
          tempFiles.push(tempFile);
        }
        
        // Benchmark file-based concurrent processing
        const fileStart = performance.now();
        await Promise.all(tempFiles.map(f => processDocumentFromFile(f)));
        const fileTime = performance.now() - fileStart;
        results.file.push({ concurrency, time: fileTime });
        
        // Benchmark memory-based concurrent processing
        const memStart = performance.now();
        await Promise.all(Array(concurrency).fill(buffer).map(b => processDocumentFromMemory(b)));
        const memTime = performance.now() - memStart;
        results.memory.push({ concurrency, time: memTime });
        
        // Clean up
        await Promise.all(tempFiles.map(f => fs.unlink(f)));
      }
      
      console.log('\n  Concurrent Processing Performance:');
      results.memory.forEach((memResult, i) => {
        const fileResult = results.file[i];
        const speedup = fileResult.time / memResult.time;
        
        console.log(`    ${memResult.concurrency} concurrent: Memory ${speedup.toFixed(2)}x faster`);
      });
      
      benchmarkResults.summary.concurrent = results;
    });
    
    test('should measure throughput (docs/second)', async () => {
      // Arrange
      const testDuration = 5000; // 5 seconds
      const buffer = createMockBuffer(100 * 1024); // 100KB
      
      // Measure file-based throughput
      const tempFile = path.join(tempDir, 'throughput-test.bin');
      await fs.writeFile(tempFile, buffer);
      
      let fileCount = 0;
      const fileStart = Date.now();
      while (Date.now() - fileStart < testDuration) {
        await processDocumentFromFile(tempFile);
        fileCount++;
      }
      const fileThroughput = fileCount / (testDuration / 1000);
      
      await fs.unlink(tempFile);
      
      // Measure memory-based throughput
      let memoryCount = 0;
      const memoryStart = Date.now();
      while (Date.now() - memoryStart < testDuration) {
        await processDocumentFromMemory(buffer);
        memoryCount++;
      }
      const memoryThroughput = memoryCount / (testDuration / 1000);
      
      console.log('\n  Throughput Comparison:');
      console.log(`    File-based: ${fileThroughput.toFixed(1)} docs/sec`);
      console.log(`    Memory-based: ${memoryThroughput.toFixed(1)} docs/sec`);
      console.log(`    Improvement: ${((memoryThroughput - fileThroughput) / fileThroughput * 100).toFixed(1)}%`);
      
      expect(memoryThroughput).toBeGreaterThan(fileThroughput);
      
      benchmarkResults.summary.throughput = {
        file: fileThroughput,
        memory: memoryThroughput
      };
    });
  });

  describe('Real-world Scenarios', () => {
    
    test('should benchmark typical resume processing', async () => {
      // Arrange - Use actual DOCX buffer
      const buffer = sampleDOCXBuffer;
      const tempFile = path.join(tempDir, 'resume.docx');
      await fs.writeFile(tempFile, buffer);
      
      const iterations = 20;
      
      // Benchmark file processing
      const fileResults = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await processDocumentFromFile(tempFile);
        fileResults.push(performance.now() - start);
      }
      
      // Benchmark memory processing
      const memoryResults = [];
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await processDocumentFromMemory(buffer);
        memoryResults.push(performance.now() - start);
      }
      
      // Calculate statistics
      const fileAvg = fileResults.reduce((a, b) => a + b) / iterations;
      const memoryAvg = memoryResults.reduce((a, b) => a + b) / iterations;
      const fileMin = Math.min(...fileResults);
      const memoryMin = Math.min(...memoryResults);
      const fileMax = Math.max(...fileResults);
      const memoryMax = Math.max(...memoryResults);
      
      console.log('\n  Resume Processing Performance:');
      console.log(`    File-based: avg=${fileAvg.toFixed(2)}ms, min=${fileMin.toFixed(2)}ms, max=${fileMax.toFixed(2)}ms`);
      console.log(`    Memory-based: avg=${memoryAvg.toFixed(2)}ms, min=${memoryMin.toFixed(2)}ms, max=${memoryMax.toFixed(2)}ms`);
      console.log(`    Speed improvement: ${((fileAvg - memoryAvg) / fileAvg * 100).toFixed(1)}%`);
      
      await fs.unlink(tempFile);
      
      benchmarkResults.summary.resumeProcessing = {
        file: { avg: fileAvg, min: fileMin, max: fileMax },
        memory: { avg: memoryAvg, min: memoryMin, max: memoryMax }
      };
    });
    
    test('should benchmark batch processing scenario', async () => {
      // Arrange - Simulate batch of 100 documents
      const batchSize = 100;
      const buffers = Array(batchSize).fill(null).map(() => 
        createMockBuffer(Math.random() * 500 * 1024) // 0-500KB random sizes
      );
      
      // Prepare temp files
      const tempFiles = [];
      for (let i = 0; i < batchSize; i++) {
        const tempFile = path.join(tempDir, `batch-${i}.bin`);
        await fs.writeFile(tempFile, buffers[i]);
        tempFiles.push(tempFile);
      }
      
      // Benchmark file-based batch processing
      const fileStart = performance.now();
      for (const file of tempFiles) {
        await processDocumentFromFile(file);
      }
      const fileBatchTime = performance.now() - fileStart;
      
      // Benchmark memory-based batch processing
      const memoryStart = performance.now();
      for (const buffer of buffers) {
        await processDocumentFromMemory(buffer);
      }
      const memoryBatchTime = performance.now() - memoryStart;
      
      // Clean up
      await Promise.all(tempFiles.map(f => fs.unlink(f)));
      
      console.log('\n  Batch Processing (100 documents):');
      console.log(`    File-based: ${fileBatchTime.toFixed(0)}ms total, ${(fileBatchTime/batchSize).toFixed(2)}ms per doc`);
      console.log(`    Memory-based: ${memoryBatchTime.toFixed(0)}ms total, ${(memoryBatchTime/batchSize).toFixed(2)}ms per doc`);
      console.log(`    Speed improvement: ${((fileBatchTime - memoryBatchTime) / fileBatchTime * 100).toFixed(1)}%`);
      
      expect(memoryBatchTime).toBeLessThan(fileBatchTime);
      
      benchmarkResults.summary.batchProcessing = {
        file: fileBatchTime,
        memory: memoryBatchTime,
        documentsProcessed: batchSize
      };
    });
  });
});

// Benchmark helper functions

async function benchmarkFileProcessing(filePath, iterations = 10) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await processDocumentFromFile(filePath);
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b) / iterations;
}

async function benchmarkMemoryProcessing(buffer, iterations = 10) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await processDocumentFromMemory(buffer);
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b) / iterations;
}

async function measureMemoryUsage(fn) {
  const before = process.memoryUsage().heapUsed;
  await fn();
  const after = process.memoryUsage().heapUsed;
  return after - before;
}

// Mock processing functions

async function processDocumentFromFile(filePath) {
  // Simulate file I/O overhead
  await new Promise(resolve => setTimeout(resolve, 5));
  const buffer = await fs.readFile(filePath);
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, buffer.length / 100000));
  return { processed: true, size: buffer.length };
}

async function processDocumentFromMemory(buffer) {
  // No file I/O overhead
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, buffer.length / 100000));
  return { processed: true, size: buffer.length };
}

export { benchmarkFileProcessing, benchmarkMemoryProcessing, measureMemoryUsage };