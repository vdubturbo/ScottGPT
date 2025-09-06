/**
 * ScottGPT Centralized Configuration System
 * ========================================
 * 
 * This module provides centralized configuration management with:
 * - Environment variable validation and loading
 * - Environment-specific configurations (development, production)
 * - All magic numbers centralized and documented
 * - Configuration validation to prevent invalid combinations
 * - Type safety and default values
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import environmentDetector from '../utils/environment-detector.js';

// Load environment variables first
dotenv.config();

// Get current environment
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_DEVELOPMENT = NODE_ENV === 'development';

/**
 * Environment Variables Configuration
 * Centralized validation and type conversion for all environment variables
 */
const ENV_CONFIG = {
  // Database Configuration
  SUPABASE_URL: {
    required: true,
    validator: (value) => value && value.startsWith('https://'),
    error: 'SUPABASE_URL must be a valid HTTPS URL'
  },
  SUPABASE_ANON_KEY: {
    required: true,
    validator: (value) => value && value.length > 20,
    error: 'SUPABASE_ANON_KEY must be provided and be at least 20 characters'
  },
  
  // AI Service Configuration
  OPENAI_API_KEY: {
    required: true,
    validator: (value) => value && value.startsWith('sk-'),
    error: 'OPENAI_API_KEY must be provided and start with "sk-"'
  },
  COHERE_API_KEY: {
    required: true,
    validator: (value) => value && value.length > 10,
    error: 'COHERE_API_KEY must be provided and be at least 10 characters'
  },
  
  // Server Configuration
  PORT: {
    required: false,
    default: 3005,
    type: 'number',
    validator: (value) => value >= 1 && value <= 65535,
    error: 'PORT must be between 1 and 65535'
  },
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: {
    required: false,
    default: 15 * 60 * 1000, // 15 minutes
    type: 'number',
    validator: (value) => value >= 60000, // At least 1 minute
    error: 'RATE_LIMIT_WINDOW_MS must be at least 60000 (1 minute)'
  },
  RATE_LIMIT_MAX_REQUESTS: {
    required: false,
    default: 100,
    type: 'number',
    validator: (value) => value >= 1,
    error: 'RATE_LIMIT_MAX_REQUESTS must be at least 1'
  },
  
  // Chat-specific Rate Limiting
  CHAT_RATE_LIMIT_WINDOW_MS: {
    required: false,
    default: 1 * 60 * 1000, // 1 minute
    type: 'number'
  },
  CHAT_RATE_LIMIT_MAX_REQUESTS: {
    required: false,
    default: 30,
    type: 'number'
  },
  
  // Upload-specific Rate Limiting
  UPLOAD_RATE_LIMIT_WINDOW_MS: {
    required: false,
    default: 1 * 60 * 1000, // 1 minute
    type: 'number'
  },
  UPLOAD_RATE_LIMIT_MAX_REQUESTS: {
    required: false,
    default: 10,
    type: 'number'
  },
  
  // Similarity Thresholds
  DEFAULT_SIMILARITY_THRESHOLD: {
    required: false,
    default: 0.25,
    type: 'number',
    validator: (value) => value >= 0 && value <= 1,
    error: 'DEFAULT_SIMILARITY_THRESHOLD must be between 0 and 1'
  },
  
  // Logging Configuration
  LOG_LEVEL: {
    required: false,
    default: IS_PRODUCTION ? 'info' : 'debug',
    validator: (value) => ['error', 'warn', 'info', 'debug'].includes(value),
    error: 'LOG_LEVEL must be one of: error, warn, info, debug'
  }
};

/**
 * Application Configuration
 * All magic numbers and configurable parameters in one place
 */
export const APP_CONFIG = {
  // Environment
  environment: {
    NODE_ENV,
    IS_PRODUCTION,
    IS_DEVELOPMENT,
    version: '1.0.0',
    
    // Runtime Environment Detection
    detector: environmentDetector,
    isNetlify: environmentDetector.isNetlify(),
    isServerless: environmentDetector.isServerless(),
    isLocal: environmentDetector.isLocal(),
    isContainerized: environmentDetector.isContainerized(),
    hasWritableFilesystem: environmentDetector.hasWritableFilesystem(),
    
    // Environment-specific Configuration Flags
    useInMemoryProcessing: environmentDetector.getRecommendedConfig().useInMemoryProcessing,
    useFileSystemCaching: environmentDetector.getRecommendedConfig().useFileSystemCaching,
    maxMemoryUsage: environmentDetector.getRecommendedConfig().maxMemoryUsage,
    preferStreaming: environmentDetector.getRecommendedConfig().preferStreaming,
    enablePersistence: environmentDetector.getRecommendedConfig().enablePersistence,
    timeoutMultiplier: environmentDetector.getRecommendedConfig().timeoutMultiplier
  },

  // Server Configuration
  server: {
    port: validateAndGetEnv('PORT'),
    host: '0.0.0.0',
    
    // CORS Configuration
    cors: {
      origin: IS_PRODUCTION 
        ? ['https://scottgpt.netlify.app', 'https://www.scottgpt.com']
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    },
    
    // Request Limits
    requestLimits: {
      messageMaxLength: 1000, // characters
      uploadTimeout: 120000,  // 2 minutes in ms
      queryTimeout: 30000     // 30 seconds for queries
    }
  },

  // Database Configuration
  database: {
    supabaseUrl: validateAndGetEnv('SUPABASE_URL'),
    supabaseAnonKey: validateAndGetEnv('SUPABASE_ANON_KEY'),
    
    // Connection Settings
    connection: {
      timeout: 30000,        // 30 seconds
      retries: 3,
      retryDelay: 1000       // 1 second between retries
    },
    
    // Query Limits
    query: {
      maxChunksRetrieved: 1000,  // Current workaround limit
      defaultLimit: 10,
      maxLimit: 100
    }
  },

  // AI Services Configuration
  ai: {
    // OpenAI Configuration
    openai: {
      apiKey: validateAndGetEnv('OPENAI_API_KEY'),
      model: 'gpt-4',
      temperature: {
        default: 0.4,
        precise: 0.2,
        creative: 0.7
      },
      maxTokens: {
        default: 1000,
        summary: 500,
        detailed: 2000
      },
      timeout: 30000 // 30 seconds
    },
    
    // Cohere Configuration
    cohere: {
      apiKey: validateAndGetEnv('COHERE_API_KEY'),
      model: 'embed-english-v3.0',
      inputType: {
        document: 'search_document',
        query: 'search_query'
      },
      batchSize: 96,  // Cohere's batch limit
      timeout: 30000, // 30 seconds
      rateLimiting: {
        requestsPerMinute: 100,
        delayBetweenRequests: 1000 // 1 second
      }
    }
  },

  // Content Processing Configuration
  content: {
    // Chunking Parameters - Optimized for RAG performance
    chunking: {
      chunkTokens: 225,        // Target tokens per chunk (200-250 range)
      overlapTokens: 45,       // ~20% overlap for better context preservation  
      minChunkLength: 120,     // Minimum tokens for valid chunk (raised from 100 chars)
      maxChunkLength: 300,     // Maximum tokens per chunk for focused retrieval
      minChunkChars: 400,      // Minimum characters to avoid tiny fragments
      
      // Quality targets
      quality: {
        optimalMinTokens: 120, // Minimum for optimal chunks
        optimalMaxTokens: 300, // Maximum for optimal chunks
        targetRange: [200, 250], // Preferred token range
        consolidationThreshold: 100 // Merge chunks under this size
      },
      
      // Tokenization
      tokenization: {
        wordsPerToken: 0.75,   // Rough estimate for English
        tokensPerWord: 1.33    // Inverse of above
      }
    },
    
    // File Processing
    fileProcessing: {
      maxFileSize: 10 * 1024 * 1024, // 10MB
      supportedFormats: ['.md', '.txt', '.pdf'],
      timeout: {
        base: 30000,           // 30 seconds base
        perFile: 10000,        // 10 seconds per file
        perChunk: 5000         // 5 seconds per chunk
      }
    }
  },

  // Search Configuration
  search: {
    // Similarity Thresholds
    similarity: {
      default: validateAndGetEnv('DEFAULT_SIMILARITY_THRESHOLD'),
      semantic: {
        minimum: 0.25,         // Include threshold
        good: 0.70,           // Good match threshold
        excellent: 0.85       // Excellent match threshold
      },
      text: {
        minimum: 0.30,        // Text search inclusion threshold
        good: 0.60,          // Good text relevance
        excellent: 0.80      // Excellent text relevance
      }
    },
    
    // Default Search Parameters
    defaults: {
      maxResults: 12,
      rerankResults: true,
      includeMetadata: true,
      searchTimeout: 10000   // 10 seconds
    },
    
    // Text Search Configuration
    textSearch: {
      minWordLength: 2,      // Minimum word length for search
      maxQueryLength: 200,   // Maximum query length
      enableFallback: true   // Enable text search fallback
    }
  },

  // Rate Limiting Configuration
  rateLimiting: {
    // General API Rate Limiting
    general: {
      windowMs: validateAndGetEnv('RATE_LIMIT_WINDOW_MS'),
      maxRequests: validateAndGetEnv('RATE_LIMIT_MAX_REQUESTS'),
      message: 'Too many requests, please try again later',
      standardHeaders: true,
      legacyHeaders: false
    },
    
    // Chat-specific Rate Limiting
    chat: {
      windowMs: validateAndGetEnv('CHAT_RATE_LIMIT_WINDOW_MS'),
      maxRequests: validateAndGetEnv('CHAT_RATE_LIMIT_MAX_REQUESTS'),
      message: 'Too many chat requests, please try again in a minute'
    },
    
    // Upload-specific Rate Limiting
    upload: {
      windowMs: validateAndGetEnv('UPLOAD_RATE_LIMIT_WINDOW_MS'),
      maxRequests: validateAndGetEnv('UPLOAD_RATE_LIMIT_MAX_REQUESTS'),
      message: 'Too many upload requests, please try again later'
    },
    
    // Embedding API Rate Limiting
    embedding: {
      requestsPerMinute: 100,
      batchSize: 96,
      delayBetweenRequests: 1000
    }
  },

  // Logging Configuration
  logging: {
    level: validateAndGetEnv('LOG_LEVEL'),
    format: IS_PRODUCTION ? 'json' : 'pretty',
    
    // Component-specific logging
    components: {
      scoring: {
        enabled: !IS_PRODUCTION,
        logScoreBreakdown: true,
        maxLoggedResults: 5
      },
      performance: {
        enabled: true,
        logSlowQueries: true,
        slowQueryThreshold: 1000 // 1 second
      },
      errors: {
        enabled: true,
        includeStackTrace: !IS_PRODUCTION
      }
    }
  },

  // Development/Testing Configuration
  development: {
    // Debug Settings
    debug: {
      enableVerboseLogging: IS_DEVELOPMENT,
      logDatabaseQueries: IS_DEVELOPMENT,
      simulateSlowResponses: false
    },
    
    // Testing Configuration
    testing: {
      mockExternalAPIs: false,
      useTestDatabase: false,
      seedTestData: IS_DEVELOPMENT
    }
  },

  // Performance Configuration
  performance: {
    // Caching
    caching: {
      enableQueryCache: true,
      queryCacheTTL: 5 * 60 * 1000, // 5 minutes
      enableEmbeddingCache: true,
      embeddingCacheTTL: 24 * 60 * 60 * 1000 // 24 hours
    },
    
    // Timeouts
    timeouts: {
      database: 30000,       // 30 seconds
      embedding: 30000,      // 30 seconds
      llm: 30000,           // 30 seconds
      upload: 120000        // 2 minutes
    },
    
    // Memory Limits
    memory: {
      maxEmbeddingsInMemory: 10000,
      maxCacheSize: 100 * 1024 * 1024 // 100MB
    }
  }
};

/**
 * Validate and retrieve environment variable with type conversion
 * @param {string} key - Environment variable key
 * @returns {any} - Processed and validated value
 */
function validateAndGetEnv(key) {
  const config = ENV_CONFIG[key];
  if (!config) {
    throw new Error(`Unknown environment variable configuration: ${key}`);
  }

  const rawValue = process.env[key];
  
  // Check if required
  if (config.required && !rawValue) {
    throw new Error(`Required environment variable missing: ${key}. ${config.error || ''}`);
  }
  
  // Use default if not provided
  const value = rawValue || config.default;
  
  // Type conversion
  let processedValue = value;
  if (config.type === 'number' && typeof value === 'string') {
    processedValue = parseInt(value, 10);
    if (isNaN(processedValue)) {
      throw new Error(`Environment variable ${key} must be a valid number. Got: ${value}`);
    }
  } else if (config.type === 'boolean' && typeof value === 'string') {
    processedValue = value.toLowerCase() === 'true';
  }
  
  // Validation
  if (config.validator && !config.validator(processedValue)) {
    throw new Error(`Environment variable ${key} validation failed: ${config.error || 'Invalid value'}`);
  }
  
  return processedValue;
}

/**
 * Validate configuration for invalid combinations
 */
function validateConfiguration() {
  const errors = [];
  
  // Validate similarity thresholds
  if (APP_CONFIG.search.similarity.semantic.minimum > APP_CONFIG.search.similarity.semantic.good) {
    errors.push('Semantic minimum similarity threshold cannot be higher than good threshold');
  }
  
  // Validate rate limiting
  if (APP_CONFIG.rateLimiting.chat.maxRequests > APP_CONFIG.rateLimiting.general.maxRequests) {
    errors.push('Chat rate limit cannot be higher than general rate limit');
  }
  
  // Validate chunking parameters
  if (APP_CONFIG.content.chunking.overlapTokens >= APP_CONFIG.content.chunking.chunkTokens) {
    errors.push('Chunk overlap cannot be larger than chunk size');
  }
  
  // Validate timeouts
  if (APP_CONFIG.performance.timeouts.database > APP_CONFIG.server.requestLimits.queryTimeout) {
    errors.push('Database timeout cannot be longer than query timeout');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}

/**
 * Get environment-specific configuration overrides
 * @param {string} environment - Environment name
 * @returns {Object} - Configuration overrides
 */
export function getEnvironmentConfig(environment = NODE_ENV) {
  const configs = {
    production: {
      logging: {
        level: 'info',
        components: {
          scoring: { enabled: false },
          performance: { logSlowQueries: true }
        }
      },
      development: {
        debug: { enableVerboseLogging: false }
      }
    },
    
    development: {
      logging: {
        level: 'debug',
        components: {
          scoring: { enabled: true },
          performance: { logSlowQueries: true }
        }
      },
      development: {
        debug: { enableVerboseLogging: true }
      }
    },
    
    test: {
      server: { port: 3002 },
      database: {
        connection: { timeout: 5000 }
      },
      development: {
        testing: { mockExternalAPIs: true }
      }
    }
  };
  
  return configs[environment] || {};
}

/**
 * Create a merged configuration with environment overrides
 * @param {Object} overrides - Additional configuration overrides
 * @returns {Object} - Final configuration
 */
export function createConfig(overrides = {}) {
  const envConfig = getEnvironmentConfig();
  
  // Deep merge configurations
  const mergedConfig = deepMerge(APP_CONFIG, envConfig, overrides);
  
  return mergedConfig;
}

/**
 * Deep merge utility for configuration objects
 * @param {...Object} objects - Objects to merge
 * @returns {Object} - Merged object
 */
function deepMerge(...objects) {
  return objects.reduce((prev, obj) => {
    Object.keys(obj).forEach(key => {
      const pVal = prev[key];
      const oVal = obj[key];
      
      if (Array.isArray(pVal) && Array.isArray(oVal)) {
        prev[key] = pVal.concat(...oVal);
      } else if (pVal && typeof pVal === 'object' && oVal && typeof oVal === 'object') {
        prev[key] = deepMerge(pVal, oVal);
      } else {
        prev[key] = oVal;
      }
    });
    
    return prev;
  }, {});
}

/**
 * Initialize and validate configuration
 */
function initializeConfiguration() {
  try {
    // Validate all environment variables
    Object.keys(ENV_CONFIG).forEach(key => {
      validateAndGetEnv(key);
    });
    
    // Validate configuration combinations
    validateConfiguration();
    
    console.log(`✅ Configuration initialized successfully for ${NODE_ENV} environment`);
    
    if (IS_DEVELOPMENT) {
      console.log('📋 Development mode - verbose logging enabled');
      console.log(`🔧 Using similarity threshold: ${APP_CONFIG.search.similarity.default}`);
      console.log(`⚡ Server will run on port: ${APP_CONFIG.server.port}`);
    }
    
  } catch (error) {
    console.error('❌ Configuration initialization failed:', error.message);
    console.error('🔧 Please check your environment variables and configuration');
    process.exit(1);
  }
}

// Initialize configuration when module is loaded
initializeConfiguration();

// Export the main configuration
export default APP_CONFIG;