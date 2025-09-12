import RetrievalService from './retrieval.js';
import OpenAI from 'openai';
import CONFIG from '../config/app-config.js';

/**
 * Clean, minimal RAG service
 * Vector search only - no fallbacks
 */
class RAGService {
  constructor() {
    this.retrieval = new RetrievalService();
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
    this.model = CONFIG.ai.openai.model;
  }

  /**
   * Answer question using RAG pipeline
   */
  async answerQuestion(query, options = {}) {
    const {
      maxContextChunks = 12, // Increased for richer context
      userFilter = null,
      temperature = 0.7,
      maxTokens = 2500 // Increased for detailed responses like original
    } = options;

    console.log(`🤖 RAG Query: "${query.substring(0, 50)}..."`);
    const startTime = Date.now();

    try {
      // 1. Retrieve context using vector search only
      const contextResult = await this.retrieval.retrieveContext(query, {
        maxResults: maxContextChunks,
        userFilter: userFilter
      });

      console.log(`📊 Retrieved ${contextResult.chunks.length} chunks (avg similarity: ${contextResult.avgSimilarity.toFixed(3)})`);

      // 2. Build context for OpenAI
      const contextText = this.buildContext(contextResult.chunks);
      
      // 3. Generate response with rich system prompt
      const systemPrompt = this.buildSystemPrompt(query, contextResult);
      const messages = [
        {
          role: 'system',
          content: `${systemPrompt}

Context:
${contextText}`
        },
        {
          role: 'user',
          content: query
        }
      ];

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens
      });

      const answer = response.choices[0].message.content;
      const processingTime = Date.now() - startTime;

      console.log(`✅ Generated response in ${processingTime}ms`);

      return {
        answer: answer,
        confidence: contextResult.avgSimilarity > 0.4 ? 'high' : contextResult.avgSimilarity > 0.3 ? 'medium' : 'low',
        sources: contextResult.chunks.map(chunk => ({
          title: chunk.title,
          org: chunk.source_org,
          type: chunk.source_type,
          similarity: chunk.similarity
        })),
        performance: {
          processingTime: processingTime,
          chunksUsed: contextResult.chunks.length,
          avgSimilarity: contextResult.avgSimilarity,
          searchMethod: 'vector'
        }
      };

    } catch (error) {
      console.error('❌ RAG pipeline failed:', error.message);
      throw error; // Fail fast - no fallbacks
    }
  }

  /**
   * Build rich context text from chunks - restored from original
   */
  buildContext(chunks) {
    return chunks.map((chunk, index) => {
      const sourceInfo = `[Source: ${chunk.source_title || chunk.title}${chunk.source_org ? ` at ${chunk.source_org}` : ''}]`;
      const dateInfo = chunk.date_start || chunk.date_end ? 
        `[${chunk.date_start || ''}${chunk.date_start && chunk.date_end ? ' - ' : ''}${chunk.date_end || ''}]` : '';
      
      return `Context ${index + 1}: ${sourceInfo} ${dateInfo}\n${chunk.content}\n`;
    }).join('\n---\n\n');
  }

  /**
   * Build detailed system prompt - restored from original
   */
  buildSystemPrompt(query, contextResult, userFilter = null) {
    const hasQuantitativeResults = contextResult.chunks.some(chunk =>
      chunk.content && /\d+[%$]/.test(chunk.content)
    );

    // Get user context for personalized prompts - simplified for now
    const userName = 'the professional';
    const siteName = 'ScottGPT';
    
    let prompt = `You are ${siteName}, an AI assistant that answers questions about ${userName}'s professional experience and background. You have access to ${userName}'s verified work history, projects, skills, and achievements.

CRITICAL INSTRUCTIONS:
• Answer questions primarily using the information provided in the context below
• UTILIZE ALL AVAILABLE DETAILS from the context - if rich descriptive content is provided, use it fully
• You may synthesize and connect information across different sources in the context
• When context contains detailed role descriptions, achievements, and specific information, include those details
• Provide comprehensive, detailed responses that match the richness of the context provided
• Include specific examples, projects, metrics, outcomes, and achievements when they appear in the context
• Be conversational and engaging, as if you're the professional speaking about their experience
• Use first person ("I worked on..." not "${userName} worked on...")
• Cite sources naturally like "During my time at [Company]" or "In the [Project] project"
• Extract and present concrete details: locations, timeframes, specific projects, technologies, and measurable results
• Focus on what IS in the context and make meaningful connections between related information

CRITICAL FORMATTING REQUIREMENTS - MUST FOLLOW EXACTLY:
• ALWAYS use double line breaks (\\n\\n) between paragraphs - this is MANDATORY
• NEVER write more than 3-4 sentences in a single paragraph
• Start each new company/role discussion in a NEW paragraph
• Use this EXACT structure:

[Brief overview paragraph]

[Current role paragraph with specific details]

[Previous role paragraph with achievements] 

[Earlier experience paragraph]

[Summary paragraph]

• When listing achievements, use bullet points with proper line breaks:
  - Achievement 1
  - Achievement 2  
  - Achievement 3

EXAMPLE FORMAT (follow this pattern exactly):
"I have extensive PMO experience across multiple industries.

At [Current Company], I serve as [Role]. Here I [specific responsibilities and achievements].

Previously at [Previous Company], I [specific role and accomplishments]. Key achievements included [specific metrics].

Earlier in my career at [Earlier Company], I [role and key contributions].

Overall, my PMO experience demonstrates [summary of key strengths]."`; // Fixed missing closing backtick

    // Dynamic query guidance based on retrieved content characteristics
    const dynamicGuidance = this.generateDynamicGuidance(query, contextResult.chunks);
    prompt += dynamicGuidance;

    if (hasQuantitativeResults) {
      prompt += '\n• Include specific metrics and quantitative results when available';
    }

    return prompt;
  }

  /**
   * Generate dynamic query guidance based on content analysis
   */
  generateDynamicGuidance(query, chunks) {
    let guidance = '';
    
    // Analyze query characteristics
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);
    
    // Analyze chunk characteristics
    const contentAnalysis = this.analyzeChunks(chunks);
    
    // Basic query type guidance
    if (queryLower.includes('leadership') || queryLower.includes('management') || queryLower.includes('pmo')) {
      guidance += '\n• Focus on leadership examples, team sizes, and management outcomes';
    }
    
    if (queryLower.includes('technical') || queryLower.includes('technology')) {
      guidance += '\n• Emphasize technical implementations, architectures, and tools used';
    }
    
    if (queryLower.includes('achievement') || queryLower.includes('success')) {
      guidance += '\n• Highlight measurable outcomes and achievements';
    }
    
    // Dynamic guidance based on content analysis
    if (contentAnalysis.isProgram) {
      guidance += `
• This content contains structured program/development experience - provide comprehensive coverage
• Explain the program structure, duration, and overall purpose
• Detail each role/rotation within the program with specific responsibilities and achievements  
• Include concrete examples of projects, challenges, and skills gained across different positions
• Mention specific locations, timeframes, and measurable outcomes from the context
• Connect different roles to show career progression and learning path within the program
• Use all available details from the context about different roles and experiences`;
    }
    
    if (contentAnalysis.hasMultipleRoles) {
      guidance += '\n• Multiple roles detected - show progression and connections between different positions';
    }
    
    if (contentAnalysis.hasRotations) {
      guidance += '\n• Rotational experience detected - explain how different rotations contributed to overall development';
    }
    
    if (contentAnalysis.hasSpecificProjects) {
      guidance += '\n• Specific projects mentioned - include detailed project descriptions and outcomes';
    }
    
    if (contentAnalysis.hasLocationChanges) {
      guidance += '\n• Multiple locations detected - mention geographic scope and location-specific experiences';
    }
    
    if (contentAnalysis.hasSkillProgression) {
      guidance += '\n• Skill development apparent - highlight how skills evolved across different roles';
    }
    
    if (contentAnalysis.hasIndustryContext) {
      guidance += '\n• Industry-specific context available - include relevant industry background and implications';
    }
    
    return guidance;
  }

  /**
   * Analyze chunks to determine content characteristics
   */
  analyzeChunks(chunks) {
    const analysis = {
      isProgram: false,
      hasMultipleRoles: false,
      hasRotations: false,
      hasSpecificProjects: false,
      hasLocationChanges: false,
      hasSkillProgression: false,
      hasIndustryContext: false
    };
    
    if (chunks.length === 0) return analysis;
    
    // Combine all content for analysis
    const allContent = chunks.map(chunk => chunk.content?.toLowerCase() || '').join(' ');
    const allTitles = chunks.map(chunk => chunk.title?.toLowerCase() || '').join(' ');
    const allTags = chunks.flatMap(chunk => chunk.tags || []).map(tag => tag.toLowerCase());
    
    // Program detection - look for program-like patterns
    const programKeywords = [
      'program', 'development program', 'leadership development', 'rotation', 'rotations',
      'participant', 'fellowship', 'training program', 'internship program', 'graduate program'
    ];
    
    const rotationKeywords = [
      'rotation', 'rotations', 'rotated', 'assignment', 'assignments', 
      'various roles', 'different roles', 'multiple roles', 'positions'
    ];
    
    const projectKeywords = [
      'project', 'projects', 'initiative', 'initiatives', 'built', 'developed', 
      'created', 'implemented', 'managed', 'led', 'delivered'
    ];
    
    // Check for program characteristics
    analysis.isProgram = programKeywords.some(keyword => 
      allContent.includes(keyword) || allTitles.includes(keyword)
    );
    
    analysis.hasRotations = rotationKeywords.some(keyword => 
      allContent.includes(keyword)
    );
    
    analysis.hasSpecificProjects = projectKeywords.some(keyword => 
      allContent.includes(keyword)
    ) && (allContent.match(/\b(project|built|developed|created|implemented)\b/g) || []).length > 2;
    
    // Multiple roles detection
    analysis.hasMultipleRoles = chunks.length > 1 || 
      allContent.includes('various roles') || 
      allContent.includes('different positions') ||
      allContent.includes('multiple roles');
    
    // Location changes detection
    const locations = chunks.map(chunk => chunk.location).filter(loc => loc && loc !== 'null');
    analysis.hasLocationChanges = new Set(locations).size > 1;
    
    // Skills progression detection
    const allSkills = chunks.flatMap(chunk => chunk.skills || []);
    analysis.hasSkillProgression = allSkills.length > 3 || 
      allContent.includes('learned') || 
      allContent.includes('gained') ||
      allContent.includes('developed skills');
    
    // Industry context detection
    analysis.hasIndustryContext = allTags.length > 0 || 
      chunks.some(chunk => chunk.source_org) ||
      programKeywords.some(keyword => allContent.includes(keyword));
    
    return analysis;
  }

  /**
   * Get user's display name for personalized prompts
   */
  async getUserName(userId) {
    try {
      const { supabase } = await import('../config/database.js');
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('display_name, full_name')
        .eq('id', userId)
        .single();
      
      if (profile) {
        return profile.display_name || profile.full_name || 'the professional';
      }
      return 'the professional';
    } catch (error) {
      console.warn('Failed to get user name:', error);
      return 'the professional';
    }
  }
}

export default RAGService;