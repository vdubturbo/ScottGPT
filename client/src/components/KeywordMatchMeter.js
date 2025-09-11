// client/src/components/KeywordMatchMeter.js
// Progress bar showing keyword match score

import React from 'react';
import * as Progress from '@radix-ui/react-progress';
import './KeywordMatchMeter.css';

const KeywordMatchMeter = ({ score = 0 }) => {
  const getScoreColor = (score) => {
    if (score >= 80) return '#10b981'; // green
    if (score >= 60) return '#f59e0b'; // yellow
    if (score >= 40) return '#f97316'; // orange
    return '#ef4444'; // red
  };

  const getScoreLabel = (score) => {
    if (score >= 80) return 'Excellent';
    if (score >= 60) return 'Good';
    if (score >= 40) return 'Fair';
    return 'Needs Improvement';
  };

  return (
    <div className="keyword-match-meter">
      <div className="meter-header">
        <span className="meter-label">
          Keyword Match
        </span>
        <span className="meter-score">
          {score}%
        </span>
      </div>
      
      <Progress.Root 
        className="progress-root" 
        value={score}
        max={100}
        aria-label={`Keyword match score: ${score}%`}
      >
        <Progress.Indicator
          className="progress-indicator"
          style={{
            transform: `translateX(-${100 - score}%)`,
            backgroundColor: getScoreColor(score)
          }}
        />
      </Progress.Root>
      
      <div className="meter-footer">
        <span 
          className="meter-status"
          style={{ color: getScoreColor(score) }}
        >
          {getScoreLabel(score)}
        </span>
      </div>
    </div>
  );
};

export default KeywordMatchMeter;