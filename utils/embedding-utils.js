/**
 * Embedding Storage and Retrieval Utilities
 * 
 * Provides consistent handling of embeddings between:
 * - Cohere API (returns arrays)
 * - Supabase storage (stores as JSON strings in TEXT columns)
 * - Application code (needs arrays for calculations)
 * - Future pgvector migration (needs native vectors)
 * - Content hash deduplication (prevents duplicate chunks)
 */

import crypto from 'crypto';

/**
 * Validates that an embedding is a proper 1024-dimensional array
 * @param {any} embedding - The embedding to validate
 * @returns {Object} - Validation result with isValid boolean and details
 */
export function validateEmbedding(embedding) {
  const result = {
    isValid: false,
    type: typeof embedding,
    length: null,
    errors: []
  };

  if (embedding === null || embedding === undefined) {
    result.errors.push('Embedding is null or undefined');
    return result;
  }

  if (Array.isArray(embedding)) {
    result.length = embedding.length;
    
    if (embedding.length !== 1024) {
      result.errors.push(`Expected 1024 dimensions, got ${embedding.length}`);
      return result;
    }
    
    // Check if all elements are numbers
    const nonNumbers = embedding.filter(val => typeof val !== 'number' || isNaN(val));
    if (nonNumbers.length > 0) {
      result.errors.push(`Contains ${nonNumbers.length} non-numeric values`);
      return result;
    }
    
    // Check for reasonable value ranges (embeddings typically -1 to 1)
    const outOfRange = embedding.filter(val => Math.abs(val) > 10);
    if (outOfRange.length > 0) {
      result.errors.push(`Contains ${outOfRange.length} values with unusual magnitudes (>10)`);
      // This is a warning, not a failure
    }
    
    result.isValid = true;
    return result;
    
  } else if (typeof embedding === 'string') {
    try {
      const parsed = JSON.parse(embedding);
      const arrayValidation = validateEmbedding(parsed);
      
      if (arrayValidation.isValid) {
        result.isValid = true;
        result.type = 'string(array)';
        result.length = arrayValidation.length;
      } else {
        result.errors = [`String contains invalid array: ${arrayValidation.errors.join(', ')}`];
      }
      
      return result;
    } catch (parseError) {
      result.errors.push(`Cannot parse string as JSON: ${parseError.message}`);
      return result;
    }
  } else {
    result.errors.push(`Expected array or JSON string, got ${typeof embedding}`);
    return result;
  }
}

/**
 * Prepares an embedding for storage in Supabase
 * Ensures consistent JSON string format for TEXT columns
 * @param {Array|string} embedding - Raw embedding from Cohere or elsewhere
 * @returns {Object} - Result with prepared embedding and metadata
 */
export function prepareEmbeddingForStorage(embedding) {
  const validation = validateEmbedding(embedding);
  
  if (!validation.isValid) {
    throw new Error(`Invalid embedding for storage: ${validation.errors.join(', ')}`);
  }

  let arrayEmbedding;
  
  if (Array.isArray(embedding)) {
    arrayEmbedding = embedding;
  } else if (typeof embedding === 'string') {
    arrayEmbedding = JSON.parse(embedding);
  } else {
    throw new Error(`Unexpected embedding type for storage: ${typeof embedding}`);
  }

  // Convert to JSON string for consistent TEXT column storage
  const jsonString = JSON.stringify(arrayEmbedding);
  
  return {
    forTextColumn: jsonString,
    forVectorColumn: arrayEmbedding, // For future pgvector migration
    originalType: validation.type,
    dimensions: arrayEmbedding.length,
    storageSize: jsonString.length
  };
}

/**
 * Retrieves and parses an embedding from database storage
 * Handles both current JSON string format and future native array format
 * @param {string|Array} storedEmbedding - Embedding as retrieved from database
 * @returns {Object} - Result with parsed array and metadata
 */
export function parseStoredEmbedding(storedEmbedding) {
  if (storedEmbedding === null || storedEmbedding === undefined) {
    return {
      embedding: null,
      isValid: false,
      error: 'Stored embedding is null or undefined'
    };
  }

  try {
    let parsedArray;
    let sourceFormat;
    
    if (Array.isArray(storedEmbedding)) {
      // Native array format (future pgvector or array columns)
      parsedArray = storedEmbedding;
      sourceFormat = 'native_array';
    } else if (typeof storedEmbedding === 'string') {
      // JSON string format (current TEXT column storage)
      parsedArray = JSON.parse(storedEmbedding);
      sourceFormat = 'json_string';
    } else if (typeof storedEmbedding === 'object' && storedEmbedding.constructor && storedEmbedding.constructor.name === 'Float32Array') {
      // PostgreSQL vector type comes as Float32Array or similar
      parsedArray = Array.from(storedEmbedding);
      sourceFormat = 'vector_type';
    } else if (typeof storedEmbedding === 'object') {
      // ✅ FIX: Handle PostgreSQL vector type properly
      // PostgreSQL vectors might come as objects, try to extract the array data
      if (storedEmbedding._value) {
        // Some PostgreSQL vector representations have _value property
        parsedArray = Array.from(storedEmbedding._value);
        sourceFormat = 'pg_vector_object';
      } else {
        // Try to convert object to array if it has numeric properties
        const keys = Object.keys(storedEmbedding).filter(k => !isNaN(k)).sort((a, b) => Number(a) - Number(b));
        if (keys.length > 0) {
          parsedArray = keys.map(k => storedEmbedding[k]);
          sourceFormat = 'object_array';
        } else {
          throw new Error(`Vector object has no extractable array data`);
        }
      }
    } else {
      throw new Error(`Unexpected stored embedding type: ${typeof storedEmbedding}`);
    }

    const validation = validateEmbedding(parsedArray);
    
    return {
      embedding: parsedArray,
      isValid: validation.isValid,
      sourceFormat,
      dimensions: parsedArray?.length || 0,
      validation: validation.errors.length > 0 ? validation.errors : null
    };
    
  } catch (error) {
    return {
      embedding: null,
      isValid: false,
      error: `Failed to parse stored embedding: ${error.message}`,
      sourceFormat: 'unknown'
    };
  }
}

/**
 * Batch processes multiple stored embeddings efficiently
 * @param {Array} storedEmbeddings - Array of embeddings from database
 * @returns {Object} - Results with parsed embeddings and statistics
 */
export function batchParseStoredEmbeddings(storedEmbeddings) {
  const results = {
    embeddings: [],
    statistics: {
      total: storedEmbeddings.length,
      valid: 0,
      invalid: 0,
      nulls: 0,
      formats: {
        json_string: 0,
        native_array: 0,
        unknown: 0
      },
      errors: []
    }
  };

  storedEmbeddings.forEach((stored, index) => {
    const parsed = parseStoredEmbedding(stored);
    results.embeddings.push(parsed);
    
    if (parsed.isValid) {
      results.statistics.valid++;
      results.statistics.formats[parsed.sourceFormat]++;
    } else {
      results.statistics.invalid++;
      if (stored === null || stored === undefined) {
        results.statistics.nulls++;
      }
      if (parsed.error) {
        results.statistics.errors.push(`Index ${index}: ${parsed.error}`);
      }
    }
  });

  return results;
}

/**
 * Calculates cosine similarity between two embeddings
 * Handles parsing automatically if needed
 * @param {Array|string} embeddingA - First embedding
 * @param {Array|string} embeddingB - Second embedding
 * @returns {number} - Cosine similarity between 0 and 1
 */
export function calculateCosineSimilarity(embeddingA, embeddingB) {
  // 🔍 DEBUG: Add logging to see what's happening in parsing
  console.log(`🔍 calculateCosineSimilarity debug:`);
  console.log(`   - embeddingA type: ${typeof embeddingA}, length: ${embeddingA?.length}`);
  console.log(`   - embeddingB type: ${typeof embeddingB}, sample: ${embeddingB?.toString().substring(0, 30)}...`);
  
  const parsedA = parseStoredEmbedding(embeddingA);
  const parsedB = parseStoredEmbedding(embeddingB);
  
  console.log(`   - parsedA: valid=${parsedA.isValid}, format=${parsedA.sourceFormat}, dims=${parsedA.dimensions}`);
  console.log(`   - parsedB: valid=${parsedB.isValid}, format=${parsedB.sourceFormat}, dims=${parsedB.dimensions}`);
  
  if (!parsedA.isValid || !parsedB.isValid) {
    console.warn('Cannot calculate similarity: invalid embeddings');
    console.warn(`   - parsedA error: ${parsedA.error}`);
    console.warn(`   - parsedB error: ${parsedB.error}`);
    return 0;
  }
  
  const vecA = parsedA.embedding;
  const vecB = parsedB.embedding;
  
  if (vecA.length !== vecB.length) {
    console.warn(`Cannot calculate similarity: dimension mismatch (${vecA.length} vs ${vecB.length})`);
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  const similarity = dotProduct / (normA * normB);
  console.log(`   - calculated similarity: ${similarity}`);
  
  return similarity;
}

/**
 * Migrates embeddings between storage formats
 * Useful for pgvector migration or format standardization
 * @param {Array} chunks - Chunks with embeddings to migrate
 * @param {string} targetFormat - Target format ('json_string' or 'native_array')
 * @returns {Array} - Migrated chunks with converted embeddings
 */
export function migrateEmbeddingFormat(chunks, targetFormat = 'json_string') {
  return chunks.map(chunk => {
    if (!chunk.embedding) {
      return chunk; // No embedding to migrate
    }
    
    const parsed = parseStoredEmbedding(chunk.embedding);
    if (!parsed.isValid) {
      console.warn(`Skipping invalid embedding for chunk ${chunk.id}`);
      return chunk;
    }
    
    let convertedEmbedding;
    
    if (targetFormat === 'json_string') {
      convertedEmbedding = JSON.stringify(parsed.embedding);
    } else if (targetFormat === 'native_array') {
      convertedEmbedding = parsed.embedding;
    } else {
      throw new Error(`Unknown target format: ${targetFormat}`);
    }
    
    return {
      ...chunk,
      embedding: convertedEmbedding,
      _migrated: {
        from: parsed.sourceFormat,
        to: targetFormat,
        dimensions: parsed.dimensions
      }
    };
  });
}

/**
 * Creates a performance-optimized embedding processor for batch operations
 * Pre-parses embeddings and caches them for repeated similarity calculations
 * @param {Array} chunks - Chunks with embeddings
 * @returns {Object} - Optimized processor with cached embeddings
 */
export function createEmbeddingProcessor(chunks) {
  const processor = {
    chunks: [],
    validEmbeddings: 0,
    invalidEmbeddings: 0,
    errors: []
  };
  
  // Pre-parse all embeddings
  chunks.forEach((chunk, index) => {
    const parsed = parseStoredEmbedding(chunk.embedding);
    
    processor.chunks.push({
      ...chunk,
      _parsedEmbedding: parsed.isValid ? parsed.embedding : null,
      _embeddingValid: parsed.isValid,
      _embeddingError: parsed.error
    });
    
    if (parsed.isValid) {
      processor.validEmbeddings++;
    } else {
      processor.invalidEmbeddings++;
      if (parsed.error) {
        processor.errors.push(`Chunk ${chunk.id || index}: ${parsed.error}`);
      }
    }
  });
  
  // Optimized similarity calculation using pre-parsed embeddings
  processor.calculateSimilarity = function(queryEmbedding, chunkIndex) {
    const chunk = this.chunks[chunkIndex];
    if (!chunk._embeddingValid) {
      return 0;
    }
    
    const queryParsed = parseStoredEmbedding(queryEmbedding);
    if (!queryParsed.isValid) {
      return 0;
    }
    
    return calculateCosineSimilarity(queryParsed.embedding, chunk._parsedEmbedding);
  };
  
  // Batch similarity calculation for all chunks
  processor.calculateAllSimilarities = function(queryEmbedding) {
    const queryParsed = parseStoredEmbedding(queryEmbedding);
    if (!queryParsed.isValid) {
      return this.chunks.map(() => 0);
    }
    
    return this.chunks.map(chunk => {
      if (!chunk._embeddingValid) {
        return 0;
      }
      return calculateCosineSimilarity(queryParsed.embedding, chunk._parsedEmbedding);
    });
  };
  
  return processor;
}

/**
 * Diagnostic function to analyze embedding storage health
 * @param {Array} chunks - Sample of chunks from database
 * @returns {Object} - Comprehensive analysis report
 */
export function analyzeEmbeddingHealth(chunks) {
  const analysis = {
    total: chunks.length,
    valid: 0,
    invalid: 0,
    nullEmbeddings: 0,
    formatDistribution: {
      json_string: 0,
      native_array: 0,
      unknown: 0
    },
    dimensionDistribution: {},
    storageEfficiency: {
      totalStringBytes: 0,
      totalArrayElements: 0,
      averageStringLength: 0
    },
    errors: [],
    recommendations: []
  };
  
  chunks.forEach((chunk, index) => {
    if (!chunk.embedding) {
      analysis.nullEmbeddings++;
      return;
    }
    
    const parsed = parseStoredEmbedding(chunk.embedding);
    
    if (parsed.isValid) {
      analysis.valid++;
      analysis.formatDistribution[parsed.sourceFormat]++;
      
      const dims = parsed.dimensions;
      analysis.dimensionDistribution[dims] = (analysis.dimensionDistribution[dims] || 0) + 1;
      
      if (typeof chunk.embedding === 'string') {
        analysis.storageEfficiency.totalStringBytes += chunk.embedding.length;
      }
      analysis.storageEfficiency.totalArrayElements += dims;
      
    } else {
      analysis.invalid++;
      analysis.errors.push(`Chunk ${chunk.id || index}: ${parsed.error}`);
    }
  });
  
  // Calculate averages
  if (analysis.valid > 0) {
    analysis.storageEfficiency.averageStringLength = 
      Math.round(analysis.storageEfficiency.totalStringBytes / analysis.valid);
  }
  
  // Generate recommendations
  if (analysis.invalid > 0) {
    analysis.recommendations.push(`Fix ${analysis.invalid} corrupted embeddings by re-indexing`);
  }
  
  if (analysis.nullEmbeddings > 0) {
    analysis.recommendations.push(`Index ${analysis.nullEmbeddings} chunks missing embeddings`);
  }
  
  const inconsistentDims = Object.keys(analysis.dimensionDistribution).filter(d => d !== '1024');
  if (inconsistentDims.length > 0) {
    analysis.recommendations.push(`Fix ${inconsistentDims.length} chunks with non-1024 dimensions`);
  }
  
  if (analysis.formatDistribution.json_string > 0 && analysis.formatDistribution.native_array > 0) {
    analysis.recommendations.push('Mixed storage formats detected - consider standardization');
  }
  
  analysis.healthScore = analysis.valid / Math.max(analysis.total, 1);
  
  return analysis;
}

/**
 * Performance benchmark for embedding operations
 * @param {Array} sampleEmbeddings - Sample embeddings for testing
 * @returns {Object} - Performance metrics
 */
export function benchmarkEmbeddingOperations(sampleEmbeddings) {
  const benchmark = {
    parsing: { iterations: 0, totalTime: 0, avgTime: 0 },
    similarity: { iterations: 0, totalTime: 0, avgTime: 0 },
    validation: { iterations: 0, totalTime: 0, avgTime: 0 }
  };
  
  const iterations = Math.min(sampleEmbeddings.length, 100); // Limit for performance
  
  // Benchmark parsing
  const parseStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    parseStoredEmbedding(sampleEmbeddings[i]);
  }
  benchmark.parsing.totalTime = Date.now() - parseStart;
  benchmark.parsing.iterations = iterations;
  benchmark.parsing.avgTime = benchmark.parsing.totalTime / iterations;
  
  // Benchmark similarity (if we have at least 2 embeddings)
  if (iterations >= 2) {
    const simStart = Date.now();
    for (let i = 0; i < Math.min(iterations, 50); i++) {
      calculateCosineSimilarity(sampleEmbeddings[0], sampleEmbeddings[i % sampleEmbeddings.length]);
    }
    benchmark.similarity.totalTime = Date.now() - simStart;
    benchmark.similarity.iterations = Math.min(iterations, 50);
    benchmark.similarity.avgTime = benchmark.similarity.totalTime / benchmark.similarity.iterations;
  }
  
  // Benchmark validation
  const valStart = Date.now();
  for (let i = 0; i < iterations; i++) {
    validateEmbedding(sampleEmbeddings[i]);
  }
  benchmark.validation.totalTime = Date.now() - valStart;
  benchmark.validation.iterations = iterations;
  benchmark.validation.avgTime = benchmark.validation.totalTime / iterations;
  
  return benchmark;
}

// =============================================================================
// CONTENT HASH DEDUPLICATION UTILITIES
// =============================================================================

/**
 * Generates a SHA1 hash of the content for deduplication
 * @param {string} content - The text content to hash
 * @returns {string} - SHA1 hash of the content
 */
export function generateContentHash(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Content must be a non-empty string');
  }
  
  return crypto.createHash('sha1').update(content.trim()).digest('hex');
}

/**
 * Prepares chunk data with content hash for deduplication
 * @param {Object} chunkData - The chunk data object
 * @returns {Object} - Chunk data with content_hash added
 */
export function prepareChunkWithHash(chunkData) {
  if (!chunkData.content) {
    throw new Error('Chunk data must contain content field');
  }
  
  return {
    ...chunkData,
    content_hash: generateContentHash(chunkData.content)
  };
}

/**
 * Detects if multiple chunks have identical content
 * @param {Array} chunks - Array of chunk objects with content
 * @returns {Object} - Analysis of content duplication
 */
export function analyzeContentDuplication(chunks) {
  const analysis = {
    totalChunks: chunks.length,
    uniqueContent: 0,
    duplicates: 0,
    duplicateGroups: [],
    contentHashes: new Map(),
    duplicateDetails: []
  };
  
  // Group chunks by content hash
  chunks.forEach((chunk, index) => {
    const hash = generateContentHash(chunk.content || '');
    
    if (!analysis.contentHashes.has(hash)) {
      analysis.contentHashes.set(hash, []);
    }
    
    analysis.contentHashes.get(hash).push({
      ...chunk,
      originalIndex: index,
      contentHash: hash
    });
  });
  
  // Analyze duplication patterns
  analysis.contentHashes.forEach((chunksWithHash, hash) => {
    if (chunksWithHash.length === 1) {
      analysis.uniqueContent++;
    } else {
      analysis.duplicates += chunksWithHash.length;
      analysis.duplicateGroups.push({
        contentHash: hash,
        count: chunksWithHash.length,
        chunks: chunksWithHash,
        contentPreview: chunksWithHash[0].content?.substring(0, 100) + '...'
      });
    }
  });
  
  // Sort duplicate groups by count (most duplicated first)
  analysis.duplicateGroups.sort((a, b) => b.count - a.count);
  
  // Create summary of duplicate details
  analysis.duplicateDetails = analysis.duplicateGroups.map(group => ({
    hash: group.contentHash.substring(0, 8),
    count: group.count,
    sources: [...new Set(group.chunks.map(c => c.source_id || 'unknown'))],
    titles: [...new Set(group.chunks.map(c => c.title || 'untitled'))],
    preview: group.contentPreview
  }));
  
  analysis.deduplicationSavings = {
    chunksToRemove: analysis.duplicates - analysis.duplicateGroups.length,
    percentageSavings: analysis.totalChunks > 0 ? 
      ((analysis.duplicates - analysis.duplicateGroups.length) / analysis.totalChunks * 100).toFixed(1) : 0
  };
  
  return analysis;
}

/**
 * Filters out duplicate chunks keeping the first occurrence of each unique content
 * @param {Array} chunks - Array of chunks to deduplicate
 * @returns {Array} - Deduplicated array of chunks
 */
export function deduplicateChunksByContent(chunks) {
  const seenHashes = new Set();
  const uniqueChunks = [];
  const duplicates = [];
  
  chunks.forEach((chunk, index) => {
    const hash = generateContentHash(chunk.content || '');
    
    if (!seenHashes.has(hash)) {
      seenHashes.add(hash);
      uniqueChunks.push({
        ...chunk,
        content_hash: hash
      });
    } else {
      duplicates.push({
        ...chunk,
        content_hash: hash,
        originalIndex: index
      });
    }
  });
  
  return {
    unique: uniqueChunks,
    duplicates: duplicates,
    stats: {
      original: chunks.length,
      unique: uniqueChunks.length,
      duplicates: duplicates.length,
      deduplicationRate: chunks.length > 0 ? (duplicates.length / chunks.length * 100).toFixed(1) : 0
    }
  };
}

/**
 * Validates that content hash matches the actual content
 * @param {string} content - The content text
 * @param {string} contentHash - The provided content hash
 * @returns {Object} - Validation result
 */
export function validateContentHash(content, contentHash) {
  const expectedHash = generateContentHash(content);
  const isValid = expectedHash === contentHash;
  
  return {
    isValid,
    expectedHash,
    providedHash: contentHash,
    content: content?.substring(0, 100) + (content?.length > 100 ? '...' : ''),
    error: isValid ? null : `Hash mismatch: expected ${expectedHash}, got ${contentHash}`
  };
}

/**
 * Batch generates content hashes for multiple chunks
 * @param {Array} chunks - Array of chunks with content
 * @returns {Array} - Array of chunks with content_hash added
 */
export function batchGenerateContentHashes(chunks) {
  const results = {
    processed: [],
    errors: [],
    stats: {
      total: chunks.length,
      successful: 0,
      failed: 0
    }
  };
  
  chunks.forEach((chunk, index) => {
    try {
      const hashedChunk = prepareChunkWithHash(chunk);
      results.processed.push(hashedChunk);
      results.stats.successful++;
    } catch (error) {
      results.errors.push({
        index,
        chunk: chunk.title || `chunk-${index}`,
        error: error.message
      });
      results.stats.failed++;
      
      // Include the chunk without hash for debugging
      results.processed.push({
        ...chunk,
        content_hash: null,
        _hashError: error.message
      });
    }
  });
  
  return results;
}