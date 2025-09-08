// client/src/components/AdminDashboard.js
// Admin dashboard for platform management

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';

const AdminDashboard = () => {
  const { user, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAdmin()) {
      loadDashboardData();
    }
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsResponse, usersResponse] = await Promise.all([
        axios.get('/api/admin/dashboard'),
        axios.get('/api/admin/users?limit=10')
      ]);

      setStats(statsResponse.data.dashboard);
      setUsers(usersResponse.data.users);
    } catch (error) {
      console.error('Failed to load admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="error-page">
        <h1>Access Denied</h1>
        <p>You don't have permission to access the admin dashboard.</p>
        <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      {/* Header */}
      <header className="admin-header">
        <div className="header-content">
          <h1>Admin Dashboard</h1>
          <div className="header-actions">
            <Link to="/dashboard" className="btn btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="admin-nav">
        <button 
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          Overview
        </button>
        <button 
          className={`nav-item ${activeTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveTab('users')}
        >
          Users
        </button>
        <button 
          className={`nav-item ${activeTab === 'content' ? 'active' : ''}`}
          onClick={() => setActiveTab('content')}
        >
          Content
        </button>
        <button 
          className={`nav-item ${activeTab === 'system' ? 'active' : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System
        </button>
      </nav>

      {/* Content */}
      <main className="admin-content">
        {loading && <div className="loading">Loading admin data...</div>}

        {activeTab === 'overview' && (
          <div className="overview-tab">
            <h2>Platform Overview</h2>
            
            {stats && (
              <div className="admin-stats-grid">
                <div className="admin-stat-card">
                  <h3>Total Users</h3>
                  <p className="stat-number">{stats.users?.total || 0}</p>
                  <p className="stat-detail">
                    {stats.users?.newUsersLast30Days || 0} new this month
                  </p>
                </div>
                
                <div className="admin-stat-card">
                  <h3>Content Items</h3>
                  <p className="stat-number">{stats.content?.totalContent || 0}</p>
                  <p className="stat-detail">
                    {stats.content?.newContentLast30Days || 0} new this month
                  </p>
                </div>
                
                <div className="admin-stat-card">
                  <h3>Profile Views</h3>
                  <p className="stat-number">{stats.analytics?.totalViews || 0}</p>
                  <p className="stat-detail">
                    {stats.analytics?.viewsLast30Days || 0} this month
                  </p>
                </div>
                
                <div className="admin-stat-card">
                  <h3>Active Users</h3>
                  <p className="stat-number">{stats.analytics?.uniqueViewers || 0}</p>
                  <p className="stat-detail">Last 30 days</p>
                </div>
              </div>
            )}

            <div className="admin-sections">
              <div className="admin-section">
                <h3>User Roles Breakdown</h3>
                {stats?.users?.byRole && (
                  <div className="role-breakdown">
                    {Object.entries(stats.users.byRole).map(([role, count]) => (
                      <div key={role} className="role-item">
                        <span className="role-name">{role.replace('_', ' ')}</span>
                        <span className="role-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="admin-section">
                <h3>Subscription Tiers</h3>
                {stats?.users?.byTier && (
                  <div className="tier-breakdown">
                    {Object.entries(stats.users.byTier).map(([tier, count]) => (
                      <div key={tier} className="tier-item">
                        <span className="tier-name">{tier}</span>
                        <span className="tier-count">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-tab">
            <h2>User Management</h2>
            
            <div className="users-table">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Subscription</th>
                    <th>Created</th>
                    <th>Last Active</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(user => (
                    <tr key={user.id}>
                      <td>{user.display_name || user.full_name}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`role-badge role-${user.role}`}>
                          {user.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td>{user.subscription_tier}</td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                      <td>
                        {user.last_active_at 
                          ? new Date(user.last_active_at).toLocaleDateString()
                          : 'Never'
                        }
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button className="btn btn-small">View</button>
                          <button className="btn btn-small btn-warning">Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'content' && (
          <div className="content-tab">
            <h2>Content Management</h2>
            <p>Content management features coming soon...</p>
            <div className="placeholder-content">
              <h3>Platform Content Overview</h3>
              <p>Monitor and manage user-generated content across the platform.</p>
            </div>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="system-tab">
            <h2>System Status</h2>
            <div className="system-status">
              <div className="status-item">
                <span className="status-label">Database</span>
                <span className="status-value healthy">Healthy</span>
              </div>
              <div className="status-item">
                <span className="status-label">API</span>
                <span className="status-value healthy">Operational</span>
              </div>
              <div className="status-item">
                <span className="status-label">Authentication</span>
                <span className="status-value healthy">Operational</span>
              </div>
            </div>

            <div className="system-actions">
              <h3>System Actions</h3>
              <button className="btn btn-secondary">Clear Cache</button>
              <button className="btn btn-secondary">Run Health Check</button>
              <button className="btn btn-warning">Generate Report</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;