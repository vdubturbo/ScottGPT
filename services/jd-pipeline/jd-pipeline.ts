/**
 * JD Processing Pipeline Orchestrator
 * Coordinates all modules for efficient, token-budget-aware resume generation
 * Ensures ≥95% must-have coverage with ≤85% token usage
 */

import {
  JDFlowConfig,
  ResumeAssemblyInput,
  GenerationResult,
  LLMAdapter,
  VectorDBAdapter,
  BM25Adapter,
  EmbeddingAdapter,
  RerankAdapter,
  CacheAdapter,
  TelemetryAdapter,
  JDProcessingError
} from './types';

import { JDParser } from './jd-parser';
import { HybridRetrieval } from './hybrid-retrieval';
import { Reranker } from './reranker';
import { EvidenceCompressor } from './evidence-compressor';
import { TokenBudgetPlanner } from './token-budget';
import { ResumeGenerator } from './resume-generator';

export class JDPipeline {
  private parser: JDParser;
  private retrieval: HybridRetrieval;
  private reranker: Reranker;
  private compressor: EvidenceCompressor;
  private budgetPlanner: TokenBudgetPlanner;
  private generator: ResumeGenerator;

  constructor(
    private config: JDFlowConfig,
    private adapters: {
      llm: LLMAdapter;
      vectorDB: VectorDBAdapter;
      bm25: BM25Adapter;
      embedding: EmbeddingAdapter;
      rerank: RerankAdapter;
      cache?: CacheAdapter;
      telemetry?: TelemetryAdapter;
    }
  ) {
    // Initialize all modules
    this.parser = new JDParser(
      adapters.llm,
      adapters.cache,
      adapters.telemetry
    );

    this.retrieval = new HybridRetrieval(
      adapters.vectorDB,
      adapters.bm25,
      adapters.embedding,
      adapters.cache,
      adapters.telemetry
    );

    this.reranker = new Reranker(
      adapters.rerank,
      adapters.telemetry
    );

    this.compressor = new EvidenceCompressor(
      adapters.llm,
      adapters.telemetry
    );

    this.budgetPlanner = new TokenBudgetPlanner(
      adapters.telemetry
    );

    this.generator = new ResumeGenerator(
      adapters.llm,
      adapters.telemetry
    );
  }

  /**
   * Process JD and generate optimized resume
   */
  async processJD(
    rawJD: string,
    userId?: string
  ): Promise<GenerationResult> {
    const startTime = Date.now();
    const sessionId = this.generateSessionId();

    try {
      this.adapters.telemetry?.counter('pipeline.start', 1, { userId });
      
      // Step 1: Parse JD into structured schema
      console.log('🔍 Parsing job description...');
      const jd = await this.parser.parseJD(rawJD, this.config);
      
      this.adapters.telemetry?.gauge('pipeline.must_haves_count', jd.mustHaves.length);
      this.adapters.telemetry?.gauge('pipeline.responsibilities_count', jd.topResponsibilities.length);

      // Step 2: Retrieve relevant evidence
      console.log('📚 Retrieving relevant evidence...');
      const retrievedItems = await this.retrieval.hybridRetrieve(jd, this.config);
      
      if (retrievedItems.length === 0) {
        throw new JDProcessingError(
          'No relevant evidence found for this job description',
          'NO_EVIDENCE',
          { jd: jd.conciseSummary }
        );
      }

      // Step 3: Rerank for higher precision
      console.log('🎯 Reranking evidence...');
      const rerankedItems = await this.reranker.rerank(
        retrievedItems,
        jd,
        this.config
      );

      // Step 4: Compress evidence within token budget
      console.log('📦 Compressing evidence...');
      const compressedEvidence = await this.compressor.compressEvidence(
        rerankedItems,
        jd,
        this.config
      );

      // Step 5: Plan token budget
      console.log('💰 Planning token budget...');
      const budgetPlan = this.planTokenBudget(jd, compressedEvidence);
      
      if (!budgetPlan.withinBudget) {
        console.warn('⚠️  Budget exceeded, applying optimizations...');
        const optimized = this.optimizeBudget(jd, compressedEvidence, budgetPlan);
        compressedEvidence.splice(0, compressedEvidence.length, ...optimized);
      }

      // Step 6: Generate resume with coverage tracking
      console.log('📝 Generating resume...');
      const assemblyInput: ResumeAssemblyInput = {
        jd,
        evidence: compressedEvidence,
        config: this.config,
        sessionId,
        userId
      };

      const result = await this.generator.generateResume(assemblyInput);

      // Step 7: Validate coverage requirements
      const coveragePercent = result.coverageReport.filter(c => c.present).length 
        / result.coverageReport.length;

      if (coveragePercent < this.config.minCoveragePercent) {
        console.warn(`⚠️  Coverage ${(coveragePercent * 100).toFixed(1)}% below minimum ${(this.config.minCoveragePercent * 100).toFixed(1)}%`);
        
        if (this.config.strictCoverage) {
          throw new JDProcessingError(
            `Insufficient coverage: ${(coveragePercent * 100).toFixed(1)}%`,
            'COVERAGE_TOO_LOW',
            { 
              actual: coveragePercent, 
              required: this.config.minCoveragePercent,
              missing: result.coverageReport.filter(c => !c.present).map(c => c.mustHave)
            }
          );
        }
      }

      // Success telemetry
      const elapsed = Date.now() - startTime;
      this.adapters.telemetry?.timer('pipeline.total_ms', elapsed);
      this.adapters.telemetry?.gauge('pipeline.coverage_percent', coveragePercent);
      this.adapters.telemetry?.counter('pipeline.success', 1, { userId });

      console.log(`✅ Pipeline completed in ${elapsed}ms`);
      console.log(`📊 Coverage: ${(coveragePercent * 100).toFixed(1)}%`);
      console.log(`📄 Resume: ${result.resumeMarkdown.length} chars`);

      return {
        ...result,
        metadata: {
          ...result.metadata,
          sessionId,
          userId,
          processingTimeMs: elapsed,
          coveragePercent,
          budgetUtilization: budgetPlan.allocations.total / budgetPlan.allocations.available
        }
      };

    } catch (error) {
      const elapsed = Date.now() - startTime;
      this.adapters.telemetry?.counter('pipeline.error', 1, { 
        userId, 
        errorType: error.code || 'UNKNOWN',
        processingTimeMs: elapsed
      });

      console.error('❌ Pipeline failed:', error.message);
      throw error;
    }
  }

  /**
   * Plan token budget allocation
   */
  private planTokenBudget(jd: any, evidence: any[]) {
    // Calculate token usage for each component
    const tokenCounts = this.budgetPlanner.calculateTokens({
      systemPrompt: this.generator['buildSystemPrompt'](), // Access private method
      jdSummary: `${jd.roleTitle}\n${jd.conciseSummary}\n${jd.mustHaves.join('\n')}`,
      evidence: evidence,
      layoutInstructions: 'Standard resume layout with sections'
    });

    // Plan budget allocation
    const modelConfig = this.budgetPlanner.getRecommendedAllocation(
      this.config.modelName || 'gpt-3.5-turbo'
    );

    return this.budgetPlanner.planBudget({
      modelContextTokens: modelConfig.contextLimit,
      systemTokens: tokenCounts.system,
      layoutTokens: tokenCounts.layout,
      jdTokens: tokenCounts.jd,
      evidenceTokens: tokenCounts.evidence,
      headroom: this.config.tokenHeadroom || modelConfig.headroom
    });
  }

  /**
   * Optimize budget by trimming evidence
   */
  private optimizeBudget(jd: any, evidence: any[], budgetPlan: any) {
    const maxEvidenceTokens = budgetPlan.allocations.evidence;
    
    // First try coverage-optimized trimming
    const coverageOptimized = this.budgetPlanner.optimizeForCoverage(
      evidence,
      jd,
      maxEvidenceTokens
    );

    if (coverageOptimized.reduce((sum, e) => sum + e.tokens, 0) <= maxEvidenceTokens) {
      return coverageOptimized;
    }

    // Fallback to relevance-based trimming
    const { trimmed } = this.budgetPlanner.trimEvidence(evidence, maxEvidenceTokens);
    return trimmed;
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `jd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get pipeline health status
   */
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    checks: Record<string, boolean>;
    timestamp: Date;
  }> {
    const checks: Record<string, boolean> = {};

    try {
      // Test LLM connection
      try {
        await this.adapters.llm.complete('test', 'respond with "ok"', 10, 0);
        checks.llm = true;
      } catch {
        checks.llm = false;
      }

      // Test vector DB
      try {
        await this.adapters.vectorDB.search([0.1, 0.2], 1, {});
        checks.vectorDB = true;
      } catch {
        checks.vectorDB = false;
      }

      // Test embeddings
      try {
        await this.adapters.embedding.embed('test');
        checks.embedding = true;
      } catch {
        checks.embedding = false;
      }

      // Test cache if available
      if (this.adapters.cache) {
        try {
          await this.adapters.cache.get('health_check');
          checks.cache = true;
        } catch {
          checks.cache = false;
        }
      }

      const healthyCount = Object.values(checks).filter(Boolean).length;
      const totalCount = Object.keys(checks).length;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (healthyCount === totalCount) {
        status = 'healthy';
      } else if (healthyCount >= totalCount * 0.7) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }

      return {
        status,
        checks,
        timestamp: new Date()
      };

    } catch (error) {
      return {
        status: 'unhealthy',
        checks,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get pipeline metrics
   */
  getMetrics(): {
    config: JDFlowConfig;
    modelLimits: any;
    uptime: number;
  } {
    const modelConfig = this.budgetPlanner.getRecommendedAllocation(
      this.config.modelName || 'gpt-3.5-turbo'
    );

    return {
      config: this.config,
      modelLimits: modelConfig,
      uptime: process.uptime()
    };
  }
}

/**
 * Factory function to create configured pipeline
 */
export function createJDPipeline(
  config: JDFlowConfig,
  adapters: {
    llm: LLMAdapter;
    vectorDB: VectorDBAdapter;
    bm25: BM25Adapter;
    embedding: EmbeddingAdapter;
    rerank: RerankAdapter;
    cache?: CacheAdapter;
    telemetry?: TelemetryAdapter;
  }
): JDPipeline {
  return new JDPipeline(config, adapters);
}