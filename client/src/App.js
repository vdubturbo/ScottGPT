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
  const [isProcessActive, setIsProcessActive] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  const [activeAdminSection, setActiveAdminSection] = useState('overview');
  const [incomingFiles, setIncomingFiles] = useState(null);

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

  const handleUpload = async () => {
    if (selectedFiles.length === 0) return;

    setUploading(true);
    const formData = new FormData();
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    try {
      const result = await axios.post('/api/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      
      alert(`✅ ${result.data.files.length} files uploaded successfully!`);
      setSelectedFiles([]);
      document.getElementById('file-input').value = '';
      
    } catch (error) {
      alert('❌ Upload failed: ' + (error.response?.data?.error || error.message));
    } finally {
      setUploading(false);
    }
  };

  const handleProcess = async () => {
    setProcessing(true);
    setIsProcessActive(true);
    setProcessLog('🚀 Starting pipeline processing...\n');
    setProcessStatus('🚀 Initializing processing pipeline...');
    
    let hasReceivedData = false;
    let lastUpdateTime = Date.now();
    
    let activityTimeout;
    let overallTimeout;
    
    try {
      const response = await fetch('/api/upload/process', {
        method: 'POST',
        headers: {
          'Accept': 'text/plain',
          'Cache-Control': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      // Set up activity timeout and connection monitoring
      activityTimeout = setInterval(() => {
        const elapsed = Date.now() - lastUpdateTime;
        if (!hasReceivedData && elapsed > 10000) {
          setProcessStatus('⚠️ No response from server - check connection');
        } else if (elapsed > 8000) {
          setProcessStatus(`⏳ Processing... (${Math.floor(elapsed / 1000)}s since last update)`);
        }
      }, 1000);
      
      // Set up overall timeout
      overallTimeout = setTimeout(() => {
        if (processing) {
          setProcessLog(prev => prev + '\n❌ Processing timed out after 3 minutes\n');
          setProcessStatus('❌ Processing timed out - operation may still be running in background');
        }
      }, 180000); // 3 minutes

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          clearInterval(activityTimeout);
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        if (chunk) {
          hasReceivedData = true;
          lastUpdateTime = Date.now();
          setProcessLog(prev => prev + chunk);
          
          // Update status based on log content
          const lines = chunk.split('\n').filter(line => line.trim());
          if (lines.length > 0) {
            const lastLine = lines[lines.length - 1];
            
            // Extract meaningful status updates
            if (lastLine.includes('Step 1:')) {
              setProcessStatus('📄 Step 1: Converting documents to markdown...');
            } else if (lastLine.includes('Step 2:')) {
              setProcessStatus('🤖 Step 2: Extracting job data with AI...');
            } else if (lastLine.includes('Step 3:')) {
              setProcessStatus('✅ Step 3: Validating extracted content...');
            } else if (lastLine.includes('Step 4:')) {
              setProcessStatus('💾 Step 4: Writing structured job files...');
            } else if (lastLine.includes('Step 5:')) {
              setProcessStatus('🔗 Step 5: Creating embeddings and indexing...');
            } else if (lastLine.includes('Calling OpenAI API')) {
              const blockMatch = lastLine.match(/block (\d+)\/(\d+)/);
              if (blockMatch) {
                setProcessStatus(`🤖 Processing job ${blockMatch[1]} of ${blockMatch[2]} with AI...`);
              }
            } else if (lastLine.includes('Processing batch')) {
              setProcessStatus('⚡ Creating embeddings for search...');
            } else {
              // Clean status line for display
              const cleanStatus = lastLine.replace(/^[\s]*[📁🔧📖💾⏭️✅❌🚀⚡📋🤖][\s]*/, '').trim();
              if (cleanStatus && !cleanStatus.includes('   ')) {
                setProcessStatus(cleanStatus);
              }
            }
          }
        }
      }
      
      // Clear timeouts
      clearInterval(activityTimeout);
      clearTimeout(overallTimeout);
      
      // Show completion with summary
      setProcessLog(prev => prev + '\n🎉 PROCESSING COMPLETED SUCCESSFULLY!\n');
      setProcessStatus('🎉 Processing completed successfully!');
      
      // Load updated stats and show results
      await loadStats();
      
      // Show success message with delay
      setTimeout(() => {
        setProcessStatus('✅ Ready for next operation');
      }, 3000);
      
    } catch (error) {
      setProcessLog(prev => prev + `\n❌ PROCESSING FAILED: ${error.message}\n`);
      setProcessStatus(`❌ Processing failed: ${error.message}`);
      console.error('Processing error:', error);
    } finally {
      setProcessing(false);
      setIsProcessActive(false);
      // Clean up any remaining timeouts
      if (activityTimeout) clearInterval(activityTimeout);
      if (overallTimeout) clearTimeout(overallTimeout);
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
          setProcessLog(prev => prev + chunk);
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
                  <span className="nav-label">Upload</span>
                </button>
                <button
                  className={`admin-nav-item ${activeAdminSection === 'process' ? 'active' : ''}`}
                  onClick={() => setActiveAdminSection('process')}
                >
                  <span className="nav-icon">🔄</span>
                  <span className="nav-label">Process</span>
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
                  <h2>📁 Upload Documents</h2>
                  <p>Supported formats: PDF, DOCX, DOC, TXT, MD</p>
                  
                  <div className="upload-section">
                    <div className="file-upload">
                      <input
                        id="file-input"
                        type="file"
                        multiple
                        accept=".pdf,.docx,.doc,.txt,.md"
                        onChange={handleFileSelect}
                        className="file-input"
                      />
                      <label htmlFor="file-input" className="file-label">
                        📎 Select Files
                      </label>
                      
                      {selectedFiles.length > 0 && (
                        <div className="selected-files">
                          <p>Selected files ({selectedFiles.length}):</p>
                          <ul>
                            {selectedFiles.map((file, index) => (
                              <li key={index}>
                                {file.name} ({Math.round(file.size / 1024)} KB)
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      
                      <button
                        onClick={handleUpload}
                        disabled={uploading || selectedFiles.length === 0}
                        className="upload-button"
                      >
                        {uploading ? '⏳ Uploading...' : '📤 Upload Files'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeAdminSection === 'process' && (
                <div className="admin-section">
                  <h2>🔄 Process Documents</h2>
                  <p>Run the AI ingestion pipeline to update the knowledge base</p>
                  
                  <div className="process-section">
                    <div className="process-controls">
                      <button
                        onClick={handleProcess}
                        disabled={processing}
                        className="process-button"
                      >
                        {processing ? '⏳ Processing...' : '🚀 Process Documents'}
                      </button>
                      
                      {processing && (
                        <button
                          onClick={async () => {
                            try {
                              await axios.post('/api/upload/stop');
                              setProcessing(false);
                              setProcessLog(prev => prev + '\n❌ Pipeline stopped by user request\n');
                            } catch (error) {
                              console.error('Stop error:', error);
                            }
                          }}
                          className="process-button"
                          style={{marginLeft: '10px', backgroundColor: '#dc3545'}}
                        >
                          🛑 Stop Pipeline
                        </button>
                      )}
                    </div>
                    
                    {/* Progress indicator */}
                    {isProcessActive && (
                      <div className="progress-section">
                        <div className="progress-bar">
                          <div className="progress-bar-fill"></div>
                        </div>
                        <div className="progress-status">
                          {processStatus || 'Processing...'}
                        </div>
                      </div>
                    )}
                    
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
                              setProcessLog(prev => prev + chunk);
                            }
                          }
                        } catch (error) {
                          setProcessLog(prev => prev + `\n❌ Test failed: ${error.message}`);
                        } finally {
                          setProcessing(false);
                        }
                      }}
                      disabled={processing}
                      className="process-button"
                      style={{marginLeft: '10px', backgroundColor: '#666'}}
                    >
                      🧪 Test Stream
                    </button>

                    {processLog && (
                      <div className="process-log">
                        <h4>📋 Processing Log:</h4>
                        <pre className="log-content">{processLog}</pre>
                      </div>
                    )}
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
                    </div>
                    
                    {processLog && activeAdminSection === 'debug' && (
                      <div className="test-log">
                        <h4>📋 Test Output:</h4>
                        <pre className="log-content">{processLog}</pre>
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