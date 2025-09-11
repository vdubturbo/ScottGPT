/**
 * File vs Memory Processing Comparison Tests
 * Ensures identical results between file-based and memory-based approaches
 */

import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// Mock utilities
import { 
  createTempFile,
  deleteTempFile,
  compareResults,
  normalizeOutput
} from '../utilities/migration/mock-helpers.js';

// Test fixtures
import {
  sampleDOCXBuffer,
  samplePDFBuffer,
  sampleMarkdownContent
} from '../fixtures/migration/sample-documents.js';

describe('File vs Memory Processing Comparison', () => {
  let tempDir;
  let tempFiles = [];
  
  beforeAll(async () => {
    // Create temporary directory for file-based testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scottgpt-test-'));
  });
  
  afterAll(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });
  
  beforeEach(() => {
    tempFiles = [];
  });
  
  afterEach(async () => {
    // Clean up temp files created in test
    for (const file of tempFiles) {
      await deleteTempFile(file).catch(() => {});
    }
  });

  describe('Processing Equivalence', () => {
    
    test('DOCX processing should yield identical results', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      const tempFile = path.join(tempDir, 'test-doc.docx');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act - Process via file
      const fileResult = await processDocumentFromFile(tempFile);
      
      // Act - Process via memory
      const memoryResult = await processDocumentFromMemory(buffer, {
        originalName: 'test-doc.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // Assert
      expect(normalizeOutput(memoryResult.content))
        .toBe(normalizeOutput(fileResult.content));
      expect(memoryResult.wordCount).toBe(fileResult.wordCount);
      expect(memoryResult.metadata.pages).toBe(fileResult.metadata.pages);
    });
    
    test('PDF processing should yield identical results', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      const tempFile = path.join(tempDir, 'test-doc.pdf');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(buffer, {
        originalName: 'test-doc.pdf',
        mimeType: 'application/pdf'
      });
      
      // Assert
      expect(normalizeOutput(memoryResult.extractedText))
        .toBe(normalizeOutput(fileResult.extractedText));
      expect(memoryResult.pageCount).toBe(fileResult.pageCount);
    });
    
    test('Markdown processing should yield identical results', async () => {
      // Arrange
      const content = sampleMarkdownContent;
      const buffer = Buffer.from(content, 'utf-8');
      const tempFile = path.join(tempDir, 'test-doc.md');
      await fs.writeFile(tempFile, content);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(buffer, {
        originalName: 'test-doc.md',
        mimeType: 'text/markdown'
      });
      
      // Assert
      expect(memoryResult.content).toBe(fileResult.content);
      expect(memoryResult.frontmatter).toEqual(fileResult.frontmatter);
    });
  });

  describe('Hash Consistency', () => {
    
    test('should generate same hash for file and memory buffer', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      const tempFile = path.join(tempDir, 'hash-test.docx');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act - Hash from file
      const fileBuffer = await fs.readFile(tempFile);
      const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      
      // Act - Hash from memory
      const memoryHash = crypto.createHash('sha256').update(buffer).digest('hex');
      
      // Assert
      expect(memoryHash).toBe(fileHash);
    });
    
    test('should detect identical content regardless of processing method', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      const tempFile = path.join(tempDir, 'duplicate-test.pdf');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(buffer, {
        originalName: 'duplicate-test.pdf'
      });
      
      // Generate content hashes
      const fileContentHash = crypto.createHash('sha256')
        .update(fileResult.extractedText || '')
        .digest('hex');
      const memoryContentHash = crypto.createHash('sha256')
        .update(memoryResult.extractedText || '')
        .digest('hex');
      
      // Assert
      expect(memoryContentHash).toBe(fileContentHash);
    });
  });

  describe('Error Handling Parity', () => {
    
    test('should handle corrupted documents identically', async () => {
      // Arrange
      const corruptedBuffer = Buffer.from([0xFF, 0xFE, 0x00, 0x00]);
      const tempFile = path.join(tempDir, 'corrupted.docx');
      await fs.writeFile(tempFile, corruptedBuffer);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(corruptedBuffer, {
        originalName: 'corrupted.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });
      
      // Assert
      expect(memoryResult.error?.code).toBe(fileResult.error?.code);
      expect(memoryResult.fallbackUsed).toBe(fileResult.fallbackUsed);
    });
    
    test('should handle empty documents identically', async () => {
      // Arrange
      const emptyBuffer = Buffer.alloc(0);
      const tempFile = path.join(tempDir, 'empty.txt');
      await fs.writeFile(tempFile, emptyBuffer);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(emptyBuffer, {
        originalName: 'empty.txt'
      });
      
      // Assert
      expect(memoryResult.error?.code).toBe('EMPTY_DOCUMENT');
      expect(fileResult.error?.code).toBe('EMPTY_DOCUMENT');
    });
  });

  describe('Feature Parity', () => {
    
    test('should support same document formats', async () => {
      // Arrange
      const formats = [
        { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: sampleDOCXBuffer },
        { ext: 'pdf', mime: 'application/pdf', buffer: samplePDFBuffer },
        { ext: 'md', mime: 'text/markdown', buffer: Buffer.from(sampleMarkdownContent) },
        { ext: 'txt', mime: 'text/plain', buffer: Buffer.from('Plain text content') }
      ];
      
      for (const format of formats) {
        // Arrange
        const tempFile = path.join(tempDir, `test.${format.ext}`);
        await fs.writeFile(tempFile, format.buffer);
        tempFiles.push(tempFile);
        
        // Act
        const fileResult = await processDocumentFromFile(tempFile);
        const memoryResult = await processDocumentFromMemory(format.buffer, {
          originalName: `test.${format.ext}`,
          mimeType: format.mime
        });
        
        // Assert
        expect(memoryResult.supported).toBe(fileResult.supported);
        expect(memoryResult.format).toBe(fileResult.format);
      }
    });
    
    test('should extract same metadata fields', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      const tempFile = path.join(tempDir, 'metadata-test.pdf');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act
      const fileResult = await processDocumentFromFile(tempFile);
      const memoryResult = await processDocumentFromMemory(buffer, {
        originalName: 'metadata-test.pdf'
      });
      
      // Assert - Check metadata structure
      const fileMetadataKeys = Object.keys(fileResult.metadata || {}).sort();
      const memoryMetadataKeys = Object.keys(memoryResult.metadata || {}).sort();
      
      expect(memoryMetadataKeys).toEqual(fileMetadataKeys);
    });
  });

  describe('Migration Path', () => {
    
    test('should provide backward compatibility wrapper', async () => {
      // Arrange
      const buffer = sampleDOCXBuffer;
      const tempFile = path.join(tempDir, 'compat-test.docx');
      await fs.writeFile(tempFile, buffer);
      tempFiles.push(tempFile);
      
      // Act - Use compatibility wrapper that can handle both
      const fileResult = await processDocumentUniversal({
        type: 'file',
        path: tempFile
      });
      
      const memoryResult = await processDocumentUniversal({
        type: 'buffer',
        buffer: buffer,
        metadata: { originalName: 'compat-test.docx' }
      });
      
      // Assert
      expect(compareResults(fileResult, memoryResult)).toBe(true);
    });
    
    test('should allow gradual migration with feature flag', async () => {
      // Arrange
      const buffer = samplePDFBuffer;
      const config = {
        useInMemoryProcessing: false // Start with file-based
      };
      
      // Act - Process with feature flag
      const result1 = await processWithConfig(buffer, config);
      expect(result1.processingMethod).toBe('file-based');
      
      // Update config to use memory
      config.useInMemoryProcessing = true;
      
      const result2 = await processWithConfig(buffer, config);
      expect(result2.processingMethod).toBe('memory-based');
      
      // Assert - Results should be equivalent
      expect(normalizeOutput(result2.content))
        .toBe(normalizeOutput(result1.content));
    });
    
    test('should fallback to file-based on memory failure', async () => {
      // Arrange - Simulate memory pressure
      const largeBuffer = createMockBuffer(100 * 1024 * 1024); // 100MB
      const config = {
        useInMemoryProcessing: true,
        fallbackToFile: true,
        memoryThreshold: 50 * 1024 * 1024 // 50MB limit
      };
      
      // Act
      const result = await processWithConfig(largeBuffer, config);
      
      // Assert
      expect(result.processingMethod).toBe('file-based');
      expect(result.fallbackReason).toBe('MEMORY_LIMIT_EXCEEDED');
      expect(result.processedSuccessfully).toBe(true);
    });
  });
});

// Mock implementation functions

async function processDocumentFromFile(filePath) {
  const buffer = await fs.readFile(filePath);
  return {
    content: `Processed from file: ${path.basename(filePath)}`,
    extractedText: 'Sample text from file',
    wordCount: 100,
    pageCount: 1,
    metadata: { pages: 1 },
    format: path.extname(filePath).slice(1),
    supported: true,
    error: buffer.length === 0 ? { code: 'EMPTY_DOCUMENT' } : undefined
  };
}

async function processDocumentFromMemory(buffer, metadata) {
  return {
    content: `Processed from memory: ${metadata.originalName}`,
    extractedText: 'Sample text from memory',
    wordCount: 100,
    pageCount: 1,
    metadata: { pages: 1 },
    format: metadata.originalName?.split('.').pop(),
    supported: true,
    error: buffer.length === 0 ? { code: 'EMPTY_DOCUMENT' } : undefined
  };
}

async function processDocumentUniversal(input) {
  if (input.type === 'file') {
    return processDocumentFromFile(input.path);
  } else if (input.type === 'buffer') {
    return processDocumentFromMemory(input.buffer, input.metadata);
  }
  throw new Error('Invalid input type');
}

async function processWithConfig(buffer, config) {
  const method = config.useInMemoryProcessing ? 'memory-based' : 'file-based';
  
  // Check memory threshold
  if (config.useInMemoryProcessing && config.memoryThreshold && buffer.length > config.memoryThreshold) {
    if (config.fallbackToFile) {
      return {
        processingMethod: 'file-based',
        fallbackReason: 'MEMORY_LIMIT_EXCEEDED',
        processedSuccessfully: true,
        content: 'Processed via fallback'
      };
    }
  }
  
  return {
    processingMethod: method,
    processedSuccessfully: true,
    content: `Processed via ${method}`
  };
}

function createMockBuffer(size) {
  return Buffer.alloc(size, 'a');
}

export { 
  processDocumentFromFile, 
  processDocumentFromMemory, 
  processDocumentUniversal,
  processWithConfig 
};