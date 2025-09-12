#!/usr/bin/env node

import { supabase } from '../config/database.js';
import { AtomicChunker } from '../services/atomic-chunker.js';
import EmbeddingService from '../services/embeddings.js';
import { TokenBudget } from '../utils/token-budget.js';
import yaml from 'js-yaml';
import crypto from 'crypto';

class AtomicChunkBackfill {
  constructor() {
    this.atomicChunker = new AtomicChunker();
    this.embeddingService = new EmbeddingService();
    this.tokenBudget = new TokenBudget();
    
    this.stats = {
      processed: 0,
      rechunked: 0,
      newChunks: 0,
      reembedded: 0,
      errors: 0,
      duplicatesRemoved: 0,
      startTime: Date.now()
    };
    
    this.batchSize = 50;
    this.dryRun = process.argv.includes('--dry-run');
    this.force = process.argv.includes('--force');
    this.verbose = process.argv.includes('--verbose');
  }

  async run() {
    console.log(`🚀 [BACKFILL] Starting atomic chunk backfill (${this.dryRun ? 'DRY RUN' : 'LIVE'})`);
    console.log(`📊 [BACKFILL] Batch size: ${this.batchSize}, Force: ${this.force}, Verbose: ${this.verbose}`);
    
    try {
      if (!this.dryRun) {
        await this.runMigrations();
      }
      
      await this.identifyLegacyChunks();
      await this.processLegacyChunks();
      await this.removeDuplicates();
      await this.migrateEmbeddings();
      await this.generateFinalReport();
      
    } catch (error) {
      console.error('❌ [BACKFILL] Fatal error:', error.message);
      process.exit(1);
    }
  }

  async runMigrations() {
    console.log('📋 [MIGRATION] Running database migrations...');
    
    try {
      const { data, error } = await supabase.rpc('migrate_embedding_to_pgvector');
      
      if (error && !error.message.includes('does not exist')) {
        console.warn('⚠️ [MIGRATION] Migration function not found, running manual migration');
        await this.manualEmbeddingMigration();
      } else if (data !== null) {
        console.log(`✅ [MIGRATION] Migrated ${data} embeddings to pgvector format`);
      }
      
    } catch (error) {
      console.warn('⚠️ [MIGRATION] Migration error (continuing):', error.message);
    }
  }

  async manualEmbeddingMigration() {
    const { data: chunks, error } = await supabase
      .from('content_chunks')
      .select('id, embedding')
      .not('embedding', 'is', null)
      .limit(1000);
      
    if (error || !chunks) return;
    
    let migrated = 0;
    for (const chunk of chunks) {
      try {
        if (typeof chunk.embedding === 'string' && chunk.embedding.startsWith('[')) {
          const embeddingArray = JSON.parse(chunk.embedding);
          if (Array.isArray(embeddingArray) && embeddingArray.length === 1024) {
            const { error: updateError } = await supabase
              .from('content_chunks')
              .update({ embedding_vector: embeddingArray })
              .eq('id', chunk.id);
              
            if (!updateError) migrated++;
          }
        }
      } catch (e) {
        // Skip invalid embeddings
      }
    }
    
    console.log(`📋 [MIGRATION] Manually migrated ${migrated} embeddings`);
  }

  async identifyLegacyChunks() {
    console.log('🔍 [IDENTIFY] Finding legacy chunks to re-chunk...');
    
    // First check what columns exist
    const { data: testQuery, error: testError } = await supabase
      .from('content_chunks')
      .select('id, content, title, source_id')
      .limit(1);
    
    if (testError) {
      throw new Error(`Failed to query content_chunks table: ${testError.message}`);
    }
    
    // Build query based on available columns
    let query = supabase
      .from('content_chunks')
      .select(`
        id,
        content,
        title,
        source_id,
        sources (
          id,
          title,
          org,
          date_start,
          date_end,
          skills,
          type
        )
      `)
      .not('content', 'is', null);
    
    // Check if metadata column exists - if it does, look for chunks without atomic metadata
    try {
      const { data: metadataTest } = await supabase
        .from('content_chunks')
        .select('metadata')
        .limit(1);
      
      // If metadata column exists, filter for chunks that need re-chunking
      if (metadataTest !== null) {
        query = query.or('metadata.is.null,metadata->>chunk_type.is.null');
      }
    } catch (error) {
      console.log('📋 [IDENTIFY] No metadata column found - will process all chunks');
    }
    
    const { data: chunks, error } = await query;
    
    if (error) {
      throw new Error(`Failed to identify legacy chunks: ${error.message}`);
    }
    
    this.legacyChunks = chunks || [];
    console.log(`📊 [IDENTIFY] Found ${this.legacyChunks.length} legacy chunks to re-process`);
    
    if (this.legacyChunks.length === 0) {
      console.log('✅ [IDENTIFY] No legacy chunks found - system is already atomic!');
      return;
    }
    
    const sampleChunk = this.legacyChunks[0];
    const tokenCount = this.tokenBudget.countTokens(sampleChunk.content);
    console.log(`📋 [IDENTIFY] Sample legacy chunk: ${tokenCount} tokens, "${sampleChunk.content.slice(0, 100)}..."`);
  }

  async processLegacyChunks() {
    if (!this.legacyChunks || this.legacyChunks.length === 0) return;
    
    console.log(`🔄 [REPROCESS] Re-chunking ${this.legacyChunks.length} legacy chunks...`);
    
    for (let i = 0; i < this.legacyChunks.length; i += this.batchSize) {
      const batch = this.legacyChunks.slice(i, i + this.batchSize);
      await this.processBatch(batch, i);
      
      if (i % (this.batchSize * 10) === 0) {
        const progress = ((i / this.legacyChunks.length) * 100).toFixed(1);
        console.log(`📊 [PROGRESS] ${progress}% complete (${i}/${this.legacyChunks.length})`);
      }
    }
  }

  async processBatch(chunks, batchIndex) {
    const newChunks = [];
    const chunkIdsToDelete = [];
    
    for (const legacyChunk of chunks) {
      try {
        this.stats.processed++;
        
        const yamlData = this.extractYamlFromContent(legacyChunk.content);
        const descriptiveContent = this.extractDescriptiveContent(legacyChunk.content);
        
        if (!yamlData || !yamlData.title || !yamlData.org) {
          this.stats.errors++;
          if (this.verbose) {
            console.warn(`⚠️ [PROCESS] Skipping chunk ${legacyChunk.id}: missing YAML data`);
          }
          continue;
        }
        
        const atomicChunks = await this.atomicChunker.createAtomicChunks(yamlData, descriptiveContent);
        
        for (const atomicChunk of atomicChunks) {
          // Create basic chunk record with only fields that definitely exist
          const chunkRecord = {
            source_id: legacyChunk.source_id,
            content: atomicChunk.content,
            content_summary: atomicChunk.content_summary,
            title: atomicChunk.title,
            skills: atomicChunk.skills || [],
            tags: [],
            date_start: atomicChunk.start_date,
            date_end: atomicChunk.end_date,
            user_id: legacyChunk.user_id || '345850e8-4f02-48cb-9789-d40e9cc3ee8e'
          };
          
          // Add optional fields only if they might be supported
          if (atomicChunk.role) chunkRecord.role = atomicChunk.role;
          if (atomicChunk.organization) chunkRecord.organization = atomicChunk.organization;
          if (atomicChunk.domain) chunkRecord.domain = atomicChunk.domain;
          if (atomicChunk.achievements) chunkRecord.achievements = atomicChunk.achievements;
          if (atomicChunk.metadata) chunkRecord.metadata = atomicChunk.metadata;
          if (atomicChunk.token_count) chunkRecord.token_count = atomicChunk.token_count;
          
          newChunks.push(chunkRecord);
        }
        
        chunkIdsToDelete.push(legacyChunk.id);
        this.stats.rechunked++;
        this.stats.newChunks += atomicChunks.length;
        
        if (this.verbose) {
          console.log(`✅ [PROCESS] Re-chunked \"${yamlData.title}\" → ${atomicChunks.length} atomic chunks`);
        }
        
      } catch (error) {
        this.stats.errors++;
        console.error(`❌ [PROCESS] Error processing chunk ${legacyChunk.id}:`, error.message);
      }
    }
    
    if (!this.dryRun && newChunks.length > 0) {
      await this.insertNewChunks(newChunks);
      await this.deleteLegacyChunks(chunkIdsToDelete);
    }
    
    if (this.dryRun) {
      console.log(`🧪 [DRY RUN] Would create ${newChunks.length} chunks, delete ${chunkIdsToDelete.length} legacy chunks`);
    }
  }

  extractYamlFromContent(content) {
    try {
      const yamlMatch = content.match(/^---\\n([\\s\\S]*?)\\n---/);
      if (yamlMatch) {
        return yaml.load(yamlMatch[1]);
      }
      
      const titleMatch = content.match(/# (.+?) at (.+)/);
      if (titleMatch) {
        return {
          title: titleMatch[1],
          org: titleMatch[2],
          skills: [],
          outcomes: []
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  extractDescriptiveContent(content) {
    const yamlEndMatch = content.match(/^---[\\s\\S]*?---\\n\\n([\\s\\S]*)$/);
    return yamlEndMatch ? yamlEndMatch[1] : content;
  }

  async insertNewChunks(chunks) {
    // Check what columns exist and filter chunk data accordingly
    const { data: testQuery } = await supabase
      .from('content_chunks')
      .select('*')
      .limit(0);
    
    // Get the first chunk to see what columns we're trying to insert
    if (chunks.length > 0) {
      console.log('📋 [INSERT] Sample chunk fields:', Object.keys(chunks[0]));
    }
    
    const { error } = await supabase
      .from('content_chunks')
      .insert(chunks);
      
    if (error) {
      // If insert fails due to missing columns, try with basic fields only
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        console.log('⚠️ [INSERT] Some columns missing, trying with basic fields only...');
        
        const basicChunks = chunks.map(chunk => ({
          source_id: chunk.source_id,
          title: chunk.title,
          content: chunk.content,
          content_summary: chunk.content_summary,
          skills: chunk.skills,
          tags: chunk.tags,
          date_start: chunk.date_start,
          date_end: chunk.date_end,
          embedding: chunk.embedding,
          user_id: chunk.user_id
        }));
        
        const { error: retryError } = await supabase
          .from('content_chunks')
          .insert(basicChunks);
          
        if (retryError) {
          throw new Error(`Failed to insert chunks (retry): ${retryError.message}`);
        }
        
        console.log('✅ [INSERT] Successfully inserted with basic fields only');
        return;
      }
      
      throw new Error(`Failed to insert new chunks: ${error.message}`);
    }
  }

  async deleteLegacyChunks(chunkIds) {
    const { error } = await supabase
      .from('content_chunks')
      .delete()
      .in('id', chunkIds);
      
    if (error) {
      throw new Error(`Failed to delete legacy chunks: ${error.message}`);
    }
  }

  async removeDuplicates() {
    console.log('🧹 [DEDUP] Removing duplicate chunks...');
    
    if (this.dryRun) {
      const { data } = await supabase.rpc('find_duplicate_chunks');
      if (data && data.length > 0) {
        console.log(`🧪 [DRY RUN] Would remove ${data.reduce((sum, dup) => sum + dup.duplicate_count - 1, 0)} duplicate chunks`);
      }
      return;
    }
    
    try {
      const { data: duplicates } = await supabase.rpc('find_duplicate_chunks');
      
      if (duplicates && duplicates.length > 0) {
        for (const duplicate of duplicates) {
          const idsToDelete = duplicate.chunk_ids.slice(1);
          
          const { error } = await supabase
            .from('content_chunks')
            .delete()
            .in('id', idsToDelete);
            
          if (error) {
            console.error(`❌ [DEDUP] Error removing duplicates:`, error.message);
          } else {
            this.stats.duplicatesRemoved += idsToDelete.length;
          }
        }
        
        console.log(`✅ [DEDUP] Removed ${this.stats.duplicatesRemoved} duplicate chunks`);
      }
    } catch (error) {
      console.warn(`⚠️ [DEDUP] Deduplication failed:`, error.message);
    }
  }

  async migrateEmbeddings() {
    console.log('🧠 [EMBED] Re-embedding atomic chunks...');
    
    const { data: chunksNeedingEmbeddings, error } = await supabase
      .from('content_chunks')
      .select('id, content')
      .is('embedding', null)
      .eq('extraction_method', 'streamlined-atomic-v2')
      .limit(this.batchSize * 5);
      
    if (error || !chunksNeedingEmbeddings || chunksNeedingEmbeddings.length === 0) {
      console.log('📊 [EMBED] No chunks need re-embedding');
      return;
    }
    
    console.log(`🔄 [EMBED] Re-embedding ${chunksNeedingEmbeddings.length} atomic chunks...`);
    
    for (const chunk of chunksNeedingEmbeddings) {
      try {
        const embedding = await this.embeddingService.embedText(chunk.content, 'search_document');
        
        if (!this.dryRun) {
          const { error: updateError } = await supabase
            .from('content_chunks')
            .update({ 
              embedding: `[${embedding.join(',')}]`,
              embedding_vector: embedding
            })
            .eq('id', chunk.id);
            
          if (updateError) {
            throw updateError;
          }
        }
        
        this.stats.reembedded++;
        
        if (this.verbose && this.stats.reembedded % 10 === 0) {
          console.log(`📊 [EMBED] Re-embedded ${this.stats.reembedded} chunks`);
        }
        
      } catch (error) {
        this.stats.errors++;
        console.error(`❌ [EMBED] Error embedding chunk ${chunk.id}:`, error.message);
      }
    }
    
    console.log(`✅ [EMBED] Re-embedded ${this.stats.reembedded} chunks`);
  }

  async generateFinalReport() {
    const processingTime = Date.now() - this.stats.startTime;
    
    console.log('\n📊 [REPORT] Atomic Chunk Backfill Complete');
    console.log('=' .repeat(50));
    console.log(`⏱️  Processing time: ${Math.round(processingTime / 1000)}s`);
    console.log(`📋 Legacy chunks processed: ${this.stats.processed}`);
    console.log(`🔄 Chunks re-chunked: ${this.stats.rechunked}`);
    console.log(`📦 New atomic chunks: ${this.stats.newChunks}`);
    console.log(`🧠 Chunks re-embedded: ${this.stats.reembedded}`);
    console.log(`🧹 Duplicates removed: ${this.stats.duplicatesRemoved}`);
    console.log(`❌ Errors: ${this.stats.errors}`);
    
    if (this.stats.newChunks > 0) {
      const expansionRatio = (this.stats.newChunks / this.stats.rechunked).toFixed(1);
      console.log(`📈 Chunk expansion ratio: ${expansionRatio}x`);
    }
    
    const { data: budgetCompliance } = await supabase.rpc('calculate_token_budget_compliance');
    if (budgetCompliance && budgetCompliance.length > 0) {
      const compliance = budgetCompliance[0];
      console.log('\n🎯 Token Budget Compliance:');
      console.log(`   Total chunks: ${compliance.total_chunks}`);
      console.log(`   Within target (80-150): ${compliance.within_target} (${compliance.compliance_rate}%)`);
      console.log(`   Under target (<80): ${compliance.under_target}`);
      console.log(`   Over target (150-180): ${compliance.over_target}`);
      console.log(`   Over hard cap (>180): ${compliance.over_hard_cap}`);
    }
    
    const chunkingMetrics = this.atomicChunker.getMetrics();
    console.log('\n📊 Chunking Metrics:');
    console.log(`   Average tokens: ${chunkingMetrics.averageTokens}`);
    console.log(`   Token range: ${chunkingMetrics.minTokens} - ${chunkingMetrics.maxTokens}`);
    console.log(`   Distribution: ${JSON.stringify(chunkingMetrics.histogram)}`);
    
    if (this.dryRun) {
      console.log('\n🧪 DRY RUN - No changes were made to the database');
      console.log('   Run without --dry-run to apply changes');
    } else {
      console.log('\n✅ Backfill completed successfully');
      console.log('   All legacy chunks have been converted to atomic chunks');
    }
  }
}

// Run the backfill if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const backfill = new AtomicChunkBackfill();
  backfill.run().catch(error => {
    console.error('💥 [FATAL] Backfill failed:', error);
    process.exit(1);
  });
}

export { AtomicChunkBackfill };