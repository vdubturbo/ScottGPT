import fs from "fs/promises";
import path from "path";
import matter from "gray-matter";
import crypto from "crypto";
import { CohereClient } from "cohere-ai";
import { db } from "../config/database.js";

const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

// Chunking configuration
const CHUNK_TOKENS = 180;  // Target chunk size
const OVERLAP_TOKENS = 60; // Overlap between chunks
const MIN_CHUNK_LENGTH = 50; // Minimum characters for a valid chunk

// Simple word-based tokenization (rough approximation)
function estimateTokens(text) {
  // Rough estimate: 1 token ≈ 0.75 words for English text
  return Math.ceil(text.split(/\s+/).length / 0.75);
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

async function embedText(text) {
  try {
    const response = await cohere.embed({
      texts: [text],
      model: "embed-english-v3.0",
      inputType: "search_document"
    });
    
    return response.embeddings[0];
  } catch (error) {
    console.error("Embedding error:", error);
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
    // Check if source already exists
    const existing = await db.supabase
      .from("scottgpt.sources")
      .select("id")
      .eq("title", data.title)
      .eq("org", data.org)
      .single();
    
    if (existing.data) {
      // Update existing source
      const { data: updated, error } = await db.supabase
        .from("scottgpt.sources")
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
    const existingChunks = await db.supabase
      .from("scottgpt.content_chunks")
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
    await db.supabase
      .from("scottgpt.content_chunks")
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
        
        // Rate limiting for Cohere API
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`❌ Error processing chunk ${i + 1} of ${fileName}:`, error.message);
        
        // If rate limited, wait longer
        if (error.message?.includes("rate") || error.message?.includes("429")) {
          console.log("⏳ Rate limited - waiting 30 seconds...");
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
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
  
  // Check if Cohere API key is available
  if (!process.env.COHERE_API_KEY) {
    throw new Error("COHERE_API_KEY not found in environment variables");
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
  
  console.log("📈 Final Statistics:");
  console.log(`   Files processed: ${grandTotalFiles}`);
  console.log(`   Files skipped: ${grandTotalSkipped}`);
  console.log(`   Total chunks created: ${grandTotalChunks}`);
  console.log(`   Errors: ${grandTotalErrors}`);
  
  if (grandTotalChunks > 0) {
    console.log("✅ Indexing complete! Your ScottGPT knowledge base is ready.");
  } else {
    console.log("⚠️  No chunks were created. Check your source files and try again.");
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  indexer().catch(console.error);
}

export default indexer;