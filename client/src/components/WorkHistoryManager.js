/**
 * WorkHistoryManager - Main container component for work history management 
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import { useCompanyOperations } from '../hooks/useCompanyOperations';
import JobEditor from './JobEditor';
import DuplicateAlert from './DuplicateAlert';
import CompanySelect from './CompanySelect';
import CompanyGroupingService from '../utils/company-grouping';
import { CompanyAPIUtils } from '../services/companyApi';
import './WorkHistoryManager.css';

const WorkHistoryManager = ({ onViewDuplicates }) => {
  const {
    loading,
    error,
    clearError,
    getWorkHistory,
    getDuplicatesSummary,
    deleteJob,
    bulkDeleteJobs,
    deleteAllUserData
  } = useUserDataAPI();

  // Company operations hook
  const {
    loading: companyLoading,
    error: companyError,
    operationStatus,
    reassignJob,
    bulkReassignJobs,
    mergeCompanies,
    splitCompany,
    renameCompany,
    validateCompanyName,
    clearError: clearCompanyError,
    clearStatus: clearOperationStatus,
    formatResults,
    getAllOptimisticUpdates
  } = useCompanyOperations();

  const [jobs, setJobs] = useState([]);
  const [duplicatesSummary, setDuplicatesSummary] = useState(null);
  const [selectedJob, setSelectedJob] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [view, setView] = useState('grid'); // grid, list, company
  const [groupByCompany, setGroupByCompany] = useState(true);
  const [sortBy, setSortBy] = useState('date_start');
  const [sortOrder, setSortOrder] = useState('desc');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedJobs, setSelectedJobs] = useState(new Set());
  const [showBulkActions, setShowBulkActions] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Company grouping state
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [showCompanyActions, setShowCompanyActions] = useState(false);
  const [companyActionType, setCompanyActionType] = useState(null);
  const [companyActionTarget, setCompanyActionTarget] = useState(null);

  // Success/feedback state
  const [successMessage, setSuccessMessage] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmDialogData, setConfirmDialogData] = useState(null);
  const [companyActionData, setCompanyActionData] = useState(null);
  const [confirmDialogConfig, setConfirmDialogConfig] = useState(null);

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
  }, []); // Remove getWorkHistory dependency to prevent recreation

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
  }, []); // Remove getDuplicatesSummary dependency to prevent recreation

  // Initial data loading - only run once on mount to avoid rate limiting
  useEffect(() => {
    loadWorkHistory();

    // Debounce duplicates summary to avoid rate limiting in development
    const timer = setTimeout(() => {
      loadDuplicatesSummary();
    }, 2000); // 2 second delay to avoid rapid successive calls

    return () => clearTimeout(timer);
  }, []); // Empty dependency array - only run on mount

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

  // Handle delete all data
  const handleDeleteAllData = async () => {
    if (deleteConfirmText !== 'DELETE ALL MY DATA') {
      alert('Please type "DELETE ALL MY DATA" exactly to confirm this action.');
      return;
    }

    try {
      console.log('Deleting all user data with confirmation:', deleteConfirmText);
      const result = await deleteAllUserData(deleteConfirmText);
      console.log('Delete all data completed:', result);

      // Close dialog and reset state
      setShowDeleteAllDialog(false);
      setDeleteConfirmText('');

      // Clear all local state
      setJobs([]);
      setSelectedJobs(new Set());
      setShowBulkActions(false);
      setDuplicatesSummary(null);

      // Show success message
      alert(`All data has been permanently deleted.\n\nDeleted:\n• ${result.data.impact.sourcesDeleted} job sources\n• ${result.data.impact.chunksDeleted} content chunks\n• ${result.data.impact.documentsDeleted} documents\n• ${result.data.impact.embeddingsRemoved} embeddings`);

    } catch (err) {
      console.error('Failed to delete all data:', err);
      // Error will be handled by the useUserDataAPI hook and displayed in the error banner
    }
  };

  // Handle cancel delete all data
  const handleCancelDeleteAll = () => {
    setShowDeleteAllDialog(false);
    setDeleteConfirmText('');
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

  // Company action handlers
  const handleCompanyRename = (company) => {
    setCompanyActionType('rename');
    setCompanyActionData(company);
    setShowCompanyActions(true);
  };

  const handleCompanyMerge = (company) => {
    setCompanyActionType('merge');
    setCompanyActionData(company);
    setShowCompanyActions(true);
  };

  const handleCompanySplit = (company) => {
    setConfirmDialogConfig({
      title: 'Split Company Positions',
      message: `Split "${company.name}" into separate companies? Each position will become its own company.`,
      confirmText: 'Split Company',
      onConfirm: () => performCompanySplit(company),
      onCancel: () => setShowConfirmDialog(false)
    });
    setShowConfirmDialog(true);
  };


  // Company operation implementations with real API calls
  const performCompanySplit = async (company) => {
    try {
      // For split, we'll create individual companies for each position
      const positionIds = company.jobs.map(job => job.id);
      const splitPromises = company.jobs.map(async (job, index) => {
        const newCompanyName = `${company.name} - ${job.title}`;
        return await reassignJob(job.id, newCompanyName, {
          enableOptimistic: true,
          oldCompany: company.name
        });
      });

      const results = await Promise.all(splitPromises);
      const successCount = results.filter(r => r.success).length;

      setSuccessMessage(`Successfully split ${successCount} positions from ${company.name}`);
      setShowConfirmDialog(false);

      // Reload data to reflect changes
      await loadWorkHistory();
    } catch (error) {
      console.error('Company split failed:', error);
      setSuccessMessage(null);
    }
  };

  const performCompanyMerge = async (sourceCompanies, targetCompany) => {
    try {
      const result = await mergeCompanies(sourceCompanies, targetCompany, {
        enableOptimistic: true
      });

      if (result.success) {
        const formatted = formatResults(result.data);
        setSuccessMessage(`Merged companies: ${formatted.summary}`);
        setShowCompanyActions(false);
        await loadWorkHistory();
      }
    } catch (error) {
      console.error('Company merge failed:', error);
      setSuccessMessage(null);
    }
  };

  const performCompanyRename = async (company, newName) => {
    try {
      // Validate the new company name first
      const validation = await validateCompanyName(newName);
      if (!validation.valid) {
        setSuccessMessage(`Invalid company name: ${validation.message}`);
        return;
      }

      const result = await renameCompany(company.name, newName, {
        enableOptimistic: true
      });

      if (result.success) {
        const formatted = formatResults(result.data);
        setSuccessMessage(`Renamed ${company.name} to ${newName}: ${formatted.summary}`);
        setShowCompanyActions(false);
        await loadWorkHistory();
      }
    } catch (error) {
      console.error('Company rename failed:', error);
      setSuccessMessage(null);
    }
  };

  const performMovePosition = async (job, newCompanyName) => {
    try {
      // Validate the target company name
      const validation = await validateCompanyName(newCompanyName);
      if (!validation.valid) {
        setSuccessMessage(`Invalid company name: ${validation.message}`);
        return;
      }

      const result = await reassignJob(job.id, newCompanyName, {
        enableOptimistic: true,
        oldCompany: job.org
      });

      if (result.success) {
        setSuccessMessage(`Moved ${job.title} to ${newCompanyName}`);
        setShowCompanyActions(false);
        await loadWorkHistory();
      }
    } catch (error) {
      console.error('Position move failed:', error);
      setSuccessMessage(null);
    }
  };

  const performCreateNewCompany = async (job, newCompanyName) => {
    try {
      const validation = await validateCompanyName(newCompanyName);
      if (!validation.valid) {
        setSuccessMessage(`Invalid company name: ${validation.message}`);
        return;
      }

      const result = await reassignJob(job.id, newCompanyName, {
        enableOptimistic: true,
        oldCompany: job.org
      });

      if (result.success) {
        setSuccessMessage(`Created new company "${newCompanyName}" for ${job.title}`);
        setShowCompanyActions(false);
        await loadWorkHistory();
      }
    } catch (error) {
      console.error('New company creation failed:', error);
      setSuccessMessage(null);
    }
  };

  // Helper function to parse dates consistently
  const parseDate = (dateStr) => {
    if (!dateStr) return null;

    try {
      // Handle YYYY-MM-DD format (from database)
      if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const [year, month, day] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      }
      // Handle YYYY-MM format
      else if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}$/)) {
        const [year, month] = dateStr.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1);
      }
      // Handle other formats (fallback)
      else {
        return new Date(dateStr);
      }
    } catch (error) {
      console.warn('Failed to parse date:', dateStr, error);
      return null;
    }
  };

  // Format date for display
  const formatDate = (dateStr) => {
    if (!dateStr) return 'Present';

    const date = parseDate(dateStr);
    if (date && !isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short'
      });
    }

    return dateStr;
  };

  // Calculate job duration
  const calculateDuration = (startDate, endDate) => {
    const start = parseDate(startDate);
    const end = endDate ? parseDate(endDate) : new Date();
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

  // Group jobs by company with progression analysis
  const groupJobsByCompany = (jobs) => {
    const companies = {};
    
    jobs.forEach(job => {
      const companyName = job.org || 'Unknown Company';
      if (!companies[companyName]) {
        companies[companyName] = {
          name: companyName,
          jobs: [],
          totalDuration: 0,
          startDate: null,
          endDate: null
        };
      }
      companies[companyName].jobs.push(job);
    });

    // Process each company
    Object.values(companies).forEach(company => {
      // Sort jobs by start date
      company.jobs.sort((a, b) => {
        const aDate = parseDate(a.date_start) || new Date('1900-01-01');
        const bDate = parseDate(b.date_start) || new Date('1900-01-01');
        return aDate - bDate;
      });

      // Calculate company tenure
      const startDates = company.jobs
        .map(j => parseDate(j.date_start))
        .filter(d => d && d.getFullYear() > 1900);
      const endDates = company.jobs
        .map(j => j.date_end ? parseDate(j.date_end) : new Date())
        .filter(d => d);

      if (startDates.length > 0) {
        company.startDate = new Date(Math.min(...startDates));
        company.endDate = endDates.length > 0 ? new Date(Math.max(...endDates)) : new Date();
        
        // Calculate total duration
        const diffTime = Math.abs(company.endDate - company.startDate);
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
        company.totalDuration = diffMonths;
      }

      // Add progression indicators and analyze career growth
      company.jobs.forEach((job, index) => {
        job.isFirst = index === 0;
        job.isLast = index === company.jobs.length - 1;
        job.progressionIndex = index;
        
        // Analyze progression type
        if (index > 0) {
          const prevJob = company.jobs[index - 1];
          job.progressionType = analyzeProgression(prevJob, job);
        }
      });
      
      // Calculate overall career progression score
      const progressionTypes = company.jobs.filter(j => j.progressionType).map(j => j.progressionType);
      const promotions = progressionTypes.filter(type => type === 'promotion').length;
      const lateral = progressionTypes.filter(type => type === 'lateral').length;
      
      company.progressionScore = promotions > 0 ? 'strong' : lateral > 0 ? 'moderate' : 'stable';
      company.totalPromotions = promotions;
    });

    // Sort companies by most recent end date
    return Object.values(companies).sort((a, b) => {
      const aDate = a.endDate || new Date('1900-01-01');
      const bDate = b.endDate || new Date('1900-01-01');
      return bDate - aDate;
    });
  };

  // Get progression icon based on career movement
  const getProgressionIcon = (progressionType, isFirst) => {
    if (isFirst) return '🎯'; // Starting position
    
    switch (progressionType) {
      case 'promotion': return '⬆️'; // Promotion
      case 'lateral': return '↔️'; // Lateral move
      case 'step_back': return '⬇️'; // Step back
      case 'similar': return '🔄'; // Similar role
      default: return '•'; // Unknown/default
    }
  };

  // Analyze career progression between two positions
  const analyzeProgression = (prevJob, currentJob) => {
    if (!prevJob || !currentJob) return 'unknown';
    
    const prevTitle = (prevJob.title || '').toLowerCase();
    const currentTitle = (currentJob.title || '').toLowerCase();
    
    // Keywords that typically indicate seniority levels
    const seniorityKeywords = [
      { level: 5, words: ['executive', 'chief', 'president', 'vp', 'vice president'] },
      { level: 4, words: ['director', 'head of', 'principal', 'lead'] },
      { level: 3, words: ['senior manager', 'sr manager', 'manager'] },
      { level: 2, words: ['senior', 'sr', 'lead'] },
      { level: 1, words: ['junior', 'jr', 'associate', 'analyst'] },
      { level: 0, words: ['intern', 'trainee', 'entry'] }
    ];
    
    const getSeniorityLevel = (title) => {
      for (const level of seniorityKeywords) {
        if (level.words.some(word => title.includes(word))) {
          return level.level;
        }
      }
      return 2; // Default middle level if no keywords found
    };
    
    const prevLevel = getSeniorityLevel(prevTitle);
    const currentLevel = getSeniorityLevel(currentTitle);
    
    if (currentLevel > prevLevel) {
      return 'promotion';
    } else if (currentLevel < prevLevel) {
      return 'step_back';
    } else {
      // Same level - check for role expansion or specialization
      if (currentTitle.length > prevTitle.length || 
          currentTitle.includes('specialist') || 
          currentTitle.includes('consultant')) {
        return 'lateral';
      }
      return 'similar';
    }
  };

  // Format company duration
  const formatCompanyDuration = (totalMonths, startDate, endDate) => {
    if (!totalMonths || totalMonths <= 0) return '';
    
    const years = Math.floor(totalMonths / 12);
    const months = totalMonths % 12;
    
    let duration = '';
    if (years > 0) {
      duration += `${years} year${years !== 1 ? 's' : ''}`;
      if (months > 0) {
        duration += ` ${months} month${months !== 1 ? 's' : ''}`;
      }
    } else {
      duration = `${months} month${months !== 1 ? 's' : ''}`;
    }

    const startYear = startDate ? startDate.getFullYear() : '';
    const endYear = endDate ? (endDate > new Date('2030-01-01') ? 'Present' : endDate.getFullYear()) : '';
    const yearRange = startYear && endYear ? `${startYear}-${endYear}` : '';

    return yearRange ? `${yearRange} • ${duration}` : duration;
  };

  // Render company-grouped view
  const renderCompanyView = () => {
    const groupedCompanies = groupJobsByCompany(processedJobs);
    
    return (
      <div className="company-grouped-view">
        {groupedCompanies.map((company, companyIndex) => (
          <div key={company.name} className="company-section">
            <div className="company-header">
              <div className="company-info">
                <h3 className="company-name">🏢 {company.name}</h3>
                <div className="company-meta">
                  {formatCompanyDuration(company.totalDuration, company.startDate, company.endDate)}
                  <span className="position-count">
                    • {company.jobs.length} position{company.jobs.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              <div className="company-actions">
                <button
                  className="btn-company-action btn-rename"
                  onClick={() => handleCompanyRename(company)}
                  title="Rename company across all positions"
                >
                  ✏️ Rename
                </button>
              </div>
            </div>
            
            <div className="company-timeline">
              {company.jobs.map((job, jobIndex) => (
                <div key={job.id} className="timeline-job">
                  <div className="timeline-connector">
                    <div className={`timeline-dot ${job.progressionType || 'initial'}`}>
                      {getProgressionIcon(job.progressionType, job.isFirst)}
                    </div>
                    {!job.isLast && <div className="timeline-line"></div>}
                  </div>
                  
                  <div className="timeline-content">
                    <div className="job-card-compact">
                      <div className="job-header-compact">
                        <div className="job-title-section-compact">
                          <h4 className="job-title-compact" onClick={() => handleJobSelect(job)}>
                            {job.title}
                          </h4>
                          <div className="job-dates-compact">
                            {formatDate(job.date_start)} - {formatDate(job.date_end)}
                            <span className="job-duration-compact">
                              ({calculateDuration(job.date_start, job.date_end)})
                            </span>
                          </div>
                        </div>
                        <div className="job-actions-compact">
                          <button
                            className="btn-edit-compact"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJobSelect(job);
                            }}
                            title="Edit position (change company, dates, etc.)"
                          >
                            ✏️
                          </button>
                          <button
                            className="btn-delete-compact"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleJobDelete(job);
                            }}
                            title="Delete job"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                      
                      {job.location && (
                        <div className="job-location-compact">📍 {job.location}</div>
                      )}
                      
                      {job.description && (
                        <div className="job-description-compact">
                          {job.description.slice(0, 150)}
                          {job.description.length > 150 && '...'}
                        </div>
                      )}
                      
                      {job.skills && job.skills.length > 0 && (
                        <div className="job-skills-compact">
                          {job.skills.slice(0, 8).map((skill, i) => (
                            <span key={i} className="skill-tag-compact">{skill}</span>
                          ))}
                          {job.skills.length > 8 && (
                            <span className="skill-tag-compact more">+{job.skills.length - 8}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            
            {company.jobs.length > 1 && (
              <div className="company-progression">
                <div className={`progression-summary ${company.progressionScore}`}>
                  <div className="progression-header">
                    {company.progressionScore === 'strong' && '🚀'}
                    {company.progressionScore === 'moderate' && '📈'}
                    {company.progressionScore === 'stable' && '🏛️'}
                    <strong>Career Progression at {company.name}</strong>
                  </div>
                  <div className="progression-details">
                    <span>{company.jobs.length} positions over {formatCompanyDuration(company.totalDuration, company.startDate, company.endDate).split('•')[1]?.trim() || 'multiple years'}</span>
                    {company.totalPromotions > 0 && (
                      <span className="promotions-badge">
                        ⬆️ {company.totalPromotions} promotion{company.totalPromotions !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Render grid view (replaces timeline)
  const renderGridView = () => {
    console.log('🎯 RENDERING GRID VIEW - NEW LAYOUT!');
    return (
    <div className="jobs-grid">
      {processedJobs.map((job) => (
        <div key={job.id} className="job-card">
          <div className="job-header">
            <div className="job-title-section">
              <div className="job-title-info">
                <h3 className="job-title" onClick={() => handleJobSelect(job)}>{job.title}</h3>
                <div className="job-company">{job.org}</div>
              </div>
            </div>
            <div className="job-meta-right">
              <span className="job-duration">
                {calculateDuration(job.date_start, job.date_end)}
              </span>
              <div className="job-dates">
                {formatDate(job.date_start)} - {formatDate(job.date_end)}
              </div>
            </div>
          </div>
          {job.location && (
            <div className="job-location">{job.location}</div>
          )}
          {job.description && (
            <div className="job-description">
              {job.description.slice(0, 200)}
              {job.description.length > 200 && '...'}
            </div>
          )}
          {job.skills && job.skills.length > 0 && (
            <div className="job-skills">
              {job.skills.slice(0, 10).map((skill, i) => (
                <span key={i} className="skill-tag">{skill}</span>
              ))}
              {job.skills.length > 10 && (
                <span className="skill-tag more">+{job.skills.length - 10} more</span>
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
              ✏️
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
  );
  };

  // Render list view
  const renderListView = () => (
    <div className="list-container">
      <div className="job-list">
        {processedJobs.map((job) => (
          <div key={job.id} className="job-list-item">
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
                ✏️
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

      {companyError && (
        <div className="error-banner company-error">
          <span>Company Operation Error: {companyError}</span>
          <button onClick={clearCompanyError} className="close-error">×</button>
        </div>
      )}

      {successMessage && (
        <div className="success-banner">
          <span>{successMessage}</span>
          <button onClick={() => setSuccessMessage(null)} className="close-success">×</button>
        </div>
      )}

      {operationStatus && (
        <div className={`operation-status ${operationStatus.type}`}>
          <span>{operationStatus.message}</span>
          <button onClick={clearOperationStatus} className="close-status">×</button>
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
          
          <div className="action-buttons">
            <button
              className="btn-secondary btn-tool"
              onClick={() => {
                if (onViewDuplicates) {
                  onViewDuplicates();
                } else {
                  console.log('Duplicate detection requested');
                }
              }}
              title="Find and manage duplicate entries"
            >
              🔍 Duplicates
            </button>
            <button
              className="btn-secondary btn-tool"
              onClick={() => {
                // Open data quality inline view
                console.log('Data quality check requested');
              }}
              title="Check data quality and completeness"
            >
              📊 Quality
            </button>
            <button
              className="btn-danger btn-tool"
              onClick={() => setShowDeleteAllDialog(true)}
              title="Delete all your data - this action cannot be undone"
              style={{ marginLeft: '10px', borderLeft: '2px solid #ccc', paddingLeft: '10px' }}
            >
              🗑️ Delete All Data
            </button>
            <button
              className="btn-primary"
              onClick={handleCreateJob}
              disabled={loading}
            >
              + Add Job
            </button>
          </div>
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


        <div className="view-controls">
          <div className="grouping-toggle">
            <label className="toggle-container">
              <span className="toggle-label">
                {groupByCompany ? 'Group by Company' : 'Individual Positions'}
              </span>
              <div className={`toggle-switch ${groupByCompany ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={groupByCompany}
                  onChange={(e) => setGroupByCompany(e.target.checked)}
                  style={{ display: 'none' }}
                />
              </div>
            </label>
          </div>

          {!groupByCompany && (
            <div className="view-toggle">
              <button
                className={view === 'grid' ? 'active' : ''}
                onClick={() => setView('grid')}
              >
                Grid
              </button>
              <button
                className={view === 'list' ? 'active' : ''}
                onClick={() => setView('list')}
              >
                List
              </button>
            </div>
          )}
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
            {groupByCompany ? (
              renderCompanyView()
            ) : (
              <>
                {view === 'grid' && renderGridView()}
                {view === 'list' && renderListView()}
              </>
            )}
          </>
        )}
      </div>

      {showDeleteAllDialog && (
        <div className="modal-overlay">
          <div className="modal-dialog delete-all-dialog">
            <div className="modal-header">
              <h3>⚠️ Delete All Data</h3>
              <button
                className="close-button"
                onClick={handleCancelDeleteAll}
                title="Cancel"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <div className="warning-message">
                <p><strong>This action will permanently delete ALL of your data:</strong></p>
                <ul>
                  <li>All job positions and work history</li>
                  <li>All uploaded documents</li>
                  <li>All content chunks and embeddings</li>
                  <li>All generated resumes and exports</li>
                </ul>
                <p className="danger-text">
                  <strong>This action cannot be undone and there is no way to recover deleted data.</strong>
                </p>
              </div>

              <div className="confirmation-section">
                <label htmlFor="delete-confirm-input">
                  To confirm, type <strong>"DELETE ALL MY DATA"</strong> exactly:
                </label>
                <input
                  id="delete-confirm-input"
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type: DELETE ALL MY DATA"
                  className="delete-confirm-input"
                  autoFocus
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={handleCancelDeleteAll}
              >
                Cancel
              </button>
              <button
                className="btn-danger"
                onClick={handleDeleteAllData}
                disabled={deleteConfirmText !== 'DELETE ALL MY DATA' || loading}
              >
                {loading ? 'Deleting...' : 'Delete All Data'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCompanyActions && companyActionType === 'rename' && companyActionData && (
        <div className="modal-overlay">
          <div className="modal-dialog company-rename-dialog">
            <div className="modal-header">
              <h3>✏️ Rename Company</h3>
              <button
                className="close-button"
                onClick={() => setShowCompanyActions(false)}
                title="Cancel"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <p>Rename "{companyActionData.name}" across all {companyActionData.jobs.length} position{companyActionData.jobs.length !== 1 ? 's' : ''}:</p>

              <div className="company-rename-form">
                <label htmlFor="new-company-name">New Company Name:</label>
                <input
                  id="new-company-name"
                  type="text"
                  defaultValue={companyActionData.name}
                  className="company-name-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const newName = e.target.value.trim();
                      if (newName && newName !== companyActionData.name) {
                        performCompanyRename(companyActionData, newName);
                      }
                    }
                    if (e.key === 'Escape') {
                      setShowCompanyActions(false);
                    }
                  }}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setShowCompanyActions(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => {
                  const input = document.getElementById('new-company-name');
                  const newName = input.value.trim();
                  if (newName && newName !== companyActionData.name) {
                    performCompanyRename(companyActionData, newName);
                  }
                }}
              >
                Rename Company
              </button>
            </div>
          </div>
        </div>
      )}

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