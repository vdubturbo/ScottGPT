import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

// Lazy load components to avoid blocking the app
const TagManager = React.lazy(() => import('./TagManager'));
const UserDataManager = React.lazy(() => import('./components/UserDataManager'));
const ExportManager = React.lazy(() => import('./components/ExportManager'));

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  
  // Upload state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState('');
  const [stats, setStats] = useState(null);
  const [processStatus, setProcessStatus] = useState('');
  const logRef = React.useRef(null);
  const [activeTab, setActiveTab] = useState('chat');
  const [activeAdminSection, setActiveAdminSection] = useState('overview');
  const [incomingFiles, setIncomingFiles] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [cacheStats, setCacheStats] = useState(null);
  const [showDeveloperTools, setShowDeveloperTools] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      const result = await axios.post('/api/chat', { 
        message,
        options: {
          includeContext: false // Set to true for debugging
        }
      });
      setResponse(result.data);
    } catch (error) {
      setResponse({
        response: error.response?.data?.error || 'Error: Failed to get response from ScottGPT',
        confidence: 'error',
        sources: [],
        metadata: { error: true }
      });
      console.error('Chat error:', error);
    } finally {
      setLoading(false);
    }
  };


  const handleFileSelect = (e) => {
    setSelectedFiles(Array.from(e.target.files));
  };

  // Drag & Drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (processing) return; // Don't allow drops during processing
    
    const files = Array.from(e.dataTransfer.files);
    const validFiles = files.filter(file => {
      const validTypes = ['.pdf', '.docx', '.doc', '.txt', '.md'];
      const extension = '.' + file.name.split('.').pop().toLowerCase();
      return validTypes.includes(extension);
    });
    
    if (validFiles.length > 0) {
      setSelectedFiles(validFiles);
      // Update the file input to match
      const dt = new DataTransfer();
      validFiles.forEach(file => dt.items.add(file));
      document.getElementById('file-input').files = dt.files;
    } else if (files.length > 0) {
      alert('Please select valid file types: PDF, DOCX, DOC, TXT, MD');
    }
  };

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    setUploadResult(null); // Clear previous results
    
    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      // Use the new streamlined endpoint for direct processing
      const result = await axios.post('/api/upload/streamlined', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      // Store the detailed upload result - streamlined format
      setUploadResult({
        success: true,
        message: result.data.message,
        stats: {
          uniqueUploaded: result.data.stats.filesSuccessful,
          duplicatesSkipped: 0, // Streamlined doesn't have duplicates
          totalSizeBytes: selectedFiles.reduce((sum, file) => sum + file.size, 0),
          duplicateSizeSavedBytes: 0
        },
        files: result.data.results.map(r => ({
          originalName: r.filename,
          filename: r.filename,
          size: selectedFiles.find(f => f.name === r.filename)?.size || 0,
          isDuplicate: false,
          processedInMemory: true
        })),
        duplicates: [],
        streamlined: true,
        processingResults: result.data.results
      });
      
      // Clear selected files after successful upload
      setSelectedFiles([]);
      document.getElementById('file-input').value = '';
      
      return result.data; // Return for chaining with process
      
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      setUploadResult({
        success: false,
        message: `Upload failed: ${errorMessage}`,
        error: errorMessage
      });
      throw error; // Re-throw to prevent processing
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setProcessLog('🚀 Starting streamlined processing...\n');
    setProcessStatus('🚀 Processing cached files through streamlined architecture...');
    
    try {
      // Use new streamlined processing endpoint for cached files
      const response = await fetch('/api/upload/process-cached-streamlined', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        setProcessLog(prev => prev + `✅ ${result.message}\n`);
        setProcessLog(prev => prev + `📊 Processed ${result.stats.filesProcessed} files\n`);
        setProcessLog(prev => prev + `💾 Stored ${result.stats.totalChunksStored} searchable chunks\n`);
        setProcessStatus('✅ Streamlined processing completed successfully!');
        
        // Refresh cache stats
        await loadCacheStats();
      } else {
        throw new Error(result.message || 'Processing failed');
      }
      
    } catch (error) {
      setProcessLog(prev => prev + `\n❌ STREAMLINED PROCESSING FAILED: ${error.message}\n`);
      setProcessStatus(`❌ Processing failed: ${error.message}`);
      console.error('Streamlined processing error:', error);
    } finally {
      setProcessing(false);
    }
    
    // Cleanup function will be handled by the polling interval check
  };

  // Load cache statistics
  const loadCacheStats = async () => {
    try {
      const response = await fetch('/api/upload/cache-stats');
      const data = await response.json();
      setCacheStats(data);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
      setCacheStats({ success: false, error: error.message });
    }
  };

  // Clear upload cache with confirmation
  const handleClearCache = async () => {
    const confirmed = window.confirm(
      "⚠️ Clear Upload Cache?\n\n" +
      "This will clear the file deduplication cache, allowing previously uploaded files to be uploaded again.\n\n" +
      "This action cannot be undone. Continue?"
    );
    
    if (!confirmed) return;
    
    try {
      const response = await fetch('/api/upload/clear-cache', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('✅ ' + result.message);
        console.log('Cache cleared:', result);
        // Refresh cache stats
        await loadCacheStats();
      } else {
        alert('❌ Failed to clear cache: ' + result.error);
        console.error('Cache clear failed:', result);
      }
    } catch (error) {
      alert('❌ Error clearing cache: ' + error.message);
      console.error('Cache clear error:', error);
    }
  };

  const loadStats = async () => {
    try {
      const result = await axios.get('/api/upload/stats');
      setStats(result.data.stats);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadIncomingFiles = async () => {
    try {
      const result = await axios.get('/api/upload/incoming');
      setIncomingFiles(result.data);
    } catch (error) {
      console.error('Failed to load incoming files:', error);
      setIncomingFiles({ success: false, error: error.message });
    }
  };

  const testIndividualStep = async (stepName) => {
    setProcessing(true);
    setProcessLog(`🧪 Starting individual test of ${stepName} step...\n`);
    
    try {
      const response = await fetch(`/api/upload/test-${stepName}`, { method: 'POST' });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          setProcessLog(prev => {
            const newLog = prev + chunk;
            // Auto-scroll to bottom after state update
            setTimeout(() => {
              if (logRef.current) {
                logRef.current.scrollTop = logRef.current.scrollHeight;
              }
            }, 0);
            return newLog;
          });
        }
      }
    } catch (error) {
      setProcessLog(prev => prev + `\n❌ Test failed: ${error.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Load stats on component mount
  React.useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src="/Logo3.png" alt="ScottGPT" className="app-logo" />
        
        <div className="tab-nav">
          <button 
            className={`tab-button ${activeTab === 'chat' ? 'active' : ''}`}
            onClick={() => setActiveTab('chat')}
          >
            💬 Chat
          </button>
          <button 
            className={`tab-button ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => setActiveTab('admin')}
          >
            ⚙️ Admin
          </button>
        </div>
      </header>
      
      <main className="App-main">
        {activeTab === 'chat' && (
          <div className="chat-section">
            <form onSubmit={handleSubmit} className="chat-form">
              <div className="input-group">
                <input
                  type="text"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ask about experience, skills, projects..."
                  className="message-input"
                  disabled={loading}
                />
                <button 
                  type="submit" 
                  disabled={loading || !message.trim()}
                  className="send-button"
                >
                  {loading ? 'Asking...' : 'Ask'}
                </button>
              </div>
            </form>

            {response && (
              <div className="response-area">
                <div className="response-header">
                  <h3>Response:</h3>
                  {response.confidence && response.confidence !== 'error' && (
                    <span className={`confidence-badge confidence-${response.confidence}`}>
                      {response.confidence.replace('-', ' ')} confidence
                    </span>
                  )}
                </div>
                
                <div className="response-text">
                  {response.response}
                </div>

                {response.sources && response.sources.length > 0 && (
                  <div className="sources-section">
                    <h4>Sources:</h4>
                    <div className="sources-list">
                      {response.sources.map((source, index) => (
                        <div key={index} className="source-item">
                          <span className="source-title">{source.title}</span>
                          {source.organization && (
                            <span className="source-org">at {source.organization}</span>
                          )}
                          <span className={`source-type source-type-${source.type}`}>
                            {source.type}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {response.metadata && !response.metadata.error && (
                  <div className="metadata-section">
                    <details>
                      <summary>Technical Details</summary>
                      <div className="metadata-grid">
                        <div className="metadata-item">
                          <span className="label">Processing Time:</span>
                          <span className="value">{response.metadata.processingTime}ms</span>
                        </div>
                        <div className="metadata-item">
                          <span className="label">Context Chunks:</span>
                          <span className="value">{response.metadata.totalChunksFound}</span>
                        </div>
                        <div className="metadata-item">
                          <span className="label">Similarity:</span>
                          <span className="value">{Math.round((response.metadata.avgSimilarity || 0) * 100)}%</span>
                        </div>
                        {response.metadata.reasoning && (
                          <div className="metadata-item full-width">
                            <span className="label">Reasoning:</span>
                            <span className="value">{response.metadata.reasoning}</span>
                          </div>
                        )}
                      </div>
                    </details>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="admin-panel">
            <div className="admin-sidebar">
              <nav className="admin-nav">
                <button
                  className={`admin-nav-item ${activeAdminSection === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('overview')}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-label">Overview</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'upload' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('upload')}
                >
                  <span className="nav-icon">📁</span>
                  <span className="nav-label">Documents</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'data' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('data')}
                >
                  <span className="nav-icon">📊</span>
                  <span className="nav-label">Data Management</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'tags' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('tags')}
                >
                  <span className="nav-icon">🏷️</span>
                  <span className="nav-label">Tags</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'export' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('export')}
                >
                  <span className="nav-icon">📥</span>
                  <span className="nav-label">Export</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'debug' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('debug')}
                >
                  <span className="nav-icon">🔍</span>
                  <span className="nav-label">Debug</span>
                </button>
              </nav>
            </div>
            
            <div className="admin-content">
              {activeAdminSection === 'overview' && (
                <div className="admin-section">
                  <h2>📊 System Overview</h2>
                  {stats && (
                    <div className="stats-panel">
                      <h3>Knowledge Base Statistics</h3>
                      <div className="stats-grid">
                        <div className="stat-item">
                          <span className="stat-label">Total Sources:</span>
                          <span className="stat-value">{stats.total_sources}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Total Content Chunks:</span>
                          <span className="stat-value">{stats.total_chunks}</span>
                        </div>
                        <div className="stat-item">
                          <span className="stat-label">Total Skills:</span>
                          <span className="stat-value">{stats.total_skills || 0}</span>
                        </div>
                        {stats.source_breakdown && Object.keys(stats.source_breakdown).length > 0 && (
                          <div className="stat-breakdown">
                            <strong>Breakdown by type:</strong>
                            {Object.entries(stats.source_breakdown).map(([type, count]) => (
                              <div key={type} className="breakdown-item">
                                {type}: {count}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeAdminSection === 'upload' && (
                <div className="admin-section">
                  <h2>📁 Document Management</h2>
                  
                  <div className="document-processor">
                    <div className="processor-header">
                      <div className="processor-title">
                        <h3>Add Documents to Knowledge Base</h3>
                        <p>Upload and process documents in one streamlined workflow</p>
                      </div>
                      <div className="processor-status">
                        {processing && (
                          <div className="status-indicator processing">
                            <div className="spinner"></div>
                            <span>Processing...</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="upload-zone">
                      <input
                        id="file-input"
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.txt,.md"
                        onChange={handleFileSelect}
                        className="file-input"
                        disabled={processing}
                      />
                      <label 
                        htmlFor="file-input" 
                        className={`file-drop-zone ${selectedFiles.length > 0 ? 'has-files' : ''} ${processing ? 'disabled' : ''} ${isDragging ? 'drag-active' : ''}`}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                      >
                        <div className="drop-zone-content">
                          {selectedFiles.length === 0 ? (
                            <>
                              <div className="drop-icon">📁</div>
                              <h4>Drop files here or click to browse</h4>
                              <p>Supported: PDF, DOCX, DOC, TXT, MD • Max 10MB per file</p>
                            </>
                          ) : (
                            <>
                              <div className="files-selected">
                                <div className="files-icon">📄</div>
                                <h4>{selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected</h4>
                                <div className="file-list">
                                  {selectedFiles.slice(0, 3).map((file, index) => (
                                    <div key={index} className="file-item">
                                      <span className="file-name">{file.name}</span>
                                      <span className="file-size">{Math.round(file.size / 1024)} KB</span>
                                    </div>
                                  ))}
                                  {selectedFiles.length > 3 && (
                                    <div className="file-item more">
                                      +{selectedFiles.length - 3} more files
                                    </div>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </label>
                    </div>

                    <div className="processor-actions">
                      {selectedFiles.length > 0 && !processing && (
                        <div className="action-group">
                          <button
                            onClick={async () => {
                              try {
                                // Streamlined endpoint handles both upload and processing
                                await handleUpload();
                                // No need for separate processing - streamlined endpoint does it all
                              } catch (error) {
                                // Error already handled in handleUpload
                              }
                            }}
                            disabled={uploading}
                            className="btn btn-primary btn-large"
                          >
                            {uploading ? (
                              <>
                                <div className="btn-spinner"></div>
                                Processing...
                              </>
                            ) : (
                              <>
                                🚀 Upload & Process
                              </>
                            )}
                          </button>
                          
                          <button
                            onClick={() => {
                              setSelectedFiles([]);
                              document.getElementById('file-input').value = '';
                            }}
                            className="btn btn-secondary"
                          >
                            Clear
                          </button>
                        </div>
                      )}

                      {processing && (
                        <div className="action-group">
                          <div className="process-progress">
                            <div className="progress-bar">
                              <div className="progress-bar-fill"></div>
                            </div>
                            <div className="progress-text">
                              {processStatus || 'Processing documents...'}
                            </div>
                          </div>
                          
                          <button
                            onClick={async () => {
                              try {
                                await axios.post('/api/upload/stop');
                                setProcessing(false);
                                // setIsProcessActive(false);
                                setProcessLog(prev => prev + '\n❌ Pipeline stopped by user request\n');
                              } catch (error) {
                                console.error('Stop error:', error);
                              }
                            }}
                            className="btn btn-danger btn-small"
                          >
                            Stop
                          </button>
                        </div>
                      )}

                      {!selectedFiles.length && !processing && (
                        <div className="action-group">
                          <button
                            onClick={handleProcess}
                            className="btn btn-outline"
                          >
                            🔄 Process Existing Files
                          </button>
                        </div>
                      )}
                    </div>

                    {uploadResult && (
                      <div className={`upload-feedback ${uploadResult.success ? 'success' : 'error'}`}>
                        <div className="feedback-header">
                          <div className="feedback-icon">
                            {uploadResult.success ? '✅' : '❌'}
                          </div>
                          <div className="feedback-message">
                            {uploadResult.message}
                          </div>
                        </div>
                        
                        {uploadResult.success && uploadResult.stats && (
                          <div className="upload-stats">
                            <div className="stat-item">
                              <span className="stat-label">Processed:</span>
                              <span className="stat-value">{uploadResult.stats.uniqueUploaded} files</span>
                            </div>
                            
                            {uploadResult.streamlined && uploadResult.processingResults && (
                              <div className="stat-item">
                                <span className="stat-label">Chunks stored:</span>
                                <span className="stat-value">
                                  {uploadResult.processingResults.reduce((sum, r) => sum + (r.chunksStored || 0), 0)}
                                </span>
                              </div>
                            )}
                            
                            {uploadResult.stats.duplicatesSkipped > 0 && (
                              <div className="stat-item duplicate">
                                <span className="stat-label">Duplicates skipped:</span>
                                <span className="stat-value">{uploadResult.stats.duplicatesSkipped} files</span>
                              </div>
                            )}
                            
                            <div className="stat-item">
                              <span className="stat-label">Total size:</span>
                              <span className="stat-value">
                                {(uploadResult.stats.totalSizeBytes / 1024).toFixed(1)} KB
                              </span>
                            </div>
                          </div>
                        )}
                        
                        {uploadResult.success && uploadResult.duplicates && uploadResult.duplicates.length > 0 && (
                          <div className="duplicate-details">
                            <h5>Duplicate Files:</h5>
                            <ul className="duplicate-list">
                              {uploadResult.duplicates.map((dup, index) => (
                                <li key={index} className="duplicate-item">
                                  <span className="duplicate-name">{dup.originalName}</span>
                                  <span className="duplicate-reason">
                                    (matches {dup.existingFile})
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {uploadResult.success && uploadResult.stats.uniqueUploaded === 0 && uploadResult.stats.duplicatesSkipped > 0 && (
                          <div className="no-processing-notice">
                            <p>⚠️ No new files to process - all uploads were duplicates</p>
                          </div>
                        )}
                        
                        <button
                          onClick={() => setUploadResult(null)}
                          className="btn btn-mini dismiss-btn"
                        >
                          Dismiss
                        </button>
                      </div>
                    )}

                    {processLog && (
                      <div className="log-viewer">
                        <div className="log-header">
                          <h4>Processing Log</h4>
                          <div className="log-actions">
                            <button
                              onClick={async () => {
                                try {
                                  const logsResponse = await fetch('/api/upload/logs?since=0');
                                  const logsData = await logsResponse.json();
                                  
                                  if (logsData.success) {
                                    const allLogs = logsData.logs.map(log => log.message).join('\n');
                                    setProcessLog(allLogs + '\n');
                                    
                                    if (!logsData.status.isActive && processing) {
                                      setProcessing(false);
                                      // setIsProcessActive(false);
                                      setProcessStatus('✅ Processing completed');
                                      await loadStats();
                                    }
                                  }
                                } catch (error) {
                                  console.error('Refresh error:', error);
                                }
                              }}
                              className="btn btn-mini"
                            >
                              🔄
                            </button>
                            <button
                              onClick={() => {
                                setProcessLog('');
                                setProcessStatus('');
                              }}
                              className="btn btn-mini"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                        <div className="log-content" ref={logRef}>
                          {processLog}
                        </div>
                      </div>
                    )}

                    {/* Developer Tools Section */}
                    <div className="developer-tools">
                      <div className="dev-tools-header">
                        <button
                          onClick={() => {
                            setShowDeveloperTools(!showDeveloperTools);
                            if (!showDeveloperTools && !cacheStats) {
                              loadCacheStats();
                            }
                          }}
                          className="btn btn-outline btn-small"
                        >
                          🔧 {showDeveloperTools ? 'Hide' : 'Show'} Developer Tools
                        </button>
                      </div>
                      
                      {showDeveloperTools && (
                        <div className="dev-tools-content">
                          <div className="cache-management">
                            <h4>Upload Cache Management</h4>
                            <p className="dev-tools-description">
                              The upload cache prevents duplicate file uploads by tracking file hashes. 
                              Clear it during development to re-upload previously processed files.
                            </p>
                            
                            {cacheStats && cacheStats.success && (
                              <div className="cache-stats">
                                <div className="stat-grid">
                                  <div className="stat-item">
                                    <span className="stat-label">Cached Files:</span>
                                    <span className="stat-value">{cacheStats.cache.totalCachedFiles}</span>
                                  </div>
                                  <div className="stat-item">
                                    <span className="stat-label">Memory Size:</span>
                                    <span className="stat-value">~{Math.round(cacheStats.cache.memorySize / 1024)} KB</span>
                                  </div>
                                  <div className="stat-item">
                                    <span className="stat-label">Last Updated:</span>
                                    <span className="stat-value">
                                      {new Date(cacheStats.timestamp).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                            
                            {cacheStats && !cacheStats.success && (
                              <div className="cache-error">
                                <p>❌ Error loading cache stats: {cacheStats.error}</p>
                              </div>
                            )}
                            
                            <div className="cache-actions">
                              <button 
                                onClick={loadCacheStats}
                                className="btn btn-secondary btn-small"
                              >
                                📊 Refresh Stats
                              </button>
                              
                              <button 
                                onClick={handleClearCache}
                                className="btn btn-warning btn-small"
                                disabled={!cacheStats || !cacheStats.success}
                              >
                                🗑️ Clear Cache
                                {cacheStats && cacheStats.success && cacheStats.cache.totalCachedFiles > 0 
                                  ? ` (${cacheStats.cache.totalCachedFiles} files)` 
                                  : ''
                                }
                              </button>
                            </div>
                            
                            <div className="dev-tools-note">
                              <p>
                                <strong>Note:</strong> This is a development tool. In production, 
                                cache clearing should be done server-side if needed.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeAdminSection === 'data' && (
                <div className="admin-section">
                  <React.Suspense fallback={<div>Loading Data Management...</div>}>
                    <UserDataManager />
                  </React.Suspense>
                </div>
              )}

              {activeAdminSection === 'tags' && (
                <div className="admin-section">
                  <React.Suspense fallback={<div>Loading Tags...</div>}>
                    <TagManager />
                  </React.Suspense>
                </div>
              )}

              {activeAdminSection === 'export' && (
                <div className="admin-section">
                  <React.Suspense fallback={<div>Loading Export Tools...</div>}>
                    <ExportManager />
                  </React.Suspense>
                </div>
              )}

              {activeAdminSection === 'debug' && (
                <div className="admin-section">
                  <h2>🔍 Debug Information</h2>
                  
                  <div className="debug-section">
                    <h3>📁 Incoming Files</h3>
                    <p>Files currently in the incoming/ directory waiting to be processed.</p>
                    
                    <button
                      onClick={loadIncomingFiles}
                      className="process-button"
                      style={{marginBottom: '1rem', backgroundColor: '#6366f1'}}
                    >
                      🔄 Refresh Incoming Files
                    </button>
                    
                    {incomingFiles && (
                      <div className="incoming-files-panel">
                        {incomingFiles.success ? (
                          <>
                            <div className="debug-stats">
                              <span className="debug-stat">
                                <strong>Total Files:</strong> {incomingFiles.count || 0}
                              </span>
                              <span className="debug-stat">
                                <strong>Valid Documents:</strong> {incomingFiles.validDocuments || 0}
                              </span>
                            </div>
                            
                            {incomingFiles.incoming && incomingFiles.incoming.length > 0 ? (
                              <div className="file-list">
                                <h4>Files:</h4>
                                {incomingFiles.incoming.map((file, index) => (
                                  <div key={index} className="debug-file-item">
                                    <span className="file-name">
                                      {file.isDocument ? '📄' : '📁'} {file.name}
                                    </span>
                                    <span className="file-details">
                                      {Math.round(file.size / 1024)} KB - {new Date(file.modified).toLocaleString()}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="no-files">
                                <p>✅ No files in incoming/ directory</p>
                                <p>Either no files have been uploaded, or they have been successfully processed and moved to processed/.</p>
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="error-panel">
                            <p>❌ Error loading incoming files: {incomingFiles.error || 'Unknown error'}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div className="debug-section">
                    <h3>🧪 Individual Step Testing</h3>
                    <p>Test each pipeline step individually to identify hanging issues.</p>
                    
                    <div className="step-test-buttons">
                      <button
                        onClick={() => testIndividualStep('normalize')}
                        className="test-button"
                        disabled={processing}
                      >
                        🔧 Test Normalize
                      </button>
                      
                      <button
                        onClick={() => testIndividualStep('extract')}
                        className="test-button"
                        disabled={processing}
                      >
                        🤖 Test Extract
                      </button>
                      
                      <button
                        onClick={() => testIndividualStep('validate')}
                        className="test-button"
                        disabled={processing}
                      >
                        ✅ Test Validate
                      </button>
                      
                      <button
                        onClick={() => testIndividualStep('write')}
                        className="test-button"
                        disabled={processing}
                      >
                        📝 Test Write
                      </button>
                      
                      <button
                        onClick={() => testIndividualStep('indexer')}
                        className="test-button"
                        disabled={processing}
                      >
                        🔗 Test Indexer
                      </button>
                      
                      <button
                        onClick={async () => {
                          setProcessing(true);
                          setProcessLog('🧪 Starting stream test...\n');
                          
                          try {
                            const response = await fetch('/api/upload/test-stream', { method: 'POST' });
                            const reader = response.body.getReader();
                            const decoder = new TextDecoder();

                            while (true) {
                              const { done, value } = await reader.read();
                              if (done) break;
                              const chunk = decoder.decode(value, { stream: true });
                              if (chunk) {
                                setProcessLog(prev => {
                                  const newLog = prev + chunk;
                                  setTimeout(() => {
                                    if (logRef.current) {
                                      logRef.current.scrollTop = logRef.current.scrollHeight;
                                    }
                                  }, 0);
                                  return newLog;
                                });
                              }
                            }
                          } catch (error) {
                            setProcessLog(prev => prev + `\n❌ Test failed: ${error.message}`);
                          } finally {
                            setProcessing(false);
                          }
                        }}
                        disabled={processing}
                        className="test-button"
                      >
                        🧪 Test Stream
                      </button>
                    </div>
                    
                    {processLog && activeAdminSection === 'debug' && (
                      <div className="test-log">
                        <h4>📋 Test Output:</h4>
                        <pre className="log-content" ref={logRef}>{processLog}</pre>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;