/**
 * Token Budget Management Module
 * Ensures prompts stay within model context limits
 * Provides budget allocation and trimming strategies
 */

import {
  CompressedEvidence,
  JDSchema,
  JDFlowConfig,
  TelemetryAdapter,
  TokenBudgetExceededError
} from './types';

export interface BudgetPlan {
  withinBudget: boolean;
  trimmedEvidenceIds: string[];
  allocations: {
    system: number;
    jd: number;
    evidence: number;
    layout: number;
    buffer: number;
    total: number;
    available: number;
  };
  recommendations?: string[];
}

export class TokenBudgetPlanner {
  private readonly TOKENS_PER_CHAR = 0.25;

  constructor(
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Plan token budget allocation
   */
  planBudget(params: {
    modelContextTokens: number;
    systemTokens: number;
    layoutTokens: number;
    jdTokens: number;
    evidenceTokens: number;
    headroom: number;
  }): BudgetPlan {
    const { 
      modelContextTokens, 
      systemTokens, 
      layoutTokens, 
      jdTokens, 
      evidenceTokens, 
      headroom 
    } = params;

    // Calculate buffer
    const bufferTokens = Math.ceil(modelContextTokens * headroom);
    
    // Calculate available tokens for content
    const availableForContent = modelContextTokens - bufferTokens;
    
    // Calculate fixed costs
    const fixedCosts = systemTokens + layoutTokens + jdTokens;
    
    // Calculate available for evidence
    const availableForEvidence = availableForContent - fixedCosts;
    
    // Check if within budget
    const totalRequired = fixedCosts + evidenceTokens;
    const withinBudget = totalRequired <= availableForContent;
    
    // Build allocation breakdown
    const allocations = {
      system: systemTokens,
      jd: jdTokens,
      evidence: Math.min(evidenceTokens, availableForEvidence),
      layout: layoutTokens,
      buffer: bufferTokens,
      total: fixedCosts + Math.min(evidenceTokens, availableForEvidence),
      available: modelContextTokens
    };
    
    // Generate recommendations if over budget
    const recommendations: string[] = [];
    if (!withinBudget) {
      const excess = totalRequired - availableForContent;
      recommendations.push(`Reduce evidence by ${excess} tokens`);
      
      if (jdTokens > 500) {
        recommendations.push('Consider shortening JD summary');
      }
      if (systemTokens > 500) {
        recommendations.push('Optimize system prompt');
      }
      if (headroom > 0.2) {
        recommendations.push('Reduce safety headroom to 15%');
      }
    }

    // Telemetry
    this.telemetry?.gauge('budget.model_context', modelContextTokens);
    this.telemetry?.gauge('budget.total_used', allocations.total);
    this.telemetry?.gauge('budget.utilization', allocations.total / modelContextTokens);
    this.telemetry?.counter('budget.within_limit', withinBudget ? 1 : 0);

    return {
      withinBudget,
      trimmedEvidenceIds: [], // Will be populated by trimEvidence
      allocations,
      recommendations
    };
  }

  /**
   * Trim evidence to fit within budget
   */
  trimEvidence(
    evidence: CompressedEvidence[],
    maxTokens: number
  ): { trimmed: CompressedEvidence[]; removedIds: string[] } {
    // Sort by relevance score
    const sorted = [...evidence].sort((a, b) => 
      (b.relevanceScore || 0) - (a.relevanceScore || 0)
    );

    const trimmed: CompressedEvidence[] = [];
    const removedIds: string[] = [];
    let totalTokens = 0;

    for (const item of sorted) {
      if (totalTokens + item.tokens <= maxTokens) {
        trimmed.push(item);
        totalTokens += item.tokens;
      } else {
        // Try to fit partial content
        const remainingBudget = maxTokens - totalTokens;
        if (remainingBudget > 50) { // Min viable chunk
          const partialItem = this.trimItem(item, remainingBudget);
          if (partialItem.tokens > 0) {
            trimmed.push(partialItem);
            totalTokens += partialItem.tokens;
          } else {
            removedIds.push(item.id);
          }
        } else {
          removedIds.push(item.id);
        }
      }
    }

    this.telemetry?.gauge('budget.evidence_trimmed', removedIds.length);
    this.telemetry?.gauge('budget.evidence_retained', trimmed.length);

    return { trimmed, removedIds };
  }

  /**
   * Calculate tokens for different content types
   */
  calculateTokens(content: {
    systemPrompt?: string;
    jdSummary?: string;
    evidence?: CompressedEvidence[];
    layoutInstructions?: string;
  }): {
    system: number;
    jd: number;
    evidence: number;
    layout: number;
    total: number;
  } {
    const system = content.systemPrompt ? 
      this.estimateTokens(content.systemPrompt) : 0;
    
    const jd = content.jdSummary ? 
      this.estimateTokens(content.jdSummary) : 0;
    
    const evidence = content.evidence ? 
      content.evidence.reduce((sum, e) => sum + e.tokens, 0) : 0;
    
    const layout = content.layoutInstructions ? 
      this.estimateTokens(content.layoutInstructions) : 0;

    return {
      system,
      jd,
      evidence,
      layout,
      total: system + jd + evidence + layout
    };
  }

  /**
   * Validate budget against model limits
   */
  validateBudget(
    totalTokens: number,
    modelLimit: number,
    headroom: number
  ): void {
    const maxAllowed = modelLimit * (1 - headroom);
    
    if (totalTokens > maxAllowed) {
      throw new TokenBudgetExceededError(totalTokens, maxAllowed);
    }
  }

  /**
   * Get recommended budget allocation for different models
   */
  getRecommendedAllocation(modelName: string): {
    contextLimit: number;
    systemBudget: number;
    jdBudget: number;
    evidenceBudget: number;
    layoutBudget: number;
    headroom: number;
  } {
    const allocations: Record<string, any> = {
      'gpt-3.5-turbo': {
        contextLimit: 4096,
        systemBudget: 300,
        jdBudget: 400,
        evidenceBudget: 2400,
        layoutBudget: 200,
        headroom: 0.20
      },
      'gpt-3.5-turbo-16k': {
        contextLimit: 16384,
        systemBudget: 500,
        jdBudget: 600,
        evidenceBudget: 12000,
        layoutBudget: 300,
        headroom: 0.15
      },
      'gpt-4': {
        contextLimit: 8192,
        systemBudget: 400,
        jdBudget: 500,
        evidenceBudget: 5500,
        layoutBudget: 250,
        headroom: 0.15
      },
      'gpt-4-turbo': {
        contextLimit: 128000,
        systemBudget: 800,
        jdBudget: 1000,
        evidenceBudget: 100000,
        layoutBudget: 500,
        headroom: 0.10
      },
      'claude-3': {
        contextLimit: 200000,
        systemBudget: 1000,
        jdBudget: 1200,
        evidenceBudget: 150000,
        layoutBudget: 600,
        headroom: 0.10
      }
    };

    return allocations[modelName] || allocations['gpt-3.5-turbo'];
  }

  /**
   * Optimize evidence distribution for coverage
   */
  optimizeForCoverage(
    evidence: CompressedEvidence[],
    jd: JDSchema,
    maxTokens: number
  ): CompressedEvidence[] {
    // Group evidence by mapped requirements
    const requirementMap = new Map<string, CompressedEvidence[]>();
    const unmapped: CompressedEvidence[] = [];

    for (const item of evidence) {
      if (item.mappedToRequirements && item.mappedToRequirements.length > 0) {
        for (const req of item.mappedToRequirements) {
          if (!requirementMap.has(req)) {
            requirementMap.set(req, []);
          }
          requirementMap.get(req)!.push(item);
        }
      } else {
        unmapped.push(item);
      }
    }

    // Ensure each must-have has at least one evidence
    const optimized: CompressedEvidence[] = [];
    const usedIds = new Set<string>();
    let totalTokens = 0;

    // First pass: One evidence per must-have
    for (const mustHave of jd.mustHaves) {
      const candidates = requirementMap.get(mustHave) || [];
      if (candidates.length > 0) {
        // Pick highest scoring evidence for this requirement
        const best = candidates
          .filter(c => !usedIds.has(c.id))
          .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))[0];
        
        if (best && totalTokens + best.tokens <= maxTokens) {
          optimized.push(best);
          usedIds.add(best.id);
          totalTokens += best.tokens;
        }
      }
    }

    // Second pass: Add remaining high-value evidence
    const remaining = evidence
      .filter(e => !usedIds.has(e.id))
      .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    for (const item of remaining) {
      if (totalTokens + item.tokens <= maxTokens) {
        optimized.push(item);
        totalTokens += item.tokens;
      }
    }

    return optimized;
  }

  /**
   * Trim individual evidence item
   */
  private trimItem(item: CompressedEvidence, maxTokens: number): CompressedEvidence {
    const trimmedLines: string[] = [];
    let tokenCount = 0;

    for (const line of item.lines) {
      const lineTokens = this.estimateTokens(line);
      if (tokenCount + lineTokens <= maxTokens) {
        trimmedLines.push(line);
        tokenCount += lineTokens;
      } else {
        break;
      }
    }

    return {
      ...item,
      lines: trimmedLines,
      tokens: tokenCount
    };
  }

  /**
   * Estimate tokens for text
   */
  private estimateTokens(text: string): number {
    // More accurate estimation based on common patterns
    const wordCount = text.split(/\s+/).length;
    const charCount = text.length;
    
    // Use hybrid approach: average of word-based and char-based estimates
    const wordBasedEstimate = wordCount * 1.3; // ~1.3 tokens per word
    const charBasedEstimate = charCount * this.TOKENS_PER_CHAR;
    
    return Math.ceil((wordBasedEstimate + charBasedEstimate) / 2);
  }
}