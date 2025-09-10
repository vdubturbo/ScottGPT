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
      maxContextChunks = 8,
      userFilter = null,
      temperature = 0.7,
      maxTokens = 1500
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
      
      // 3. Generate response
      const messages = [
        {
          role: 'system',
          content: `You are an AI assistant answering questions about Scott Lovett's professional background and experience. Use only the provided context to answer questions accurately.

Context:
${contextText}

Guidelines:
- Answer based only on the provided context
- If the context doesn't contain relevant information, say so
- Be specific and detailed when information is available
- Cite specific experiences and accomplishments`
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
   * Build context text from chunks
   */
  buildContext(chunks) {
    return chunks.map((chunk, index) => {
      return `[${index + 1}] ${chunk.title} (${chunk.source_org})\n${chunk.content}\n`;
    }).join('\n---\n');
  }
}

export default RAGService;