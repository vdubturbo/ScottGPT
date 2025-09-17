// client/src/components/admin/AdminRoute.js
// Protected route component for admin access

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../LoadingSpinner';
import AdminLayout from './AdminLayout';

const AdminRoute = ({ children }) => {
  const { user, loading, isAdmin } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        background: '#f8fafc'
      }}>
        <LoadingSpinner message="Verifying admin access..." />
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Redirect to dashboard if not admin
  if (!isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render admin content within AdminLayout
  return (
    <AdminLayout>
      {children}
    </AdminLayout>
  );
};

export default AdminRoute;