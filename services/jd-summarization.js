/**
 * Job Description Summarization Service
 * Extracts key requirements and skills from job descriptions for efficient RAG queries
 */

import OpenAI from 'openai';
import CONFIG from '../config/app-config.js';

export class JDSummarizationService {
  constructor() {
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
  }

  /**
   * Summarize job description into key requirements for RAG queries
   * Focus on maximizing token efficiency while capturing essential needs
   */
  async summarizeForRAG(jobDescription) {
    try {
      console.log('📝 [JD SUMMARY] Starting efficient summarization...');
      console.log('📝 [JD SUMMARY] Original JD length:', jobDescription.length, 'characters');

      // Ultra-efficient system prompt for summarization
      const systemPrompt = `Extract key requirements from job descriptions for targeted search queries.
Output format: Concise sentences focusing on specific skills, experience, and qualifications.
Goal: Maximum information density for RAG retrieval queries.`;

      const userPrompt = `Extract ALL key requirements from this job description as specific search queries:

${jobDescription}

Format each requirement as a concise bullet point like:
- "10+ years project management experience with Agile methodologies"  
- "Budget management and financial planning for technology projects"
- "Leadership of cross-functional teams in cybersecurity domain"

Include ALL requirements: experience levels, technical skills, certifications, industry domains, leadership scope, soft skills.
Extract everything - we'll prioritize later.`;

      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 400, // Keep summary very concise
        temperature: 0.0 // Deterministic extraction
      });

      const summary = response.choices[0]?.message?.content || '';
      
      console.log('📝 [JD SUMMARY] Generated summary:');
      console.log(summary);
      console.log('📝 [JD SUMMARY] Summary length:', summary.length, 'characters');
      console.log('📝 [JD SUMMARY] Compression ratio:', (summary.length / jobDescription.length * 100).toFixed(1) + '%');

      // Parse summary into individual queries
      const queries = this.parseIntoQueries(summary);
      
      return {
        originalLength: jobDescription.length,
        summaryLength: summary.length,
        compressionRatio: summary.length / jobDescription.length,
        queries: queries,
        fullSummary: summary
      };

    } catch (error) {
      console.error('❌ [JD SUMMARY] Summarization failed:', error);
      // Fallback to basic requirement extraction
      return this.fallbackSummarization(jobDescription);
    }
  }

  /**
   * Parse summary text into individual RAG queries
   */
  parseIntoQueries(summary) {
    // Extract bullet points or numbered items
    const lines = summary.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => line.replace(/^[-•*]\s*|^\d+\.\s*/, '').trim())
      .filter(line => line.length > 20); // Only keep substantial queries

    console.log('📝 [JD SUMMARY] Extracted', lines.length, 'RAG queries');
    return lines;
  }

  /**
   * Fallback summarization using rule-based extraction
   */
  fallbackSummarization(jobDescription) {
    console.log('📝 [JD SUMMARY] Using fallback rule-based summarization');
    
    const text = jobDescription.toLowerCase();
    const queries = [];

    // Experience level patterns
    const expMatch = text.match(/(\d+)\+?\s*years?\s*(of\s*)?experience/);
    if (expMatch) {
      queries.push(`${expMatch[1]}+ years of professional experience in project management`);
    }

    // Required skills patterns
    const skillPatterns = [
      /required|must have|essential/,
      /agile|scrum|kanban/,
      /budget|financial|cost/,
      /leadership|manage|lead/,
      /technical|technology|software/
    ];

    skillPatterns.forEach(pattern => {
      if (pattern.test(text)) {
        const context = this.extractContext(jobDescription, pattern, 100);
        if (context && context.length > 20) {
          queries.push(context);
        }
      }
    });

    // Ensure we have at least some queries
    if (queries.length === 0) {
      queries.push('senior project management experience with technical teams');
      queries.push('leadership and stakeholder management skills');
    }

    return {
      originalLength: jobDescription.length,
      summaryLength: queries.join(' ').length,
      compressionRatio: 0.1, // Estimated
      queries: queries.slice(0, 5), // Limit to top 5
      fullSummary: queries.join('\n- ')
    };
  }

  /**
   * Extract context around a pattern match
   */
  extractContext(text, pattern, maxLength) {
    const match = text.match(pattern);
    if (!match) return null;

    const index = match.index;
    const start = Math.max(0, index - 50);
    const end = Math.min(text.length, index + maxLength);
    
    return text.substring(start, end).trim();
  }

  /**
   * Create RAG chat query from summarized requirements
   * NEW: Two-stage compression - first extract, then prioritize
   */
  async createRAGQuery(summary) {
    try {
      console.log('🎯 [JD COMPRESS] Stage 2: Distilling', summary.queries.length, 'requirements into focused query');
      
      // If we have 5 or fewer requirements, just use them directly (they're already concise)
      if (summary.queries.length <= 5) {
        const requirements = summary.queries
          .map((query, index) => `${index + 1}. ${query}`)
          .join('\n');
        
        const fullQuery = `Tell me about Scott's relevant professional experience, focusing on: ${requirements}`;
        console.log('📝 [JD COMPRESS] Using', summary.queries.length, 'requirements directly:', fullQuery.length, 'characters');
        return fullQuery;
      }
      
      // For many requirements, use AI to prioritize and compress
      const systemPrompt = `You are a query optimizer. Your job is to take a list of job requirements and create a SHORT, FOCUSED search query that captures the MOST IMPORTANT aspects.`;
      
      const userPrompt = `Given these ${summary.queries.length} job requirements:
${summary.queries.map((q, i) => `${i + 1}. ${q}`).join('\n')}

Create a SINGLE concise query (50-100 words MAX) that asks about the candidate's experience with the TOP 3-4 most critical requirements. 

Focus on seniority level, core technical skills, and essential experience. Skip nice-to-haves.

Example output: "Tell me about Scott's AI leadership experience, particularly his work with machine learning in production, consulting with C-suite executives, and managing technical teams."`;

      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 150, // Keep it very short
        temperature: 0.0 // Deterministic
      });

      const compressedQuery = response.choices[0]?.message?.content || '';
      
      console.log('✅ [JD COMPRESS] Compressed', summary.queries.length, 'requirements to:', compressedQuery.length, 'characters');
      console.log('📝 [JD COMPRESS] Final query:', compressedQuery);
      
      return compressedQuery;
      
    } catch (error) {
      console.error('❌ [JD COMPRESS] Compression failed, using fallback:', error);
      // Fallback: just use first 3 requirements
      const topRequirements = summary.queries.slice(0, 3).join(', ');
      return `Tell me about Scott's professional experience with: ${topRequirements}`;
    }
  }
}

export default JDSummarizationService;