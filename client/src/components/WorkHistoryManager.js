/**
 * WorkHistoryManager - Main container component for work history management 
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import JobEditor from './JobEditor';
import DuplicateAlert from './DuplicateAlert';
import './WorkHistoryManager.css';

const WorkHistoryManager = () => {
  const {
    loading,
    error,
    clearError,
    getWorkHistory,
    detectDuplicates,
    getDuplicatesSummary,
    deleteJob,
    bulkDeleteJobs
  } = useUserDataAPI();

  const [jobs, setJobs] = useState([]);
  const [duplicatesSummary, setDuplicatesSummary] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [view, setView] = useState('timeline'); // timeline, list
  const [sortBy, setSortBy] = useState('date_start');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);

  // Load work history data
  const loadWorkHistory = useCallback(async () => {
    try {
      const response = await getWorkHistory();
      // Handle the nested response structure: response.data.jobs
      const jobs = response?.data?.jobs || response?.jobs || [];
      console.log('Work history loaded:', jobs.length, 'jobs');
      setJobs(jobs);
    } catch (err) {
      console.error('Failed to load work history:', err);
    }
  }, [getWorkHistory]);

  // Load duplicates summary
  const loadDuplicatesSummary = useCallback(async () => {
    try {
      const response = await getDuplicatesSummary();
      // Handle the nested response structure
      const summary = response?.data || response;
      setDuplicatesSummary(summary);
    } catch (err) {
      console.error('Failed to load duplicates summary:', err);
      // Don't set duplicates summary if it fails - it's not critical
    }
  }, [getDuplicatesSummary]);

  // Initial data loading
  useEffect(() => {
    loadWorkHistory();
    loadDuplicatesSummary();
  }, [loadWorkHistory, loadDuplicatesSummary]);

  // Filter and sort jobs
  const processedJobs = React.useMemo(() => {
    let filtered = jobs;

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = jobs.filter(job =>
        job.title?.toLowerCase().includes(term) ||
        job.org?.toLowerCase().includes(term) ||
        job.description?.toLowerCase().includes(term) ||
        job.skills?.some(skill => skill.toLowerCase().includes(term))
      );
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];

      // Handle date sorting
      if (sortBy.includes('date')) {
        aVal = aVal ? new Date(aVal) : new Date('1900-01-01');
        bVal = bVal ? new Date(bVal) : new Date('1900-01-01');
      }

      // Handle string sorting
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }

      const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [jobs, searchTerm, sortBy, sortOrder]);

  // Handle job selection
  const handleJobSelect = (job) => {
    setSelectedJob(job);
    setShowEditor(true);
  };

  // Handle job creation
  const handleCreateJob = () => {
    setSelectedJob(null);
    setShowEditor(true);
  };

  // Handle job save
  const handleJobSave = () => {
    setShowEditor(false);
    setSelectedJob(null);
    loadWorkHistory(); // Refresh data
    loadDuplicatesSummary(); // Refresh duplicates
  };

  // Handle job cancel
  const handleJobCancel = () => {
    setShowEditor(false);
    setSelectedJob(null);
  };

  // Handle job delete
  const handleJobDelete = async (job) => {
    const confirmMessage = `Are you sure you want to delete "${job.title}" at ${job.org}?\n\nThis action cannot be undone and will also delete all related content and embeddings.`;
    
    if (window.confirm(confirmMessage)) {
      try {
        await deleteJob(job.id);
        console.log(`Job deleted: ${job.title}`);
        loadWorkHistory(); // Refresh the list
        loadDuplicatesSummary(); // Refresh duplicates
      } catch (err) {
        console.error('Failed to delete job:', err);
        // Error will be handled by the useUserDataAPI hook and displayed in the error banner
      }
    }
  };

  // Handle checkbox selection
  const handleJobCheckbox = (jobId, isSelected) => {
    const newSelected = new Set(selectedJobs);
    if (isSelected) {
      newSelected.add(jobId);
    } else {
      newSelected.delete(jobId);
    }
    setSelectedJobs(newSelected);
    setShowBulkActions(newSelected.size > 0);
  };

  // Handle select all
  const handleSelectAll = (isSelected) => {
    if (isSelected) {
      const allJobIds = new Set(processedJobs.map(job => job.id));
      setSelectedJobs(allJobIds);
      setShowBulkActions(true);
    } else {
      setSelectedJobs(new Set());
      setShowBulkActions(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const selectedJobsArray = Array.from(selectedJobs);
    const selectedJobDetails = jobs.filter(job => selectedJobs.has(job.id));
    
    // Debug logging
    console.log('Bulk delete requested:', {
      selectedJobsArray,
      selectedJobDetails: selectedJobDetails.map(job => ({ id: job.id, title: job.title, org: job.org }))
    });
    
    const confirmMessage = `Are you sure you want to delete ${selectedJobsArray.length} selected job${selectedJobsArray.length === 1 ? '' : 's'}?\n\nJobs to be deleted:\n${selectedJobDetails.map(job => `• ${job.title} at ${job.org}`).join('\n')}\n\nThis action cannot be undone and will also delete all related content and embeddings.`;
    
    if (window.confirm(confirmMessage)) {
      try {
        console.log('Sending bulk delete request with IDs:', selectedJobsArray);
        const result = await bulkDeleteJobs(selectedJobsArray);
        console.log(`Bulk delete completed:`, result);
        
        // Clear selections
        setSelectedJobs(new Set());
        setShowBulkActions(false);
        
        // Refresh the list
        loadWorkHistory();
        loadDuplicatesSummary();
        
        // Show success message if there were any failures
        if (result.data.errors && result.data.errors.length > 0) {
          alert(`Bulk delete completed with some errors:\n${result.data.errors.map(e => `• ${e.error}`).join('\n')}`);
        }
      } catch (err) {
        console.error('Failed to bulk delete jobs:', err);
        // Error will be handled by the useUserDataAPI hook and displayed in the error banner
      }
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Present';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short' 
    });
  };

  // Calculate job duration
  const calculateDuration = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : new Date();
    const diffTime = Math.abs(end - start);
    const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
    
    if (diffMonths < 12) {
      return `${diffMonths} month${diffMonths !== 1 ? 's' : ''}`;
    }
    
    const years = Math.floor(diffMonths / 12);
    const months = diffMonths % 12;
    
    if (months === 0) {
      return `${years} year${years !== 1 ? 's' : ''}`;
    }
    
    return `${years}y ${months}m`;
  };

  // Render timeline view
  const renderTimelineView = () => (
    <div className="timeline-container">
      <div className="timeline">
        {processedJobs.map((job, index) => (
          <div key={job.id} className="timeline-item">
            <div className="timeline-marker">
              <div className="timeline-dot"></div>
              {index < processedJobs.length - 1 && <div className="timeline-line"></div>}
            </div>
            <div className="timeline-content">
              <div className="job-card">
                <div className="job-header">
                  <div className="job-title-section">
                    <label className="job-checkbox">
                      <input
                        type="checkbox"
                        checked={selectedJobs.has(job.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleJobCheckbox(job.id, e.target.checked);
                        }}
                      />
                    </label>
                    <h3 className="job-title" onClick={() => handleJobSelect(job)}>{job.title}</h3>
                  </div>
                  <span className="job-duration">
                    {calculateDuration(job.date_start, job.date_end)}
                  </span>
                </div>
                <div className="job-company">{job.org}</div>
                <div className="job-dates">
                  {formatDate(job.date_start)} - {formatDate(job.date_end)}
                </div>
                {job.location && (
                  <div className="job-location">{job.location}</div>
                )}
                {job.description && (
                  <div className="job-description">
                    {job.description.slice(0, 150)}
                    {job.description.length > 150 && '...'}
                  </div>
                )}
                {job.skills && job.skills.length > 0 && (
                  <div className="job-skills">
                    {job.skills.slice(0, 5).map((skill, i) => (
                      <span key={i} className="skill-tag">{skill}</span>
                    ))}
                    {job.skills.length > 5 && (
                      <span className="skill-tag more">+{job.skills.length - 5} more</span>
                    )}
                  </div>
                )}
                <div className="job-actions">
                  <button 
                    className="btn-edit"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJobSelect(job);
                    }}
                  >
                    Edit
                  </button>
                  <button 
                    className="btn-delete"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleJobDelete(job);
                    }}
                    title="Delete job"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Render list view
  const renderListView = () => (
    <div className="list-container">
      <div className="job-list">
        {processedJobs.map((job) => (
          <div key={job.id} className="job-list-item">
            <div className="job-checkbox-section">
              <label className="job-checkbox">
                <input
                  type="checkbox"
                  checked={selectedJobs.has(job.id)}
                  onChange={(e) => {
                    e.stopPropagation();
                    handleJobCheckbox(job.id, e.target.checked);
                  }}
                />
              </label>
            </div>
            <div className="job-info" onClick={() => handleJobSelect(job)}>
              <div className="job-title-org">
                <h3>{job.title}</h3>
                <span className="at-company">at {job.org}</span>
              </div>
              <div className="job-meta">
                <span className="job-dates">
                  {formatDate(job.date_start)} - {formatDate(job.date_end)}
                </span>
                <span className="job-duration">
                  ({calculateDuration(job.date_start, job.date_end)})
                </span>
              </div>
            </div>
            <div className="job-actions">
              <button 
                className="btn-edit"
                onClick={(e) => {
                  e.stopPropagation();
                  handleJobSelect(job);
                }}
              >
                Edit
              </button>
              <button 
                className="btn-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  handleJobDelete(job);
                }}
                title="Delete job"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="work-history-manager">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={clearError} className="close-error">×</button>
        </div>
      )}

      {duplicatesSummary && duplicatesSummary.estimatedDuplicates > 0 && (
        <DuplicateAlert summary={duplicatesSummary} onDismiss={() => setDuplicatesSummary(null)} />
      )}

      <div className="manager-header">
        <div className="header-title">
          <h2>Work History</h2>
          <span className="job-count">
            {processedJobs.length} {processedJobs.length === 1 ? 'position' : 'positions'}
          </span>
        </div>
        
        <div className="header-actions">
          {showBulkActions && (
            <div className="bulk-actions">
              <span className="selected-count">
                {selectedJobs.size} selected
              </span>
              <button 
                className="btn-danger"
                onClick={handleBulkDelete}
                disabled={loading}
              >
                Delete Selected
              </button>
              <button 
                className="btn-secondary"
                onClick={() => {
                  setSelectedJobs(new Set());
                  setShowBulkActions(false);
                }}
              >
                Cancel
              </button>
            </div>
          )}
          <button 
            className="btn-primary"
            onClick={handleCreateJob}
            disabled={loading}
          >
            + Add Job
          </button>
        </div>
      </div>

      <div className="manager-controls">
        <div className="search-controls">
          <input
            type="text"
            placeholder="Search jobs, companies, skills..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="bulk-select-controls">
          <label className="select-all-label">
            <input
              type="checkbox"
              checked={selectedJobs.size > 0 && selectedJobs.size === processedJobs.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
              className="select-all-checkbox"
            />
            <span>Select All ({processedJobs.length})</span>
          </label>
        </div>

        <div className="view-controls">
          <div className="view-toggle">
            <button
              className={view === 'timeline' ? 'active' : ''}
              onClick={() => setView('timeline')}
            >
              Timeline
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              onClick={() => setView('list')}
            >
              List
            </button>
          </div>

          <div className="sort-controls">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="sort-select"
            >
              <option value="date_start">Start Date</option>
              <option value="date_end">End Date</option>
              <option value="title">Job Title</option>
              <option value="org">Company</option>
            </select>
            <button
              className={`sort-order ${sortOrder}`}
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              title={sortOrder === 'asc' ? 'Sort Descending' : 'Sort Ascending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>
        </div>
      </div>

      <div className="manager-content">
        {loading ? (
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <span>Loading work history...</span>
          </div>
        ) : processedJobs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📝</div>
            <h3>No Work History Found</h3>
            <p>
              {searchTerm 
                ? `No jobs match "${searchTerm}". Try a different search term.`
                : "Get started by adding your first job position."
              }
            </p>
            {!searchTerm && (
              <button className="btn-primary" onClick={handleCreateJob}>
                Add Your First Job
              </button>
            )}
          </div>
        ) : (
          <>
            {view === 'timeline' ? renderTimelineView() : renderListView()}
          </>
        )}
      </div>

      {showEditor && (
        <JobEditor
          job={selectedJob}
          onSave={handleJobSave}
          onCancel={handleJobCancel}
        />
      )}
    </div>
  );
};

export default WorkHistoryManager;