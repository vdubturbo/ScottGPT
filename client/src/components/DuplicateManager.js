/**
 * DuplicateManager - Component for duplicate detection and merging UI
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import MergePreview from './MergePreview';
import './DuplicateManager.css';

const DuplicateManager = ({ onClose }) => {
  const {
    loading,
    error,
    clearError,
    detectDuplicates,
    getMergeCandidates,
    previewMerge,
    executeMerge,
    undoMerge,
    autoMerge
  } = useUserDataAPI();

  const [duplicates, setDuplicates] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [mergePreview, setMergePreview] = useState(null);
  const [view, setView] = useState('groups'); // groups, candidates, history
  const [candidates, setCandidates] = useState([]);
  const [mergeHistory, setMergeHistory] = useState([]);
  const [filters, setFilters] = useState({
    confidenceLevel: 'all',
    sortBy: 'confidence'
  });

  // Load duplicate data
  const loadDuplicates = useCallback(async () => {
    try {
      const result = await detectDuplicates({
        threshold: 0.7,
        includePreview: false,
        groupBy: 'similarity'
      });
      
      setDuplicates(result.duplicateGroups || []);
      setSummary(result.summary || {});
    } catch (err) {
      console.error('Failed to load duplicates:', err);
    }
  }, [detectDuplicates]);

  // Load merge candidates
  const loadCandidates = useCallback(async () => {
    try {
      const result = await getMergeCandidates({
        confidenceLevel: filters.confidenceLevel,
        sortBy: filters.sortBy,
        includeRisks: true
      });
      
      setCandidates(result.candidates || []);
    } catch (err) {
      console.error('Failed to load candidates:', err);
    }
  }, [getMergeCandidates, filters]);

  // Initial load
  useEffect(() => {
    loadDuplicates();
  }, [loadDuplicates]);

  // Load candidates when view changes
  useEffect(() => {
    if (view === 'candidates') {
      loadCandidates();
    }
  }, [view, loadCandidates]);

  // Handle group selection
  const handleGroupSelect = (group) => {
    setSelectedGroup(group);
  };

  // Handle merge preview
  const handlePreviewMerge = async (sourceJob, targetJob, options = {}) => {
    try {
      const preview = await previewMerge(sourceJob.id, targetJob.id, options);
      setMergePreview({
        sourceJob,
        targetJob,
        preview,
        options
      });
      setShowPreview(true);
    } catch (err) {
      console.error('Failed to preview merge:', err);
    }
  };

  // Handle merge execution
  const handleExecuteMerge = async (sourceId, targetId, options = {}) => {
    try {
      const result = await executeMerge(sourceId, targetId, options);
      setShowPreview(false);
      setMergePreview(null);
      
      // Refresh data
      await loadDuplicates();
      if (view === 'candidates') {
        await loadCandidates();
      }
      
      return result;
    } catch (err) {
      console.error('Failed to execute merge:', err);
      throw err;
    }
  };

  // Handle auto-merge
  const handleAutoMerge = async () => {
    try {
      const result = await autoMerge({
        confidenceThreshold: 0.95,
        maxMerges: 5,
        confirmed: true
      });
      
      // Refresh data
      await loadDuplicates();
      if (view === 'candidates') {
        await loadCandidates();
      }
      
      return result;
    } catch (err) {
      console.error('Failed to auto-merge:', err);
      throw err;
    }
  };

  // Handle undo merge
  const handleUndoMerge = async (mergeId) => {
    try {
      await undoMerge(mergeId);
      
      // Refresh data
      await loadDuplicates();
      if (view === 'candidates') {
        await loadCandidates();
      }
    } catch (err) {
      console.error('Failed to undo merge:', err);
    }
  };

  // Format confidence level
  const formatConfidence = (confidence) => {
    const level = confidence.level || 'unknown';
    const score = Math.round((confidence.score || 0) * 100);
    
    const levelColors = {
      very_high: '#28a745',
      high: '#ffc107',
      medium: '#fd7e14',
      low: '#6c757d'
    };
    
    return {
      level: level.replace('_', ' ').toUpperCase(),
      score,
      color: levelColors[level] || '#6c757d'
    };
  };

  // Render duplicate groups view
  const renderGroupsView = () => (
    <div className="groups-view">
      <div className="groups-header">
        <h3>Duplicate Groups</h3>
        <div className="groups-summary">
          {summary && (
            <>
              <span className="summary-item">
                {summary.duplicateGroups || 0} groups found
              </span>
              <span className="summary-item">
                {summary.totalDuplicates || 0} total duplicates
              </span>
              {summary.autoMergeable > 0 && (
                <span className="summary-item auto-mergeable">
                  {summary.autoMergeable} auto-mergeable
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {summary && summary.autoMergeable > 0 && (
        <div className="auto-merge-banner">
          <div className="banner-content">
            <span className="banner-icon">🤖</span>
            <div className="banner-text">
              <strong>{summary.autoMergeable} high-confidence duplicates</strong> can be automatically merged
              {summary.potentialTimeSavings && (
                <span> • Save {summary.potentialTimeSavings}</span>
              )}
            </div>
          </div>
          <button
            className="btn-auto-merge"
            onClick={handleAutoMerge}
            disabled={loading}
          >
            {loading ? 'Processing...' : 'Auto-Merge'}
          </button>
        </div>
      )}

      <div className="duplicate-groups">
        {duplicates.map((group, index) => (
          <div
            key={index}
            className={`duplicate-group ${selectedGroup === group ? 'selected' : ''}`}
            onClick={() => handleGroupSelect(group)}
          >
            <div className="group-header">
              <div className="group-type">
                <span className={`type-badge ${group.type}`}>
                  {group.type.replace('_', ' ')}
                </span>
                <span className="similarity-score">
                  {Math.round(group.groupSimilarity * 100)}% similarity
                </span>
              </div>
              <div className="group-count">
                {group.duplicates.length} duplicate{group.duplicates.length !== 1 ? 's' : ''}
              </div>
            </div>

            <div className="primary-job">
              <div className="job-info">
                <h4>{group.primaryJob.job.title}</h4>
                <span className="job-org">at {group.primaryJob.job.org}</span>
                <span className="job-dates">
                  {group.primaryJob.job.date_start} - {group.primaryJob.job.date_end || 'Present'}
                </span>
              </div>
              <div className="chunk-count">
                {group.primaryJob.chunkCount} chunks
              </div>
            </div>

            <div className="duplicate-jobs">
              {group.duplicates.map((duplicate, dupIndex) => {
                const confidence = formatConfidence(duplicate.confidence);
                
                return (
                  <div key={dupIndex} className="duplicate-job">
                    <div className="job-info">
                      <h5>{duplicate.job.title}</h5>
                      <span className="job-org">at {duplicate.job.org}</span>
                      <span className="job-dates">
                        {duplicate.job.date_start} - {duplicate.job.date_end || 'Present'}
                      </span>
                    </div>
                    <div className="duplicate-meta">
                      <div 
                        className="confidence-badge"
                        style={{ backgroundColor: confidence.color }}
                      >
                        {confidence.level} ({confidence.score}%)
                      </div>
                      <div className="chunk-count">
                        {duplicate.chunkCount} chunks
                      </div>
                    </div>
                    <div className="duplicate-actions">
                      <button
                        className="btn-preview"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePreviewMerge(duplicate.job, group.primaryJob.job);
                        }}
                      >
                        Preview Merge
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {group.mergeRecommendation && (
              <div className="group-recommendation">
                <div className="recommendation-header">
                  <span className="recommendation-icon">💡</span>
                  <strong>Recommendation:</strong>
                </div>
                <div className="recommendation-actions">
                  {group.mergeRecommendation.actions.map((action, actionIndex) => (
                    <div key={actionIndex} className="recommendation-action">
                      <span className="action-text">{action.reason}</span>
                      <span className={`priority-badge ${action.priority}`}>
                        {action.priority} priority
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {duplicates.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">✨</div>
          <h3>No Duplicates Found</h3>
          <p>Your work history data looks clean! No duplicate entries were detected.</p>
        </div>
      )}
    </div>
  );

  // Render candidates view
  const renderCandidatesView = () => (
    <div className="candidates-view">
      <div className="candidates-header">
        <h3>Merge Candidates</h3>
        <div className="candidates-filters">
          <select
            value={filters.confidenceLevel}
            onChange={(e) => setFilters(prev => ({ ...prev, confidenceLevel: e.target.value }))}
          >
            <option value="all">All Confidence Levels</option>
            <option value="very_high">Very High</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          
          <select
            value={filters.sortBy}
            onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
          >
            <option value="confidence">Sort by Confidence</option>
            <option value="similarity">Sort by Similarity</option>
            <option value="risk">Sort by Risk</option>
          </select>
        </div>
      </div>

      <div className="candidates-list">
        {candidates.map((candidate, index) => {
          const confidence = formatConfidence(candidate.confidence);
          
          return (
            <div key={candidate.id} className="candidate-item">
              <div className="candidate-header">
                <div 
                  className="confidence-indicator"
                  style={{ backgroundColor: confidence.color }}
                >
                  {confidence.score}%
                </div>
                <div className="candidate-type">
                  {candidate.groupType.replace('_', ' ')}
                </div>
                {candidate.autoMergeable && (
                  <span className="auto-mergeable-badge">Auto-mergeable</span>
                )}
              </div>

              <div className="candidate-jobs">
                <div className="source-job">
                  <h4>{candidate.sourceJob.title}</h4>
                  <span className="job-org">at {candidate.sourceJob.org}</span>
                  <span className="job-dates">{candidate.sourceJob.dateRange}</span>
                </div>
                
                <div className="merge-arrow">→</div>
                
                <div className="target-job">
                  <h4>{candidate.targetJob.title}</h4>
                  <span className="job-org">at {candidate.targetJob.org}</span>
                  <span className="job-dates">{candidate.targetJob.dateRange}</span>
                </div>
              </div>

              <div className="similarity-breakdown">
                <div className="similarity-item">
                  <span>Company:</span>
                  <span>{Math.round(candidate.similarity.company * 100)}%</span>
                </div>
                <div className="similarity-item">
                  <span>Title:</span>
                  <span>{Math.round(candidate.similarity.title * 100)}%</span>
                </div>
                <div className="similarity-item">
                  <span>Dates:</span>
                  <span>{Math.round(candidate.similarity.dates * 100)}%</span>
                </div>
                <div className="similarity-item">
                  <span>Content:</span>
                  <span>{Math.round(candidate.similarity.content * 100)}%</span>
                </div>
              </div>

              {candidate.risks && candidate.risks.length > 0 && (
                <div className="candidate-risks">
                  <span className="risks-label">Risks:</span>
                  {candidate.risks.map((risk, riskIndex) => (
                    <span key={riskIndex} className={`risk-badge ${risk.severity}`}>
                      {risk.type.replace('_', ' ')}
                    </span>
                  ))}
                </div>
              )}

              <div className="candidate-actions">
                <button
                  className="btn-preview"
                  onClick={() => handlePreviewMerge(candidate.sourceJob, candidate.targetJob)}
                >
                  Preview Merge
                </button>
                {candidate.autoMergeable && (
                  <button
                    className="btn-auto-merge-single"
                    onClick={() => handleExecuteMerge(candidate.sourceJob.id, candidate.targetJob.id)}
                    disabled={loading}
                  >
                    Auto-Merge
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {candidates.length === 0 && !loading && (
        <div className="empty-state">
          <div className="empty-icon">🎯</div>
          <h3>No Candidates Found</h3>
          <p>No merge candidates match the current filters.</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="duplicate-manager-overlay">
      <div className="duplicate-manager">
        <div className="manager-header">
          <h2>Duplicate Management</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button onClick={clearError}>×</button>
          </div>
        )}

        <div className="manager-nav">
          <button
            className={view === 'groups' ? 'active' : ''}
            onClick={() => setView('groups')}
          >
            Duplicate Groups
          </button>
          <button
            className={view === 'candidates' ? 'active' : ''}
            onClick={() => setView('candidates')}
          >
            Merge Candidates
          </button>
        </div>

        <div className="manager-content">
          {loading && (
            <div className="loading-state">
              <div className="loading-spinner"></div>
              <span>Analyzing duplicates...</span>
            </div>
          )}

          {!loading && view === 'groups' && renderGroupsView()}
          {!loading && view === 'candidates' && renderCandidatesView()}
        </div>

        {showPreview && mergePreview && (
          <MergePreview
            preview={mergePreview}
            onExecute={handleExecuteMerge}
            onCancel={() => {
              setShowPreview(false);
              setMergePreview(null);
            }}
          />
        )}
      </div>
    </div>
  );
};

export default DuplicateManager;