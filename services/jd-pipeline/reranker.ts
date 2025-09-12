/**
 * Reranking Module
 * Uses cross-encoder models to rerank retrieved evidence
 * Provides higher precision than initial retrieval
 */

import {
  RetrievedItem,
  JDSchema,
  JDFlowConfig,
  RerankAdapter,
  TelemetryAdapter,
  JDProcessingError
} from './types';

export class Reranker {
  constructor(
    private rerankModel: RerankAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Rerank retrieved items using cross-encoder
   */
  async rerank(
    items: RetrievedItem[],
    jd: JDSchema,
    cfg: JDFlowConfig
  ): Promise<RetrievedItem[]> {
    const startTime = Date.now();

    try {
      // Skip if too few items
      if (items.length <= cfg.keepAfterRerank) {
        this.telemetry?.counter('reranker.skip_too_few', 1);
        return items;
      }

      // Prepare query from JD
      const query = this.buildRerankQuery(jd);

      // Prepare documents
      const documents = items.map(item => this.formatChunkForReranking(item));

      // Rerank using cross-encoder
      const scores = await this.rerankModel.rerank(
        query,
        documents,
        cfg.keepAfterRerank
      );

      // Map scores back to items
      const rerankedItems: RetrievedItem[] = scores.map(({ index, score }) => ({
        ...items[index],
        score: this.normalizeScore(score, items[index].score)
      }));

      // Sort by new scores and keep top K
      const topItems = rerankedItems
        .sort((a, b) => b.score - a.score)
        .slice(0, cfg.keepAfterRerank);

      // Telemetry
      const elapsed = Date.now() - startTime;
      this.telemetry?.timer('reranker.rerank_ms', elapsed);
      this.telemetry?.gauge('reranker.input_items', items.length);
      this.telemetry?.gauge('reranker.output_items', topItems.length);
      
      // Log score distribution
      if (topItems.length > 0) {
        const avgScore = topItems.reduce((sum, item) => sum + item.score, 0) / topItems.length;
        this.telemetry?.gauge('reranker.avg_score', avgScore);
      }

      return topItems;

    } catch (error) {
      this.telemetry?.counter('reranker.error', 1);
      
      // Fallback to original items if reranking fails
      console.warn('Reranking failed, using original order:', error);
      return items.slice(0, cfg.keepAfterRerank);
    }
  }

  /**
   * Build optimized query for reranking
   */
  private buildRerankQuery(jd: JDSchema): string {
    // Focus on must-haves and key responsibilities for reranking
    const parts = [
      jd.roleTitle,
      jd.seniority ? `${jd.seniority} level` : '',
      'Must have:',
      ...jd.mustHaves.slice(0, 5).map(req => `- ${req}`),
      'Key responsibilities:',
      ...jd.topResponsibilities.slice(0, 3).map(resp => `- ${resp}`)
    ];

    return parts.filter(Boolean).join('\n');
  }

  /**
   * Format chunk for reranking
   */
  private formatChunkForReranking(item: RetrievedItem): string {
    const chunk = item.chunk;
    const parts: string[] = [chunk.text];

    // Add relevant metadata to improve reranking
    if (chunk.meta.role) {
      parts.unshift(`Role: ${chunk.meta.role}`);
    }
    if (chunk.meta.skills && chunk.meta.skills.length > 0) {
      parts.push(`Skills: ${chunk.meta.skills.slice(0, 5).join(', ')}`);
    }
    if (chunk.meta.metrics && chunk.meta.metrics.length > 0) {
      parts.push(`Metrics: ${chunk.meta.metrics.join(', ')}`);
    }

    return parts.join('\n');
  }

  /**
   * Normalize and combine scores
   */
  private normalizeScore(rerankScore: number, originalScore: number): number {
    // Weighted combination of rerank and original scores
    // Give more weight to rerank score as it's more precise
    const rerankWeight = 0.8;
    const originalWeight = 0.2;

    // Normalize rerank score to [0, 1] if needed
    const normalizedRerank = Math.max(0, Math.min(1, rerankScore));

    return (normalizedRerank * rerankWeight) + (originalScore * originalWeight);
  }
}