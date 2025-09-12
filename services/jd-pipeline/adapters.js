/**
 * Adapter layer to connect existing ScottGPT services to JD Pipeline interfaces
 * Bridges the gap between existing JavaScript services and TypeScript interfaces
 */

import OpenAI from 'openai';
import CONFIG from '../../config/app-config.js';
import { supabase } from '../../config/database.js';
import EmbeddingService from '../embeddings.js';

/**
 * OpenAI LLM Adapter
 */
export class OpenAILLMAdapter {
  constructor() {
    this.openai = new OpenAI({ 
      apiKey: CONFIG.ai.openai.apiKey 
    });
  }

  async complete(systemPrompt, userPrompt, maxTokens = 2000, temperature = 0.3) {
    try {
      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: temperature
      });

      return {
        text: response.choices[0]?.message?.content || '',
        tokensUsed: {
          prompt: response.usage?.prompt_tokens || 0,
          completion: response.usage?.completion_tokens || 0
        }
      };
    } catch (error) {
      console.error('OpenAI API error:', error);
      throw error;
    }
  }
}

/**
 * Supabase Vector Database Adapter
 */
export class SupabaseVectorAdapter {
  constructor() {
    this.client = supabase;
  }

  async search(embedding, topK = 20, filters = {}) {
    try {
      // Build query
      let query = this.client
        .from('chunks')
        .select('id, content, title, org, date_start, date_end, skills, meta')
        .order('similarity', { ascending: false })
        .limit(topK);

      // Apply filters if provided
      if (filters.domain && filters.domain.$in) {
        // Domain filtering logic would go here
      }

      if (filters.userId) {
        query = query.eq('user_id', filters.userId);
      }

      // For now, simulate similarity search with a simple query
      // In production, you'd use pgvector similarity search
      const { data, error } = await query;

      if (error) throw error;

      // Convert to expected format
      return (data || []).map(item => ({
        chunk: {
          id: item.id,
          text: item.content || item.title || '',
          meta: {
            role: item.title,
            skills: item.skills || [],
            company: item.org,
            startDate: item.date_start,
            endDate: item.date_end,
            ...item.meta
          }
        },
        score: 0.8, // Mock score - in production use pgvector similarity
        retrievalMethod: 'dense'
      }));
    } catch (error) {
      console.error('Vector search error:', error);
      return [];
    }
  }
}

/**
 * Simple BM25 Text Search Adapter (using existing database)
 */
export class SimpleBM25Adapter {
  constructor() {
    this.client = supabase;
  }

  async search(query, topK = 20, filters = {}) {
    try {
      const queryTerms = query.toLowerCase().split(/\s+/);
      
      let dbQuery = this.client
        .from('chunks')
        .select('id, content, title, org, date_start, date_end, skills, meta')
        .limit(topK);

      if (filters.userId) {
        dbQuery = dbQuery.eq('user_id', filters.userId);
      }

      // Simple text search using ilike
      if (queryTerms.length > 0) {
        dbQuery = dbQuery.or(
          queryTerms.map(term => `content.ilike.%${term}%,title.ilike.%${term}%`).join(',')
        );
      }

      const { data, error } = await dbQuery;

      if (error) throw error;

      // Convert to expected format and score based on term frequency
      return (data || []).map(item => {
        const text = (item.content || item.title || '').toLowerCase();
        const score = queryTerms.reduce((acc, term) => {
          const matches = (text.match(new RegExp(term, 'g')) || []).length;
          return acc + matches * 0.1;
        }, 0.3);

        return {
          chunk: {
            id: item.id,
            text: item.content || item.title || '',
            meta: {
              role: item.title,
              skills: item.skills || [],
              company: item.org,
              startDate: item.date_start,
              endDate: item.date_end,
              ...item.meta
            }
          },
          score: Math.min(score, 1.0),
          retrievalMethod: 'bm25'
        };
      }).sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('BM25 search error:', error);
      return [];
    }
  }
}

/**
 * Cohere Embedding Adapter
 */
export class CohereEmbeddingAdapter {
  constructor() {
    this.embeddingService = new EmbeddingService();
  }

  async embed(text) {
    try {
      const result = await this.embeddingService.embedText(text, 'search_query');
      return result;
    } catch (error) {
      console.error('Embedding error:', error);
      throw error;
    }
  }
}

/**
 * Mock Rerank Adapter (no cross-encoder available, so use simple scoring)
 */
export class MockRerankAdapter {
  async rerank(query, documents, topK = 10) {
    try {
      // Simple reranking based on keyword overlap
      const queryTerms = query.toLowerCase().split(/\s+/);
      
      const scored = documents.map((doc, index) => {
        const docText = doc.toLowerCase();
        const overlap = queryTerms.filter(term => docText.includes(term)).length;
        const score = overlap / queryTerms.length;
        
        return { index, score };
      }).sort((a, b) => b.score - a.score);

      return scored.slice(0, topK);
    } catch (error) {
      console.error('Rerank error:', error);
      return documents.map((_, index) => ({ index, score: 0.5 }));
    }
  }
}

/**
 * Simple Memory Cache Adapter
 */
export class SimpleMemoryCache {
  constructor() {
    this.cache = new Map();
    this.maxSize = 100;
  }

  async get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  async set(key, data, ttlSeconds = 3600) {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      expiry: Date.now() + (ttlSeconds * 1000)
    });
  }

  async del(key) {
    this.cache.delete(key);
  }

  async clear() {
    this.cache.clear();
  }
}

/**
 * Console Telemetry Adapter
 */
export class ConsoleTelemetryAdapter {
  counter(name, value = 1, tags = {}) {
    console.log(`[COUNTER] ${name}: ${value}`, tags);
  }

  gauge(name, value, tags = {}) {
    console.log(`[GAUGE] ${name}: ${value}`, tags);
  }

  timer(name, durationMs, tags = {}) {
    console.log(`[TIMER] ${name}: ${durationMs}ms`, tags);
  }

  histogram(name, value, tags = {}) {
    console.log(`[HISTOGRAM] ${name}: ${value}`, tags);
  }

  log(level, message, context, tags) {
    const levelNames = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
    const levelName = levelNames[level] || 'INFO';
    console.log(`[${levelName}] ${message}`, context, tags);
  }
}

/**
 * Factory function to create all adapters
 */
export function createAdapters(userId = null) {
  return {
    llm: new OpenAILLMAdapter(),
    vectorDB: new SupabaseVectorAdapter(),
    bm25: new SimpleBM25Adapter(),
    embedding: new CohereEmbeddingAdapter(),
    rerank: new MockRerankAdapter(),
    cache: new SimpleMemoryCache(),
    telemetry: new ConsoleTelemetryAdapter()
  };
}