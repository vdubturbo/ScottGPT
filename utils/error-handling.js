/**
 * ScottGPT Comprehensive Error Handling System
 * ==========================================
 * 
 * This module provides standardized error handling, retry logic, and monitoring
 * for robust production operation with graceful degradation.
 */

import CONFIG from '../config/app-config.js';

/**
 * Standardized Error Types
 */
export class ScottGPTError extends Error {
  constructor(message, code, category, context = {}, retryable = false) {
    super(message);
    this.name = 'ScottGPTError';
    this.code = code;
    this.category = category;
    this.context = context;
    this.retryable = retryable;
    this.timestamp = new Date().toISOString();
    this.service = context.service || 'unknown';
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ScottGPTError);
    }
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      category: this.category,
      context: this.context,
      retryable: this.retryable,
      timestamp: this.timestamp,
      service: this.service,
      stack: this.stack
    };
  }
}

/**
 * Specific Error Types
 */
export class NetworkError extends ScottGPTError {
  constructor(message, context = {}) {
    super(message, 'NETWORK_ERROR', 'network', context, true);
    this.name = 'NetworkError';
  }
}

export class APIError extends ScottGPTError {
  constructor(message, apiProvider, statusCode, context = {}) {
    super(message, 'API_ERROR', 'api', { ...context, apiProvider, statusCode }, true);
    this.name = 'APIError';
    this.apiProvider = apiProvider;
    this.statusCode = statusCode;
  }
}

export class RateLimitError extends APIError {
  constructor(message, apiProvider, resetTime, context = {}) {
    super(message, apiProvider, 429, { ...context, resetTime });
    this.name = 'RateLimitError';
    this.resetTime = resetTime;
    this.retryable = true;
  }
}

export class ValidationError extends ScottGPTError {
  constructor(message, field, value, context = {}) {
    super(message, 'VALIDATION_ERROR', 'validation', { ...context, field, value }, false);
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

export class ConfigurationError extends ScottGPTError {
  constructor(message, parameter, context = {}) {
    super(message, 'CONFIG_ERROR', 'configuration', { ...context, parameter }, false);
    this.name = 'ConfigurationError';
    this.parameter = parameter;
  }
}

export class ProcessingError extends ScottGPTError {
  constructor(message, operation, context = {}) {
    super(message, 'PROCESSING_ERROR', 'processing', { ...context, operation }, true);
    this.name = 'ProcessingError';
    this.operation = operation;
  }
}

export class DatabaseError extends ScottGPTError {
  constructor(message, query, context = {}) {
    super(message, 'DATABASE_ERROR', 'database', { ...context, query }, true);
    this.name = 'DatabaseError';
    this.query = query;
  }
}

/**
 * Error Classification Utility
 */
export function classifyError(error) {
  // Network errors
  if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || 
      error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED' ||
      error.code === 'ENETUNREACH' || error.code === 'EHOSTUNREACH') {
    return new NetworkError(error.message, { originalError: error.code });
  }
  
  // Rate limiting errors
  if (error.status === 429 || error.statusCode === 429 || 
      error.message?.includes('rate') || error.message?.includes('429')) {
    const resetTime = error.headers?.['retry-after'] || error.headers?.['x-ratelimit-reset'];
    return new RateLimitError(error.message, 'unknown', resetTime, { originalError: error });
  }
  
  // API errors
  if (error.status || error.statusCode) {
    const statusCode = error.status || error.statusCode;
    const apiProvider = error.provider || (error.message?.includes('OpenAI') ? 'openai' : 
                       error.message?.includes('Cohere') ? 'cohere' : 'unknown');
    return new APIError(error.message, apiProvider, statusCode, { originalError: error });
  }
  
  // Database errors
  if (error.message?.includes('database') || error.message?.includes('supabase') ||
      error.code?.startsWith('PGSQL')) {
    return new DatabaseError(error.message, null, { originalError: error });
  }
  
  // Validation errors
  if (error.message?.includes('validation') || error.message?.includes('invalid')) {
    return new ValidationError(error.message, null, null, { originalError: error });
  }
  
  // Default to processing error
  return new ProcessingError(error.message, 'unknown', { originalError: error });
}

/**
 * Retry Configuration
 */
const RETRY_CONFIG = {
  network: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 30000,
    exponentialFactor: 2,
    jitter: true
  },
  api: {
    maxRetries: 3,
    baseDelay: 1000,
    maxDelay: 60000,
    exponentialFactor: 2,
    jitter: true
  },
  rateLimit: {
    maxRetries: 5,
    baseDelay: 5000,
    maxDelay: 300000, // 5 minutes
    exponentialFactor: 1.5,
    jitter: false
  },
  database: {
    maxRetries: 3,
    baseDelay: 500,
    maxDelay: 10000,
    exponentialFactor: 2,
    jitter: true
  },
  processing: {
    maxRetries: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    exponentialFactor: 1.5,
    jitter: false
  }
};

/**
 * Calculate retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(attempt, config) {
  const exponentialDelay = config.baseDelay * Math.pow(config.exponentialFactor, attempt);
  const delay = Math.min(exponentialDelay, config.maxDelay);
  
  if (config.jitter) {
    // Add random jitter ±25% to prevent thundering herd
    const jitterAmount = delay * 0.25;
    return delay + (Math.random() * 2 - 1) * jitterAmount;
  }
  
  return delay;
}

/**
 * Intelligent Retry Logic with Exponential Backoff
 */
export async function retryOperation(
  operation, 
  context = {}, 
  customConfig = null
) {
  const operationName = context.operation || 'unknown operation';
  const service = context.service || 'unknown service';
  
  let lastError;
  let attempt = 0;
  
  while (true) {
    try {
      const result = await operation();
      
      // Log successful retry if this wasn't the first attempt
      if (attempt > 0) {
        logError('info', {
          message: `✅ Operation succeeded after ${attempt} retries`,
          operation: operationName,
          service: service,
          attempt: attempt
        });
      }
      
      return result;
      
    } catch (error) {
      lastError = classifyError(error);
      
      // Add context to error
      lastError.context = { 
        ...lastError.context, 
        ...context, 
        attempt: attempt + 1 
      };
      
      // Determine retry configuration
      const config = customConfig || RETRY_CONFIG[lastError.category] || RETRY_CONFIG.processing;
      
      // Check if we should retry
      if (!lastError.retryable || attempt >= config.maxRetries) {
        logError('error', {
          message: `❌ Operation failed after ${attempt + 1} attempts`,
          operation: operationName,
          service: service,
          error: lastError.toJSON(),
          finalAttempt: true
        });
        
        throw lastError;
      }
      
      attempt++;
      const delay = calculateRetryDelay(attempt - 1, config);
      
      logError('warn', {
        message: `⏳ Operation failed, retrying ${attempt}/${config.maxRetries} after ${Math.round(delay)}ms`,
        operation: operationName,
        service: service,
        error: lastError.message,
        attempt: attempt,
        delay: Math.round(delay)
      });
      
      await sleep(delay);
    }
  }
}

/**
 * Circuit Breaker Pattern Implementation
 */
export class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 60000; // 1 minute
    this.monitoringPeriod = options.monitoringPeriod || 60000; // 1 minute
    this.name = options.name || 'circuit-breaker';
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.successCount = 0;
    this.totalRequests = 0;
    
    // Reset failure count periodically
    this.monitoringInterval = setInterval(() => {
      this.resetMonitoringPeriod();
    }, this.monitoringPeriod);
  }
  
  async execute(operation, context = {}) {
    this.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        logError('info', {
          message: `🔄 Circuit breaker ${this.name} transitioning to HALF_OPEN`,
          circuitBreaker: this.name,
          state: 'HALF_OPEN'
        });
      } else {
        throw new ScottGPTError(
          `Circuit breaker ${this.name} is OPEN - service temporarily unavailable`,
          'CIRCUIT_BREAKER_OPEN',
          'circuit_breaker',
          { circuitBreaker: this.name, state: 'OPEN' },
          false
        );
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
      
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 3) { // Require 3 successes to close
        this.state = 'CLOSED';
        this.failureCount = 0;
        logError('info', {
          message: `✅ Circuit breaker ${this.name} reset to CLOSED`,
          circuitBreaker: this.name,
          state: 'CLOSED'
        });
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }
  
  onFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.state === 'CLOSED' && this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      logError('warn', {
        message: `⚠️ Circuit breaker ${this.name} tripped to OPEN`,
        circuitBreaker: this.name,
        state: 'OPEN',
        failureCount: this.failureCount,
        threshold: this.failureThreshold
      });
    } else if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      logError('warn', {
        message: `⚠️ Circuit breaker ${this.name} failed in HALF_OPEN, returning to OPEN`,
        circuitBreaker: this.name,
        state: 'OPEN'
      });
    }
  }
  
  resetMonitoringPeriod() {
    if (this.state === 'CLOSED' && this.failureCount > 0) {
      this.failureCount = Math.max(0, this.failureCount - 1);
    }
  }
  
  getStatus() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      totalRequests: this.totalRequests,
      successRate: this.totalRequests > 0 ? 
        ((this.totalRequests - this.failureCount) / this.totalRequests * 100).toFixed(2) + '%' : '0%'
    };
  }
  
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
  }
}

/**
 * Global Circuit Breakers for External Services
 */
export const circuitBreakers = {
  openai: new CircuitBreaker({ 
    name: 'openai', 
    failureThreshold: 5, 
    resetTimeout: 120000 // 2 minutes 
  }),
  cohere: new CircuitBreaker({ 
    name: 'cohere', 
    failureThreshold: 5, 
    resetTimeout: 120000 // 2 minutes 
  }),
  supabase: new CircuitBreaker({ 
    name: 'supabase', 
    failureThreshold: 10, 
    resetTimeout: 60000 // 1 minute 
  })
};

/**
 * Structured Error Logging
 */
export function logError(level, data) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    ...data,
    environment: CONFIG.environment.NODE_ENV
  };
  
  // Console logging with appropriate level
  switch (level) {
    case 'error':
      console.error('🚨', JSON.stringify(logEntry, null, 2));
      break;
    case 'warn':
      console.warn('⚠️', JSON.stringify(logEntry, null, 2));
      break;
    case 'info':
      console.log('ℹ️', JSON.stringify(logEntry, null, 2));
      break;
    default:
      console.log('📝', JSON.stringify(logEntry, null, 2));
  }
  
  // TODO: In production, also send to monitoring service
  // await sendToMonitoring(logEntry);
}

/**
 * Error Metrics Tracking
 */
class ErrorMetrics {
  constructor() {
    this.metrics = {
      total: 0,
      byCategory: {},
      byService: {},
      byCode: {},
      recentErrors: []
    };
    
    // Clean up old errors every hour
    setInterval(() => {
      const oneHourAgo = Date.now() - 60 * 60 * 1000;
      this.metrics.recentErrors = this.metrics.recentErrors.filter(
        error => new Date(error.timestamp).getTime() > oneHourAgo
      );
    }, 60 * 60 * 1000);
  }
  
  recordError(error) {
    this.metrics.total++;
    
    // Track by category
    const category = error.category || 'unknown';
    this.metrics.byCategory[category] = (this.metrics.byCategory[category] || 0) + 1;
    
    // Track by service
    const service = error.service || 'unknown';
    this.metrics.byService[service] = (this.metrics.byService[service] || 0) + 1;
    
    // Track by error code
    const code = error.code || 'unknown';
    this.metrics.byCode[code] = (this.metrics.byCode[code] || 0) + 1;
    
    // Keep recent errors (last 100)
    this.metrics.recentErrors.push({
      timestamp: error.timestamp,
      category: category,
      service: service,
      code: code,
      message: error.message
    });
    
    if (this.metrics.recentErrors.length > 100) {
      this.metrics.recentErrors.shift();
    }
  }
  
  getMetrics() {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;
    const recentErrors = this.metrics.recentErrors.filter(
      error => new Date(error.timestamp).getTime() > oneHourAgo
    );
    
    return {
      total: this.metrics.total,
      recentCount: recentErrors.length,
      byCategory: this.metrics.byCategory,
      byService: this.metrics.byService,
      byCode: this.metrics.byCode,
      recentErrors: recentErrors.slice(-10) // Last 10 errors
    };
  }
}

export const errorMetrics = new ErrorMetrics();

/**
 * Graceful Error Handler
 * Handles errors without crashing the process
 */
export function handleError(error, context = {}) {
  try {
    const classifiedError = classifyError(error);
    classifiedError.context = { ...classifiedError.context, ...context };
    
    // Record metrics
    errorMetrics.recordError(classifiedError);
    
    // Log error
    logError('error', {
      message: 'Error handled gracefully',
      error: classifiedError.toJSON()
    });
    
    return classifiedError;
    
  } catch (handlingError) {
    // Fallback if error handling itself fails
    console.error('🚨 Error in error handling:', handlingError);
    console.error('🚨 Original error:', error);
    
    return new ScottGPTError(
      'Error handling failed',
      'ERROR_HANDLING_FAILED',
      'system',
      { originalError: error.message },
      false
    );
  }
}

/**
 * Utility Functions
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Graceful Process Termination
 */
export function setupGracefulShutdown() {
  const shutdown = (signal) => {
    console.log(`🔄 Received ${signal}, shutting down gracefully...`);
    
    // Close circuit breakers
    Object.values(circuitBreakers).forEach(cb => cb.destroy());
    
    // Give ongoing operations time to complete
    setTimeout(() => {
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    }, 5000);
  };
  
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  
  // Handle uncaught exceptions gracefully
  process.on('uncaughtException', (error) => {
    console.error('🚨 Uncaught Exception:', error);
    handleError(error, { source: 'uncaughtException' });
    
    // Exit after logging
    setTimeout(() => process.exit(1), 1000);
  });
  
  process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    handleError(reason, { source: 'unhandledRejection' });
  });
}

/**
 * Error Recovery Strategies
 */
export const RecoveryStrategies = {
  /**
   * Continue processing remaining items when one fails
   */
  async continueOnError(items, processor, context = {}) {
    const results = [];
    const errors = [];
    
    for (const [index, item] of items.entries()) {
      try {
        const result = await processor(item, index);
        results.push({ success: true, data: result, index });
      } catch (error) {
        const handledError = handleError(error, { 
          ...context, 
          item: item, 
          index: index 
        });
        errors.push({ success: false, error: handledError, index });
        results.push({ success: false, error: handledError, index });
      }
    }
    
    return {
      results,
      errors,
      successCount: results.filter(r => r.success).length,
      errorCount: errors.length,
      totalCount: items.length
    };
  },
  
  /**
   * Provide fallback when primary operation fails
   */
  async withFallback(primaryOperation, fallbackOperation, context = {}) {
    try {
      return await primaryOperation();
    } catch (primaryError) {
      logError('warn', {
        message: 'Primary operation failed, attempting fallback',
        primaryError: primaryError.message,
        context
      });
      
      try {
        const result = await fallbackOperation();
        logError('info', {
          message: 'Fallback operation succeeded',
          context
        });
        return result;
      } catch (fallbackError) {
        logError('error', {
          message: 'Both primary and fallback operations failed',
          primaryError: primaryError.message,
          fallbackError: fallbackError.message,
          context
        });
        throw primaryError; // Throw original error
      }
    }
  }
};

// Initialize graceful shutdown
setupGracefulShutdown();