// Simple in-memory logger for process streaming
class ProcessLogger {
  constructor() {
    this.logs = [];
    this.isActive = false;
    this.processId = null;
  }

  startLogging(processId = 'default') {
    this.processId = processId;
    this.isActive = true;
    this.logs = [];
    this.log(`🚀 Starting process: ${processId}`);
  }

  log(message) {
    if (this.isActive) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: message,
        id: Date.now()
      };
      this.logs.push(logEntry);
      
      // Keep only last 1000 logs to prevent memory issues
      if (this.logs.length > 1000) {
        this.logs = this.logs.slice(-1000);
      }
    }
  }

  error(message) {
    this.log(`❌ ${message}`);
  }

  warn(message) {
    this.log(`⚠️ ${message}`);
  }

  stopLogging() {
    this.isActive = false;
    this.log(`✅ Process completed: ${this.processId}`);
  }

  getLogs(since = 0) {
    return this.logs.filter(log => log.id > since);
  }

  getAllLogs() {
    return this.logs;
  }

  clear() {
    this.logs = [];
  }

  getStatus() {
    return {
      isActive: this.isActive,
      processId: this.processId,
      logCount: this.logs.length,
      lastLog: this.logs.length > 0 ? this.logs[this.logs.length - 1] : null
    };
  }
}

// Single global instance
const processLogger = new ProcessLogger();

export default processLogger;