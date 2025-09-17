// client/src/components/admin/UserManagement.js
// Comprehensive user management interface with search, filtering, and inline editing

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './UserManagement.css';

const UserManagement = () => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    role: 'all',
    subscription: 'all',
    status: 'all'
  });
  const [sortBy, setSortBy] = useState('created_at');
  const [sortOrder, setSortOrder] = useState('desc');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0
  });
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [bulkAction, setBulkAction] = useState('');

  useEffect(() => {
    loadUsers();
  }, [pagination.page, pagination.limit, sortBy, sortOrder]);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, filters]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get('/api/vdubturboadmin/users', {
        params: {
          page: pagination.page,
          limit: pagination.limit,
          sortBy,
          sortOrder
        }
      });

      if (response.data.success) {
        setUsers(response.data.data.users);
        setPagination(prev => ({
          ...prev,
          total: response.data.data.total
        }));
      }
    } catch (error) {
      console.error('Failed to load users:', error);
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const filterUsers = () => {
    let filtered = [...users];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.display_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Role filter
    if (filters.role !== 'all') {
      filtered = filtered.filter(user => user.role === filters.role);
    }

    // Subscription filter
    if (filters.subscription !== 'all') {
      filtered = filtered.filter(user => user.subscription_tier === filters.subscription);
    }

    // Status filter
    if (filters.status !== 'all') {
      filtered = filtered.filter(user => {
        if (filters.status === 'active') return user.last_active_at;
        if (filters.status === 'inactive') return !user.last_active_at;
        return true;
      });
    }

    setFilteredUsers(filtered);
  };

  const handleSort = (column) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const handleUserSelect = (userId) => {
    setSelectedUsers(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedUsers.length === filteredUsers.length) {
      setSelectedUsers([]);
    } else {
      setSelectedUsers(filteredUsers.map(user => user.id));
    }
  };

  const handleUserEdit = (user) => {
    setSelectedUser(user);
    setShowUserModal(true);
  };

  const handleUserUpdate = async (userId, updates) => {
    try {
      const response = await axios.put(`/api/vdubturboadmin/users/${userId}`, updates);
      if (response.data.success) {
        setUsers(prev =>
          prev.map(user =>
            user.id === userId ? { ...user, ...response.data.data } : user
          )
        );
      }
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleBulkAction = async () => {
    if (!bulkAction || selectedUsers.length === 0) return;

    try {
      const response = await axios.post('/api/vdubturboadmin/users/bulk-action', {
        action: bulkAction,
        userIds: selectedUsers
      });

      if (response.data.success) {
        loadUsers();
        setSelectedUsers([]);
        setBulkAction('');
      }
    } catch (error) {
      console.error('Bulk action failed:', error);
    }
  };

  const exportUsers = () => {
    const csvContent = "data:text/csv;charset=utf-8," +
      "Email,Name,Role,Subscription,Created,Last Active\n" +
      filteredUsers.map(user =>
        [
          user.email,
          user.full_name,
          user.role,
          user.subscription_tier,
          new Date(user.created_at).toLocaleDateString(),
          user.last_active_at ? new Date(user.last_active_at).toLocaleDateString() : 'Never'
        ].join(',')
      ).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'users_export.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return new Date(dateString).toLocaleDateString();
  };

  const getRoleColor = (role) => {
    const colors = {
      admin: '#dc2626',
      recruiter: '#059669',
      job_poster: '#d97706',
      job_seeker: '#3b82f6'
    };
    return colors[role] || '#6b7280';
  };

  const getSubscriptionColor = (tier) => {
    const colors = {
      free: '#6b7280',
      premium: '#7c3aed'
    };
    return colors[tier] || '#6b7280';
  };

  if (loading && users.length === 0) {
    return (
      <div className="user-management">
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading users...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="user-management">
      {/* Header */}
      <div className="page-header">
        <div className="header-left">
          <h1>User Management</h1>
          <p>Manage users, roles, and permissions across the platform</p>
        </div>
        <div className="header-actions">
          <button onClick={exportUsers} className="btn secondary">
            📊 Export CSV
          </button>
          <button className="btn primary">
            ➕ Add User
          </button>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="filters-section">
        <div className="search-box">
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <span className="search-icon">🔍</span>
        </div>

        <div className="filters">
          <select
            value={filters.role}
            onChange={(e) => setFilters(prev => ({ ...prev, role: e.target.value }))}
            className="filter-select"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="recruiter">Recruiter</option>
            <option value="job_poster">Job Poster</option>
            <option value="job_seeker">Job Seeker</option>
          </select>

          <select
            value={filters.subscription}
            onChange={(e) => setFilters(prev => ({ ...prev, subscription: e.target.value }))}
            className="filter-select"
          >
            <option value="all">All Subscriptions</option>
            <option value="free">Free</option>
            <option value="premium">Premium</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="filter-select"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Bulk Actions */}
        {selectedUsers.length > 0 && (
          <div className="bulk-actions">
            <span className="selected-count">
              {selectedUsers.length} users selected
            </span>
            <select
              value={bulkAction}
              onChange={(e) => setBulkAction(e.target.value)}
              className="bulk-select"
            >
              <option value="">Choose action...</option>
              <option value="export">Export Selected</option>
              <option value="send_email">Send Email</option>
              <option value="change_role">Change Role</option>
              <option value="reset_password">Reset Password</option>
            </select>
            <button
              onClick={handleBulkAction}
              disabled={!bulkAction}
              className="btn primary small"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Users Table */}
      <div className="table-container">
        <table className="users-table">
          <thead>
            <tr>
              <th>
                <input
                  type="checkbox"
                  checked={selectedUsers.length === filteredUsers.length && filteredUsers.length > 0}
                  onChange={handleSelectAll}
                />
              </th>
              <th onClick={() => handleSort('full_name')} className="sortable">
                Name {sortBy === 'full_name' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('email')} className="sortable">
                Email {sortBy === 'email' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('role')} className="sortable">
                Role {sortBy === 'role' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Subscription</th>
              <th onClick={() => handleSort('created_at')} className="sortable">
                Created {sortBy === 'created_at' && (sortOrder === 'asc' ? '↑' : '↓')}
              </th>
              <th>Last Active</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <tr key={user.id} className={selectedUsers.includes(user.id) ? 'selected' : ''}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedUsers.includes(user.id)}
                    onChange={() => handleUserSelect(user.id)}
                  />
                </td>
                <td>
                  <div className="user-cell">
                    <div className="user-avatar">
                      {user.display_name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                    <div className="user-info">
                      <div className="user-name">{user.display_name || user.full_name}</div>
                      <div className="user-slug">/{user.url_slug}</div>
                    </div>
                  </div>
                </td>
                <td>{user.email}</td>
                <td>
                  <span
                    className="role-badge"
                    style={{ backgroundColor: getRoleColor(user.role) }}
                  >
                    {user.role?.replace('_', ' ')}
                  </span>
                </td>
                <td>
                  <span
                    className="subscription-badge"
                    style={{ backgroundColor: getSubscriptionColor(user.subscription_tier) }}
                  >
                    {user.subscription_tier}
                  </span>
                </td>
                <td>{formatDate(user.created_at)}</td>
                <td>{formatDate(user.last_active_at)}</td>
                <td>
                  <div className="action-buttons">
                    <button
                      onClick={() => handleUserEdit(user)}
                      className="btn small secondary"
                      title="Edit user"
                    >
                      ✏️
                    </button>
                    <button
                      className="btn small secondary"
                      title="View profile"
                    >
                      👁️
                    </button>
                    <button
                      className="btn small secondary"
                      title="Send email"
                    >
                      📧
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredUsers.length === 0 && !loading && (
          <div className="empty-state">
            <h3>No users found</h3>
            <p>Try adjusting your search or filter criteria</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="pagination">
        <div className="pagination-info">
          Showing {((pagination.page - 1) * pagination.limit) + 1} to{' '}
          {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
          {pagination.total} users
        </div>
        <div className="pagination-controls">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
            disabled={pagination.page === 1}
            className="btn small secondary"
          >
            ← Previous
          </button>
          <span className="page-info">
            Page {pagination.page} of {Math.ceil(pagination.total / pagination.limit)}
          </span>
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            disabled={pagination.page >= Math.ceil(pagination.total / pagination.limit)}
            className="btn small secondary"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}
    </div>
  );
};

export default UserManagement;