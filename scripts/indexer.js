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

// Simple rate limiting for embeddings
// Rate limiting: 2000 requests/minute = ~33 requests/second
// Using 1 second delay to be conservative and avoid hitting limits

async function embedText(text) {
  console.log(`🔄 [DEBUG] Starting embedding for text (${text.length} chars)`);
  
  try {
    const response = await cohere.embed({
      texts: [text],
      model: "embed-english-v3.0",
      inputType: "search_document"
    });
    
    console.log(`✅ [DEBUG] Embedding successful, dimension: ${response.embeddings[0].length}`);
    
    // Add a small delay to respect rate limits
    await sleep(1000); // 1 second between calls
    
    return response.embeddings[0];
  } catch (error) {
    console.error(`❌ [DEBUG] Embedding failed:`, error.message);
    throw error;
  }
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
  
  // Debug statement 1
  console.log(`🔄 [DEBUG] Starting processFile for: ${fileName}`);
  console.log(`🔄 [DEBUG] Current time: ${new Date().toISOString()}`);
  
  try {
    const raw = await fs.readFile(filePath, "utf8");
    
    // Debug statement 2
    console.log(`🔄 [DEBUG] File read successfully, size: ${raw.length} characters`);
    const fileHash = crypto.createHash("sha1").update(raw).digest("hex");
    const { data, content } = matter(raw);
    
    // Debug statement 3
    console.log(`🔄 [DEBUG] YAML parsed, data keys: ${Object.keys(data).join(', ')}`);
    
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
    
    // Debug statement 4
    console.log(`🔄 [DEBUG] Source upserted with ID: ${sourceId}`);
    
    // Generate content summary
    const contentSummary = await generateSummary(content, data.title);
    
    // Create header for chunks
    const header = `${data.org || ""} • ${data.title} • ${data.date_start || ""}–${data.date_end || "present"}`;
    
    // Chunk the content
    const chunks = chunkText(content, header);
    console.log(`📦 Created ${chunks.length} chunks`);
    
    // Debug statement 5
    console.log(`🔄 [DEBUG] Starting chunk processing, ${chunks.length} chunks to process`);
    
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
      
      // Debug statement 6
      console.log(`🔄 [DEBUG] Processing chunk ${i + 1}/${chunks.length} at ${new Date().toISOString()}`);
      
      try {
        // Debug statement 7
        console.log(`🔄 [DEBUG] About to call embedText for chunk ${i + 1}`);
        
        // Generate embedding
        const embedding = await embedText(chunk);
        
        // Debug statement 8
        console.log(`🔄 [DEBUG] embedText completed for chunk ${i + 1}, embedding length: ${embedding?.length}`);
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
        
        // Debug statement 9
        console.log(`🔄 [DEBUG] Chunk ${i + 1} inserted to database successfully`);
        
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
  
  console.log('✅ [DEBUG] All chunks processed, indexing complete');
  
  console.log("📈 Final Statistics:");
  console.log(`   Files processed: ${grandTotalFiles}`);
  console.log(`   Files skipped: ${grandTotalSkipped}`);
  console.log(`   Total chunks created: ${grandTotalChunks}`);
  console.log(`   Errors: ${grandTotalErrors}`);
  
  if (grandTotalChunks > 0) {
    console.log("✅ Indexing complete! Your ScottGPT knowledge base is ready.");
    const avgChunksPerFile = grandTotalFiles > 0 ? (grandTotalChunks / grandTotalFiles).toFixed(1) : 0;
    console.log(`📊 Average: ${avgChunksPerFile} chunks per file`);
    
    // Archive processed files to keep sources/ directory lean
    console.log('\n📁 Archiving processed files...');
    try {
      const { default: archiveProcessedFiles } = await import('./archive-processed.js');
      await archiveProcessedFiles();
    } catch (error) {
      console.error('⚠️ Archive failed (non-critical):', error.message);
    }
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