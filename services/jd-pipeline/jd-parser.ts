/**
 * JD Parser Module
 * Extracts structured schema from raw job descriptions
 * Removes boilerplate and produces concise summaries
 */

import crypto from 'crypto';
import { 
  RawJD, 
  JDSchema, 
  JDFlowConfig, 
  LLMAdapter,
  CacheAdapter,
  TelemetryAdapter,
  JDProcessingError 
} from './types';

// Common boilerplate patterns to remove
const BOILERPLATE_PATTERNS = [
  // EEO statements
  /equal\s+opportunity\s+employer/gi,
  /eeo\s+statement/gi,
  /does\s+not\s+discriminate/gi,
  /affirmative\s+action/gi,
  
  // Benefits boilerplate
  /competitive\s+salary\s+and\s+benefits/gi,
  /comprehensive\s+benefits\s+package/gi,
  /401k\s+matching/gi,
  /health\s+dental\s+vision/gi,
  
  // Company culture fluff
  /fast-paced\s+environment/gi,
  /dynamic\s+team/gi,
  /work-life\s+balance/gi,
  /fun\s+and\s+exciting/gi,
  
  // Application instructions
  /to\s+apply[\s\S]{0,200}$/gi,
  /send\s+your\s+resume\s+to/gi,
  /click\s+here\s+to\s+apply/gi,
  
  // Legal disclaimers
  /background\s+check\s+required/gi,
  /drug\s+screening/gi,
  /employment\s+verification/gi,
];

// Keywords for extracting different sections
const SECTION_KEYWORDS = {
  requirements: ['required', 'must have', 'mandatory', 'essential', 'minimum'],
  niceToHave: ['nice to have', 'preferred', 'bonus', 'plus', 'desired'],
  responsibilities: ['responsibilities', 'duties', 'role', 'will', 'expected to'],
  constraints: ['clearance', 'location', 'travel', 'on-site', 'remote', 'hybrid', 'citizen'],
  seniority: ['senior', 'junior', 'mid-level', 'principal', 'staff', 'lead', 'manager', 'director'],
};

export class JDParser {
  constructor(
    private llm: LLMAdapter,
    private cache?: CacheAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Parse raw JD into structured schema
   */
  async parseJD(raw: RawJD, cfg: JDFlowConfig): Promise<JDSchema> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(raw.text);
      if (this.cache && cfg.cacheEnabled) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.telemetry?.counter('jd_parser.cache_hit', 1);
          return cached as JDSchema;
        }
      }
      
      // Step 1: Remove boilerplate
      const cleaned = this.removeBoilerplate(raw.text);
      
      // Step 2: Extract structured fields using LLM
      const schema = await this.extractSchema(cleaned, cfg);
      
      // Step 3: Add metadata
      schema.rawHash = cacheKey;
      schema.extractedAt = new Date();
      
      // Cache the result
      if (this.cache && cfg.cacheEnabled) {
        await this.cache.set(cacheKey, schema, cfg.cacheTTLSeconds);
      }
      
      // Telemetry
      const elapsed = Date.now() - startTime;
      this.telemetry?.timer('jd_parser.parse_ms', elapsed);
      this.telemetry?.gauge('jd_parser.summary_words', schema.conciseSummary.split(/\s+/).length);
      
      return schema;
      
    } catch (error) {
      this.telemetry?.counter('jd_parser.error', 1);
      throw new JDProcessingError(
        'Failed to parse job description',
        'JD_PARSE_ERROR',
        error
      );
    }
  }

  /**
   * Remove common boilerplate from JD text
   */
  private removeBoilerplate(text: string): string {
    let cleaned = text;
    
    // Remove each boilerplate pattern
    for (const pattern of BOILERPLATE_PATTERNS) {
      cleaned = cleaned.replace(pattern, '');
    }
    
    // Remove excessive whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    // Remove duplicate sentences
    const sentences = cleaned.split(/[.!?]+/);
    const unique = [...new Set(sentences.map(s => s.trim().toLowerCase()))];
    cleaned = unique.join('. ');
    
    return cleaned;
  }

  /**
   * Extract structured schema using LLM
   */
  private async extractSchema(cleanedText: string, cfg: JDFlowConfig): Promise<JDSchema> {
    const systemPrompt = `You are a job description parser. Extract structured information from job descriptions.
    
Output a JSON object with these fields:
- roleTitle: The job title (string)
- seniority: Level (junior/mid/senior/staff/principal/director)
- mustHaves: Array of required skills/qualifications (max 10 items)
- niceToHaves: Array of preferred skills (max 8 items)
- topResponsibilities: Array of main duties (max 8 items)
- hardConstraints: Array of non-negotiable requirements (clearance, location, etc.)
- domain: Array of industry/domain keywords
- conciseSummary: A ${cfg.jdSummaryMaxWords}-word summary focusing on role essence and key requirements

Rules:
1. Be concise and specific
2. Remove marketing fluff
3. Focus on technical requirements
4. Extract measurable/verifiable criteria
5. Deduplicate similar requirements`;

    const userPrompt = `Parse this job description:\n\n${cleanedText}`;
    
    const response = await this.llm.complete(
      systemPrompt,
      userPrompt,
      1000, // Max tokens for extraction
      0.1   // Low temperature for consistency
    );
    
    try {
      const parsed = JSON.parse(response.text);
      return this.validateSchema(parsed, cfg);
    } catch (error) {
      // Fallback to rule-based extraction
      return this.fallbackExtraction(cleanedText, cfg);
    }
  }

  /**
   * Validate and clean extracted schema
   */
  private validateSchema(schema: any, cfg: JDFlowConfig): JDSchema {
    // Ensure all required fields exist
    const validated: JDSchema = {
      roleTitle: schema.roleTitle || 'Unknown Role',
      seniority: schema.seniority || undefined,
      mustHaves: Array.isArray(schema.mustHaves) ? schema.mustHaves.slice(0, 10) : [],
      niceToHaves: Array.isArray(schema.niceToHaves) ? schema.niceToHaves.slice(0, 8) : [],
      topResponsibilities: Array.isArray(schema.topResponsibilities) ? schema.topResponsibilities.slice(0, 8) : [],
      hardConstraints: Array.isArray(schema.hardConstraints) ? schema.hardConstraints : [],
      domain: Array.isArray(schema.domain) ? schema.domain : [],
      conciseSummary: schema.conciseSummary || ''
    };
    
    // Enforce word limit on summary
    const words = validated.conciseSummary.split(/\s+/);
    if (words.length > cfg.jdSummaryMaxWords) {
      validated.conciseSummary = words.slice(0, cfg.jdSummaryMaxWords).join(' ');
    }
    
    // Deduplicate arrays
    validated.mustHaves = [...new Set(validated.mustHaves)];
    validated.niceToHaves = [...new Set(validated.niceToHaves)];
    validated.topResponsibilities = [...new Set(validated.topResponsibilities)];
    
    return validated;
  }

  /**
   * Fallback rule-based extraction if LLM fails
   */
  private fallbackExtraction(text: string, cfg: JDFlowConfig): JDSchema {
    const lines = text.split(/\n+/);
    const schema: JDSchema = {
      roleTitle: this.extractTitle(text),
      seniority: this.extractSeniority(text),
      mustHaves: [],
      niceToHaves: [],
      topResponsibilities: [],
      hardConstraints: [],
      domain: [],
      conciseSummary: ''
    };
    
    // Extract sections based on keywords
    let currentSection: keyof typeof SECTION_KEYWORDS | null = null;
    
    for (const line of lines) {
      const lower = line.toLowerCase();
      
      // Check for section headers
      for (const [section, keywords] of Object.entries(SECTION_KEYWORDS)) {
        if (keywords.some(kw => lower.includes(kw))) {
          currentSection = section as keyof typeof SECTION_KEYWORDS;
          break;
        }
      }
      
      // Add line to appropriate section
      if (currentSection === 'requirements' && schema.mustHaves.length < 10) {
        const cleaned = this.cleanRequirement(line);
        if (cleaned) schema.mustHaves.push(cleaned);
      } else if (currentSection === 'niceToHave' && schema.niceToHaves.length < 8) {
        const cleaned = this.cleanRequirement(line);
        if (cleaned) schema.niceToHaves.push(cleaned);
      } else if (currentSection === 'responsibilities' && schema.topResponsibilities.length < 8) {
        const cleaned = this.cleanRequirement(line);
        if (cleaned) schema.topResponsibilities.push(cleaned);
      } else if (currentSection === 'constraints') {
        const cleaned = this.cleanRequirement(line);
        if (cleaned) schema.hardConstraints.push(cleaned);
      }
    }
    
    // Extract domain from common industry keywords
    schema.domain = this.extractDomain(text);
    
    // Generate summary
    schema.conciseSummary = this.generateSummary(schema, text, cfg.jdSummaryMaxWords);
    
    return schema;
  }

  /**
   * Helper methods for fallback extraction
   */
  private extractTitle(text: string): string {
    // Look for common title patterns
    const patterns = [
      /(?:job\s+title|position|role):\s*([^\n]+)/i,
      /^([^\n]+)$/m, // First line often contains title
      /seeking\s+(?:a|an)\s+([^\n,]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return 'Software Engineer'; // Default fallback
  }

  private extractSeniority(text: string): string | undefined {
    const lower = text.toLowerCase();
    const levels = ['junior', 'mid-level', 'senior', 'staff', 'principal', 'lead', 'manager', 'director'];
    
    for (const level of levels) {
      if (lower.includes(level)) {
        return level;
      }
    }
    
    // Check years of experience as proxy
    const yearsMatch = text.match(/(\d+)\+?\s*years?\s+(?:of\s+)?experience/i);
    if (yearsMatch) {
      const years = parseInt(yearsMatch[1]);
      if (years <= 2) return 'junior';
      if (years <= 5) return 'mid-level';
      if (years <= 8) return 'senior';
      return 'staff';
    }
    
    return undefined;
  }

  private extractDomain(text: string): string[] {
    const domains: string[] = [];
    const domainKeywords = {
      'healthcare': ['health', 'medical', 'clinical', 'patient', 'hospital'],
      'finance': ['financial', 'banking', 'trading', 'investment', 'fintech'],
      'ecommerce': ['ecommerce', 'retail', 'shopping', 'marketplace'],
      'saas': ['saas', 'subscription', 'cloud', 'platform'],
      'security': ['security', 'cybersecurity', 'infosec', 'compliance'],
      'data': ['data', 'analytics', 'ml', 'ai', 'machine learning'],
      'infrastructure': ['infrastructure', 'devops', 'kubernetes', 'cloud', 'aws']
    };
    
    const lower = text.toLowerCase();
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        domains.push(domain);
      }
    }
    
    return domains;
  }

  private cleanRequirement(line: string): string | null {
    // Remove bullet points, numbers, etc.
    let cleaned = line.replace(/^[\s•\-*\d.]+/, '').trim();
    
    // Skip if too short or too long
    if (cleaned.length < 10 || cleaned.length > 200) return null;
    
    // Skip if it's just a header
    if (cleaned.endsWith(':')) return null;
    
    return cleaned;
  }

  private generateSummary(schema: JDSchema, originalText: string, maxWords: number): string {
    const parts = [
      `${schema.roleTitle} position`,
      schema.seniority ? `at ${schema.seniority} level` : '',
      schema.domain.length ? `in ${schema.domain.join('/')}` : '',
      schema.mustHaves.length ? `requiring ${schema.mustHaves.slice(0, 3).join(', ')}` : '',
      schema.topResponsibilities.length ? `responsible for ${schema.topResponsibilities[0]}` : ''
    ].filter(Boolean);
    
    let summary = parts.join(' ');
    
    // Add key requirements
    if (schema.mustHaves.length > 3) {
      summary += `. Key requirements include ${schema.mustHaves.slice(3, 6).join(', ')}`;
    }
    
    // Trim to word limit
    const words = summary.split(/\s+/);
    if (words.length > maxWords) {
      summary = words.slice(0, maxWords).join(' ');
    }
    
    return summary;
  }

  /**
   * Generate cache key for JD text
   */
  private getCacheKey(text: string): string {
    return `jd_schema_${crypto.createHash('sha256').update(text).digest('hex')}`;
  }
}