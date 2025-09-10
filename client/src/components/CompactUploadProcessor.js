/* eslint-disable */
import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './CompactUploadProcessor.css';

const CompactUploadProcessor = () => {
  const { user, getToken } = useAuth();
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState('');
  const [progress, setProgress] = useState(0);
  const [sessionId, setSessionId] = useState(null);
  const [connectionState, setConnectionState] = useState('disconnected'); // 'disconnected', 'connecting', 'connected', 'error'
  const eventSourceRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  
  // Debug progress changes
  useEffect(() => {
    console.log('📊 Progress state changed:', progress);
  }, [progress]);
  const [stepDetails, setStepDetails] = useState('');
  const [processingStats, setProcessingStats] = useState(null);
  const [processComplete, setProcessComplete] = useState(false);
  const [error, setError] = useState(null);
  const [showAdvancedLog, setShowAdvancedLog] = useState(false);
  const [advancedLog, setAdvancedLog] = useState('');
  const fileInputRef = useRef(null);

  const processingSteps = [
    { id: 'normalize', label: 'Normalizing documents', icon: '📄', description: 'Converting files to markdown format' },
    { id: 'extract', label: 'Extracting job roles', icon: '🧠', description: 'Identifying positions and experiences' },
    { id: 'validate', label: 'Validating content', icon: '✅', description: 'Checking data quality and structure' },
    { id: 'write', label: 'Organizing data', icon: '📝', description: 'Creating structured source files' },
    { id: 'index', label: 'Creating search chunks', icon: '🔍', description: 'Building optimized search indexes' }
  ];

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    setSelectedFiles(files);
    setProcessComplete(false);
    setError(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    setSelectedFiles(files);
    setProcessComplete(false);
    setError(null);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const resetUpload = () => {
    console.log('🔄 Resetting upload component to initial state...');
    
    setSelectedFiles([]);
    setProcessComplete(false);
    setError(null);
    setProgress(0);
    setCurrentStep('');
    setStepDetails('');
    setProcessingStats(null);
    setAdvancedLog('');
    setProcessing(false);
    setShowAdvancedLog(false);
    setSessionId(null);
    setConnectionState('disconnected');
    
    // Disconnect any active SSE connection
    disconnectSSE();
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    
    console.log('✅ Upload component reset complete');
  };

  const parseProgressFromLog = (logContent) => {
    const lines = logContent.split(/\r?\n/).filter(line => line.trim());
    let stepProgress = 0;
    let details = '';
    let stats = null;

    for (const line of lines) {
      console.log('🔍 Parsing line:', line);
      
      // Parse structured progress messages: "📊 [PROGRESS] 25% - Details"
      const progressMatch = line.match(/📊 \[PROGRESS\] (\d+)% - (.+)/);
      if (progressMatch) {
        const [, progress, progressDetails] = progressMatch;
        const progressValue = parseInt(progress);
        
        // Update progress if this is newer/higher
        if (progressValue > stepProgress) {
          stepProgress = progressValue;
          details = progressDetails || 'Processing...';
          
          // Set current step based on progress value
          if (progressValue < 10) {
            setCurrentStep('upload');
          } else if (progressValue >= 10 && progressValue < 25) {
            setCurrentStep('normalize');
          } else if (progressValue >= 25 && progressValue < 60) {
            setCurrentStep('extract');
          } else if (progressValue >= 60 && progressValue < 75) {
            setCurrentStep('validate');
          } else if (progressValue >= 75 && progressValue < 85) {
            setCurrentStep('write');
          } else if (progressValue >= 85 && progressValue <= 100) {
            setCurrentStep('index');
          }
          
          console.log('✅ Progress updated:', { progressValue, details });
        }
        continue;
      }
      
      // Fallback parsing for non-structured messages
      if (line.includes('Starting Normalize') || line.includes('📄 Normalizing')) {
        setCurrentStep('normalize');
        stepProgress = Math.max(stepProgress, 18);
        details = 'Converting documents to markdown format';
      } else if (line.includes('Starting Extract') || line.includes('🧠 Extracting')) {
        setCurrentStep('extract');
        stepProgress = Math.max(stepProgress, 28);
        details = 'Analyzing job roles and experience';
      } else if (line.includes('Starting Validate') || line.includes('✅ Validating')) {
        setCurrentStep('validate');
        stepProgress = Math.max(stepProgress, 62);
        details = 'Checking content quality and structure';
      } else if (line.includes('Starting Write') || line.includes('📝 Organizing')) {
        setCurrentStep('write');
        stepProgress = Math.max(stepProgress, 77);
        details = 'Creating structured source files';
      } else if (line.includes('Starting Index') || line.includes('🔍 Creating')) {
        setCurrentStep('index');
        stepProgress = Math.max(stepProgress, 87);
        details = 'Building search indexes';
      }

      // Handle heartbeat messages (running status)
      if (line.includes('running...') && line.includes('elapsed')) {
        const elapsedMatch = line.match(/(\d+)s elapsed/);
        if (elapsedMatch) {
          const elapsed = parseInt(elapsedMatch[1]);
          // Show progress within current step based on elapsed time
          if (line.includes('Normalize')) {
            stepProgress = Math.max(stepProgress, 20 + Math.min(15, elapsed / 2)); // 20-35%
            details = `Normalizing documents (${elapsed}s elapsed)`;
          } else if (line.includes('Extract')) {
            stepProgress = Math.max(stepProgress, 35 + Math.min(25, elapsed / 3)); // 35-60%
            details = `Extracting job data (${elapsed}s elapsed)`;
          } else if (line.includes('Validate')) {
            stepProgress = Math.max(stepProgress, 60 + Math.min(15, elapsed / 2)); // 60-75%
            details = `Validating content (${elapsed}s elapsed)`;
          } else if (line.includes('Write')) {
            stepProgress = Math.max(stepProgress, 75 + Math.min(10, elapsed / 2)); // 75-85%
            details = `Organizing data (${elapsed}s elapsed)`;
          } else if (line.includes('Index')) {
            stepProgress = Math.max(stepProgress, 85 + Math.min(10, elapsed / 3)); // 85-95%
            details = `Creating search indexes (${elapsed}s elapsed)`;
          }
        }
      }

      // Handle completion detection
      if (line.includes('Normalize completed successfully')) {
        stepProgress = Math.max(stepProgress, 25);
        details = 'Document normalization completed';
      } else if (line.includes('Extract completed successfully')) {
        stepProgress = Math.max(stepProgress, 60);
        details = 'Job extraction completed';
      } else if (line.includes('Validate completed successfully')) {
        stepProgress = Math.max(stepProgress, 75);
        details = 'Content validation completed';
      } else if (line.includes('Write completed successfully')) {
        stepProgress = Math.max(stepProgress, 85);
        details = 'Data organization completed';
      } else if (line.includes('Index completed successfully')) {
        stepProgress = Math.max(stepProgress, 100);
        details = 'Search indexing completed';
      }

      // Stats detection
      if (line.includes('chunks created') || line.includes('chunks processed')) {
        const chunkMatch = line.match(/(\d+)\s+(?:chunks?)/i);
        if (chunkMatch) {
          stats = { ...stats, chunks: parseInt(chunkMatch[1]) };
        }
      }

      if (line.includes('files processed')) {
        const fileMatch = line.match(/(\d+)\s+files? processed/i);
        if (fileMatch) {
          stats = { ...stats, files: parseInt(fileMatch[1]) };
        }
      }

      // Completion detection
      if (line.includes('Complete pipeline execution finished') || 
          line.includes('🎉') && line.includes('[SUCCESS]') ||
          line.includes('All processing completed successfully')) {
        stepProgress = 100;
        setProcessComplete(true);
        details = 'Processing completed successfully';
      }
    }

    return { stepProgress, details, stats };
  };

  const handleClearIncoming = async () => {
    try {
      const response = await fetch('/api/upload/clear', {
        method: 'POST'
      });
      
      if (response.ok) {
        console.log('✅ Incoming directory cleared');
        setStepDetails('Incoming directory cleared successfully');
      } else {
        console.error('❌ Failed to clear incoming directory');
        setStepDetails('Failed to clear incoming directory');
      }
    } catch (error) {
      console.error('❌ Error clearing incoming directory:', error);
      setStepDetails('Error clearing incoming directory');
    }
  };

  // SSE Connection Management
  const connectToSSE = (sessionId) => {
    console.log('🔌 Connecting to SSE for session:', sessionId);
    setConnectionState('connecting');
    
    // Close existing connection if any
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }
    
    // Create new EventSource connection
    const eventSource = new EventSource(`/api/upload/progress/${sessionId}`);
    eventSourceRef.current = eventSource;
    
    eventSource.onopen = () => {
      console.log('✅ SSE connection established');
      setConnectionState('connected');
      reconnectAttemptsRef.current = 0;
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📨 SSE message received:', data.type);
        
        switch (data.type) {
          case 'progress':
            handleProgressUpdate(data.data);
            break;
          case 'state':
            handleStateUpdate(data.data);
            break;
          case 'stepComplete':
            handleStepComplete(data.data);
            break;
          case 'complete':
            handleProcessComplete(data.data);
            break;
          case 'error':
            handleProcessError(data.data);
            break;
          case 'log':
            handleLogMessage(data.data);
            break;
          case 'heartbeat':
            // Just a keepalive, no action needed
            break;
          default:
            console.log('Unknown SSE message type:', data.type);
        }
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('❌ SSE connection error:', error);
      setConnectionState('error');
      
      // Attempt to reconnect with exponential backoff
      if (reconnectAttemptsRef.current < 5) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000);
        console.log(`🔄 Reconnecting in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1})...`);
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current++;
          connectToSSE(sessionId);
        }, delay);
      } else {
        console.error('❌ Max reconnection attempts reached');
        setError('Lost connection to server. Please refresh and try again.');
      }
    };
  };
  
  const disconnectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnectionState('disconnected');
  };
  
  // Progress update handlers
  const handleProgressUpdate = (data) => {
    console.log('📊 Progress update:', data);
    setProgress(data.progress || 0);
    setCurrentStep(data.currentStep || '');
    setStepDetails(data.details || '');
    
    if (data.stats) {
      setProcessingStats(data.stats);
    }
  };
  
  const handleStateUpdate = (data) => {
    console.log('📋 State update:', data);
    setProgress(data.progress || 0);
    setCurrentStep(data.currentStep || '');
    setStepDetails(data.details || '');
  };
  
  const handleStepComplete = (data) => {
    console.log('✅ Step complete:', data.stepName);
    if (data.stats) {
      setProcessingStats(prev => ({ ...prev, ...data.stats }));
    }
  };
  
  const handleProcessComplete = (data) => {
    console.log('🎉 Process complete:', data);
    setProcessComplete(true);
    setProgress(100);
    setProcessing(false);
    if (data.stats) {
      setProcessingStats(data.stats);
    }
    disconnectSSE();
  };
  
  const handleProcessError = (data) => {
    console.error('❌ Process error:', data.error);
    setError(data.error);
    setProcessing(false);
    disconnectSSE();
  };
  
  const handleLogMessage = (data) => {
    setAdvancedLog(prev => prev + `[${data.level}] ${data.message}\n`);
  };
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectSSE();
    };
  }, []);

  const handleUploadAndProcess = async () => {
    if (selectedFiles.length === 0) return;

    setProcessing(true);
    setError(null);
    setProgress(5); // Start with 5% to show process initiated
    setCurrentStep('upload');
    setStepDetails('Uploading files...');
    setAdvancedLog('');

    try {
      // Upload files first
      const formData = new FormData();
      selectedFiles.forEach(file => {
        formData.append('files', file);
      });

      // Use streamlined processing - upload and process in one step
      console.log('🚀 Starting streamlined upload and processing...');
      setStepDetails('Uploading and processing files through streamlined architecture...');
      
      // Get authentication token
      const token = getToken();
      if (!token) {
        throw new Error('Authentication required. Please log in to upload files.');
      }

      // Upload and process in one step using streamlined endpoint
      const streamlinedResponse = await fetch('/api/upload/streamlined', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });
      
      if (!streamlinedResponse.ok) {
        throw new Error(`Streamlined processing failed: ${streamlinedResponse.statusText}`);
      }

      const streamlinedResult = await streamlinedResponse.json();
      console.log('🎉 Streamlined processing result:', streamlinedResult);

      setProgress(90); // Processing completed
      setStepDetails(`Streamlined processing completed: ${streamlinedResult.stats.totalChunksStored} chunks stored`);
      
      // Set completion status
      setProgress(100);
      setProcessComplete(true);
      setCurrentStep('complete');
      
      // Update processing stats
      setProcessingStats({
        filesProcessed: streamlinedResult.stats.filesProcessed,
        chunksStored: streamlinedResult.stats.totalChunksStored,
        processingTime: streamlinedResult.stats.totalProcessingTime
      });
      
      console.log('🎉 Streamlined processing completed successfully!');

    } catch (error) {
      console.error('Upload/Process error:', error);
      setError(error.message);
      setProcessing(false);
      disconnectSSE();
    }
  };

  const getCurrentStepIndex = () => {
    return processingSteps.findIndex(step => step.id === currentStep);
  };

  const getCurrentStepFromProgress = (progress) => {
    if (progress >= 100) return 'complete';
    if (progress >= 90) return 'index';
    if (progress >= 80) return 'write';
    if (progress >= 60) return 'validate';
    if (progress >= 40) return 'extract';
    if (progress >= 20) return 'normalize';
    return 'upload';
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Show authentication message if not logged in
  if (!user) {
    return (
      <div className="compact-upload-processor">
        <div className="processor-header">
          <h2>📄 Document Upload & Processing</h2>
          <div className="auth-required-message">
            <h3>🔐 Authentication Required</h3>
            <p>Please log in to upload and process documents.</p>
            <p>File upload requires authentication to ensure your documents are processed securely and associated with your account.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="compact-upload-processor">
      {/* Header */}
      <div className="processor-header">
        <h2>📄 Document Upload & Processing</h2>
        <p>Upload resume documents to extract and index your professional experience</p>
      </div>

      {/* Main Content Area */}
      <div className="processor-content">
        
        {/* File Selection - Only show when not processing and no files selected */}
        {!processing && !processComplete && selectedFiles.length === 0 && (
          <div 
            className="upload-zone"
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="upload-icon">📁</div>
            <div className="upload-text">
              <p><strong>Drop files here or click to browse</strong></p>
              <p className="upload-hint">Supported: PDF, DOCX, DOC, TXT, MD</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              id="file-input"
              multiple
              accept=".pdf,.docx,.doc,.txt,.md"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
          </div>
        )}

        {/* Selected Files */}
        {selectedFiles.length > 0 && !processing && !processComplete && (
          <div className="selected-files">
            <h3>Selected Files ({selectedFiles.length})</h3>
            <div className="file-list">
              {selectedFiles.map((file, index) => (
                <div key={index} className="file-item">
                  <span className="file-icon">📄</span>
                  <span className="file-name">{file.name}</span>
                  <span className="file-size">{formatFileSize(file.size)}</span>
                </div>
              ))}
            </div>
            <div className="file-actions">
              <button 
                className="btn btn-primary" 
                onClick={handleUploadAndProcess}
              >
                🚀 Upload & Process
              </button>
              <button 
                className="btn btn-warning" 
                onClick={handleClearIncoming}
                style={{ marginLeft: '10px' }}
              >
                🗑️ Clear Incoming
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={resetUpload}
              >
                Clear Files
              </button>
            </div>
          </div>
        )}

        {/* Processing State */}
        {processing && (
          <div className="processing-state">
            <div className="progress-header">
              <h3>Processing Documents...</h3>
              <div className="progress-info">
                <div className="progress-percentage">{progress}%</div>
                {connectionState === 'connected' && (
                  <div className="connection-indicator" title="Real-time updates active">
                    <span className="connection-dot"></span>
                  </div>
                )}
                {connectionState === 'error' && (
                  <div className="connection-warning" title="Connection lost, retrying...">⚠️</div>
                )}
              </div>
            </div>
            
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>

            <div className="current-step">
              <div className="step-icon">
                {(currentStep && processingSteps.find(s => s.id === currentStep)?.icon) || '⏳'}
              </div>
              <div className="step-text">
                <div className="step-title">{stepDetails}</div>
                {processingStats && (
                  <div className="step-stats">
                    {processingStats.chunks && `${processingStats.chunks} chunks created`}
                    {processingStats.quality && ` • ${processingStats.quality}% optimal quality`}
                  </div>
                )}
              </div>
            </div>

            {/* Step Progress */}
            <div className="steps-progress">
              {processingSteps.map((step, index) => {
                const isActive = step.id === currentStep;
                const isComplete = getCurrentStepIndex() > index || progress === 100;
                const isCurrent = getCurrentStepIndex() === index;
                
                return (
                  <div 
                    key={step.id} 
                    className={`step ${isActive ? 'active' : ''} ${isComplete ? 'complete' : ''} ${isCurrent ? 'current' : ''}`}
                  >
                    <div className="step-indicator">
                      {isComplete ? '✓' : step.icon}
                    </div>
                    <div className="step-label">{step.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Completion State */}
        {processComplete && (
          <div className="completion-state">
            <div className="completion-icon">🎉</div>
            <h3>Processing Complete!</h3>
            <p>Your documents have been successfully processed and indexed.</p>
            
            {processingStats && (
              <div className="completion-stats">
                <div className="stat">
                  <span className="stat-icon">📄</span>
                  <span className="stat-label">Files Processed:</span>
                  <span className="stat-value">{processingStats.filesProcessed || selectedFiles.length}</span>
                </div>
                <div className="stat">
                  <span className="stat-icon">📊</span>
                  <span className="stat-label">Chunks Created:</span>
                  <span className="stat-value">{processingStats.chunksStored || processingStats.chunks || 'N/A'}</span>
                </div>
                {processingStats.quality && (
                  <div className="stat">
                    <span className="stat-icon">🎯</span>
                    <span className="stat-label">Quality Score:</span>
                    <span className="stat-value">{processingStats.quality}%</span>
                  </div>
                )}
                {processingStats.processingTime && (
                  <div className="stat">
                    <span className="stat-icon">⏱️</span>
                    <span className="stat-label">Processing Time:</span>
                    <span className="stat-value">{processingStats.processingTime}</span>
                  </div>
                )}
              </div>
            )}

            <div className="completion-actions">
              <button 
                className="btn btn-primary" 
                onClick={resetUpload}
              >
                📁 Upload More Documents
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="error-state">
            <div className="error-icon">❌</div>
            <h3>Processing Failed</h3>
            <p className="error-message">{error}</p>
            <div className="error-actions">
              <button 
                className="btn btn-primary" 
                onClick={() => setError(null)}
              >
                Try Again
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={resetUpload}
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* Advanced Log Toggle */}
        {(processing || processComplete || error) && (
          <div className="advanced-section">
            <button 
              className="btn btn-link advanced-toggle"
              onClick={() => setShowAdvancedLog(!showAdvancedLog)}
            >
              {showAdvancedLog ? '📄 Hide' : '📄 Show'} Technical Details
            </button>
            
            {showAdvancedLog && (
              <div className="advanced-log">
                <pre>{advancedLog}</pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompactUploadProcessor;