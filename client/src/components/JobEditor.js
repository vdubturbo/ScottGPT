/**
 * JobEditor - Detailed editing component for job entries
 */

import React, { useState, useEffect, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import { useCompanyOperations } from '../hooks/useCompanyOperations';
import SkillsInput from './SkillsInput';
import DateInput from './DateInput';
import ValidationMessage from './ValidationMessage';
import CompanySelect from './CompanySelect';
import './JobEditor.css';

const JobEditor = ({ job, onSave, onCancel }) => {
  const {
    loading,
    error,
    clearError,
    updateJob,
    deleteJob,
    validateData,
    getWorkHistory
  } = useUserDataAPI();

  // Company operations for reassignment
  const {
    loading: companyLoading,
    reassignJob,
    validateCompanyName
  } = useCompanyOperations();

  const [formData, setFormData] = useState({
    title: '',
    org: '',
    location: '',
    date_start: '',
    date_end: '',
    skills: [],
    type: 'job'
  });

  const [validation, setValidation] = useState({
    isValid: true,
    errors: [],
    warnings: []
  });

  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [autoSaveTimeout, setAutoSaveTimeout] = useState(null);
  const [originalCompany, setOriginalCompany] = useState(null);
  const [companyChanged, setCompanyChanged] = useState(false);

  // Merge functionality state
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  const [mergeTarget, setMergeTarget] = useState('');
  const [sameCompanyPositions, setSameCompanyPositions] = useState([]);

  // Initialize form data
  useEffect(() => {
    if (job) {
      setFormData({
        title: job.title || '',
        org: job.org || '',
        location: job.location || '',
        date_start: job.date_start || '',
        date_end: job.date_end || '',
        skills: job.skills || [],
        type: job.type || 'job'
      });
      setOriginalCompany(job.org || '');
    } else {
      // Reset for new job
      setFormData({
        title: '',
        org: '',
        location: '',
        date_start: '',
        date_end: '',
        skills: [],
        type: 'job'
      });
      setOriginalCompany(null);
    }
    setIsDirty(false);
    setCompanyChanged(false);
    setValidation({ isValid: true, errors: [], warnings: [] });
  }, [job]);

  // Real-time validation
  const performValidation = useCallback(async () => {
    try {
      const result = await validateData({
        jobData: formData,
        validateOnly: true
      });
      setValidation(result);
    } catch (err) {
      console.error('Validation error:', err);
    }
  }, [formData, validateData]);

  // Debounced validation
  useEffect(() => {
    if (isDirty) {
      const timeout = setTimeout(performValidation, 500);
      return () => clearTimeout(timeout);
    }
  }, [formData, isDirty, performValidation]);

  // Auto-save functionality (DISABLED)
  // useEffect(() => {
  //   if (isDirty && job && validation.isValid) {
  //     if (autoSaveTimeout) {
  //       clearTimeout(autoSaveTimeout);
  //     }
  //     
  //     const timeout = setTimeout(async () => {
  //       try {
  //         await updateJob(job.id, formData);
  //         setIsDirty(false);
  //       } catch (err) {
  //         console.error('Auto-save failed:', err);
  //       }
  //     }, 3000); // Auto-save after 3 seconds of no changes
  //     
  //     setAutoSaveTimeout(timeout);
  //   }
  //   
  //   return () => {
  //     if (autoSaveTimeout) {
  //       clearTimeout(autoSaveTimeout);
  //     }
  //   };
  // }, [formData, isDirty, job, validation.isValid, updateJob, autoSaveTimeout]);

  // Handle form field changes
  const handleFieldChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    setIsDirty(true);
    clearError();

    // Track company changes for existing jobs
    if (field === 'org' && job && originalCompany) {
      setCompanyChanged(value !== originalCompany);
    }
  };

  // Handle skills change
  const handleSkillsChange = (skills) => {
    handleFieldChange('skills', skills);
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Perform final validation
      await performValidation();

      if (!validation.isValid) {
        setIsSaving(false);
        return;
      }

      if (job) {
        // If company changed, use reassignment API, otherwise use regular update
        if (companyChanged && formData.org !== originalCompany) {
          console.log(`Reassigning job ${job.id} from "${originalCompany}" to "${formData.org}"`);

          // Validate the new company name first
          const validation = await validateCompanyName(formData.org);
          if (!validation.valid) {
            throw new Error(validation.message || 'Invalid company name');
          }

          // Use company reassignment API
          await reassignJob(job.id, formData.org, {
            preserveEmbeddings: false, // Regenerate embeddings for better search
            validateCompanyName: true
          });

          // Update other fields with regular API if needed
          const otherFieldsChanged = Object.keys(formData).some(key =>
            key !== 'org' && formData[key] !== (job[key] || '')
          );

          if (otherFieldsChanged) {
            await updateJob(job.id, {
              title: formData.title,
              location: formData.location,
              date_start: formData.date_start,
              date_end: formData.date_end,
              skills: formData.skills,
              type: formData.type
            });
          }
        } else {
          // Regular update for non-company changes
          await updateJob(job.id, formData);
        }
      } else {
        // Handle new job creation - this would need to be added to the API
        console.log('Creating new job:', formData);
      }

      setIsDirty(false);
      setCompanyChanged(false);
      onSave();
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!job) return;

    try {
      await deleteJob(job.id);
      onSave(); // Refresh parent
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  // Load positions from the same company
  const loadSameCompanyPositions = useCallback(async () => {
    if (!job || !formData.org) {
      setSameCompanyPositions([]);
      return;
    }

    try {
      const response = await getWorkHistory();
      const allJobs = response?.data?.jobs || response?.jobs || [];

      // Filter positions from the same company, excluding the current job
      const sameCompany = allJobs.filter(position =>
        position.org === formData.org && position.id !== job.id
      );

      setSameCompanyPositions(sameCompany);
    } catch (err) {
      console.error('Failed to load same company positions:', err);
      setSameCompanyPositions([]);
    }
  }, [job, formData.org, getWorkHistory]);

  // Load same company positions when company changes
  useEffect(() => {
    if (job && formData.org) {
      loadSameCompanyPositions();
    }
  }, [loadSameCompanyPositions]);

  // Handle merge position
  const handleMergePosition = async (targetJobId) => {
    if (!job || !targetJobId) return;

    try {
      setIsSaving(true);

      // Find the target position
      const targetPosition = sameCompanyPositions.find(pos => pos.id === targetJobId);
      if (!targetPosition) {
        throw new Error('Target position not found');
      }

      // Merge the data - combine all information
      const mergedData = {
        // Use current position's primary fields as base
        title: formData.title,
        org: formData.org,
        location: formData.location || targetPosition.location, // Use target's location if current is empty
        type: formData.type,

        // Merge date ranges - use earliest start date and latest end date
        date_start: formData.date_start && targetPosition.date_start
          ? (new Date(formData.date_start) < new Date(targetPosition.date_start)
              ? formData.date_start : targetPosition.date_start)
          : formData.date_start || targetPosition.date_start,

        date_end: formData.date_end || targetPosition.date_end
          ? (formData.date_end && targetPosition.date_end
              ? (new Date(formData.date_end) > new Date(targetPosition.date_end)
                  ? formData.date_end : targetPosition.date_end)
              : formData.date_end || targetPosition.date_end)
          : null, // If either is current (null), result is current

        // Merge skills - combine and deduplicate
        skills: [...new Set([...(formData.skills || []), ...(targetPosition.skills || [])])],

        // Combine descriptions if they exist (for future use)
        description: [formData.description, targetPosition.description]
          .filter(Boolean)
          .join('\n\n--- Merged from separate position ---\n\n'),
      };

      // Update the current position with merged data
      await updateJob(job.id, mergedData);

      // Delete the target position
      await deleteJob(targetJobId);

      // Close dialogs and refresh
      setShowMergeConfirm(false);
      setMergeTarget('');
      onSave(); // Refresh parent component

    } catch (err) {
      console.error('Merge failed:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') {
          e.preventDefault();
          handleSave();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, onCancel]);

  // Check if form has required fields
  const hasRequiredFields = formData.title.trim() && formData.org.trim();

  // Combined loading state
  const isLoading = loading || companyLoading || isSaving;

  return ReactDOM.createPortal(
    <div className="job-editor-overlay">
      <div className="job-editor">
        <div className="editor-header">
          <h2>{job ? 'Edit Position' : 'Add New Position'}</h2>
          <div className="editor-status">
            {isDirty && <span className="unsaved-indicator">Unsaved changes</span>}
          </div>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        {error && (
          <div className="error-message">
            <span>{error}</span>
            <button onClick={clearError}>×</button>
          </div>
        )}

        {/* Company Change Notification */}
        {companyChanged && job && (
          <div className="company-change-notice">
            <div className="notice-content">
              <span className="notice-icon">📦</span>
              <div className="notice-text">
                <strong>Company Change Detected</strong>
                <p>This position will be moved from "{originalCompany}" to "{formData.org}" when saved.</p>
              </div>
            </div>
          </div>
        )}

        <div className="editor-content">
          <form onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
            <div className="form-grid">
              <div className="form-section">
                <h3>Basic Information</h3>
                
                <div className="form-group">
                  <label htmlFor="title">Job Title *</label>
                  <input
                    id="title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleFieldChange('title', e.target.value)}
                    placeholder="e.g., Senior Software Engineer"
                    className={validation.errors?.some(e => e.field === 'title') ? 'error' : ''}
                    autoComplete="organization-title"
                  />
                  <ValidationMessage 
                    field="title" 
                    errors={validation.errors} 
                    warnings={validation.warnings} 
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="org">Company *</label>
                  <CompanySelect
                    id="org"
                    value={formData.org}
                    onChange={(value) => handleFieldChange('org', value)}
                    isEditingMode={!!job}
                    placeholder="e.g., Tech Corp Inc."
                    className={validation.errors?.some(e => e.field === 'org') ? 'error' : ''}
                    required={true}
                  />
                  <ValidationMessage 
                    field="org" 
                    errors={validation.errors} 
                    warnings={validation.warnings} 
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="location">Location</label>
                  <input
                    id="location"
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleFieldChange('location', e.target.value)}
                    placeholder="e.g., San Francisco, CA"
                    autoComplete="address-level2"
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="type">Position Type</label>
                  <select
                    id="type"
                    value={formData.type}
                    onChange={(e) => handleFieldChange('type', e.target.value)}
                  >
                    <option value="job">Full-time Job</option>
                    <option value="contract">Contract</option>
                    <option value="internship">Internship</option>
                    <option value="freelance">Freelance</option>
                    <option value="volunteer">Volunteer</option>
                  </select>
                </div>
              </div>

              <div className="form-section form-section-right">
                <h3>Employment Period</h3>

                <div className="date-range">
                  <div className="form-group">
                    <label htmlFor="date_start">Start Date *</label>
                    <DateInput
                      id="date_start"
                      value={formData.date_start}
                      onChange={(value) => handleFieldChange('date_start', value)}
                      className={validation.errors?.some(e => e.field === 'date_start') ? 'error' : ''}
                    />
                    <ValidationMessage
                      field="date_start"
                      errors={validation.errors}
                      warnings={validation.warnings}
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="date_end">End Date</label>
                    <DateInput
                      id="date_end"
                      value={formData.date_end}
                      onChange={(value) => handleFieldChange('date_end', value)}
                      allowCurrent={true}
                      className={validation.errors?.some(e => e.field === 'date_end') ? 'error' : ''}
                    />
                    <ValidationMessage
                      field="date_end"
                      errors={validation.errors}
                      warnings={validation.warnings}
                    />
                    <span className="field-hint">Leave empty if current position</span>
                  </div>
                </div>

                <h3>Skills & Technologies</h3>
                <div className="form-group">
                  <label>Skills</label>
                  <SkillsInput
                    value={formData.skills}
                    onChange={handleSkillsChange}
                    placeholder="Add skills used in this position..."
                  />
                  <ValidationMessage
                    field="skills"
                    errors={validation.errors}
                    warnings={validation.warnings}
                  />
                </div>
              </div>

              {/* Merge Position Section - Only show for existing jobs with same-company positions */}
              {job && sameCompanyPositions.length > 0 && (
                <div className="form-section full-width merge-section">
                  <h3>🔗 Merge INTO Another Position</h3>
                  <div className="merge-info">
                    <p>You can merge this position INTO another position from {formData.org}. This will combine all data from both positions.</p>
                  </div>

                  <div className="form-group">
                    <label htmlFor="merge-target">Select position to merge with:</label>
                    <select
                      id="merge-target"
                      value={mergeTarget}
                      onChange={(e) => setMergeTarget(e.target.value)}
                      className="merge-dropdown"
                    >
                      <option value="">Choose a position...</option>
                      {sameCompanyPositions.map((position) => (
                        <option key={position.id} value={position.id}>
                          {position.title} ({position.date_start ? new Date(position.date_start).getFullYear() : 'Unknown'} - {position.date_end ? new Date(position.date_end).getFullYear() : 'Present'})
                        </option>
                      ))}
                    </select>
                  </div>

                  {mergeTarget && (
                    <div className="merge-actions">
                      <button
                        type="button"
                        className="btn-merge"
                        onClick={() => setShowMergeConfirm(true)}
                        disabled={isLoading}
                      >
                        🔗 Merge Positions
                      </button>
                      <span className="merge-warning">⚠️ This action cannot be undone</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Validation Summary */}
            {(validation.errors.length > 0 || validation.warnings.length > 0) && (
              <div className="validation-summary">
                {validation.errors.length > 0 && (
                  <div className="validation-errors">
                    <h4>Please fix these issues:</h4>
                    <ul>
                      {validation.errors.map((error, index) => (
                        <li key={index}>{error.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {validation.warnings.length > 0 && (
                  <div className="validation-warnings">
                    <h4>Consider reviewing:</h4>
                    <ul>
                      {validation.warnings.map((warning, index) => (
                        <li key={index}>{warning.message}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </form>
        </div>

        <div className="editor-footer">
          <div className="footer-left">
            {job && (
              <button
                type="button"
                className="btn-delete"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading}
              >
                Delete Position
              </button>
            )}
          </div>
          
          <div className="footer-right">
            <button
              type="button"
              className="btn-secondary"
              onClick={onCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`btn-primary ${companyChanged ? 'company-reassignment' : ''}`}
              onClick={handleSave}
              disabled={isLoading || !hasRequiredFields || !validation.isValid}
            >
              {isLoading ?
                (companyChanged ? 'Reassigning Company...' : 'Saving...') :
                job ?
                  (companyChanged ? `Move to "${formData.org}"` : 'Save Changes') :
                  'Add Position'
              }
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="confirm-overlay">
            <div className="confirm-dialog">
              <h3>Delete Position</h3>
              <p>
                Are you sure you want to delete this position? This action cannot be undone.
                All related content and embeddings will be removed.
              </p>
              <div className="confirm-actions">
                <button
                  className="btn-secondary"
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button
                  className="btn-delete"
                  onClick={handleDelete}
                  disabled={isLoading}
                >
                  {isLoading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Merge Confirmation Modal */}
        {showMergeConfirm && mergeTarget && (
          <div className="confirm-overlay">
            <div className="confirm-dialog merge-confirm-dialog">
              <h3>🔗 Merge Positions</h3>
              <div className="merge-preview">
                <div className="current-position">
                  <h4>Current Position:</h4>
                  <p><strong>{formData.title}</strong> at {formData.org}</p>
                  <p>{formData.date_start ? new Date(formData.date_start).getFullYear() : 'Unknown'} - {formData.date_end ? new Date(formData.date_end).getFullYear() : 'Present'}</p>
                  {formData.skills && formData.skills.length > 0 && (
                    <p><strong>Skills:</strong> {formData.skills.slice(0, 3).join(', ')}{formData.skills.length > 3 ? '...' : ''}</p>
                  )}
                </div>

                <div className="merge-arrow">➕</div>

                <div className="target-position">
                  <h4>Merging with:</h4>
                  {(() => {
                    const target = sameCompanyPositions.find(pos => pos.id === mergeTarget);
                    return target ? (
                      <>
                        <p><strong>{target.title}</strong> at {target.org}</p>
                        <p>{target.date_start ? new Date(target.date_start).getFullYear() : 'Unknown'} - {target.date_end ? new Date(target.date_end).getFullYear() : 'Present'}</p>
                        {target.skills && target.skills.length > 0 && (
                          <p><strong>Skills:</strong> {target.skills.slice(0, 3).join(', ')}{target.skills.length > 3 ? '...' : ''}</p>
                        )}
                      </>
                    ) : <p>Position not found</p>;
                  })()}
                </div>
              </div>

              <div className="merge-details">
                <h4>What will happen:</h4>
                <ul>
                  <li>📅 Date ranges will be combined (earliest start, latest end)</li>
                  <li>🛠️ All skills from both positions will be merged</li>
                  <li>📍 Location and other details will be preserved</li>
                  <li>🗑️ The target position will be deleted</li>
                  <li>⚠️ This action cannot be undone</li>
                </ul>
              </div>

              <div className="confirm-actions">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setShowMergeConfirm(false);
                    setMergeTarget('');
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn-primary"
                  onClick={() => handleMergePosition(mergeTarget)}
                  disabled={isLoading}
                >
                  {isLoading ? 'Merging...' : 'Merge Positions'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default JobEditor;