/**
 * Telemetry and Logging Infrastructure
 * Provides comprehensive monitoring, metrics collection, and debugging capabilities
 * Supports multiple backends (console, file, external services)
 */

import {
  TelemetryAdapter,
  JDProcessingError
} from './types';

/**
 * Log levels for different types of events
 */
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

/**
 * Telemetry event types
 */
export interface TelemetryEvent {
  type: 'counter' | 'gauge' | 'timer' | 'histogram';
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp: number;
}

/**
 * Log entry structure
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: any;
  tags?: Record<string, string>;
  timestamp: number;
  sessionId?: string;
  userId?: string;
}

/**
 * Console-based telemetry implementation
 */
export class ConsoleTelemetry implements TelemetryAdapter {
  private events: TelemetryEvent[] = [];
  private logs: LogEntry[] = [];
  
  constructor(
    private logLevel: LogLevel = LogLevel.INFO,
    private maxHistory: number = 1000
  ) {}

  counter(name: string, value: number = 1, tags?: Record<string, string>): void {
    const event: TelemetryEvent = {
      type: 'counter',
      name,
      value,
      tags,
      timestamp: Date.now()
    };
    
    this.events.push(event);
    this.trimHistory();
    
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(`[COUNTER] ${name}: ${value}`, tags ? `(${JSON.stringify(tags)})` : '');
    }
  }

  gauge(name: string, value: number, tags?: Record<string, string>): void {
    const event: TelemetryEvent = {
      type: 'gauge',
      name,
      value,
      tags,
      timestamp: Date.now()
    };
    
    this.events.push(event);
    this.trimHistory();
    
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(`[GAUGE] ${name}: ${value}`, tags ? `(${JSON.stringify(tags)})` : '');
    }
  }

  timer(name: string, durationMs: number, tags?: Record<string, string>): void {
    const event: TelemetryEvent = {
      type: 'timer',
      name,
      value: durationMs,
      tags,
      timestamp: Date.now()
    };
    
    this.events.push(event);
    this.trimHistory();
    
    if (this.logLevel <= LogLevel.INFO) {
      console.log(`[TIMER] ${name}: ${durationMs}ms`, tags ? `(${JSON.stringify(tags)})` : '');
    }
  }

  histogram(name: string, value: number, tags?: Record<string, string>): void {
    const event: TelemetryEvent = {
      type: 'histogram',
      name,
      value,
      tags,
      timestamp: Date.now()
    };
    
    this.events.push(event);
    this.trimHistory();
    
    if (this.logLevel <= LogLevel.DEBUG) {
      console.log(`[HISTOGRAM] ${name}: ${value}`, tags ? `(${JSON.stringify(tags)})` : '');
    }
  }

  log(level: LogLevel, message: string, context?: any, tags?: Record<string, string>): void {
    const entry: LogEntry = {
      level,
      message,
      context,
      tags,
      timestamp: Date.now()
    };
    
    this.logs.push(entry);
    this.trimHistory();
    
    if (level >= this.logLevel) {
      const levelName = LogLevel[level];
      const tagStr = tags ? ` (${JSON.stringify(tags)})` : '';
      const contextStr = context ? ` ${JSON.stringify(context, null, 2)}` : '';
      console.log(`[${levelName}] ${message}${tagStr}${contextStr}`);
    }
  }

  /**
   * Get telemetry events
   */
  getEvents(): TelemetryEvent[] {
    return [...this.events];
  }

  /**
   * Get log entries
   */
  getLogs(): LogEntry[] {
    return [...this.logs];
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): Record<string, any> {
    const metrics: Record<string, any> = {};
    
    // Aggregate counters
    const counters: Record<string, number> = {};
    const gauges: Record<string, number> = {};
    const timers: Record<string, number[]> = {};
    
    for (const event of this.events) {
      switch (event.type) {
        case 'counter':
          counters[event.name] = (counters[event.name] || 0) + event.value;
          break;
        case 'gauge':
          gauges[event.name] = event.value; // Latest value
          break;
        case 'timer':
          if (!timers[event.name]) timers[event.name] = [];
          timers[event.name].push(event.value);
          break;
      }
    }
    
    // Calculate timer statistics
    const timerStats: Record<string, any> = {};
    for (const [name, values] of Object.entries(timers)) {
      if (values.length > 0) {
        const sorted = [...values].sort((a, b) => a - b);
        timerStats[name] = {
          count: values.length,
          min: Math.min(...values),
          max: Math.max(...values),
          avg: values.reduce((sum, v) => sum + v, 0) / values.length,
          p50: sorted[Math.floor(sorted.length * 0.5)],
          p95: sorted[Math.floor(sorted.length * 0.95)],
          p99: sorted[Math.floor(sorted.length * 0.99)]
        };
      }
    }
    
    return {
      counters,
      gauges,
      timers: timerStats,
      totalEvents: this.events.length,
      totalLogs: this.logs.length
    };
  }

  /**
   * Clear all telemetry data
   */
  clear(): void {
    this.events.length = 0;
    this.logs.length = 0;
  }

  private trimHistory(): void {
    if (this.events.length > this.maxHistory) {
      this.events.splice(0, this.events.length - this.maxHistory);
    }
    if (this.logs.length > this.maxHistory) {
      this.logs.splice(0, this.logs.length - this.maxHistory);
    }
  }
}

/**
 * Enhanced logger with structured logging
 */
export class StructuredLogger {
  constructor(
    private telemetry: TelemetryAdapter,
    private sessionId?: string,
    private userId?: string
  ) {}

  debug(message: string, context?: any, tags?: Record<string, string>): void {
    this.telemetry.log(LogLevel.DEBUG, message, context, {
      ...tags,
      sessionId: this.sessionId,
      userId: this.userId
    });
  }

  info(message: string, context?: any, tags?: Record<string, string>): void {
    this.telemetry.log(LogLevel.INFO, message, context, {
      ...tags,
      sessionId: this.sessionId,
      userId: this.userId
    });
  }

  warn(message: string, context?: any, tags?: Record<string, string>): void {
    this.telemetry.log(LogLevel.WARN, message, context, {
      ...tags,
      sessionId: this.sessionId,
      userId: this.userId
    });
  }

  error(message: string, error?: Error | any, tags?: Record<string, string>): void {
    const context = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: (error as any).code
    } : error;

    this.telemetry.log(LogLevel.ERROR, message, context, {
      ...tags,
      sessionId: this.sessionId,
      userId: this.userId
    });
  }

  /**
   * Log pipeline stage
   */
  stage(stageName: string, startTime: number, success: boolean, context?: any): void {
    const duration = Date.now() - startTime;
    
    this.telemetry.timer(`pipeline.${stageName}.duration_ms`, duration, {
      success: success.toString(),
      sessionId: this.sessionId,
      userId: this.userId
    });

    this.telemetry.counter(`pipeline.${stageName}.${success ? 'success' : 'failure'}`, 1, {
      sessionId: this.sessionId,
      userId: this.userId
    });

    const message = `Pipeline stage '${stageName}' ${success ? 'completed' : 'failed'} in ${duration}ms`;
    this.telemetry.log(success ? LogLevel.INFO : LogLevel.ERROR, message, context, {
      stage: stageName,
      duration: duration.toString(),
      sessionId: this.sessionId,
      userId: this.userId
    });
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: { sessionId?: string; userId?: string }): StructuredLogger {
    return new StructuredLogger(
      this.telemetry,
      additionalContext.sessionId || this.sessionId,
      additionalContext.userId || this.userId
    );
  }
}

/**
 * Performance monitor for tracking system performance
 */
export class PerformanceMonitor {
  private activeTimers = new Map<string, number>();

  constructor(
    private telemetry: TelemetryAdapter,
    private logger: StructuredLogger
  ) {}

  /**
   * Start timing an operation
   */
  startTimer(operationName: string): string {
    const timerId = `${operationName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.activeTimers.set(timerId, Date.now());
    return timerId;
  }

  /**
   * End timing operation
   */
  endTimer(timerId: string, tags?: Record<string, string>): number {
    const startTime = this.activeTimers.get(timerId);
    if (!startTime) {
      this.logger.warn(`Timer ${timerId} not found`);
      return 0;
    }

    const duration = Date.now() - startTime;
    this.activeTimers.delete(timerId);

    // Extract operation name from timer ID
    const operationName = timerId.split('_')[0];
    this.telemetry.timer(`perf.${operationName}`, duration, tags);

    return duration;
  }

  /**
   * Measure memory usage
   */
  measureMemory(operationName: string, tags?: Record<string, string>): void {
    const memUsage = process.memoryUsage();
    
    this.telemetry.gauge(`memory.${operationName}.rss`, memUsage.rss, tags);
    this.telemetry.gauge(`memory.${operationName}.heap_used`, memUsage.heapUsed, tags);
    this.telemetry.gauge(`memory.${operationName}.heap_total`, memUsage.heapTotal, tags);
    this.telemetry.gauge(`memory.${operationName}.external`, memUsage.external, tags);
  }

  /**
   * Track error rate
   */
  trackErrorRate(operationName: string, isError: boolean, tags?: Record<string, string>): void {
    this.telemetry.counter(`error_rate.${operationName}.total`, 1, tags);
    if (isError) {
      this.telemetry.counter(`error_rate.${operationName}.errors`, 1, tags);
    }
  }

  /**
   * Track token usage
   */
  trackTokenUsage(
    operationName: string, 
    promptTokens: number, 
    completionTokens: number,
    tags?: Record<string, string>
  ): void {
    this.telemetry.gauge(`tokens.${operationName}.prompt`, promptTokens, tags);
    this.telemetry.gauge(`tokens.${operationName}.completion`, completionTokens, tags);
    this.telemetry.gauge(`tokens.${operationName}.total`, promptTokens + completionTokens, tags);
  }

  /**
   * Track coverage metrics
   */
  trackCoverage(
    operationName: string,
    totalRequirements: number,
    coveredRequirements: number,
    tags?: Record<string, string>
  ): void {
    const coveragePercent = totalRequirements > 0 ? coveredRequirements / totalRequirements : 0;
    
    this.telemetry.gauge(`coverage.${operationName}.total_requirements`, totalRequirements, tags);
    this.telemetry.gauge(`coverage.${operationName}.covered_requirements`, coveredRequirements, tags);
    this.telemetry.gauge(`coverage.${operationName}.percentage`, coveragePercent, tags);
  }
}

/**
 * Error tracker for JD processing errors
 */
export class ErrorTracker {
  private errorCounts = new Map<string, number>();

  constructor(
    private telemetry: TelemetryAdapter,
    private logger: StructuredLogger
  ) {}

  /**
   * Track JD processing error
   */
  trackError(error: JDProcessingError | Error, context?: any): void {
    const errorType = error instanceof JDProcessingError ? error.code : 'UNKNOWN_ERROR';
    const errorKey = `${errorType}:${error.message}`;
    
    // Update error counts
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Send telemetry
    this.telemetry.counter('errors.total', 1, { errorType });
    this.telemetry.counter(`errors.${errorType}`, 1);

    // Log error
    this.logger.error(`JD Processing Error: ${error.message}`, error, {
      errorType,
      errorCount: (currentCount + 1).toString(),
      ...context
    });
  }

  /**
   * Get error statistics
   */
  getErrorStats(): Array<{ error: string; count: number }> {
    return Array.from(this.errorCounts.entries()).map(([error, count]) => ({
      error,
      count
    })).sort((a, b) => b.count - a.count);
  }

  /**
   * Reset error counts
   */
  resetErrors(): void {
    this.errorCounts.clear();
  }
}

/**
 * Factory function to create telemetry infrastructure
 */
export function createTelemetryInfrastructure(
  logLevel: LogLevel = LogLevel.INFO,
  sessionId?: string,
  userId?: string
): {
  telemetry: TelemetryAdapter;
  logger: StructuredLogger;
  performance: PerformanceMonitor;
  errorTracker: ErrorTracker;
} {
  const telemetry = new ConsoleTelemetry(logLevel);
  const logger = new StructuredLogger(telemetry, sessionId, userId);
  const performance = new PerformanceMonitor(telemetry, logger);
  const errorTracker = new ErrorTracker(telemetry, logger);

  return {
    telemetry,
    logger,
    performance,
    errorTracker
  };
}