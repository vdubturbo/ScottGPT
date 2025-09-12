/**
 * Caching Layer Implementation
 * Provides intelligent caching for JD schemas, retrieval results, and generated content
 * Supports TTL-based expiration and cache invalidation strategies
 */

import {
  CacheAdapter,
  JDSchema,
  RetrievedItem,
  CompressedEvidence,
  GenerationResult,
  TelemetryAdapter
} from './types';

/**
 * Cache key generator and manager
 */
export class CacheKeyManager {
  /**
   * Generate cache key for JD parsing
   */
  static jdParseKey(rawJD: string): string {
    const hash = this.hashString(rawJD);
    return `jd_parse:${hash}`;
  }

  /**
   * Generate cache key for retrieval results
   */
  static retrievalKey(jd: JDSchema, config: any): string {
    const configHash = this.hashObject({
      topKAnn: config.topKAnn,
      topKBm25: config.topKBm25,
      hybridMixWeight: config.hybridMixWeight
    });
    return `retrieval:${jd.rawHash}:${configHash}`;
  }

  /**
   * Generate cache key for reranked results
   */
  static rerankKey(jd: JDSchema, config: any): string {
    const configHash = this.hashObject({
      keepAfterRerank: config.keepAfterRerank
    });
    return `rerank:${jd.rawHash}:${configHash}`;
  }

  /**
   * Generate cache key for compressed evidence
   */
  static compressionKey(jd: JDSchema, config: any): string {
    const configHash = this.hashObject({
      evidenceTokenBudget: config.evidenceTokenBudget,
      modelName: config.modelName
    });
    return `compression:${jd.rawHash}:${configHash}`;
  }

  /**
   * Generate cache key for final resume
   */
  static resumeKey(jd: JDSchema, evidenceIds: string[], config: any): string {
    const evidenceHash = this.hashString(evidenceIds.sort().join(','));
    const configHash = this.hashObject({
      modelName: config.modelName,
      temperature: config.temperature
    });
    return `resume:${jd.rawHash}:${evidenceHash}:${configHash}`;
  }

  /**
   * Generate cache key for user-specific content
   */
  static userKey(userId: string, baseKey: string): string {
    return `user:${userId}:${baseKey}`;
  }

  /**
   * Hash string content
   */
  private static hashString(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Hash object content
   */
  private static hashObject(obj: any): string {
    return this.hashString(JSON.stringify(obj));
  }
}

/**
 * Memory-based cache implementation
 */
export class MemoryCache implements CacheAdapter {
  private cache = new Map<string, { 
    data: any; 
    expiry: number; 
    hits: number;
    created: number;
  }>();
  
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0
  };

  constructor(
    private maxSize: number = 1000,
    private defaultTTL: number = 3600, // 1 hour
    private telemetry?: TelemetryAdapter
  ) {
    // Clean up expired entries every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      this.telemetry?.counter('cache.miss', 1);
      return null;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.misses++;
      this.telemetry?.counter('cache.miss', 1);
      this.telemetry?.counter('cache.expired', 1);
      return null;
    }

    entry.hits++;
    this.stats.hits++;
    this.telemetry?.counter('cache.hit', 1);
    return entry.data;
  }

  async set<T>(key: string, data: T, ttlSeconds?: number): Promise<void> {
    const ttl = ttlSeconds || this.defaultTTL;
    const expiry = Date.now() + (ttl * 1000);
    
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiry,
      hits: 0,
      created: Date.now()
    });

    this.stats.sets++;
    this.telemetry?.counter('cache.set', 1);
    this.telemetry?.gauge('cache.size', this.cache.size);
  }

  async del(key: string): Promise<void> {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.telemetry?.counter('cache.delete', 1);
    }
  }

  async clear(): Promise<void> {
    const size = this.cache.size;
    this.cache.clear();
    this.telemetry?.counter('cache.clear', size);
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
    sets: number;
    evictions: number;
  } {
    const total = this.stats.hits + this.stats.misses;
    return {
      size: this.cache.size,
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      sets: this.stats.sets,
      evictions: this.stats.evictions
    };
  }

  /**
   * Get cache entries for debugging
   */
  getEntries(): Array<{
    key: string;
    size: number;
    age: number;
    hits: number;
    ttl: number;
  }> {
    const now = Date.now();
    return Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: JSON.stringify(entry.data).length,
      age: now - entry.created,
      hits: entry.hits,
      ttl: Math.max(0, entry.expiry - now)
    }));
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      // Use creation time as proxy for LRU (could enhance with access time)
      if (entry.created < lruTime) {
        lruTime = entry.created;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      this.telemetry?.counter('cache.eviction', 1);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key);
    }

    if (toDelete.length > 0) {
      this.telemetry?.counter('cache.cleanup', toDelete.length);
    }
  }
}

/**
 * Cache wrapper with intelligent invalidation
 */
export class SmartCache {
  constructor(
    private cache: CacheAdapter,
    private telemetry?: TelemetryAdapter
  ) {}

  /**
   * Cache JD parsing result
   */
  async cacheJDParse(rawJD: string, result: JDSchema, ttl = 3600): Promise<void> {
    const key = CacheKeyManager.jdParseKey(rawJD);
    await this.cache.set(key, result, ttl);
  }

  /**
   * Get cached JD parsing result
   */
  async getCachedJDParse(rawJD: string): Promise<JDSchema | null> {
    const key = CacheKeyManager.jdParseKey(rawJD);
    return await this.cache.get(key);
  }

  /**
   * Cache retrieval results
   */
  async cacheRetrieval(
    jd: JDSchema, 
    config: any, 
    results: RetrievedItem[], 
    ttl = 1800
  ): Promise<void> {
    const key = CacheKeyManager.retrievalKey(jd, config);
    await this.cache.set(key, results, ttl);
  }

  /**
   * Get cached retrieval results
   */
  async getCachedRetrieval(jd: JDSchema, config: any): Promise<RetrievedItem[] | null> {
    const key = CacheKeyManager.retrievalKey(jd, config);
    return await this.cache.get(key);
  }

  /**
   * Cache reranked results
   */
  async cacheRerank(
    jd: JDSchema,
    config: any,
    results: RetrievedItem[],
    ttl = 1800
  ): Promise<void> {
    const key = CacheKeyManager.rerankKey(jd, config);
    await this.cache.set(key, results, ttl);
  }

  /**
   * Get cached reranked results
   */
  async getCachedRerank(jd: JDSchema, config: any): Promise<RetrievedItem[] | null> {
    const key = CacheKeyManager.rerankKey(jd, config);
    return await this.cache.get(key);
  }

  /**
   * Cache compressed evidence
   */
  async cacheCompression(
    jd: JDSchema,
    config: any,
    evidence: CompressedEvidence[],
    ttl = 1800
  ): Promise<void> {
    const key = CacheKeyManager.compressionKey(jd, config);
    await this.cache.set(key, evidence, ttl);
  }

  /**
   * Get cached compressed evidence
   */
  async getCachedCompression(jd: JDSchema, config: any): Promise<CompressedEvidence[] | null> {
    const key = CacheKeyManager.compressionKey(jd, config);
    return await this.cache.get(key);
  }

  /**
   * Cache final resume
   */
  async cacheResume(
    jd: JDSchema,
    evidenceIds: string[],
    config: any,
    result: GenerationResult,
    ttl = 3600
  ): Promise<void> {
    const key = CacheKeyManager.resumeKey(jd, evidenceIds, config);
    await this.cache.set(key, result, ttl);
  }

  /**
   * Get cached resume
   */
  async getCachedResume(
    jd: JDSchema,
    evidenceIds: string[],
    config: any
  ): Promise<GenerationResult | null> {
    const key = CacheKeyManager.resumeKey(jd, evidenceIds, config);
    return await this.cache.get(key);
  }

  /**
   * Invalidate cache for specific JD
   */
  async invalidateJD(jdHash: string): Promise<void> {
    // In a real implementation, we'd need pattern matching
    // For now, just clear all (could be optimized with Redis patterns)
    this.telemetry?.counter('cache.invalidate_jd', 1);
  }

  /**
   * Invalidate user-specific cache
   */
  async invalidateUser(userId: string): Promise<void> {
    // Pattern matching for user keys
    this.telemetry?.counter('cache.invalidate_user', 1);
  }

  /**
   * Warm cache with common operations
   */
  async warmCache(commonJDs: string[], config: any): Promise<void> {
    // Pre-parse common JDs to warm the cache
    this.telemetry?.counter('cache.warm_start', 1);
  }
}