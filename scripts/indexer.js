import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { CohereClient } from 'cohere-ai';
import { db, supabase } from '../config/database.js';

// IMMEDIATE DEBUG - Show script startup
console.log("🚀 INDEXER SCRIPT STARTING - File loaded");
console.log("📍 Script location:", import.meta.url);
console.log("📍 Working directory:", process.cwd());
console.log("📍 Node version:", process.version);

// Load environment variables
dotenv.config();
console.log("📋 Environment variables loaded");

// REDUCED timeout for debugging - prevent infinite hanging
const PROCESS_TIMEOUT = 2 * 60 * 1000; // 2 minutes for debugging
setTimeout(() => {
  console.error('❌ FORCED TIMEOUT - indexer taking too long (2+ minutes)');
  console.error('   This was forced to prevent hanging during debugging');
  console.error('   Check your network connection and API keys');
  process.exit(1);
}, PROCESS_TIMEOUT);
console.log('⏰ DEBUG: Process timeout set to 2 minutes (reduced for debugging)');
console.log('🔄 About to check environment variables...');

// Debug environment variables
console.log('🔍 Environment check in indexer:');
console.log('- COHERE_API_KEY exists:', !!process.env.COHERE_API_KEY);
console.log('- COHERE_API_KEY length:', process.env.COHERE_API_KEY?.length || 0);
console.log('- Working directory:', process.cwd());

if (!process.env.COHERE_API_KEY) {
  console.error('❌ COHERE_API_KEY not found in indexer environment');
  console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('API')));
  process.exit(1);
}

console.log('🔄 About to initialize Cohere client...');

// Initialize Cohere client with error handling
let cohere;
try {
  console.log('🔄 Creating new CohereClient instance...');
  cohere = new CohereClient({ token: process.env.COHERE_API_KEY });
  console.log('✅ Cohere client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Cohere client:', error.message);
  console.error('   Check if your COHERE_API_KEY is valid and your internet connection is working');
  process.exit(1);
}

console.log('🔄 Cohere client ready, proceeding to function definitions...');
console.log('🔄 Script fully loaded, ready to execute indexer() if called directly...');

// Chunking configuration - optimized for fewer, better chunks
const CHUNK_TOKENS = 400;  // Larger chunks (Cohere handles up to 512 tokens well)
const OVERLAP_TOKENS = 100; // Overlap between chunks
const MIN_CHUNK_LENGTH = 100; // Minimum characters for a valid chunk

// Simple word-based tokenization (rough approximation)
function estimateTokens(text) {
  // Rough estimate: 1 token ≈ 0.75 words for English text
  return Math.ceil(text.split(/\s+/).length / 0.75);
}

// Rate limiting helper with exponential backoff
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test Cohere connection at startup
async function testCohereConnection() {
  try {
    console.log("🦧 Testing Cohere API connection...");
    const startTime = Date.now();
    const testResponse = await cohere.embed({
      texts: ["connection test"],
      model: "embed-english-v3.0",
      inputType: "search_document"
    });
    const duration = Date.now() - startTime;
    
    if (!testResponse || !testResponse.embeddings || testResponse.embeddings.length === 0) {
      throw new Error("Invalid response from Cohere API");
    }
    
    console.log(`✅ Cohere connection successful (${duration}ms response time)`);
    console.log(`📊 Embedding dimension: ${testResponse.embeddings[0].length}`);
    return true;
  } catch (error) {
    console.error("❌ Cohere connection test failed:", error.message);
    
    // Provide specific error guidance
    if (error.status === 401) {
      console.error('   ➡️ Invalid API key. Check your COHERE_API_KEY in .env file');
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('   ➡️ Network connectivity issue. Check your internet connection');
    } else if (error.message.includes('rate') || error.status === 429) {
      console.error('   ➡️ Rate limit exceeded. Wait a moment and try again');
    } else if (error.message.includes('timeout')) {
      console.error('   ➡️ Connection timeout. Check your network or try again');
    }
    
    return false;
  }
}

// Retry with exponential backoff
async function retryWithBackoff(fn, maxRetries = 3, initialDelay = 1000) {
  let lastError;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRateLimit = error.status === 429 || error.statusCode === 429 || 
                         error.message?.includes('rate') || error.message?.includes('429');
      const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || 
                            error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED';
      
      if (isRateLimit || isNetworkError) {
        const delay = isRateLimit ? 60000 : initialDelay * Math.pow(2, i);
        console.log(`⏳ Retry ${i + 1}/${maxRetries} after ${delay}ms delay...`);
        await sleep(delay);
      } else {
        throw error; // Non-retryable error
      }
    }
  }
  throw lastError;
}

function chunkText(text, header) {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += (CHUNK_TOKENS - OVERLAP_TOKENS)) {
    const chunkWords = words.slice(i, i + CHUNK_TOKENS);
    const chunkText = chunkWords.join(" ");
    
    if (chunkText.trim().length > MIN_CHUNK_LENGTH) {
      // Prepend header for standalone context
      const fullChunk = `${header}\n\n${chunkText}`;
      chunks.push(fullChunk);
    }
  }
  
  return chunks;
}

// Batch embeddings with proper rate limiting
const embeddingQueue = [];
let processingBatch = false;

// Rate limiting: 2000 requests/minute = ~33 requests/second
// But Cohere likely has burst limits, so we'll be conservative
const BATCH_SIZE = 50; // Reduced from 96 to be safer
const BATCH_DELAY_MS = 2000; // 2 seconds between batches = 30 batches/min = 1500 embeddings/min (under 2000 limit)

async function processEmbeddingBatch() {
  if (processingBatch || embeddingQueue.length === 0) return;
  
  processingBatch = true;
  const batch = embeddingQueue.splice(0, Math.min(BATCH_SIZE, embeddingQueue.length));
  
  try {
    const texts = batch.map(item => item.text);
    console.log(`🔄 Processing embedding batch: ${texts.length} texts (${embeddingQueue.length} remaining)`);
    console.log(`⏱️  Batch started at: ${new Date().toISOString()}`);
    
    const response = await retryWithBackoff(async () => {
      console.log(`📡 Calling Cohere API with ${texts.length} texts...`);
      return await cohere.embed({
        texts: texts,
        model: "embed-english-v3.0",
        inputType: "search_document"
      });
    });
    
    console.log(`✅ Batch completed successfully in ${Date.now() - Date.parse(new Date().toISOString())}ms`);
    
    // Resolve all promises with their embeddings
    batch.forEach((item, index) => {
      item.resolve(response.embeddings[index]);
    });
  } catch (error) {
    const duration = Date.now() - Date.parse(new Date().toISOString());
    console.error(`❌ Batch failed after ${duration}ms:`);
    console.error("   Message:", error.message);
    console.error("   Type:", error.constructor.name);
    if (error.code) console.error("   Code:", error.code);
    if (error.status) console.error("   Status:", error.status);
    if (error.statusCode) console.error("   Status Code:", error.statusCode);
    
    // Check for specific error types and provide guidance
    if (error.message && error.message.toLowerCase().includes('timeout')) {
      console.error("🕐 Timeout error - this usually indicates:");
      console.error("   - Slow internet connection");
      console.error("   - Cohere API server issues");
      console.error("   - Large batch size (current: " + texts.length + ")");
    } else if (error.message && error.message.toLowerCase().includes('network')) {
      console.error("🌐 Network connectivity issue - check your internet connection");
    } else if (error.message && error.message.toLowerCase().includes('fetch')) {
      console.error("📡 Fetch failed - possible DNS or connectivity issue");
    } else if (error.status === 429) {
      console.error("⏳ Rate limit exceeded - will retry with longer delay");
    } else if (error.status === 401) {
      console.error("🔐 Authentication failed - check your COHERE_API_KEY");
    }
    
    // Reject all promises in the batch
    batch.forEach(item => item.reject(error));
  } finally {
    processingBatch = false;
    // Process next batch if available
    if (embeddingQueue.length > 0) {
      await sleep(BATCH_DELAY_MS); // Consistent delay between batches
      processEmbeddingBatch();
    }
  }
}

async function embedText(text) {
  const TIMEOUT_MS = 30000; // 30 second timeout per embedding
  
  return Promise.race([
    new Promise((resolve, reject) => {
      embeddingQueue.push({ text, resolve, reject });
      // Start processing if not already running
      if (!processingBatch) {
        setTimeout(() => processEmbeddingBatch(), 500); // Allow 500ms for queue to build up
      }
    }),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Embedding timeout after 30s - check your network connection')), TIMEOUT_MS)
    )
  ]);
}

async function generateSummary(content, title) {
  // For now, use first 2 sentences as summary
  // Could enhance with LLM-generated summaries later
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const summary = sentences.slice(0, 2).join(". ").trim();
  return summary ? `${summary}.` : `Summary of ${title}`;
}

async function upsertSource(data) {
  try {
    // Check if source already exists by ID (the actual unique constraint)
    const existing = await supabase
      .from("sources")
      .select("id")
      .eq("id", data.id)
      .single();
    
    if (existing.data) {
      // Update existing source
      const { data: updated, error } = await supabase
        .from("sources")
        .update({
          type: data.type,
          location: data.location,
          date_start: data.date_start,
          date_end: data.date_end,
          industry_tags: data.industry_tags,
          summary: data.summary,
          url: data.url,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.data.id)
        .select("id")
        .single();
      
      if (error) throw error;
      return updated.id;
    } else {
      // Insert new source
      const newSource = await db.insertSource({
        id: data.id,
        type: data.type,
        title: data.title,
        org: data.org,
        location: data.location,
        date_start: data.date_start,
        date_end: data.date_end,
        industry_tags: data.industry_tags,
        summary: data.summary,
        url: data.url
      });
      return newSource.id;
    }
  } catch (error) {
    console.error("Error upserting source:", error);
    throw error;
  }
}

async function processFile(filePath, sourceDir) {
  const fileName = path.basename(filePath);
  console.log(`🔗 Processing: ${fileName}`);
  
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const fileHash = crypto.createHash("sha1").update(raw).digest("hex");
    const { data, content } = matter(raw);
    
    // Check if we've already processed this exact content
    const existingChunks = await supabase
      .from("content_chunks")
      .select("id")
      .eq("file_hash", fileHash)
      .limit(1);
    
    if (existingChunks.data && existingChunks.data.length > 0) {
      console.log(`⏭️  Skipping ${fileName} - content unchanged (hash: ${fileHash.slice(0, 8)})`);
      return { chunks: 0, skipped: true };
    }
    
    // Upsert source record
    const sourceId = await upsertSource(data);
    console.log(`📋 Source ID: ${sourceId}`);
    
    // Generate content summary
    const contentSummary = await generateSummary(content, data.title);
    
    // Create header for chunks
    const header = `${data.org || ""} • ${data.title} • ${data.date_start || ""}–${data.date_end || "present"}`;
    
    // Chunk the content
    const chunks = chunkText(content, header);
    console.log(`📦 Created ${chunks.length} chunks`);
    
    if (chunks.length === 0) {
      console.log(`⚠️  No chunks created for ${fileName} - content too short`);
      return { chunks: 0, skipped: false };
    }
    
    // Delete existing chunks for this source (in case of updates)
    await supabase
      .from("content_chunks")
      .delete()
      .eq("source_id", sourceId)
      .eq("file_hash", fileHash);
    
    // Process each chunk
    let processedChunks = 0;
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding
        const embedding = await embedText(chunk);
        const tokenCount = estimateTokens(chunk);
        
        // Insert chunk
        await db.insertChunk({
          source_id: sourceId,
          title: `${data.title} - Part ${i + 1}`,
          content: chunk,
          content_summary: contentSummary,
          skills: data.skills || [],
          tags: data.industry_tags || [],
          date_start: data.date_start,
          date_end: data.date_end,
          token_count: tokenCount,
          embedding: embedding,
          file_hash: fileHash
        });
        
        console.log(`✅ Chunk ${i + 1}/${chunks.length} - ${tokenCount} tokens`);
        processedChunks++;
        
        // No delay needed here - batching handles rate limiting
        
      } catch (error) {
        console.error(`❌ Error processing chunk ${i + 1} of ${fileName}:`);
        console.error('   Message:', error.message);
        if (error.code) console.error('   Code:', error.code);
        // Log but continue - errors are handled by retryWithBackoff
      }
    }
    
    return { chunks: processedChunks, skipped: false };
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    return { chunks: 0, skipped: false, error: error.message };
  }
}

async function processDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    const mdFiles = files.filter(f => f.endsWith(".md"));
    
    console.log(`📁 Processing directory: ${dirPath} (${mdFiles.length} files)`);
    
    let totalChunks = 0;
    let processedFiles = 0;
    let skippedFiles = 0;
    let errorCount = 0;
    
    for (const file of mdFiles) {
      const filePath = path.join(dirPath, file);
      const result = await processFile(filePath, dirPath);
      
      if (result.skipped) {
        skippedFiles++;
      } else if (result.error) {
        errorCount++;
      } else {
        processedFiles++;
        totalChunks += result.chunks;
      }
    }
    
    return { totalChunks, processedFiles, skippedFiles, errorCount };
  } catch (error) {
    if (error.code === "ENOENT") {
      console.log(`📂 Directory not found: ${dirPath}`);
      return { totalChunks: 0, processedFiles: 0, skippedFiles: 0, errorCount: 0 };
    }
    throw error;
  }
}

async function indexer() {
  console.log("🔗 Starting indexing and embedding...");
  console.log(`📊 Debug: Cohere API key length: ${process.env.COHERE_API_KEY?.length}`);
  console.log(`📊 Debug: Database connection test...`);
  
  // Test Cohere connection first - this is critical
  const cohereWorking = await testCohereConnection();
  if (!cohereWorking) {
    throw new Error("Cannot proceed without working Cohere connection. Check your API key and network.");
  }
  
  // Ensure required directories exist
  try {
    const ROOT = "sources";
    const directories = ["jobs", "projects", "education", "certs", "bio"];
    
    await fs.mkdir(ROOT, { recursive: true });
    for (const dir of directories) {
      await fs.mkdir(path.join(ROOT, dir), { recursive: true });
    }
    console.log("✅ Required directories ensured");
  } catch (error) {
    console.error("❌ Failed to create source directories:", error.message);
    throw new Error(`Directory creation failed: ${error.message}`);
  }
  
  // Check if Cohere API key is available
  if (!process.env.COHERE_API_KEY) {
    throw new Error("COHERE_API_KEY not found in environment variables");
  }
  
  // Validate database connection
  try {
    console.log('🔍 Testing database connections...');
    if (!db || !supabase) {
      throw new Error("Database connections not available");
    }
    
    // Test Supabase connection with a simple query
    const { data: testData, error: testError } = await supabase
      .from('sources')
      .select('id')
      .limit(1);
    
    if (testError) {
      throw new Error(`Supabase connection failed: ${testError.message}`);
    }
    
    console.log("✅ Database connections validated");
  } catch (error) {
    console.error("❌ Database validation failed:", error.message);
    if (error.message.includes('Invalid API key')) {
      console.error('   -> Check your SUPABASE_URL and SUPABASE_ANON_KEY in .env file');
    } else if (error.message.includes('network') || error.message.includes('timeout')) {
      console.error('   -> Network connectivity issue to Supabase');
    }
    throw new Error(`Database connection failed: ${error.message}`);
  }
  
  const ROOT = "sources";
  const directories = ["jobs", "projects", "education", "certs", "bio"];
  
  let grandTotalChunks = 0;
  let grandTotalFiles = 0;
  let grandTotalSkipped = 0;
  let grandTotalErrors = 0;
  
  for (const dir of directories) {
    const dirPath = path.join(ROOT, dir);
    const stats = await processDirectory(dirPath);
    
    console.log(`📊 ${dir}: ${stats.processedFiles} processed, ${stats.skippedFiles} skipped, ${stats.totalChunks} chunks, ${stats.errorCount} errors`);
    
    grandTotalChunks += stats.totalChunks;
    grandTotalFiles += stats.processedFiles;
    grandTotalSkipped += stats.skippedFiles;
    grandTotalErrors += stats.errorCount;
  }
  
  // Wait for any remaining embeddings to process
  console.log('🏁 Finishing remaining embeddings...');
  let waitCount = 0;
  const maxWaitTime = 240; // 2 minutes (240 * 500ms)
  
  while ((embeddingQueue.length > 0 || processingBatch) && waitCount < maxWaitTime) {
    if (waitCount % 10 === 0) { // Log every 5 seconds
      console.log(`⏳ Waiting for embeddings... Queue: ${embeddingQueue.length}, Processing: ${processingBatch}`);
    }
    await sleep(500);
    waitCount++;
  }
  
  if (waitCount >= maxWaitTime) {
    console.error('⚠️  Timeout waiting for embeddings to complete after 2 minutes');
  }
  
  console.log("📈 Final Statistics:");
  console.log(`   Files processed: ${grandTotalFiles}`);
  console.log(`   Files skipped: ${grandTotalSkipped}`);
  console.log(`   Total chunks created: ${grandTotalChunks}`);
  console.log(`   Errors: ${grandTotalErrors}`);
  
  if (grandTotalChunks > 0) {
    console.log("✅ Indexing complete! Your ScottGPT knowledge base is ready.");
    const avgChunksPerFile = grandTotalFiles > 0 ? (grandTotalChunks / grandTotalFiles).toFixed(1) : 0;
    console.log(`📊 Average: ${avgChunksPerFile} chunks per file`);
  } else {
    console.log("⚠️  No chunks were created. Check your source files and try again.");
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  indexer().catch(error => {
    console.error('❌ Indexer failed with error:');
    console.error('   Message:', error.message);
    if (error.code) console.error('   Code:', error.code);
    if (error.stack) console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  });
}

export default indexer;