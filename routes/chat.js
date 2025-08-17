import express from 'express';
import RAGService from '../services/rag.js';
import CONFIG from '../config/app-config.js';
import { 
  handleError, 
  ValidationError,
  logError 
} from '../utils/error-handling.js';

const router = express.Router();

const rag = new RAGService();

// POST /api/chat - Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory, options } = req.body;
    
    if (!message || typeof message !== 'string') {
      const validationError = new ValidationError('Message is required and must be a string', 'message', message);
      handleError(validationError, { service: 'chat', operation: 'validateMessage' });
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const query = message.trim();
    
    if (query.length === 0) {
      const validationError = new ValidationError('Message cannot be empty', 'message', query);
      handleError(validationError, { service: 'chat', operation: 'validateMessage' });
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (query.length > CONFIG.server.requestLimits.messageMaxLength) {
      const validationError = new ValidationError('Message too long', 'message', query.length);
      handleError(validationError, { service: 'chat', operation: 'validateMessage', maxLength: CONFIG.server.requestLimits.messageMaxLength });
      return res.status(400).json({ 
        error: `Message is too long. Please keep it under ${CONFIG.server.requestLimits.messageMaxLength} characters.` 
      });
    }

    console.log(`💬 Chat request: "${query}"`);
    console.log(`🔧 Configuration: Cohere API configured: ${!!CONFIG.ai.cohere.apiKey}`);
    const startTime = Date.now();

    // Generate answer using RAG pipeline
    const result = await rag.answerQuestion(query, {
      maxContextChunks: options?.maxContext || 12,
      includeContext: options?.includeContext || false,
      conversationHistory: conversationHistory || [],
      temperature: options?.temperature || CONFIG.ai.openai.temperature.default,
      maxTokens: options?.maxTokens || CONFIG.ai.openai.maxTokens.default
    });
    
    console.log(`📊 RAG result summary:`, { 
      hasAnswer: !!result.answer, 
      sourcesCount: result.sources?.length || 0,
      confidence: result.confidence,
      tokensUsed: result.tokensUsed || 0
    });

    console.log(`✅ Chat response generated in ${Date.now() - startTime}ms`);

    // Format response
    const response = {
      response: result.answer,
      confidence: result.confidence,
      sources: result.sources.map(source => ({
        title: source.title,
        organization: source.org,
        type: source.type
      })),
      metadata: {
        processingTime: result.processingTime,
        tokensUsed: result.tokensUsed,
        totalChunksFound: result.totalChunksFound,
        avgSimilarity: result.avgSimilarity,
        reasoning: result.reasoning
      }
    };

    // Include detailed context if requested (for debugging)
    if (options?.includeContext && result.contextUsed) {
      response.contextUsed = result.contextUsed;
    }

    res.json(response);
    
  } catch (error) {
    const handledError = handleError(error, {
      service: 'chat',
      operation: 'answerQuestion',
      query: req.body.message?.substring(0, 100) // First 100 chars for context
    });
    
    // Provide user-friendly error messages based on error type
    let errorMessage = 'I apologize, but I encountered an error processing your question.';
    let statusCode = 500;
    
    if (handledError.context?.userFriendly) {
      errorMessage = handledError.message;
    } else if (handledError.name === 'RateLimitError') {
      errorMessage = 'I\'m currently experiencing high demand. Please try again in a moment.';
      statusCode = 429;
    } else if (handledError.name === 'APIError' && handledError.statusCode === 401) {
      errorMessage = 'There\'s a configuration issue on my end. Please contact support.';
      statusCode = 503;
    } else if (handledError.name === 'NetworkError') {
      errorMessage = 'I\'m having trouble accessing external services right now. Please try again shortly.';
      statusCode = 503;
    } else if (handledError.name === 'DatabaseError') {
      errorMessage = 'I\'m having trouble accessing my knowledge base right now. Please try again shortly.';
      statusCode = 503;
    } else if (handledError.name === 'ProcessingError') {
      errorMessage = 'I had trouble processing your question. Please try rephrasing it.';
      statusCode = 422;
    }

    res.status(statusCode).json({
      error: errorMessage,
      details: CONFIG.environment.NODE_ENV === 'development' ? handledError.message : undefined,
      errorType: handledError.name,
      retryable: handledError.retryable
    });
  }
});

// GET /api/chat/health - Check if RAG services are working
router.get('/health', async (req, res) => {
  try {
    // Test basic connectivity
    const { db } = await import('../config/database.js');
    const stats = await db.getStats();
    
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {
        database: stats.total_chunks > 0 ? 'healthy' : 'no-data',
        embeddings: process.env.COHERE_API_KEY ? 'configured' : 'missing-key',
        generation: process.env.OPENAI_API_KEY ? 'configured' : 'missing-key'
      },
      knowledgeBase: {
        totalSources: stats.total_sources,
        totalChunks: stats.total_chunks,
        sourceBreakdown: stats.source_breakdown
      }
    };

    res.json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// POST /api/chat/test - Test RAG pipeline with sample query
router.post('/test', async (req, res) => {
  try {
    const testQuery = req.body.query || 'What experience do you have with AI and machine learning?';
    
    console.log(`🧪 Testing RAG pipeline with query: "${testQuery}"`);
    
    const result = await rag.answerQuestion(testQuery, {
      maxContextChunks: 5,
      includeContext: true,
      temperature: CONFIG.ai.openai.temperature.precise
    });

    res.json({
      success: true,
      testQuery,
      result,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('RAG test error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;