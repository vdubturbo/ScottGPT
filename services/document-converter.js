/**
 * Document Converter Service
 * Converts various document formats to markdown/text using JavaScript libraries
 * Replaces pandoc with native JavaScript solutions
 */

import fs from 'fs/promises';
import path from 'path';
import mammoth from 'mammoth';
// import pdfParse from 'pdf-parse'; // TEMPORARILY DISABLED - PDF processing causing module errors
import { parse as parseHtml } from 'node-html-parser';
import JSZip from 'jszip';

/**
 * Document Converter Service
 * Handles conversion of DOCX, PDF, TXT, MD, and HTML files
 */
class DocumentConverter {
  constructor(options = {}) {
    this.options = {
      // Mammoth options for DOCX conversion
      mammoth: {
        convertImage: mammoth.images.imgElement(function(image) {
          return image.read("base64").then(function(imageBuffer) {
            return {
              src: "data:" + image.contentType + ";base64," + imageBuffer
            };
          });
        }),
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh"
        ],
        ...options.mammoth
      },
      
      // PDF parsing options
      pdfParse: {
        max: 0, // Parse all pages
        version: 'v1.10.100',
        ...options.pdfParse
      },
      
      // General options
      maxFileSize: options.maxFileSize || 100 * 1024 * 1024, // 100MB default
      timeout: options.timeout || 30000, // 30 seconds default
      enableFallbacks: options.enableFallbacks !== false,
      verbose: options.verbose || false
    };
  }

  /**
   * Convert document to markdown/text
   * @param {string|Buffer} input - File path or buffer
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convert(input, options = {}) {
    const startTime = Date.now();
    
    try {
      // Detect input type and get buffer/metadata
      const { buffer, metadata } = await this._prepareInput(input, options);
      
      // Validate file size
      if (buffer.length > this.options.maxFileSize) {
        throw new Error(`File size ${buffer.length} exceeds maximum ${this.options.maxFileSize} bytes`);
      }
      
      // Detect format and convert
      const format = this._detectFormat(metadata.filename, metadata.mimeType, buffer);
      const result = await this._convertByFormat(buffer, format, metadata, options);
      
      // Add conversion metadata
      result.conversion = {
        format,
        originalFormat: format,
        inputType: typeof input === 'string' ? 'file' : 'buffer',
        fileSize: buffer.length,
        duration: Date.now() - startTime,
        converter: this._getConverterName(format),
        success: true
      };
      
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (this.options.verbose) {
        console.error(`Document conversion failed after ${duration}ms:`, error.message);
      }
      
      // Try fallback strategies if enabled
      if (this.options.enableFallbacks) {
        const fallbackResult = await this._attemptFallback(input, error, options);
        if (fallbackResult) {
          fallbackResult.conversion.duration = Date.now() - startTime;
          return fallbackResult;
        }
      }
      
      // Return error result
      return {
        content: '',
        text: '',
        metadata: {},
        conversion: {
          format: 'unknown',
          originalFormat: 'unknown',
          inputType: typeof input === 'string' ? 'file' : 'buffer',
          fileSize: 0,
          duration,
          converter: 'none',
          success: false,
          error: error.message,
          fallbackAttempted: this.options.enableFallbacks
        }
      };
    }
  }

  /**
   * Convert DOCX to markdown
   * @param {Buffer} buffer - DOCX file buffer
   * @param {Object} metadata - File metadata
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertDOCX(buffer, metadata = {}, options = {}) {
    try {
      const mammothOptions = {
        ...this.options.mammoth,
        ...options.mammoth
      };
      
      const result = await mammoth.convertToMarkdown(buffer, mammothOptions);
      
      // Extract additional metadata if available
      const docxMetadata = await this._extractDOCXMetadata(buffer);
      
      return {
        content: result.value,
        text: this._stripMarkdown(result.value),
        markdown: result.value,
        metadata: {
          ...metadata,
          ...docxMetadata,
          wordCount: this._countWords(result.value),
          characterCount: result.value.length,
          warnings: result.messages || []
        },
        warnings: result.messages || []
      };
      
    } catch (error) {
      throw new Error(`DOCX conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert PDF to text - TEMPORARILY DISABLED
   * @param {Buffer} buffer - PDF file buffer
   * @param {Object} metadata - File metadata
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertPDF(buffer, metadata = {}, options = {}) {
    // TEMPORARY FALLBACK - PDF processing disabled due to module errors
    const fallbackText = `# PDF Document: ${metadata.originalName || 'document.pdf'}

**⚠️ PDF Processing Temporarily Disabled**

This PDF file could not be processed automatically because PDF parsing is temporarily disabled due to module compatibility issues.

**Document Information:**
- Original Name: ${metadata.originalName || 'Unknown'}
- File Size: ${buffer.length} bytes
- Processing Date: ${new Date().toISOString()}

**To enable PDF processing:**
1. Fix pdf-parse module compatibility issues
2. Re-enable PDF processing in DocumentConverter
3. Reprocess this document

---

*This is placeholder content. Please manually extract the text from the PDF or fix the PDF processing module to get the actual content.*`;

    return {
      content: fallbackText,
      text: fallbackText.replace(/[#*-]/g, '').replace(/\n{2,}/g, '\n').trim(),
      markdown: fallbackText,
      metadata: {
        ...metadata,
        pageCount: 1,
        wordCount: this._countWords(fallbackText),
        characterCount: fallbackText.length,
        pdfProcessingDisabled: true,
        fallbackUsed: true
      },
      warnings: ['PDF processing is temporarily disabled - using fallback content']
    };
  }

  /**
   * Process text/markdown files
   * @param {Buffer} buffer - File buffer
   * @param {Object} metadata - File metadata
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertText(buffer, metadata = {}, options = {}) {
    try {
      const encoding = options.encoding || 'utf8';
      const content = buffer.toString(encoding);
      
      // Detect if it's markdown
      const isMarkdown = this._isMarkdownContent(content) || 
                        metadata.filename?.endsWith('.md') ||
                        metadata.mimeType?.includes('markdown');
      
      return {
        content: content,
        text: isMarkdown ? this._stripMarkdown(content) : content,
        markdown: isMarkdown ? content : this._textToMarkdown(content),
        metadata: {
          ...metadata,
          isMarkdown,
          wordCount: this._countWords(content),
          characterCount: content.length,
          lineCount: content.split('\n').length,
          encoding
        }
      };
      
    } catch (error) {
      throw new Error(`Text conversion failed: ${error.message}`);
    }
  }

  /**
   * Convert HTML to markdown
   * @param {Buffer} buffer - HTML file buffer
   * @param {Object} metadata - File metadata
   * @param {Object} options - Conversion options
   * @returns {Promise<Object>} Conversion result
   */
  async convertHTML(buffer, metadata = {}, options = {}) {
    try {
      const html = buffer.toString('utf8');
      const root = parseHtml(html);
      
      // Extract title
      const title = root.querySelector('title')?.text || '';
      
      // Convert to markdown
      const markdown = this._htmlToMarkdown(root);
      const text = this._stripMarkdown(markdown);
      
      return {
        content: markdown,
        text: text,
        markdown: markdown,
        metadata: {
          ...metadata,
          title,
          wordCount: this._countWords(text),
          characterCount: markdown.length,
          hasTitle: !!title
        }
      };
      
    } catch (error) {
      throw new Error(`HTML conversion failed: ${error.message}`);
    }
  }

  // Private helper methods

  /**
   * Prepare input (file path or buffer) for processing
   * @private
   */
  async _prepareInput(input, options = {}) {
    if (typeof input === 'string') {
      // File path input
      const filePath = input;
      const stats = await fs.stat(filePath);
      const buffer = await fs.readFile(filePath);
      
      return {
        buffer,
        metadata: {
          filename: path.basename(filePath),
          filePath: filePath,
          size: stats.size,
          mtime: stats.mtime,
          mimeType: options.mimeType || this._guessMimeType(filePath),
          ...options.metadata
        }
      };
    } else if (Buffer.isBuffer(input)) {
      // Buffer input
      return {
        buffer: input,
        metadata: {
          filename: options.filename || 'document.bin',
          size: input.length,
          mimeType: options.mimeType || 'application/octet-stream',
          ...options.metadata
        }
      };
    } else {
      throw new Error('Input must be a file path string or Buffer');
    }
  }

  /**
   * Detect document format
   * @private
   */
  _detectFormat(filename, mimeType, buffer) {
    // Check file extension
    const ext = path.extname(filename).toLowerCase();
    
    if (ext === '.docx' || mimeType?.includes('wordprocessingml')) {
      return 'docx';
    }
    if (ext === '.pdf' || mimeType?.includes('pdf')) {
      return 'pdf';
    }
    if (ext === '.html' || ext === '.htm' || mimeType?.includes('html')) {
      return 'html';
    }
    if (ext === '.md' || ext === '.markdown' || mimeType?.includes('markdown')) {
      return 'markdown';
    }
    if (ext === '.txt' || mimeType?.includes('text/plain')) {
      return 'text';
    }
    
    // Check buffer magic numbers
    const magic = buffer.slice(0, 8);
    
    if (magic.slice(0, 4).toString() === 'PK\x03\x04') {
      // ZIP-based format (likely DOCX)
      return 'docx';
    }
    if (magic.slice(0, 4).toString() === '%PDF') {
      return 'pdf';
    }
    if (magic.toString().includes('<!DOCTYPE') || magic.toString().includes('<html')) {
      return 'html';
    }
    
    // Default to text
    return 'text';
  }

  /**
   * Convert document based on detected format
   * @private
   */
  async _convertByFormat(buffer, format, metadata, options) {
    switch (format) {
      case 'docx':
        return await this.convertDOCX(buffer, metadata, options);
      case 'pdf':
        return await this.convertPDF(buffer, metadata, options);
      case 'html':
        return await this.convertHTML(buffer, metadata, options);
      case 'markdown':
      case 'text':
        return await this.convertText(buffer, metadata, options);
      default:
        throw new Error(`Unsupported format: ${format}`);
    }
  }

  /**
   * Attempt fallback conversion strategies
   * @private
   */
  async _attemptFallback(input, originalError, options) {
    const fallbacks = [];
    
    try {
      // Fallback 1: Try as plain text
      const { buffer, metadata } = await this._prepareInput(input, options);
      fallbacks.push(async () => {
        const result = await this.convertText(buffer, metadata, { encoding: 'utf8' });
        result.conversion.fallback = 'text-utf8';
        result.conversion.originalError = originalError.message;
        return result;
      });
      
      // Fallback 2: Try different encodings
      fallbacks.push(async () => {
        const result = await this.convertText(buffer, metadata, { encoding: 'latin1' });
        result.conversion.fallback = 'text-latin1';
        result.conversion.originalError = originalError.message;
        return result;
      });
      
      // Fallback 3: Extract readable text only
      fallbacks.push(async () => {
        const readableText = buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, '');
        const result = {
          content: readableText,
          text: readableText,
          markdown: this._textToMarkdown(readableText),
          metadata: {
            ...metadata,
            wordCount: this._countWords(readableText),
            characterCount: readableText.length
          },
          conversion: {
            fallback: 'readable-text-only',
            originalError: originalError.message
          }
        };
        return result;
      });
      
      // Try each fallback
      for (const fallback of fallbacks) {
        try {
          const result = await fallback();
          if (this.options.verbose) {
            console.log(`Fallback conversion succeeded: ${result.conversion.fallback}`);
          }
          return result;
        } catch (fallbackError) {
          if (this.options.verbose) {
            console.warn(`Fallback failed:`, fallbackError.message);
          }
          continue;
        }
      }
      
    } catch (fallbackError) {
      if (this.options.verbose) {
        console.error('All fallback strategies failed:', fallbackError.message);
      }
    }
    
    return null;
  }

  /**
   * Extract DOCX metadata using JSZip
   * @private
   */
  async _extractDOCXMetadata(buffer) {
    try {
      const zip = await JSZip.loadAsync(buffer);
      const metadata = {};
      
      // Try to extract core properties
      const coreProps = zip.file('docProps/core.xml');
      if (coreProps) {
        const coreXml = await coreProps.async('string');
        const coreRoot = parseHtml(coreXml);
        
        metadata.title = coreRoot.querySelector('dc\\:title')?.text || '';
        metadata.creator = coreRoot.querySelector('dc\\:creator')?.text || '';
        metadata.subject = coreRoot.querySelector('dc\\:subject')?.text || '';
        metadata.description = coreRoot.querySelector('dc\\:description')?.text || '';
        metadata.created = coreRoot.querySelector('dcterms\\:created')?.text || '';
        metadata.modified = coreRoot.querySelector('dcterms\\:modified')?.text || '';
      }
      
      return metadata;
    } catch (error) {
      // Ignore metadata extraction errors
      return {};
    }
  }

  /**
   * Guess MIME type from file extension
   * @private
   */
  _guessMimeType(filename) {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes = {
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.pdf': 'application/pdf',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.md': 'text/markdown',
      '.markdown': 'text/markdown',
      '.txt': 'text/plain'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get converter name for format
   * @private
   */
  _getConverterName(format) {
    const converters = {
      'docx': 'mammoth',
      'pdf': 'fallback-disabled', // TEMPORARILY DISABLED
      'html': 'node-html-parser',
      'text': 'native',
      'markdown': 'native'
    };
    
    return converters[format] || 'unknown';
  }

  /**
   * Check if content looks like markdown
   * @private
   */
  _isMarkdownContent(content) {
    const markdownPatterns = [
      /^#{1,6}\s+/m,     // Headers
      /^\*{1,3}[^*]/m,   // Bold/italic
      /^[-*+]\s+/m,      // Lists
      /^\d+\.\s+/m,      // Numbered lists
      /\[.*?\]\(.*?\)/,  // Links
      /^```/m,           // Code blocks
      /^>\s+/m           // Quotes
    ];
    
    return markdownPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Strip markdown formatting to get plain text
   * @private
   */
  _stripMarkdown(markdown) {
    return markdown
      .replace(/#{1,6}\s+/g, '')           // Headers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1') // Bold/italic
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
      .replace(/`([^`]+)`/g, '$1')         // Inline code
      .replace(/^```[\s\S]*?```/gm, '')    // Code blocks
      .replace(/^>\s+/gm, '')              // Quotes
      .replace(/^[-*+]\s+/gm, '• ')        // Lists
      .replace(/^\d+\.\s+/gm, '')          // Numbered lists
      .replace(/\n{3,}/g, '\n\n')          // Extra newlines
      .trim();
  }

  /**
   * Convert plain text to basic markdown
   * @private
   */
  _textToMarkdown(text) {
    // Simple text to markdown conversion
    return text
      .split('\n')
      .map(line => line.trim())
      .join('\n\n')
      .replace(/\n{3,}/g, '\n\n');
  }

  /**
   * Format PDF text as markdown
   * @private
   */
  _formatPDFAsMarkdown(text, info) {
    let markdown = '';
    
    // Add title if available
    if (info && info.Title) {
      markdown += `# ${info.Title}\n\n`;
    }
    
    // Add content
    markdown += text
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n');
    
    return markdown;
  }

  /**
   * Convert HTML to markdown (basic implementation)
   * @private
   */
  _htmlToMarkdown(root) {
    let markdown = '';
    
    // Extract and convert common elements
    root.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(heading => {
      const level = parseInt(heading.tagName.slice(1));
      markdown += `${'#'.repeat(level)} ${heading.text}\n\n`;
    });
    
    root.querySelectorAll('p').forEach(p => {
      markdown += `${p.text}\n\n`;
    });
    
    root.querySelectorAll('ul li, ol li').forEach(li => {
      markdown += `• ${li.text}\n`;
    });
    
    // Fallback: extract all text if no structured content
    if (!markdown.trim()) {
      markdown = root.text;
    }
    
    return markdown.trim();
  }

  /**
   * Count words in text
   * @private
   */
  _countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }
}

// Create default instance
const documentConverter = new DocumentConverter();

// Export both class and default instance
export { DocumentConverter };
export default documentConverter;