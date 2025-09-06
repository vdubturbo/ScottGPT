import { DocumentConverter } from '../services/document-converter.js';
import { getAllCachedFiles, markFileAsProcessedByName, loadUploadCache } from '../utils/upload-optimizer.js';
import { pipelineStorage } from '../services/pipeline-storage.js';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const OUT = '.work/normalized';

// Initialize document converter
const converter = new DocumentConverter({
  verbose: true,
  enableFallbacks: true,
  mammoth: {
    styleMap: [
      "p[style-name='Heading 1'] => h1:fresh",
      "p[style-name='Heading 2'] => h2:fresh", 
      "p[style-name='Heading 3'] => h3:fresh",
      "p[style-name='Heading 4'] => h4:fresh",
      "p[style-name='Title'] => h1:fresh",
      "p[style-name='Subtitle'] => h2:fresh"
    ]
  }
});

async function normalize() {
  console.log('🔄 Normalizing documents from memory cache...');
  
  // Check if database tables are available
  let useDatabase = false;
  try {
    await pipelineStorage.initializeStorage();
    
    // Test database connectivity by trying a simple query
    const testData = await pipelineStorage.getDocumentsByStatus('uploaded');
    useDatabase = true;
    console.log('✅ Database tables available - using database storage');
  } catch (error) {
    console.log('⚠️ Database tables not available - falling back to file system');
    console.log(`   Error: ${error.message}`);
    console.log('💡 To use database storage, create tables with: setup-pipeline-tables.sql');
    useDatabase = false;
    
    // Ensure output directory exists for file fallback
    await fs.mkdir(OUT, { recursive: true });
  }

  // Load upload cache first
  await loadUploadCache();

  // Get cached files instead of reading from disk
  const cachedFiles = getAllCachedFiles();
  
  if (cachedFiles.length === 0) {
    console.log('📄 No files found in upload cache');
    console.log('   Please upload files first using the /api/upload endpoint');
    return;
  }

  console.log(`📋 Found ${cachedFiles.length} files in memory cache`);

  let processed = 0;
  for (const fileData of cachedFiles) {
    const { buffer, metadata, hash } = fileData;
    const uploadHash = hash;
    const filename = metadata.originalName;
    
    const ext = filename.split('.').pop()?.toLowerCase();
    
    // Skip files that aren't documents
    if (!['pdf', 'docx', 'doc', 'txt', 'md'].includes(ext)) {
      console.log(`⏭️  Skipping ${filename} (unsupported format)`);
      continue;
    }

    let documentId = null;
    const baseName = filename.replace(/\.(pdf|docx|doc|txt|md)$/i, '');
    const outPath = path.join(OUT, `${baseName}.md`);
    
    try {
      // Store document in pipeline database if available
      if (useDatabase) {
        const document = await pipelineStorage.storeDocument(uploadHash, fileData);
        documentId = document.id;
        console.log(`📄 Document stored in database: ${filename} (id: ${documentId})`);
      } else {
        console.log(`📄 Processing document: ${filename}`);
      }
      
      if (ext === 'md') {
        // Just store/write markdown content from buffer
        const content = buffer.toString('utf8');
        
        if (useDatabase) {
          await pipelineStorage.storeNormalizedContent(documentId, content, {
            converter: 'native',
            processingTime: 0
          });
          console.log(`📋 Processed: ${filename} → database (markdown from memory)`);
        } else {
          await fs.writeFile(outPath, content, 'utf8');
          console.log(`📋 Processed: ${filename} → ${baseName}.md (from memory)`);
        }
      } else {
        // Use DocumentConverter for all document types
        const expectedConverter = getExpectedConverter(ext);
        console.log(`🔄 Converting ${filename} using ${expectedConverter} (from memory buffer)...`);
        
        try {
          // Convert directly from buffer with metadata
          const result = await converter.convert(buffer, {
            filename: filename,
            mimeType: getMimeTypeFromExtension(ext),
            metadata: {
              originalName: filename,
              size: buffer.length
            }
          });
          
          if (!result.conversion.success) {
            throw new Error(result.conversion.error || 'Conversion failed');
          }
          
          // Ensure we have markdown content
          let markdownContent = result.markdown || result.content || '';
          
          // Post-process to ensure GitHub Flavored Markdown compatibility
          markdownContent = await formatAsGFM(markdownContent, filename, ext, result);
          
          // Store or write the converted content
          if (useDatabase) {
            await pipelineStorage.storeNormalizedContent(documentId, markdownContent, {
              converter: result.conversion.converter || 'native',
              processingTime: result.conversion.duration || 0,
              warnings: result.warnings || []
            });
            
            const converterName = result.conversion.converter || 'native';
            const duration = result.conversion.duration;
            console.log(`🔄 Converted: ${filename} → database (${converterName}, ${duration}ms, from memory)`);
          } else {
            await fs.writeFile(outPath, markdownContent, 'utf8');
            
            const converterName = result.conversion.converter || 'native';
            const duration = result.conversion.duration;
            console.log(`🔄 Converted: ${filename} → ${baseName}.md (${converterName}, ${duration}ms, from memory)`);
          }
          
          // Log warnings if any
          if (result.warnings && result.warnings.length > 0) {
            console.log(`⚠️  Warnings for ${filename}: ${result.warnings.length} formatting issues`);
          }
          
        } catch (conversionError) {
          // Handle conversion failures with fallback strategies
          console.log(`⚠️  Primary conversion failed for ${filename}: ${conversionError.message}`);
          
          if (ext === 'pdf') {
            console.log(`⚠️  PDF conversion failed, trying fallback extraction...`);
          } else if (ext === 'docx' || ext === 'doc') {
            console.log(`⚠️  DOCX conversion failed, trying fallback extraction...`);
          }
          
          // The converter already tries fallbacks internally, but if it still fails,
          // create a placeholder similar to the original pandoc behavior
          const fallbackContent = await createFallbackContent(filename, ext, { size: buffer.length }, conversionError);
          
          if (useDatabase) {
            await pipelineStorage.storeNormalizedContent(documentId, fallbackContent, {
              converter: 'fallback',
              processingTime: 0,
              error: conversionError.message
            });
            console.log(`📄 Created fallback content for: ${filename} → database`);
          } else {
            await fs.writeFile(outPath, fallbackContent);
            console.log(`📄 Created fallback content for: ${filename} → ${baseName}.md`);
          }
        }
      }
      
      // Mark file as processed in upload cache
      markFileAsProcessedByName(filename);
      console.log(`📋 Marked ${filename} as processed in cache`);
      
      processed++;
    } catch (error) {
      console.error(`❌ Error processing ${filename}:`, error.message);
      console.error('💡 Document conversion failed - check file format and buffer data');
      
      // Try to record the error in database if we're using database storage
      if (useDatabase) {
        try {
          if (uploadHash && !documentId) {
            const document = await pipelineStorage.storeDocument(uploadHash, fileData);
            documentId = document.id;
          }
          if (documentId) {
            await pipelineStorage.recordProcessingError(documentId, 'normalization', error);
          }
        } catch (dbError) {
          console.error(`❌ Failed to record error in database:`, dbError.message);
        }
      }
    }
  }

  console.log(`✅ Normalized ${processed} files to markdown`);
}

/**
 * Format content as GitHub Flavored Markdown to match pandoc output
 * @param {string} content - Raw markdown content
 * @param {string} filename - Original filename
 * @param {string} extension - File extension
 * @param {Object} conversionResult - Result from DocumentConverter
 * @returns {Promise<string>} Formatted GFM content
 */
async function formatAsGFM(content, filename, extension, conversionResult) {
  if (!content || typeof content !== 'string') {
    return '';
  }
  
  let formatted = content;
  
  // Ensure consistent line endings
  formatted = formatted.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  
  // For PDF conversions, add document title if available
  if (extension === 'pdf' && conversionResult.metadata?.title) {
    if (!formatted.startsWith('#')) {
      formatted = `# ${conversionResult.metadata.title}\n\n${formatted}`;
    }
  }
  
  // For DOCX conversions, ensure proper heading formatting
  if (extension === 'docx') {
    // Fix heading spacing to match pandoc output
    formatted = formatted.replace(/^(#{1,6})\s*([^\n]+)$/gm, '$1 $2');
    
    // Ensure blank lines around headings (pandoc style)
    formatted = formatted.replace(/\n(#{1,6}\s+[^\n]+)\n/g, '\n\n$1\n\n');
    
    // Fix list formatting
    formatted = formatted.replace(/^(\s*)[-*+]\s+/gm, '$1- ');
  }
  
  // Clean up excessive whitespace but preserve structure
  formatted = formatted
    .replace(/\n{4,}/g, '\n\n\n')  // Max 3 newlines
    .replace(/^\s+$/gm, '')        // Remove whitespace-only lines
    .trim();                       // Remove leading/trailing whitespace
  
  // Ensure file ends with single newline (pandoc behavior)
  if (formatted && !formatted.endsWith('\n')) {
    formatted += '\n';
  }
  
  return formatted;
}

/**
 * Get expected converter name for file extension
 * @param {string} ext - File extension
 * @returns {string} Converter name
 */
function getExpectedConverter(ext) {
  const converters = {
    'docx': 'mammoth',
    'doc': 'mammoth',
    'pdf': 'fallback-disabled', // TEMPORARILY DISABLED
    'txt': 'native',
    'html': 'node-html-parser',
    'htm': 'node-html-parser'
  };
  
  return converters[ext] || 'native';
}

/**
 * Get MIME type from file extension
 * @param {string} ext - File extension without dot
 * @returns {string} MIME type
 */
function getMimeTypeFromExtension(ext) {
  const mimeTypes = {
    'pdf': 'application/pdf',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'doc': 'application/msword',
    'txt': 'text/plain',
    'md': 'text/markdown',
    'html': 'text/html',
    'htm': 'text/html'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Create fallback content when conversion fails
 * @param {string} filename - Original filename
 * @param {string} extension - File extension
 * @param {Object} stats - File stats
 * @param {Error} error - Conversion error
 * @returns {Promise<string>} Fallback markdown content
 */
async function createFallbackContent(filename, extension, stats, error) {
  const docType = {
    'pdf': 'PDF',
    'docx': 'Word Document (DOCX)',
    'doc': 'Word Document (DOC)', 
    'txt': 'Text File'
  }[extension] || 'Document';
  
  return `# Document: ${filename}

**Document Type:** ${docType}  
**Original File:** ${filename}  
**File Size:** ${stats.size} bytes  
**Conversion Error:** ${error.message}

---

*This ${docType.toLowerCase()} could not be converted automatically. The document converter encountered an error during processing.*

**Possible solutions:**
- Check if the file is corrupted or password-protected
- Verify the file format is supported
- Try converting the document manually to a supported format
- Contact system administrator if the issue persists

**Technical Details:**
- Conversion attempted: ${new Date().toISOString()}
- Error type: ${error.name || 'ConversionError'}
- File path: ${filename}

---

*Please replace this placeholder content with the actual document content after manual conversion.*
`;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  normalize().catch(console.error);
}

export default normalize;