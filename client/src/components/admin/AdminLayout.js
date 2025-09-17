// client/src/components/admin/AdminLayout.js
// Professional admin layout with sidebar navigation

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import './AdminLayout.css';

const AdminLayout = ({ children }) => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navigationItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      path: '/vdubturboadmin',
      icon: '📊',
      exact: true
    },
    {
      id: 'users',
      label: 'User Management',
      path: '/vdubturboadmin/users',
      icon: '👥'
    },
    {
      id: 'subscriptions',
      label: 'Subscriptions',
      path: '/vdubturboadmin/subscriptions',
      icon: '💳'
    },
    {
      id: 'analytics',
      label: 'Analytics',
      path: '/vdubturboadmin/analytics',
      icon: '📈'
    },
    {
      id: 'audit',
      label: 'Audit Logs',
      path: '/vdubturboadmin/audit',
      icon: '📋'
    },
    {
      id: 'system',
      label: 'System Health',
      path: '/vdubturboadmin/system',
      icon: '⚙️'
    }
  ];

  const isActive = (item) => {
    if (item.exact) {
      return location.pathname === item.path;
    }
    return location.pathname.startsWith(item.path);
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <div className="admin-layout">
      {/* Sidebar */}
      <aside className={`admin-sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        {/* Logo and Brand */}
        <div className="sidebar-header">
          <div className="admin-logo">
            <img src="/Logo3.png" alt="ScottGPT" className="logo-image" />
            {!sidebarCollapsed && (
              <div className="logo-text">
                <h2>ScottGPT</h2>
                <span>Admin Panel</span>
              </div>
            )}
          </div>
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            aria-label="Toggle sidebar"
          >
            {sidebarCollapsed ? '→' : '←'}
          </button>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <ul className="nav-list">
            {navigationItems.map((item) => (
              <li key={item.id} className="nav-item">
                <Link
                  to={item.path}
                  className={`nav-link ${isActive(item) ? 'active' : ''}`}
                  title={sidebarCollapsed ? item.label : ''}
                >
                  <span className="nav-icon">{item.icon}</span>
                  {!sidebarCollapsed && (
                    <span className="nav-label">{item.label}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* Quick Actions */}
        {!sidebarCollapsed && (
          <div className="sidebar-footer">
            <div className="quick-actions">
              <h4>Quick Actions</h4>
              <button className="quick-action-btn">
                📧 Send Announcement
              </button>
              <button className="quick-action-btn">
                📊 Export Report
              </button>
              <button className="quick-action-btn">
                🔧 System Backup
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="admin-main">
        {/* Top Header */}
        <header className="admin-header">
          <div className="header-left">
            <h1 className="page-title">
              {navigationItems.find(item => isActive(item))?.label || 'Admin Dashboard'}
            </h1>
          </div>

          <div className="header-right">
            {/* Search */}
            <div className="global-search">
              <input
                type="text"
                placeholder="Search users, orders..."
                className="search-input"
              />
              <button className="search-btn">🔍</button>
            </div>

            {/* Notifications */}
            <button className="notification-btn">
              🔔
              <span className="notification-badge">3</span>
            </button>

            {/* User Menu */}
            <div className="user-menu">
              <button
                className="user-menu-trigger"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
              >
                <div className="user-avatar">
                  {user?.profile?.display_name?.charAt(0)?.toUpperCase() || 'A'}
                </div>
                <span className="user-name">
                  {user?.profile?.display_name || 'Admin'}
                </span>
                <span className="chevron">▼</span>
              </button>

              {userMenuOpen && (
                <div className="user-menu-dropdown">
                  <Link to="/dashboard" className="menu-item">
                    👤 User Dashboard
                  </Link>
                  <Link to="/profile" className="menu-item">
                    ⚙️ Profile Settings
                  </Link>
                  <div className="menu-divider"></div>
                  <button onClick={handleLogout} className="menu-item logout">
                    🚪 Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="admin-content">
          <div className="content-container">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile Overlay */}
      {!sidebarCollapsed && (
        <div
          className="mobile-overlay"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
    </div>
  );
};

export default AdminLayout;