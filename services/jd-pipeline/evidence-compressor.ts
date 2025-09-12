/**
 * Evidence Compression Module
 * Extracts only the most relevant lines from chunks
 * Manages token budget constraints
 */

import {
  RetrievedItem,
  CompressedEvidence,
  JDSchema,
  JDFlowConfig,
  LLMAdapter,
  TelemetryAdapter,
  TokenBudgetExceededError
} from './types';

export class EvidenceCompressor {
  private readonly TOKENS_PER_CHAR = 0.25; // Rough estimate: 1 token ≈ 4 chars

  constructor(
    private llm: LLMAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Compress evidence to fit within token budget
   */
  async compressEvidence(
    items: RetrievedItem[],
    jd: JDSchema,
    cfg: JDFlowConfig
  ): Promise<CompressedEvidence[]> {
    const startTime = Date.now();
    const compressed: CompressedEvidence[] = [];
    let totalTokens = 0;

    try {
      // Sort by relevance score
      const sorted = [...items].sort((a, b) => b.score - a.score);

      // Process each item
      for (const item of sorted) {
        // Check if we have budget remaining
        const remainingBudget = cfg.evidenceTokenBudget - totalTokens;
        if (remainingBudget < 50) break; // Min 50 tokens per evidence

        // Compress the chunk
        const compressedChunk = await this.compressChunk(
          item,
          jd,
          remainingBudget
        );

        // Skip if compression failed or too small
        if (!compressedChunk || compressedChunk.tokens < 10) continue;

        // Check if adding this would exceed budget
        if (totalTokens + compressedChunk.tokens > cfg.evidenceTokenBudget) {
          // Try to fit partial content
          const trimmed = this.trimToFit(compressedChunk, remainingBudget);
          if (trimmed.tokens > 0) {
            compressed.push(trimmed);
            totalTokens += trimmed.tokens;
          }
          break;
        }

        compressed.push(compressedChunk);
        totalTokens += compressedChunk.tokens;
      }

      // Ensure we have minimum viable evidence
      if (compressed.length === 0 && items.length > 0) {
        // Force include at least one compressed item
        const fallback = await this.extractKeyLines(
          items[0].chunk.text,
          jd,
          cfg.evidenceTokenBudget
        );
        compressed.push({
          id: items[0].chunk.id,
          lines: fallback,
          tokens: this.estimateTokens(fallback.join('\n')),
          relevanceScore: items[0].score
        });
      }

      // Telemetry
      const elapsed = Date.now() - startTime;
      this.telemetry?.timer('compressor.compress_ms', elapsed);
      this.telemetry?.gauge('compressor.input_items', items.length);
      this.telemetry?.gauge('compressor.output_items', compressed.length);
      this.telemetry?.gauge('compressor.total_tokens', totalTokens);
      this.telemetry?.gauge('compressor.compression_ratio', 
        items.length > 0 ? compressed.length / items.length : 0);

      return compressed;

    } catch (error) {
      this.telemetry?.counter('compressor.error', 1);
      throw error;
    }
  }

  /**
   * Compress a single chunk
   */
  private async compressChunk(
    item: RetrievedItem,
    jd: JDSchema,
    maxTokens: number
  ): Promise<CompressedEvidence | null> {
    try {
      const chunk = item.chunk;
      
      // Use LLM for intelligent compression
      const lines = await this.extractRelevantLines(
        chunk.text,
        jd,
        maxTokens
      );

      if (lines.length === 0) return null;

      // Map to requirements
      const mappedRequirements = this.mapToRequirements(lines, jd);

      return {
        id: chunk.id,
        lines,
        tokens: this.estimateTokens(lines.join('\n')),
        relevanceScore: item.score,
        mappedToRequirements
      };

    } catch (error) {
      // Fallback to rule-based extraction
      const lines = await this.extractKeyLines(
        item.chunk.text,
        jd,
        maxTokens
      );

      return {
        id: item.chunk.id,
        lines,
        tokens: this.estimateTokens(lines.join('\n')),
        relevanceScore: item.score
      };
    }
  }

  /**
   * Extract relevant lines using LLM
   */
  private async extractRelevantLines(
    text: string,
    jd: JDSchema,
    maxTokens: number
  ): Promise<string[]> {
    const systemPrompt = `You are a resume evidence extractor. Extract only the most relevant lines that directly address job requirements.

Rules:
1. Keep only lines with specific achievements, metrics, or skills
2. Preserve quantifiable impacts (%, $, time saved, etc.)
3. Keep technical skills and tools mentioned
4. Remove generic statements
5. Each line should be self-contained and meaningful
6. Output as JSON array of strings`;

    const userPrompt = `Job Requirements:
${jd.mustHaves.slice(0, 5).join('\n')}

Extract relevant lines from this text:
${text}

Max output tokens: ${Math.min(maxTokens, 300)}`;

    const response = await this.llm.complete(
      systemPrompt,
      userPrompt,
      Math.min(maxTokens, 300),
      0.1
    );

    try {
      const parsed = JSON.parse(response.text);
      if (Array.isArray(parsed)) {
        return parsed.filter(line => 
          typeof line === 'string' && line.length > 10
        );
      }
    } catch {
      // Parse failed, try line splitting
      return response.text
        .split('\n')
        .filter(line => line.trim().length > 10)
        .map(line => line.replace(/^[-•*]\s*/, '').trim());
    }

    return [];
  }

  /**
   * Fallback: Extract key lines using rules
   */
  private async extractKeyLines(
    text: string,
    jd: JDSchema,
    maxTokens: number
  ): Promise<string[]> {
    const lines = text.split(/[.\n]/);
    const scored: { line: string; score: number }[] = [];

    for (const line of lines) {
      const cleaned = line.trim();
      if (cleaned.length < 20 || cleaned.length > 300) continue;

      let score = 0;

      // Check for metrics
      if (/\d+[%$]|\d+x|\d+\+/.test(cleaned)) score += 3;

      // Check for skills from JD
      for (const skill of jd.mustHaves) {
        if (cleaned.toLowerCase().includes(skill.toLowerCase())) {
          score += 2;
        }
      }

      // Check for action verbs
      const actionVerbs = ['led', 'built', 'designed', 'implemented', 'managed', 
                          'developed', 'architected', 'optimized', 'reduced', 'increased'];
      if (actionVerbs.some(verb => cleaned.toLowerCase().startsWith(verb))) {
        score += 1;
      }

      if (score > 0) {
        scored.push({ line: cleaned, score });
      }
    }

    // Sort by score and take top lines within budget
    scored.sort((a, b) => b.score - a.score);
    
    const selected: string[] = [];
    let tokenCount = 0;

    for (const { line } of scored) {
      const lineTokens = this.estimateTokens(line);
      if (tokenCount + lineTokens > maxTokens) break;
      selected.push(line);
      tokenCount += lineTokens;
    }

    return selected;
  }

  /**
   * Map extracted lines to JD requirements
   */
  private mapToRequirements(lines: string[], jd: JDSchema): string[] {
    const mapped: Set<string> = new Set();

    for (const line of lines) {
      const lower = line.toLowerCase();

      // Check must-haves
      for (const req of jd.mustHaves) {
        if (lower.includes(req.toLowerCase()) || 
            this.fuzzyMatch(lower, req.toLowerCase())) {
          mapped.add(req);
        }
      }

      // Check responsibilities
      for (const resp of jd.topResponsibilities) {
        const keywords = resp.toLowerCase().split(/\s+/).slice(0, 3);
        if (keywords.some(kw => lower.includes(kw))) {
          mapped.add(resp);
        }
      }
    }

    return Array.from(mapped);
  }

  /**
   * Simple fuzzy matching
   */
  private fuzzyMatch(text: string, pattern: string, threshold = 0.7): boolean {
    const words = pattern.split(/\s+/);
    const matches = words.filter(word => text.includes(word));
    return matches.length / words.length >= threshold;
  }

  /**
   * Trim evidence to fit budget
   */
  private trimToFit(evidence: CompressedEvidence, maxTokens: number): CompressedEvidence {
    const trimmed: string[] = [];
    let tokenCount = 0;

    for (const line of evidence.lines) {
      const lineTokens = this.estimateTokens(line);
      if (tokenCount + lineTokens > maxTokens) break;
      trimmed.push(line);
      tokenCount += lineTokens;
    }

    return {
      ...evidence,
      lines: trimmed,
      tokens: tokenCount
    };
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length * this.TOKENS_PER_CHAR);
  }
}