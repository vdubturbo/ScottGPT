/**
 * JD Processing Pipeline - Type Definitions
 * Token-budget aware resume generation with hybrid retrieval
 */

// ============================================================================
// Input Types
// ============================================================================

export interface RawJD { 
  id: string; 
  text: string; 
}

export interface EvidenceChunk {
  id: string;
  text: string;                 // 50–150 tokens; 1–3 claims
  embedding?: number[];          // Pre-computed dense vector
  meta: {
    role?: string; 
    seniority?: string; 
    domain?: string[];
    skills?: string[]; 
    metrics?: string[]; 
    dates?: string;
    cloud?: string[]; 
    security?: string[]; 
    sourceDocId?: string;
  };
}

// ============================================================================
// Output Types
// ============================================================================

export interface JDSchema {
  roleTitle: string;
  seniority?: string;
  mustHaves: string[];
  niceToHaves: string[];
  topResponsibilities: string[];
  hardConstraints: string[];     // e.g., clearance, location
  domain: string[];              // e.g., utilities, healthcare
  conciseSummary: string;        // 200–350 words
  rawHash?: string;              // For caching
  extractedAt?: Date;
}

export interface RetrievedItem { 
  chunk: EvidenceChunk; 
  score: number;
  retrievalMethod?: 'dense' | 'bm25' | 'hybrid';
}

export interface CompressedEvidence { 
  id: string; 
  lines: string[]; 
  tokens: number;
  relevanceScore?: number;
  mappedToRequirements?: string[];
}

export interface ResumeAssemblyInput {
  jd: Pick<JDSchema, "roleTitle" | "seniority" | "mustHaves" | "topResponsibilities" | "conciseSummary">;
  evidence: CompressedEvidence[];  // ≤ budget
  tokenBudget: {
    used: number;
    available: number;
  };
}

export interface GenerationResult {
  resumeMarkdown: string;
  coverageReport: { 
    mustHave: string; 
    present: boolean; 
    evidenceIds: string[]; 
  }[];
  tokensUsed: { 
    prompt: number; 
    completion: number; 
  };
  metadata?: {
    generatedAt: Date;
    modelUsed: string;
    temperature: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

export interface JDFlowConfig {
  // Retrieval
  topKAnn: number;                    // e.g., 100
  topKBm25: number;                   // e.g., 50
  hybridMixWeight: number;            // e.g., 0.7 (70% dense, 30% BM25)
  
  // Reranking
  keepAfterRerank: number;            // e.g., 12
  rerankModelName?: string;           // e.g., 'cross-encoder/ms-marco-MiniLM-L-12-v2'
  
  // Token Management
  evidenceTokenBudget: number;        // e.g., 600
  jdSummaryMaxWords: number;          // e.g., 350
  contextSafetyHeadroom: number;      // e.g., 0.15 (15% buffer)
  
  // Model Limits
  modelContextTokens: number;         // e.g., 8192 for GPT-3.5, 128000 for GPT-4
  systemPromptTokens: number;         // e.g., 500
  layoutTokens: number;               // e.g., 200 (for formatting instructions)
  
  // Performance
  cacheEnabled: boolean;              // e.g., true
  cacheTTLSeconds: number;            // e.g., 3600
  parallelRetrievalEnabled: boolean;  // e.g., true
  
  // Quality
  minRelevanceScore: number;          // e.g., 0.3
  requireAllMustHaves: boolean;       // e.g., true
  dedupeThreshold: number;            // e.g., 0.9 (similarity for deduplication)
}

// ============================================================================
// Adapter Interfaces (for pluggable implementations)
// ============================================================================

export interface EmbeddingAdapter {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface VectorDBAdapter {
  search(
    embedding: number[], 
    topK: number, 
    filter?: Record<string, any>
  ): Promise<RetrievedItem[]>;
}

export interface BM25Adapter {
  search(
    query: string, 
    topK: number, 
    filter?: Record<string, any>
  ): Promise<RetrievedItem[]>;
}

export interface RerankAdapter {
  rerank(
    query: string,
    documents: string[],
    topK: number
  ): Promise<{ index: number; score: number }[]>;
}

export interface LLMAdapter {
  complete(
    systemPrompt: string,
    userPrompt: string,
    maxTokens: number,
    temperature?: number
  ): Promise<{ text: string; tokensUsed: { prompt: number; completion: number } }>;
}

export interface CacheAdapter {
  get(key: string): Promise<any | null>;
  set(key: string, value: any, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
}

// ============================================================================
// Telemetry Types
// ============================================================================

export interface TelemetryEvent {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: Date;
}

export interface TelemetryAdapter {
  timer(name: string, duration: number, tags?: Record<string, string>): void;
  gauge(name: string, value: number, tags?: Record<string, string>): void;
  counter(name: string, value: number, tags?: Record<string, string>): void;
}

// ============================================================================
// Error Types
// ============================================================================

export class JDProcessingError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'JDProcessingError';
  }
}

export class TokenBudgetExceededError extends JDProcessingError {
  constructor(
    public required: number,
    public available: number
  ) {
    super(
      `Token budget exceeded: required ${required}, available ${available}`,
      'TOKEN_BUDGET_EXCEEDED',
      { required, available }
    );
  }
}

export class MustHaveCoverageError extends JDProcessingError {
  constructor(
    public missing: string[]
  ) {
    super(
      `Missing must-have requirements: ${missing.join(', ')}`,
      'MUST_HAVE_COVERAGE_ERROR',
      { missing }
    );
  }
}