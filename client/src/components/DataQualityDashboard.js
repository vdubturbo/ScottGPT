/**
 * DataQualityDashboard - Overview component for data quality metrics
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import './DataQualityDashboard.css';

const DataQualityDashboard = ({ onClose }) => {
  const {
    loading,
    error,
    clearError,
    getDataQuality,
    getTimelineGaps,
    validateData
  } = useUserDataAPI();

  const [qualityData, setQualityData] = useState(null);
  const [timelineGaps, setTimelineGaps] = useState([]);
  const [validationResults, setValidationResults] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Load data quality information
  const loadQualityData = useCallback(async () => {
    try {
      const [quality, gaps, validation] = await Promise.all([
        getDataQuality(),
        getTimelineGaps(),
        validateData({ validateOnly: true })
      ]);
      
      setQualityData(quality);
      setTimelineGaps(gaps?.gaps || []); // gaps response has gaps array inside data
      setValidationResults(validation);
    } catch (err) {
      console.error('Failed to load quality data:', err);
    }
  }, [getDataQuality, getTimelineGaps, validateData]);

  // Initial load
  useEffect(() => {
    loadQualityData();
  }, [loadQualityData]);

  // Handle refresh
  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadQualityData();
    } finally {
      setRefreshing(false);
    }
  };

  // Calculate overall quality score
  const calculateOverallScore = () => {
    if (!qualityData) return 0;
    
    // Use the backend-provided overall score if available
    if (qualityData.qualitySummary?.overallScore !== undefined) {
      return qualityData.qualitySummary.overallScore / 100; // Convert from percentage to 0-1 range
    }
    
    if (qualityData.completenessScore !== undefined) {
      return qualityData.completenessScore / 100; // Convert from percentage to 0-1 range
    }
    
    return 0;
  };

  // Get quality color
  const getQualityColor = (score) => {
    if (score >= 0.8) return '#28a745';
    if (score >= 0.6) return '#ffc107';
    if (score >= 0.4) return '#fd7e14';
    return '#dc3545';
  };

  // Get quality grade
  const getQualityGrade = (score) => {
    if (score >= 0.9) return 'Excellent';
    if (score >= 0.8) return 'Good';
    if (score >= 0.6) return 'Fair';
    if (score >= 0.4) return 'Poor';
    return 'Critical';
  };

  // Format duration
  const formatDuration = (months) => {
    if (months < 12) {
      return `${months} month${months !== 1 ? 's' : ''}`;
    }
    const years = Math.floor(months / 12);
    const remainingMonths = months % 12;
    if (remainingMonths === 0) {
      return `${years} year${years !== 1 ? 's' : ''}`;
    }
    return `${years}y ${remainingMonths}m`;
  };

  // Render quality metric
  const renderQualityMetric = (name, value, description) => {
    const score = value || 0;
    const color = getQualityColor(score);
    
    return (
      <div className="quality-metric">
        <div className="metric-header">
          <h4 className="metric-name">{name}</h4>
          <div 
            className="metric-score"
            style={{ color }}
          >
            {Math.round(score * 100)}%
          </div>
        </div>
        <div className="metric-bar">
          <div 
            className="metric-fill"
            style={{ 
              width: `${score * 100}%`,
              backgroundColor: color
            }}
          ></div>
        </div>
        <div className="metric-description">{description}</div>
      </div>
    );
  };

  // Render issues section
  const renderIssues = () => {
    const allIssues = [];
    
    // Add validation errors and warnings from the actual response structure
    if (validationResults) {
      // Add overall issues
      validationResults.overall?.issues?.forEach(issue => {
        allIssues.push({
          type: issue.severity === 'critical' ? 'error' : 'warning',
          severity: issue.severity === 'critical' ? 'high' : 'medium',
          category: issue.category || 'Validation',
          message: issue.message
        });
      });
      
      // Add job-specific validation errors
      validationResults.jobs?.forEach(job => {
        job.validation?.errors?.forEach(error => {
          allIssues.push({
            type: 'error',
            severity: 'high',
            category: `${job.title} - Validation`,
            message: error.message,
            field: error.field
          });
        });
        
        job.validation?.warnings?.forEach(warning => {
          allIssues.push({
            type: 'warning',
            severity: 'medium',
            category: `${job.title} - Timeline`,
            message: warning.message,
            field: warning.field
          });
        });
      });
    }
    
    // Add timeline gaps
    timelineGaps.forEach(gap => {
      allIssues.push({
        type: 'gap',
        severity: gap.duration > 6 ? 'high' : 'medium',
        category: 'Timeline',
        message: `${formatDuration(gap.duration)} gap between positions`,
        period: `${gap.start} - ${gap.end}`
      });
    });
    
    // Add quality-based issues from backend data
    if (qualityData?.qualitySummary) {
      const summary = qualityData.qualitySummary;
      
      if (summary.criticalIssues > 0) {
        allIssues.push({
          type: 'quality',
          severity: 'high',
          category: 'Data Validation',
          message: `${summary.criticalIssues} critical data issues need immediate attention`
        });
      }
      
      if (summary.poorJobs > 0) {
        allIssues.push({
          type: 'quality',
          severity: summary.poorJobs > 5 ? 'high' : 'medium',
          category: 'Data Quality',
          message: `${summary.poorJobs} job entries have poor data quality`
        });
      }
      
      if (qualityData.healthMetrics?.jobs?.withDescriptions === 0 && qualityData.healthMetrics?.jobs?.total > 0) {
        allIssues.push({
          type: 'quality',
          severity: 'high',
          category: 'Completeness',
          message: 'No jobs have detailed descriptions - this significantly impacts search quality'
        });
      }
    }
    
    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2 };
    allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    
    return allIssues;
  };

  const overallScore = calculateOverallScore();
  const overallGrade = getQualityGrade(overallScore);
  const issues = renderIssues();

  // Keep a minimal debug for now
  console.log('Data Quality Dashboard rendering with score:', overallScore);

  return ReactDOM.createPortal(
    <div className="data-quality-overlay">
      <div className="data-quality-dashboard">
        <div className="dashboard-header">
          <h2>Data Quality Dashboard</h2>
          <div className="header-actions">
            <button 
              className="btn-refresh"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? '↻' : '⟲'} Refresh
            </button>
            <button className="close-button" onClick={onClose}>×</button>
          </div>
        </div>

        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button onClick={clearError}>×</button>
          </div>
        )}

        <div className="dashboard-content">
          {loading && !refreshing ? (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <span>Analyzing data quality...</span>
            </div>
          ) : (
            <>
              {/* Overall Quality Score */}
              <div className="overall-quality">
                <div className="quality-summary">
                  <div className="score-circle">
                    <div 
                      className="score-ring"
                      style={{ 
                        background: `conic-gradient(${getQualityColor(overallScore)} ${overallScore * 360}deg, #e9ecef 0deg)`
                      }}
                    >
                      <div className="score-content">
                        <div className="score-number">{Math.round(overallScore * 100)}</div>
                        <div className="score-label">Overall Score</div>
                      </div>
                    </div>
                  </div>
                  <div className="quality-details">
                    <div 
                      className="quality-grade"
                      style={{ color: getQualityColor(overallScore) }}
                    >
                      {qualityData?.qualitySummary?.grade || overallGrade}
                    </div>
                    <div className="quality-description">
                      {qualityData?.qualitySummary ? 
                        `Overall quality based on ${qualityData.healthMetrics?.jobs?.total || 0} job entries with ${qualityData.qualitySummary.warnings || 0} warnings and ${qualityData.qualitySummary.criticalIssues || 0} critical issues.` :
                        'Data quality assessment based on multiple factors including completeness, consistency, and accuracy.'}
                    </div>
                    {qualityData?.lastUpdated && (
                      <div className="last-updated">
                        Last updated: {new Date(qualityData.lastUpdated).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Stats */}
                <div className="quick-stats">
                  <div className="stat-item">
                    <div className="stat-number">
                      {qualityData?.healthMetrics?.jobs?.total || 0}
                    </div>
                    <div className="stat-label">Total Jobs</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">
                      {qualityData?.qualitySummary?.excellentJobs || 0}
                    </div>
                    <div className="stat-label">Excellent</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">
                      {timelineGaps.length}
                    </div>
                    <div className="stat-label">Gaps</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-number">
                      {(qualityData?.qualitySummary?.criticalIssues || 0) + (qualityData?.qualitySummary?.warnings || 0)}
                    </div>
                    <div className="stat-label">Issues</div>
                  </div>
                </div>
              </div>

              {/* Quality Metrics */}
              <div className="quality-metrics">
                <h3>Quality Metrics</h3>
                <div className="metrics-grid">
                  {qualityData && (
                    <>
                      {renderQualityMetric(
                        'Completeness',
                        (qualityData.completenessScore || 0) / 100,
                        'How much required information is present'
                      )}
                      {renderQualityMetric(
                        'Skills Coverage',
                        qualityData.healthMetrics?.jobs?.total > 0 
                          ? (qualityData.healthMetrics.jobs.withSkills || 0) / qualityData.healthMetrics.jobs.total 
                          : 0,
                        'Jobs with skills information'
                      )}
                      {renderQualityMetric(
                        'Description Coverage',
                        qualityData.healthMetrics?.jobs?.total > 0 
                          ? (qualityData.healthMetrics.jobs.withDescriptions || 0) / qualityData.healthMetrics.jobs.total 
                          : 0,
                        'Jobs with detailed descriptions'
                      )}
                      {renderQualityMetric(
                        'Location Coverage',
                        qualityData.healthMetrics?.jobs?.total > 0 
                          ? (qualityData.healthMetrics.jobs.withLocations || 0) / qualityData.healthMetrics.jobs.total 
                          : 0,
                        'Jobs with location information'
                      )}
                      {renderQualityMetric(
                        'Overall Quality',
                        (qualityData.qualitySummary?.overallScore || 0) / 100,
                        'Overall data quality assessment'
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Timeline Analysis */}
              {timelineGaps.length > 0 && (
                <div className="timeline-analysis">
                  <h3>Timeline Analysis</h3>
                  <div className="gaps-list">
                    {timelineGaps.map((gap, index) => (
                      <div key={index} className={`gap-item ${gap.duration > 6 ? 'significant' : ''}`}>
                        <div className="gap-header">
                          <div className="gap-duration">
                            {formatDuration(gap.duration)} gap
                          </div>
                          <div className={`gap-severity ${gap.duration > 12 ? 'high' : gap.duration > 6 ? 'medium' : 'low'}`}>
                            {gap.duration > 12 ? 'Long' : gap.duration > 6 ? 'Medium' : 'Short'}
                          </div>
                        </div>
                        <div className="gap-period">
                          {gap.start} → {gap.end}
                        </div>
                        {gap.suggestions && gap.suggestions.length > 0 && (
                          <div className="gap-suggestions">
                            <strong>Suggestions:</strong>
                            <ul>
                              {gap.suggestions.map((suggestion, i) => (
                                <li key={i}>
                                  {typeof suggestion === 'string' 
                                    ? suggestion 
                                    : `${suggestion.activity || suggestion.type}: ${suggestion.description}`
                                  }
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Issues and Recommendations */}
              {issues.length > 0 && (
                <div className="issues-section">
                  <h3>Issues & Recommendations</h3>
                  <div className="issues-list">
                    {issues.map((issue, index) => (
                      <div key={index} className={`issue-item ${issue.severity}`}>
                        <div className="issue-header">
                          <div className={`issue-type ${issue.type}`}>
                            {issue.type === 'error' && '⚠️'}
                            {issue.type === 'warning' && '💡'}
                            {issue.type === 'gap' && '📅'}
                            {issue.type === 'quality' && '📊'}
                          </div>
                          <div className="issue-category">{issue.category}</div>
                          <div className={`issue-severity ${issue.severity}`}>
                            {issue.severity}
                          </div>
                        </div>
                        <div className="issue-message">{issue.message}</div>
                        {issue.field && (
                          <div className="issue-field">Field: {issue.field}</div>
                        )}
                        {issue.period && (
                          <div className="issue-period">Period: {issue.period}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {qualityData?.recommendations && qualityData.recommendations.length > 0 && (
                <div className="recommendations-section">
                  <h3>Improvement Recommendations</h3>
                  <div className="recommendations-list">
                    {qualityData.recommendations.map((rec, index) => (
                      <div key={index} className={`recommendation-item ${rec.priority}`}>
                        <div className="recommendation-header">
                          <div className={`priority-badge ${rec.priority}`}>
                            {rec.priority} priority
                          </div>
                          <div className="recommendation-category">{rec.category}</div>
                        </div>
                        <div className="recommendation-title">{rec.title}</div>
                        <div className="recommendation-description">{rec.description}</div>
                        {rec.estimatedImpact && (
                          <div className="recommendation-impact">
                            Expected improvement: {rec.estimatedImpact}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* No Issues State */}
              {issues.length === 0 && overallScore > 0.8 && (
                <div className="no-issues">
                  <div className="no-issues-icon">✨</div>
                  <h3>Excellent Data Quality!</h3>
                  <p>Your work history data looks great with no major issues detected.</p>
                </div>
              )}
              
              {/* Low quality but no critical issues */}
              {issues.length === 0 && overallScore <= 0.8 && overallScore > 0 && (
                <div className="no-issues">
                  <div className="no-issues-icon">📊</div>
                  <h3>Data Analysis Complete</h3>
                  <p>Your work history has been analyzed. While no critical issues were detected, there may be opportunities for improvement in the quality metrics above.</p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default DataQualityDashboard;