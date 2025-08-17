/**
 * MergePreview - Component for previewing and executing merge operations
 */

import React, { useState } from 'react';
import './MergePreview.css';

const MergePreview = ({ preview, onExecute, onCancel }) => {
  const [isExecuting, setIsExecuting] = useState(false);
  const [customOptions, setCustomOptions] = useState(preview.options || {});

  if (!preview || !preview.preview) {
    return null;
  }

  const {
    sourceJob,
    targetJob,
    preview: previewData,
    options = {}
  } = preview;

  const {
    mergedResult,
    changes,
    fieldMappings
  } = previewData.preview;

  const {
    quality,
    risks = [],
    impact,
    recommendations = []
  } = previewData.analysis;

  // Handle merge execution
  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      await onExecute(sourceJob.id, targetJob.id, customOptions);
    } catch (err) {
      console.error('Merge execution failed:', err);
    } finally {
      setIsExecuting(false);
    }
  };

  // Format field strategy options
  const strategyOptions = [
    { value: 'prefer_detailed', label: 'Prefer Detailed' },
    { value: 'prefer_complete', label: 'Prefer Complete' },
    { value: 'prefer_longest', label: 'Prefer Longest' },
    { value: 'prefer_source', label: 'Prefer Source' },
    { value: 'prefer_target', label: 'Prefer Target' },
    { value: 'merge_unique', label: 'Merge Unique' }
  ];

  // Handle strategy change
  const handleStrategyChange = (field, strategy) => {
    setCustomOptions(prev => ({
      ...prev,
      fieldStrategies: {
        ...prev.fieldStrategies,
        [field]: strategy
      }
    }));
  };

  // Get quality color
  const getQualityColor = (score) => {
    if (score >= 0.8) return '#28a745';
    if (score >= 0.6) return '#ffc107';
    if (score >= 0.4) return '#fd7e14';
    return '#dc3545';
  };

  // Get risk severity color
  const getRiskColor = (severity) => {
    const colors = {
      high: '#dc3545',
      medium: '#ffc107',
      low: '#28a745'
    };
    return colors[severity] || '#6c757d';
  };

  return (
    <div className="merge-preview-overlay">
      <div className="merge-preview">
        <div className="preview-header">
          <h2>Merge Preview</h2>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        <div className="preview-content">
          {/* Source and Target Jobs */}
          <div className="jobs-comparison">
            <div className="source-job">
              <h3>Source Job (will be merged into target)</h3>
              <div className="job-card">
                <h4>{sourceJob.title}</h4>
                <div className="job-org">at {sourceJob.org}</div>
                <div className="job-dates">
                  {sourceJob.date_start} - {sourceJob.date_end || 'Present'}
                </div>
                {sourceJob.description && (
                  <div className="job-description">
                    {sourceJob.description.slice(0, 200)}
                    {sourceJob.description.length > 200 && '...'}
                  </div>
                )}
                {sourceJob.skills && sourceJob.skills.length > 0 && (
                  <div className="job-skills">
                    {sourceJob.skills.slice(0, 5).map((skill, i) => (
                      <span key={i} className="skill-tag">{skill}</span>
                    ))}
                    {sourceJob.skills.length > 5 && (
                      <span className="skill-count">+{sourceJob.skills.length - 5} more</span>
                    )}
                  </div>
                )}
                <div className="chunk-info">
                  {sourceJob.chunkCount || 0} content chunks
                </div>
              </div>
            </div>

            <div className="merge-arrow">
              <span>→</span>
              <div className="merge-label">MERGE INTO</div>
            </div>

            <div className="target-job">
              <h3>Target Job (will be updated)</h3>
              <div className="job-card">
                <h4>{targetJob.title}</h4>
                <div className="job-org">at {targetJob.org}</div>
                <div className="job-dates">
                  {targetJob.date_start} - {targetJob.date_end || 'Present'}
                </div>
                {targetJob.description && (
                  <div className="job-description">
                    {targetJob.description.slice(0, 200)}
                    {targetJob.description.length > 200 && '...'}
                  </div>
                )}
                {targetJob.skills && targetJob.skills.length > 0 && (
                  <div className="job-skills">
                    {targetJob.skills.slice(0, 5).map((skill, i) => (
                      <span key={i} className="skill-tag">{skill}</span>
                    ))}
                    {targetJob.skills.length > 5 && (
                      <span className="skill-count">+{targetJob.skills.length - 5} more</span>
                    )}
                  </div>
                )}
                <div className="chunk-info">
                  {targetJob.chunkCount || 0} content chunks
                </div>
              </div>
            </div>
          </div>

          {/* Merge Quality Assessment */}
          <div className="quality-assessment">
            <h3>Merge Quality Assessment</h3>
            <div className="quality-score">
              <div className="score-circle">
                <div 
                  className="score-fill"
                  style={{ 
                    background: getQualityColor(quality.score),
                    transform: `rotate(${quality.score * 180}deg)`
                  }}
                ></div>
                <div className="score-text">
                  <span className="score-number">{Math.round(quality.score * 100)}</span>
                  <span className="score-label">%</span>
                </div>
              </div>
              <div className="score-details">
                <div className="score-grade" style={{ color: getQualityColor(quality.score) }}>
                  {quality.grade}
                </div>
                <div className="score-factors">
                  {quality.factors.map((factor, index) => (
                    <div key={index} className="factor-item">
                      ✓ {factor}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Risk Assessment */}
          {risks.length > 0 && (
            <div className="risk-assessment">
              <h3>Risk Assessment</h3>
              <div className="risks-list">
                {risks.map((risk, index) => (
                  <div key={index} className="risk-item">
                    <div 
                      className="risk-severity"
                      style={{ backgroundColor: getRiskColor(risk.severity) }}
                    >
                      {risk.severity.toUpperCase()}
                    </div>
                    <div className="risk-content">
                      <div className="risk-type">{risk.type.replace('_', ' ')}</div>
                      <div className="risk-message">{risk.message}</div>
                      {risk.details && (
                        <div className="risk-details">{risk.details}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Field Mappings and Strategies */}
          <div className="field-mappings">
            <h3>Field Merge Strategies</h3>
            <div className="mappings-list">
              {Object.entries(fieldMappings).map(([field, mapping]) => (
                <div key={field} className="mapping-item">
                  <div className="field-header">
                    <label className="field-name">{field.replace('_', ' ')}</label>
                    <select
                      value={customOptions.fieldStrategies?.[field] || mapping.strategy}
                      onChange={(e) => handleStrategyChange(field, e.target.value)}
                      className="strategy-select"
                    >
                      {strategyOptions.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="field-comparison">
                    <div className="source-value">
                      <div className="value-label">Source:</div>
                      <div className="value-content">
                        {Array.isArray(mapping.source) 
                          ? mapping.source.join(', ') 
                          : mapping.source || '(empty)'
                        }
                      </div>
                    </div>
                    
                    <div className="target-value">
                      <div className="value-label">Target:</div>
                      <div className="value-content">
                        {Array.isArray(mapping.target) 
                          ? mapping.target.join(', ') 
                          : mapping.target || '(empty)'
                        }
                      </div>
                    </div>
                    
                    <div className={`merged-value ${mapping.changed ? 'changed' : ''}`}>
                      <div className="value-label">
                        Result: {mapping.changed && <span className="changed-indicator">Changed</span>}
                      </div>
                      <div className="value-content">
                        {Array.isArray(mapping.merged) 
                          ? mapping.merged.join(', ') 
                          : mapping.merged || '(empty)'
                        }
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Changes Summary */}
          {changes.changedFields.length > 0 && (
            <div className="changes-summary">
              <h3>Changes Summary</h3>
              <div className="changes-list">
                {Object.entries(changes.changes).map(([field, change]) => (
                  <div key={field} className="change-item">
                    <div className="change-field">{field.replace('_', ' ')}</div>
                    <div className="change-type">{change.changeType}</div>
                    <div className="change-details">
                      <div className="change-from">
                        <span className="change-label">From:</span>
                        {Array.isArray(change.from) 
                          ? change.from.join(', ') 
                          : change.from || '(empty)'
                        }
                      </div>
                      <div className="change-to">
                        <span className="change-label">To:</span>
                        {Array.isArray(change.to) 
                          ? change.to.join(', ') 
                          : change.to || '(empty)'
                        }
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Impact Analysis */}
          {impact && (
            <div className="impact-analysis">
              <h3>Impact Analysis</h3>
              <div className="impact-grid">
                {impact.contentChunks && (
                  <div className="impact-item">
                    <div className="impact-label">Content Chunks</div>
                    <div className="impact-value">
                      {impact.contentChunks.total} total 
                      ({impact.contentChunks.additional} additional)
                    </div>
                  </div>
                )}
                
                {impact.embeddingRegeneration && (
                  <div className="impact-item">
                    <div className="impact-label">Embeddings Update</div>
                    <div className="impact-value">
                      {impact.embeddingRegeneration.chunksToUpdate} chunks 
                      (~{impact.embeddingRegeneration.estimatedTime})
                    </div>
                  </div>
                )}
                
                {impact.storageImpact && (
                  <div className="impact-item">
                    <div className="impact-label">Storage Impact</div>
                    <div className="impact-value">
                      -{impact.storageImpact.jobsToDelete} job, 
                      {impact.storageImpact.netReduction} net reduction
                    </div>
                  </div>
                )}
              </div>
              
              {impact.searchImpact && (
                <div className="search-impact">
                  <div className="impact-label">Search Impact:</div>
                  <div className="impact-description">
                    {impact.searchImpact.improvedRecall}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="recommendations">
              <h3>Recommendations</h3>
              <div className="recommendations-list">
                {recommendations.map((rec, index) => (
                  <div key={index} className={`recommendation-item ${rec.type}`}>
                    <div className="recommendation-header">
                      <span className={`priority-badge ${rec.priority}`}>
                        {rec.priority} priority
                      </span>
                      <span className="recommendation-type">{rec.type}</span>
                    </div>
                    <div className="recommendation-message">{rec.message}</div>
                    {rec.reasoning && (
                      <div className="recommendation-reasoning">{rec.reasoning}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="preview-footer">
          <div className="footer-info">
            <span className="operation-duration">
              Estimated duration: {previewData.operations.estimatedDuration}
            </span>
            {previewData.reversible && (
              <span className="reversible-info">
                ✓ This operation can be undone within 24 hours
              </span>
            )}
          </div>
          
          <div className="footer-actions">
            <button
              className="btn-cancel"
              onClick={onCancel}
              disabled={isExecuting}
            >
              Cancel
            </button>
            <button
              className="btn-execute"
              onClick={handleExecute}
              disabled={isExecuting || risks.some(r => r.severity === 'high')}
            >
              {isExecuting ? 'Executing Merge...' : 'Execute Merge'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MergePreview;