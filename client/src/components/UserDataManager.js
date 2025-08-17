/**
 * UserDataManager - Main container component for user data management
 */

import React, { useState } from 'react';
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

      <div className="manager-nav">
        <button
          className={activeView === 'history' ? 'active' : ''}
          onClick={() => setActiveView('history')}
        >
          📝 Work History
        </button>
        <button
          className="nav-action"
          onClick={handleViewDuplicates}
        >
          🔍 Find Duplicates
        </button>
        <button
          className="nav-action"
          onClick={handleViewQuality}
        >
          📊 Data Quality
        </button>
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