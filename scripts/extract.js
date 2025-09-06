import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import OpenAI from 'openai';
import yaml from 'js-yaml';
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

const SYSTEM_PROMPT = `You are a professional resume data extraction specialist. Extract career information from the provided content and create structured records in YAML format.

INSTRUCTIONS:
1. Process ONLY the content provided in the input
2. Extract job roles, companies, achievements, and skills mentioned in the actual text
3. Create one YAML block per distinct role/position found in the content
4. Do NOT add information not present in the source content
5. Do NOT use predetermined examples or templates
6. Do NOT fabricate or assume details not explicitly stated

YAML FORMAT RULES:
1. Each position gets its own YAML block starting and ending with ---
2. YAML must contain key: value pairs only - NO markdown formatting in YAML
3. All content after the closing --- is markdown

FORMAT for each position found in the input:

---
id: [generate from actual org/title/dates in content]
type: [job/education/project/certification based on content]
title: [exact title from content]
org: [organization name from content]  
location: [location if mentioned in content]
date_start: [start date if mentioned, null if not]
date_end: [end date if mentioned, null if current or not stated]
industry_tags:
  - [industry tags based on content]
  - [only if mentioned or clearly implied]
skills:
  - [skills mentioned in content]
  - [technologies/tools from content]
outcomes:
  - [achievements stated in content]
  - [quantified results from content]
summary: [brief role summary based on content description]
pii_allow: false
---

# Position Details

## Role Overview
[Detailed description from the actual content]

## Key Achievements  
- [Accomplishments mentioned in source]
- [Projects or initiatives from content]
- [Results or metrics if provided]

## Skills & Technologies
- [Technical skills mentioned in content]
- [Methodologies referenced in content]
- [Tools and platforms stated in content]

---NEXT_EXTRACTION---

CRITICAL: Only extract positions and details that are explicitly mentioned in the provided content. Do not add roles, companies, achievements, or skills not present in the source material.`;

// Validate YAML frontmatter structure
function validateYAMLExtraction(extractionText) {
  try {
    if (!extractionText.includes('---')) {
      return { isValid: false, error: 'Missing YAML frontmatter delimiters' };
    }
    
    // Split by --- but handle the specific case where content starts with ---
    const lines = extractionText.split('\n');
    let yamlStartIndex = -1;
    let yamlEndIndex = -1;
    
    // Find YAML frontmatter boundaries
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        if (yamlStartIndex === -1) {
          yamlStartIndex = i;
        } else {
          yamlEndIndex = i;
          break;
        }
      }
    }
    
    if (yamlStartIndex === -1 || yamlEndIndex === -1) {
      return { isValid: false, error: 'Missing YAML frontmatter delimiters (--- ... ---)' };
    }
    
    const yamlSection = lines.slice(yamlStartIndex + 1, yamlEndIndex).join('\n').trim();
    const contentSection = lines.slice(yamlEndIndex + 1).join('\n').trim();
    
    // Validate YAML section
    try {
      const parsed = yaml.load(yamlSection);
      if (!parsed || typeof parsed !== 'object') {
        return { isValid: false, error: 'YAML frontmatter must be an object' };
      }
      
      // Check for required fields
      const requiredFields = ['id', 'type', 'title', 'org'];
      for (const field of requiredFields) {
        if (!parsed[field]) {
          return { isValid: false, error: `Missing required field: ${field}` };
        }
      }
      
      // Check for markdown content in YAML section
      if (yamlSection.includes('##') || yamlSection.includes('#') || yamlSection.includes('- ') && yamlSection.includes('\n- ')) {
        return { isValid: false, error: 'Markdown formatting found in YAML frontmatter' };
      }
      
      return { 
        isValid: true, 
        parsed,
        yamlSection,
        contentSection 
      };
      
    } catch (yamlError) {
      return { 
        isValid: false, 
        error: `YAML parsing error: ${yamlError.message}` 
      };
    }
    
  } catch (error) {
    return { 
      isValid: false, 
      error: `Validation error: ${error.message}` 
    };
  }
}

// Validate extraction content against source input
function validateExtractionContent(sourceContent, extractedYaml) {
  console.log('🔍 [VALIDATION] Checking extraction against source content...');
  
  try {
    const yamlBlocks = extractedYaml.split('---NEXT_EXTRACTION---');
    const sourceLower = sourceContent.toLowerCase();
    const suspiciousEntries = [];
    
    // Known contamination indicators
    const knownContaminants = [
      'binary defense', 'serta simmons', 'mckesson', 'lockheed martin',
      'american cybersystems', 'cyberdyne systems', 'middleseat.app',
      'georgia institute of technology'
    ];
    
    for (const block of yamlBlocks) {
      if (!block.trim()) continue;
      
      try {
        // Extract YAML frontmatter
        const yamlMatch = block.match(/---\n([\s\S]*?)\n---/);
        if (!yamlMatch) continue;
        
        const yamlData = yaml.load(yamlMatch[1]);
        if (!yamlData) continue;
        
        // Check if organization exists in source
        if (yamlData.org && !sourceLower.includes(yamlData.org.toLowerCase())) {
          console.warn(`⚠️ [CONTAMINATION] Org "${yamlData.org}" not found in source content`);
          suspiciousEntries.push({ type: 'org', value: yamlData.org, id: yamlData.id });
        }
        
        // Check for known contaminants
        const orgLower = (yamlData.org || '').toLowerCase();
        for (const contaminant of knownContaminants) {
          if (orgLower.includes(contaminant) && !sourceLower.includes(contaminant)) {
            console.error(`🚨 [CRITICAL] Known contaminant "${contaminant}" detected in extraction but not in source!`);
            suspiciousEntries.push({ type: 'contaminant', value: contaminant, id: yamlData.id });
          }
        }
        
      } catch (parseError) {
        console.warn(`⚠️ [VALIDATION] Could not parse YAML block: ${parseError.message}`);
      }
    }
    
    if (suspiciousEntries.length > 0) {
      console.error(`🚨 [VALIDATION FAILED] ${suspiciousEntries.length} suspicious entries detected`);
      console.error('Suspicious entries:', suspiciousEntries);
      return { isValid: false, suspiciousEntries, error: 'Extraction contains data not present in source' };
    }
    
    console.log('✅ [VALIDATION PASSED] Extraction content matches source');
    return { isValid: true };
    
  } catch (error) {
    console.error('❌ [VALIDATION ERROR]', error.message);
    return { isValid: false, error: error.message };
  }
}

// Enhanced cache validation with content verification
function validateCacheEntry(sourceContent, cachedResult) {
  console.log('🔍 [CACHE VALIDATION] Verifying cached result matches source...');
  
  // First check if the extraction content makes sense for the source
  const validation = validateExtractionContent(sourceContent, cachedResult);
  
  if (!validation.isValid) {
    console.warn('🚨 [CACHE CONTAMINATION] Cached result contains invalid data - rejecting cache entry');
    return false;
  }
  
  console.log('✅ [CACHE VALIDATION] Cached result is valid for source content');
  return true;
}

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
  
  // Check for duplicate content with validation
  if (contentCache.has(contentHash)) {
    const cachedResult = contentCache.get(contentHash);
    console.log(`♻️  [DUPLICATE] Found cached content (hash: ${contentHash.substring(0, 8)}...)`);
    console.log(`   📁 Previously processed: ${cachedResult.originalFile}`);
    
    // Validate cached result against current content
    if (validateCacheEntry(content, cachedResult.extractedContent)) {
      console.log(`   ✅ Cache validation passed - using cached result`);
      performanceStats.duplicatesSkipped++;
      return cachedResult.extractedContent;
    } else {
      console.warn(`   🚨 Cache validation failed - processing fresh (possible contamination)`);
      console.warn(`   🗑️  Removing invalid cache entry`);
      contentCache.delete(contentHash);
    }
  }
  
  console.log(`🚀 [STREAMING] Starting OpenAI streaming request (hash: ${contentHash.substring(0, 8)}...)`);
  console.log(`📝 Content length: ${content.length} chars`);
  
  try {
    // Create streaming API call with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('OpenAI streaming timeout (30s)')), 30000);
    });
    
    console.log('🔗 [CONNECTING] Establishing connection to OpenAI...');
    
    // Enhanced streaming API call for comprehensive extraction
    const streamPromise = client.chat.completions.create({
      model: 'gpt-4o-mini', // Better model for complex extraction
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { 
          role: 'user', 
          content: `Extract all distinct career information from this content. Process only what is explicitly mentioned in the text below:\n\n${content}\n\nIMPORTANT: Only extract information that is actually present in the above content. Do not add predetermined roles, companies, or achievements that are not mentioned in the source material.` 
        }
      ],
      max_tokens: 4000, // Increased for multiple extractions
      temperature: 0.1,
      stream: true,
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
    
    // Validate extraction before caching
    console.log('🔍 [PRE-CACHE VALIDATION] Validating extraction before caching...');
    const validation = validateExtractionContent(content, fullContent);
    
    if (!validation.isValid) {
      console.error('🚨 [CACHE REJECTION] Extraction failed validation - not caching potentially contaminated result');
      console.error('Validation errors:', validation.error);
      console.error('Suspicious entries:', validation.suspiciousEntries);
      throw new Error(`Extraction validation failed: ${validation.error}`);
    }
    
    // Cache the validated result
    console.log('✅ [CACHE SAFE] Validation passed - caching clean extraction result');
    contentCache.set(contentHash, {
      extractedContent: fullContent,
      originalFile: fileName,
      processedAt: new Date().toISOString(),
      duration,
      timeToFirst,
      chunkCount,
      tokens: estimatedTokens,
      streaming: true,
      validated: true,
      validationPassed: validation.isValid
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
            
            // Filter and validate extractions with YAML validation
            const validRawExtractions = [];
            let yamlValidationErrors = 0;
            
            for (const extraction of rawExtractions) {
              const trimmed = extraction.trim();
              if (!trimmed || !trimmed.includes('---') || trimmed.length < 100) {
                continue;
              }
              
              // Validate YAML structure
              const validation = validateYAMLExtraction(trimmed);
              if (validation.isValid) {
                validRawExtractions.push(trimmed);
              } else {
                console.log(`❌ [YAML ERROR] ${validation.error}`);
                console.log(`   Content preview: ${trimmed.substring(0, 200)}...`);
                yamlValidationErrors++;
              }
            }
            
            console.log(`🔧 Pre-deduplication: ${validRawExtractions.length} valid extractions (${yamlValidationErrors} YAML errors fixed)`);
            
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