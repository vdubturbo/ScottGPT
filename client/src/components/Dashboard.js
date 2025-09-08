// client/src/components/Dashboard.js
// User dashboard component

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import ExportManager from './ExportManager';

const Dashboard = () => {
  const { user, logout, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');

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
          Overview
        </button>
        <button 
          className={`nav-item ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile
        </button>
        <button 
          className={`nav-item ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          My Content
        </button>
        <button 
          className={`nav-item ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          Analytics
        </button>
      </nav>

      {/* Content */}
      <main className="dashboard-content">
        {activeTab === 'overview' && (
          <div className="overview-tab">
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Profile Views</h3>
                <p className="stat-number">{profile?.profile_views || 0}</p>
              </div>
              <div className="stat-card">
                <h3>Recruiter Contacts</h3>
                <p className="stat-number">{profile?.recruiter_contacts || 0}</p>
              </div>
              <div className="stat-card">
                <h3>Subscription</h3>
                <p className="stat-text">{profile?.subscription_tier || 'free'}</p>
              </div>
              <div className="stat-card">
                <h3>Profile Status</h3>
                <p className="stat-text">{profile?.visibility || 'public'}</p>
              </div>
            </div>

            <div className="quick-actions">
              <h3>Quick Actions</h3>
              <div className="actions-grid">
                <button className="action-card">
                  <h4>Upload Resume</h4>
                  <p>Add your latest work experience</p>
                </button>
                <button className="action-card">
                  <h4>Update Profile</h4>
                  <p>Keep your information current</p>
                </button>
                <button className="action-card">
                  <h4>Customize URL</h4>
                  <p>Personalize your profile link</p>
                </button>
                {profile?.role === 'job_seeker' && (
                  <button className="action-card">
                    <h4>Job Alerts</h4>
                    <p>Set up personalized job notifications</p>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="profile-tab">
            <h2>Profile Settings</h2>
            <div className="profile-info">
              <p><strong>Email:</strong> {profile?.email}</p>
              <p><strong>Full Name:</strong> {profile?.full_name}</p>
              <p><strong>Display Name:</strong> {profile?.display_name}</p>
              <p><strong>URL Slug:</strong> {profile?.url_slug}</p>
              <p><strong>Role:</strong> {profile?.role}</p>
              <p><strong>Subscription:</strong> {profile?.subscription_tier}</p>
              {profile?.bio && <p><strong>Bio:</strong> {profile.bio}</p>}
              {profile?.location && <p><strong>Location:</strong> {profile.location}</p>}
            </div>
            <button className="btn btn-primary">Edit Profile</button>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="content-tab">
            <ExportManager />
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="analytics-tab">
            <h2>Analytics</h2>
            <div className="analytics-grid">
              <div className="analytics-card">
                <h4>Profile Performance</h4>
                <p>Views: {profile?.profile_views || 0}</p>
                <p>Contacts: {profile?.recruiter_contacts || 0}</p>
              </div>
              <div className="analytics-card">
                <h4>Recent Activity</h4>
                <p>No recent activity</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default Dashboard;