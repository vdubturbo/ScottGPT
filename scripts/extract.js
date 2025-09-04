import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import 'dotenv/config';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const IN = '.work/normalized';
const OUT = '.work/extracted';
const CACHE_FILE = '.work/content-cache.json';

// Performance and duplicate detection cache
let contentCache = new Map();
let performanceStats = {
  totalCalls: 0,
  duplicatesSkipped: 0,
  totalTime: 0,
  slowCalls: 0,
  failures: 0,
  streamingCalls: 0,
  ultraFastCalls: 0, // <1s first chunk
  fastCalls: 0, // 1-3s first chunk
  slowStartCalls: 0, // >5s first chunk
  totalChunks: 0,
  totalCharacters: 0
};

const SYSTEM_PROMPT = `You are a resume data extraction specialist for Scott Lovett. Extract ONLY DISTINCT, NON-OVERLAPPING positions from the resume. Do NOT create multiple entries for the same role or position.

CRITICAL ANTI-DUPLICATION RULES:
1. ONE extraction per distinct position/role - never create multiple entries for the same job
2. If you see multiple mentions of the same role at the same company, CONSOLIDATE into ONE extraction
3. For promotions/role changes at the same company, create separate extractions ONLY if they are clearly different positions with different titles and responsibilities
4. Do NOT create separate extractions for the same role mentioned multiple times
5. Focus on MAJOR, DISTINCT career positions - not every project or assignment

CONSOLIDATION GUIDELINES:
- Same company + same/similar title + overlapping dates = ONE extraction only
- Multiple mentions of responsibilities for same role = combine into one comprehensive extraction
- Role progression (e.g., "Developer" → "Senior Developer" at same company) = separate extractions
- Same role described in different sections = consolidate into ONE extraction

FORMAT - Use this exact format for each DISTINCT position:

---
id: unique-identifier-based-on-company-and-role
type: job
title: Most Senior/Current Title for This Role
org: Company Name
location: City, State (if known)
date_start: YYYY-MM-DD
date_end: YYYY-MM-DD or null if current
industry_tags:
  - Healthcare
  - Government
skills:
  - Program Management
  - AI/ML
outcomes:
  - Specific measurable achievement
summary: Brief overview of role and primary impact
pii_allow: false
---

# Position Overview
Comprehensive description of the role, company context, and key responsibilities. Combine all information about this position into one cohesive description.

## Major Achievements
- Key accomplishments with quantified impact
- Significant projects and their outcomes
- Leadership and team accomplishments

## Technical & Skills
- Technologies, tools, and methodologies used
- Technical implementations and solutions
- Process improvements and innovations

---NEXT_EXTRACTION---

STRICT REQUIREMENTS:
- Maximum 10-15 extractions per resume (not 33!)
- Each extraction must be a CLEARLY DISTINCT position
- Combine all information about the same role into one comprehensive extraction
- Use type: 'job' for employment, 'project' for major independent projects, 'education' for degrees, 'cert' for certifications
- Only create separate extractions for genuinely different positions
- When in doubt, consolidate rather than duplicate

QUALITY CHECK BEFORE OUTPUTTING:
1. Does this represent a truly distinct role?
2. Have I already extracted this same position?
3. Can this be combined with a previous extraction?
4. Is this substantial enough to warrant its own extraction?

Output ONLY distinct positions, separated by "---NEXT_EXTRACTION---".`;

// Fuzzy string matching for deduplication
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Normalize strings
  const normalize = (s) => s.toLowerCase().replace(/[^\w\s]/g, '').trim();
  const s1 = normalize(str1);
  const s2 = normalize(str2);
  
  if (s1 === s2) return 1;
  
  // Simple similarity based on common words
  const words1 = new Set(s1.split(/\s+/));
  const words2 = new Set(s2.split(/\s+/));
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return intersection.size / union.size;
}

// Parse YAML frontmatter from extraction
function parseExtraction(extractionText) {
  try {
    const lines = extractionText.trim().split('\n');
    if (lines[0] !== '---') return null;
    
    let yamlEnd = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        yamlEnd = i;
        break;
      }
    }
    
    if (yamlEnd === -1) return null;
    
    const yamlContent = lines.slice(1, yamlEnd).join('\n');
    const bodyContent = lines.slice(yamlEnd + 1).join('\n');
    
    // Simple YAML parsing for key fields
    const yamlObj = {};
    yamlContent.split('\n').forEach(line => {
      const colonIndex = line.indexOf(':');
      if (colonIndex > -1) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        yamlObj[key] = value;
      }
    });
    
    return {
      yaml: yamlObj,
      body: bodyContent,
      fullText: extractionText
    };
  } catch (error) {
    return null;
  }
}

// Check if two extractions represent the same position
function areExtractionsDuplicate(extraction1, extraction2) {
  const e1 = parseExtraction(extraction1);
  const e2 = parseExtraction(extraction2);
  
  if (!e1 || !e2) return false;
  
  // Check organization similarity
  const orgSimilarity = calculateSimilarity(e1.yaml.org, e2.yaml.org);
  
  // Check title similarity
  const titleSimilarity = calculateSimilarity(e1.yaml.title, e2.yaml.title);
  
  // Check date overlap
  let dateOverlap = false;
  if (e1.yaml.date_start && e2.yaml.date_start) {
    const date1Start = new Date(e1.yaml.date_start);
    const date2Start = new Date(e2.yaml.date_start);
    const date1End = e1.yaml.date_end ? new Date(e1.yaml.date_end) : new Date();
    const date2End = e2.yaml.date_end ? new Date(e2.yaml.date_end) : new Date();
    
    // Check for date overlap
    dateOverlap = date1Start <= date2End && date2Start <= date1End;
  }
  
  // Consider duplicates if:
  // 1. Same organization (>80% similarity) AND same/similar title (>70% similarity)
  // 2. OR same organization AND overlapping dates AND moderately similar titles (>50%)
  const isDuplicate = (
    orgSimilarity > 0.8 && titleSimilarity > 0.7
  ) || (
    orgSimilarity > 0.8 && dateOverlap && titleSimilarity > 0.5
  );
  
  if (isDuplicate) {
    console.log(`🔍 [DUPLICATE DETECTED]`);
    console.log(`   Org similarity: ${(orgSimilarity * 100).toFixed(1)}% (${e1.yaml.org} vs ${e2.yaml.org})`);
    console.log(`   Title similarity: ${(titleSimilarity * 100).toFixed(1)}% (${e1.yaml.title} vs ${e2.yaml.title})`);
    console.log(`   Date overlap: ${dateOverlap}`);
  }
  
  return isDuplicate;
}

// Merge two similar extractions into one comprehensive extraction
function mergeExtractions(extraction1, extraction2) {
  const e1 = parseExtraction(extraction1);
  const e2 = parseExtraction(extraction2);
  
  if (!e1 || !e2) return extraction1; // Fallback to first extraction
  
  console.log(`🔗 [MERGING] Combining duplicate extractions for ${e1.yaml.org || 'Unknown'}`);
  
  // Use the extraction with more content
  const primary = extraction1.length > extraction2.length ? e1 : e2;
  const secondary = extraction1.length > extraction2.length ? e2 : e1;
  
  // Merge YAML fields - prefer non-null values and more specific information
  const mergedYaml = { ...primary.yaml };
  Object.keys(secondary.yaml).forEach(key => {
    if (secondary.yaml[key] && 
        (!mergedYaml[key] || secondary.yaml[key].length > mergedYaml[key].length)) {
      mergedYaml[key] = secondary.yaml[key];
    }
  });
  
  // Combine body content
  const mergedBody = primary.body.length > secondary.body.length 
    ? primary.body 
    : `${primary.body}\n\n## Additional Context\n${secondary.body}`;
  
  // Reconstruct the extraction
  const yamlSection = Object.entries(mergedYaml)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  
  return `---\n${yamlSection}\n---\n\n${mergedBody}`;
}

// Deduplicate extractions array
function deduplicateExtractions(extractions) {
  console.log(`🔍 [DEDUPLICATION] Checking ${extractions.length} extractions for duplicates...`);
  
  const unique = [];
  const duplicateCount = { removed: 0, merged: 0 };
  
  for (const extraction of extractions) {
    if (!extraction || !extraction.includes('---')) {
      console.log(`⚠️  [SKIP] Invalid extraction format`);
      continue;
    }
    
    // Check against existing unique extractions
    let foundDuplicate = false;
    for (let i = 0; i < unique.length; i++) {
      if (areExtractionsDuplicate(extraction, unique[i])) {
        console.log(`♻️  [MERGE] Merging duplicate extraction`);
        unique[i] = mergeExtractions(unique[i], extraction);
        duplicateCount.merged++;
        foundDuplicate = true;
        break;
      }
    }
    
    if (!foundDuplicate) {
      unique.push(extraction);
    } else {
      duplicateCount.removed++;
    }
  }
  
  console.log(`✅ [DEDUPLICATION COMPLETE] ${unique.length} unique extractions (removed: ${duplicateCount.removed}, merged: ${duplicateCount.merged})`);
  return unique;
}

// Load existing content cache
async function loadCache() {
  try {
    const cacheData = await fs.readFile(CACHE_FILE, 'utf8');
    const cache = JSON.parse(cacheData);
    contentCache = new Map(Object.entries(cache.contentHashes || {}));
    console.log(`📋 Loaded ${contentCache.size} cached content hashes`);
  } catch (error) {
    console.log('📋 No existing cache found, starting fresh');
    contentCache = new Map();
  }
}

// Save content cache
async function saveCache() {
  try {
    await fs.mkdir(path.dirname(CACHE_FILE), { recursive: true });
    const cacheData = {
      contentHashes: Object.fromEntries(contentCache),
      lastUpdated: new Date().toISOString(),
      stats: performanceStats
    };
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2));
    console.log(`💾 Saved cache with ${contentCache.size} entries`);
  } catch (error) {
    console.warn('⚠️  Failed to save cache:', error.message);
  }
}

// Generate content hash for duplicate detection
function generateContentHash(content) {
  // Normalize content for better duplicate detection
  const normalizedContent = content
    .toLowerCase()
    .replace(/\s+/g, ' ') // Normalize whitespace
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .trim();
  
  return crypto.createHash('sha256').update(normalizedContent).digest('hex').substring(0, 16);
}

// Streaming OpenAI API call with real-time progress indicators
async function callOpenAIWithOptimizations(content, fileName, blockIndex) {
  const startTime = Date.now();
  const contentHash = generateContentHash(content);
  
  // Check for duplicate content
  if (contentCache.has(contentHash)) {
    const cachedResult = contentCache.get(contentHash);
    console.log(`♻️  [DUPLICATE] Skipping identical content (hash: ${contentHash.substring(0, 8)}...)`);
    console.log(`   📁 Previously processed: ${cachedResult.originalFile}`);
    performanceStats.duplicatesSkipped++;
    return cachedResult.extractedContent;
  }
  
  console.log(`🚀 [STREAMING] Starting OpenAI streaming request (hash: ${contentHash.substring(0, 8)}...)`);
  console.log(`📝 Content length: ${content.length} chars`);
  
  try {
    // Create streaming API call with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI streaming timeout (30s)')), 30000);
    });
    
    console.log('🔗 [CONNECTING] Establishing connection to OpenAI...');
    
    // Optimized streaming API call with speed-focused parameters
    const streamPromise = client.chat.completions.create({
      model: 'gpt-3.5-turbo', // Faster model with excellent performance for extraction tasks
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Extract ALL jobs and experiences from this resume. Look for multiple roles and companies:\n\n${content}` }
      ],
      max_tokens: 1200, // Reduced for faster responses while maintaining quality
      temperature: 0, // Minimum temperature for fastest, most consistent results
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 0.9, // Slight restriction for more focused responses
      stream: true, // Enable streaming for immediate feedback
    });
    
    const stream = await Promise.race([streamPromise, timeoutPromise]);
    
    console.log('📡 [CONNECTED] Stream established, receiving chunks...');
    
    let fullContent = '';
    let chunkCount = 0;
    let firstChunkTime = null;
    let lastProgressUpdate = Date.now();
    const progressInterval = 1000; // Update progress every 1 second
    
    for await (const chunk of stream) {
      chunkCount++;
      const delta = chunk.choices[0]?.delta?.content || '';
      
      if (delta) {
        fullContent += delta;
        
        // Track first chunk time
        if (firstChunkTime === null) {
          firstChunkTime = Date.now();
          const timeToFirst = firstChunkTime - startTime;
          console.log(`🎯 [FIRST CHUNK] Received in ${timeToFirst}ms (${timeToFirst < 1000 ? 'FAST' : 'SLOW'})`);
        }
        
        // Show progress updates at intervals
        const now = Date.now();
        if (now - lastProgressUpdate >= progressInterval || chunkCount % 20 === 0) {
          const elapsed = (now - startTime) / 1000;
          const charsPerSec = fullContent.length / elapsed;
          console.log(`📈 [PROGRESS] ${fullContent.length} chars received (${chunkCount} chunks, ${charsPerSec.toFixed(0)} chars/sec)`);
          lastProgressUpdate = now;
        }
      }
    }
    
    const duration = Date.now() - startTime;
    const timeToFirst = firstChunkTime ? firstChunkTime - startTime : duration;
    
    // Performance tracking
    performanceStats.totalCalls++;
    performanceStats.totalTime += duration;
    
    // Enhanced performance classification and tracking
    const perceivedLatency = timeToFirst; // Time to first response chunk
    performanceStats.streamingCalls++;
    performanceStats.totalChunks += chunkCount;
    performanceStats.totalCharacters += fullContent.length;
    
    if (perceivedLatency > 5000) {
      performanceStats.slowStartCalls++;
      console.log(`🐌 [SLOW START] First chunk took ${(perceivedLatency/1000).toFixed(1)}s (>5s threshold)`);
    } else if (perceivedLatency < 1000) {
      performanceStats.ultraFastCalls++;
      console.log(`⚡ [ULTRA FAST] First chunk in ${perceivedLatency}ms (<1s)`);
    } else if (perceivedLatency < 3000) {
      performanceStats.fastCalls++;
      console.log(`🚀 [FAST] First chunk in ${(perceivedLatency/1000).toFixed(1)}s (1-3s)`);
    } else {
      console.log(`✅ [GOOD SPEED] First chunk in ${(perceivedLatency/1000).toFixed(1)}s (3-5s)`);
    }
    
    console.log(`🎉 [STREAMING COMPLETE] Total: ${(duration/1000).toFixed(1)}s, Chunks: ${chunkCount}, Content: ${fullContent.length} chars`);
    
    // Estimate token usage for caching
    const estimatedTokens = Math.round((JSON.stringify([content]).length + fullContent.length) / 4);
    
    // Cache the result
    contentCache.set(contentHash, {
      extractedContent: fullContent,
      originalFile: fileName,
      processedAt: new Date().toISOString(),
      duration,
      timeToFirst,
      chunkCount,
      tokens: estimatedTokens,
      streaming: true
    });
    
    console.log(`📊 [PERFORMANCE] Tokens: ~${estimatedTokens}, Latency: ${timeToFirst}ms, Total: ${duration}ms`);
    
    return fullContent;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    performanceStats.failures++;
    
    if (error.message.includes('timeout')) {
      console.error(`⏱️  [TIMEOUT] Streaming call exceeded 30 seconds for ${fileName}`);
    } else if (error.status === 429) {
      console.error(`🚫 [RATE LIMIT] API rate limit hit for ${fileName}`);
      console.log('⏳ Waiting 30 seconds before retry...');
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      // Retry with streaming
      try {
        console.log('🔄 [RETRY] Attempting streaming call again...');
        return await callOpenAIWithOptimizations(content, fileName, blockIndex);
        
      } catch (retryError) {
        console.error(`❌ [RETRY FAILED] ${retryError.message}`);
        throw retryError;
      }
    } else {
      console.error(`❌ [STREAMING ERROR] ${error.message} (${duration}ms)`);
    }
    
    throw error;
  }
}

async function extract() {
  const extractStartTime = Date.now();
  console.log('🔍 [PERFORMANCE] Starting optimized extraction with duplicate detection...');
  console.log('📅 Started at:', new Date().toISOString());
  
  // Check environment variables
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY not found in environment');
    console.error('Available env vars:', Object.keys(process.env).filter(k => k.includes('API')));
    process.exit(1);
  }
  
  console.log('✅ OpenAI API key found');
  
  // Load cache and setup directories
  await loadCache();
  await fs.mkdir(OUT, { recursive: true });

  const files = (await fs.readdir(IN)).filter(f => f.endsWith('.md'));
  
  if (files.length === 0) {
    console.log('📄 No normalized files found to extract');
    return;
  }

  console.log(`📁 Processing ${files.length} normalized files`);
  let totalBlocks = 0;
  
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    console.log(`\n📖 [${i + 1}/${files.length}] Processing: ${f}`);
    
    try {
      const raw = await fs.readFile(path.join(IN, f), 'utf8');
      console.log(`📄 Document: ${raw.length} chars, ${raw.split('\n').length} lines`);
      
      // Process the entire document as one block for better context
      const blocks = [raw];
      console.log(`📋 Processing ${blocks.length} content block(s)`);

      for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
        const block = blocks[blockIndex];
        
        try {
          console.log(`\n📦 [BLOCK ${blockIndex + 1}] Processing ${block.length} chars...`);
          
          // Use streaming API call with real-time progress
          const extractedContent = await callOpenAIWithOptimizations(block, f, blockIndex);
          
          // Process and save extractions with deduplication
          if (extractedContent && extractedContent.includes('---')) {
            const rawExtractions = extractedContent.split('---NEXT_EXTRACTION---');
            console.log(`🔍 Found ${rawExtractions.length} potential extractions`);
            
            // Filter and clean extractions
            const validRawExtractions = rawExtractions
              .map(e => e.trim())
              .filter(e => e && e.includes('---') && e.length > 100);
            
            console.log(`🔧 Pre-deduplication: ${validRawExtractions.length} valid extractions`);
            
            // Apply deduplication logic
            const uniqueExtractions = deduplicateExtractions(validRawExtractions);
            console.log(`✨ Post-deduplication: ${uniqueExtractions.length} unique extractions`);
            
            // Save deduplicated extractions
            let validExtractions = 0;
            for (let i = 0; i < uniqueExtractions.length; i++) {
              const extraction = uniqueExtractions[i];
              const fileName = f.replace('.md', `.extract-${blockIndex}-${i}.md`);
              await fs.writeFile(path.join(OUT, fileName), extraction);
              console.log(`💾 Saved unique extraction: ${fileName}`);
              validExtractions++;
              totalBlocks++;
            }
            
            const dedupSaved = rawExtractions.length - validExtractions;
            console.log(`✅ Saved ${validExtractions} unique extractions (${dedupSaved} duplicates prevented)`);
          } else {
            console.log(`⚠️  No valid extractions found in block ${blockIndex}`);
          }
          
        } catch (blockError) {
          console.error(`❌ [BLOCK ERROR] Block ${blockIndex} failed: ${blockError.message}`);
          
          // Continue with next block rather than failing entire file
          if (blockError.status === 429) {
            console.log('⏳ Rate limit - waiting before continuing...');
            await new Promise(resolve => setTimeout(resolve, 30000));
          }
        }
      }
      
    } catch (fileError) {
      console.error(`❌ [FILE ERROR] Failed to process ${f}: ${fileError.message}`);
    }
  }

  // Save cache and show performance stats
  await saveCache();
  
  const totalDuration = Date.now() - extractStartTime;
  const avgCallDuration = performanceStats.totalCalls > 0 ? performanceStats.totalTime / performanceStats.totalCalls : 0;
  
  console.log('\n🎯 STREAMING PERFORMANCE SUMMARY:');
  console.log('=' .repeat(60));
  console.log(`⏱️  Total extraction time: ${(totalDuration/1000).toFixed(1)}s`);
  console.log(`🤖 Total API calls: ${performanceStats.totalCalls} (${performanceStats.streamingCalls} streaming)`);
  console.log(`♻️  Duplicates skipped: ${performanceStats.duplicatesSkipped}`);
  console.log(`⚡ Average API time: ${(avgCallDuration/1000).toFixed(1)}s`);
  console.log(`🐌 Slow total calls (>10s): ${performanceStats.slowCalls}`);
  console.log(`❌ Failed calls: ${performanceStats.failures}`);
  console.log(`📄 Valid extractions: ${totalBlocks}`);
  console.log(`💾 Cache entries: ${contentCache.size}`);
  console.log(`\n🚀 STREAMING PERFORMANCE:`);
  console.log(`   ⚡ Ultra Fast (<1s): ${performanceStats.ultraFastCalls}`);
  console.log(`   🏃 Fast (1-3s): ${performanceStats.fastCalls}`);
  console.log(`   🐌 Slow Start (>5s): ${performanceStats.slowStartCalls}`);
  console.log(`   📊 Total chunks processed: ${performanceStats.totalChunks}`);
  console.log(`   📝 Total characters: ${performanceStats.totalCharacters.toLocaleString()}`);
  
  if (performanceStats.duplicatesSkipped > 0) {
    const timeSaved = performanceStats.duplicatesSkipped * avgCallDuration;
    console.log(`💰 Time saved by caching: ${(timeSaved/1000).toFixed(1)}s`);
  }
  
  const avgPerceivedLatency = contentCache.size > 0 ? 
    Array.from(contentCache.values()).reduce((sum, entry) => sum + (entry.timeToFirst || entry.duration), 0) / contentCache.size : 0;
  
  console.log(`🎯 Average perceived latency: ${(avgPerceivedLatency/1000).toFixed(1)}s`);
  
  if (avgPerceivedLatency > 5000) {
    console.log('\n⚠️  WARNING: Perceived latency is high (>5s). Consider:');
    console.log('   • Checking network connectivity');
    console.log('   • Switching to gpt-3.5-turbo for faster responses');
    console.log('   • Using smaller content chunks');
  } else if (avgPerceivedLatency < 1000) {
    console.log('\n🚀 EXCELLENT: Ultra-fast perceived latency (<1s)');
  } else {
    console.log('\n✅ GOOD: Streaming performance within target range (1-5s)');
  }
  
  // Streaming efficiency metrics
  if (performanceStats.streamingCalls > 0) {
    const avgChunksPerCall = performanceStats.totalChunks / performanceStats.streamingCalls;
    const avgCharsPerCall = performanceStats.totalCharacters / performanceStats.streamingCalls;
    const fastCallRatio = (performanceStats.ultraFastCalls + performanceStats.fastCalls) / performanceStats.streamingCalls;
    
    console.log(`\n📈 STREAMING EFFICIENCY:`);
    console.log(`   🔢 Avg chunks per call: ${avgChunksPerCall.toFixed(1)}`);
    console.log(`   📝 Avg characters per call: ${avgCharsPerCall.toFixed(0)}`);
    console.log(`   🎯 Fast response ratio: ${(fastCallRatio * 100).toFixed(1)}% (target: >80%)`);
    
    if (fastCallRatio < 0.8) {
      console.log(`   ⚠️  Consider switching back to gpt-4o-mini if quality is needed`);
    } else {
      console.log(`   ✅ Excellent streaming performance achieved!`);
    }
  }
  
  console.log(`📅 Completed at: ${new Date().toISOString()}`);
  console.log(`🎉 Successfully extracted ${totalBlocks} structured blocks`);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  extract().catch(console.error);
}

export default extract;