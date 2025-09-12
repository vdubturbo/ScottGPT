/**
 * Hybrid Retrieval Module
 * Combines dense vector search with BM25 text search
 * Applies metadata filtering and result fusion
 */

import {
  JDSchema,
  JDFlowConfig,
  RetrievedItem,
  EvidenceChunk,
  VectorDBAdapter,
  BM25Adapter,
  EmbeddingAdapter,
  CacheAdapter,
  TelemetryAdapter,
  JDProcessingError
} from './types';

export class HybridRetrieval {
  constructor(
    private vectorDB: VectorDBAdapter,
    private bm25: BM25Adapter,
    private embedder: EmbeddingAdapter,
    private cache?: CacheAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Perform hybrid retrieval combining dense and BM25 search
   */
  async hybridRetrieve(
    jd: JDSchema,
    cfg: JDFlowConfig
  ): Promise<RetrievedItem[]> {
    const startTime = Date.now();

    try {
      // Generate cache key
      const cacheKey = this.getCacheKey(jd, cfg);
      if (this.cache && cfg.cacheEnabled) {
        const cached = await this.cache.get(cacheKey);
        if (cached) {
          this.telemetry?.counter('retrieval.cache_hit', 1);
          return cached as RetrievedItem[];
        }
      }

      // Build search queries
      const searchQuery = this.buildSearchQuery(jd);
      const filters = this.buildFilters(jd);

      // Parallel retrieval
      const [denseResults, bm25Results] = await Promise.all([
        this.denseSearch(searchQuery, cfg.topKAnn, filters),
        this.textSearch(searchQuery, cfg.topKBm25 || 50, filters)
      ]);

      // Fuse results
      const fused = this.fuseResults(
        denseResults,
        bm25Results,
        cfg.hybridMixWeight || 0.7
      );

      // Apply hard filters
      const filtered = this.applyHardFilters(fused, jd);

      // Sort by final score and limit
      const sorted = filtered
        .sort((a, b) => b.score - a.score)
        .slice(0, cfg.topKAnn);

      // Cache results
      if (this.cache && cfg.cacheEnabled) {
        await this.cache.set(cacheKey, sorted, cfg.cacheTTLSeconds);
      }

      // Telemetry
      const elapsed = Date.now() - startTime;
      this.telemetry?.timer('retrieval.hybrid_ms', elapsed);
      this.telemetry?.gauge('retrieval.dense_results', denseResults.length);
      this.telemetry?.gauge('retrieval.bm25_results', bm25Results.length);
      this.telemetry?.gauge('retrieval.final_results', sorted.length);

      return sorted;

    } catch (error) {
      this.telemetry?.counter('retrieval.error', 1);
      throw new JDProcessingError(
        'Hybrid retrieval failed',
        'RETRIEVAL_ERROR',
        error
      );
    }
  }

  /**
   * Build optimized search query from JD
   */
  private buildSearchQuery(jd: JDSchema): string {
    const parts = [
      // Primary: concise summary
      jd.conciseSummary,
      
      // Expanded must-haves with synonyms
      ...this.expandRequirements(jd.mustHaves.slice(0, 5)),
      
      // Key responsibilities
      ...jd.topResponsibilities.slice(0, 3)
    ];

    return parts.filter(Boolean).join(' ');
  }

  /**
   * Expand requirements with common synonyms
   */
  private expandRequirements(requirements: string[]): string[] {
    const synonymMap: Record<string, string[]> = {
      'python': ['python', 'py', 'python3'],
      'javascript': ['javascript', 'js', 'node', 'nodejs'],
      'react': ['react', 'reactjs', 'react.js'],
      'aws': ['aws', 'amazon web services', 'ec2', 's3'],
      'docker': ['docker', 'containerization', 'containers'],
      'kubernetes': ['kubernetes', 'k8s', 'orchestration'],
      'ci/cd': ['ci/cd', 'continuous integration', 'continuous deployment', 'cicd'],
      'agile': ['agile', 'scrum', 'sprint', 'kanban'],
      'leadership': ['leadership', 'lead', 'manage', 'mentor'],
      'ml': ['machine learning', 'ml', 'ai', 'artificial intelligence']
    };

    const expanded: string[] = [];
    
    for (const req of requirements) {
      const lower = req.toLowerCase();
      let added = false;
      
      // Check for synonym matches
      for (const [key, synonyms] of Object.entries(synonymMap)) {
        if (lower.includes(key)) {
          expanded.push(synonyms.join(' '));
          added = true;
          break;
        }
      }
      
      if (!added) {
        expanded.push(req);
      }
    }

    return expanded;
  }

  /**
   * Build metadata filters from JD
   */
  private buildFilters(jd: JDSchema): Record<string, any> {
    const filters: Record<string, any> = {};

    // Domain filters
    if (jd.domain && jd.domain.length > 0) {
      filters.domain = { $in: jd.domain };
    }

    // Seniority filter
    if (jd.seniority) {
      filters.seniority = this.mapSeniorityFilter(jd.seniority);
    }

    // Hard constraints (security, cloud requirements)
    const securityReqs = this.extractSecurityRequirements(jd.hardConstraints);
    if (securityReqs.length > 0) {
      filters.security = { $in: securityReqs };
    }

    const cloudReqs = this.extractCloudRequirements(jd.mustHaves);
    if (cloudReqs.length > 0) {
      filters.cloud = { $in: cloudReqs };
    }

    return filters;
  }

  /**
   * Perform dense vector search
   */
  private async denseSearch(
    query: string,
    topK: number,
    filters: Record<string, any>
  ): Promise<RetrievedItem[]> {
    const startTime = Date.now();

    // Generate query embedding
    const embedding = await this.embedder.embed(query);

    // Search vector DB
    const results = await this.vectorDB.search(embedding, topK, filters);

    // Add retrieval method tag
    results.forEach(r => r.retrievalMethod = 'dense');

    this.telemetry?.timer('retrieval.dense_search_ms', Date.now() - startTime);
    
    return results;
  }

  /**
   * Perform BM25 text search
   */
  private async textSearch(
    query: string,
    topK: number,
    filters: Record<string, any>
  ): Promise<RetrievedItem[]> {
    const startTime = Date.now();

    // Search using BM25
    const results = await this.bm25.search(query, topK, filters);

    // Add retrieval method tag
    results.forEach(r => r.retrievalMethod = 'bm25');

    this.telemetry?.timer('retrieval.bm25_search_ms', Date.now() - startTime);
    
    return results;
  }

  /**
   * Fuse dense and BM25 results using reciprocal rank fusion
   */
  private fuseResults(
    denseResults: RetrievedItem[],
    bm25Results: RetrievedItem[],
    mixWeight: number
  ): RetrievedItem[] {
    const fusedMap = new Map<string, RetrievedItem>();
    const k = 60; // RRF constant

    // Process dense results
    denseResults.forEach((item, idx) => {
      const rrf = mixWeight / (k + idx + 1);
      if (fusedMap.has(item.chunk.id)) {
        const existing = fusedMap.get(item.chunk.id)!;
        existing.score += rrf;
        existing.retrievalMethod = 'hybrid';
      } else {
        fusedMap.set(item.chunk.id, {
          ...item,
          score: rrf
        });
      }
    });

    // Process BM25 results
    bm25Results.forEach((item, idx) => {
      const rrf = (1 - mixWeight) / (k + idx + 1);
      if (fusedMap.has(item.chunk.id)) {
        const existing = fusedMap.get(item.chunk.id)!;
        existing.score += rrf;
        existing.retrievalMethod = 'hybrid';
      } else {
        fusedMap.set(item.chunk.id, {
          ...item,
          score: rrf
        });
      }
    });

    return Array.from(fusedMap.values());
  }

  /**
   * Apply hard filters based on constraints
   */
  private applyHardFilters(items: RetrievedItem[], jd: JDSchema): RetrievedItem[] {
    return items.filter(item => {
      const chunk = item.chunk;

      // Check clearance requirements
      if (jd.hardConstraints.some(c => c.toLowerCase().includes('clearance'))) {
        const hasClearance = chunk.meta.security?.some(s => 
          s.toLowerCase().includes('clearance')
        );
        if (!hasClearance && chunk.text.toLowerCase().includes('clearance')) {
          return true; // Keep if mentioned in text
        }
        if (!hasClearance) return false;
      }

      // Check location requirements if specified
      if (jd.hardConstraints.some(c => c.toLowerCase().includes('on-site'))) {
        const hasRemote = chunk.text.toLowerCase().includes('remote');
        if (hasRemote && !chunk.text.toLowerCase().includes('on-site')) {
          return false; // Skip pure remote experience
        }
      }

      return true;
    });
  }

  /**
   * Map seniority levels for filtering
   */
  private mapSeniorityFilter(seniority: string): any {
    const seniorityMap: Record<string, string[]> = {
      'junior': ['junior', 'entry', 'associate'],
      'mid-level': ['mid', 'intermediate', 'regular'],
      'senior': ['senior', 'lead', 'principal'],
      'staff': ['staff', 'principal', 'architect'],
      'manager': ['manager', 'director', 'head'],
      'director': ['director', 'vp', 'head']
    };

    const mapped = seniorityMap[seniority.toLowerCase()];
    return mapped ? { $in: mapped } : seniority;
  }

  /**
   * Extract security requirements from constraints
   */
  private extractSecurityRequirements(constraints: string[]): string[] {
    const securityKeywords = ['clearance', 'secret', 'ts/sci', 'public trust'];
    const found: string[] = [];

    for (const constraint of constraints) {
      const lower = constraint.toLowerCase();
      for (const keyword of securityKeywords) {
        if (lower.includes(keyword)) {
          found.push(keyword);
        }
      }
    }

    return found;
  }

  /**
   * Extract cloud platform requirements
   */
  private extractCloudRequirements(requirements: string[]): string[] {
    const cloudPlatforms = ['aws', 'azure', 'gcp', 'google cloud'];
    const found: string[] = [];

    for (const req of requirements) {
      const lower = req.toLowerCase();
      for (const platform of cloudPlatforms) {
        if (lower.includes(platform)) {
          found.push(platform);
        }
      }
    }

    return found;
  }

  /**
   * Generate cache key for retrieval
   */
  private getCacheKey(jd: JDSchema, cfg: JDFlowConfig): string {
    const key = `retrieval_${jd.rawHash}_${cfg.topKAnn}_${cfg.hybridMixWeight}`;
    return key;
  }
}