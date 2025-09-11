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

export class ResumeGenerationService {
  constructor() {
    this.ragService = new RAGService();
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
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
      .eq('user_id', userId)
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
   * Get relevant context from RAG system
   */
  async getRagContext(jobDescription, userId) {
    // Create a query that asks for relevant experience
    const ragQuery = `What experience, skills, and achievements are most relevant for this job: ${jobDescription}`;
    
    try {
      console.log(`🔍 Querying RAG system for relevant experience...`);
      const ragOptions = {
        maxContextChunks: 15,
        temperature: 0.3
      };

      // Only filter by user if it's not a test ID
      if (userId && userId !== 'test-user-id') {
        ragOptions.userFilter = userId;
      }

      const ragResult = await this.ragService.answerQuestion(ragQuery, ragOptions);

      console.log(`📄 RAG returned ${ragResult.context?.length || 0} chunks`);

      return {
        chunks: ragResult.context || [],
        response: ragResult.response || '',
        similarity: ragResult.avgSimilarity || 0
      };
    } catch (error) {
      console.warn('RAG context fetch error:', error);
      return { chunks: [], response: '', similarity: 0 };
    }
  }

  /**
   * Generate resume using AI with actual user data
   */
  async generateResumeWithAI({ jobDescription, jobKeywords, userData, ragContext, style, maxBulletPoints }) {
    const systemPrompt = `You are a professional resume writer specializing in ATS-optimized resumes. 

Your task: Create a tailored resume using ONLY the user's actual work history and experience provided below.

Job Description Keywords to prioritize:
- Technical: ${jobKeywords.technical.join(', ')}
- Soft Skills: ${jobKeywords.soft.join(', ')}

User's Actual Data:
Profile: ${JSON.stringify(userData.profile, null, 2)}
Work History: ${JSON.stringify(userData.workHistory, null, 2)}
Education: ${JSON.stringify(userData.education, null, 2)}
Skills: ${userData.skills.join(', ')}

Relevant Context from User's Documents:
${ragContext.response}

Instructions:
1. Use ONLY the user's actual work history, education, and skills
2. Prioritize experiences that match the job keywords
3. Rewrite bullet points to highlight relevant achievements
4. Use ATS-friendly format with semantic HTML tags only
5. Maximum ${maxBulletPoints} bullet points per job
6. Include quantified achievements where available
7. Match the ${style} style
8. Extract name and contact info from profile if available

Output format: Clean HTML using only these tags: h1, h2, h3, p, ul, li, strong, em, header, section
Do not include any CSS styles or non-semantic elements.`;

    const userPrompt = `Generate a professional resume tailored for this job description:

${jobDescription}

Focus on the user's most relevant experience and achievements that match the job requirements.`;

    console.log(`🤖 Generating resume with AI...`);
    
    const response = await this.openai.chat.completions.create({
      model: CONFIG.ai.openai.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 3000
    });

    return response.choices[0].message.content;
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