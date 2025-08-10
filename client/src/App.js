import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Upload state
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [processLog, setProcessLog] = useState('');
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('chat');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      const result = await axios.post('/api/chat', { message });
      setResponse(result.data.response);
    } catch (error) {
      setResponse('Error: Failed to get response from ScottGPT');
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
    setProcessLog('');

    try {
      const response = await fetch('/api/upload/process', {
        method: 'POST'
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        setProcessLog(prev => prev + chunk);
      }
      
      // Refresh stats after processing
      loadStats();
      
    } catch (error) {
      setProcessLog(prev => prev + `\n❌ Error: ${error.message}`);
    } finally {
      setProcessing(false);
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

  // Load stats on component mount
  React.useEffect(() => {
    loadStats();
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <h1>ScottGPT</h1>
        <p>Interactive Resume - Ask me anything about Scott's experience!</p>
        
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
            ⚙️ Data Management
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
                <h3>Response:</h3>
                <div className="response-text">
                  {response}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'admin' && (
          <div className="admin-section">
            {stats && (
              <div className="stats-panel">
                <h3>📊 Knowledge Base Statistics</h3>
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

            <div className="upload-section">
              <h3>📁 Upload Documents</h3>
              <p>Supported formats: PDF, DOCX, DOC, TXT, MD</p>
              
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

            <div className="process-section">
              <h3>🔄 Process Documents</h3>
              <p>Run the AI ingestion pipeline to update the knowledge base</p>
              
              <button
                onClick={handleProcess}
                disabled={processing}
                className="process-button"
              >
                {processing ? '⏳ Processing...' : '🚀 Process Documents'}
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
      </main>
    </div>
  );
}

export default App;