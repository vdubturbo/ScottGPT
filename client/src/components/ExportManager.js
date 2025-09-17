/**
 * ExportManager - Comprehensive export and output tools for SplitOut.ai
 * Provides access to all backend features: data export, resume generation, 
 * company intelligence, skills analysis, timeline analysis, and more
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import CompactUploadProcessor from './CompactUploadProcessor';
import WorkHistoryManager from './WorkHistoryManager';
import './ExportManager.css';

const ExportManager = () => {
  const {
    loading,
    error,
    clearError,
    getExportStats,
    getExportFormats,
    validateExport,
    previewExport,
    exportJSON,
    exportCSV,
    exportResumeData,
    exportTimeline
  } = useUserDataAPI();

  const [activeSection, setActiveSection] = useState('overview');
  const [exportStats, setExportStats] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState({});

  const loadExportStats = useCallback(async () => {
    try {
      const stats = await getExportStats();
      setExportStats(stats);
    } catch (err) {
      console.error('Failed to load export stats:', err);
    }
  }, [getExportStats]);

  // Load export statistics on mount
  useEffect(() => {
    loadExportStats();
  }, [loadExportStats]);

  // Handle file download with progress tracking
  const handleDownload = async (url, filename, format) => {
    const downloadId = `${format}-${Date.now()}`;
    
    try {
      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'starting', progress: 0 }
      }));

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;
      const reader = response.body.getReader();
      let loaded = 0;
      let chunks = [];

      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'downloading', progress: 0 }
      }));

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        loaded += value.length;
        
        if (total > 0) {
          const progress = Math.round((loaded / total) * 100);
          setDownloadProgress(prev => ({
            ...prev,
            [downloadId]: { status: 'downloading', progress }
          }));
        }
      }

      // Create blob and download
      const blob = new Blob(chunks);
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'completed', progress: 100 }
      }));

      // Remove progress after 3 seconds
      setTimeout(() => {
        setDownloadProgress(prev => {
          const { [downloadId]: removed, ...rest } = prev;
          return rest;
        });
      }, 3000);

    } catch (err) {
      console.error('Download failed:', err);
      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'error', error: err.message }
      }));
    }
  };

  // Navigation sections
  const sections = [
    {
      id: 'overview',
      name: 'Overview',
      icon: '📊',
      description: 'Export statistics and quick access'
    },
    {
      id: 'upload',
      name: 'Upload Documents',
      icon: '📁',
      description: 'Upload and process resume documents'
    },
    {
      id: 'work-history',
      name: 'Review Work History',
      icon: '💼',
      description: 'Manage and edit your work experience'
    },
    {
      id: 'data-export',
      name: 'Data Export',
      icon: '💾',
      description: 'Export raw data in multiple formats'
    },
    {
      id: 'resume',
      name: 'Resume Generation',
      icon: '📄',
      description: 'AI-powered resume creation'
    },
    {
      id: 'company-intelligence',
      name: 'Company Intelligence',
      icon: '🏢',
      description: 'Career progression and company insights'
    },
    {
      id: 'skills-analysis',
      name: 'Skills Analysis',
      icon: '🎯',
      description: 'Skills evolution and recommendations'
    },
    {
      id: 'timeline',
      name: 'Timeline Analysis',
      icon: '📅',
      description: 'Career timeline and progression analysis'
    },
    {
      id: 'advanced',
      name: 'Advanced Tools',
      icon: '⚙️',
      description: 'Bulk operations and system tools'
    }
  ];

  // Render overview section
  const renderOverview = () => (
    <div className="export-overview">
      <div className="overview-header">
        <h2>Export & Analysis Tools</h2>
        <p>Access all your processed data and AI-generated insights</p>
      </div>

      {exportStats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <h3>Data Health</h3>
              <div className="stat-value">
                {exportStats.dataAvailability.hasData ? 'Ready' : 'No Data'}
              </div>
              <p>{exportStats.dataAvailability.issues?.length || 0} issues found</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">💾</div>
            <div className="stat-content">
              <h3>Export Sizes</h3>
              <div className="stat-value">
                {exportStats.estimatedSizes?.json ? 
                  `${Math.round(exportStats.estimatedSizes.json.sizeKB)}KB` : 
                  'Unknown'
                }
              </div>
              <p>Estimated JSON export size</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">🎯</div>
            <div className="stat-content">
              <h3>Available Formats</h3>
              <div className="stat-value">4+</div>
              <p>JSON, CSV, Resume, Timeline</p>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon">⚡</div>
            <div className="stat-content">
              <h3>Quick Actions</h3>
              <div className="quick-actions">
                <button 
                  className="btn-quick"
                  onClick={() => setActiveSection('data-export')}
                >
                  Export Data
                </button>
                <button 
                  className="btn-quick"
                  onClick={() => setActiveSection('resume')}
                >
                  Generate Resume
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="recommendations-section">
        <h3>Recommendations</h3>
        <div className="recommendations-list">
          {exportStats?.recommendations?.slice(0, 3).map((rec, index) => (
            <div key={index} className="recommendation-item">
              <div className="rec-icon">💡</div>
              <div className="rec-content">
                <h4>{rec.title}</h4>
                <p>{rec.description}</p>
              </div>
            </div>
          )) || (
            <div className="recommendation-item">
              <div className="rec-icon">📊</div>
              <div className="rec-content">
                <h4>Explore Your Data</h4>
                <p>Start by exporting your work history to see all available insights.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Render data export section
  const renderDataExport = () => (
    <div className="data-export-section">
      <div className="section-header">
        <h2>Data Export</h2>
        <p>Export your processed work history in various formats</p>
      </div>

      <div className="export-formats">
        <div className="format-card">
          <div className="format-header">
            <div className="format-icon">📋</div>
            <h3>JSON Export</h3>
            <span className="format-badge recommended">Recommended</span>
          </div>
          <div className="format-description">
            <p>Complete structured data with all details, skills, and metadata</p>
            <ul>
              <li>Full job history with validation results</li>
              <li>Skills and industry tags</li>
              <li>Optional content chunks and embeddings</li>
              <li>Analytics and metrics</li>
            </ul>
          </div>
          <div className="format-options">
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.json.validate}
                onChange={(e) => handleOptionChange('json', 'validate', e.target.checked)}
              />
              Include validation results
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.json.includeChunks}
                onChange={(e) => handleOptionChange('json', 'includeChunks', e.target.checked)}
              />
              Include content chunks
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.json.includeEmbeddings}
                onChange={(e) => handleOptionChange('json', 'includeEmbeddings', e.target.checked)}
              />
              Include embeddings
            </label>
          </div>
          <div className="format-actions">
            <button 
              className="btn-preview"
              onClick={() => handlePreview('json')}
            >
              Preview
            </button>
            <button 
              className="btn-export primary"
              onClick={() => handleExport('json')}
            >
              Export JSON
            </button>
          </div>
        </div>

        <div className="format-card">
          <div className="format-header">
            <div className="format-icon">📊</div>
            <h3>CSV Export</h3>
            <span className="format-badge">Spreadsheet</span>
          </div>
          <div className="format-description">
            <p>Spreadsheet-compatible format for data analysis</p>
            <ul>
              <li>Flattened job data for easy analysis</li>
              <li>Skills as concatenated lists</li>
              <li>Import to Excel, Google Sheets</li>
              <li>Perfect for pivot tables and charts</li>
            </ul>
          </div>
          <div className="format-options">
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.csv.includeSkills}
                onChange={(e) => handleOptionChange('csv', 'includeSkills', e.target.checked)}
              />
              Include skills column
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.csv.includeLocation}
                onChange={(e) => handleOptionChange('csv', 'includeLocation', e.target.checked)}
              />
              Include location data
            </label>
          </div>
          <div className="format-actions">
            <button 
              className="btn-preview"
              onClick={() => handlePreview('csv')}
            >
              Preview
            </button>
            <button 
              className="btn-export"
              onClick={() => handleExport('csv')}
            >
              Export CSV
            </button>
          </div>
        </div>

        <div className="format-card">
          <div className="format-header">
            <div className="format-icon">📈</div>
            <h3>Timeline Export</h3>
            <span className="format-badge">Analysis</span>
          </div>
          <div className="format-description">
            <p>Chronological career progression with analysis</p>
            <ul>
              <li>Timeline with gap detection</li>
              <li>Career progression insights</li>
              <li>Skill evolution tracking</li>
              <li>Overlap analysis</li>
            </ul>
          </div>
          <div className="format-options">
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.timeline.includeGaps}
                onChange={(e) => handleOptionChange('timeline', 'includeGaps', e.target.checked)}
              />
              Include gap analysis
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.timeline.includeSkillEvolution}
                onChange={(e) => handleOptionChange('timeline', 'includeSkillEvolution', e.target.checked)}
              />
              Include skill evolution
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.timeline.groupByYear}
                onChange={(e) => handleOptionChange('timeline', 'groupByYear', e.target.checked)}
              />
              Group by year
            </label>
          </div>
          <div className="format-actions">
            <button 
              className="btn-preview"
              onClick={() => handlePreview('timeline')}
            >
              Preview
            </button>
            <button 
              className="btn-export"
              onClick={() => handleExport('timeline')}
            >
              Export Timeline
            </button>
          </div>
        </div>

        <div className="format-card">
          <div className="format-header">
            <div className="format-icon">📄</div>
            <h3>Resume Data</h3>
            <span className="format-badge">Optimized</span>
          </div>
          <div className="format-description">
            <p>Clean, filtered data optimized for resume generation</p>
            <ul>
              <li>Filtered and validated positions</li>
              <li>Prioritized skills list</li>
              <li>Professional formatting ready</li>
              <li>Career summary included</li>
            </ul>
          </div>
          <div className="format-options">
            <label>
              Max positions: 
              <select 
                value={exportOptions.resumeData.maxPositions}
                onChange={(e) => handleOptionChange('resumeData', 'maxPositions', e.target.value ? parseInt(e.target.value) : null)}
              >
                <option value="5">5</option>
                <option value="8">8</option>
                <option value="12">12</option>
                <option value="">All</option>
              </select>
            </label>
            <label>
              <input 
                type="checkbox" 
                checked={exportOptions.resumeData.includeOutcomes}
                onChange={(e) => handleOptionChange('resumeData', 'includeOutcomes', e.target.checked)}
              />
              Include outcomes
            </label>
          </div>
          <div className="format-actions">
            <button 
              className="btn-preview"
              onClick={() => handlePreview('resume-data')}
            >
              Preview
            </button>
            <button 
              className="btn-export"
              onClick={() => handleExport('resume-data')}
            >
              Export Resume Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // State for export options
  const [exportOptions, setExportOptions] = useState({
    json: {
      includeChunks: false,
      includeEmbeddings: false,
      validate: true
    },
    csv: {
      includeSkills: true,
      includeLocation: true
    },
    timeline: {
      includeGaps: true,
      includeSkillEvolution: true,
      groupByYear: false
    },
    resumeData: {
      maxPositions: 8,
      includeOutcomes: true,
      skillLimit: 50,
      minDurationMonths: 1
    }
  });
  
  const [previewData, setPreviewData] = useState({});

  // Handle preview functionality
  const handlePreview = async (format) => {
    try {
      const options = exportOptions[format] || {};
      let preview;
      
      try {
        preview = await previewExport(format, options);
      } catch (err) {
        if (format === 'resume-data') {
          // Fallback to JSON preview for resume-data
          console.warn('Resume data preview failed, falling back to JSON preview:', err.message);
          preview = await previewExport('json', options);
        } else {
          throw err;
        }
      }
      
      setPreviewData(prev => ({ ...prev, [format]: preview }));
      
      // Show preview in a proper modal or expanded section
      console.log(`${format} preview:`, preview);
      
      // Create a simple preview display
      const previewContent = JSON.stringify(preview, null, 2);
      const maxLength = 1000;
      const truncatedContent = previewContent.length > maxLength 
        ? previewContent.substring(0, maxLength) + '...\n[Content truncated]'
        : previewContent;
      
      alert(`Preview for ${format.toUpperCase()}:\n\n${truncatedContent}`);
      
    } catch (err) {
      console.error(`Failed to preview ${format}:`, err);
      alert(`Preview failed for ${format.toUpperCase()}: ${err.message}`);
    }
  };

  // Handle export functionality
  const handleExport = async (format) => {
    const downloadId = `${format}-${Date.now()}`;
    
    try {
      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'starting', progress: 0 }
      }));

      const options = exportOptions[format] || {};
      let url;
      let filename;
      let mimeType;

      // Build the direct API URL with parameters
      const params = new URLSearchParams(options).toString();
      
      switch (format) {
        case 'json':
          url = `/api/user/export/json?${params}`;
          filename = `splitout-data-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
        case 'csv':
          url = `/api/user/export/csv?${params}`;
          filename = `splitout-data-${new Date().toISOString().split('T')[0]}.csv`;
          mimeType = 'text/csv';
          break;
        case 'timeline':
          url = `/api/user/export/timeline?${params}`;
          filename = `splitout-timeline-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
        case 'resume-data':
          url = `/api/user/export/resume-data?${params}`;
          filename = `splitout-resume-data-${new Date().toISOString().split('T')[0]}.json`;
          mimeType = 'application/json';
          break;
        default:
          throw new Error(`Unsupported format: ${format}`);
      }

      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'downloading', progress: 25 }
      }));

      // Fetch the file data
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Export failed: ${response.statusText}`);
      }

      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'processing', progress: 75 }
      }));

      // Get the response data
      let content;
      if (mimeType === 'text/csv') {
        content = await response.text();
      } else {
        const data = await response.json();
        if (data.success && data.data) {
          // Extract the actual data from the API wrapper
          content = JSON.stringify(data.data, null, 2);
        } else {
          content = JSON.stringify(data, null, 2);
        }
      }

      // Create and trigger download
      const blob = new Blob([content], { type: mimeType });
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'completed', progress: 100 }
      }));

      // Show success message
      console.log(`✅ Downloaded: ${filename}`);

      // Remove progress after 3 seconds
      setTimeout(() => {
        setDownloadProgress(prev => {
          const { [downloadId]: removed, ...rest } = prev;
          return rest;
        });
      }, 3000);

    } catch (err) {
      console.error(`Export failed for ${format}:`, err);
      setDownloadProgress(prev => ({
        ...prev,
        [downloadId]: { status: 'error', error: err.message }
      }));
      
      // Remove error after 10 seconds
      setTimeout(() => {
        setDownloadProgress(prev => {
          const { [downloadId]: removed, ...rest } = prev;
          return rest;
        });
      }, 10000);
    }
  };

  // Handle option changes
  const handleOptionChange = (format, option, value) => {
    setExportOptions(prev => ({
      ...prev,
      [format]: {
        ...prev[format],
        [option]: value
      }
    }));
  };

  // Render upload section
  const renderUploadSection = () => (
    <div className="upload-section">
      <div className="section-header">
        <h2>Upload Documents</h2>
        <p>Upload and process resume documents for analysis</p>
      </div>
      <CompactUploadProcessor />
    </div>
  );

  // Render work history section
  const renderWorkHistorySection = () => (
    <div className="work-history-section">
      <div className="section-header">
        <h2>Review Work History</h2>
        <p>Manage and edit your work experience</p>
      </div>
      <WorkHistoryManager />
    </div>
  );

  // Render placeholder sections for now
  const renderPlaceholderSection = (title, description) => (
    <div className="placeholder-section">
      <div className="section-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <div className="coming-soon">
        <div className="coming-soon-icon">🚧</div>
        <h3>Coming Soon</h3>
        <p>This feature is being implemented and will be available shortly.</p>
        <div className="feature-preview">
          <p>This section will provide:</p>
          <ul>
            <li>Interactive interface for {title.toLowerCase()}</li>
            <li>Real-time preview capabilities</li>
            <li>Customizable export options</li>
            <li>Advanced filtering and sorting</li>
          </ul>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard-export-manager">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError} className="close-error">×</button>
        </div>
      )}

      <div className="dashboard-export-layout">
        {/* Navigation Tabs */}
        <div className="dashboard-export-nav">
          <div className="nav-header">
            <h2>Content & Export Tools</h2>
            <p>Manage your professional data and generate exports</p>
          </div>
          <div className="nav-tabs">
            {sections.map(section => (
              <button
                key={section.id}
                className={`nav-tab ${activeSection === section.id ? 'active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                <span className="tab-icon">{section.icon}</span>
                <span className="tab-name">{section.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Main Content Area */}
        <div className="dashboard-export-content">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <span>Loading export tools...</span>
            </div>
          )}

          {!loading && (
            <>
              {activeSection === 'overview' && renderOverview()}
              {activeSection === 'upload' && renderUploadSection()}
              {activeSection === 'work-history' && renderWorkHistorySection()}
              {activeSection === 'data-export' && renderDataExport()}
              {activeSection === 'resume' && renderPlaceholderSection('Resume Generation', 'AI-powered resume creation with multiple templates and formats')}
              {activeSection === 'company-intelligence' && renderPlaceholderSection('Company Intelligence', 'Career progression insights and company analysis')}
              {activeSection === 'skills-analysis' && renderPlaceholderSection('Skills Analysis', 'Skills evolution tracking and recommendations')}
              {activeSection === 'timeline' && renderPlaceholderSection('Timeline Analysis', 'Comprehensive career timeline with gap analysis')}
              {activeSection === 'advanced' && renderPlaceholderSection('Advanced Tools', 'Bulk operations and system administration tools')}
            </>
          )}
        </div>
      </div>

      {/* Download Progress Overlay */}
      {Object.keys(downloadProgress).length > 0 && (
        <div className="download-progress-overlay">
          <div className="download-progress">
            <h3>Downloads</h3>
            {Object.entries(downloadProgress).map(([id, progress]) => (
              <div key={id} className="download-item">
                <div className="download-info">
                  <span className="download-name">{id}</span>
                  <span className="download-status">{progress.status}</span>
                </div>
                {progress.status === 'downloading' && (
                  <div className="progress-bar">
                    <div 
                      className="progress-fill"
                      style={{ width: `${progress.progress}%` }}
                    ></div>
                  </div>
                )}
                {progress.status === 'error' && (
                  <div className="download-error">{progress.error}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportManager;