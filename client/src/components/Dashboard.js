// client/src/components/Dashboard.js
// User dashboard component

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBilling } from '../contexts/BillingContext';
import { Link } from 'react-router-dom';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import CompactUploadProcessor from './CompactUploadProcessor';
import WorkHistoryManager from './WorkHistoryManager';
import DocumentsModal from './DocumentsModal';
import ResumeGenerator from './ResumeGenerator';
import UserMenu from './UserMenu';
import UsageTracker from './billing/UsageTracker';
import FeedbackModal from './FeedbackModal';

const Dashboard = () => {
  const { user, logout, isAdmin } = useAuth();
  const { usage, subscription, isPremium, isAtLimit } = useBilling();
  const [activeTab, setActiveTab] = useState('overview');
  const [dashboardStats, setDashboardStats] = useState(null);
  const [showDocumentsModal, setShowDocumentsModal] = useState(false);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
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


  if (!user) return null;

  const { profile } = user;

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-content">
          <div className="user-info">
            <img
              src="/Logo3.png"
              alt="SplitOut"
              className="dashboard-logo"
            />
          </div>
          <div className="header-actions">
            {/* Usage Tracker - Left Side */}
            <div className="header-usage">
              <UsageTracker
                position="header"
                compact={true}
                showUpgradePrompts={true}
                autoShowUpgrade={false}
              />
            </div>

            {/* Middle - Feedback Button */}
            <div className="header-center">
              <button
                className="feedback-btn"
                onClick={() => setShowFeedbackModal(true)}
                title="Share your feedback with us"
              >
                💬 Provide Feedback
              </button>
            </div>

            {/* Right Side - Admin Link and User Menu */}
            <div className="header-right">
              {isAdmin() && (
                <Link to="/admin" className="btn btn-admin">
                  Admin Panel
                </Link>
              )}
              <UserMenu />
            </div>
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
          💼 Work History
        </button>
        <button 
          className={`nav-item ${activeTab === 'resumes' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumes')}
        >
          📄 Generate Resumes
        </button>
      </nav>

      {/* Content */}
      <main className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            {/* Dashboard Overview Section */}
            <div className="welcome-section">
              <h2>Professional Data Portfolio</h2>
              <p className="welcome-subtitle">Here's what's in your professional data portfolio</p>
            </div>

            {/* Data Metrics */}
            <div className="data-metrics">

              {/* Compact Summary Row */}
              <div className="metrics-compact-row">
                <div className="metric-card compact">
                  <div className="metric-icon compact">💼</div>
                  <div className="metric-content">
                    <div className="metric-number compact">{dashboardStats?.totalJobs || 0}</div>
                    <div className="metric-label compact">Job Positions</div>
                  </div>
                </div>
                <div className="metric-card compact">
                  <div className="metric-icon compact">🏢</div>
                  <div className="metric-content">
                    <div className="metric-number compact">{dashboardStats?.companies || 0}</div>
                    <div className="metric-label compact">Companies</div>
                  </div>
                </div>
                <div className="metric-card compact">
                  <div className="metric-icon compact">👀</div>
                  <div className="metric-content">
                    <div className="metric-number compact">{profile?.profile_views || 0}</div>
                    <div className="metric-label compact">Profile Views</div>
                  </div>
                </div>
                {dashboardStats?.duplicates && dashboardStats.duplicates.estimatedDuplicates > 0 && (
                  <div className="metric-card compact warning">
                    <div className="metric-icon compact">⚠️</div>
                    <div className="metric-content">
                      <div className="metric-number compact">{dashboardStats.duplicates.estimatedDuplicates}</div>
                      <div className="metric-label compact">Potential Duplicates</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Featured Documents Card */}
              <div className="metrics-featured">
                <div
                  className="metric-card featured clickable"
                  onClick={() => setShowDocumentsModal(true)}
                  style={{ cursor: 'pointer' }}
                  title="Click to view uploaded documents"
                >
                  <div className="metric-icon featured">📄</div>
                  <div className="metric-content">
                    <div className="metric-number featured">{dashboardStats?.documentsUploaded || 0}</div>
                    <div className="metric-label featured">Documents Uploaded</div>
                    <div className="metric-subtitle">Click to view and manage</div>
                  </div>
                  <div className="featured-indicator">→</div>
                </div>
              </div>
            </div>

            {/* File Upload Section */}
            <div className="upload-section">
              <CompactUploadProcessor onUploadComplete={loadDashboardStats} />
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
              <h2>💼 Work History Manager</h2>
              <p>Review, edit, and manage your job positions and career progression</p>
            </div>

            <div className="data-sections">
              {/* Work History Section - Now Prime Feature */}
              <div className="data-section">
                <div className="section-content">
                  <WorkHistoryManager />
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'resumes' && (
          <div className="resumes-tab">
            <ResumeGenerator />
          </div>
        )}

      </main>

      {/* Documents Modal */}
      <DocumentsModal
        isOpen={showDocumentsModal}
        onClose={() => setShowDocumentsModal(false)}
      />

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
      />
    </div>
  );
};

export default Dashboard;