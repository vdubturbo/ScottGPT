import express from 'express';
import RAGService from '../services/rag.js';

const router = express.Router();

const rag = new RAGService();

// POST /api/chat - Main chat endpoint
router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory, options } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required and must be a string' });
    }

    const query = message.trim();
    
    if (query.length === 0) {
      return res.status(400).json({ error: 'Message cannot be empty' });
    }

    if (query.length > 1000) {
      return res.status(400).json({ error: 'Message is too long. Please keep it under 1000 characters.' });
    }

    console.log(`💬 Chat request: "${query}"`);
    console.log(`🔧 Environment check - COHERE_API_KEY: ${process.env.COHERE_API_KEY ? 'Set' : 'Missing'}`);
    const startTime = Date.now();

    // Generate answer using RAG pipeline
    const result = await rag.answerQuestion(query, {
      maxContextChunks: options?.maxContext || 12,
      includeContext: options?.includeContext || false,
      conversationHistory: conversationHistory || [],
      temperature: options?.temperature || 0.4,
      maxTokens: options?.maxTokens || 1200
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
    console.error('Chat error:', error);
    
    // Provide user-friendly error messages
    let errorMessage = 'I apologize, but I encountered an error processing your question.';
    
    if (error.message.includes('rate limit')) {
      errorMessage = 'I\'m currently experiencing high demand. Please try again in a moment.';
    } else if (error.message.includes('API key')) {
      errorMessage = 'There\'s a configuration issue on my end. Please contact support.';
    } else if (error.message.includes('embedding')) {
      errorMessage = 'I had trouble understanding your question. Please try rephrasing it.';
    } else if (error.message.includes('database') || error.message.includes('supabase')) {
      errorMessage = 'I\'m having trouble accessing my knowledge base right now. Please try again shortly.';
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
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
      temperature: 0.2
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