/**
 * Advanced Resume Generation Service
 * Uses the new JD Pipeline for sophisticated resume generation
 * Provides the same interface as the existing ResumeGenerationService
 */

// CRITICAL: All resume content must be based on actual evidence provided
// NO FABRICATION of metrics, numbers, or achievements not in source data
// Focus on transforming real accomplishments into professional language

// Enhanced with JD Summarization → RAG Chat Pipeline
import OpenAI from 'openai';
import CONFIG from '../config/app-config.js';
import JDSummarizationService from './jd-summarization.js';

// Smart keyword extraction from regular system (fixed syntax errors)
function extractKeywords(text) {
  const techPatterns = [
    /\b(javascript|js|typescript|ts|python|java|cpp|csharp|php|ruby|go|rust|swift|kotlin|scala)\b/gi,
    /\b(react|angular|vue|svelte|nodejs|express|django|flask|spring|laravel|rails|dotnet)\b/gi,
    /\b(mysql|postgresql|mongodb|redis|elasticsearch|oracle|sqlite|dynamodb)\b/gi,
    /\b(aws|azure|gcp|docker|kubernetes|jenkins|terraform|ansible|nginx)\b/gi,
    /\b(git|jira|confluence|agile|scrum|kanban|tdd|microservices|api|rest|graphql)\b/gi,
    /\b(financial|budget|forecast|planning|analysis|management|accounting|revenue|profit|cost)\b/gi,
    /\b(project management|program management|pmo|portfolio|stakeholder|resource planning)\b/gi
  ];

  const softPatterns = [
    /\b(leadership|management|communication|collaboration|problem solving|analytical|creative)\b/gi,
    /\b(teamwork|project management|stakeholder management|presentation|documentation)\b/gi,
    /\b(strategic planning|business analysis|process improvement|change management)\b/gi
  ];

  const technical = new Set();
  const soft = new Set();

  techPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => technical.add(match.toLowerCase().trim()));
  });

  softPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => soft.add(match.toLowerCase().trim()));
  });

  return {
    technical: Array.from(technical),
    soft: Array.from(soft),
    other: []
  };
}

export class AdvancedResumeGenerationService {
  constructor() {
    console.log('🚧 [ADVANCED] AdvancedResumeGenerationService constructor called with JD → RAG pipeline!');
    this.initialized = false;
    this.pipeline = null;
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
    this.jdSummarizer = new JDSummarizationService();
    
    // Performance-oriented caching for consistency
    this.cache = {
      jdAnalysis: new Map(), // Cache JD analysis results
      keywords: new Map(),   // Cache keyword extraction results
      ragResponses: new Map(), // Cache RAG chat responses
      maxSize: 100,          // Limit cache size to prevent memory bloat
      ttl: 1000 * 60 * 30    // 30 minute TTL for cache entries
    };
  }

  /**
   * Cache helper methods for performance optimization
   */
  _createCacheKey(data) {
    // Create a simple hash-like key from the input data
    return Buffer.from(JSON.stringify(data)).toString('base64').substring(0, 32);
  }

  _getCached(cacheMap, key) {
    const entry = cacheMap.get(key);
    if (!entry) return null;
    
    // Check TTL
    if (Date.now() - entry.timestamp > this.cache.ttl) {
      cacheMap.delete(key);
      return null;
    }
    
    console.log(`📋 [CACHE HIT] Retrieved cached result for key: ${key.substring(0, 8)}...`);
    return entry.data;
  }

  _setCached(cacheMap, key, data) {
    // Prevent memory bloat by limiting cache size
    if (cacheMap.size >= this.cache.maxSize) {
      const oldestKey = cacheMap.keys().next().value;
      cacheMap.delete(oldestKey);
      console.log(`📋 [CACHE] Evicted oldest entry: ${oldestKey?.substring(0, 8)}...`);
    }
    
    cacheMap.set(key, { data, timestamp: Date.now() });
    console.log(`📋 [CACHE SET] Cached result for key: ${key.substring(0, 8)}...`);
  }

  /**
   * Initialize the enhanced resume service (simplified for now)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      console.log('🚀 [ADVANCED] Initializing without TypeScript pipeline (crash fix)...');
      // Skip adapter initialization to avoid TypeScript crashes
      // this.adapters = createAdapters(); // DISABLED - causes TS crashes
      this.initialized = true;

      console.log('✅ Advanced Resume Generation Service initialized (TypeScript-free mode)');
    } catch (error) {
      console.error('❌ Failed to initialize Advanced Resume Generation:', error);
      throw error;
    }
  }

  /**
   * Generate resume using enhanced processing (simplified implementation for demo)
   * Maintains compatibility with existing ResumeGenerationService interface
   */
  async generateResume(jobDescription, userId, options = {}) {
    try {
      await this.initialize();

      console.log(`🚀 Advanced Resume Generation for user: ${userId} (demo mode)`);

      // Extract job keywords using smart pattern matching (from regular system) - with caching
      console.log(`🔍 [ADVANCED] About to extract keywords from job description...`);
      
      const keywordCacheKey = this._createCacheKey({ jobDescription, type: 'keywords' });
      let jobKeywords = this._getCached(this.cache.keywords, keywordCacheKey);
      
      if (!jobKeywords) {
        jobKeywords = extractKeywords(jobDescription);
        this._setCached(this.cache.keywords, keywordCacheKey, jobKeywords);
        console.log(`🔍 [ADVANCED] Extracted ${jobKeywords.technical.length + jobKeywords.soft.length} smart keywords (fresh)`);
      } else {
        console.log(`🔍 [ADVANCED] Using cached keywords: ${jobKeywords.technical.length + jobKeywords.soft.length} total`);
      }
      
      console.log(`🔍 [ADVANCED] Technical keywords:`, jobKeywords.technical);
      console.log(`🔍 [ADVANCED] Soft keywords:`, jobKeywords.soft);

      // NEW PIPELINE: JD Summarization → RAG Chat → Resume Generation
      console.log('🔄 [NEW PIPELINE] Starting JD Summarization → RAG Chat flow...');
      
      // Step 1: Summarize JD for efficient RAG queries
      const jdSummary = await this.jdSummarizer.summarizeForRAG(jobDescription);
      console.log('📝 [NEW PIPELINE] JD compressed:', jdSummary.compressionRatio.toFixed(2), 'ratio');
      
      // Step 2: Get rich professional narrative from RAG chat
      const ragResponse = await this.getRichRAGResponse(jdSummary, userId);
      console.log(`📖 [NEW PIPELINE] Retrieved ${ragResponse.narrative.length} chars from ${ragResponse.sources.length} sources`);
      
      // Step 3: Generate resume from RAG narrative (much richer content)
      const result = await this.generateResumeFromNarrative(ragResponse, jobDescription, null, options);

      console.log(`✅ [NEW PIPELINE] Complete! Resume: ${result.resumeHTML.length} chars, Match: ${result.matchScore}%`);

      return result;

    } catch (error) {
      console.error('❌ Advanced resume generation failed:', error);
      console.error('❌ Error stack:', error.stack);
      
      // NO FALLBACK - fail clearly to test new logic
      throw new Error(`ADVANCED GENERATION FAILED: ${error.message}`);
    }
  }

  /**
   * Get available templates (enhanced)
   */
  getAvailableTemplates() {
    return {
      'ats-optimized': {
        name: 'ATS Optimized (Advanced)',
        description: 'AI-powered ATS optimization with coverage tracking',
        features: [
          'Must-have requirement coverage tracking',
          'Evidence-based bullet points',
          'Token-budget optimized content',
          'Hybrid retrieval for better matching'
        ]
      },
      professional: {
        name: 'Professional (Advanced)',
        description: 'Enhanced professional format with intelligent content selection',
        features: [
          'Intelligent content prioritization',
          'Coverage-based quality scoring',
          'Advanced keyword optimization',
          'Multi-source evidence synthesis'
        ]
      }
    };
  }

  /**
   * Get supported formats (same as original but with additional metadata)
   */
  getSupportedFormats() {
    return {
      markdown: {
        name: 'Markdown (Advanced)',
        extension: 'md',
        mimeType: 'text/markdown',
        description: 'Enhanced markdown with coverage annotations'
      },
      html: {
        name: 'HTML (Advanced)', 
        extension: 'html',
        mimeType: 'text/html',
        description: 'Structured HTML with evidence tracking'
      }
    };
  }

  /**
   * Get pipeline health status
   */
  async getHealthStatus() {
    try {
      await this.initialize();
      return await this.pipeline.getHealthStatus();
    } catch (error) {
      return {
        status: 'unhealthy',
        checks: {},
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Get pipeline metrics and statistics
   */
  async getMetrics() {
    try {
      await this.initialize();
      return this.pipeline.getMetrics();
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Preview functionality (reduced processing)
   */
  async generatePreview(jobDescription, userId, options = {}) {
    try {
      await this.initialize();
      
      // Use a more constrained config for preview
      const previewResult = await this.pipeline.processJD(jobDescription, userId);
      
      // Truncate for preview
      const previewContent = previewResult.resumeMarkdown.substring(0, 1500);
      const extractedKeywords = this.extractKeywordsFromCoverage(previewResult.coverageReport);
      const matchScore = this.calculateMatchScore(previewResult.coverageReport);

      return {
        success: true,
        resume: previewContent + '...\n\n[Preview limited to 1500 characters]',
        matchScore,
        extractedKeywords,
        sourceData: {
          preview: true,
          fullLength: previewResult.resumeMarkdown.length,
          coveragePercent: previewResult.metadata?.coveragePercent,
          advancedPipeline: true
        }
      };

    } catch (error) {
      console.error('❌ Advanced preview generation failed:', error);
      return {
        success: false,
        error: error.message,
        advancedPipeline: true
      };
    }
  }

  /**
   * Analyze job description to extract requirements (enhanced) - with caching
   */
  async analyzeJobDescription(jobDescription) {
    try {
      console.log('📋 [ADVANCED] Analyzing job description of length:', jobDescription.length);
      
      // Check cache first for consistent results
      const analysisCacheKey = this._createCacheKey({ jobDescription, type: 'jdAnalysis' });
      let cachedAnalysis = this._getCached(this.cache.jdAnalysis, analysisCacheKey);
      
      if (cachedAnalysis) {
        console.log('📋 [ADVANCED] Using cached JD analysis');
        return cachedAnalysis;
      }
      
      const systemPrompt = `You are an expert recruiter analyzing job descriptions for resume optimization. 
Extract comprehensive requirements with deep analysis.

Return JSON with this exact structure:
{
  "title": "exact job title from posting",
  "seniority": "entry/mid/senior/executive level",
  "industry": "primary industry/domain",
  "coreRequirements": ["must-have requirement 1", "must-have requirement 2"],
  "preferredRequirements": ["nice-to-have requirement 1", "nice-to-have requirement 2"],
  "technicalSkills": ["specific technology/tool 1", "technology 2"],
  "softSkills": ["leadership", "communication", "etc"],
  "experienceYears": "X+ years in specific area",
  "keyResponsibilities": ["primary responsibility 1", "responsibility 2"],
  "achievements": ["type of achievement expected", "metric/outcome type"],
  "keywords": ["ATS keyword 1", "keyword 2", "industry term"]
}`;

      // Calculate cost estimation for job analysis
      const inputTokens = Math.ceil((systemPrompt.length + jobDescription.length + 50) / 4); // Rough token estimation
      const maxTokens = 2500;
      const estimatedCost = (inputTokens * CONFIG.ai.openai.modelInfo.inputCostPer1k / 1000) +
                           (maxTokens * CONFIG.ai.openai.modelInfo.outputCostPer1k / 1000);

      console.log(`🤖 [ADVANCED] Job analysis: ${CONFIG.ai.openai.model}, Est. cost: $${estimatedCost.toFixed(4)}, Tokens: ${inputTokens}→${maxTokens}`);

      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Extract requirements from: ${jobDescription}` }
        ],
        max_tokens: 2500, // Expanded for comprehensive 2-page resume generation
        temperature: 0.0 // Fixed: Use 0.0 for maximum determinism in requirement extraction
      });

      const result = { text: response.choices[0]?.message?.content || '' };

      console.log('📋 [ADVANCED] LLM analysis result:', result.text.substring(0, 200) + '...');

      try {
        const parsed = JSON.parse(result.text);
        const analysis = {
          // New comprehensive structure
          title: parsed.title || 'Position',
          seniority: parsed.seniority || 'mid',
          industry: parsed.industry || 'Technology',
          coreRequirements: parsed.coreRequirements || [],
          preferredRequirements: parsed.preferredRequirements || [],
          technicalSkills: parsed.technicalSkills || [],
          softSkills: parsed.softSkills || [],
          experienceYears: parsed.experienceYears || '',
          keyResponsibilities: parsed.keyResponsibilities || [],
          achievements: parsed.achievements || [],
          keywords: parsed.keywords || [],
          
          // Legacy fields for compatibility
          requirements: [...(parsed.coreRequirements || []), ...(parsed.preferredRequirements || [])],
          responsibilities: parsed.keyResponsibilities || [],
          analysis: 'comprehensive'
        };
        
        // Cache the successful analysis for consistency
        this._setCached(this.cache.jdAnalysis, analysisCacheKey, analysis);
        
        console.log('📋 [ADVANCED] Comprehensive analysis extracted:');
        console.log('📋 [ADVANCED] - Core requirements:', analysis.coreRequirements.length);
        console.log('📋 [ADVANCED] - Technical skills:', analysis.technicalSkills.length);
        console.log('📋 [ADVANCED] - Keywords:', analysis.keywords.length);
        return analysis;
      } catch {
        // Fallback to rule-based extraction
        console.log('📋 [ADVANCED] JSON parsing failed, using rule-based fallback');
        const fallbackAnalysis = this.extractRequirementsRuleBased(jobDescription);
        this._setCached(this.cache.jdAnalysis, analysisCacheKey, fallbackAnalysis);
        return fallbackAnalysis;
      }
    } catch (error) {
      console.warn('JD analysis failed, using fallback:', error);
      return this.extractRequirementsRuleBased(jobDescription);
    }
  }

  /**
   * Get rich professional narrative using RAG chat system
   * This leverages the existing, excellent RAG pipeline for detailed responses
   */
  async getRichRAGResponse(ragQuery, userId) {
    try {
      console.log('🤖 [RAG CHAT] Starting RAG query for professional narrative...');
      console.log('🤖 [RAG CHAT] Query length:', ragQuery.length, 'characters');
      
      // Check cache first
      const cacheKey = this._createCacheKey({ ragQuery, userId });
      let cachedResponse = this._getCached(this.cache.ragResponses, cacheKey);
      
      if (cachedResponse) {
        console.log('🤖 [RAG CHAT] Using cached RAG response');
        return cachedResponse;
      }

      // Import and use the existing RAG service
      const RAGService = (await import('./rag.js')).default;
      const ragService = new RAGService();
      
      // Get rich narrative response from RAG system
      const response = await ragService.processQuery(ragQuery, {
        userId: userId,
        maxTokens: 3000, // Allow for very detailed responses
        includeMetadata: false // We don't need retrieval metadata
      });

      console.log('🤖 [RAG CHAT] RAG response length:', response.length, 'characters');
      console.log('🤖 [RAG CHAT] First 200 chars:', response.substring(0, 200) + '...');
      
      // Cache the response
      this._setCached(this.cache.ragResponses, cacheKey, response);
      
      return response;
      
    } catch (error) {
      console.error('❌ [RAG CHAT] RAG query failed:', error);
      // Fallback to basic evidence retrieval
      console.log('🔄 [RAG CHAT] Falling back to evidence retrieval...');
      return this.getEnhancedEvidence({ requirements: ['project management experience'] }, userId);
    }
  }

  /**
   * Generate resume from rich RAG narrative (legacy method - now using RAG)
   */
  async getEnhancedEvidence(jdAnalysis, userId) {
    try {
      console.log('🔍 [ADVANCED] Starting enhanced evidence retrieval...');
      console.log('🔍 [ADVANCED] User ID for filtering:', userId);
      console.log('🔍 [ADVANCED] Requirements to search for:', jdAnalysis.requirements.length);
      console.log('🔍 [ADVANCED] JD Analysis keys:', Object.keys(jdAnalysis));
      
      const RetrievalService = (await import('./retrieval.js')).default;
      const retrieval = new RetrievalService();
      
      // Achievement-focused search strategy to find rich content
      const searchQueries = [
        // Achievement and results queries (prioritize quantified content)
        'achieved results metrics percentage improvement savings',
        'budget million revenue cost reduction efficiency',
        'led team managed scaled delivered implemented',
        'increased decreased improved reduced grew',
        // Core requirements with achievement context
        jdAnalysis.coreRequirements.slice(0, 2).join(' ') + ' achieved delivered',
        // Technical skills with outcome context  
        jdAnalysis.technicalSkills.slice(0, 3).join(' ') + ' implementation success',
        // Leadership with scale indicators
        jdAnalysis.softSkills.concat(['leadership', 'management']).join(' ') + ' team budget scope',
        // Industry expertise with business impact
        `${jdAnalysis.industry} transformation initiative project success`,
        // Experience level with quantified outcomes
        jdAnalysis.experienceYears + ' experience results achievements',
        // Job title focused on accomplishments  
        `${jdAnalysis.title} accomplishments delivered outcomes`,
      ].filter(query => query.trim().length > 0);

      console.log('🔍 [ADVANCED] Multi-query search strategy:', searchQueries.length, 'queries');

      // Execute multiple searches and combine results
      const allEvidence = [];
      
      for (const query of searchQueries) {
        try {
          const results = await retrieval.retrieveContext(query, {
            maxResults: 12, // Expanded results per query for comprehensive resume generation
            userFilter: userId,
            threshold: 0.15 // Much lower threshold to capture achievement-rich content
          });
          
          console.log(`🔍 [ADVANCED] Query "${query.substring(0, 50)}..." returned ${results.chunks.length} chunks`);
          
          // Add query context to each chunk
          results.chunks.forEach(chunk => {
            allEvidence.push({
              chunk: {
                id: chunk.id,
                text: chunk.content || chunk.title || '',
                meta: {
                  role: chunk.title,
                  skills: chunk.skills || [],
                  company: chunk.source_org,
                  startDate: chunk.date_start,
                  endDate: chunk.date_end,
                  queryContext: query.substring(0, 100) // Track what query found this
                }
              },
              score: chunk.similarity || 0.7,
              retrievalMethod: 'multi-query-enhanced',
              sourceQuery: query
            });
          });
        } catch (queryError) {
          console.warn(`🔍 [ADVANCED] Query "${query}" failed:`, queryError.message);
        }
      }

      // Deduplicate by ID and sort by relevance score
      const uniqueEvidence = Array.from(
        new Map(allEvidence.map(item => [item.chunk.id, item])).values()
      ).sort((a, b) => b.score - a.score).slice(0, 20); // Top 20 most relevant pieces for comprehensive resumes

      console.log('🔍 [ADVANCED] Final evidence count after dedup:', uniqueEvidence.length);
      console.log('🔍 [ADVANCED] Evidence score range:', 
        uniqueEvidence.length > 0 ? 
        `${uniqueEvidence[uniqueEvidence.length-1].score.toFixed(3)} - ${uniqueEvidence[0].score.toFixed(3)}` : 'none');

      if (uniqueEvidence.length === 0) {
        console.error('❌ [ADVANCED] No evidence retrieved! Check:');
        console.error('- User ID is correct:', userId);
        console.error('- Database has user data');
        console.error('- Search queries are meaningful:', searchQueries);
        throw new Error('No professional evidence found for user - cannot generate personalized resume');
      }

      return uniqueEvidence;
    } catch (error) {
      console.error('Enhanced evidence retrieval failed:', error);
      return [];
    }
  }

  /**
   * Generate sophisticated resume with intelligent token budgeting
   */
  async generateEnhancedResume(jdAnalysis, evidence) {
    try {
      console.log('🤖 [ADVANCED] Generating sophisticated resume with', evidence.length, 'pieces of evidence');
      console.log('🤖 [ADVANCED] Target role:', jdAnalysis.title, '(' + jdAnalysis.seniority + ' level)');
      
      if (evidence.length === 0) {
        throw new Error('No evidence found - cannot generate personalized resume without professional data');
      }

      // Smart token budgeting for 8192 context window - expanded for comprehensive resumes
      const maxContextTokens = 8192;
      const responseTokens = 3000; // Increased for comprehensive 2-page resume generation
      const systemPromptTokens = 800; // Estimated
      const availableTokens = maxContextTokens - responseTokens - systemPromptTokens - 200; // 200 buffer
      
      console.log('🧮 [TOKEN BUDGET] Available for evidence + user prompt:', availableTokens, 'tokens');
      
      // Prioritize and truncate evidence to fit expanded budget for comprehensive resumes
      const optimizedEvidence = this._optimizeEvidenceForTokenBudget(evidence, jdAnalysis, availableTokens * 0.75); // 75% for evidence (increased)
      const compactJDSummary = this._createCompactJDSummary(jdAnalysis, availableTokens * 0.25); // 25% for JD summary
      
      console.log('🧮 [TOKEN BUDGET] Using', optimizedEvidence.pieces, 'evidence pieces,', compactJDSummary.length, 'char JD summary');
      
      // Debug evidence quality
      console.log('🔍 [EVIDENCE DEBUG] First 3 evidence pieces:');
      const debugEvidence = optimizedEvidence.content.substring(0, 1000);
      console.log(debugEvidence);
      console.log('🔍 [EVIDENCE DEBUG] JD Summary:', compactJDSummary);
      
      // Strong, directive system prompt
      const systemPrompt = `You are creating a resume using ONLY the provided professional evidence. 

CRITICAL RULES:
- Use ONLY facts from the EVIDENCE section - no generic content or placeholders
- Output clean HTML with proper tags: <h1>, <h2>, <ul>, <li>, <p>, <strong>
- NO contact information - start directly with name as <h1>
- Transform evidence into quantified achievement bullets with metrics
- Use executive language appropriate for ${jdAnalysis.seniority}-level ${jdAnalysis.title}
- Every bullet point must contain specific numbers, results, or scope from evidence`;

      const userPrompt = `Create a ${jdAnalysis.title} resume using ONLY these evidence facts:

${optimizedEvidence.content}

Job requirements to address: ${compactJDSummary}

OUTPUT REQUIREMENTS:
1. <h1>Name only</h1>
2. <h2>Professional Summary</h2> - Executive paragraph highlighting leadership scope and industry impact
3. <h2>Professional Experience</h2> - Each role with quantified achievements from evidence
4. <h2>Core Competencies</h2> - Skills extracted from evidence

Use ONLY evidence provided. No placeholders, no generic content, no contact info.`;

      // Calculate cost estimation for enhanced resume generation
      const inputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const maxTokens = 3000;
      const estimatedCost = (inputTokens * CONFIG.ai.openai.modelInfo.inputCostPer1k / 1000) +
                           (maxTokens * CONFIG.ai.openai.modelInfo.outputCostPer1k / 1000);

      console.log(`🤖 [ADVANCED] Enhanced resume: ${CONFIG.ai.openai.model}, Est. cost: $${estimatedCost.toFixed(4)}, Tokens: ${inputTokens}→${maxTokens}`);

      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 3000, // Expanded for comprehensive resume generation
        temperature: 0.1
      });
      
      const generatedResume = response.choices[0]?.message?.content || '<h1>Resume Generation Failed</h1>';
      console.log('🤖 [ADVANCED] Generated resume length:', generatedResume.length, 'characters');
      
      return generatedResume;
    } catch (error) {
      console.error('Enhanced resume generation failed:', error);
      return '<h1>Resume Generation Failed</h1><p>Error: ' + error.message + '</p>';
    }
  }

  /**
   * Organize evidence strategically for resume generation
   */
  _organizeEvidenceForResume(evidence, jdAnalysis) {
    // Group evidence by company and role for better narrative flow
    const evidenceByRole = {};
    const achievements = [];
    const skills = new Set();

    evidence.forEach((item, index) => {
      const company = item.chunk.meta.company || 'Unknown Company';
      const role = item.chunk.meta.role || 'Professional Role';
      const key = `${company} - ${role}`;
      
      if (!evidenceByRole[key]) {
        evidenceByRole[key] = {
          company,
          role,
          startDate: item.chunk.meta.startDate,
          endDate: item.chunk.meta.endDate,
          evidence: [],
          relevanceScore: 0
        };
      }
      
      evidenceByRole[key].evidence.push({
        text: item.chunk.text,
        score: item.score,
        queryContext: item.chunk.meta.queryContext
      });
      evidenceByRole[key].relevanceScore += item.score;
      
      // Extract skills
      if (item.chunk.meta.skills) {
        item.chunk.meta.skills.forEach(skill => skills.add(skill));
      }
    });

    // Sort roles by relevance and format for prompt
    const sortedRoles = Object.values(evidenceByRole)
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    let organizedText = '';
    
    sortedRoles.forEach((roleGroup, index) => {
      organizedText += `\n=== ROLE ${index + 1}: ${roleGroup.role} at ${roleGroup.company} ===\n`;
      organizedText += `Timeline: ${roleGroup.startDate || 'Unknown'} - ${roleGroup.endDate || 'Unknown'}\n`;
      organizedText += `Evidence:\n`;
      
      roleGroup.evidence.forEach((evidence, evidenceIndex) => {
        organizedText += `${evidenceIndex + 1}. ${evidence.text}\n`;
        if (evidence.queryContext) {
          organizedText += `   (Relevant to: ${evidence.queryContext})\n`;
        }
      });
    });

    return organizedText;
  }

  /**
   * Optimize evidence for token budget - prioritize and truncate intelligently
   */
  _optimizeEvidenceForTokenBudget(evidence, jdAnalysis, maxTokens) {
    // Rough estimate: 4 characters = 1 token
    const maxChars = maxTokens * 4;
    
    // Score evidence by relevance and content quality
    const scoredEvidence = evidence.map(item => ({
      ...item,
      qualityScore: this._calculateEvidenceQuality(item, jdAnalysis),
      length: item.chunk.text.length
    })).sort((a, b) => b.qualityScore - a.qualityScore);

    let totalChars = 0;
    const selectedEvidence = [];
    
    for (const item of scoredEvidence) {
      if (totalChars + item.length < maxChars) {
        selectedEvidence.push(item);
        totalChars += item.length;
      } else {
        // Try to fit a truncated version of high-value evidence
        const remainingChars = maxChars - totalChars;
        if (remainingChars > 200 && item.qualityScore > 0.7) {
          const truncatedText = item.chunk.text.substring(0, remainingChars - 50) + '...';
          selectedEvidence.push({
            ...item,
            chunk: { ...item.chunk, text: truncatedText }
          });
        }
        break;
      }
    }

    // Format optimized evidence for maximum AI utility
    const content = selectedEvidence.map((item, i) => {
      const company = item.chunk.meta.company || 'Company';
      const role = item.chunk.meta.role || 'Role';
      const dates = item.chunk.meta.startDate && item.chunk.meta.endDate ? 
        `(${item.chunk.meta.startDate} - ${item.chunk.meta.endDate})` : '';
      
      return `ROLE ${i + 1}: ${role} at ${company} ${dates}
ACHIEVEMENT: ${item.chunk.text}
RELEVANCE SCORE: ${item.qualityScore.toFixed(2)}`;
    }).join('\n\n');

    console.log('🧮 [TOKEN BUDGET] Evidence optimization:', {
      original: evidence.length,
      selected: selectedEvidence.length,
      avgQuality: (selectedEvidence.reduce((sum, item) => sum + item.qualityScore, 0) / selectedEvidence.length).toFixed(2),
      totalChars: content.length
    });

    return {
      content,
      pieces: selectedEvidence.length,
      totalLength: content.length
    };
  }

  /**
   * Create compact JD summary for token efficiency
   */
  _createCompactJDSummary(jdAnalysis, maxTokens) {
    const maxChars = maxTokens * 4;
    
    const parts = [
      `Core: ${jdAnalysis.coreRequirements.slice(0, 3).join('; ')}`,
      `Tech: ${jdAnalysis.technicalSkills.slice(0, 5).join(', ')}`,
      `Skills: ${jdAnalysis.softSkills.slice(0, 3).join(', ')}`,
      `Experience: ${jdAnalysis.experienceYears}`,
      `Industry: ${jdAnalysis.industry}`
    ];

    let summary = parts.join(' | ');
    
    // Truncate if necessary
    if (summary.length > maxChars) {
      summary = summary.substring(0, maxChars - 3) + '...';
    }

    return summary;
  }

  /**
   * Calculate evidence quality score with heavy bias toward achievements
   */
  _calculateEvidenceQuality(item, jdAnalysis) {
    let score = item.score || 0.5; // Base similarity score
    const text = item.chunk.text.toLowerCase();
    
    // MAJOR boost for quantified achievements (multiple number patterns)
    if (/\$\d+[kmb]?|\d+[%$]|\d+x\s|\d+\+\s|[+-]\d+%|\d+\s*million|\d+\s*billion|\d+\s*percent/i.test(item.chunk.text)) {
      score += 0.4; // Major boost for money, percentages, multipliers
    }
    
    // Big boost for achievement verbs with numbers
    if (/(achieved|delivered|improved|increased|reduced|saved|grew|scaled|managed).*\d+/i.test(item.chunk.text)) {
      score += 0.3;
    }
    
    // Boost for leadership with scope indicators
    if (/lead.*team|\d+\s*(team|people|members)|budget.*\$|managed.*\d+/i.test(item.chunk.text)) {
      score += 0.25;
    }
    
    // Boost for business impact words
    if (/(revenue|profit|savings|efficiency|productivity|ROI|growth|transformation)/i.test(text)) {
      score += 0.2;
    }
    
    // Boost for project scale indicators
    if (/(global|enterprise|international|\$\d+M|\$\d+B|multi-year|large-scale)/i.test(item.chunk.text)) {
      score += 0.15;
    }
    
    // Boost for technical skills match
    const techSkillMatches = jdAnalysis.technicalSkills.filter(skill => 
      text.includes(skill.toLowerCase())
    ).length;
    score += techSkillMatches * 0.1;
    
    // PENALIZE generic job description language
    if (/(responsible for|duties include|job summary|position overview)/i.test(text)) {
      score -= 0.3;
    }
    
    // Penalize very short or very generic evidence
    if (item.chunk.text.length < 100 || 
        /(manage|lead|work|responsible)/i.test(text) && !/\d/.test(text)) {
      score -= 0.2;
    }
    
    return Math.min(score, 1.2); // Allow scores above 1.0 for exceptional content
  }

  /**
   * Create smart coverage report from keyword analysis (replaces literal string matching)
   */
  createSmartCoverage(jobKeywords, resumeText) {
    const resumeLower = resumeText.toLowerCase();
    const allKeywords = [
      ...jobKeywords.technical.map(k => ({ keyword: k, category: 'Technical' })),
      ...jobKeywords.soft.map(k => ({ keyword: k, category: 'Soft Skill' }))
    ];

    console.log(`📊 [ADVANCED] Creating smart coverage for ${allKeywords.length} keywords`);

    return allKeywords.map(({ keyword, category }) => {
      const present = resumeLower.includes(keyword.toLowerCase());
      const evidenceCount = present ? 1 : 0; // Could be enhanced to count multiple mentions
      
      return {
        requirement: `${category}: ${keyword}`,
        covered: present,
        evidenceCount,
        category
      };
    });
  }

  /**
   * Calculate requirement coverage (legacy - kept for compatibility)
   */
  calculateCoverage(requirements, resumeText) {
    const resumeLower = resumeText.toLowerCase();
    
    return requirements.map(req => ({
      mustHave: req,
      present: resumeLower.includes(req.toLowerCase()),
      evidenceIds: [] // Simplified for demo
    }));
  }

  /**
   * Rule-based requirement extraction fallback
   */
  extractRequirementsRuleBased(jobDescription) {
    const text = jobDescription.toLowerCase();
    const requirements = [];
    
    // Look for common requirement patterns
    const patterns = [
      /(?:must have|required?|essential).{0,50}(javascript|python|react|node|aws|docker|sql)/gi,
      /(\d+\+?\s*years?).{0,20}(experience|exp)/gi,
      /(bachelor|master|degree)/gi
    ];

    patterns.forEach(pattern => {
      const matches = jobDescription.match(pattern) || [];
      requirements.push(...matches.slice(0, 3));
    });

    return {
      requirements: requirements.slice(0, 8),
      responsibilities: [],
      title: 'Position',
      analysis: 'rule-based'
    };
  }

  /**
   * Extract keywords from requirements for compatibility (deprecated - now using extractKeywords from job description)
   */
  extractKeywordsFromRequirements(requirements) {
    const technical = new Set();
    const soft = new Set();

    requirements.forEach(req => {
      const reqLower = req.toLowerCase();
      if (this.isTechnicalSkill(reqLower)) {
        technical.add(reqLower);
      } else {
        soft.add(reqLower);
      }
    });

    return {
      technical: Array.from(technical),
      soft: Array.from(soft),
      other: []
    };
  }

  /**
   * Extract keywords from coverage report for compatibility
   */
  extractKeywordsFromCoverage(coverageReport) {
    const technical = new Set();
    const soft = new Set();

    coverageReport.forEach(item => {
      if (item.present) {
        const requirement = item.mustHave.toLowerCase();
        
        // Simple categorization
        if (this.isTechnicalSkill(requirement)) {
          technical.add(requirement);
        } else {
          soft.add(requirement);
        }
      }
    });

    return {
      technical: Array.from(technical),
      soft: Array.from(soft),
      other: []
    };
  }

  /**
   * Calculate match score using smart keyword matching (copied from regular system)
   */
  calculateMatchScore(jobKeywords, resumeHTML) {
    const allJobKeywords = [
      ...jobKeywords.technical,
      ...jobKeywords.soft,
      ...jobKeywords.other
    ];

    if (allJobKeywords.length === 0) return 0;

    const resumeText = resumeHTML.toLowerCase();
    const matchedKeywords = allJobKeywords.filter(keyword => 
      resumeText.includes(keyword.toLowerCase())
    );

    console.log(`🎯 [ADVANCED] Keyword match: ${matchedKeywords.length}/${allJobKeywords.length}`);
    console.log(`🎯 [ADVANCED] Matched keywords:`, matchedKeywords);

    return Math.round((matchedKeywords.length / allJobKeywords.length) * 100);
  }

  /**
   * Calculate match score from coverage report (legacy method for compatibility)
   */
  calculateMatchScoreFromCoverage(coverageReport) {
    if (coverageReport.length === 0) return 0;
    
    const coveredCount = coverageReport.filter(item => item.present).length;
    return Math.round((coveredCount / coverageReport.length) * 100);
  }

  /**
   * Simple technical skill detection
   */
  isTechnicalSkill(skill) {
    const technicalKeywords = [
      'javascript', 'python', 'java', 'react', 'node', 'aws', 'docker',
      'kubernetes', 'sql', 'database', 'api', 'git', 'linux', 'cloud',
      'devops', 'ci/cd', 'microservices', 'mongodb', 'postgresql'
    ];
    
    return technicalKeywords.some(keyword => skill.includes(keyword));
  }

  /**
   * Validate generation options
   */
  validateOptions(jobDescription, options = {}) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    if (!jobDescription || jobDescription.trim().length < 100) {
      validation.isValid = false;
      validation.errors.push('Job description should be at least 100 characters for optimal results');
    }

    if (jobDescription && jobDescription.length > 5000) {
      validation.warnings.push('Very long job description - processing may take longer');
    }

    if (jobDescription && jobDescription.length < 200) {
      validation.recommendations.push('Longer job descriptions enable better requirement extraction and matching');
    }

    return validation;
  }

  /**
   * Analyze narrative text for examples, metrics, and specific achievements
   */
  analyzeNarrativeEvidence(narrative) {
    if (!narrative || narrative.length === 0) {
      return {
        hasQuantifiableMetrics: false,
        hasSpecificProjects: false,
        hasSpecificTechnologies: false,
        hasLeadershipMetrics: false,
        summary: 'No narrative available',
        metrics: [],
        projects: [],
        technologies: []
      };
    }

    const metrics = [];
    const projects = [];
    const technologies = [];

    // Extract quantifiable metrics
    const metricPatterns = [
      /\d+[%]/g, // percentages like 90%, 115%
      /\$\d+[kmb]?/gi, // dollar amounts like $1M, $500K
      /\d+\s*(million|billion|thousand)/gi, // written numbers
      /\d+x\s/gi, // multipliers like 3x
      /\d+\s*(months?|years?|weeks?)/gi, // time periods
      /\d+\s*(team|people|members|employees)/gi, // team sizes
      /reduced.*by.*\d+/gi, // reduction metrics
      /increased.*by.*\d+/gi, // increase metrics
      /improved.*by.*\d+/gi, // improvement metrics
      /saved.*\$?\d+/gi, // savings
      /revenue.*\$?\d+/gi, // revenue
      /budget.*\$?\d+/gi, // budget
    ];

    metricPatterns.forEach(pattern => {
      const matches = narrative.match(pattern);
      if (matches) {
        metrics.push(...matches.map(match => match.trim()));
      }
    });

    // Extract specific projects/initiatives
    const projectPatterns = [
      /project\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
      /initiative\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
      /program\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
      /system\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
      /platform\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
      /transformation\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi
    ];

    projectPatterns.forEach(pattern => {
      const matches = narrative.match(pattern);
      if (matches) {
        projects.push(...matches.map(match => match.trim()));
      }
    });

    // Extract specific technologies
    const techPatterns = [
      /\b(AWS|Azure|GCP|Docker|Kubernetes|React|Node\.?js|Python|Java|JavaScript|TypeScript)\b/gi,
      /\b(SQL|MongoDB|PostgreSQL|Redis|Elasticsearch)\b/gi,
      /\b(Jenkins|GitHub\s*Actions|CI\/CD|Terraform|Ansible)\b/gi,
      /\b(Agile|Scrum|Kanban|JIRA|Confluence)\b/gi,
      /\b(SAP|Oracle|Salesforce|SharePoint|PowerBI)\b/gi,
      /\b(PMI|PMP|ITIL|Six\s*Sigma|Lean)\b/gi
    ];

    techPatterns.forEach(pattern => {
      const matches = narrative.match(pattern);
      if (matches) {
        technologies.push(...matches.map(match => match.trim()));
      }
    });

    // Deduplicate arrays
    const uniqueMetrics = [...new Set(metrics)];
    const uniqueProjects = [...new Set(projects)];
    const uniqueTechnologies = [...new Set(technologies)];

    // Check for leadership-specific metrics
    const hasLeadershipMetrics = narrative.toLowerCase().includes('team') ||
                                narrative.toLowerCase().includes('budget') ||
                                narrative.toLowerCase().includes('managed') ||
                                narrative.toLowerCase().includes('led') ||
                                uniqueMetrics.some(m => m.includes('team') || m.includes('people'));

    const analysis = {
      hasQuantifiableMetrics: uniqueMetrics.length > 0,
      hasSpecificProjects: uniqueProjects.length > 0,
      hasSpecificTechnologies: uniqueTechnologies.length > 0,
      hasLeadershipMetrics: hasLeadershipMetrics,
      metrics: uniqueMetrics,
      projects: uniqueProjects,
      technologies: uniqueTechnologies,
      summary: this.generateNarrativeEvidenceSummary(uniqueMetrics, uniqueProjects, uniqueTechnologies, hasLeadershipMetrics)
    };

    console.log(`📊 [ADVANCED] Narrative Evidence Analysis: ${JSON.stringify(analysis, null, 2)}`);
    return analysis;
  }

  /**
   * Generate a summary of available evidence from narrative
   */
  generateNarrativeEvidenceSummary(metrics, projects, technologies, hasLeadershipMetrics) {
    const parts = [];

    if (metrics.length > 0) {
      parts.push(`${metrics.length} quantifiable metrics found`);
    }
    if (projects.length > 0) {
      parts.push(`${projects.length} specific projects/initiatives identified`);
    }
    if (technologies.length > 0) {
      parts.push(`${technologies.length} technologies mentioned`);
    }
    if (hasLeadershipMetrics) {
      parts.push('leadership/management evidence detected');
    }

    return parts.length > 0 ? parts.join('; ') : 'Limited specific evidence in narrative';
  }

  /**
   * Get rich RAG response using JD summary for targeted queries
   */
  async getRichRAGResponse(jdSummary, userId) {
    try {
      console.log(`🎯 [ADVANCED RAG] Querying RAG with ${jdSummary.queries.length} targeted queries`);
      
      // Use the JD summarization service to create an optimized RAG query (now async with 2-stage compression)
      const ragQuery = await this.jdSummarizer.createRAGQuery(jdSummary);
      
      console.log(`🎯 [ADVANCED RAG] RAG query length: ${ragQuery.length} characters`);
      console.log(`🎯 [ADVANCED RAG] Full RAG query:`, ragQuery);
      
      // Import and use RAG service directly instead of HTTP call
      const RAGService = (await import('../services/rag.js')).default;
      const ragService = new RAGService();
      
      console.log('🎯 [ADVANCED RAG] Using direct RAG service integration');
      
      const ragResult = await ragService.answerQuestion(ragQuery, {
        maxChunks: 8, // Expanded chunks for comprehensive resume generation
        includeMetadata: true,
        maxTokens: 2500, // Expanded for comprehensive resume generation
        userFilter: userId // Pass the user ID for proper content filtering
      });
      
      console.log(`✅ [ADVANCED RAG] Retrieved rich context:`, {
        responseLength: ragResult.response?.length || 0,
        sourcesFound: ragResult.sources?.length || 0
      });
      
      return {
        narrative: ragResult.response || '',
        sources: ragResult.sources || [],
        originalQuery: ragQuery,
        compressionRatio: jdSummary.compressionRatio,
        queriesUsed: jdSummary.queries
      };
      
    } catch (error) {
      console.error('❌ [ADVANCED RAG] RAG request failed:', error);
      throw new Error(`RAG retrieval failed: ${error.message}`);
    }
  }

  /**
   * Generate structured resume HTML from RAG narrative response
   */
  async generateResumeFromNarrative(ragResponse, jobDescription, jdAnalysis, options = {}) {
    try {
      console.log(`📝 [NARRATIVE→RESUME] Converting ${ragResponse.narrative.length} chars to resume format`);

      // Add debugging to see narrative utilization
      console.log(`🔍 Narrative used (first 500 chars): ${ragResponse.narrative.substring(0, 500)}...`);
      console.log(`📊 Total narrative length: ${ragResponse.narrative.length} characters`);
      console.log(`📊 Source count: ${ragResponse.sources.length} sources`);
      
      // Analyze the RAG response narrative for examples and metrics
      const evidenceAnalysis = this.analyzeNarrativeEvidence(ragResponse.narrative);

      const systemPrompt = `Professional resume writer creating comprehensive, executive-level resumes.

CRITICAL ANTI-FABRICATION RULES:
- Use ONLY information that exists in the provided narrative
- NEVER invent, estimate, or fabricate any metrics, percentages, dollar amounts, or quantifiable results
- NEVER invent specific project names, initiatives, or accomplishments not in narrative
- NEVER add time frames, percentages, team sizes, or cost savings not explicitly provided
- If no specific achievements exist for a role, use only generic role responsibilities
- When narrative lacks metrics, write impact statements WITHOUT numbers

REQUIREMENTS:
- Generate 1,500-2,000 words using the provided narrative and evidence
- Create 5-7 compelling bullets per role, prioritizing evidence-based achievements
${evidenceAnalysis.hasQuantifiableMetrics ? '- FEATURE quantifiable results prominently (percentages, costs, revenue, team sizes, etc.)' : ''}
${evidenceAnalysis.hasSpecificProjects ? '- HIGHLIGHT specific projects and initiatives mentioned in narrative' : ''}
${evidenceAnalysis.hasSpecificTechnologies ? '- EMPHASIZE specific technologies and methodologies from narrative' : ''}

EVIDENCE-BASED ENHANCEMENT PRIORITY:
1. Specific achievements with metrics (highest priority)
2. Named projects, initiatives, and technologies
3. Leadership scope and team sizes
4. Business impact and outcomes
5. Skills and certifications mentioned
6. Industry context and professional progression

NARRATIVE USAGE:
- Transform narrative content into polished professional statements using ONLY provided information
- Use sophisticated vocabulary while staying completely truthful to the source material
- Show career progression using only documented information
- Emphasize leadership and impact using ONLY evidence-based examples
- Use ONLY metrics that exist in narrative - never invent quantifiable results

STRUCTURE:
- Professional Summary: Executive-level positioning statement
- Core Competencies: Leadership and technical skills from narrative
- Professional Experience: Achievement-focused executive bullets with metrics
- Focus on strategic value delivered and organizational impact

Evidence Analysis: ${evidenceAnalysis.summary}
OUTPUT FORMAT: Clean HTML presenting a compelling executive resume based on provided narrative content.`;

      const userPrompt = `Based on this narrative about Scott's professional experience, create a tailored resume for this specific job opportunity:

JOB DESCRIPTION:
${jobDescription.substring(0, 1000)}${jobDescription.length > 1000 ? '...' : ''}

SCOTT'S RELEVANT EXPERIENCE NARRATIVE:
${ragResponse.narrative}

Convert this narrative into a structured, ATS-optimized resume in HTML format. Focus on the most relevant experience and achievements that match the job requirements. Ensure the resume showcases quantified results and leadership impact.`;

      // Calculate cost estimation for narrative conversion
      const inputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
      const maxTokens = 3000;
      const estimatedCost = (inputTokens * CONFIG.ai.openai.modelInfo.inputCostPer1k / 1000) +
                           (maxTokens * CONFIG.ai.openai.modelInfo.outputCostPer1k / 1000);

      console.log(`🤖 [ADVANCED] Narrative→Resume: ${CONFIG.ai.openai.model}, Est. cost: $${estimatedCost.toFixed(4)}, Tokens: ${inputTokens}→${maxTokens}`);

      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 3000, // Expanded for comprehensive, 2-page resume generation
        temperature: 0.1 // Slightly creative but consistent
      });

      const resumeHTML = response.choices[0]?.message?.content || '';
      
      if (!resumeHTML || resumeHTML.length < 200) {
        throw new Error('Generated resume content is too short or empty');
      }

      console.log(`✅ [NARRATIVE→RESUME] Generated resume: ${resumeHTML.length} characters`);

      // Extract keywords from the generated resume for match scoring
      const jobKeywords = extractKeywords(jobDescription);
      const matchScore = this.calculateMatchScore(jobKeywords, resumeHTML);
      
      // Create smart coverage report
      const coverageReport = this.createSmartCoverage(jobKeywords, resumeHTML);
      const coveragePercent = coverageReport.length > 0 ? 
        coverageReport.filter(item => item.covered).length / coverageReport.length : 0;

      return {
        success: true,
        resumeHTML: resumeHTML,
        matchScore: matchScore,
        extractedKeywords: jobKeywords,
        sourceData: {
          ragNarrative: ragResponse.narrative.length,
          ragSources: ragResponse.sources.length,
          originalQueries: ragResponse.queriesUsed.length,
          compressionRatio: ragResponse.compressionRatio,
          advancedPipeline: true,
          pipelineType: 'JD Summary → RAG Chat → Resume Generation',
          coverageReport: coverageReport,
          coveragePercent: coveragePercent,
          tokenOptimization: true,
          enhancedRetrieval: true
        }
      };

    } catch (error) {
      console.error('❌ [NARRATIVE→RESUME] Conversion failed:', error);
      throw new Error(`Resume generation from narrative failed: ${error.message}`);
    }
  }

  /**
   * Get user ID from request (helper method)
   */
  static getUserIdFromRequest(req) {
    if (req.user && req.user.id) {
      return req.user.id;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.warn('No authenticated user found in request');
      return null;
    }
    
    throw new Error('User not authenticated');
  }
}

export default AdvancedResumeGenerationService;