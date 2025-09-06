/**
 * Environment Detection Utility for ScottGPT
 * Detects various deployment environments and runtime contexts
 */

import os from 'os';
import fs from 'fs';
import path from 'path';

class EnvironmentDetector {
  constructor() {
    this.detectionCache = null;
    this.performDetection();
  }

  /**
   * Perform comprehensive environment detection
   * @private
   */
  performDetection() {
    this.detectionCache = {
      // Platform information
      platform: process.platform,
      architecture: process.arch,
      nodeVersion: process.version,
      
      // Environment variables analysis
      envVars: this.analyzeEnvironmentVariables(),
      
      // Specific environment detection
      netlify: this.detectNetlify(),
      awsLambda: this.detectAWSLambda(),
      vercel: this.detectVercel(),
      railway: this.detectRailway(),
      render: this.detectRender(),
      docker: this.detectDocker(),
      heroku: this.detectHeroku(),
      local: this.detectLocal(),
      
      // Runtime characteristics
      runtime: this.analyzeRuntime(),
      
      // File system capabilities
      filesystem: this.analyzeFilesystem(),
      
      // Memory and resource constraints
      resources: this.analyzeResources()
    };
    
    // Calculate derived flags
    this.detectionCache.serverless = this.calculateServerless();
    this.detectionCache.containerized = this.calculateContainerized();
    this.detectionCache.hasWritableFilesystem = this.calculateWritableFilesystem();
    this.detectionCache.ephemeralRuntime = this.calculateEphemeralRuntime();
    
    // Generate environment summary
    this.detectionCache.summary = this.generateSummary();
  }

  /**
   * Analyze environment variables for platform indicators
   * @private
   */
  analyzeEnvironmentVariables() {
    const env = process.env;
    return {
      // Netlify
      NETLIFY: !!env.NETLIFY,
      NETLIFY_DEV: !!env.NETLIFY_DEV,
      DEPLOY_URL: env.DEPLOY_URL,
      CONTEXT: env.CONTEXT,
      
      // AWS Lambda
      AWS_LAMBDA_FUNCTION_NAME: env.AWS_LAMBDA_FUNCTION_NAME,
      AWS_EXECUTION_ENV: env.AWS_EXECUTION_ENV,
      LAMBDA_RUNTIME_DIR: env.LAMBDA_RUNTIME_DIR,
      
      // Vercel
      VERCEL: !!env.VERCEL,
      VERCEL_ENV: env.VERCEL_ENV,
      
      // Railway
      RAILWAY_ENVIRONMENT: env.RAILWAY_ENVIRONMENT,
      
      // Render
      RENDER: !!env.RENDER,
      RENDER_SERVICE_TYPE: env.RENDER_SERVICE_TYPE,
      
      // Heroku
      DYNO: env.DYNO,
      
      // Docker
      DOCKER_CONTAINER: this.checkDockerContainer(),
      
      // General
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      HOME: env.HOME,
      USER: env.USER
    };
  }

  /**
   * Detect Netlify environment
   * @private
   */
  detectNetlify() {
    const env = process.env;
    return {
      detected: !!(env.NETLIFY || env.NETLIFY_DEV || env.DEPLOY_URL),
      isDev: !!env.NETLIFY_DEV,
      deployUrl: env.DEPLOY_URL,
      context: env.CONTEXT, // 'production', 'deploy-preview', 'branch-deploy'
      buildId: env.BUILD_ID,
      branch: env.BRANCH,
      commitRef: env.COMMIT_REF,
      functions: !!env.NETLIFY_FUNCTIONS_PORT
    };
  }

  /**
   * Detect AWS Lambda environment
   * @private
   */
  detectAWSLambda() {
    const env = process.env;
    return {
      detected: !!(env.AWS_LAMBDA_FUNCTION_NAME || env.AWS_EXECUTION_ENV),
      functionName: env.AWS_LAMBDA_FUNCTION_NAME,
      executionEnv: env.AWS_EXECUTION_ENV,
      runtimeDir: env.LAMBDA_RUNTIME_DIR,
      region: env.AWS_REGION || env.AWS_DEFAULT_REGION,
      memorySize: env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
      version: env.AWS_LAMBDA_FUNCTION_VERSION,
      logGroup: env.AWS_LAMBDA_LOG_GROUP_NAME
    };
  }

  /**
   * Detect Vercel environment
   * @private
   */
  detectVercel() {
    const env = process.env;
    return {
      detected: !!env.VERCEL,
      environment: env.VERCEL_ENV, // 'production', 'preview', 'development'
      url: env.VERCEL_URL,
      region: env.VERCEL_REGION,
      branch: env.VERCEL_GIT_COMMIT_REF,
      commitSha: env.VERCEL_GIT_COMMIT_SHA
    };
  }

  /**
   * Detect Railway environment
   * @private
   */
  detectRailway() {
    const env = process.env;
    return {
      detected: !!env.RAILWAY_ENVIRONMENT,
      environment: env.RAILWAY_ENVIRONMENT,
      projectId: env.RAILWAY_PROJECT_ID,
      serviceId: env.RAILWAY_SERVICE_ID,
      deploymentId: env.RAILWAY_DEPLOYMENT_ID
    };
  }

  /**
   * Detect Render environment
   * @private
   */
  detectRender() {
    const env = process.env;
    return {
      detected: !!env.RENDER,
      serviceType: env.RENDER_SERVICE_TYPE,
      serviceName: env.RENDER_SERVICE_NAME,
      serviceId: env.RENDER_SERVICE_ID,
      region: env.RENDER_REGION
    };
  }

  /**
   * Detect Docker/container environment
   * @private
   */
  detectDocker() {
    return {
      detected: this.checkDockerContainer(),
      hasDockerEnv: this.hasDockerEnvFile(),
      hasCgroupDocker: this.hasCgroupDocker(),
      containerRuntime: this.getContainerRuntime()
    };
  }

  /**
   * Detect Heroku environment
   * @private
   */
  detectHeroku() {
    const env = process.env;
    return {
      detected: !!env.DYNO,
      dyno: env.DYNO,
      appName: env.HEROKU_APP_NAME,
      releaseVersion: env.HEROKU_RELEASE_VERSION,
      slug: env.HEROKU_SLUG_COMMIT
    };
  }

  /**
   * Detect local development environment
   * @private
   */
  detectLocal() {
    const isLocal = !this.isAnyCloudPlatform();
    return {
      detected: isLocal,
      isDevelopment: process.env.NODE_ENV === 'development',
      hasNodeModules: this.hasNodeModules(),
      hasPackageJson: this.hasPackageJson(),
      currentDirectory: process.cwd(),
      hostname: os.hostname(),
      username: process.env.USER || process.env.USERNAME || 'unknown'
    };
  }

  /**
   * Analyze runtime characteristics
   * @private
   */
  analyzeRuntime() {
    const uptime = process.uptime();
    return {
      nodeVersion: process.version,
      platform: process.platform,
      architecture: process.arch,
      uptime: uptime,
      uptimeMinutes: Math.floor(uptime / 60),
      processId: process.pid,
      parentProcessId: process.ppid,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      argv: process.argv,
      execPath: process.execPath
    };
  }

  /**
   * Analyze filesystem capabilities
   * @private
   */
  analyzeFilesystem() {
    const tempDir = os.tmpdir();
    const homeDir = os.homedir();
    const currentDir = process.cwd();
    
    return {
      tempDir,
      homeDir,
      currentDir,
      canWriteTemp: this.canWriteToDirectory(tempDir),
      canWriteHome: this.canWriteToDirectory(homeDir),
      canWriteCurrent: this.canWriteToDirectory(currentDir),
      hasNodeModules: this.hasNodeModules(),
      diskSpace: this.getDiskSpace()
    };
  }

  /**
   * Analyze system resources
   * @private
   */
  analyzeResources() {
    const memInfo = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    
    return {
      memory: {
        total: totalMem,
        free: freeMem,
        used: totalMem - freeMem,
        process: memInfo,
        heapUsed: memInfo.heapUsed,
        heapTotal: memInfo.heapTotal,
        external: memInfo.external
      },
      cpu: {
        count: cpus.length,
        model: cpus[0]?.model || 'unknown',
        speed: cpus[0]?.speed || 0
      },
      loadAverage: os.loadavg(),
      uptime: os.uptime()
    };
  }

  // Helper methods
  isAnyCloudPlatform() {
    const env = process.env;
    return !!(
      env.NETLIFY || env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME ||
      env.RAILWAY_ENVIRONMENT || env.RENDER || env.DYNO
    );
  }

  checkDockerContainer() {
    try {
      return fs.existsSync('/.dockerenv') || this.hasCgroupDocker();
    } catch {
      return false;
    }
  }

  hasDockerEnvFile() {
    try {
      return fs.existsSync('/.dockerenv');
    } catch {
      return false;
    }
  }

  hasCgroupDocker() {
    try {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      return cgroup.includes('docker') || cgroup.includes('containerd');
    } catch {
      return false;
    }
  }

  getContainerRuntime() {
    if (this.hasDockerEnvFile()) return 'docker';
    if (this.hasCgroupDocker()) return 'containerd';
    return null;
  }

  hasNodeModules() {
    try {
      return fs.existsSync(path.join(process.cwd(), 'node_modules'));
    } catch {
      return false;
    }
  }

  hasPackageJson() {
    try {
      return fs.existsSync(path.join(process.cwd(), 'package.json'));
    } catch {
      return false;
    }
  }

  canWriteToDirectory(dir) {
    try {
      const testFile = path.join(dir, '.write-test-' + Date.now());
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return true;
    } catch {
      return false;
    }
  }

  getDiskSpace() {
    try {
      const stats = fs.statSync(process.cwd());
      return {
        available: true,
        // Note: Node.js doesn't provide direct disk space info
        // This would require additional system calls or libraries
        details: 'disk space detection requires additional libraries'
      };
    } catch {
      return { available: false, error: 'cannot access filesystem' };
    }
  }

  calculateServerless() {
    return !!(
      this.detectionCache.netlify.detected ||
      this.detectionCache.awsLambda.detected ||
      this.detectionCache.vercel.detected
    );
  }

  calculateContainerized() {
    return this.detectionCache.docker.detected;
  }

  calculateWritableFilesystem() {
    const fs = this.detectionCache.filesystem;
    return fs.canWriteTemp || fs.canWriteCurrent;
  }

  calculateEphemeralRuntime() {
    return this.detectionCache.serverless || this.detectionCache.containerized;
  }

  generateSummary() {
    const platforms = [];
    if (this.detectionCache.netlify.detected) platforms.push('Netlify');
    if (this.detectionCache.awsLambda.detected) platforms.push('AWS Lambda');
    if (this.detectionCache.vercel.detected) platforms.push('Vercel');
    if (this.detectionCache.railway.detected) platforms.push('Railway');
    if (this.detectionCache.render.detected) platforms.push('Render');
    if (this.detectionCache.heroku.detected) platforms.push('Heroku');
    if (this.detectionCache.docker.detected) platforms.push('Docker');
    if (this.detectionCache.local.detected) platforms.push('Local');

    const primaryPlatform = platforms[0] || 'Unknown';
    const memoryMB = Math.round(this.detectionCache.resources.memory.total / 1024 / 1024);

    return {
      primaryPlatform,
      allPlatforms: platforms,
      isServerless: this.detectionCache.serverless,
      isContainerized: this.detectionCache.containerized,
      hasWritableFS: this.detectionCache.hasWritableFilesystem,
      isEphemeral: this.detectionCache.ephemeralRuntime,
      memoryMB,
      cpuCount: this.detectionCache.resources.cpu.count,
      nodeVersion: this.detectionCache.runtime.nodeVersion,
      environment: process.env.NODE_ENV || 'unknown'
    };
  }

  // Public API methods
  
  /**
   * Check if running in Netlify environment
   */
  isNetlify() {
    return this.detectionCache.netlify.detected;
  }

  /**
   * Check if running in AWS Lambda environment
   */
  isAWSLambda() {
    return this.detectionCache.awsLambda.detected;
  }

  /**
   * Check if running in Vercel environment
   */
  isVercel() {
    return this.detectionCache.vercel.detected;
  }

  /**
   * Check if running in any serverless environment
   */
  isServerless() {
    return this.detectionCache.serverless;
  }

  /**
   * Check if running in local development environment
   */
  isLocal() {
    return this.detectionCache.local.detected;
  }

  /**
   * Check if running in Docker/container
   */
  isDocker() {
    return this.detectionCache.docker.detected;
  }

  /**
   * Check if running in containerized environment
   */
  isContainerized() {
    return this.detectionCache.containerized;
  }

  /**
   * Check if filesystem is writable
   */
  hasWritableFilesystem() {
    return this.detectionCache.hasWritableFilesystem;
  }

  /**
   * Check if runtime is ephemeral (serverless or containerized)
   */
  isEphemeralRuntime() {
    return this.detectionCache.ephemeralRuntime;
  }

  /**
   * Get complete environment information
   */
  getEnvironmentInfo() {
    return { ...this.detectionCache };
  }

  /**
   * Get environment summary
   */
  getSummary() {
    return this.detectionCache.summary;
  }

  /**
   * Get memory constraints in bytes
   */
  getMemoryConstraints() {
    const lambda = this.detectionCache.awsLambda;
    const totalMem = this.detectionCache.resources.memory.total;
    
    if (lambda.detected && lambda.memorySize) {
      return parseInt(lambda.memorySize) * 1024 * 1024; // Convert MB to bytes
    }
    
    return totalMem;
  }

  /**
   * Get recommended configuration based on environment
   */
  getRecommendedConfig() {
    const isServerless = this.isServerless();
    const memoryMB = Math.round(this.detectionCache.resources.memory.total / 1024 / 1024);
    const hasWritableFS = this.hasWritableFilesystem();
    
    return {
      useInMemoryProcessing: isServerless || memoryMB < 1024,
      useFileSystemCaching: hasWritableFS && !isServerless,
      maxMemoryUsage: this.getMemoryConstraints() * 0.8, // Use 80% of available memory
      preferStreaming: isServerless || memoryMB < 2048,
      enablePersistence: hasWritableFS && this.isLocal(),
      timeoutMultiplier: isServerless ? 0.8 : 1.0 // Reduce timeouts in serverless
    };
  }

  /**
   * Log environment information
   */
  logEnvironmentInfo(logger = console) {
    const summary = this.getSummary();
    const config = this.getRecommendedConfig();
    
    logger.log('🌍 Environment Detection Results:');
    logger.log(`  Platform: ${summary.primaryPlatform}`);
    logger.log(`  Serverless: ${summary.isServerless ? '✅' : '❌'}`);
    logger.log(`  Containerized: ${summary.isContainerized ? '✅' : '❌'}`);
    logger.log(`  Writable FS: ${summary.hasWritableFS ? '✅' : '❌'}`);
    logger.log(`  Memory: ${summary.memoryMB}MB`);
    logger.log(`  CPUs: ${summary.cpuCount}`);
    logger.log(`  Node: ${summary.nodeVersion}`);
    logger.log('');
    logger.log('⚙️ Recommended Configuration:');
    logger.log(`  In-Memory Processing: ${config.useInMemoryProcessing ? '✅' : '❌'}`);
    logger.log(`  Filesystem Caching: ${config.useFileSystemCaching ? '✅' : '❌'}`);
    logger.log(`  Max Memory Usage: ${Math.round(config.maxMemoryUsage / 1024 / 1024)}MB`);
    logger.log(`  Prefer Streaming: ${config.preferStreaming ? '✅' : '❌'}`);
    logger.log('');
  }
}

// Create singleton instance
const environmentDetector = new EnvironmentDetector();

// Export both class and singleton
export { EnvironmentDetector };
export default environmentDetector;