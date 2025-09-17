// client/src/App.js
// Multi-tenant SaaS App with authentication and routing

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { useAuth } from './contexts/AuthContext';
import { BillingProvider } from './contexts/BillingContext';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import Dashboard from './components/Dashboard';
import PublicProfile from './components/PublicProfile';
import AdminRoute from './components/admin/AdminRoute';
import AdminDashboard from './components/admin/AdminDashboard';
import UserManagement from './components/admin/UserManagement';
import ComingSoon from './components/admin/ComingSoon';
import LandingPage from './components/LandingPage';
import DiagnosticTest from './components/DiagnosticTest';
import LandingPageNoModal from './components/LandingPageNoModal';
import UltraMinimal from './components/UltraMinimal';
import LandingPageFixed from './components/LandingPageFixed';
import LandingPageSimple from './components/LandingPageSimple';
import StepByStep from './components/StepByStep';
import LoadingSpinner from './components/LoadingSpinner';
import { BillingDashboard, PricingTiers } from './components/billing';
import './App.css';

// Protected Route Component
const ProtectedRoute = ({ children, requireRole = null }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requireRole && user.profile?.role !== requireRole) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Public Route (redirect if already authenticated)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

// Main App Component
const AppContent = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <div>
      <Routes>
        {/* Public Routes */}
        <Route 
          path="/login" 
          element={
            <PublicRoute>
              <div className="auth-page">
                <LoginForm 
                  onSuccess={(user, redirectTo) => {
                    window.location.href = redirectTo;
                  }} 
                />
              </div>
            </PublicRoute>
          } 
        />
        
        <Route 
          path="/register" 
          element={
            <PublicRoute>
              <div className="auth-page">
                <RegisterForm 
                  onSuccess={(result, redirectTo) => {
                    if (result.success) {
                      // Show success message and redirect to login
                      alert('Registration successful! Please check your email to verify your account.');
                      window.location.href = '/login';
                    }
                  }} 
                />
              </div>
            </PublicRoute>
          } 
        />

        {/* Protected Routes */}
        <Route 
          path="/dashboard" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />

        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />

        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <BillingDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/pricing"
          element={<PricingTiers />}
        />

        {/* Admin Routes - must come before profile slug routing */}
        <Route
          path="/vdubturboadmin"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/vdubturboadmin/users"
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          }
        />
        <Route
          path="/vdubturboadmin/subscriptions"
          element={
            <AdminRoute>
              <ComingSoon
                title="Subscription Management"
                description="Comprehensive billing and subscription management for the ScottGPT platform."
                features={[
                  'Revenue dashboard with key metrics',
                  'Payment issue alerts and resolution',
                  'Refund processing workflows',
                  'Subscription analytics and reporting',
                  'Individual subscription editing',
                  'Churn analysis and retention tools'
                ]}
              />
            </AdminRoute>
          }
        />
        <Route
          path="/vdubturboadmin/analytics"
          element={
            <AdminRoute>
              <ComingSoon
                title="Analytics Dashboard"
                description="Advanced analytics and reporting for platform insights and business intelligence."
                features={[
                  'User growth and engagement charts',
                  'Revenue metrics (MRR, ARR, conversion)',
                  'Usage analytics and feature adoption',
                  'Platform health and performance metrics',
                  'Custom reports and data exports',
                  'Real-time dashboard updates'
                ]}
              />
            </AdminRoute>
          }
        />
        <Route
          path="/vdubturboadmin/audit"
          element={
            <AdminRoute>
              <ComingSoon
                title="Audit Logs"
                description="Comprehensive audit trail and activity logging for security and compliance."
                features={[
                  'Searchable admin action history',
                  'User activity timeline tracking',
                  'Security event monitoring',
                  'Compliance report generation',
                  'Data export for auditing',
                  'Real-time activity alerts'
                ]}
              />
            </AdminRoute>
          }
        />
        <Route
          path="/vdubturboadmin/system"
          element={
            <AdminRoute>
              <ComingSoon
                title="System Health"
                description="Platform monitoring, performance metrics, and system health dashboard."
                features={[
                  'Real-time performance monitoring',
                  'Server health and uptime tracking',
                  'Error rate and response time metrics',
                  'Database performance insights',
                  'API endpoint health checks',
                  'Automated alert notifications'
                ]}
              />
            </AdminRoute>
          }
        />

        {/* Public Profile Routes */}
        <Route path="/profile/:slug" element={<PublicProfile />} />

        {/* Dynamic Profile Routes (URL slug routing) - exclude reserved paths */}
        <Route
          path="/:slug"
          element={<PublicProfile />}
        />

        {/* Default Route - Complete Landing Page */}
        <Route 
          path="/" 
          element={<LandingPage />}
        />

        {/* 404 Route */}
        <Route 
          path="*" 
          element={
            <div className="not-found">
              <h1>Page Not Found</h1>
              <p>The page you're looking for doesn't exist.</p>
            </div>
          } 
        />
      </Routes>
    </div>
  );
};

// Main App with Context Providers
function App() {
  return (
    <AuthProvider>
      <BillingProvider>
        <Router>
          <AppContent />
        </Router>
      </BillingProvider>
    </AuthProvider>
  );
}

export default App;