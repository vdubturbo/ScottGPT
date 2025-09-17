// client/src/components/AdminDashboard.js
// Admin dashboard for platform management

import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import axios from 'axios';
import './AdminDashboard.css';

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
        axios.get('/api/vdubturboadmin/dashboard'),
        axios.get('/api/vdubturboadmin/users?limit=10')
      ]);

      setStats(statsResponse.data.data);
      setUsers(usersResponse.data.data.users);
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
          <div className="admin-brand">
            <h1>ScottGPT</h1>
            <span className="admin-badge">ADMIN PANEL</span>
          </div>
          <div className="header-search">
            <input type="text" placeholder="Search users, orders..." className="search-input" />
          </div>
          <div className="header-actions">
            <button className="notification-btn">🔔</button>
            <div className="admin-user">
              <span>{user?.full_name || user?.display_name}</span>
              <Link to="/dashboard" className="btn btn-secondary">
                Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </header>

      <div className="admin-layout">
        {/* Sidebar */}
        <nav className="admin-sidebar">
          <div className="sidebar-section">
            <button
              className={`sidebar-item ${activeTab === 'overview' ? 'active' : ''}`}
              onClick={() => setActiveTab('overview')}
            >
              <span className="sidebar-icon">📊</span> Dashboard
            </button>
          </div>

          <div className="sidebar-section">
            <button
              className={`sidebar-item ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              <span className="sidebar-icon">👥</span> User Management
            </button>
            <button
              className={`sidebar-item ${activeTab === 'subscriptions' ? 'active' : ''}`}
              onClick={() => setActiveTab('subscriptions')}
            >
              <span className="sidebar-icon">💳</span> Subscriptions
            </button>
            <button
              className={`sidebar-item ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <span className="sidebar-icon">📈</span> Analytics
            </button>
            <button
              className={`sidebar-item ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <span className="sidebar-icon">📋</span> Audit Logs
            </button>
          </div>

          <div className="sidebar-section">
            <button
              className={`sidebar-item ${activeTab === 'system' ? 'active' : ''}`}
              onClick={() => setActiveTab('system')}
            >
              <span className="sidebar-icon">⚙️</span> System Health
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="admin-main">
          <div className="admin-content">
        {loading && <div className="loading">Loading admin data...</div>}

            {activeTab === 'overview' && (
              <div className="overview-tab">
                <div className="content-header">
                  <h1>Welcome to ScottGPT Admin</h1>
                  <p>Monitor your platform performance and manage users efficiently</p>
                  <div className="header-buttons">
                    <button className="btn btn-primary">📢 Send Announcement</button>
                    <button className="btn btn-secondary">📊 Export Report</button>
                  </div>
                </div>
            
                {stats && (
                  <div className="metrics-grid">
                    <div className="metric-card">
                      <div className="metric-header">
                        <h3>Total Users</h3>
                        <span className="metric-icon">👥</span>
                      </div>
                      <div className="metric-value">{stats.users?.total || 0}</div>
                      <div className="metric-change">Active: {stats.users?.active || 0} | Premium: {stats.users?.premium || 0}</div>
                      <div className="metric-breakdown">
                        <div className="breakdown-item">
                          <span>ARR: $1.5K</span>
                        </div>
                        <div className="breakdown-item">
                          <span>Active Users</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <h3>Monthly Revenue</h3>
                        <span className="metric-icon">💰</span>
                      </div>
                      <div className="metric-value">$1535</div>
                      <div className="metric-change positive">ARR: $18,420</div>
                      <div className="metric-breakdown">
                        <div className="breakdown-item">
                          <span>Limit: 150</span>
                        </div>
                        <div className="breakdown-item">
                          <span>Resume Gen</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <h3>Resume Generations</h3>
                        <span className="metric-icon">📄</span>
                      </div>
                      <div className="metric-value">{stats.analytics?.totalViews || 0}</div>
                      <div className="metric-change">Memory: 9GB | CPU: 45%</div>
                      <div className="metric-breakdown">
                        <div className="breakdown-item">
                          <span>5d 14h uptime</span>
                        </div>
                        <div className="breakdown-item">
                          <span>System Health</span>
                        </div>
                      </div>
                    </div>

                    <div className="metric-card">
                      <div className="metric-header">
                        <h3>System Health</h3>
                        <span className="metric-icon">⚡</span>
                      </div>
                      <div className="metric-value">8</div>
                      <div className="metric-change">Active users today</div>
                      <div className="metric-breakdown">
                        <div className="breakdown-item">
                          <span>13,866,801,854% uptime</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="dashboard-sections">
                  <div className="dashboard-section">
                    <div className="section-header">
                      <h2>Recent Activity</h2>
                      <a href="#" className="section-link">View All →</a>
                    </div>
                    <div className="activity-list">
                      <div className="empty-state">
                        <p>No recent activity</p>
                      </div>
                    </div>
                  </div>

                  <div className="dashboard-section">
                    <div className="section-header">
                      <h2>Quick Statistics</h2>
                    </div>
                    <div className="quick-stats">
                      <div className="stat-item">
                        <div className="stat-label">Paid Users</div>
                        <div className="stat-value">4</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Total Revenue</div>
                        <div className="stat-value">$1535</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Platform Uptime</div>
                        <div className="stat-value">5d 14h</div>
                      </div>
                      <div className="stat-item">
                        <div className="stat-label">Active Users Today</div>
                        <div className="stat-value">8</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="navigation-grid">
                  <div className="nav-card">
                    <div className="nav-card-icon">👥</div>
                    <div className="nav-card-content">
                      <h3>User Management</h3>
                      <p>Manage users, roles, and permissions</p>
                      <div className="nav-card-count">15 users</div>
                    </div>
                  </div>

                  <div className="nav-card">
                    <div className="nav-card-icon">💳</div>
                    <div className="nav-card-content">
                      <h3>Subscriptions</h3>
                      <p>Monitor billing and subscriptions</p>
                      <div className="nav-card-count">4 active</div>
                    </div>
                  </div>

                  <div className="nav-card">
                    <div className="nav-card-icon">📈</div>
                    <div className="nav-card-content">
                      <h3>Analytics</h3>
                      <p>View detailed platform analytics</p>
                      <div className="nav-card-count">Real-time data</div>
                    </div>
                  </div>

                  <div className="nav-card">
                    <div className="nav-card-icon">⚙️</div>
                    <div className="nav-card-content">
                      <h3>System Health</h3>
                      <p>Monitor and improve platform performance</p>
                      <div className="nav-card-count">13,866,801,854% uptime</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'subscriptions' && (
              <div className="subscriptions-tab">
                <h2>Subscriptions</h2>
                <p>Subscription management features coming soon...</p>
              </div>
            )}

            {activeTab === 'analytics' && (
              <div className="analytics-tab">
                <h2>Analytics</h2>
                <p>Analytics dashboard coming soon...</p>
              </div>
            )}

            {activeTab === 'audit' && (
              <div className="audit-tab">
                <h2>Audit Logs</h2>
                <p>Audit log viewer coming soon...</p>
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
            )}

            {activeTab === 'system' && (
              <div className="system-tab">
                <h2>System Health</h2>
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
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;