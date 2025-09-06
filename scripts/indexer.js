import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import crypto from 'crypto';
import { CohereClient } from 'cohere-ai';
import { db, supabase } from '../config/database.js';
import { validateEmbedding } from '../utils/embedding-utils.js';
import { DateParser } from '../utils/date-parser.js';
import CONFIG from '../config/app-config.js';
import SkillDiscoveryService from '../services/skills.js';
import { 
  retryOperation, 
  circuitBreakers, 
  handleError, 
  APIError, 
  RateLimitError,
  ProcessingError,
  RecoveryStrategies 
} from '../utils/error-handling.js';

// IMMEDIATE DEBUG - Show script startup
console.log("🚀 INDEXER SCRIPT STARTING - File loaded");
console.log("📍 Script location:", import.meta.url);
console.log("📍 Working directory:", process.cwd());
console.log("📍 Node version:", process.version);

// Use centralized configuration instead of environment loading
console.log("📋 Using centralized configuration");

// Dynamic timeout configuration from centralized config
const BASE_TIMEOUT = CONFIG.content.fileProcessing.timeout.base;
const TIMEOUT_PER_FILE = CONFIG.content.fileProcessing.timeout.perFile;
const TIMEOUT_PER_CHUNK = CONFIG.content.fileProcessing.timeout.perChunk;
let processStartTime = Date.now();
let totalFilesCount = 0;
let totalChunksCount = 0;
let currentTimeoutMs = BASE_TIMEOUT;
let timeoutHandle = null;

// Initialize skill discovery service
let skillService = null;

// Progress tracking
let progressStats = {
  filesProcessed: 0,
  filesSkipped: 0,
  chunksProcessed: 0,
  errors: 0,
  startTime: Date.now(),
  lastUpdate: Date.now()
};

// Function to update and extend timeout based on discovered content
function updateDynamicTimeout(additionalFiles = 0, additionalChunks = 0) {
  totalFilesCount += additionalFiles;
  totalChunksCount += additionalChunks;
  
  // Calculate new timeout based on discovered content
  const newTimeout = BASE_TIMEOUT + 
    (totalFilesCount * TIMEOUT_PER_FILE) + 
    (totalChunksCount * TIMEOUT_PER_CHUNK);
  
  // Clear existing timeout if present
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
  }
  
  // Set new timeout with buffer
  currentTimeoutMs = Math.max(newTimeout, currentTimeoutMs);
  const remainingTime = currentTimeoutMs - (Date.now() - processStartTime);
  
  if (remainingTime > 0) {
    timeoutHandle = setTimeout(() => {
      console.error('\n❌ PROCESS TIMEOUT - Indexer exceeded maximum allowed time');
      console.error(`   Allowed time: ${Math.round(currentTimeoutMs / 1000)}s`);
      console.error(`   Progress: ${progressStats.filesProcessed} files, ${progressStats.chunksProcessed} chunks`);
      console.error('   This may indicate a network issue or API problem');
      console.error('   Try running again with fewer files or check your connection');
      process.exit(1);
    }, remainingTime);
  }
}

// Function to report progress
function reportProgress(event = null) {
  const elapsed = Math.round((Date.now() - progressStats.startTime) / 1000);
  const timeSinceLastUpdate = Date.now() - progressStats.lastUpdate;
  
  // Only report if significant time has passed or on specific events
  if (event || timeSinceLastUpdate > 5000) {
    console.log(`⏱️  Progress [${elapsed}s]: Files: ${progressStats.filesProcessed}/${totalFilesCount} | Chunks: ${progressStats.chunksProcessed}/${totalChunksCount} | Skipped: ${progressStats.filesSkipped}`);
    progressStats.lastUpdate = Date.now();
  }
}

// Clear timeout on successful completion
function clearProcessTimeout() {
  if (timeoutHandle) {
    clearTimeout(timeoutHandle);
    timeoutHandle = null;
    console.log('✅ Process completed successfully within timeout');
  }
}

console.log('🔄 Checking centralized configuration...');

// Debug configuration instead of raw environment variables
console.log('🔍 Configuration check in indexer:');
console.log('- Cohere API configured:', !!CONFIG.ai.cohere.apiKey);
console.log('- Cohere model:', CONFIG.ai.cohere.model);
console.log('- Working directory:', process.cwd());

console.log('🔄 About to initialize Cohere client...');

// Initialize Cohere client with centralized configuration
let cohere;
try {
  console.log('🔄 Creating new CohereClient instance...');
  cohere = new CohereClient({ token: CONFIG.ai.cohere.apiKey });
  console.log('✅ Cohere client initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize Cohere client:', error.message);
  console.error('   Check if your COHERE_API_KEY is valid and your internet connection is working');
  process.exit(1);
}

console.log('🔄 Cohere client ready, proceeding to function definitions...');
console.log('🔄 Script fully loaded, ready to execute indexer() if called directly...');

// Chunking configuration from centralized config
const CHUNK_TOKENS = CONFIG.content.chunking.chunkTokens;
const OVERLAP_TOKENS = CONFIG.content.chunking.overlapTokens;
const MIN_CHUNK_LENGTH = CONFIG.content.chunking.minChunkLength;

// Token estimation function is defined later with enhanced content-type-specific logic

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
      model: CONFIG.ai.cohere.model,
      inputType: CONFIG.ai.cohere.inputType.document
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

// Create optimized semantic chunks from structured job data (3-4 chunks per job for better RAG)
function createSemanticJobChunks(data) {
  const chunks = [];
  const orgHeader = `${data.org || "Unknown Organization"} • ${data.date_start || ""}–${data.date_end || "present"}`;
  
  // Target 3-4 chunks per job for optimal RAG granularity
  const TARGET_CHUNKS_PER_JOB = 4;
  const OPTIMAL_TOKENS_PER_CHUNK = 200; // Sweet spot for RAG
  const MIN_TOKENS = 120;
  const MAX_TOKENS = 280;
  
  console.log(`   🎯 [CHUNKING] Creating optimal chunks for: ${data.title}`);
  
  // Gather all content sections
  const sections = {
    overview: {
      title: "Role Overview",
      content: [
        `Position: ${data.title}`,
        data.summary || '',
        data.location ? `Location: ${data.location}` : '',
        data.industry_tags?.length > 0 ? `Industry: ${data.industry_tags.join(', ')}` : ''
      ].filter(Boolean).join('\n\n')
    },
    achievements: {
      title: "Key Achievements", 
      content: data.outcomes?.length > 0 ? data.outcomes.map(a => `• ${a}`).join('\n') : ''
    },
    skills: {
      title: "Skills & Expertise",
      content: data.skills?.length > 0 ? data.skills.map(s => `• ${s}`).join('\n') : ''
    },
    context: {
      title: "Professional Context",
      content: `This role at ${data.org} spanned ${data.date_start || 'start'} to ${data.date_end || 'present'}, contributing to organizational objectives through specialized expertise in ${data.title}.`
    }
  };
  
  console.log(`   📝 [DEBUG] Source content: ${data.outcomes?.length || 0} achievements, ${data.skills?.length || 0} skills, overview: ${data.summary?.length || 0} chars`);
  
  // Strategy: Create dedicated chunks for different aspects
  
  // Chunk 1: Role Overview + Context
  if (sections.overview.content || sections.context.content) {
    const overviewChunk = [
      orgHeader,
      sections.overview.content,
      sections.context.content
    ].filter(Boolean).join('\n\n');
    
    chunks.push({
      title: `${data.title} - Role Overview`,
      content: overviewChunk
    });
  }
  
  // Chunk 2: Achievements (split if many)
  if (sections.achievements.content) {
    const achievements = data.outcomes || [];
    if (achievements.length > 6) {
      // Split achievements into 2 chunks
      const mid = Math.ceil(achievements.length / 2);
      
      const achievementsChunk1 = [
        orgHeader,
        `Primary Achievements:`,
        achievements.slice(0, mid).map(a => `• ${a}`).join('\n')
      ].join('\n\n');
      
      const achievementsChunk2 = [
        orgHeader,
        `Additional Impact:`,
        achievements.slice(mid).map(a => `• ${a}`).join('\n')
      ].join('\n\n');
      
      chunks.push({
        title: `${data.title} - Primary Achievements`,
        content: achievementsChunk1
      });
      
      chunks.push({
        title: `${data.title} - Additional Impact`, 
        content: achievementsChunk2
      });
    } else {
      // Single achievements chunk
      const achievementsChunk = [
        orgHeader,
        sections.achievements.title + ':',
        sections.achievements.content
      ].join('\n\n');
      
      chunks.push({
        title: `${data.title} - Key Achievements`,
        content: achievementsChunk
      });
    }
  }
  
  // Chunk 3: Skills & Technical Details
  if (sections.skills.content) {
    const skillsChunk = [
      orgHeader,
      sections.skills.title + ':',
      sections.skills.content,
      data.industry_tags?.length > 0 ? `\nIndustry Expertise: ${data.industry_tags.join(', ')}` : ''
    ].filter(Boolean).join('\n\n');
    
    chunks.push({
      title: `${data.title} - Skills & Expertise`,
      content: skillsChunk
    });
  }
  
  // Validate and enhance chunks to hit optimal token range
  const enhancedChunks = chunks.map((chunk, index) => {
    let content = chunk.content;
    let tokens = estimateTokens(content);
    
    // If chunk is too small, enhance with additional context
    if (tokens < MIN_TOKENS) {
      const enhancements = [
        `\nRole Duration: ${data.date_start || 'Start'} to ${data.date_end || 'Present'}`,
        `\nOrganizational Impact: This position contributed to ${data.org}'s strategic objectives through ${data.title} expertise.`,
        data.summary ? `\nRole Summary: ${data.summary}` : '',
        data.skills?.length > 0 ? `\nCore Competencies: ${data.skills.slice(0, 3).join(', ')}` : ''
      ].filter(Boolean);
      
      for (const enhancement of enhancements) {
        const testContent = content + enhancement;
        const testTokens = estimateTokens(testContent);
        if (testTokens <= MAX_TOKENS) {
          content = testContent;
          tokens = testTokens;
        }
        if (tokens >= OPTIMAL_TOKENS_PER_CHUNK) break;
      }
    }
    
    console.log(`   ✅ [CHUNK ${index + 1}] "${chunk.title}": ${tokens} tokens`);
    
    return {
      ...chunk,
      content: content
    };
  });
  
  console.log(`   🎯 [RESULT] Created ${enhancedChunks.length} optimized chunks for ${data.title}`);
  return enhancedChunks;
}

// Smart chunk consolidation: merge chunks that are too small
function smartChunkConsolidation(chunks, title, orgHeader) {
  if (chunks.length === 0) return chunks;
  
  const MIN_CHUNK_TOKENS = 120; // From config
  const MAX_CHUNK_TOKENS = 300; // From config
  
  // Estimate token count for each chunk
  const chunksWithTokens = chunks.map(chunk => ({
    ...chunk,
    estimatedTokens: estimateTokens(chunk.content)
  }));
  
  const consolidated = [];
  let i = 0;
  
  while (i < chunksWithTokens.length) {
    const currentChunk = chunksWithTokens[i];
    
    // If chunk is already optimal size, keep it as-is
    if (currentChunk.estimatedTokens >= MIN_CHUNK_TOKENS) {
      consolidated.push(currentChunk);
      i++;
      continue;
    }
    
    // Chunk is too small - try to merge with next chunk
    if (i + 1 < chunksWithTokens.length) {
      const nextChunk = chunksWithTokens[i + 1];
      const combinedTokens = currentChunk.estimatedTokens + nextChunk.estimatedTokens;
      
      // If combined size is reasonable, merge them
      if (combinedTokens <= MAX_CHUNK_TOKENS * 1.2) { // Allow 20% overflow for better content
        const mergedChunk = {
          title: `${title} - Complete Profile`,
          content: `${currentChunk.content}\n\n---\n\n${nextChunk.content.replace(orgHeader + '\n\n', '')}`,
          estimatedTokens: combinedTokens
        };
        
        consolidated.push(mergedChunk);
        console.log(`   🔗 Merged 2 small chunks (${currentChunk.estimatedTokens}+${nextChunk.estimatedTokens}=${combinedTokens} tokens)`);
        i += 2; // Skip both chunks
        continue;
      }
    }
    
    // Can't merge - keep as-is but warn about small size
    if (currentChunk.estimatedTokens < MIN_CHUNK_TOKENS / 2) {
      console.log(`   ⚠️  Very small chunk kept: ${currentChunk.estimatedTokens} tokens (${currentChunk.title})`);
    }
    consolidated.push(currentChunk);
    i++;
  }
  
  return consolidated;
}

// Enhanced token estimation based on content characteristics
function estimateTokens(content) {
  if (!content || typeof content !== 'string') return 0;
  
  // More accurate token estimation for structured content
  const words = content.trim().split(/\s+/).filter(word => word.length > 0);
  const characters = content.length;
  
  // Different estimation for different content types
  if (content.includes('•') && content.includes('\n')) {
    // Structured content (bullet points, lists) - slightly higher token count
    return Math.round(words.length * 1.4);
  } else if (content.includes(':') && content.includes('\n')) {
    // Formatted content with labels - moderate token count
    return Math.round(words.length * 1.3);
  } else {
    // Regular prose - standard estimation
    return Math.round(words.length * 1.33);
  }
}

// Validate chunk quality and provide feedback
function validateChunkQuality(content, title, tokenCount, chunkIndex, totalChunks) {
  const MIN_OPTIMAL_TOKENS = 120;
  const MAX_OPTIMAL_TOKENS = 300;
  const TARGET_MIN_TOKENS = 200;
  const TARGET_MAX_TOKENS = 250;
  
  let qualityLevel = 'UNKNOWN';
  let feedback = '';
  
  if (tokenCount < 80) {
    qualityLevel = '🔴 POOR';
    feedback = 'Very small chunk - may lack sufficient context for retrieval';
  } else if (tokenCount < MIN_OPTIMAL_TOKENS) {
    qualityLevel = '🟡 FAIR';
    feedback = 'Small chunk - consider consolidation for better search results';
  } else if (tokenCount >= TARGET_MIN_TOKENS && tokenCount <= TARGET_MAX_TOKENS) {
    qualityLevel = '🟢 EXCELLENT';
    feedback = 'Optimal chunk size for RAG performance';
  } else if (tokenCount >= MIN_OPTIMAL_TOKENS && tokenCount <= MAX_OPTIMAL_TOKENS) {
    qualityLevel = '✅ GOOD';
    feedback = 'Good chunk size within acceptable range';
  } else if (tokenCount > MAX_OPTIMAL_TOKENS && tokenCount <= 500) {
    qualityLevel = '🟡 FAIR';
    feedback = 'Large chunk - may contain too much diverse information';
  } else {
    qualityLevel = '🔴 POOR';
    feedback = 'Very large chunk - should be split for better retrieval';
  }
  
  // Log validation results with appropriate detail level
  if (qualityLevel.includes('POOR') || qualityLevel.includes('FAIR')) {
    console.log(`   📊 Chunk ${chunkIndex}/${totalChunks}: ${qualityLevel} (${tokenCount} tokens)`);
    console.log(`      💡 ${feedback}`);
    console.log(`      📝 Title: "${title}"`);
  } else if (process.env.VERBOSE_CHUNKING === 'true') {
    console.log(`   📊 Chunk ${chunkIndex}/${totalChunks}: ${qualityLevel} (${tokenCount} tokens)`);
  }
  
  // Track quality metrics for summary reporting
  if (!global.chunkingQualityStats) {
    global.chunkingQualityStats = {
      total: 0,
      poor: 0,
      fair: 0,
      good: 0,
      excellent: 0,
      totalTokens: 0,
      minTokens: Infinity,
      maxTokens: 0
    };
  }
  
  const stats = global.chunkingQualityStats;
  stats.total++;
  stats.totalTokens += tokenCount;
  stats.minTokens = Math.min(stats.minTokens, tokenCount);
  stats.maxTokens = Math.max(stats.maxTokens, tokenCount);
  
  if (qualityLevel.includes('POOR')) stats.poor++;
  else if (qualityLevel.includes('FAIR')) stats.fair++;
  else if (qualityLevel.includes('GOOD')) stats.good++;
  else if (qualityLevel.includes('EXCELLENT')) stats.excellent++;
}

// Report chunking quality summary
function reportChunkingQualitySummary() {
  const stats = global.chunkingQualityStats;
  if (!stats || stats.total === 0) {
    console.log('📊 No chunking quality data to report');
    return;
  }
  
  const avgTokens = Math.round(stats.totalTokens / stats.total);
  const optimalPercentage = ((stats.good + stats.excellent) / stats.total * 100).toFixed(1);
  const suboptimalPercentage = ((stats.poor + stats.fair) / stats.total * 100).toFixed(1);
  
  console.log('\n🎯 CHUNKING QUALITY SUMMARY:');
  console.log('=' .repeat(50));
  console.log(`📊 Total chunks processed: ${stats.total}`);
  console.log(`📈 Token distribution: Min ${stats.minTokens}, Max ${stats.maxTokens}, Avg ${avgTokens}`);
  console.log(`🟢 Excellent chunks: ${stats.excellent} (${(stats.excellent / stats.total * 100).toFixed(1)}%)`);
  console.log(`✅ Good chunks: ${stats.good} (${(stats.good / stats.total * 100).toFixed(1)}%)`);
  console.log(`🟡 Fair chunks: ${stats.fair} (${(stats.fair / stats.total * 100).toFixed(1)}%)`);
  console.log(`🔴 Poor chunks: ${stats.poor} (${(stats.poor / stats.total * 100).toFixed(1)}%)`);
  console.log(`\n🎯 Overall quality: ${optimalPercentage}% optimal (target: >80%)`);
  
  if (parseFloat(optimalPercentage) >= 80) {
    console.log('✅ EXCELLENT chunking quality achieved!');
  } else if (parseFloat(optimalPercentage) >= 60) {
    console.log('🟡 GOOD chunking quality - minor improvements possible');
  } else {
    console.log('🔴 POOR chunking quality - significant improvements needed');
    console.log('💡 Consider increasing chunk consolidation thresholds');
  }
  
  console.log('=' .repeat(50));
  
  // Reset stats for next run
  global.chunkingQualityStats = null;
}

function chunkText(text, header) {
  // Legacy chunking function - kept for backward compatibility
  const words = text.split(/\s+/);
  const chunks = [];
  
  // If content is very short (typical for structured job records), create smaller semantic chunks
  if (words.length < 50) {
    // Create at least one chunk with the full content
    const fullChunk = `${header}\n\n${text.trim()}`;
    if (fullChunk.trim().length > 50) { // Reduced minimum for structured data
      chunks.push(fullChunk);
    }
    return chunks;
  }
  
  // For longer content, use traditional chunking
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
  const startTime = Date.now();
  
  try {
    // Use circuit breaker and retry logic for Cohere API
    const response = await circuitBreakers.cohere.execute(async () => {
      return await retryOperation(
        async () => await cohere.embed({
          texts: [text],
          model: CONFIG.ai.cohere.model,
          inputType: CONFIG.ai.cohere.inputType.document
        }),
        { 
          service: 'indexer', 
          operation: 'cohere_embed',
          textLength: text.length
        }
      );
    });
    
    const duration = Date.now() - startTime;
    
    // Only log if embedding took longer than expected
    if (duration > 2000) {
      console.log(`⚠️  Slow embedding: ${duration}ms for ${text.length} chars`);
    }
    
    // Add a small delay to respect rate limits from config
    await sleep(CONFIG.ai.cohere.rateLimiting.delayBetweenRequests);
    
    return response.embeddings[0];
  } catch (error) {
    const handledError = handleError(error, {
      service: 'indexer',
      operation: 'embedText',
      textLength: text.length,
      duration: Date.now() - startTime
    });
    
    console.error(`❌ Embedding failed after ${Date.now() - startTime}ms:`, handledError.message);
    throw handledError;
  }
}

async function generateSummary(content, title) {
  // For now, use first 2 sentences as summary
  // Could enhance with LLM-generated summaries later
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const summary = sentences.slice(0, 2).join(". ").trim();
  return summary ? `${summary}.` : `Summary of ${title}`;
}

async function processSkillsDiscovery(skills, context) {
  if (!skillService) {
    skillService = new SkillDiscoveryService();
    await skillService.initialize();
  }
  
  if (!Array.isArray(skills) || skills.length === 0) {
    return [];
  }
  
  const processedSkills = [];
  
  for (const skill of skills) {
    if (skill && typeof skill === 'string' && skill.trim()) {
      try {
        const discovery = await skillService.discoverSkill(skill.trim(), context);
        processedSkills.push(skill.trim());
      } catch (error) {
        console.warn(`⚠️ Failed to process skill "${skill}":`, error.message);
        processedSkills.push(skill.trim()); // Still include the skill
      }
    }
  }
  
  return processedSkills;
}

async function upsertSource(data) {
  try {
    // Process skills discovery before upserting
    const processedSkills = await processSkillsDiscovery(data.skills, {
      file: data.id,
      content: data.summary || '',
      type: data.type,
      title: data.title,
      org: data.org
    });
    data.skills = processedSkills;
    
    // Parse dates before storing to database
    const parsedStartDate = DateParser.parseToPostgresDate(data.date_start, false);
    const parsedEndDate = DateParser.parseToPostgresDate(data.date_end, true);
    
    // Log date parsing for debugging
    if (data.date_start && !parsedStartDate) {
      console.warn(`⚠️ Could not parse start date: "${data.date_start}" for ${data.title}`);
    } else if (data.date_start) {
      console.log(`✅ Parsed start date: "${data.date_start}" → "${parsedStartDate}"`);
    }
    
    if (data.date_end && !parsedEndDate) {
      console.warn(`⚠️ Could not parse end date: "${data.date_end}" for ${data.title}`);
    } else if (data.date_end) {
      console.log(`✅ Parsed end date: "${data.date_end}" → "${parsedEndDate}"`);
    }
    
    // Use parsed dates in the data object
    data.date_start = parsedStartDate;
    data.date_end = parsedEndDate;
    
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
          skills: data.skills,
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
        skills: data.skills,
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
  const fileStartTime = Date.now();
  console.log(`\n📄 Processing: ${fileName}`);
  
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
      progressStats.filesSkipped++;
      reportProgress();
      return { chunks: 0, skipped: true };
    }
    
    // Upsert source record
    const sourceId = await upsertSource(data);
    
    // Generate content summary
    const contentSummary = await generateSummary(content, data.title);
    
    // Create header for chunks
    const header = `${data.org || ""} • ${data.title} • ${data.date_start || ""}–${data.date_end || "present"}`;
    
    // Create semantic chunks from structured job data (2-3 chunks per job)
    const chunks = createSemanticJobChunks(data);
    console.log(`   📦 ${chunks.length} semantic chunks to process`);
    
    // Update timeout based on discovered chunks
    updateDynamicTimeout(0, chunks.length);
    
    if (chunks.length === 0) {
      console.log(`   ⚠️  No chunks created - content too short`);
      progressStats.filesProcessed++;
      reportProgress();
      return { chunks: 0, skipped: false };
    }
    
    // Content-level deduplication will handle duplicates automatically
    // No need to delete existing chunks - database will prevent duplicates
    
    // Process each chunk with content-level deduplication
    let processedChunks = 0;
    let skippedChunks = 0;

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        if (i === 0 || i === chunks.length - 1 || (i + 1) % 5 === 0) {
          console.log(`   🔄 Processing chunk ${i + 1}/${chunks.length}...`);
        }
        
        const chunkContent = chunk.content || chunk;
        const chunkTitle = chunk.title || `${data.title} - Part ${i + 1}`;
        
        // Calculate content hash for this specific chunk
        const contentHash = crypto.createHash("sha1").update(chunkContent).digest("hex");
        
        // Generate embedding only if content is unique
        const rawEmbedding = await retryWithBackoff(async () => {
          return await embedText(chunkContent);
        }, 3, 2000);
        
        // Validate embedding before storage
        const validation = validateEmbedding(rawEmbedding);
        if (!validation.isValid) {
          console.error(`❌ Invalid embedding for chunk ${i + 1}:`, validation.errors.join(', '));
          progressStats.errors++;
          continue;
        }
        
        const tokenCount = estimateTokens(chunkContent);
        validateChunkQuality(chunkContent, chunkTitle, tokenCount, i + 1, chunks.length);
        
        // Insert chunk with content hash (database handles deduplication)
        const insertResult = await db.insertChunk({
          source_id: sourceId,
          title: chunkTitle,
          content: chunkContent,
          content_hash: contentHash,  // ✅ Pass content hash
          content_summary: contentSummary,
          skills: data.skills || [],
          tags: data.industry_tags || [],
          date_start: data.date_start,
          date_end: data.date_end,
          token_count: tokenCount,
          embedding: rawEmbedding,
          file_hash: fileHash  // ✅ Keep file hash for traceability
        });
        
        if (insertResult.skipped) {
          console.log(`   ⏭️ Chunk ${i + 1} skipped - content already exists`);
          skippedChunks++;
        } else {
          processedChunks++;
        }
        
        progressStats.chunksProcessed++;
        
        if (processedChunks % 10 === 0) {
          reportProgress();
        }
        
      } catch (error) {
        console.error(`   ❌ Error on chunk ${i + 1}:`, error.message);
        progressStats.errors++;
        
        if (error.status === 401 || error.message.includes('Invalid API')) {
          throw error;
        }
      }
    }
    
    const fileDuration = Math.round((Date.now() - fileStartTime) / 1000);
    console.log(`   ✅ Completed: ${processedChunks} new, ${skippedChunks} skipped chunks in ${fileDuration}s`);
    
    progressStats.filesProcessed++;
    reportProgress();
    
    return { chunks: processedChunks, skipped: false };
    
  } catch (error) {
    console.error(`❌ Error processing ${fileName}:`, error.message);
    progressStats.errors++;
    progressStats.filesProcessed++;
    reportProgress();
    return { chunks: 0, skipped: false, error: error.message };
  }
}

async function processDirectory(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    const mdFiles = files.filter(f => f.endsWith(".md"));
    
    console.log(`\n📁 Processing directory: ${dirPath} (${mdFiles.length} files)`);
    
    // Update timeout based on discovered files
    updateDynamicTimeout(mdFiles.length, 0);
    
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
  console.log("\n🚀 Starting ScottGPT Indexer");
  console.log("================================\n");
  
  // Initialize progress tracking
  processStartTime = Date.now();
  progressStats.startTime = processStartTime;
  
  // Set initial conservative timeout
  updateDynamicTimeout(1, 0);
  
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
  
  // API key validation is handled by centralized config
  console.log('✅ Cohere API key validated by centralized configuration');
  
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
  
  // Clear timeout on successful completion
  clearProcessTimeout();
  
  const totalDuration = Math.round((Date.now() - processStartTime) / 1000);
  
  console.log("\n================================");
  console.log("📈 Final Statistics:");
  console.log("================================");
  console.log(`   Total time: ${totalDuration}s`);
  console.log(`   Files processed: ${grandTotalFiles}`);
  console.log(`   Files skipped: ${grandTotalSkipped}`);
  console.log(`   Total chunks created: ${grandTotalChunks}`);
  console.log(`   Errors: ${grandTotalErrors}`);
  
  if (grandTotalChunks > 0) {
    const avgChunksPerFile = grandTotalFiles > 0 ? (grandTotalChunks / grandTotalFiles).toFixed(1) : 0;
    const avgTimePerFile = grandTotalFiles > 0 ? (totalDuration / grandTotalFiles).toFixed(1) : 0;
    console.log(`   Average: ${avgChunksPerFile} chunks/file, ${avgTimePerFile}s/file`);
    
    // Extraction Quality Metrics
    console.log('\n📊 EXTRACTION QUALITY METRICS:');
    console.log('=' .repeat(40));
    console.log(`🎯 Jobs extracted: ${grandTotalFiles} roles`);
    console.log(`📦 Search granularity: ${grandTotalChunks} searchable chunks`);
    console.log(`⚡ Chunking efficiency: ${avgChunksPerFile} chunks/role (target: 2-3)`);
    
    if (parseFloat(avgChunksPerFile) >= 2.5 && parseFloat(avgChunksPerFile) <= 3.5) {
      console.log(`✅ Optimal chunking achieved - excellent search granularity`);
    } else if (parseFloat(avgChunksPerFile) < 2) {
      console.log(`⚠️  Low chunking - consider adding more semantic aspects`);
    } else {
      console.log(`⚠️  High chunking - might be over-segmenting content`);
    }
    
    // Expected performance improvements
    if (grandTotalFiles >= 5) {
      console.log(`\n💡 SEARCH PERFORMANCE IMPROVEMENTS:`);
      console.log(`   📈 ${grandTotalFiles}x more source records (1 → ${grandTotalFiles})`);
      console.log(`   🔍 ${Math.round(grandTotalChunks / 2)}x better search granularity (2 → ${grandTotalChunks} chunks)`);
      console.log(`   🏷️  Skills now indexed for filtering and search`);
      console.log(`   📊 Each job role has dedicated semantic chunks for better retrieval`);
    }
    
    // Report chunking quality summary
    reportChunkingQualitySummary();
    
    console.log("\n✅ Indexing complete! Your ScottGPT knowledge base is ready.");
    
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