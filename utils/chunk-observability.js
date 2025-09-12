import { supabase } from '../config/database.js';
import fs from 'fs/promises';
import path from 'path';

export class ChunkObservabilityLogger {
  constructor() {
    this.sessionId = this.generateSessionId();
    this.metrics = {
      session_id: this.sessionId,
      start_time: Date.now(),
      chunks_created: 0,
      token_distribution: {},
      chunk_types: {},
      dedup_rate: 0,
      errors: [],
      performance_stats: {}
    };
    
    this.logFile = path.join(process.cwd(), 'logs', `chunking-${this.sessionId}.log`);
    this.ensureLogDirectory();
  }

  generateSessionId() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const random = Math.random().toString(36).substring(2, 8);
    return `chunk-${timestamp}-${random}`;
  }

  async ensureLogDirectory() {
    try {
      await fs.mkdir(path.dirname(this.logFile), { recursive: true });
    } catch (error) {
      console.warn('⚠️ [OBSERV] Could not create log directory:', error.message);
    }
  }

  logChunkCreation(chunk, processingTime = 0) {
    this.metrics.chunks_created++;
    
    const tokenCount = chunk.token_count || 0;
    const chunkType = chunk.metadata?.chunk_type || 'unknown';
    
    this.updateTokenDistribution(tokenCount);
    this.updateChunkTypeMetrics(chunkType);
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event: 'chunk_created',
      chunk_id: chunk.id,
      chunk_type: chunkType,
      token_count: tokenCount,
      content_length: chunk.content?.length || 0,
      processing_time_ms: processingTime,
      organization: chunk.organization,
      role: chunk.role,
      evidence_strength: chunk.metadata?.evidence_strength || null
    };
    
    this.writeLogEntry(logEntry);
    
    if (tokenCount > 180) {
      this.logError('token_budget_exceeded', `Chunk exceeded hard cap: ${tokenCount} tokens`, {
        chunk_id: chunk.id,
        token_count: tokenCount,
        content_preview: chunk.content?.slice(0, 100)
      });
    }
  }

  updateTokenDistribution(tokenCount) {
    let bucket;
    if (tokenCount <= 50) bucket = '0-50';
    else if (tokenCount <= 80) bucket = '51-80';
    else if (tokenCount <= 150) bucket = '81-150';
    else if (tokenCount <= 180) bucket = '151-180';
    else bucket = '181+';
    
    this.metrics.token_distribution[bucket] = (this.metrics.token_distribution[bucket] || 0) + 1;
  }

  updateChunkTypeMetrics(chunkType) {
    this.metrics.chunk_types[chunkType] = (this.metrics.chunk_types[chunkType] || 0) + 1;
  }

  logError(errorType, message, context = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event: 'error',
      error_type: errorType,
      message,
      context
    };
    
    this.metrics.errors.push(errorEntry);
    this.writeLogEntry(errorEntry);
    
    console.error(`❌ [OBSERV] ${errorType}: ${message}`, context);
  }

  logPerformanceMetric(metric, value, unit = 'ms') {
    this.metrics.performance_stats[metric] = { value, unit, timestamp: Date.now() };
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event: 'performance_metric',
      metric,
      value,
      unit
    };
    
    this.writeLogEntry(logEntry);
  }

  async logBeforeAfterHistogram(beforeData, afterData) {
    const comparison = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event: 'histogram_comparison',
      before: this.calculateHistogram(beforeData),
      after: this.calculateHistogram(afterData),
      improvement: this.calculateImprovement(beforeData, afterData)
    };
    
    this.writeLogEntry(comparison);
    
    console.log('\n📊 [OBSERV] Token Distribution Comparison:');
    console.log('BEFORE:', JSON.stringify(comparison.before, null, 2));
    console.log('AFTER:', JSON.stringify(comparison.after, null, 2));
    console.log('IMPROVEMENT:', JSON.stringify(comparison.improvement, null, 2));
    
    return comparison;
  }

  calculateHistogram(tokenCounts) {
    const histogram = { '0-50': 0, '51-80': 0, '81-150': 0, '151-180': 0, '181+': 0 };
    const stats = {
      total: tokenCounts.length,
      average: tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length,
      min: Math.min(...tokenCounts),
      max: Math.max(...tokenCounts)
    };
    
    tokenCounts.forEach(count => {
      if (count <= 50) histogram['0-50']++;
      else if (count <= 80) histogram['51-80']++;
      else if (count <= 150) histogram['81-150']++;
      else if (count <= 180) histogram['151-180']++;
      else histogram['181+']++;
    });
    
    return { histogram, stats };
  }

  calculateImprovement(beforeCounts, afterCounts) {
    const beforeAvg = beforeCounts.reduce((a, b) => a + b, 0) / beforeCounts.length;
    const afterAvg = afterCounts.reduce((a, b) => a + b, 0) / afterCounts.length;
    
    const beforeWithinBudget = beforeCounts.filter(c => c >= 80 && c <= 150).length;
    const afterWithinBudget = afterCounts.filter(c => c >= 80 && c <= 150).length;
    
    const beforeOverCap = beforeCounts.filter(c => c > 180).length;
    const afterOverCap = afterCounts.filter(c => c > 180).length;
    
    return {
      average_change: afterAvg - beforeAvg,
      budget_compliance_change: afterWithinBudget - beforeWithinBudget,
      over_cap_reduction: beforeOverCap - afterOverCap,
      chunk_count_change: afterCounts.length - beforeCounts.length
    };
  }

  async writeLogEntry(entry) {
    try {
      const logLine = JSON.stringify(entry) + '\n';
      await fs.appendFile(this.logFile, logLine);
    } catch (error) {
      // Silent fail to prevent log errors from crashing the system
    }
  }

  async generateReport() {
    const endTime = Date.now();
    const totalTime = endTime - this.metrics.start_time;
    
    const report = {
      ...this.metrics,
      end_time: endTime,
      total_processing_time_ms: totalTime,
      chunks_per_second: this.metrics.chunks_created / (totalTime / 1000),
      error_rate: this.metrics.errors.length / Math.max(this.metrics.chunks_created, 1)
    };
    
    const compliance = await this.calculateBudgetCompliance();
    if (compliance) {
      report.budget_compliance = compliance;
    }
    
    const reportFile = path.join(path.dirname(this.logFile), `report-${this.sessionId}.json`);
    try {
      await fs.writeFile(reportFile, JSON.stringify(report, null, 2));
      console.log(`📋 [OBSERV] Report saved to: ${reportFile}`);
    } catch (error) {
      console.warn('⚠️ [OBSERV] Could not save report:', error.message);
    }
    
    return report;
  }

  async calculateBudgetCompliance() {
    try {
      const { data, error } = await supabase.rpc('calculate_token_budget_compliance');
      if (error || !data || data.length === 0) return null;
      
      return data[0];
    } catch (error) {
      console.warn('⚠️ [OBSERV] Could not calculate budget compliance:', error.message);
      return null;
    }
  }

  displayRealTimeMetrics() {
    const withinBudget = (this.metrics.token_distribution['81-150'] || 0);
    const total = this.metrics.chunks_created;
    const complianceRate = total > 0 ? ((withinBudget / total) * 100).toFixed(1) : '0.0';
    
    console.log(`📊 [OBSERV] Session: ${this.sessionId}`);
    console.log(`   Chunks created: ${total}`);
    console.log(`   Budget compliance: ${complianceRate}% (${withinBudget}/${total})`);
    console.log(`   Token distribution: ${JSON.stringify(this.metrics.token_distribution)}`);
    console.log(`   Chunk types: ${JSON.stringify(this.metrics.chunk_types)}`);
    console.log(`   Errors: ${this.metrics.errors.length}`);
    
    if (this.metrics.errors.length > 0) {
      console.log(`   Recent errors: ${this.metrics.errors.slice(-3).map(e => e.error_type).join(', ')}`);
    }
  }

  logDeduplicationMetrics(duplicatesFound, duplicatesRemoved) {
    this.metrics.dedup_rate = duplicatesFound > 0 ? (duplicatesRemoved / duplicatesFound) : 1.0;
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      event: 'deduplication_metrics',
      duplicates_found: duplicatesFound,
      duplicates_removed: duplicatesRemoved,
      dedup_rate: this.metrics.dedup_rate
    };
    
    this.writeLogEntry(logEntry);
    
    console.log(`🧹 [OBSERV] Deduplication: ${duplicatesRemoved}/${duplicatesFound} removed (${(this.metrics.dedup_rate * 100).toFixed(1)}%)`);
  }

  async queryHistoricalTrends(days = 7) {
    try {
      const { data, error } = await supabase
        .from('chunk_performance_stats')
        .select('*')
        .gte('date', new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString())
        .order('date', { ascending: false });
      
      if (error || !data) {
        console.warn('⚠️ [OBSERV] Could not fetch historical trends:', error?.message);
        return null;
      }
      
      const trends = {
        daily_chunk_counts: data.map(d => ({ date: d.date, count: d.chunks_created })),
        average_tokens_trend: data.map(d => ({ date: d.date, avg_tokens: d.avg_tokens })),
        compliance_trend: data.map(d => ({ date: d.date, compliant: d.compliant_chunks }))
      };
      
      console.log('📈 [OBSERV] Historical Trends (last 7 days):');
      trends.daily_chunk_counts.forEach(({ date, count }) => {
        console.log(`   ${date.split('T')[0]}: ${count} chunks`);
      });
      
      return trends;
    } catch (error) {
      console.warn('⚠️ [OBSERV] Error querying historical trends:', error.message);
      return null;
    }
  }
}

export class ChunkValidator {
  static validateChunk(chunk) {
    const errors = [];
    const warnings = [];
    
    if (!chunk.content || chunk.content.trim().length === 0) {
      errors.push('Chunk content is empty or null');
    }
    
    if (chunk.token_count === undefined || chunk.token_count === null) {
      errors.push('Chunk missing token_count');
    } else {
      if (chunk.token_count < 10) {
        warnings.push(`Token count very low: ${chunk.token_count}`);
      }
      if (chunk.token_count > 180) {
        errors.push(`Token count exceeds hard cap: ${chunk.token_count}`);
      }
    }
    
    if (!chunk.metadata || typeof chunk.metadata !== 'object') {
      warnings.push('Chunk missing metadata object');
    } else {
      if (!chunk.metadata.chunk_type) {
        warnings.push('Chunk missing chunk_type in metadata');
      }
    }
    
    if (!chunk.organization && !chunk.role) {
      warnings.push('Chunk missing both organization and role');
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings,
      score: errors.length === 0 ? (warnings.length === 0 ? 1.0 : 0.8) : 0.0
    };
  }
}

export default ChunkObservabilityLogger;