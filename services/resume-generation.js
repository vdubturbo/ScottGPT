// services/resume-generation.js
// Resume generation service using actual user data and RAG system

// CRITICAL: All resume content must be based on actual evidence provided
// NO FABRICATION of metrics, numbers, or achievements not in source data
// Focus on transforming real accomplishments into professional language

import { supabase } from '../config/database.js';
import RAGService from './rag.js';
import RetrievalService from './retrieval.js';
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
// Expanded limits for comprehensive, 2-page resume generation
const MAX_COMPLETION_TOKENS = 2500; // Increased for comprehensive resumes
const MAX_CONTEXT_CHARACTERS = 35000; // Approximately 8750 tokens for expanded context
const CHARS_PER_TOKEN = 4;

export class ResumeGenerationService {
  constructor() {
    this.ragService = new RAGService();
    this.retrievalService = new RetrievalService();
    this.openai = new OpenAI({ apiKey: CONFIG.ai.openai.apiKey });
  }

  /**
   * Fit chunks to character budget with full content extraction, prioritizing metric-rich content
   */
  fitToBudget(chunks, systemPrompt, userPrompt) {
    const systemChars = systemPrompt.length;
    const userChars = userPrompt.length;
    const budget = Math.max(15000, MAX_CONTEXT_CHARACTERS - systemChars - userChars - 1000); // Increased budget

    console.log(`📊 Character budget: ${budget} chars for context (system: ${systemChars}, user: ${userChars})`);
    console.log(`📊 Approximate token budget: ~${Math.floor(budget / CHARS_PER_TOKEN)} tokens`);

    // Enhanced sorting: prioritize chunks with metrics AND high similarity
    const sortedChunks = chunks
      .filter(chunk => chunk && (chunk.content || chunk.title))
      .map(chunk => {
        // Calculate metric richness score
        const content = chunk.content || chunk.title || '';
        const metricMatches = content.match(/\d+[%$]|\$\d+[kmb]?|\d+\s*(million|billion|team|people)/gi) || [];
        const achievementWords = (content.match(/\b(achieved|delivered|improved|increased|reduced|saved|grew|scaled|managed|led)\b/gi) || []).length;

        const metricScore = metricMatches.length * 2 + achievementWords * 0.5; // Heavily weight metrics
        const combinedScore = (chunk.similarity || 0) + metricScore * 0.3; // Boost metric-rich content

        return {
          ...chunk,
          metricScore,
          combinedScore,
          hasMetrics: metricMatches.length > 0
        };
      })
      .sort((a, b) => b.combinedScore - a.combinedScore); // Sort by combined score

    console.log(`🎯 Content prioritization: ${sortedChunks.filter(c => c.hasMetrics).length}/${sortedChunks.length} chunks have metrics`);

    const selectedChunks = [];
    let usedChars = 0;

    for (const chunk of sortedChunks) {
      // Get full content from different possible chunk formats with achievement prioritization
      let content = '';
      let source = '';

      if (chunk.content && chunk.content.trim().length > 0) {
        content = chunk.content.trim();

        // If content is very long, prioritize sections with metrics and achievements
        if (content.length > 1500) {
          const lines = content.split('\n');
          const priorityLines = [];
          const regularLines = [];

          lines.forEach(line => {
            const hasMetrics = /\d+[%$]|\$\d+[kmb]?|\d+\s*(million|billion)/.test(line);
            const hasAchievements = /\b(achieved|delivered|improved|increased|reduced|saved|grew|scaled|managed|led)\b/i.test(line);
            const isBulletPoint = line.trim().startsWith('•') || line.trim().startsWith('-');

            if (hasMetrics || (hasAchievements && isBulletPoint)) {
              priorityLines.push(line);
            } else {
              regularLines.push(line);
            }
          });

          // Combine priority content first, then fill with regular content
          const priorityContent = priorityLines.join('\n');
          const remainingBudget = Math.max(1000, 2000 - priorityContent.length);
          const regularContent = regularLines.join('\n').substring(0, remainingBudget);

          content = priorityContent + (priorityContent && regularContent ? '\n\n' : '') + regularContent;

          console.log(`📊 Chunk prioritization: ${priorityLines.length} priority lines, ${regularLines.length} regular lines`);
        }

      } else if (chunk.title && chunk.title.trim().length > 0) {
        content = chunk.title.trim();
      } else {
        console.log(`⚠️ Skipping empty chunk:`, chunk);
        continue;
      }

      // Extract source information
      source = chunk.org || chunk.source || chunk.company || 'Experience';

      // Include additional metadata if available
      if (chunk.skills && Array.isArray(chunk.skills) && chunk.skills.length > 0) {
        content += `\nSkills: ${chunk.skills.join(', ')}`;
      }

      if (chunk.date_start && chunk.date_end) {
        content += `\nTimeframe: ${chunk.date_start} to ${chunk.date_end}`;
      }

      const chunkText = `[${source}]\n${content}\n`;
      const chunkChars = chunkText.length;

      // Debug: Log chunk content to see what we're actually getting
      const chunkHasMetrics = /\d+[%$]|\$\d+[kmb]?/.test(content);
      const metricIndicator = chunkHasMetrics ? '📊' : '📄';
      console.log(`${metricIndicator} Chunk ${selectedChunks.length + 1} (${chunkChars} chars): ${content.substring(0, 100)}...`);

      if (usedChars + chunkChars > budget) {
        // Try to fit a meaningful truncated version
        const remainingChars = budget - usedChars;
        if (remainingChars > 300 && content.length > 200) {
          const truncatedContent = content.substring(0, remainingChars - source.length - 20) + '...';
          const truncatedText = `[${source}]\n${truncatedContent}\n`;
          selectedChunks.push(truncatedText);
          usedChars += truncatedText.length;
          console.log(`✂️ Truncated chunk to fit budget (${truncatedText.length} chars)`);
        }
        break;
      }

      selectedChunks.push(chunkText);
      usedChars += chunkChars;

      // Continue until we have good budget utilization
      if (selectedChunks.length >= 15 && usedChars > budget * 0.6) {
        console.log(`📝 Good chunk selection: ${selectedChunks.length} chunks, ${Math.round((usedChars / budget) * 100)}% budget used`);
        break;
      }
    }

    // Calculate final metrics coverage
    const finalContent = selectedChunks.join('\n');
    const finalMetrics = finalContent.match(/\d+[%$]|\$\d+[kmb]?/g) || [];
    const metricsCount = finalMetrics.length;

    console.log(`✅ Selected ${selectedChunks.length} chunks using ${usedChars} chars (~${Math.floor(usedChars / CHARS_PER_TOKEN)} tokens)`);
    console.log(`📊 Budget utilization: ${Math.round((usedChars / budget) * 100)}%`);
    console.log(`🎯 Metrics included: ${metricsCount} quantifiable results ${finalMetrics.length > 0 ? `[${finalMetrics.slice(0, 5).join(', ')}${finalMetrics.length > 5 ? ', ...' : ''}]` : ''}`);

    // Debug: Show first chunk content to verify we're getting real data
    if (selectedChunks.length > 0) {
      console.log(`🔍 First chunk sample: ${selectedChunks[0].substring(0, 200)}...`);
    }

    return selectedChunks.join('\n');
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
   * Analyze evidence for examples, metrics, and specific achievements
   */
  analyzeEvidence(chunks) {
    if (!chunks || chunks.length === 0) {
      return {
        hasQuantifiableMetrics: false,
        hasSpecificProjects: false,
        hasSpecificTechnologies: false,
        hasLeadershipMetrics: false,
        summary: 'No evidence available',
        metrics: [],
        projects: [],
        technologies: []
      };
    }

    let allContent = '';
    const metrics = [];
    const projects = [];
    const technologies = [];

    // Extract content from chunks
    chunks.forEach(chunk => {
      const content = chunk.content || chunk.title || '';
      allContent += content + ' ';

      // Extract quantifiable metrics
      const metricPatterns = [
        /\d+[%]/g, // percentages like 90%, 115%
        /\$\d+[kmb]?/gi, // dollar amounts like $1M, $500K
        /\d+\s*(million|billion|thousand)/gi, // written numbers
        /\d+x\s/gi, // multipliers like 3x
        /\d+\s*(months?|years?|weeks?)/gi, // time periods
        /\d+\s*(team|people|members|employees)/gi, // team sizes
        /reduced.*by.*\d+/gi, // reduction metrics
        /increased.*by.*\d+/gi, // increase metrics
        /improved.*by.*\d+/gi, // improvement metrics
      ];

      metricPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          metrics.push(...matches.map(match => match.trim()));
        }
      });

      // Extract specific projects/initiatives
      const projectPatterns = [
        /project\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
        /initiative\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
        /program\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
        /system\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi,
        /platform\s+[\w\s]{1,30}(?=\s|$|,|\.)/gi
      ];

      projectPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          projects.push(...matches.map(match => match.trim()));
        }
      });

      // Extract specific technologies
      const techPatterns = [
        /\b(AWS|Azure|GCP|Docker|Kubernetes|React|Node\.?js|Python|Java|JavaScript|TypeScript)\b/gi,
        /\b(SQL|MongoDB|PostgreSQL|Redis|Elasticsearch)\b/gi,
        /\b(Jenkins|GitHub\s*Actions|CI\/CD|Terraform|Ansible)\b/gi,
        /\b(Agile|Scrum|Kanban|JIRA|Confluence)\b/gi
      ];

      techPatterns.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
          technologies.push(...matches.map(match => match.trim()));
        }
      });
    });

    // Deduplicate arrays
    const uniqueMetrics = [...new Set(metrics)];
    const uniqueProjects = [...new Set(projects)];
    const uniqueTechnologies = [...new Set(technologies)];

    // Check for leadership-specific metrics
    const hasLeadershipMetrics = allContent.toLowerCase().includes('team') ||
                                allContent.toLowerCase().includes('budget') ||
                                allContent.toLowerCase().includes('managed') ||
                                uniqueMetrics.some(m => m.includes('team') || m.includes('people'));

    const analysis = {
      hasQuantifiableMetrics: uniqueMetrics.length > 0,
      hasSpecificProjects: uniqueProjects.length > 0,
      hasSpecificTechnologies: uniqueTechnologies.length > 0,
      hasLeadershipMetrics: hasLeadershipMetrics,
      metrics: uniqueMetrics,
      projects: uniqueProjects,
      technologies: uniqueTechnologies,
      summary: this.generateEvidenceSummary(uniqueMetrics, uniqueProjects, uniqueTechnologies, hasLeadershipMetrics)
    };

    console.log(`📊 Evidence Analysis: ${JSON.stringify(analysis, null, 2)}`);
    return analysis;
  }

  /**
   * Generate a summary of available evidence
   */
  generateEvidenceSummary(metrics, projects, technologies, hasLeadershipMetrics) {
    const parts = [];

    if (metrics.length > 0) {
      parts.push(`${metrics.length} quantifiable metrics available`);
    }
    if (projects.length > 0) {
      parts.push(`${projects.length} specific projects/initiatives identified`);
    }
    if (technologies.length > 0) {
      parts.push(`${technologies.length} technologies mentioned`);
    }
    if (hasLeadershipMetrics) {
      parts.push('leadership/management metrics detected');
    }

    return parts.length > 0 ? parts.join('; ') : 'Limited specific evidence available';
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
        maxContextChunks: 12, // Increased for comprehensive resume generation
        temperature: 0.3,
        similarityThreshold: 0.35, // Aligned threshold
        diversityFilter: true // Enable diversity filtering
      };

      // Only filter by user if it's not a test ID
      if (userId && userId !== 'test-user-id') {
        ragOptions.userFilter = userId;
      }

      // Use retrieval service directly to get full chunks with content
      const retrievalResult = await this.retrievalService.retrieveContext(ragQuery, ragOptions);

      const chunks = retrievalResult.chunks || [];
      const avgSimilarity = retrievalResult.avgSimilarity || 0;
      console.log(`📄 Retrieved ${chunks.length} chunks with content, avg similarity: ${avgSimilarity.toFixed(3)}`);

      // Apply additional filtering for quality
      const filteredChunks = chunks
        .filter(chunk => chunk && chunk.similarity >= 0.35)
        .slice(0, 12); // Hard cap expanded for comprehensive resumes

      console.log(`✅ After filtering: ${filteredChunks.length} high-quality chunks`);

      return {
        chunks: filteredChunks,
        response: '', // No answer needed for retrieval
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
    // Analyze the available evidence for examples and metrics
    const evidenceAnalysis = this.analyzeEvidence(ragContext.chunks);

    // Create focused system prompt that prioritizes real examples when available
    const systemPrompt = `Professional resume writer creating comprehensive resumes based ONLY on provided evidence.

CRITICAL ANTI-FABRICATION RULES:
- Use ONLY information that exists in the provided evidence
- NEVER invent, estimate, or fabricate any metrics, percentages, dollar amounts, or quantifiable results
- NEVER invent specific project names, initiatives, or accomplishments not in evidence
- NEVER add time frames, percentages, team sizes, or cost savings not explicitly provided
- If no specific achievements exist for a role, use only generic role responsibilities
- When evidence lacks metrics, write impact statements WITHOUT numbers

CONTENT REQUIREMENTS:
- Generate 1,500-2,000 words using provided evidence and reasonable professional context
- Create 5-7 bullets per job role, prioritizing evidence-based achievements
${evidenceAnalysis.hasQuantifiableMetrics ? '- FEATURE quantifiable results prominently (percentages, costs, revenue, team sizes, etc.)' : ''}
${evidenceAnalysis.hasSpecificProjects ? '- HIGHLIGHT specific projects and initiatives mentioned in evidence' : ''}
${evidenceAnalysis.hasSpecificTechnologies ? '- EMPHASIZE specific technologies and methodologies from evidence' : ''}

EVIDENCE-BASED ENHANCEMENT PRIORITY:
1. Specific achievements with metrics (highest priority)
2. Named projects, initiatives, and technologies
3. Leadership scope and team sizes
4. Business impact and outcomes
5. Skills and certifications mentioned
6. Industry context and professional progression

FALLBACK FOR LIMITED EVIDENCE:
- When evidence is limited to job titles and basic info, use only:
  * Generic industry-standard responsibilities WITHOUT specific metrics
  * Skills and technologies explicitly mentioned in the evidence
  * General role descriptions WITHOUT quantified outcomes
  * NO invented performance metrics, percentages, or specific achievements

PROFESSIONAL STANDARDS:
- Write compelling content appropriate for ${style} level using ONLY real evidence
- Include relevant keywords from job description when supported by evidence
- Use ONLY metrics that exist in evidence - never invent quantifiable results
- Ensure content reflects documented positions WITHOUT adding fabricated achievements

Evidence Analysis: ${evidenceAnalysis.summary}
Target keywords: ${[...jobKeywords.technical, ...jobKeywords.soft].join(', ')}
Format: Professional resume text with proper formatting and structure.`;

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

    // Add debugging to see evidence utilization
    console.log(`🔍 Evidence used (first 500 chars): ${budgetedContext.substring(0, 500)}...`);
    console.log(`📊 Total evidence length: ${budgetedContext.length} characters`);
    console.log(`📊 Evidence chunk count estimate: ${budgetedContext.split('[').length - 1} chunks`);

    // Validate we have meaningful content before AI generation
    if (budgetedContext.length < 500) {
      console.error(`❌ Insufficient context data: only ${budgetedContext.length} characters available`);
      throw new Error('Insufficient professional experience data available to generate a meaningful resume');
    }

    // Check if context contains actual achievements vs just job titles
    const hasSubstantiveContent = budgetedContext.includes('achieved') ||
                                  budgetedContext.includes('led') ||
                                  budgetedContext.includes('managed') ||
                                  budgetedContext.includes('developed') ||
                                  budgetedContext.includes('implemented') ||
                                  budgetedContext.length > 1500;

    if (!hasSubstantiveContent) {
      console.warn(`⚠️ Context appears to contain mostly job titles without achievements`);
      console.log(`🔍 Context preview: ${budgetedContext.substring(0, 500)}`);
    }

    const userPrompt = `Create a comprehensive resume targeting this role using the evidence provided:

JOB DESCRIPTION:
${jobDescription.substring(0, 1200)}

USER PROFILE: ${profileSummary}

WORK EXPERIENCE: ${workSummary}

SKILLS: ${userData.skills.slice(0, 20).join(', ')}

RELEVANT EXPERIENCE AND ACHIEVEMENTS:
${budgetedContext}

Generate a detailed resume with:
1. Professional Summary highlighting relevant experience
2. Core Competencies listing relevant skills and technologies
3. Professional Experience with 5-7 achievement bullets per role
4. Focus on accomplishments, impact, and professional growth shown in the evidence
5. Include specific technologies, methodologies, and results mentioned in the evidence
6. Target 1,500+ words for comprehensive coverage

Transform the evidence into a compelling professional narrative that demonstrates clear value for the target role.`;

    console.log(`🤖 Generating resume with AI (optimized prompts)...`);

    // Calculate cost estimation for monitoring
    const inputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4); // Rough token estimation
    const maxTokens = MAX_COMPLETION_TOKENS;
    const estimatedCost = (inputTokens * CONFIG.ai.openai.modelInfo.inputCostPer1k / 1000) +
                         (maxTokens * CONFIG.ai.openai.modelInfo.outputCostPer1k / 1000);

    console.log(`🤖 Resume generation: ${CONFIG.ai.openai.model}, Est. cost: $${estimatedCost.toFixed(4)}, Tokens: ${inputTokens}→${maxTokens}`);

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