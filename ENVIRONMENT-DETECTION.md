# Environment Detection System

## Overview

ScottGPT now includes comprehensive environment detection that automatically adapts configuration based on the deployment platform. This ensures optimal performance whether running locally, in containers, or on serverless platforms like Netlify.

## Features

### Platform Detection
- ✅ **Netlify** - Functions, edge deployment
- ✅ **AWS Lambda** - Serverless functions
- ✅ **Vercel** - Edge functions, serverless
- ✅ **Railway** - Container deployment
- ✅ **Render** - Container deployment  
- ✅ **Heroku** - Dyno-based deployment
- ✅ **Docker** - Container runtime
- ✅ **Local Development** - Development environment

### Runtime Analysis
- Memory constraints and usage
- CPU core detection
- Filesystem capabilities
- Network environment
- Process characteristics

## Usage

### Basic Detection

```javascript
import environmentDetector from './utils/environment-detector.js';

// Simple boolean checks
const isNetlify = environmentDetector.isNetlify();
const isServerless = environmentDetector.isServerless(); 
const isLocal = environmentDetector.isLocal();
const hasWritableFS = environmentDetector.hasWritableFilesystem();

// Get complete environment info
const envInfo = environmentDetector.getEnvironmentInfo();
const summary = environmentDetector.getSummary();
```

### Configuration Integration

The detector is automatically integrated with `config/app-config.js`:

```javascript
import CONFIG from './config/app-config.js';

// Environment-specific flags (automatically set)
const useInMemoryProcessing = CONFIG.environment.useInMemoryProcessing;
const useFileSystemCaching = CONFIG.environment.useFileSystemCaching;  
const maxMemoryUsage = CONFIG.environment.maxMemoryUsage;
const preferStreaming = CONFIG.environment.preferStreaming;
```

## Configuration Flags

### `useInMemoryProcessing` (boolean)
- **True**: Serverless environments, low-memory systems
- **False**: Local development, high-memory systems
- **Purpose**: Optimize for memory-constrained environments

### `useFileSystemCaching` (boolean) 
- **True**: Local development, persistent environments
- **False**: Serverless, ephemeral environments
- **Purpose**: Enable disk caching when filesystem is writable and persistent

### `maxMemoryUsage` (bytes)
- **Value**: 80% of available system memory
- **Lambda**: Uses AWS_LAMBDA_FUNCTION_MEMORY_SIZE if available
- **Purpose**: Prevent out-of-memory errors

### Additional Flags
- `preferStreaming`: Use streaming APIs for large responses
- `enablePersistence`: Enable persistent storage features  
- `timeoutMultiplier`: Adjust timeouts based on environment

## Environment Detection Examples

### Netlify Detection
```javascript
// Environment Variables
NETLIFY=true
DEPLOY_URL=https://app-name.netlify.app
CONTEXT=production
NETLIFY_FUNCTIONS_PORT=8888

// Results
isNetlify() → true
isServerless() → true
useInMemoryProcessing → true
useFileSystemCaching → false
```

### AWS Lambda Detection
```javascript
// Environment Variables  
AWS_LAMBDA_FUNCTION_NAME=my-function
AWS_EXECUTION_ENV=AWS_Lambda_nodejs18.x
AWS_LAMBDA_FUNCTION_MEMORY_SIZE=512

// Results
isAWSLambda() → true
isServerless() → true
maxMemoryUsage → 409MB (80% of 512MB)
```

### Local Development
```javascript
// No special environment variables

// Results
isLocal() → true
isServerless() → false
useFileSystemCaching → true
enablePersistence → true
```

### Docker Detection
```javascript
// File System Checks
/.dockerenv exists OR
/proc/1/cgroup contains 'docker'

// Results
isDocker() → true
isContainerized() → true
```

## Server Integration

Environment information is automatically logged on server startup:

```
🌍 Environment Detection Results:
  Platform: Netlify
  Serverless: ✅
  Containerized: ❌
  Writable FS: ❌
  Memory: 1024MB
  CPUs: 2
  Node: v18.17.0

⚙️ Recommended Configuration:
  In-Memory Processing: ✅
  Filesystem Caching: ❌
  Max Memory Usage: 819MB
  Prefer Streaming: ✅
```

## Architecture

### Files
- `utils/environment-detector.js` - Core detection logic
- `config/app-config.js` - Configuration integration
- `server.js` - Startup logging

### Detection Methods

1. **Environment Variables**: Check platform-specific env vars
2. **File System**: Look for platform indicator files (/.dockerenv)
3. **Process Analysis**: Examine runtime characteristics
4. **Resource Analysis**: Memory, CPU, filesystem capabilities

### Caching
- Detection runs once at startup
- Results are cached for performance
- Fresh instance can be created for testing

## Benefits

### Automatic Optimization
- **Memory Management**: Prevents OOM in serverless environments
- **Caching Strategy**: Uses appropriate storage for platform
- **Performance Tuning**: Optimizes based on available resources

### Deployment Flexibility  
- **Zero Configuration**: Works out of the box on any platform
- **Platform Agnostic**: Adapts automatically to deployment target
- **Development Friendly**: Optimal settings for local development

### Debugging Support
- **Comprehensive Logging**: Detailed environment information
- **Detection Visibility**: See exactly what was detected
- **Configuration Explanation**: Understand why settings were chosen

## Testing

The system includes comprehensive testing for different environments:

```bash
node -e "
import('./utils/environment-detector.js').then(module => {
  const detector = module.default;
  detector.logEnvironmentInfo();
  console.log('Detection working:', detector.getSummary());
});
"
```

## Future Enhancements

- Google Cloud Functions detection
- Azure Functions detection  
- Kubernetes environment detection
- Edge runtime detection (Deno Deploy, Cloudflare Workers)
- Performance metric collection
- Resource usage monitoring

---

This environment detection system ensures ScottGPT performs optimally across all deployment platforms while providing comprehensive visibility into the runtime environment.