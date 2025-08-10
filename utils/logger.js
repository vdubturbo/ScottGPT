import winston from 'winston';

// Define custom log levels
const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    verbose: 4,
    debug: 5,
    silly: 6
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    verbose: 'grey',
    debug: 'white',
    silly: 'grey'
  }
};

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, service, ...extra } = info;
    const extraInfo = Object.keys(extra).length > 0 ? JSON.stringify(extra, null, 2) : '';
    return `${timestamp} [${service || 'ScottGPT'}] ${level}: ${message} ${extraInfo}`;
  })
);

// Create logger instance
const logger = winston.createLogger({
  levels: customLevels.levels,
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    // Console transport for development
    new winston.transports.Console({
      format: logFormat,
      handleExceptions: true,
      handleRejections: true
    }),
    
    // File transport for all logs
    new winston.transports.File({
      filename: 'logs/combined.log',
      handleExceptions: true,
      handleRejections: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Separate file for error logs
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      handleExceptions: true,
      handleRejections: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ]
});

// Add colors to winston
winston.addColors(customLevels.colors);

// Create logs directory if it doesn't exist
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Export logger with additional helper methods
const database = logger.child({ service: 'Database' });
const api = logger.child({ service: 'API' });
const auth = logger.child({ service: 'Auth' });
const embedding = logger.child({ service: 'Embedding' });
const rag = logger.child({ service: 'RAG' });

const logError = (message, error, context = {}) => {
  logger.error(message, {
    error: error?.message || error,
    stack: error?.stack,
    ...context
  });
};

const logRequest = (req, res, duration) => {
  logger.http('HTTP Request', {
    method: req.method,
    url: req.url,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });
};

const logAPICall = (service, operation, duration, success = true, error = null) => {
  const logLevel = success ? 'info' : 'error';
  logger.log(logLevel, `${service} API Call`, {
    operation,
    duration: `${duration}ms`,
    success,
    error: error?.message || error
  });
};

export {
  logger,
  database,
  api,
  auth,
  embedding,
  rag,
  logError,
  logRequest,
  logAPICall
};