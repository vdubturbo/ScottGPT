/**
 * UserDataManager - Main container component for user data management
 */

import React, { useState } from 'react'; // Modern navigation update
import WorkHistoryManager from './WorkHistoryManager';
import DuplicateManager from './DuplicateManager';
import DataQualityDashboard from './DataQualityDashboard';
import './UserDataManager.css';

const UserDataManager = () => {
  const [activeView, setActiveView] = useState('history');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showQuality, setShowQuality] = useState(false);

  const handleViewDuplicates = () => {
    setShowDuplicates(true);
  };

  const handleViewQuality = () => {
    setShowQuality(true);
  };

  return (
    <div className="user-data-manager">
      <div className="manager-header">
        <h2>Data Management</h2>
        <p>Manage your work history, detect duplicates, and monitor data quality</p>
      </div>

      <div className="modern-nav-container">
        <nav className="modern-nav">
          <div className="nav-group primary-nav">
            <button
              className={`nav-item ${activeView === 'history' ? 'active' : ''}`}
              onClick={() => setActiveView('history')}
            >
              <div className="nav-icon">📝</div>
              <span className="nav-label">Work History</span>
              <div className="nav-indicator"></div>
            </button>
          </div>
          
          <div className="nav-group secondary-nav">
            <button
              className="nav-item action-item"
              onClick={handleViewDuplicates}
            >
              <div className="nav-icon">🔍</div>
              <span className="nav-label">Find Duplicates</span>
            </button>
            <button
              className="nav-item action-item"
              onClick={handleViewQuality}
            >
              <div className="nav-icon">📊</div>
              <span className="nav-label">Data Quality</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="manager-content">
        {activeView === 'history' && (
          <WorkHistoryManager onViewDuplicates={handleViewDuplicates} />
        )}
      </div>

      {showDuplicates && (
        <DuplicateManager onClose={() => setShowDuplicates(false)} />
      )}

      {showQuality && (
        <DataQualityDashboard onClose={() => setShowQuality(false)} />
      )}
    </div>
  );
};

export default UserDataManager;