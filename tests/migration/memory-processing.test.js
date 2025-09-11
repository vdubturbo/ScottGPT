/**
 * In-Memory Document Processing Test Suite
 * Tests document processing directly from memory buffers without file system
 */

import { describe, test, expect, beforeAll, afterAll, jest } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

// Mock utilities
import { 
  createMockBuffer, 
  trackMemoryUsage,
  simulateUpload 
} from '../utilities/migration/mock-helpers.js';

// Test fixtures
import {
  sampleDOCXBuffer,
  samplePDFBuffer,
  sampleMarkdownContent,
  expectedDOCXResult,
  expectedPDFResult,
  expectedMarkdownResult
} from '../fixtures/migration/sample-documents.js';

describe('In-Memory Document Processing', () => {
  let memoryTracker;
  
  beforeAll(() => {
    memoryTracker = trackMemoryUsage();
    memoryTracker.start();
  });
  
  afterAll(() => {
    const usage = memoryTracker.stop();
    console.log('Memory usage statistics:', usage);
  });

  describe('Buffer Processing', () => {
    
    test('should process DOCX from buffer without file system', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      const metadata = {
        originalName: 'test-document.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        size: buffer.length
      };
      
      // Act
      const result = await processDocumentFromBuffer(buffer, metadata);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.metadata.originalName).toBe(metadata.originalName);
      expect(result.error).toBeUndefined();
      
      // Verify no file system operations occurred
      expect(result.usedFileSystem).toBe(false);
    });
    
    test('should process PDF from buffer', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      const metadata = {
        originalName: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: buffer.length
      };
      
      // Act
      const result = await processDocumentFromBuffer(buffer, metadata);
      
      // Assert
      expect(result).toBeDefined();
      expect(result.content).toBeTruthy();
      expect(result.pages).toBeGreaterThan(0);
      expect(result.usedFileSystem).toBe(false);
    });
    
    test('should process markdown from string', async () => {
      // Arrange
      const content = sampleMarkdownContent;
      const buffer = Buffer.from(content, 'utf-8');
      const metadata = {
        originalName: 'test-document.md',
        mimeType: 'text/markdown',
        size: buffer.length
      };
      
      // Act
      const result = await processDocumentFromBuffer(buffer, metadata);
      
      // Assert
      expect(result.content).toContain('# Test Document');
      expect(result.format).toBe('markdown');
      expect(result.usedFileSystem).toBe(false);
    });
  });

  describe('Memory Efficiency', () => {
    
    test('should handle large documents without excessive memory', async () => {
      // Arrange - Create a 10MB buffer
      const largeBuffer = createMockBuffer(10 * 1024 * 1024);
      const initialMemory = process.memoryUsage().heapUsed;
      
      // Act
      const result = await processDocumentFromBuffer(largeBuffer, {
        originalName: 'large-doc.bin',
        mimeType: 'application/octet-stream'
      });
      
      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;
      
      // Memory increase should be less than 2x the document size
      expect(memoryIncrease).toBeLessThan(largeBuffer.length * 2);
      expect(result.processedSuccessfully).toBe(true);
    });
    
    test('should stream large documents when possible', async () => {
      // Arrange
      const streamableBuffer = createMockBuffer(50 * 1024 * 1024); // 50MB
      
      // Act
      const result = await processDocumentFromBuffer(streamableBuffer, {
        originalName: 'huge-doc.bin',
        mimeType: 'application/octet-stream',
        preferStreaming: true
      });
      
      // Assert
      expect(result.usedStreaming).toBe(true);
      expect(result.chunks).toBeGreaterThan(1);
    });
    
    test('should release memory after processing', async () => {
      // Arrange
      const buffer = createMockBuffer(5 * 1024 * 1024);
      const beforeProcessing = process.memoryUsage().heapUsed;
      
      // Act
      const result = await processDocumentFromBuffer(buffer, {
        originalName: 'temp-doc.bin'
      });
      
      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Assert
      const afterProcessing = process.memoryUsage().heapUsed;
      const memoryRetained = afterProcessing - beforeProcessing;
      
      // Should release most memory (allow 1MB retention)
      expect(memoryRetained).toBeLessThan(1024 * 1024);
    });
  });

  describe('Error Handling', () => {
    
    test('should handle corrupted buffer gracefully', async () => {
      // Arrange
      const corruptedBuffer = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
      
      // Act
      const result = await processDocumentFromBuffer(corruptedBuffer, {
        originalName: 'corrupted.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // Assert
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('INVALID_FORMAT');
      expect(result.fallbackUsed).toBe(true);
    });
    
    test('should handle empty buffer', async () => {
      // Arrange
      const emptyBuffer = Buffer.alloc(0);
      
      // Act
      const result = await processDocumentFromBuffer(emptyBuffer, {
        originalName: 'empty.txt'
      });
      
      // Assert
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe('EMPTY_DOCUMENT');
    });
    
    test('should handle out-of-memory scenarios', async () => {
      // Arrange - Try to allocate more than available
      const hugeSize = 2 * 1024 * 1024 * 1024; // 2GB
      
      // Act & Assert
      await expect(async () => {
        const hugeBuffer = createMockBuffer(hugeSize);
        await processDocumentFromBuffer(hugeBuffer, {
          originalName: 'huge.bin'
        });
      }).rejects.toThrow('ENOMEM');
    });
  });

  describe('Content Extraction', () => {
    
    test('should extract text from DOCX buffer', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      
      // Act
      const result = await processDocumentFromBuffer(buffer, {
        originalName: 'resume.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // Assert
      expect(result.extractedText).toBeDefined();
      expect(result.extractedText).toContain(expectedDOCXResult.text);
      expect(result.wordCount).toBeGreaterThan(0);
    });
    
    test('should extract metadata from document buffer', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      
      // Act
      const result = await processDocumentFromBuffer(buffer, {
        originalName: 'document.pdf',
        mimeType: 'application/pdf'
      });
      
      // Assert
      expect(result.metadata).toBeDefined();
      expect(result.metadata.pageCount).toBeDefined();
      expect(result.metadata.author).toBeDefined();
      expect(result.metadata.creationDate).toBeDefined();
    });
    
    test('should handle multiple document formats', async () => {
      // Arrange
      const formats = [
        { buffer: sampleDOCXBuffer, type: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
        { buffer: samplePDFBuffer, type: 'pdf', mime: 'application/pdf' },
        { buffer: Buffer.from(sampleMarkdownContent), type: 'md', mime: 'text/markdown' }
      ];
      
      // Act
      const results = await Promise.all(
        formats.map(format => 
          processDocumentFromBuffer(format.buffer, {
            originalName: `test.${format.type}`,
            mimeType: format.mime
          })
        )
      );
      
      // Assert
      results.forEach((result, index) => {
        expect(result.processedSuccessfully).toBe(true);
        expect(result.format).toBe(formats[index].type);
      });
    });
  });

  describe('Hash and Deduplication', () => {
    
    test('should generate consistent hash for same buffer', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      
      // Act
      const hash1 = crypto.createHash('sha256').update(buffer).digest('hex');
      const hash2 = crypto.createHash('sha256').update(buffer).digest('hex');
      
      // Assert
      expect(hash1).toBe(hash2);
    });
    
    test('should detect duplicate documents by hash', async () => {
      // Arrange
      const buffer1 = sampleDOCXBuffer;
      const buffer2 = Buffer.from(sampleDOCXBuffer); // Copy
      const buffer3 = createMockBuffer(1024); // Different
      
      // Act
      const hash1 = crypto.createHash('sha256').update(buffer1).digest('hex');
      const hash2 = crypto.createHash('sha256').update(buffer2).digest('hex');
      const hash3 = crypto.createHash('sha256').update(buffer3).digest('hex');
      
      // Assert
      expect(hash1).toBe(hash2); // Duplicates
      expect(hash1).not.toBe(hash3); // Different
    });
    
    test('should cache processing results by hash', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      const cache = new Map();
      
      // Act - First processing
      const result1 = await processWithCache(buffer, cache);
      expect(cache.size).toBe(1);
      
      // Act - Second processing (should use cache)
      const startTime = Date.now();
      const result2 = await processWithCache(buffer, cache);
      const duration = Date.now() - startTime;
      
      // Assert
      expect(result2).toEqual(result1);
      expect(duration).toBeLessThan(10); // Should be instant from cache
      expect(result2.fromCache).toBe(true);
    });
  });
});

// Mock implementation functions (to be replaced with actual implementations)

async function processDocumentFromBuffer(buffer, metadata) {
  // Simulate processing
  await new Promise(resolve => setTimeout(resolve, 10));
  
  return {
    content: 'Extracted content from buffer',
    metadata: metadata,
    extractedText: 'Sample extracted text',
    wordCount: 100,
    format: metadata.mimeType?.includes('pdf') ? 'pdf' : 
            metadata.mimeType?.includes('docx') ? 'docx' : 'unknown',
    usedFileSystem: false,
    processedSuccessfully: true,
    error: buffer.length === 0 ? { code: 'EMPTY_DOCUMENT' } : undefined
  };
}

async function processWithCache(buffer, cache) {
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  
  if (cache.has(hash)) {
    return { ...cache.get(hash), fromCache: true };
  }
  
  const result = await processDocumentFromBuffer(buffer, {});
  cache.set(hash, result);
  return { ...result, fromCache: false };
}

export { processDocumentFromBuffer, processWithCache };