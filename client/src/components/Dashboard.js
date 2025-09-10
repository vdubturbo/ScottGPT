// client/src/components/Dashboard.js
// User dashboard component

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import CompactUploadProcessor from './CompactUploadProcessor';
import WorkHistoryManager from './WorkHistoryManager';
import DocumentsModal from './DocumentsModal';

const Dashboard = () => {
  const { user, logout, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const { getWorkHistory, getExportStats, getDuplicatesSummary, getUploadedDocuments } = useUserDataAPI();

  // Load dashboard statistics
  const loadDashboardStats = useCallback(async () => {
    try {
      const [workHistory, exportStats, duplicatesSummary, uploadedDocs] = await Promise.allSettled([
        getWorkHistory(),
        getExportStats(),
        getDuplicatesSummary(),
        getUploadedDocuments({ limit: 0 }) // Just get count, not the docs themselves
      ]);

      const stats = {
        totalJobs: workHistory.status === 'fulfilled' ? (workHistory.value?.jobs?.length || 0) : 0,
        companies: workHistory.status === 'fulfilled' ? 
          new Set(workHistory.value?.jobs?.map(job => job.org).filter(Boolean)).size : 0,
        exportStats: exportStats.status === 'fulfilled' ? exportStats.value : null,
        duplicates: duplicatesSummary.status === 'fulfilled' ? duplicatesSummary.value : null,
        documentsUploaded: uploadedDocs.status === 'fulfilled' ? 
          (uploadedDocs.value?.pagination?.total || uploadedDocs.value?.length || 0) : 0
      };

      setDashboardStats(stats);
    } catch (error) {
      console.error('Failed to load dashboard stats:', error);
      // Set basic stats even if API calls fail
      setDashboardStats({
        totalJobs: 0,
        companies: 0,
        exportStats: null,
        duplicates: null,
        documentsUploaded: 0
      });
    }
  }, [getWorkHistory, getExportStats, getDuplicatesSummary, getUploadedDocuments]);

  useEffect(() => {
    if (user) {
      loadDashboardStats();
    }
  }, [user, loadDashboardStats]);

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  if (!user) return null;

  const { profile } = user;

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <h1>Welcome, {profile?.display_name || profile?.full_name || 'User'}!</h1>
            <span className="role-badge role-{profile?.role}">{profile?.role?.replace('_', ' ')}</span>
          </div>
          <div className="header-actions">
            {profile?.url_slug && (
              <Link 
                to={`/${profile.url_slug}`} 
                className="btn btn-secondary"
                target="_blank"
                rel="noopener noreferrer"
              >
                View Public Profile
              </Link>
            )}
            {isAdmin() && (
              <Link to="/admin" className="btn btn-admin">
                Admin Panel
              </Link>
            )}
            <button onClick={handleLogout} className="btn btn-outline">
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="dashboard-nav">
        <button 
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          📊 Overview
        </button>
        <button 
          className={`nav-item ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          📁 Manage Data
        </button>
        <button 
          className={`nav-item nav-item-coming-soon ${activeTab === 'resumes' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumes')}
          disabled
        >
          📄 Generate Resumes
          <span className="coming-soon-badge">Soon</span>
        </button>
      </nav>

      {/* Content */}
      <main className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* Welcome Section */}
            <div className="welcome-section">
              <h2>Welcome back, {profile?.display_name || profile?.full_name || 'User'}!</h2>
              <p className="welcome-subtitle">Here's what's in your professional data portfolio</p>
            </div>

            {/* Data Metrics */}
            <div className="data-metrics">
              <h3>📊 Your Data Summary</h3>
              <div className="metrics-grid">
                <div className="metric-card">
                  <div className="metric-icon">💼</div>
                  <div className="metric-content">
                    <div className="metric-number">{dashboardStats?.totalJobs || 0}</div>
                    <div className="metric-label">Job Positions</div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">🏢</div>
                  <div className="metric-content">
                    <div className="metric-number">{dashboardStats?.companies || 0}</div>
                    <div className="metric-label">Companies</div>
                  </div>
                </div>
                <div 
                  className="metric-card clickable" 
                  onClick={() => setShowDocumentsModal(true)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view uploaded documents"
                >
                  <div className="metric-icon">📄</div>
                  <div className="metric-content">
                    <div className="metric-number">{dashboardStats?.documentsUploaded || 0}</div>
                    <div className="metric-label">Documents Uploaded</div>
                  </div>
                </div>
                <div className="metric-card">
                  <div className="metric-icon">👀</div>
                  <div className="metric-content">
                    <div className="metric-number">{profile?.profile_views || 0}</div>
                    <div className="metric-label">Profile Views</div>
                  </div>
                </div>
                {dashboardStats?.duplicates && dashboardStats.duplicates.estimatedDuplicates > 0 && (
                  <div className="metric-card warning">
                    <div className="metric-icon">⚠️</div>
                    <div className="metric-content">
                      <div className="metric-number">{dashboardStats.duplicates.estimatedDuplicates}</div>
                      <div className="metric-label">Potential Duplicates</div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Primary Actions */}
            <div className="primary-actions">
              <div className="action-section">
                <button 
                  className="primary-action-button data-action"
                  onClick={() => setActiveTab('data')}
                >
                  <div className="action-icon">📁</div>
                  <div className="action-content">
                    <h3>Add & Manage Data</h3>
                    <p>Upload documents, manage work history, review and clean your data</p>
                  </div>
                  <div className="action-arrow">→</div>
                </button>
              </div>
              
              <div className="action-section">
                <button 
                  className="primary-action-button resume-action disabled"
                  disabled
                >
                  <div className="action-icon">📄</div>
                  <div className="action-content">
                    <h3>Generate Resumes</h3>
                    <p>Create tailored resumes from your data portfolio</p>
                    <span className="coming-soon">Coming Soon</span>
                  </div>
                  <div className="action-arrow">→</div>
                </button>
              </div>
            </div>

            {/* Quick Links */}
            <div className="quick-links">
              <h3>⚡ Quick Actions</h3>
              <div className="quick-links-grid">
                {profile?.url_slug && (
                  <Link 
                    to={`/${profile.url_slug}`} 
                    className="quick-link"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    🌐 View Public Profile
                  </Link>
                )}
                <button 
                  className="quick-link"
                  onClick={() => loadDashboardStats()}
                >
                  🔄 Refresh Data
                </button>
                {dashboardStats?.duplicates && dashboardStats.duplicates.estimatedDuplicates > 0 && (
                  <button 
                    className="quick-link warning"
                    onClick={() => setActiveTab('data')}
                  >
                    ⚠️ Fix Duplicates ({dashboardStats.duplicates.estimatedDuplicates})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="data-tab">
            <div className="data-tab-header">
              <h2>📁 Manage Your Data</h2>
              <p>Upload documents and manage your professional work history</p>
            </div>

            <div className="data-sections">
              {/* Upload Section */}
              <div className="data-section">
                <div className="section-header">
                  <h3>📄 Upload Documents</h3>
                  <p>Add new resumes, job descriptions, or other professional documents</p>
                </div>
                <div className="section-content">
                  <CompactUploadProcessor onUploadComplete={loadDashboardStats} />
                </div>
              </div>

              {/* Work History Section */}
              <div className="data-section">
                <div className="section-header">
                  <h3>💼 Work History</h3>
                  <p>Review and manage your job positions and career progression</p>
                </div>
                <div className="section-content">
                  <WorkHistoryManager />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'resumes' && (
          <div className="resumes-tab">
            <div className="coming-soon-page">
              <div className="coming-soon-icon">📄</div>
              <h2>Resume Generation</h2>
              <p>This feature is being developed and will be available soon.</p>
              <div className="coming-soon-features">
                <h4>What's Coming:</h4>
                <ul>
                  <li>✨ AI-powered resume generation from your data</li>
                  <li>🎯 Multiple resume templates and formats</li>
                  <li>📊 Tailored resumes for specific job applications</li>
                  <li>📋 Export to PDF, Word, and other formats</li>
                </ul>
              </div>
              <button 
                className="btn btn-secondary"
                onClick={() => setActiveTab('overview')}
              >
                ← Back to Overview
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Documents Modal */}
      <DocumentsModal 
        isOpen={showDocumentsModal} 
        onClose={() => setShowDocumentsModal(false)} 
      />
    </div>
  );
};

export default Dashboard;