// client/src/components/admin/ComingSoon.js
// Placeholder component for admin pages under development

import React from 'react';
import './ComingSoon.css';

const ComingSoon = ({ title, description, features }) => {
  return (
    <div className="coming-soon">
      <div className="coming-soon-content">
        <div className="coming-soon-icon">🚧</div>
        <h1>{title}</h1>
        <p className="coming-soon-description">{description}</p>

        {features && (
          <div className="planned-features">
            <h3>Planned Features:</h3>
            <ul>
              {features.map((feature, index) => (
                <li key={index}>{feature}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="development-status">
          <div className="status-item">
            <span className="status-label">Status:</span>
            <span className="status-value in-progress">In Development</span>
          </div>
          <div className="status-item">
            <span className="status-label">Priority:</span>
            <span className="status-value high">High</span>
          </div>
          <div className="status-item">
            <span className="status-label">ETA:</span>
            <span className="status-value">Coming Soon</span>
          </div>
        </div>

        <div className="coming-soon-actions">
          <button className="btn primary">
            📧 Notify When Ready
          </button>
          <button className="btn secondary">
            📋 View Roadmap
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComingSoon;