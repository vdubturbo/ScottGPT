// services/resume-generation.js
// Resume generation service using actual user data and RAG system

import { supabase } from '../config/database.js';
import RAGService from './rag.js';
import OpenAI from 'openai';
import CONFIG from '../config/app-config.js';

// Simple keyword extraction for server-side use
function extractKeywords(text) {
  const techPatterns = [
    /\b(javascript|js|typescript|ts|python|java|c\+\+|c#|php|ruby|go|rust|swift|kotlin|scala)\b/gi,
    /\b(react|angular|vue|svelte|node\.?js|express|django|flask|spring|laravel|rails|\.net)\b/gi,
    /\b(mysql|postgresql|mongodb|redis|elasticsearch|oracle|sql server|sqlite|dynamodb)\b/gi,
    /\b(aws|azure|gcp|docker|kubernetes|jenkins|github actions|terraform|ansible|nginx)\b/gi,
    /\b(git|jira|confluence|agile|scrum|kanban|ci\/cd|tdd|microservices|api|rest|graphql)\b/gi
  ];

  const softPatterns = [
    /\b(leadership|management|communication|collaboration|problem.solving|analytical|creative)\b/gi,
    /\b(teamwork|project.management|stakeholder.management|presentation|documentation)\b/gi
  ];

  const technical = new Set();
  const soft = new Set();

  techPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => technical.add(match.toLowerCase().trim()));
  });

  softPatterns.forEach(pattern => {
    const matches = text.match(pattern) || [];
    matches.forEach(match => soft.add(match.toLowerCase().replace(/\./g, ' ').trim()));
  });

  return {
    technical: Array.from(technical),
    soft: Array.from(soft),
    other: []
  };
}

// Character-based token approximation (roughly 4 chars per token)
const MAX_COMPLETION_TOKENS = 900; // Reduced from 2500
const MAX_CONTEXT_CHARACTERS = 20000; // Approximately 5000 tokens
const CHARS_PER_TOKEN = 4;

export class ResumeGenerationService {
  constructor() {
    this.ragService = new RAGService();
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
  }

  /**
   * Fit chunks to character budget (token approximation)
   */
  fitToBudget(chunks, systemPrompt, userPrompt) {
    const systemChars = systemPrompt.length;
    const userChars = userPrompt.length;
    const budget = Math.max(2000, MAX_CONTEXT_CHARACTERS - systemChars - userChars);

    console.log(`📊 Character budget: ${budget} chars for context (system: ${systemChars}, user: ${userChars})`);
    console.log(`📊 Approximate token budget: ~${Math.floor(budget / CHARS_PER_TOKEN)} tokens`);

    // Sort chunks by similarity score descending
    const sortedChunks = chunks
      .filter(chunk => chunk && (chunk.content || chunk.title))
      .sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

    const selectedChunks = [];
    let usedChars = 0;

    for (const chunk of sortedChunks) {
      // Handle different chunk formats from RAG service
      const content = chunk.content || chunk.title || 'No content';
      const source = chunk.org || chunk.source || 'Unknown';
      const chunkText = `[${source}] ${content}`;
      const chunkChars = chunkText.length;
      
      if (usedChars + chunkChars > budget) {
        console.log(`⚠️  Skipping chunk due to character budget (${chunkChars} chars would exceed budget)`);
        continue;
      }
      
      selectedChunks.push(chunkText);
      usedChars += chunkChars;
      
      // Soft cap on number of chunks
      if (selectedChunks.length >= 6) {
        console.log(`📝 Reached max chunks limit (6)`);
        break;
      }
    }

    console.log(`✅ Selected ${selectedChunks.length} chunks using ${usedChars} chars (~${Math.floor(usedChars / CHARS_PER_TOKEN)} tokens)`);
    return selectedChunks.join('\n\n');
  }

  /**
   * Get available resume templates
   */
  getAvailableTemplates() {
    return {
      professional: {
        name: 'Professional',
        description: 'Clean, ATS-friendly format suitable for most industries',
        features: ['Header with contact info', 'Professional summary', 'Experience with achievements', 'Skills section', 'Education']
      },
      technical: {
        name: 'Technical',
        description: 'Optimized for software engineering and technical roles',
        features: ['Technical skills prominence', 'Project highlights', 'Code/GitHub links', 'Technical achievements']
      },
      executive: {
        name: 'Executive',
        description: 'Leadership-focused format for senior roles',
        features: ['Executive summary', 'Leadership achievements', 'Strategic initiatives', 'Board experience']
      },
      creative: {
        name: 'Creative',
        description: 'Visually appealing format for creative industries',
        features: ['Portfolio links', 'Creative projects', 'Visual elements', 'Skills showcase']
      }
    };
  }

  /**
   * Get supported output formats
   */
  getSupportedFormats() {
    return {
      html: {
        name: 'HTML',
        extension: 'html',
        mimeType: 'text/html',
        description: 'Web-ready format with semantic structure'
      },
      markdown: {
        name: 'Markdown',
        extension: 'md',
        mimeType: 'text/markdown',
        description: 'Plain text format with markup'
      },
      json: {
        name: 'JSON',
        extension: 'json',
        mimeType: 'application/json',
        description: 'Structured data format'
      },
      pdf: {
        name: 'PDF',
        extension: 'pdf',
        mimeType: 'application/pdf',
        description: 'Portable document format (coming soon)'
      },
      docx: {
        name: 'Word Document',
        extension: 'docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        description: 'Microsoft Word format (coming soon)'
      }
    };
  }

  /**
   * Generate a tailored resume based on job description and user's actual data
   */
  async generateResume(jobDescription, userId, options = {}) {
    const {
      style = 'professional',
      maxBulletPoints = 5,
      prioritizeKeywords = true
    } = options;

    console.log(`🎯 Generating resume for user ${userId}`);
    
    try {
      // 1. Extract keywords from job description
      const jobKeywords = extractKeywords(jobDescription);
      console.log(`🔍 Extracted ${jobKeywords.technical.length + jobKeywords.soft.length} keywords`);

      // 2. Get user's work history and profile data
      const userData = await this.getUserData(userId);
      
      // 3. Use RAG to get relevant context from user's documents
      const ragContext = await this.getRagContext(jobDescription, userId);
      
      // 4. Generate resume using AI with actual user data
      const resume = await this.generateResumeWithAI({
        jobDescription,
        jobKeywords,
        userData,
        ragContext,
        style,
        maxBulletPoints
      });

      // 5. Calculate match score
      const matchScore = this.calculateMatchScore(jobKeywords, resume);

      return {
        success: true,
        resume,
        matchScore,
        extractedKeywords: jobKeywords,
        sourceData: {
          workHistoryCount: userData.workHistory.length,
          ragChunksUsed: ragContext.chunks.length,
          userProfile: userData.profile
        }
      };

    } catch (error) {
      console.error('Resume generation error:', error);
      throw new Error(`Failed to generate resume: ${error.message}`);
    }
  }

  /**
   * Get user's actual data from database
   */
  async getUserData(userId) {
    console.log(`📊 Fetching user data for: ${userId}`);

    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('Profile fetch error:', profileError);
    }

    // Get work history from sources table
    // For development/testing, if userId is 'test-user-id', get data without user filtering
    let workHistoryQuery = supabase
      .from('sources')
      .select('*')
      .eq('type', 'job')
      .limit(10);

    // Only filter by user_id if it exists and is not a test ID
    if (userId && userId !== 'test-user-id') {
      workHistoryQuery = workHistoryQuery.eq('user_id', userId);
    }

    const { data: workHistory, error: workError } = await workHistoryQuery;

    if (workError) {
      console.error('Work history fetch error:', workError);
      console.error('Query details:', { userId, testMode: userId === 'test-user-id' });
      throw new Error(`Failed to fetch work history: ${workError.message}`);
    }

    console.log(`📊 Found ${workHistory?.length || 0} work history entries`);

    // Get education data
    let educationQuery = supabase
      .from('sources')
      .select('*')
      .eq('type', 'education')
      .order('date_start', { ascending: false });

    if (userId && userId !== 'test-user-id') {
      educationQuery = educationQuery.eq('user_id', userId);
    }

    const { data: education, error: eduError } = await educationQuery;

    // Get skills data
    let skillsQuery = supabase
      .from('sources')
      .select('skills')
      .not('skills', 'is', null);

    if (userId && userId !== 'test-user-id') {
      skillsQuery = skillsQuery.eq('user_id', userId);
    }

    const { data: skillsData, error: skillsError } = await skillsQuery;

    // Aggregate unique skills
    const allSkills = new Set();
    if (skillsData) {
      skillsData.forEach(item => {
        if (Array.isArray(item.skills)) {
          item.skills.forEach(skill => allSkills.add(skill));
        } else if (typeof item.skills === 'string') {
          // Handle comma-separated skills
          item.skills.split(',').forEach(skill => allSkills.add(skill.trim()));
        }
      });
    }

    console.log(`📊 Found: ${workHistory?.length || 0} jobs, ${education?.length || 0} education, ${allSkills.size} skills`);

    return {
      profile: profile || {},
      workHistory: workHistory || [],
      education: education || [],
      skills: Array.from(allSkills),
      userId
    };
  }

  /**
   * Get relevant context from RAG system with optimized settings
   */
  async getRagContext(jobDescription, userId) {
    // Create a query that asks for relevant experience
    const ragQuery = `What experience, skills, and achievements are most relevant for this job: ${jobDescription}`;
    
    try {
      console.log(`🔍 Querying RAG system for relevant experience...`);
      const ragOptions = {
        maxContextChunks: 8, // Reduced from 15
        temperature: 0.3,
        similarityThreshold: 0.35, // Aligned threshold
        diversityFilter: true // Enable diversity filtering
      };

      // Only filter by user if it's not a test ID
      if (userId && userId !== 'test-user-id') {
        ragOptions.userFilter = userId;
      }

      const ragResult = await this.ragService.answerQuestion(ragQuery, ragOptions);

      const chunks = ragResult.sources || [];
      const avgSimilarity = ragResult.performance?.avgSimilarity || 0;
      console.log(`📄 RAG returned ${chunks.length} chunks, avg similarity: ${avgSimilarity.toFixed(3)}`);

      // Apply additional filtering for quality  
      const filteredChunks = chunks
        .filter(chunk => chunk && chunk.similarity >= 0.35)
        .slice(0, 8); // Hard cap

      console.log(`✅ After filtering: ${filteredChunks.length} high-quality chunks`);

      return {
        chunks: filteredChunks,
        response: ragResult.answer || '',
        similarity: avgSimilarity
      };
    } catch (error) {
      console.warn('RAG context fetch error:', error);
      return { chunks: [], response: '', similarity: 0 };
    }
  }

  /**
   * Generate resume using AI with actual user data and token budget management
   */
  async generateResumeWithAI({ jobDescription, jobKeywords, userData, ragContext, style, maxBulletPoints }) {
    // Create concise system prompt
    const systemPrompt = `Professional resume writer. Create ATS-optimized resume using user's actual data.

Target keywords: ${[...jobKeywords.technical, ...jobKeywords.soft].join(', ')}

Format: Clean HTML (header, section, h1-h3, p, ul, li, strong). Max ${maxBulletPoints} bullets/job.
Style: ${style}. Focus on achievements matching job requirements.`;

    // Get user data summary (more concise)
    const profileSummary = userData.profile ? 
      `Name: ${userData.profile.full_name || 'N/A'}, Contact: ${userData.profile.email || 'N/A'}` : 
      'Profile: Limited info available';

    const workSummary = userData.workHistory.length > 0 ? 
      userData.workHistory.map(job => 
        `${job.title} at ${job.org} (${job.date_start || 'Unknown'}-${job.date_end || 'Present'}): ${(job.skills || []).slice(0, 5).join(', ')}`
      ).join('\n') : 'No work history available';

    // Apply token budget to RAG context
    const budgetedContext = this.fitToBudget(
      ragContext.chunks, 
      systemPrompt, 
      `Job: ${jobDescription.substring(0, 500)}...` // Truncate job description for budget calc
    );

    const userPrompt = `Job Description:
${jobDescription}

User Data:
${profileSummary}

Work History:
${workSummary}

Skills: ${userData.skills.slice(0, 20).join(', ')}

Relevant Experience Context:
${budgetedContext}

Generate tailored resume focusing on job match.`;

    console.log(`🤖 Generating resume with AI (optimized prompts)...`);
    
    try {
      const response = await this.openai.chat.completions.create({
        model: CONFIG.ai.openai.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        max_tokens: MAX_COMPLETION_TOKENS // Use our defined constant
      });

      console.log(`✅ OpenAI API response received: ${response.choices?.length || 0} choices`);
      
      if (!response.choices || response.choices.length === 0) {
        throw new Error('No choices returned from OpenAI API');
      }
      
      const content = response.choices[0].message?.content;
      if (!content) {
        throw new Error('No content in OpenAI response');
      }
      
      console.log(`✅ Generated resume content: ${content.length} characters`);
      return content;
      
    } catch (error) {
      console.error('❌ OpenAI API error:', error.message);
      console.error('❌ Full error:', error);
      throw new Error(`OpenAI API failed: ${error.message}`);
    }
  }

  /**
   * Calculate keyword match score
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

    return Math.round((matchedKeywords.length / allJobKeywords.length) * 100);
  }

  /**
   * Get user ID from request (assuming auth middleware sets req.user)
   */
  static getUserIdFromRequest(req) {
    if (req.user && req.user.id) {
      return req.user.id;
    }
    
    // For development - check if we can determine user from session/auth
    if (process.env.NODE_ENV === 'development') {
      console.warn('No authenticated user found in request');
      // You might want to implement session-based user detection here
      return null;
    }
    
    throw new Error('User not authenticated');
  }
}

export default ResumeGenerationService;