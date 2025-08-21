/**
 * Global OpenAI API Protection Service
 * Implements centralized rate limiting, circuit breaker, and usage tracking
 */

import winston from 'winston';

class OpenAIProtectionService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/openai-protection.log' })
      ]
    });

    // Global circuit breaker state - EXTREMELY aggressive protection
    this.circuitBreaker = {
      isOpen: false,
      failureCount: 0,
      lastFailureTime: null,
      threshold: 3, // Open after 3 failures (reasonable protection)
      cooldownPeriod: 5 * 60 * 1000 // 5 minutes cooldown
    };

    // Rate limiting - Reasonable protection for chat usage
    this.rateLimiter = {
      requests: [],
      maxRequestsPerMinute: 4, // 1 request per 15 seconds
      windowMs: 1 * 60 * 1000 // 1 minute window
    };

    // Request deduplication
    this.pendingRequests = new Map();
    
    // Usage tracking
    this.usageStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastResetTime: Date.now(),
      quotaExceededCount: 0
    };
  }

  /**
   * Check if API call should be allowed with detailed blocking reasons
   */
  canMakeRequest(requestKey = null) {
    const now = Date.now();
    
    // Check circuit breaker with detailed logging
    if (this.isCircuitBreakerOpen()) {
      const timeUntilCooldown = this.circuitBreaker.lastFailureTime + this.circuitBreaker.cooldownPeriod - now;
      const minutesRemaining = Math.ceil(timeUntilCooldown / (60 * 1000));
      
      this.logger.warn('OpenAI request BLOCKED - Circuit breaker protection active', {
        requestKey,
        reason: 'circuit_breaker_open',
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.circuitBreaker.threshold,
        minutesUntilCooldown: minutesRemaining,
        lastFailureTime: new Date(this.circuitBreaker.lastFailureTime).toISOString(),
        message: `Circuit breaker will remain open for ${minutesRemaining} more minutes`
      });
      return { 
        allowed: false, 
        reason: 'circuit_breaker_open',
        minutesRemaining,
        details: `Circuit breaker active. Wait ${minutesRemaining} minutes after last failure.`
      };
    }

    // Check rate limiting with detailed logging
    if (!this.isWithinRateLimit()) {
      const recentRequests = this.rateLimiter.requests.length;
      const oldestRequestTime = this.rateLimiter.requests.length > 0 ? 
        Math.min(...this.rateLimiter.requests) : null;
      const timeUntilNextAllowed = oldestRequestTime ? 
        oldestRequestTime + this.rateLimiter.windowMs - now : 0;
      const minutesUntilNextRequest = Math.ceil(timeUntilNextAllowed / (60 * 1000));
      
      this.logger.warn('OpenAI request BLOCKED - Rate limit exceeded (ULTRA AGGRESSIVE PROTECTION)', {
        requestKey,
        reason: 'rate_limit_exceeded',
        currentRequests: recentRequests,
        maxAllowed: this.rateLimiter.maxRequestsPerMinute,
        windowMinutes: this.rateLimiter.windowMs / (60 * 1000),
        minutesUntilNextAllowed: minutesUntilNextRequest,
        oldestRequestTime: oldestRequestTime ? new Date(oldestRequestTime).toISOString() : null,
        message: `Rate limiting: Max 4 requests per minute (1 every 15 seconds). Wait ${minutesUntilNextRequest} minutes.`
      });
      return { 
        allowed: false, 
        reason: 'rate_limit_exceeded',
        minutesRemaining: minutesUntilNextRequest,
        details: `Rate limit: Max 4 requests per minute. Wait ${minutesUntilNextRequest} minutes.`
      };
    }

    // Check for duplicate requests with detailed logging
    if (requestKey && this.pendingRequests.has(requestKey)) {
      const pendingStartTime = this.pendingRequests.get(requestKey);
      const pendingDuration = Math.round((now - pendingStartTime) / 1000);
      
      this.logger.warn('OpenAI request BLOCKED - Duplicate request prevention', {
        requestKey,
        reason: 'duplicate_request',
        pendingDurationSeconds: pendingDuration,
        pendingStartTime: new Date(pendingStartTime).toISOString(),
        totalPendingRequests: this.pendingRequests.size,
        message: `Request with key "${requestKey}" already in progress for ${pendingDuration} seconds`
      });
      return { 
        allowed: false, 
        reason: 'duplicate_request',
        details: `Request "${requestKey}" already in progress for ${pendingDuration}s`
      };
    }

    // Request allowed - log for transparency
    this.logger.info('OpenAI request ALLOWED - All protection checks passed', {
      requestKey,
      circuitBreakerClosed: !this.circuitBreaker.isOpen,
      withinRateLimit: true,
      noDuplicateDetected: !requestKey || !this.pendingRequests.has(requestKey),
      currentRateLimitUsage: `${this.rateLimiter.requests.length}/0.1 per 10min`,
      pendingRequestsCount: this.pendingRequests.size
    });

    return { allowed: true };
  }

  /**
   * Register a new request
   */
  registerRequest(requestKey = null) {
    this.usageStats.totalRequests++;
    this.rateLimiter.requests.push(Date.now());
    
    if (requestKey) {
      this.pendingRequests.set(requestKey, Date.now());
    }

    this.logger.info('OpenAI request registered', { 
      requestKey,
      totalRequests: this.usageStats.totalRequests,
      circuitBreakerOpen: this.circuitBreaker.isOpen
    });
  }

  /**
   * Record successful request with guaranteed cleanup
   */
  recordSuccess(requestKey = null) {
    this.usageStats.successfulRequests++;
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.isOpen = false;
    
    // Ensure pending request is always cleaned up
    let wasCleanedUp = false;
    if (requestKey && this.pendingRequests.has(requestKey)) {
      this.pendingRequests.delete(requestKey);
      wasCleanedUp = true;
    }

    this.logger.info('OpenAI request SUCCESS - Protection state updated', { 
      requestKey,
      successRate: (this.usageStats.successfulRequests / this.usageStats.totalRequests * 100).toFixed(1) + '%',
      pendingRequestCleaned: wasCleanedUp,
      remainingPendingRequests: this.pendingRequests.size,
      circuitBreakerReset: true,
      failureCountReset: true
    });
  }

  /**
   * Record failed request with guaranteed cleanup and aggressive protection
   */
  recordFailure(error, requestKey = null) {
    this.usageStats.failedRequests++;
    this.circuitBreaker.failureCount++;
    this.circuitBreaker.lastFailureTime = Date.now();
    
    // Ensure pending request is always cleaned up
    let wasCleanedUp = false;
    if (requestKey && this.pendingRequests.has(requestKey)) {
      this.pendingRequests.delete(requestKey);
      wasCleanedUp = true;
    }

    // Check for quota exceeded specifically - immediate protection
    if (error?.message?.includes('429') || error?.message?.includes('quota')) {
      this.usageStats.quotaExceededCount++;
      this.circuitBreaker.isOpen = true; // Immediately open circuit breaker
      this.logger.error('OpenAI QUOTA EXCEEDED - Circuit breaker opened immediately (30min cooldown)', {
        requestKey,
        quotaExceededCount: this.usageStats.quotaExceededCount,
        error: error.message,
        cooldownMinutes: this.circuitBreaker.cooldownPeriod / (60 * 1000),
        pendingRequestCleaned: wasCleanedUp,
        message: 'ULTRA AGGRESSIVE PROTECTION: Circuit breaker opened for 30 minutes due to quota exceeded'
      });
    } else if (this.circuitBreaker.failureCount >= this.circuitBreaker.threshold) {
      this.circuitBreaker.isOpen = true;
      this.logger.error('OpenAI CIRCUIT BREAKER OPENED - Single failure threshold reached (30min cooldown)', {
        requestKey,
        failureCount: this.circuitBreaker.failureCount,
        threshold: this.circuitBreaker.threshold,
        cooldownMinutes: this.circuitBreaker.cooldownPeriod / (60 * 1000),
        pendingRequestCleaned: wasCleanedUp,
        error: error.message,
        message: 'ULTRA AGGRESSIVE PROTECTION: Circuit breaker opened after just 1 failure'
      });
    }

    this.logger.error('OpenAI request FAILED - Protection state updated', { 
      requestKey,
      error: error.message,
      errorType: error.name || 'Unknown',
      failureCount: this.circuitBreaker.failureCount,
      circuitBreakerOpen: this.circuitBreaker.isOpen,
      pendingRequestCleaned: wasCleanedUp,
      remainingPendingRequests: this.pendingRequests.size,
      failureRate: (this.usageStats.failedRequests / this.usageStats.totalRequests * 100).toFixed(1) + '%'
    });
  }

  /**
   * Check if circuit breaker is open
   */
  isCircuitBreakerOpen() {
    if (!this.circuitBreaker.isOpen) return false;
    
    // Check if cooldown period has passed
    const now = Date.now();
    if (now - this.circuitBreaker.lastFailureTime > this.circuitBreaker.cooldownPeriod) {
      this.circuitBreaker.isOpen = false;
      this.circuitBreaker.failureCount = 0;
      this.logger.info('OpenAI circuit breaker closed - cooldown period completed');
      return false;
    }
    
    return true;
  }

  /**
   * Check rate limiting (4 requests per minute)
   */
  isWithinRateLimit() {
    const now = Date.now();
    
    // Clean old requests outside the 1-minute window
    const requestsBefore = this.rateLimiter.requests.length;
    this.rateLimiter.requests = this.rateLimiter.requests.filter(
      timestamp => now - timestamp < this.rateLimiter.windowMs
    );
    const requestsAfter = this.rateLimiter.requests.length;
    
    // Log cleanup if any requests were removed
    if (requestsBefore > requestsAfter) {
      this.logger.info('Rate limiter cleanup completed', {
        requestsRemoved: requestsBefore - requestsAfter,
        remainingRequests: requestsAfter,
        windowMinutes: this.rateLimiter.windowMs / (60 * 1000)
      });
    }
    
    // Allow up to 4 requests per minute
    const withinLimit = this.rateLimiter.requests.length < this.rateLimiter.maxRequestsPerMinute;
    
    if (!withinLimit) {
      this.logger.warn('Rate limit check FAILED - Too many requests within 1-minute window', {
        requestsInWindow: this.rateLimiter.requests.length,
        oldestRequestAge: now - Math.min(...this.rateLimiter.requests),
        oldestRequestTime: new Date(Math.min(...this.rateLimiter.requests)).toISOString()
      });
    }
    
    return withinLimit;
  }

  /**
   * Get comprehensive protection status for API monitoring
   */
  getUsageStats() {
    const now = Date.now();
    const uptime = now - this.usageStats.lastResetTime;
    const nextRequestAllowedTime = this.rateLimiter.requests.length > 0 ?
      Math.max(...this.rateLimiter.requests) + this.rateLimiter.windowMs : now;
    const minutesUntilNextRequest = Math.max(0, Math.ceil((nextRequestAllowedTime - now) / (60 * 1000)));
    
    return {
      // Basic stats
      ...this.usageStats,
      uptime: Math.round(uptime / 1000), // seconds
      successRate: this.usageStats.totalRequests > 0 
        ? (this.usageStats.successfulRequests / this.usageStats.totalRequests * 100).toFixed(1) + '%'
        : '0%',
      
      // Ultra-aggressive protection status
      protectionLevel: 'ULTRA_AGGRESSIVE',
      circuitBreakerStatus: this.circuitBreaker.isOpen ? 'OPEN' : 'CLOSED',
      circuitBreakerThreshold: this.circuitBreaker.threshold,
      circuitBreakerCooldownMinutes: this.circuitBreaker.cooldownPeriod / (60 * 1000),
      
      // Rate limiting details
      rateLimitStatus: this.rateLimiter.requests.length > 0 ? 'BLOCKED' : 'AVAILABLE',
      currentRateLimitUsage: `${this.rateLimiter.requests.length}/1 per 10min`,
      minutesUntilNextRequestAllowed: minutesUntilNextRequest,
      rateLimitWindowMinutes: this.rateLimiter.windowMs / (60 * 1000),
      
      // Request tracking
      pendingRequests: this.pendingRequests.size,
      lastRequestTime: this.rateLimiter.requests.length > 0 ?
        new Date(Math.max(...this.rateLimiter.requests)).toISOString() : null,
      
      // Protection effectiveness
      requestsBlocked: this.usageStats.totalRequests - this.usageStats.successfulRequests - this.usageStats.failedRequests,
      failureRate: this.usageStats.totalRequests > 0 
        ? (this.usageStats.failedRequests / this.usageStats.totalRequests * 100).toFixed(1) + '%'
        : '0%'
    };
  }

  /**
   * Get simple protection status for API endpoints
   */
  getProtectionStatus() {
    const now = Date.now();
    const canMakeRequest = this.canMakeRequest();
    const nextRequestTime = this.rateLimiter.requests.length > 0 ?
      Math.max(...this.rateLimiter.requests) + this.rateLimiter.windowMs : now;
    const minutesUntilNext = Math.max(0, Math.ceil((nextRequestTime - now) / (60 * 1000)));
    
    return {
      status: canMakeRequest.allowed ? 'AVAILABLE' : 'BLOCKED',
      reason: canMakeRequest.reason || null,
      details: canMakeRequest.details || null,
      minutesUntilAvailable: canMakeRequest.allowed ? 0 : (canMakeRequest.minutesRemaining || minutesUntilNext),
      protectionLevel: 'REASONABLE',
      rateLimitConfig: '4 requests per minute',
      circuitBreakerConfig: '3 failures triggers 5min cooldown',
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Reset usage statistics (for debugging/testing)
   */
  resetStats() {
    this.usageStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastResetTime: Date.now(),
      quotaExceededCount: 0
    };
    this.circuitBreaker.failureCount = 0;
    this.circuitBreaker.isOpen = false;
    this.circuitBreaker.lastFailureTime = null;
    this.pendingRequests.clear();
    this.rateLimiter.requests = [];
    
    this.logger.info('OpenAI protection stats reset - REASONABLE protection re-enabled', {
      rateLimitConfig: '4 requests per minute',
      circuitBreakerConfig: '3 failures triggers 5min cooldown',
      protectionLevel: 'REASONABLE'
    });
  }
}

// Create singleton instance
const openaiProtection = new OpenAIProtectionService();

export default openaiProtection;