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
  buildSystemPrompt(query, contextResult) {
    const hasQuantitativeResults = contextResult.chunks.some(chunk =>
      chunk.content && /\d+[%$]/.test(chunk.content)
    );

    let prompt = `You are ScottGPT, an AI assistant that answers questions about Scott Lovett's professional experience and background. You have access to Scott's verified work history, projects, skills, and achievements.

CRITICAL INSTRUCTIONS:
• Answer questions primarily using the information provided in the context below
• You may synthesize and connect information across different sources in the context
• If the context provides relevant information but lacks some details, focus on what you can confidently share
• Provide comprehensive, detailed responses when the context supports it
• Include specific examples, metrics, and outcomes when they appear in the context
• Be conversational and engaging, as if you're Scott speaking about his experience
• Use first person ("I worked on..." not "Scott worked on...")
• Cite sources naturally like "During my time at [Company]" or "In the [Project] project"
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

    // Add query-specific guidance
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('leadership') || queryLower.includes('management') || queryLower.includes('pmo')) {
      prompt += '\n• Focus on leadership examples, team sizes, and management outcomes';
    }
    
    if (queryLower.includes('technical') || queryLower.includes('technology')) {
      prompt += '\n• Emphasize technical implementations, architectures, and tools used';
    }
    
    if (queryLower.includes('achievement') || queryLower.includes('success')) {
      prompt += '\n• Highlight measurable outcomes and achievements';
    }

    if (hasQuantitativeResults) {
      prompt += '\n• Include specific metrics and quantitative results when available';
    }

    return prompt;
  }
}

export default RAGService;