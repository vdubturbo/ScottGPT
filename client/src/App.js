// client/src/App.js
// Multi-tenant SaaS App with authentication and routing

import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import AuthProvider, { useAuth } from './contexts/AuthContext';
import LoginForm from './components/auth/LoginForm';
import RegisterForm from './components/auth/RegisterForm';
import Dashboard from './components/Dashboard';
import PublicProfile from './components/PublicProfile';
import AdminDashboard from './components/AdminDashboard';
import LandingPage from './components/LandingPage';
import DiagnosticTest from './components/DiagnosticTest';
import LandingPageNoModal from './components/LandingPageNoModal';
import UltraMinimal from './components/UltraMinimal';
import LandingPageFixed from './components/LandingPageFixed';
import LandingPageSimple from './components/LandingPageSimple';
import StepByStep from './components/StepByStep';
import LoadingSpinner from './components/LoadingSpinner';
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
            <ProtectedRoute requireRole="admin">
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Public Profile Routes */}
        <Route path="/profile/:slug" element={<PublicProfile />} />

        {/* Dynamic Profile Routes (URL slug routing) */}
        <Route path="/:slug" element={<PublicProfile />} />

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
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;