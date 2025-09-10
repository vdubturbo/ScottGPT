/**
 * Streamlined Document Processor for ScottGPT
 * Implements "upload → extract → embed → discard" architecture
 * 
 * Flow: Memory Buffer → Extract Chunks → Generate Embeddings → Store Chunks → Discard Document
 * No document storage, no reprocessing, one-shot processing per upload
 */

import crypto from 'crypto';
import EmbeddingService from './embeddings.js';
import { supabase } from '../config/database.js';
import OpenAI from 'openai';
import yaml from 'js-yaml';
import { DocumentConverter } from './document-converter.js';
import DatabaseSkillsService from './skills.js';
import { markFileAsProcessedByName, saveUploadCache, uploadCache } from '../utils/upload-optimizer.js';

export class StreamlinedProcessor {
  constructor() {
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.embeddingService = new EmbeddingService();
    this.skillsService = new DatabaseSkillsService();
    
    // Initialize document converter with same config as database system
    this.converter = new DocumentConverter({
      verbose: true,
      enableFallbacks: true,
      mammoth: {
        styleMap: [
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh", 
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h4:fresh",
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh"
        ]
      }
    });
    this.performanceStats = {
      documentsProcessed: 0,
      chunksExtracted: 0,
      embeddingsGenerated: 0,
      totalProcessingTime: 0,
      averageTimePerDocument: 0
    };
  }

  /**
   * Process uploaded file buffer through complete pipeline
   * @param {Buffer} buffer - File content buffer
   * @param {string} filename - Original filename
   * @param {string} mimeType - File MIME type
   * @param {string} userId - User ID for content association
   * @returns {Promise<Object>} Processing results
   */
  async processUploadedFile(buffer, filename, mimeType, userId) {
    const startTime = Date.now();
    console.log(`🚀 [STREAMLINED] Processing ${filename} (${buffer.length} bytes) for user ${userId}`);
    
    if (!userId) {
      throw new Error('User ID is required for document processing');
    }
    
    try {
      // Step 1: Convert buffer to text content (in memory)
      const textContent = await this.bufferToText(buffer, mimeType, filename);
      console.log(`📝 Converted ${textContent.length} characters from ${filename}`);
      
      // Step 2: Extract structured chunks directly from text
      const extractedChunks = await this.extractChunksFromText(textContent, filename);
      console.log(`📊 Extracted ${extractedChunks.length} structured chunks`);
      
      if (extractedChunks.length === 0) {
        console.warn('⚠️ No valid chunks extracted from document');
        return {
          success: true,
          filename,
          chunksStored: 0,
          message: 'No extractable content found'
        };
      }
      
      // Step 3: Generate embeddings for all chunks
      const chunksWithEmbeddings = await this.generateChunkEmbeddings(extractedChunks);
      console.log(`🧠 Generated embeddings for ${chunksWithEmbeddings.length} chunks`);
      
      // Step 4: Create document record to track the processed file
      const documentRecord = await this.createDocumentRecord(filename, buffer.length, extractedChunks.length, userId);
      console.log(`📋 Created document record: ${documentRecord.id} for ${filename}`);
      
      // Step 5: Create individual job records for each extracted job
      const jobRecords = await this.createJobRecords(chunksWithEmbeddings, filename, documentRecord.id, userId);
      console.log(`📋 Created ${jobRecords.length} individual job records`);
      
      // Step 6: Store chunks with their corresponding job source_id
      const storageResults = await this.storeSearchableChunksWithJobs(chunksWithEmbeddings, jobRecords, userId);
      console.log(`💾 Stored ${storageResults.stored} searchable chunks`);
      
      const processingTime = Date.now() - startTime;
      this.performanceStats.documentsProcessed++;
      this.performanceStats.chunksExtracted += extractedChunks.length;
      this.performanceStats.embeddingsGenerated += chunksWithEmbeddings.length;
      this.performanceStats.totalProcessingTime += processingTime;
      
      console.log(`✅ [STREAMLINED] Completed ${filename} in ${processingTime}ms`);
      console.log(`   📊 ${extractedChunks.length} chunks → ${storageResults.stored} searchable`);
      
      // Mark file as processed in cache to prevent reprocessing
      try {
        const marked = markFileAsProcessedByName(filename);
        if (marked) {
          // Also add processedAt timestamp
          for (const [hash, entry] of uploadCache) {
            if (entry.originalName === filename) {
              entry.processedAt = new Date().toISOString();
              break;
            }
          }
          await saveUploadCache();
          console.log(`🧹 [CACHE] Marked ${filename} as processed to prevent reprocessing`);
        } else {
          console.warn(`⚠️ [CACHE] File ${filename} not found in cache for processing mark`);
        }
      } catch (cacheError) {
        console.warn(`⚠️ [CACHE] Failed to mark ${filename} as processed:`, cacheError.message);
        // Don't fail the whole processing if cache update fails
      }
      
      return {
        success: true,
        filename,
        documentId: documentRecord.id,
        jobRecords: jobRecords.length,
        chunksExtracted: extractedChunks.length,
        chunksStored: storageResults.stored,
        processingTime,
        message: 'Document processed successfully - individual jobs are now searchable'
      };
      
    } catch (error) {
      console.error(`❌ [STREAMLINED] Failed to process ${filename}:`, error.message);
      throw error;
    }
  }

  /**
   * Convert buffer to text content using DocumentConverter
   */
  async bufferToText(buffer, mimeType, filename) {
    console.log(`🔧 [CONVERT] Converting ${filename} (${mimeType}) to text...`);
    console.log(`🔧 [CONVERT] Buffer length: ${buffer.length} bytes`);
    
    try {
      // Use DocumentConverter for proper conversion
      const result = await this.converter.convert(buffer, {
        filename: filename,
        mimeType: mimeType,
        metadata: {
          originalName: filename,
          size: buffer.length
        }
      });
      
      if (!result.conversion.success) {
        throw new Error(result.conversion.error || 'Document conversion failed');
      }
      
      // Get the markdown content
      const convertedText = result.markdown || result.content || '';
      console.log(`✅ [CONVERT] Successfully converted to ${convertedText.length} characters`);
      console.log(`🔧 [CONVERT] Used converter: ${result.conversion.converter}`);
      console.log(`🔧 [CONVERT] Conversion time: ${result.conversion.duration}ms`);
      
      // Validate the converted content is not binary
      if (this.isBinaryContent(convertedText)) {
        throw new Error('Converted content appears to be binary data');
      }
      
      // Show preview of converted content
      console.log(`📄 [CONVERT] Content preview: ${convertedText.substring(0, 200)}...`);
      
      return convertedText;
      
    } catch (error) {
      console.error(`❌ [CONVERT] Failed to convert ${filename}:`, error.message);
      
      // Fallback: try basic text extraction for plain text files
      if (mimeType?.includes('text') || filename?.endsWith('.txt') || filename?.endsWith('.md')) {
        console.log(`🔄 [CONVERT] Attempting fallback text extraction...`);
        const fallbackText = buffer.toString('utf8');
        
        if (!this.isBinaryContent(fallbackText)) {
          console.log(`✅ [CONVERT] Fallback extraction successful`);
          return fallbackText;
        }
      }
      
      throw new Error(`Document conversion failed for ${filename}: ${error.message}`);
    }
  }
  
  /**
   * Check if content appears to be binary data
   */
  isBinaryContent(content) {
    if (typeof content !== 'string') return true;
    
    // Check for a high percentage of non-printable characters
    const printableChars = content.replace(/[^\x20-\x7E\n\r\t]/g, '');
    const printableRatio = printableChars.length / content.length;
    
    return printableRatio < 0.7; // Less than 70% printable = likely binary
  }

  /**
   * Extract structured chunks directly from text using OpenAI
   */
  async extractChunksFromText(textContent, filename) {
    console.log(`🧠 [EXTRACT] Analyzing ${filename} with OpenAI...`);
    console.log(`📄 [DEBUG] Input content length: ${textContent.length} characters`);
    console.log(`📄 [DEBUG] Content preview (first 200 chars): ${textContent.substring(0, 200)}...`);
    
    const systemPrompt = `You are a professional resume data extraction specialist. Extract career information from the provided content and create structured records with BOTH YAML metadata AND descriptive content.

CRITICAL REQUIREMENT: You MUST provide both YAML frontmatter AND descriptive content for each position. Do not skip the descriptive sections.

INSTRUCTIONS:
1. Process ONLY the content provided in the input
2. Extract job roles, companies, achievements, and skills mentioned in the actual text
3. Create one complete entry per distinct role/position found in the content
4. Each entry MUST include YAML metadata followed by detailed descriptive content
5. Do NOT add information not present in the source content
6. Do NOT fabricate or assume details not explicitly stated

REQUIRED FORMAT FOR EACH POSITION:

---
id: "unique_identifier_from_org_title_dates"
type: job
title: "Job Title From Content"
org: "Company Name From Content"
location: "Location From Content"
date_start: "Start Date From Content"
date_end: "End Date From Content"
industry_tags:
  - "Industry Tag Based On Content"
  - "Another Tag If Mentioned"
skills:
  - "Skill Mentioned In Content"
  - "Technology From Content"  
  - "Tool From Content"
outcomes:
  - "Achievement Stated In Content"
  - "Quantified Result From Content"
summary: "Brief role summary from content description"
pii_allow: false
---

# Position Details for [Job Title] at [Company]

## Role Overview
Write a detailed description of this role based on the actual content provided. Include the context of the position, what the person did, and how it fits into their career progression. If this is part of a program (like OLDP, internship program, etc.), mention that context clearly.

## Key Responsibilities & Achievements
- [List specific responsibilities mentioned in the source content]
- [Include quantified achievements from the source]
- [Mention any projects, initiatives, or major accomplishments]
- [Include any leadership or management aspects]

## Skills & Technologies Used
- [List technical skills explicitly mentioned]
- [Include tools, platforms, and technologies used]
- [Mention methodologies or processes learned]

## Program/Context Information
[If this position was part of a larger program, rotation, or career development initiative, describe that context here. For example, if it's part of OLDP (Operations Leadership Development Program), explain how this role fit into the overall program structure.]

---NEXT_EXTRACTION---

EXAMPLE OUTPUT:
If the content mentions "Software Engineer at TechCorp from 2022-Present in San Francisco, worked with React and Node.js, built 5 features as part of the product team rotation program":

---
id: "software_engineer_techcorp_2022_present"
type: job
title: "Software Engineer"
org: "TechCorp"
location: "San Francisco"
date_start: "2022"
date_end: "Present"
industry_tags:
  - "Software Development"
skills:
  - "React"
  - "Node.js"
outcomes:
  - "Built 5 features"
summary: "Software Engineer working with React and Node.js to build features as part of product team rotation"
pii_allow: false
---

# Position Details for Software Engineer at TechCorp

## Role Overview
This Software Engineer position at TechCorp focuses on building web applications using modern JavaScript technologies. The role is part of a structured product team rotation program designed to give engineers exposure to different aspects of the product development lifecycle.

## Key Responsibilities & Achievements
- Developed and deployed 5 new features using React and Node.js
- Collaborated with cross-functional product teams
- Contributed to the company's web application stack

## Skills & Technologies Used
- React for frontend development
- Node.js for backend services
- JavaScript/ES6+ programming
- Web application development

## Program/Context Information
This position is part of TechCorp's product team rotation program, which provides engineers with comprehensive experience across different product areas and development methodologies.

---NEXT_EXTRACTION---

CRITICAL RULES:
- You MUST include both YAML metadata AND the descriptive content sections
- Use actual values from the content, not placeholders or brackets
- If information is not mentioned, use null in YAML (not brackets)
- Generate realistic IDs based on org, title, and dates
- In the descriptive sections, use actual content details, not template text
- Always include program context if the position was part of a larger initiative`;

    const userPrompt = `Extract all distinct career information from this content. Process only what is explicitly mentioned in the text below:\n\n${textContent}\n\nIMPORTANT: Only extract information that is actually present in the above content. Do not add predetermined roles, companies, or achievements that are not mentioned in the source material.`;
    
    console.log(`🔧 [DEBUG] System prompt length: ${systemPrompt.length} characters`);
    console.log(`🔧 [DEBUG] User prompt length: ${userPrompt.length} characters`);

    try {
      // Use streaming like the working database system
      const stream = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 4000,
        temperature: 0.1,
        stream: true,
      });

      console.log(`🌊 [DEBUG] Starting streaming response...`);
      
      // Collect streaming response
      let extractedContent = '';
      for await (const chunk of stream) {
        if (chunk.choices[0]?.delta?.content) {
          extractedContent += chunk.choices[0].delta.content;
        }
      }
      
      console.log(`📥 [DEBUG] Received ${extractedContent.length} characters from OpenAI`);
      console.log(`📥 [DEBUG] Response preview (first 500 chars): ${extractedContent.substring(0, 500)}...`);
      
      if (extractedContent.length < 100) {
        console.warn(`⚠️ [DEBUG] Unusually short response from OpenAI: "${extractedContent}"`);
      }
      
      // Parse YAML blocks from response
      const chunks = await this.parseYamlBlocks(extractedContent);
      console.log(`🔍 [DEBUG] Parsed ${chunks.length} valid chunks from extraction`);
      
      if (chunks.length === 0) {
        console.error(`❌ [DEBUG] No valid chunks extracted. Full response: "${extractedContent}"`);
      }
      
      return chunks;
      
    } catch (error) {
      console.error('❌ OpenAI extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Process and normalize skills using the skills database table
   */
  async processSkills(skills, context = {}) {
    if (!Array.isArray(skills) || skills.length === 0) {
      return [];
    }

    try {
      // Initialize skills service if not already done
      await this.skillsService.initialize();
      
      // Use the database-based normalization
      const normalizedSkills = await this.skillsService.normalizeSkills(skills);
      
      console.log(`🔧 [SKILLS] Normalized ${skills.length} extracted skills → ${normalizedSkills.length} final skills`);
      if (skills.length !== normalizedSkills.length || skills.some((skill, i) => skill !== normalizedSkills[i])) {
        console.log(`🔧 [SKILLS] Original: [${skills.join(', ')}]`);
        console.log(`🔧 [SKILLS] Normalized: [${normalizedSkills.join(', ')}]`);
      }
      
      return normalizedSkills;
    } catch (error) {
      console.warn(`⚠️ [SKILLS] Skills processing failed: ${error.message}`);
      // Fallback to original skills if processing fails
      return skills.filter(skill => skill && typeof skill === 'string' && skill.trim()).map(skill => skill.trim());
    }
  }

  /**
   * Parse YAML blocks with descriptive content from OpenAI response
   */
  async parseYamlBlocks(extractionText) {
    console.log(`🧩 [DEBUG] Parsing enhanced YAML blocks from ${extractionText.length} character response`);
    
    const chunks = [];
    
    // Split on ---NEXT_EXTRACTION--- or multiple --- to separate complete entries
    const entries = extractionText.split(/---NEXT_EXTRACTION---|(?=---\s*\n?id:)/i).filter(entry => entry.trim());
    
    console.log(`🧩 [DEBUG] Found ${entries.length} potential complete entries`);
    
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i].trim();
      console.log(`🧩 [DEBUG] Processing entry ${i}: ${entry.length} chars`);
      
      if (!entry || !entry.includes(':')) {
        console.log(`🧩 [DEBUG] Skipping entry ${i}: empty or no colons`);
        continue;
      }
      
      try {
        // Split entry into YAML frontmatter and descriptive content
        const yamlMatch = entry.match(/^---\s*\n?([\s\S]*?)\n?---([\s\S]*)$/);
        
        let yamlContent = '';
        let descriptiveContent = '';
        
        if (yamlMatch) {
          yamlContent = yamlMatch[1].trim();
          descriptiveContent = yamlMatch[2].trim();
        } else {
          // Fallback: try to find YAML at the beginning
          const lines = entry.split('\n');
          let yamlEndIndex = -1;
          
          for (let j = 0; j < lines.length; j++) {
            if (lines[j].trim() === '---' && j > 0) {
              yamlEndIndex = j;
              break;
            }
          }
          
          if (yamlEndIndex > 0) {
            yamlContent = lines.slice(0, yamlEndIndex).join('\n').replace(/^---\s*\n?/, '');
            descriptiveContent = lines.slice(yamlEndIndex + 1).join('\n').trim();
          } else {
            yamlContent = entry.replace(/^---\s*\n?/, '').replace(/\n?---[\s\S]*$/, '');
          }
        }
        
        console.log(`🧩 [DEBUG] Entry ${i} - YAML: ${yamlContent.length} chars, Descriptive: ${descriptiveContent.length} chars`);
        
        if (!yamlContent) {
          console.log(`🧩 [DEBUG] Skipping entry ${i}: no YAML content found`);
          continue;
        }
        
        const yamlData = yaml.load(yamlContent);
        console.log(`🧩 [DEBUG] Parsed YAML data:`, yamlData);
        
        if (yamlData && yamlData.id && yamlData.title && yamlData.org) {
          // Process skills through database normalization
          const extractedSkills = Array.isArray(yamlData.skills) ? yamlData.skills : [];
          const normalizedSkills = await this.processSkills(extractedSkills, {
            title: yamlData.title,
            org: yamlData.org,
            source: 'extraction'
          });
          
          // Create enhanced content combining YAML metadata with descriptive content
          const enhancedContent = this.createEnhancedContent(yamlData, descriptiveContent, yamlContent);
          
          // Convert YAML data to chunk format with enhanced content
          const chunk = {
            content: enhancedContent,
            title: yamlData.title,
            summary: yamlData.summary,
            skills: normalizedSkills,
            tags: Array.isArray(yamlData.industry_tags) ? yamlData.industry_tags : [],
            date_start: yamlData.date_start,
            date_end: yamlData.date_end,
            extraction_method: 'streamlined-openai-enhanced'
          };
          
          console.log(`✅ [DEBUG] Created enhanced chunk: "${chunk.title}" at "${yamlData.org}" (${enhancedContent.length} chars)`);
          if (extractedSkills.length !== normalizedSkills.length) {
            console.log(`🔧 [DEBUG] Skills normalized for "${chunk.title}": ${extractedSkills.length} → ${normalizedSkills.length}`);
          }
          chunks.push(chunk);
        } else {
          console.log(`🧩 [DEBUG] Skipping entry ${i}: missing required fields (id: ${yamlData?.id}, title: ${yamlData?.title}, org: ${yamlData?.org})`);
        }
      } catch (parseError) {
        console.warn(`⚠️ [DEBUG] Failed to parse entry ${i}:`, parseError.message);
        console.warn(`⚠️ [DEBUG] Entry content: "${entry.substring(0, 200)}..."`);
      }
    }
    
    console.log(`🧩 [DEBUG] Successfully parsed ${chunks.length} enhanced chunks`);
    return chunks;
  }

  /**
   * Create enhanced content combining YAML metadata with descriptive content for better embeddings
   */
  createEnhancedContent(yamlData, descriptiveContent, yamlContent) {
    // Start with structured metadata for reference
    let enhancedContent = `---\n${yamlContent}\n---\n\n`;
    
    // Add rich title and organization context
    enhancedContent += `# ${yamlData.title} at ${yamlData.org}\n\n`;
    
    // Add location and dates if available
    if (yamlData.location && yamlData.location !== 'null') {
      enhancedContent += `**Location:** ${yamlData.location}\n`;
    }
    
    if (yamlData.date_start || yamlData.date_end) {
      const dateRange = `${yamlData.date_start || 'Unknown'} - ${yamlData.date_end || 'Present'}`;
      enhancedContent += `**Duration:** ${dateRange}\n`;
    }
    
    enhancedContent += '\n';
    
    // Add summary for context
    if (yamlData.summary) {
      enhancedContent += `**Summary:** ${yamlData.summary}\n\n`;
    }
    
    // Add the descriptive content if it exists
    if (descriptiveContent && descriptiveContent.length > 10) {
      enhancedContent += descriptiveContent + '\n\n';
    }
    
    // Add skills context
    if (Array.isArray(yamlData.skills) && yamlData.skills.length > 0) {
      enhancedContent += `**Key Skills Used:** ${yamlData.skills.join(', ')}\n\n`;
    }
    
    // Add achievements/outcomes context
    if (Array.isArray(yamlData.outcomes) && yamlData.outcomes.length > 0) {
      enhancedContent += `**Key Achievements:**\n`;
      yamlData.outcomes.forEach(outcome => {
        enhancedContent += `- ${outcome}\n`;
      });
      enhancedContent += '\n';
    }
    
    // Add industry context
    if (Array.isArray(yamlData.industry_tags) && yamlData.industry_tags.length > 0) {
      enhancedContent += `**Industry Context:** ${yamlData.industry_tags.join(', ')}\n`;
    }
    
    return enhancedContent;
  }

  /**
   * Generate embeddings for extracted chunks
   */
  async generateChunkEmbeddings(chunks) {
    console.log(`🔗 [EMBED] Generating embeddings for ${chunks.length} chunks...`);
    
    const chunksWithEmbeddings = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`🧠 [${i + 1}/${chunks.length}] Embedding: ${chunk.title}`);
      
      try {
        // Generate content embedding
        const contentEmbedding = await this.embeddingService.embedText(chunk.content, 'search_document');
        
        // Generate summary embedding if title exists
        let summaryEmbedding = null;
        if (chunk.title) {
          summaryEmbedding = await this.embeddingService.embedText(chunk.title, 'search_document');
        }
        
        chunksWithEmbeddings.push({
          ...chunk,
          embedding: contentEmbedding,
          summary_embedding: summaryEmbedding,
          embedding_status: 'completed'
        });
        
        console.log(`✅ Generated ${contentEmbedding.length}D embedding`);
        
      } catch (error) {
        console.error(`❌ Embedding failed for chunk ${i + 1}:`, error.message);
        // Skip failed embeddings rather than failing entire document
      }
    }
    
    return chunksWithEmbeddings;
  }

  /**
   * Create document record in pipeline_documents table to track processed file
   */
  async createDocumentRecord(filename, fileSize, chunkCount, userId) {
    const documentRecord = {
      original_name: filename,
      file_hash: crypto.createHash('sha256').update(filename + Date.now()).digest('hex'), // Simple hash for tracking
      document_type: this._getDocumentType(filename),
      character_count: fileSize,
      processing_status: 'completed',
      user_id: userId,
      stage_timestamps: {
        uploaded: new Date().toISOString(),
        completed: new Date().toISOString()
      }
    };

    const { data, error } = await supabase
      .from('pipeline_documents')
      .insert(documentRecord)
      .select('id, original_name')
      .single();

    if (error) {
      console.error(`❌ Failed to create document record for ${filename}:`, error.message);
      throw error;
    }

    console.log(`✅ Created document record: ${filename} (${data.id})`);
    return data;
  }

  /**
   * Create individual job records for each extracted job in sources table
   */
  async createJobRecords(chunksWithEmbeddings, filename, documentId = null, userId) {
    console.log(`📋 Creating individual job records from ${chunksWithEmbeddings.length} extracted jobs...`);
    
    const jobRecords = [];
    
    for (const chunk of chunksWithEmbeddings) {
      // Extract job details from YAML content
      let jobData = {};
      try {
        const yamlMatch = chunk.content.match(/---\n([\s\S]*?)\n---/);
        if (yamlMatch) {
          jobData = yaml.load(yamlMatch[1]) || {};
        }
      } catch (error) {
        console.warn('⚠️ Failed to parse job YAML, using chunk metadata');
      }
      
      const jobRecord = {
        id: crypto.randomUUID(),
        title: jobData.title || chunk.title || 'Untitled Position',
        org: jobData.org || 'Unknown Organization',
        location: jobData.location || null,
        type: 'job', // Always job for extracted positions
        date_start: this.parseDate(jobData.date_start || chunk.date_start),
        date_end: this.parseDate(jobData.date_end || chunk.date_end),
        skills: chunk.skills || [],
        user_id: userId
        // Note: Removed fields that don't exist in sources table: description, industry_tags, outcomes, source_file
      };

      const { data, error } = await supabase
        .from('sources')
        .insert(jobRecord)
        .select('id, title, org')
        .single();

      if (error) {
        console.error(`❌ Failed to create job record for ${jobRecord.title}:`, error.message);
        throw error;
      }

      console.log(`✅ Created job record: ${data.title} at ${jobRecord.org}`);
      jobRecords.push({
        ...data,
        chunkIndex: chunksWithEmbeddings.indexOf(chunk)
      });
    }
    
    return jobRecords;
  }

  /**
   * Store chunks with embeddings, linking to their individual job records
   */
  async storeSearchableChunksWithJobs(chunksWithEmbeddings, jobRecords, userId) {
    console.log(`💾 Storing ${chunksWithEmbeddings.length} chunks linked to individual jobs...`);
    
    const chunkRecords = chunksWithEmbeddings.map((chunk, index) => {
      const correspondingJob = jobRecords[index];
      
      return {
        source_id: correspondingJob.id,
        title: chunk.title || null,
        content: chunk.content,
        content_summary: chunk.summary || null,
        skills: chunk.skills || [],
        tags: chunk.tags || [],
        date_start: this.parseDate(chunk.date_start),
        date_end: this.parseDate(chunk.date_end),
        embedding: chunk.embedding ? `[${chunk.embedding.join(',')}]` : null,
        user_id: userId
      };
    });

    // Insert directly into content_chunks table
    const { data, error } = await supabase
      .from('content_chunks')
      .insert(chunkRecords)
      .select('id');

    if (error) {
      console.error('❌ Failed to store chunks:', error.message);
      throw error;
    }

    console.log(`✅ Stored ${data.length} searchable chunks linked to individual jobs`);
    
    return {
      stored: data.length,
      chunks: data,
      jobs: jobRecords
    };
  }

  /**
   * Parse date strings to proper format
   */
  parseDate(dateValue) {
    if (!dateValue) return null;
    
    const dateStr = String(dateValue).trim().toLowerCase();
    const ongoingPatterns = ['present', 'current', 'now'];
    
    if (ongoingPatterns.includes(dateStr)) return null;
    if (dateStr === 'null' || dateStr === '') return null;
    
    try {
      if (/^\d{1,2}\/\d{4}$/.test(dateStr)) {
        const [month, year] = dateStr.split('/');
        return `${year}-${month.padStart(2, '0')}-01`;
      }
      if (/^\d{4}$/.test(dateStr)) {
        return `${dateStr}-01-01`;
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        return dateStr;
      }
      
      const parsedDate = new Date(dateValue);
      if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Count words in text
   */
  countWords(text) {
    if (!text || typeof text !== 'string') return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Get document type from filename
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
   * Get processing statistics
   */
  getPerformanceStats() {
    return {
      ...this.performanceStats,
      averageTimePerDocument: this.performanceStats.documentsProcessed > 0 
        ? this.performanceStats.totalProcessingTime / this.performanceStats.documentsProcessed 
        : 0
    };
  }
}

export const streamlinedProcessor = new StreamlinedProcessor();
export default streamlinedProcessor;