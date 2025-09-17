import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import axios from 'axios';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const { user, isAdmin } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isAdmin()) {
      loadDashboardData();
    }
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/vdubturboadmin/dashboard');
      if (response.data.success) {
        setStats(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load admin data:', error);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (!isAdmin()) {
    return (
      <div className="admin-dashboard">
        <div className="access-denied">
          <h1>Access Denied</h1>
          <p>You don't have permission to access the admin dashboard.</p>
          <Link to="/dashboard" className="btn btn-primary">Go to Dashboard</Link>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="admin-dashboard">
        <div className="error">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={loadDashboardData} className="btn btn-primary">Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-dashboard">
      <header className="admin-header">
        <div className="header-brand">
          <h1>Admin Dashboard</h1>
        </div>
        <div className="header-actions">
          <Link to="/dashboard" className="btn btn-secondary">← Back to Dashboard</Link>
        </div>
      </header>

      <div className="admin-content">
        <div className="metrics-grid">
          <div className="metric-card">
            <h3>Total Users</h3>
            <div className="metric-number">{stats?.userStats?.total || 0}</div>
            <div className="metric-label">Registered users</div>
          </div>

          <div className="metric-card">
            <h3>Active Today</h3>
            <div className="metric-number">{stats?.userStats?.activeToday || 0}</div>
            <div className="metric-label">Users active today</div>
          </div>

          <div className="metric-card">
            <h3>Premium Users</h3>
            <div className="metric-number">{stats?.userStats?.premium || 0}</div>
            <div className="metric-label">Paid subscriptions</div>
          </div>

          <div className="metric-card">
            <h3>Resumes Generated</h3>
            <div className="metric-number">{stats?.usageStats?.totalResumes || 0}</div>
            <div className="metric-label">Total generated</div>
          </div>
        </div>

        <div className="dashboard-sections">
          <div className="section">
            <h2>Recent Activity</h2>
            <div className="activity-content">
              <p>No recent activity to display</p>
            </div>
          </div>

          <div className="section">
            <h2>System Status</h2>
            <div className="status-items">
              <div className="status-item">
                <span className="status-label">Database</span>
                <span className="status-value healthy">Operational</span>
              </div>
              <div className="status-item">
                <span className="status-label">API</span>
                <span className="status-value healthy">Operational</span>
              </div>
              <div className="status-item">
                <span className="status-label">Storage</span>
                <span className="status-value healthy">Operational</span>
              </div>
            </div>
          </div>
        </div>

        <div className="admin-navigation">
          <Link to="/vdubturboadmin/users" className="nav-card">
            <h3>User Management</h3>
            <p>Manage users and permissions</p>
          </Link>

          <Link to="/vdubturboadmin/analytics" className="nav-card">
            <h3>Analytics</h3>
            <p>View platform analytics</p>
          </Link>

          <Link to="/vdubturboadmin/system" className="nav-card">
            <h3>System Settings</h3>
            <p>Configure system settings</p>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;