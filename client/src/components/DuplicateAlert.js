/**
 * DuplicateAlert - Alert component for duplicate detection notifications
 */

import React from 'react';
import './DuplicateAlert.css';

const DuplicateAlert = ({ summary, onDismiss, onViewDuplicates }) => {
  if (!summary || summary.estimatedDuplicates === 0) {
    return null;
  }

  const handleViewDuplicates = () => {
    if (onViewDuplicates) {
      onViewDuplicates();
    }
  };

  return (
    <div className="duplicate-alert">
      <div className="alert-icon">🔍</div>
      <div className="alert-content">
        <div className="alert-title">
          Potential Duplicates Found
        </div>
        <div className="alert-message">
          Found {summary.estimatedDuplicates} potential duplicate{summary.estimatedDuplicates !== 1 ? 's' : ''} 
          {summary.highConfidenceDuplicates > 0 && (
            <span className="high-confidence">
              {' '}({summary.highConfidenceDuplicates} high confidence)
            </span>
          )}
          {summary.potentialTimeSavings && (
            <span className="time-savings">
              {' '}• {summary.potentialTimeSavings} could be saved
            </span>
          )}
        </div>
        {summary.recommendations && summary.recommendations.length > 0 && (
          <div className="alert-recommendations">
            {summary.recommendations.map((rec, index) => (
              <div key={index} className="recommendation">
                {rec.message}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="alert-actions">
        {onViewDuplicates && (
          <button 
            className="btn-view-duplicates"
            onClick={handleViewDuplicates}
          >
            Review Duplicates
          </button>
        )}
        <button 
          className="btn-dismiss"
          onClick={onDismiss}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  );
};

export default DuplicateAlert;