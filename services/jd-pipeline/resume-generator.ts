/**
 * Resume Generation Module
 * Generates ATS-optimized resumes with coverage tracking
 * Ensures all must-haves are addressed with evidence
 */

import {
  ResumeAssemblyInput,
  GenerationResult,
  JDSchema,
  LLMAdapter,
  TelemetryAdapter,
  JDProcessingError,
  MustHaveCoverageError
} from './types';

export class ResumeGenerator {
  constructor(
    private llm: LLMAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Generate resume with coverage tracking
   */
  async generateResume(input: ResumeAssemblyInput): Promise<GenerationResult> {
    const startTime = Date.now();

    try {
      // Build prompts
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(input);

      // Generate resume
      const response = await this.llm.complete(
        systemPrompt,
        userPrompt,
        2000, // Max tokens for resume
        0.3   // Low temperature for consistency
      );

      // Parse and validate response
      const result = this.parseGenerationResponse(response.text, input);
      
      // Add metadata
      result.tokensUsed = response.tokensUsed;
      result.metadata = {
        generatedAt: new Date(),
        modelUsed: 'configured-model',
        temperature: 0.3
      };

      // Verify coverage
      const verified = this.verifyCoverage(result, input.jd);

      // Telemetry
      const elapsed = Date.now() - startTime;
      this.telemetry?.timer('generator.generate_ms', elapsed);
      this.telemetry?.gauge('generator.tokens.prompt', result.tokensUsed.prompt);
      this.telemetry?.gauge('generator.tokens.completion', result.tokensUsed.completion);
      this.telemetry?.gauge('generator.coverage', 
        verified.coverageReport.filter(c => c.present).length / verified.coverageReport.length);

      return verified;

    } catch (error) {
      this.telemetry?.counter('generator.error', 1);
      throw new JDProcessingError(
        'Resume generation failed',
        'GENERATION_ERROR',
        error
      );
    }
  }

  /**
   * Build system prompt for generation
   */
  private buildSystemPrompt(): string {
    return `You are an expert resume writer creating ATS-optimized resumes.

CRITICAL REQUIREMENTS:
1. Every must-have requirement MUST appear at least once in the resume
2. Include evidence IDs in HTML comments: <!-- evidence:chunk_id -->
3. Use strong action verbs and quantifiable metrics
4. Follow strict ATS formatting (no tables, graphics, or special characters)
5. Organize in standard sections: Summary, Experience, Skills, Education

FORMATTING RULES:
- Use markdown format
- Bullet points start with action verbs
- Include metrics and percentages where available
- Keep bullets concise (1-2 lines max)
- Group similar experiences logically

OUTPUT STRUCTURE:
# [Full Name]
[Contact Info]

## Professional Summary
[2-3 sentences highlighting key qualifications]

## Professional Experience
### [Role Title] at [Company] (Dates)
<!-- evidence:chunk_id1 -->
- [Achievement/responsibility with metrics]
<!-- evidence:chunk_id2 -->
- [Achievement/responsibility with metrics]

## Technical Skills
[Categorized skill lists]

## Education
[Degree, School, Year]`;
  }

  /**
   * Build user prompt with JD and evidence
   */
  private buildUserPrompt(input: ResumeAssemblyInput): string {
    const parts: string[] = [];

    // JD context
    parts.push('TARGET JOB:');
    parts.push(`Title: ${input.jd.roleTitle}`);
    if (input.jd.seniority) {
      parts.push(`Level: ${input.jd.seniority}`);
    }
    parts.push('\nMUST-HAVE REQUIREMENTS:');
    input.jd.mustHaves.forEach((req, i) => {
      parts.push(`${i + 1}. ${req}`);
    });

    parts.push('\nKEY RESPONSIBILITIES:');
    input.jd.topResponsibilities.slice(0, 5).forEach((resp, i) => {
      parts.push(`${i + 1}. ${resp}`);
    });

    // Evidence
    parts.push('\nAVAILABLE EVIDENCE:');
    for (const evidence of input.evidence) {
      parts.push(`\nEvidence ID: ${evidence.id}`);
      evidence.lines.forEach(line => {
        parts.push(`- ${line}`);
      });
    }

    // Instructions
    parts.push('\nGENERATE A RESUME:');
    parts.push('1. Address ALL must-have requirements using the provided evidence');
    parts.push('2. Include evidence IDs in HTML comments');
    parts.push('3. Optimize for ATS scanning');
    parts.push('4. Focus on achievements and metrics');

    return parts.join('\n');
  }

  /**
   * Parse generation response
   */
  private parseGenerationResponse(
    responseText: string,
    input: ResumeAssemblyInput
  ): GenerationResult {
    // Extract evidence IDs from comments
    const evidencePattern = /<!-- evidence:([^>]+) -->/g;
    const evidenceIds: string[] = [];
    let match;

    while ((match = evidencePattern.exec(responseText)) !== null) {
      evidenceIds.push(match[1].trim());
    }

    // Build initial coverage report
    const coverageReport = input.jd.mustHaves.map(mustHave => ({
      mustHave,
      present: false,
      evidenceIds: [] as string[]
    }));

    // Check coverage
    for (const report of coverageReport) {
      const requirement = report.mustHave.toLowerCase();
      
      // Check if requirement appears in resume text
      if (responseText.toLowerCase().includes(requirement)) {
        report.present = true;
      }

      // Find evidence IDs that map to this requirement
      for (const evidence of input.evidence) {
        if (evidence.mappedToRequirements?.includes(report.mustHave)) {
          if (evidenceIds.includes(evidence.id)) {
            report.evidenceIds.push(evidence.id);
            report.present = true;
          }
        }
      }
    }

    return {
      resumeMarkdown: responseText,
      coverageReport,
      tokensUsed: { prompt: 0, completion: 0 } // Will be updated
    };
  }

  /**
   * Verify and enhance coverage
   */
  verifyCoverage(
    result: GenerationResult,
    jd: Pick<JDSchema, 'mustHaves' | 'topResponsibilities'>
  ): GenerationResult {
    const missing: string[] = [];
    
    // Check each must-have
    for (const item of result.coverageReport) {
      if (!item.present) {
        // Try fuzzy matching
        const resumeLower = result.resumeMarkdown.toLowerCase();
        const keywords = item.mustHave.toLowerCase().split(/\s+/);
        
        // If most keywords are present, mark as covered
        const foundKeywords = keywords.filter(kw => resumeLower.includes(kw));
        if (foundKeywords.length >= keywords.length * 0.7) {
          item.present = true;
        } else {
          missing.push(item.mustHave);
        }
      }
    }

    // Calculate coverage percentage
    const coveragePercent = result.coverageReport.filter(c => c.present).length 
      / result.coverageReport.length;

    this.telemetry?.gauge('generator.coverage_percent', coveragePercent);

    // Warn if coverage is low
    if (coveragePercent < 0.8) {
      console.warn(`Low must-have coverage: ${(coveragePercent * 100).toFixed(1)}%`);
      console.warn('Missing requirements:', missing);
    }

    // Don't throw error, just log - let the system handle partial coverage
    if (missing.length > 0) {
      this.telemetry?.counter('generator.missing_requirements', missing.length);
    }

    return result;
  }

  /**
   * Post-process resume for quality
   */
  postProcess(markdown: string): string {
    let processed = markdown;

    // Remove duplicate skills
    processed = this.dedupeSkills(processed);

    // Ensure consistent formatting
    processed = this.normalizeFormatting(processed);

    // Validate length
    processed = this.enforceLength(processed);

    return processed;
  }

  /**
   * Remove duplicate skills
   */
  private dedupeSkills(text: string): string {
    // Find skills section
    const skillsMatch = text.match(/## (?:Technical )?Skills[\s\S]*?(?=##|$)/i);
    if (!skillsMatch) return text;

    const skillsSection = skillsMatch[0];
    const skills = new Set<string>();
    
    // Extract unique skills
    const lines = skillsSection.split('\n');
    const processedLines: string[] = [lines[0]]; // Keep header

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const skillItems = line.split(/[,;•·]/).map(s => s.trim().toLowerCase());
      
      const uniqueItems = skillItems.filter(item => {
        if (!item || skills.has(item)) return false;
        skills.add(item);
        return true;
      });

      if (uniqueItems.length > 0) {
        processedLines.push(uniqueItems.map(s => 
          s.charAt(0).toUpperCase() + s.slice(1)
        ).join(', '));
      }
    }

    return text.replace(skillsSection, processedLines.join('\n'));
  }

  /**
   * Normalize formatting
   */
  private normalizeFormatting(text: string): string {
    return text
      // Fix bullet points
      .replace(/^-\s+/gm, '• ')
      .replace(/^\*\s+/gm, '• ')
      // Fix spacing
      .replace(/\n{3,}/g, '\n\n')
      // Remove trailing spaces
      .replace(/ +$/gm, '')
      // Ensure headers have proper spacing
      .replace(/^(#{1,3}[^#\n]+)$/gm, '\n$1\n');
  }

  /**
   * Enforce length constraints
   */
  private enforceLength(text: string, maxLines = 100): string {
    const lines = text.split('\n');
    
    if (lines.length <= maxLines) return text;

    // Prioritize keeping summary and recent experience
    const sections = text.split(/^##/m);
    const prioritized: string[] = [];
    let lineCount = 0;

    // Keep header and summary
    if (sections[0]) {
      prioritized.push(sections[0]);
      lineCount += sections[0].split('\n').length;
    }

    // Keep other sections in order until we hit limit
    for (let i = 1; i < sections.length && lineCount < maxLines; i++) {
      const sectionLines = sections[i].split('\n');
      if (lineCount + sectionLines.length <= maxLines) {
        prioritized.push('##' + sections[i]);
        lineCount += sectionLines.length;
      } else {
        // Truncate this section
        const remainingLines = maxLines - lineCount;
        prioritized.push('##' + sectionLines.slice(0, remainingLines).join('\n'));
        break;
      }
    }

    return prioritized.join('');
  }
}