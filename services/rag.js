import RetrievalService from './retrieval.js';
import OpenAI from 'openai';

class RAGService {
  constructor() {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment variables');
    }
    
    this.retrieval = new RetrievalService();
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.model = 'gpt-4o-mini'; // Cost-effective model for production
  }

  /**
   * Answer a question using RAG pipeline
   * @param {string} query - User question
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - Answer with context and metadata
   */
  async answerQuestion(query, options = {}) {
    try {
      const {
        maxContextChunks = 8,
        includeContext = false,
        conversationHistory = [],
        temperature = 0.3,
        maxTokens = 500
      } = options;

      console.log(`🤖 Answering question: "${query}"`);
      const startTime = Date.now();

      // Step 1: Retrieve relevant context
      const contextResult = await this.retrieval.retrieveContext(query, {
        maxResults: maxContextChunks,
        includeMetadata: true,
        rerankResults: true
      });

      console.log(`⏱️  Context retrieved in ${Date.now() - startTime}ms`);

      if (contextResult.chunks.length === 0) {
        return {
          answer: 'I don\'t have any information about that topic in my knowledge base. This could mean:\n\n• The information hasn\'t been uploaded yet\n• Try rephrasing your question\n• The topic might be outside of Scott\'s documented experience\n\nFeel free to ask about Scott\'s work in cybersecurity, AI/ML, program management, or specific companies and projects!',
          confidence: 'low',
          sources: [],
          contextUsed: contextResult,
          processingTime: Date.now() - startTime,
          reasoning: 'No relevant context found in knowledge base'
        };
      }

      // Step 2: Build context for the LLM
      const contextText = this.buildContextText(contextResult.chunks);
      console.log(`📄 Built context: ${contextText.length} characters`);

      // Step 3: Generate system prompt
      const systemPrompt = this.buildSystemPrompt(query, contextResult);

      // Step 4: Build conversation with context
      const messages = this.buildMessages(systemPrompt, query, contextText, conversationHistory);

      // Step 5: Generate answer
      console.log('🔮 Generating answer...');
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        messages: messages,
        temperature: temperature,
        max_tokens: maxTokens,
        presence_penalty: 0.1,  // Encourage diverse vocabulary
        frequency_penalty: 0.1  // Reduce repetition
      });

      const answer = completion.choices[0].message.content;
      const tokensUsed = completion.usage?.total_tokens || 0;

      // Step 6: Post-process and analyze answer
      const confidence = this.calculateAnswerConfidence(contextResult, answer);
      const reasoning = this.generateReasoning(contextResult, answer);
      
      console.log(`✅ Answer generated in ${Date.now() - startTime}ms (${tokensUsed} tokens)`);

      return {
        answer: answer.trim(),
        confidence,
        sources: contextResult.sources,
        contextUsed: includeContext ? contextResult : undefined,
        processingTime: Date.now() - startTime,
        tokensUsed,
        reasoning,
        avgSimilarity: contextResult.avgSimilarity,
        totalChunksFound: contextResult.totalFound
      };

    } catch (error) {
      console.error('RAG answer generation error:', error);
      
      // Provide helpful error messages
      if (error.message.includes('rate limit')) {
        throw new Error('Service temporarily unavailable due to high demand. Please try again in a moment.');
      } else if (error.message.includes('API key')) {
        throw new Error('Service configuration error. Please contact support.');
      } else {
        throw new Error(`Failed to generate answer: ${error.message}`);
      }
    }
  }

  /**
   * Build context text from chunks
   * @param {Array} chunks - Retrieved chunks
   * @returns {string} - Formatted context
   */
  buildContextText(chunks) {
    return chunks.map((chunk, index) => {
      const sourceInfo = `[Source: ${chunk.source_title}${chunk.source_org ? ` at ${chunk.source_org}` : ''}]`;
      const dateInfo = chunk.displayDateRange ? `[${chunk.displayDateRange}]` : '';
      
      return `Context ${index + 1}: ${sourceInfo} ${dateInfo}\n${chunk.content}\n`;
    }).join('\n---\n\n');
  }

  /**
   * Build system prompt based on query and context
   * @param {string} query - User query
   * @param {Object} contextResult - Context retrieval result
   * @returns {string} - System prompt
   */
  buildSystemPrompt(query, contextResult) {
    const hasRecentWork = contextResult.chunks.some(chunk => 
      chunk.recency_score && chunk.recency_score > 0.7
    );
    
    const hasQuantitativeResults = contextResult.chunks.some(chunk =>
      chunk.content && /\d+[%$]/.test(chunk.content)
    );

    let prompt = `You are ScottGPT, an AI assistant that answers questions about Scott Lovett's professional experience and background. You have access to Scott's verified work history, projects, skills, and achievements.

INSTRUCTIONS:
• Answer questions accurately using ONLY the provided context
• Be conversational and engaging, as if you're Scott speaking about his experience
• Include specific details, metrics, and outcomes when available
• Cite sources naturally in your response like "During my time at [Company]" or "In the [Project] project"
• If the context doesn't contain enough information, acknowledge the limitation
• Use first person ("I worked on..." not "Scott worked on...")
• Be confident about verified information but honest about limitations`;

    // Add query-specific guidance
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('leadership') || queryLower.includes('management')) {
      prompt += '\n• Focus on leadership examples, team sizes, and management outcomes';
    }
    
    if (queryLower.includes('technical') || queryLower.includes('technology')) {
      prompt += '\n• Emphasize technical implementations, architectures, and tools used';
    }
    
    if (queryLower.includes('achievement') || queryLower.includes('success')) {
      prompt += '\n• Highlight quantified results, metrics, and business impact';
    }

    if (hasQuantitativeResults) {
      prompt += '\n• Include specific numbers, percentages, and measurable outcomes';
    }

    if (hasRecentWork) {
      prompt += '\n• Emphasize recent and current experience when relevant';
    }

    return prompt;
  }

  /**
   * Build message array for OpenAI API
   * @param {string} systemPrompt - System prompt
   * @param {string} query - User query
   * @param {string} context - Retrieved context
   * @param {Array} conversationHistory - Previous messages
   * @returns {Array} - Message array
   */
  buildMessages(systemPrompt, query, context, conversationHistory = []) {
    const messages = [
      { role: 'system', content: systemPrompt }
    ];

    // Add recent conversation history (limit to last 4 exchanges to manage token usage)
    const recentHistory = conversationHistory.slice(-8); // Last 4 Q&A pairs
    messages.push(...recentHistory);

    // Add current query with context
    const userMessage = `Based on the following information about Scott's experience, please answer this question: "${query}"

CONTEXT:
${context}

Please provide a comprehensive answer based on this context.`;

    messages.push({ role: 'user', content: userMessage });

    return messages;
  }

  /**
   * Calculate confidence score for the answer
   * @param {Object} contextResult - Context retrieval result
   * @param {string} answer - Generated answer
   * @returns {string} - Confidence level
   */
  calculateAnswerConfidence(contextResult, answer) {
    let score = 0;
    
    // Base score from context quality
    if (contextResult.avgSimilarity >= 0.85) {score += 40;}
    else if (contextResult.avgSimilarity >= 0.80) {score += 35;}
    else if (contextResult.avgSimilarity >= 0.75) {score += 30;}
    else if (contextResult.avgSimilarity >= 0.70) {score += 20;}
    else {score += 10;}
    
    // Number of relevant chunks
    const chunkCount = contextResult.chunks.length;
    if (chunkCount >= 6) {score += 25;}
    else if (chunkCount >= 4) {score += 20;}
    else if (chunkCount >= 2) {score += 15;}
    else {score += 5;}
    
    // Answer quality indicators
    if (answer.length > 200) {score += 15;} // Comprehensive answer
    if (answer.includes('$') || answer.includes('%') || /\d+/.test(answer)) {score += 10;} // Specific metrics
    if (answer.toLowerCase().includes('i ')) {score += 5;} // First person (good for this use case)
    
    // Recent vs historical context
    const hasRecentContext = contextResult.chunks.some(chunk => chunk.recency_score > 0.7);
    if (hasRecentContext) {score += 10;}
    
    if (score >= 85) {return 'very-high';}
    if (score >= 70) {return 'high';}
    if (score >= 55) {return 'medium';}
    if (score >= 40) {return 'low';}
    return 'very-low';
  }

  /**
   * Generate reasoning for the answer
   * @param {Object} contextResult - Context retrieval result
   * @param {string} answer - Generated answer
   * @returns {string} - Reasoning explanation
   */
  generateReasoning(contextResult, answer) {
    const reasons = [];
    
    reasons.push(`Found ${contextResult.chunks.length} relevant context chunks`);
    
    if (contextResult.avgSimilarity >= 0.80) {
      reasons.push('with high semantic similarity');
    } else if (contextResult.avgSimilarity >= 0.70) {
      reasons.push('with good semantic similarity');
    }
    
    const sources = contextResult.sources.length;
    if (sources > 1) {
      reasons.push(`from ${sources} different sources`);
    }
    
    const hasMetrics = /\d+[%$]/.test(answer);
    if (hasMetrics) {
      reasons.push('including specific metrics and outcomes');
    }
    
    const timeSpan = this.calculateTimeSpanFromSources(contextResult.sources);
    if (timeSpan) {
      reasons.push(timeSpan);
    }

    return reasons.join(', ');
  }

  /**
   * Calculate time span from sources
   * @param {Array} sources - Source metadata
   * @returns {string|null} - Time span description
   */
  calculateTimeSpanFromSources(sources) {
    // This would require additional source metadata
    // For now, return null - could be enhanced later
    return null;
  }

  /**
   * Generate follow-up questions
   * @param {string} query - Original query
   * @param {Object} contextResult - Context retrieval result
   * @returns {Array} - Suggested follow-up questions
   */
  generateFollowUpQuestions(query, contextResult) {
    const followUps = [];
    const sources = contextResult.sources;
    
    // Suggest drilling into specific companies/projects
    sources.forEach(source => {
      if (source.type === 'job' && source.org) {
        followUps.push(`Tell me more about your work at ${source.org}`);
      } else if (source.type === 'project') {
        followUps.push(`What were the key outcomes of ${source.title}?`);
      }
    });
    
    // Suggest related topics based on skills found
    const topSkills = this.extractTopSkillsFromContext(contextResult);
    topSkills.forEach(skill => {
      followUps.push(`What experience do you have with ${skill}?`);
    });
    
    return followUps.slice(0, 3); // Limit to 3 suggestions
  }

  /**
   * Extract top skills from context
   * @param {Object} contextResult - Context retrieval result
   * @returns {Array} - Top skills
   */
  extractTopSkillsFromContext(contextResult) {
    const skillCounts = {};
    
    contextResult.chunks.forEach(chunk => {
      if (chunk.skills) {
        chunk.skills.forEach(skill => {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        });
      }
    });
    
    return Object.entries(skillCounts)
      .sort(([,a], [,b]) => b - a)
      .map(([skill]) => skill)
      .slice(0, 3);
  }
}

export default RAGService;