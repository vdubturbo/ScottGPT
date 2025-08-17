# ScottGPT Centralized Configuration System Documentation

## Overview

ScottGPT now uses a centralized configuration management system that replaces scattered magic numbers and duplicated environment validation with a single, maintainable configuration source.

## Configuration Architecture

### Single Source of Truth: `config/app-config.js`

All configuration is now centralized in one location with:
- ✅ **Environment variable validation** with type conversion and error messages
- ✅ **Environment-specific configurations** (development, production, test)
- ✅ **All magic numbers centralized** and documented
- ✅ **Configuration validation** to prevent invalid combinations
- ✅ **Type safety** and default values

## Environment Variables

### Required Environment Variables

The system validates all required environment variables on startup:

```javascript
// Database Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here

// AI Service Configuration  
OPENAI_API_KEY=sk-your-openai-key
COHERE_API_KEY=your-cohere-key

// Optional Configuration
PORT=3001
NODE_ENV=development
LOG_LEVEL=debug
```

### Environment Variable Validation

Each environment variable has comprehensive validation:

```javascript
SUPABASE_URL: {
  required: true,
  validator: (value) => value && value.startsWith('https://'),
  error: 'SUPABASE_URL must be a valid HTTPS URL'
}
```

**Validation Features:**
- **Required/Optional** distinction
- **Type conversion** (string, number, boolean)
- **Format validation** (URLs, API keys, etc.)
- **Custom error messages** for debugging

## Configuration Sections

### 1. Server Configuration

```javascript
CONFIG.server = {
  port: 3001,
  host: '0.0.0.0',
  cors: {
    origin: ['http://localhost:3000'], // Dev vs Prod URLs
    credentials: true
  },
  requestLimits: {
    messageMaxLength: 1000,  // Was: hard-coded in routes/chat.js
    uploadTimeout: 120000,   // Was: scattered across upload routes
    queryTimeout: 30000      // Was: hard-coded timeouts
  }
}
```

**Replaces:**
- ❌ `if (query.length > 1000)` magic number
- ❌ `timeout: 120000` scattered values
- ❌ `const PORT = process.env.PORT || 3001` duplicated defaults

### 2. Rate Limiting Configuration

```javascript
CONFIG.rateLimiting = {
  general: {
    windowMs: 15 * 60 * 1000,  // Was: hard-coded in server.js
    maxRequests: 100,          // Was: magic number
    message: 'Too many requests, please try again later'
  },
  chat: {
    windowMs: 1 * 60 * 1000,   // Was: createRateLimit(1 * 60 * 1000, 30)
    maxRequests: 30,
    message: 'Too many chat requests, please try again in a minute'
  },
  upload: {
    windowMs: 1 * 60 * 1000,   // Was: createRateLimit(1 * 60 * 1000, 10)
    maxRequests: 10,
    message: 'Too many upload requests, please try again later'
  }
}
```

**Replaces:**
- ❌ `createRateLimit(15 * 60 * 1000, 100, 'message')` magic numbers
- ❌ Multiple rate limit definitions with hard-coded values
- ❌ Inconsistent error messages

### 3. AI Services Configuration

```javascript
CONFIG.ai = {
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4',
    temperature: {
      default: 0.4,     // Was: temperature: options?.temperature || 0.4
      precise: 0.2,     // Was: temperature: 0.2
      creative: 0.7
    },
    maxTokens: {
      default: 1000,    // Was: maxTokens: options?.maxTokens || 1200
      summary: 500,
      detailed: 2000
    },
    timeout: 30000      // Was: various timeout values
  },
  cohere: {
    apiKey: process.env.COHERE_API_KEY,
    model: 'embed-english-v3.0',  // Was: this.model = 'embed-english-v3.0'
    inputType: {
      document: 'search_document',   // Was: inputType = 'search_document'
      query: 'search_query'         // Was: inputType = 'search_query'
    },
    batchSize: 96,      // Was: const batchSize = 96
    timeout: 30000,
    rateLimiting: {
      requestsPerMinute: 100,
      delayBetweenRequests: 1000  // Was: await sleep(1000)
    }
  }
}
```

**Replaces:**
- ❌ `if (!process.env.OPENAI_API_KEY)` duplicated validation
- ❌ `temperature: 0.4` magic numbers
- ❌ `const batchSize = 96` scattered values
- ❌ `await sleep(1000)` hard-coded delays

### 4. Content Processing Configuration

```javascript
CONFIG.content = {
  chunking: {
    chunkTokens: 400,        // Was: const CHUNK_TOKENS = 400
    overlapTokens: 100,      // Was: const OVERLAP_TOKENS = 100
    minChunkLength: 100,     // Was: const MIN_CHUNK_LENGTH = 100
    maxChunkLength: 2000,
    tokenization: {
      wordsPerToken: 0.75,   // Was: / 0.75 magic number
      tokensPerWord: 1.33
    }
  },
  fileProcessing: {
    maxFileSize: 10 * 1024 * 1024,
    supportedFormats: ['.md', '.txt', '.pdf'],
    timeout: {
      base: 30000,           // Was: const BASE_TIMEOUT = 30 * 1000
      perFile: 10000,        // Was: const TIMEOUT_PER_FILE = 10 * 1000
      perChunk: 5000         // Was: const TIMEOUT_PER_CHUNK = 5 * 1000
    }
  }
}
```

**Replaces:**
- ❌ `const CHUNK_TOKENS = 400` in indexer.js
- ❌ `const BASE_TIMEOUT = 30 * 1000` timeout constants
- ❌ `Math.ceil(text.split(/\\s+/).length / 0.75)` magic numbers

### 5. Search Configuration

```javascript
CONFIG.search = {
  similarity: {
    default: 0.25,           // Was: various threshold values
    semantic: {
      minimum: 0.25,         // Was: threshold: 0.25
      good: 0.70,           // Was: if (similarity > 0.3)
      excellent: 0.85
    },
    text: {
      minimum: 0.30,        // Was: various text search thresholds
      good: 0.60,
      excellent: 0.80
    }
  },
  defaults: {
    maxResults: 12,          // Was: const { maxResults = 12 }
    rerankResults: true,
    includeMetadata: true,
    searchTimeout: 10000     // Was: various timeout values
  }
}
```

**Replaces:**
- ❌ `threshold: 0.25` scattered throughout database queries
- ❌ `const { maxResults = 12 }` duplicated defaults
- ❌ `if (similarity > 0.3)` magic number comparisons

## Environment-Specific Configuration

### Development Environment
```javascript
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
}
```

### Production Environment
```javascript
production: {
  logging: {
    level: 'info',
    components: {
      scoring: { enabled: false },
      performance: { logSlowQueries: true }
    }
  }
}
```

### Test Environment
```javascript
test: {
  server: { port: 3002 },
  database: {
    connection: { timeout: 5000 }
  },
  development: {
    testing: { mockExternalAPIs: true }
  }
}
```

## Configuration Validation

### Startup Validation

The system validates configuration on startup and exits with clear error messages:

```bash
❌ Configuration initialization failed: SUPABASE_URL must be a valid HTTPS URL
🔧 Please check your environment variables and configuration
```

### Cross-Validation

The system validates configuration combinations:

```javascript
// Validate similarity thresholds
if (APP_CONFIG.search.similarity.semantic.minimum > APP_CONFIG.search.similarity.semantic.good) {
  errors.push('Semantic minimum similarity threshold cannot be higher than good threshold');
}

// Validate chunking parameters
if (APP_CONFIG.content.chunking.overlapTokens >= APP_CONFIG.content.chunking.chunkTokens) {
  errors.push('Chunk overlap cannot be larger than chunk size');
}
```

## Usage in Code

### Before (Scattered Configuration)
```javascript
// In multiple files with duplicated validation:
if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY not found');
}
const temperature = 0.4; // Magic number
const timeout = 30000;   // Another magic number
```

### After (Centralized Configuration)
```javascript
// Single import in each file:
import CONFIG from '../config/app-config.js';

// Use documented, validated configuration:
const temperature = CONFIG.ai.openai.temperature.default;
const timeout = CONFIG.ai.openai.timeout;
```

## Configuration Benefits

### ✅ **Maintainability**
- **Single source** for all configuration
- **No duplicated** environment validation
- **Consistent** parameter names across services

### ✅ **Reliability**
- **Startup validation** prevents runtime errors
- **Type conversion** ensures correct data types
- **Cross-validation** prevents invalid combinations

### ✅ **Debuggability**
- **Clear error messages** for configuration issues
- **Environment-specific** logging and debug settings
- **Centralized** documentation of all parameters

### ✅ **Flexibility**
- **Environment overrides** for different deployment scenarios
- **Easy tuning** without code changes
- **Configuration merging** for complex scenarios

## Migration Guide

### Files Updated

**✅ Core Files:**
- `scripts/indexer.js` - All timeouts, chunking, and API configuration
- `server.js` - Port, rate limiting, CORS configuration
- `services/embeddings.js` - Cohere configuration and batch sizes
- `services/rag.js` - OpenAI configuration and model settings
- `routes/chat.js` - Message limits and temperature settings

**✅ Configuration Added:**
- `config/app-config.js` - Centralized configuration system
- Environment validation for all services
- Type safety and default values

### Breaking Changes

**⚠️ Environment Variables:**
- Configuration now validates environment variables on startup
- Invalid or missing variables cause immediate exit with clear error messages
- Some previously optional variables may now be required

**✅ Backward Compatibility:**
- All existing functionality preserved
- Default values maintained for optional parameters
- Gradual migration path available

## Configuration Examples

### Custom Configuration Override
```javascript
import { createConfig } from './config/app-config.js';

const customConfig = createConfig({
  ai: {
    openai: {
      temperature: { default: 0.3 },  // Lower temperature
      maxTokens: { default: 1500 }    // More tokens
    }
  },
  search: {
    similarity: { default: 0.30 }     // Higher similarity threshold
  }
});
```

### Environment-Specific Settings
```javascript
// Development: More verbose logging, lower thresholds
NODE_ENV=development
LOG_LEVEL=debug
DEFAULT_SIMILARITY_THRESHOLD=0.20

// Production: Less logging, stricter thresholds  
NODE_ENV=production
LOG_LEVEL=info
DEFAULT_SIMILARITY_THRESHOLD=0.30
```

## Troubleshooting

### Common Configuration Issues

**Problem**: `❌ SUPABASE_URL must be a valid HTTPS URL`
**Solution**: Ensure SUPABASE_URL starts with `https://`

**Problem**: `❌ Required environment variable missing: OPENAI_API_KEY`
**Solution**: Add OPENAI_API_KEY to your `.env` file

**Problem**: `❌ Configuration validation failed: Chunk overlap cannot be larger than chunk size`
**Solution**: Check custom configuration overrides for logical consistency

### Debug Configuration
```javascript
// Check current configuration
console.log('Current config:', CONFIG);

// Check environment-specific overrides
console.log('Environment config:', getEnvironmentConfig());

// Validate configuration
try {
  validateConfiguration();
  console.log('✅ Configuration is valid');
} catch (error) {
  console.error('❌ Configuration validation failed:', error.message);
}
```

## Future Enhancements

### Planned Features
1. **Hot reloading** of configuration changes
2. **Remote configuration** management
3. **Configuration API** for runtime updates
4. **Advanced validation** with custom rules
5. **Configuration templates** for different deployment scenarios

### Contributing Configuration Changes
1. Add new parameters to `APP_CONFIG` with documentation
2. Add environment variable validation if needed
3. Update this documentation
4. Add tests for new configuration options
5. Consider backward compatibility

The centralized configuration system makes ScottGPT more maintainable, reliable, and easier to deploy across different environments.