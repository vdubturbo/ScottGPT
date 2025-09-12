/**
 * Advanced Resume Generation Service
 * Uses the new JD Pipeline for sophisticated resume generation
 * Provides the same interface as the existing ResumeGenerationService
 */

// Note: JD Pipeline TypeScript modules are not yet compiled
// This is a simplified implementation that will be enhanced later
import { createAdapters } from './jd-pipeline/adapters.js';

export class AdvancedResumeGenerationService {
  constructor() {
    this.initialized = false;
    this.pipeline = null;
  }

  /**
   * Initialize the enhanced resume service (simplified for now)
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Create adapters for existing services
      this.adapters = createAdapters();
      this.initialized = true;

      console.log('✅ Advanced Resume Generation Service initialized (simplified mode)');
    } catch (error) {
      console.error('❌ Failed to initialize Advanced Resume Generation:', error);
      throw error;
    }
  }

  /**
   * Generate resume using enhanced processing (simplified implementation for demo)
   * Maintains compatibility with existing ResumeGenerationService interface
   */
  async generateResume(jobDescription, userId, options = {}) {
    try {
      await this.initialize();

      console.log(`🚀 Advanced Resume Generation for user: ${userId} (demo mode)`);

      // Enhanced JD analysis
      const jdAnalysis = await this.analyzeJobDescription(jobDescription);
      
      // Enhanced evidence retrieval  
      const evidence = await this.getEnhancedEvidence(jdAnalysis, userId);
      
      // Generate enhanced resume
      const resume = await this.generateEnhancedResume(jdAnalysis, evidence);

      // Calculate coverage and match score
      const coverageReport = this.calculateCoverage(jdAnalysis.requirements, resume);
      const matchScore = this.calculateMatchScore(coverageReport);
      const extractedKeywords = this.extractKeywords(jdAnalysis.requirements);

      return {
        success: true,
        resume,
        matchScore,
        extractedKeywords,
        sourceData: {
          coverageReport,
          processingTime: Date.now() - performance.now(),
          coveragePercent: matchScore / 100,
          advancedPipeline: true,
          enhancedFeatures: {
            requirementExtraction: true,
            evidenceRanking: true,
            coverageTracking: true
          }
        }
      };

    } catch (error) {
      console.error('❌ Advanced resume generation failed:', error);
      return {
        success: false,
        error: error.message,
        resume: null,
        matchScore: 0,
        extractedKeywords: { technical: [], soft: [], other: [] },
        sourceData: {
          advancedPipeline: true,
          error: true
        }
      };
    }
  }

  /**
   * Get available templates (enhanced)
   */
  getAvailableTemplates() {
    return {
      'ats-optimized': {
        name: 'ATS Optimized (Advanced)',
        description: 'AI-powered ATS optimization with coverage tracking',
        features: [
          'Must-have requirement coverage tracking',
          'Evidence-based bullet points',
          'Token-budget optimized content',
          'Hybrid retrieval for better matching'
        ]
      },
      professional: {
        name: 'Professional (Advanced)',
        description: 'Enhanced professional format with intelligent content selection',
        features: [
          'Intelligent content prioritization',
          'Coverage-based quality scoring',
          'Advanced keyword optimization',
          'Multi-source evidence synthesis'
        ]
      }
    };
  }

  /**
   * Get supported formats (same as original but with additional metadata)
   */
  getSupportedFormats() {
    return {
      markdown: {
        name: 'Markdown (Advanced)',
        extension: 'md',
        mimeType: 'text/markdown',
        description: 'Enhanced markdown with coverage annotations'
      },
      html: {
        name: 'HTML (Advanced)', 
        extension: 'html',
        mimeType: 'text/html',
        description: 'Structured HTML with evidence tracking'
      }
    };
  }

  /**
   * Get pipeline health status
   */
  async getHealthStatus() {
    try {
      await this.initialize();
      return await this.pipeline.getHealthStatus();
    } catch (error) {
      return {
        status: 'unhealthy',
        checks: {},
        timestamp: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Get pipeline metrics and statistics
   */
  async getMetrics() {
    try {
      await this.initialize();
      return this.pipeline.getMetrics();
    } catch (error) {
      return {
        error: error.message,
        timestamp: new Date()
      };
    }
  }

  /**
   * Preview functionality (reduced processing)
   */
  async generatePreview(jobDescription, userId, options = {}) {
    try {
      await this.initialize();
      
      // Use a more constrained config for preview
      const previewResult = await this.pipeline.processJD(jobDescription, userId);
      
      // Truncate for preview
      const previewContent = previewResult.resumeMarkdown.substring(0, 1500);
      const extractedKeywords = this.extractKeywordsFromCoverage(previewResult.coverageReport);
      const matchScore = this.calculateMatchScore(previewResult.coverageReport);

      return {
        success: true,
        resume: previewContent + '...\n\n[Preview limited to 1500 characters]',
        matchScore,
        extractedKeywords,
        sourceData: {
          preview: true,
          fullLength: previewResult.resumeMarkdown.length,
          coveragePercent: previewResult.metadata?.coveragePercent,
          advancedPipeline: true
        }
      };

    } catch (error) {
      console.error('❌ Advanced preview generation failed:', error);
      return {
        success: false,
        error: error.message,
        advancedPipeline: true
      };
    }
  }

  /**
   * Analyze job description to extract requirements (enhanced)
   */
  async analyzeJobDescription(jobDescription) {
    try {
      const llm = this.adapters.llm;
      
      console.log('📋 [ADVANCED] Analyzing job description of length:', jobDescription.length);
      
      const systemPrompt = `Extract structured requirements from job descriptions.
Return JSON with: { "requirements": ["req1", "req2"], "responsibilities": ["resp1"], "title": "Job Title" }`;

      const result = await llm.complete(
        systemPrompt,
        `Extract requirements from: ${jobDescription}`,
        500,
        0.1
      );

      console.log('📋 [ADVANCED] LLM analysis result:', result.text.substring(0, 200) + '...');

      try {
        const parsed = JSON.parse(result.text);
        const analysis = {
          requirements: parsed.requirements || [],
          responsibilities: parsed.responsibilities || [],
          title: parsed.title || 'Position',
          analysis: 'advanced'
        };
        
        console.log('📋 [ADVANCED] Extracted requirements:', analysis.requirements);
        return analysis;
      } catch {
        // Fallback to rule-based extraction
        console.log('📋 [ADVANCED] JSON parsing failed, using rule-based fallback');
        return this.extractRequirementsRuleBased(jobDescription);
      }
    } catch (error) {
      console.warn('JD analysis failed, using fallback:', error);
      return this.extractRequirementsRuleBased(jobDescription);
    }
  }

  /**
   * Get enhanced evidence using improved retrieval
   */
  async getEnhancedEvidence(jdAnalysis, userId) {
    try {
      // Combine requirements into search query
      const searchQuery = jdAnalysis.requirements.slice(0, 5).join(' ');
      
      console.log('🔍 [ADVANCED] Evidence search query:', searchQuery);
      console.log('🔍 [ADVANCED] User ID:', userId);
      
      // Use the existing retrieval service for now instead of the simplified adapters
      const RetrievalService = (await import('./retrieval.js')).default;
      const retrieval = new RetrievalService();
      
      const retrievalResults = await retrieval.retrieveContext(searchQuery, {
        maxResults: 8,
        userFilter: userId
      });

      console.log('🔍 [ADVANCED] Retrieved chunks:', retrievalResults.chunks.length);

      // Convert to expected format for advanced processing
      return retrievalResults.chunks.map(chunk => ({
        chunk: {
          id: chunk.id,
          text: chunk.content || chunk.title || '',
          meta: {
            role: chunk.title,
            skills: chunk.skills || [],
            company: chunk.source_org,
            startDate: chunk.date_start,
            endDate: chunk.date_end
          }
        },
        score: chunk.similarity || 0.8,
        retrievalMethod: 'enhanced'
      }));
    } catch (error) {
      console.warn('Enhanced evidence retrieval failed:', error);
      return [];
    }
  }

  /**
   * Generate enhanced resume with better prompting
   */
  async generateEnhancedResume(jdAnalysis, evidence) {
    try {
      const llm = this.adapters.llm;
      
      console.log('🤖 [ADVANCED] Generating resume with', evidence.length, 'pieces of evidence');
      
      if (evidence.length === 0) {
        console.warn('⚠️ [ADVANCED] No evidence found - generating basic resume structure');
        const systemPrompt = `You are an expert resume writer. Create a professional resume template that demonstrates relevant skills and experience.`;
        const userPrompt = `Create a professional resume that addresses these job requirements:
${jdAnalysis.requirements.join('\n')}

Since no specific evidence is available, create a realistic professional template with:
- Professional summary highlighting relevant skills
- Work experience section with 2-3 relevant positions
- Skills section covering the mentioned requirements
- Education section
- Use proper HTML formatting`;

        const result = await llm.complete(systemPrompt, userPrompt, 1500, 0.7);
        return result.text;
      }
      
      const systemPrompt = `You are an expert resume writer creating ATS-optimized resumes.
CRITICAL: Address ALL requirements listed in the job posting using the provided evidence.
Format: Clean HTML with proper structure.
Focus on achievements with metrics when possible.`;

      const evidenceText = evidence.map((item, i) => 
        `Evidence ${i+1}: ${item.chunk.text}`
      ).join('\n\n');

      const userPrompt = `Job Requirements to Address:
${jdAnalysis.requirements.join('\n')}

Available Professional Evidence:
${evidenceText}

Generate a comprehensive resume targeting the job requirements using the provided evidence.`;

      const result = await llm.complete(systemPrompt, userPrompt, 1500, 0.7);
      return result.text;
    } catch (error) {
      console.error('Enhanced resume generation failed:', error);
      return '<h1>Resume Generation Failed</h1><p>Please try again.</p>';
    }
  }

  /**
   * Calculate requirement coverage
   */
  calculateCoverage(requirements, resumeText) {
    const resumeLower = resumeText.toLowerCase();
    
    return requirements.map(req => ({
      mustHave: req,
      present: resumeLower.includes(req.toLowerCase()),
      evidenceIds: [] // Simplified for demo
    }));
  }

  /**
   * Rule-based requirement extraction fallback
   */
  extractRequirementsRuleBased(jobDescription) {
    const text = jobDescription.toLowerCase();
    const requirements = [];
    
    // Look for common requirement patterns
    const patterns = [
      /(?:must have|required?|essential).{0,50}(javascript|python|react|node|aws|docker|sql)/gi,
      /(\d+\+?\s*years?).{0,20}(experience|exp)/gi,
      /(bachelor|master|degree)/gi
    ];

    patterns.forEach(pattern => {
      const matches = jobDescription.match(pattern) || [];
      requirements.push(...matches.slice(0, 3));
    });

    return {
      requirements: requirements.slice(0, 8),
      responsibilities: [],
      title: 'Position',
      analysis: 'rule-based'
    };
  }

  /**
   * Extract keywords from requirements for compatibility
   */
  extractKeywords(requirements) {
    const technical = new Set();
    const soft = new Set();

    requirements.forEach(req => {
      const reqLower = req.toLowerCase();
      if (this.isTechnicalSkill(reqLower)) {
        technical.add(reqLower);
      } else {
        soft.add(reqLower);
      }
    });

    return {
      technical: Array.from(technical),
      soft: Array.from(soft),
      other: []
    };
  }

  /**
   * Extract keywords from coverage report for compatibility
   */
  extractKeywordsFromCoverage(coverageReport) {
    const technical = new Set();
    const soft = new Set();

    coverageReport.forEach(item => {
      if (item.present) {
        const requirement = item.mustHave.toLowerCase();
        
        // Simple categorization
        if (this.isTechnicalSkill(requirement)) {
          technical.add(requirement);
        } else {
          soft.add(requirement);
        }
      }
    });

    return {
      technical: Array.from(technical),
      soft: Array.from(soft),
      other: []
    };
  }

  /**
   * Calculate match score from coverage report
   */
  calculateMatchScore(coverageReport) {
    if (coverageReport.length === 0) return 0;
    
    const coveredCount = coverageReport.filter(item => item.present).length;
    return Math.round((coveredCount / coverageReport.length) * 100);
  }

  /**
   * Simple technical skill detection
   */
  isTechnicalSkill(skill) {
    const technicalKeywords = [
      'javascript', 'python', 'java', 'react', 'node', 'aws', 'docker',
      'kubernetes', 'sql', 'database', 'api', 'git', 'linux', 'cloud',
      'devops', 'ci/cd', 'microservices', 'mongodb', 'postgresql'
    ];
    
    return technicalKeywords.some(keyword => skill.includes(keyword));
  }

  /**
   * Validate generation options
   */
  validateOptions(jobDescription, options = {}) {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      recommendations: []
    };

    if (!jobDescription || jobDescription.trim().length < 100) {
      validation.isValid = false;
      validation.errors.push('Job description should be at least 100 characters for optimal results');
    }

    if (jobDescription && jobDescription.length > 5000) {
      validation.warnings.push('Very long job description - processing may take longer');
    }

    if (jobDescription && jobDescription.length < 200) {
      validation.recommendations.push('Longer job descriptions enable better requirement extraction and matching');
    }

    return validation;
  }

  /**
   * Get user ID from request (helper method)
   */
  static getUserIdFromRequest(req) {
    if (req.user && req.user.id) {
      return req.user.id;
    }
    
    if (process.env.NODE_ENV === 'development') {
      console.warn('No authenticated user found in request');
      return null;
    }
    
    throw new Error('User not authenticated');
  }
}

export default AdvancedResumeGenerationService;