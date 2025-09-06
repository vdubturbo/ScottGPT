/**
 * Pipeline Storage Service
 * Manages database storage for the document processing pipeline stages
 * Replaces file system writes in .work/ directories with Supabase storage
 */

import { supabase } from '../config/database.js';
import crypto from 'crypto';

export class PipelineStorageService {
  constructor() {
    this.supabase = supabase;
  }

  /**
   * Initialize pipeline storage tables if they don't exist
   * Creates the necessary database schema for pipeline storage
   */
  async initializeStorage() {
    console.log('🔧 Initializing pipeline storage...');
    
    try {
      // For now, we'll skip table creation and assume they exist
      // This allows the pipeline to work without SQL DDL operations
      console.log('⚠️  Pipeline storage initialization skipped - tables expected to exist');
      console.log('   Please ensure pipeline_documents and pipeline_chunks tables are created in Supabase');
      console.log('   Continuing with document processing...');
      
      return true;
      
    } catch (error) {
      console.error('❌ Failed to initialize pipeline storage:', error.message);
      throw error;
    }
  }

  /**
   * Store a document from upload cache into pipeline
   * @param {string} uploadHash - Hash from upload cache
   * @param {Object} fileData - File data from upload cache
   * @returns {Promise<Object>} Document record
   */
  async storeDocument(uploadHash, fileData) {
    const { buffer, metadata } = fileData;
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const contentHash = crypto.createHash('sha256').update(buffer).digest('hex');
    
    const documentData = {
      original_name: metadata.originalName,
      file_hash: fileHash,
      upload_hash: uploadHash,
      document_type: this._getDocumentType(metadata.originalName),
      content_hash: contentHash,
      word_count: 0, // Will be calculated during normalization
      character_count: buffer.length,
      processing_status: 'uploaded',
      stage_timestamps: {
        uploaded: new Date().toISOString()
      }
    };

    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .insert(documentData)
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') { // Unique constraint violation
        console.log(`⚠️ Document already exists with hash ${fileHash.substring(0, 8)}`);
        return await this.getDocumentByHash(fileHash);
      }
      throw error;
    }

    console.log(`📄 Stored document: ${metadata.originalName} (id: ${data.id})`);
    return data;
  }

  /**
   * Update document with normalized content
   * @param {string} documentId - Document UUID
   * @param {string} normalizedContent - Markdown content
   * @param {Object} metadata - Additional metadata
   */
  async storeNormalizedContent(documentId, normalizedContent, metadata = {}) {
    // First, get the current stage_timestamps
    const { data: currentDoc, error: fetchError } = await this.supabase
      .from('pipeline_documents')
      .select('stage_timestamps')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update the timestamps object - handle if it comes back as string
    let currentTimestamps = currentDoc?.stage_timestamps || {};
    if (typeof currentTimestamps === 'string') {
      try {
        currentTimestamps = JSON.parse(currentTimestamps);
      } catch (e) {
        currentTimestamps = {};
      }
    }
    
    const updatedTimestamps = {
      ...currentTimestamps,
      normalized: new Date().toISOString()
    };
    
    const updateData = {
      normalized_content: normalizedContent,
      processing_status: 'normalized',
      word_count: this._countWords(normalizedContent),
      character_count: normalizedContent.length,
      updated_at: new Date().toISOString(),
      stage_timestamps: updatedTimestamps
    };

    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .update(updateData)
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) throw error;
    
    console.log(`✅ Stored normalized content for document ${documentId}`);
    return data;
  }

  /**
   * Store extracted chunks for a document
   * @param {string} documentId - Document UUID
   * @param {Array} chunks - Array of extracted chunks
   */
  async storeExtractedContent(documentId, chunks) {
    const chunkRecords = chunks.map((chunk, index) => ({
      document_id: documentId,
      content: chunk.content,
      content_hash: crypto.createHash('sha256').update(chunk.content).digest('hex'),
      chunk_index: index,
      title: chunk.title || null,
      summary: chunk.summary || null,
      skills: chunk.skills || [],
      tags: chunk.tags || [],
      date_start: chunk.date_start || null,
      date_end: chunk.date_end || null,
      token_count: chunk.token_count || 0,
      word_count: this._countWords(chunk.content),
      extraction_method: chunk.extraction_method || 'default'
    }));

    // Insert chunks in batch
    const { data, error } = await this.supabase
      .from('pipeline_chunks')
      .insert(chunkRecords)
      .select('*');

    if (error) throw error;

    // Update document status
    await this._updateDocumentStatus(documentId, 'extracted');

    console.log(`📝 Stored ${chunks.length} extracted chunks for document ${documentId}`);
    return data;
  }

  /**
   * Update chunk validation status
   * @param {string} chunkId - Chunk UUID
   * @param {string} status - Validation status
   * @param {Array} errors - Validation errors
   */
  async updateChunkValidation(chunkId, status, errors = []) {
    const { data, error } = await this.supabase
      .from('pipeline_chunks')
      .update({
        validation_status: status,
        validation_errors: JSON.stringify(errors),
        updated_at: new Date().toISOString()
      })
      .eq('id', chunkId)
      .select('*')
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Mark document as validated
   * @param {string} documentId - Document UUID
   * @param {Object} validationResult - Validation results
   */
  async storeValidatedContent(documentId, validationResult) {
    // First, get the current stage_timestamps
    const { data: currentDoc, error: fetchError } = await this.supabase
      .from('pipeline_documents')
      .select('stage_timestamps')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update the timestamps object - handle if it comes back as string
    let currentTimestamps = currentDoc?.stage_timestamps || {};
    if (typeof currentTimestamps === 'string') {
      try {
        currentTimestamps = JSON.parse(currentTimestamps);
      } catch (e) {
        currentTimestamps = {};
      }
    }
    
    const updatedTimestamps = {
      ...currentTimestamps,
      validated: new Date().toISOString()
    };
    
    const updateData = {
      validated_content: JSON.stringify(validationResult),
      processing_status: 'validated',
      updated_at: new Date().toISOString(),
      stage_timestamps: updatedTimestamps
    };

    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .update(updateData)
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) throw error;
    
    console.log(`✅ Stored validation results for document ${documentId}`);
    return data;
  }

  /**
   * Mark document processing as completed
   * @param {string} documentId - Document UUID
   * @param {Object} finalData - Final processing results
   */
  async storeFinalContent(documentId, finalData) {
    // First, get the current stage_timestamps
    const { data: currentDoc, error: fetchError } = await this.supabase
      .from('pipeline_documents')
      .select('stage_timestamps')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update the timestamps object - handle if it comes back as string
    let currentTimestamps = currentDoc?.stage_timestamps || {};
    if (typeof currentTimestamps === 'string') {
      try {
        currentTimestamps = JSON.parse(currentTimestamps);
      } catch (e) {
        currentTimestamps = {};
      }
    }
    
    const updatedTimestamps = {
      ...currentTimestamps,
      completed: new Date().toISOString()
    };
    
    const updateData = {
      final_content: JSON.stringify(finalData),
      processing_status: 'completed',
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      stage_timestamps: updatedTimestamps
    };

    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .update(updateData)
      .eq('id', documentId)
      .select('*')
      .single();

    if (error) throw error;
    
    console.log(`🎉 Document processing completed: ${documentId}`);
    return data;
  }

  /**
   * Get documents by processing status
   * @param {string} status - Processing status
   * @returns {Promise<Array>} Documents
   */
  async getDocumentsByStatus(status) {
    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .select('*')
      .eq('processing_status', status)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  /**
   * Get document by hash
   * @param {string} fileHash - File hash
   * @returns {Promise<Object>} Document
   */
  async getDocumentByHash(fileHash) {
    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .select('*')
      .eq('file_hash', fileHash)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get document with chunks
   * @param {string} documentId - Document UUID
   * @returns {Promise<Object>} Document with chunks
   */
  async getDocumentWithChunks(documentId) {
    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .select(`
        *,
        pipeline_chunks (*)
      `)
      .eq('id', documentId)
      .single();

    if (error) throw error;
    return data;
  }

  /**
   * Get documents ready for processing
   * @param {string} stage - Processing stage ('uploaded', 'normalized', 'extracted')
   * @returns {Promise<Array>} Documents ready for next stage
   */
  async getDocumentsForProcessing(stage) {
    const { data, error } = await this.supabase
      .from('pipeline_documents')
      .select('*')
      .eq('processing_status', stage)
      .order('created_at', { ascending: true });

    if (error) throw error;
    return data || [];
  }

  /**
   * Record processing error
   * @param {string} documentId - Document UUID
   * @param {string} stage - Processing stage
   * @param {Error} error - Error object
   */
  async recordProcessingError(documentId, stage, error) {
    const errorData = {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };

    // First, get the current stage_errors
    const { data: currentDoc, error: fetchError } = await this.supabase
      .from('pipeline_documents')
      .select('stage_errors')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update the errors object - handle if it comes back as string
    let currentErrors = currentDoc?.stage_errors || {};
    if (typeof currentErrors === 'string') {
      try {
        currentErrors = JSON.parse(currentErrors);
      } catch (e) {
        currentErrors = {};
      }
    }
    
    const updatedErrors = {
      ...currentErrors,
      [stage]: errorData
    };

    const updateData = {
      processing_status: 'error',
      updated_at: new Date().toISOString(),
      stage_errors: updatedErrors
    };

    const { data, error: updateError } = await this.supabase
      .from('pipeline_documents')
      .update(updateData)
      .eq('id', documentId)
      .select('*')
      .single();

    if (updateError) throw updateError;
    
    console.error(`❌ Recorded error for document ${documentId} at stage ${stage}:`, error.message);
    return data;
  }

  /**
   * Get pipeline statistics
   * @returns {Promise<Object>} Pipeline stats
   */
  async getPipelineStats() {
    const { data: statusCounts, error: statusError } = await this.supabase
      .from('pipeline_documents')
      .select('processing_status')
      .then(result => {
        if (result.error) throw result.error;
        const counts = {};
        result.data.forEach(doc => {
          counts[doc.processing_status] = (counts[doc.processing_status] || 0) + 1;
        });
        return { data: counts, error: null };
      });

    if (statusError) throw statusError;

    let chunkCounts = {};
    
    try {
      const { data: chunkResult, error: chunkError } = await this.supabase
        .from('pipeline_chunks')
        .select('validation_status');
        
      if (chunkError) {
        console.log('⚠️ pipeline_chunks table not available, skipping chunk stats');
        chunkCounts = { note: 'pipeline_chunks table not found' };
      } else {
        chunkResult.forEach(chunk => {
          chunkCounts[chunk.validation_status] = (chunkCounts[chunk.validation_status] || 0) + 1;
        });
      }
    } catch (error) {
      console.log('⚠️ Error querying pipeline_chunks:', error.message);
      chunkCounts = { error: 'Unable to query chunks table' };
    }

    return {
      documents: statusCounts,
      chunks: chunkCounts,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear all pipeline data (for testing)
   * @returns {Promise<boolean>} Success status
   */
  async clearPipelineData() {
    try {
      // Delete chunks first (foreign key constraint)
      await this.supabase.from('pipeline_chunks').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Delete documents
      await this.supabase.from('pipeline_documents').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      console.log('🧹 Pipeline data cleared');
      return true;
    } catch (error) {
      console.error('❌ Failed to clear pipeline data:', error.message);
      throw error;
    }
  }

  // Private helper methods

  /**
   * Update document processing status
   * @private
   */
  async _updateDocumentStatus(documentId, status) {
    // First, get the current stage_timestamps
    const { data: currentDoc, error: fetchError } = await this.supabase
      .from('pipeline_documents')
      .select('stage_timestamps')
      .eq('id', documentId)
      .single();
    
    if (fetchError) throw fetchError;
    
    // Update the timestamps object - handle if it comes back as string
    let currentTimestamps = currentDoc?.stage_timestamps || {};
    if (typeof currentTimestamps === 'string') {
      try {
        currentTimestamps = JSON.parse(currentTimestamps);
      } catch (e) {
        currentTimestamps = {};
      }
    }
    
    const updatedTimestamps = {
      ...currentTimestamps,
      [status]: new Date().toISOString()
    };
    
    const { error } = await this.supabase
      .from('pipeline_documents')
      .update({
        processing_status: status,
        updated_at: new Date().toISOString(),
        stage_timestamps: updatedTimestamps
      })
      .eq('id', documentId);

    if (error) throw error;
  }

  /**
   * Get document type from filename
   * @private
   */
  _getDocumentType(filename) {
    const ext = filename.split('.').pop()?.toLowerCase();
    const typeMap = {
      'pdf': 'pdf',
      'docx': 'docx',
      'doc': 'docx',
      'md': 'markdown',
      'txt': 'text',
      'html': 'html',
      'htm': 'html'
    };
    return typeMap[ext] || 'unknown';
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

// Export singleton instance
export const pipelineStorage = new PipelineStorageService();
export default pipelineStorage;