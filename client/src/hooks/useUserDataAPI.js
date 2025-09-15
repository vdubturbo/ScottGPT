/**
 * Custom hook for User Data Management API integration
 */
import { useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = '/api/user';

export const useUserDataAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  // Helper function for API calls
  const apiCall = useCallback(async (apiFunc) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFunc();
      console.log('🔍 [API HOOK DEBUG] API call raw result:', result);
      console.log('🔍 [API HOOK DEBUG] Result status:', result.status);
      console.log('🔍 [API HOOK DEBUG] Result data type:', typeof result.data);
      console.log('🔍 [API HOOK DEBUG] Result data keys:', result.data ? Object.keys(result.data) : 'null/undefined');
      
      // The API returns { success: true, data: {...} }, so we need result.data.data
      const returnValue = result.data?.data || result.data;
      console.log('🔍 [API HOOK DEBUG] Returning value:', returnValue);
      console.log('🔍 [API HOOK DEBUG] Return value type:', typeof returnValue);
      
      return returnValue;
    } catch (err) {
      console.error('❌ [API HOOK DEBUG] API call error:', err);
      console.error('❌ [API HOOK DEBUG] Error response:', err.response?.data);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Work History API calls
  const getWorkHistory = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/work-history?${params}`));
  }, [apiCall]);

  const getExistingCompanies = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/work-history?groupByCompany=true`));
  }, [apiCall]);

  const getJobDetails = useCallback((id) => {
    return apiCall(() => axios.get(`${API_BASE}/sources/${id}`));
  }, [apiCall]);

  const updateJob = useCallback((id, jobData) => {
    return apiCall(() => axios.put(`${API_BASE}/sources/${id}`, jobData));
  }, [apiCall]);

  const deleteJob = useCallback((id) => {
    return apiCall(() => axios.delete(`${API_BASE}/sources/${id}?confirm=true`));
  }, [apiCall]);

  const bulkDeleteJobs = useCallback((ids) => {
    return apiCall(() => axios.delete(`${API_BASE}/sources/bulk?confirm=true`, {
      data: { ids }
    }));
  }, [apiCall]);

  // Duplicate Management API calls
  const detectDuplicates = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/duplicates/detect?${params}`));
  }, [apiCall]);

  const getDuplicatesSummary = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/duplicates/summary`));
  }, [apiCall]);

  const previewMerge = useCallback((sourceId, targetId, options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/duplicates/preview-merge`, {
      sourceId,
      targetId,
      options
    }));
  }, [apiCall]);

  const executeMerge = useCallback((sourceId, targetId, options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/duplicates/merge`, {
      sourceId,
      targetId,
      options,
      confirmed: true
    }));
  }, [apiCall]);

  const undoMerge = useCallback((mergeId) => {
    return apiCall(() => axios.post(`${API_BASE}/duplicates/undo-merge`, {
      mergeId,
      confirmed: true
    }));
  }, [apiCall]);

  const autoMerge = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/duplicates/auto-merge`, {
      ...options,
      confirmed: true
    }));
  }, [apiCall]);

  const getMergeCandidates = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/duplicates/merge-candidates?${params}`));
  }, [apiCall]);

  // Data Quality API calls
  const getDataQuality = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/data-quality`));
  }, [apiCall]);

  const validateData = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/validate`, options));
  }, [apiCall]);

  const getTimelineGaps = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/gaps`));
  }, [apiCall]);

  // Export API calls
  const getExportFormats = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/export/formats`));
  }, [apiCall]);

  const getExportStats = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/export/stats`));
  }, [apiCall]);

  const validateExport = useCallback((format, options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/export/validate`, { format, options }));
  }, [apiCall]);

  const previewExport = useCallback((format, options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/export/preview`, { format, options }));
  }, [apiCall]);

  const exportJSON = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/export/json?${params}`));
  }, [apiCall]);

  const exportCSV = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/export/csv?${params}`));
  }, [apiCall]);

  const exportResumeData = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/export/resume-data?${params}`));
  }, [apiCall]);

  const exportTimeline = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/export/timeline?${params}`));
  }, [apiCall]);

  // Resume Generation API calls
  const getResumeTemplates = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/generate/templates`));
  }, [apiCall]);

  const getResumeFormats = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/generate/formats`));
  }, [apiCall]);

  const validateResumeOptions = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/generate/validate`, options));
  }, [apiCall]);

  const previewResume = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/generate/preview`, options));
  }, [apiCall]);

  const generateResume = useCallback((options = {}) => {
    console.log(`🚀 [API HOOK DEBUG] Calling generateResume with options:`, options);
    return apiCall(() => {
      console.log(`🌐 [API HOOK DEBUG] Making POST request to: ${API_BASE}/generate/resume`);
      return axios.post(`${API_BASE}/generate/resume`, options);
    });
  }, [apiCall]);

  const generateAdvancedResume = useCallback((options = {}) => {
    console.log(`🚀 [ADVANCED API HOOK DEBUG] Calling generateAdvancedResume with options:`, options);
    return apiCall(() => {
      console.log(`🌐 [ADVANCED API HOOK DEBUG] Making POST request to: ${API_BASE}/advanced-generate/resume`);
      return axios.post(`${API_BASE}/advanced-generate/resume`, options);
    });
  }, [apiCall]);

  // Advanced Analysis API calls
  const getCompanyIntelligence = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/company-intelligence`));
  }, [apiCall]);

  const getSkillsAnalysis = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/skills-analysis?${params}`));
  }, [apiCall]);

  const suggestSkills = useCallback((jobId, options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/suggest-skills`, { jobId, options }));
  }, [apiCall]);

  const getQualityReport = useCallback((options = {}) => {
    const params = new URLSearchParams(options);
    return apiCall(() => axios.get(`${API_BASE}/quality-report?${params}`));
  }, [apiCall]);

  const getQualityScore = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/quality-score`));
  }, [apiCall]);

  const generateImprovementPlan = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/quality-improvement-plan`, options));
  }, [apiCall]);

  // Bulk Operations API calls
  const previewBulkOperation = useCallback((operationType, params) => {
    return apiCall(() => axios.post(`${API_BASE}/bulk/preview`, { operationType, params }));
  }, [apiCall]);

  const executeBulkOperation = useCallback((operationType, params, preview = false) => {
    return apiCall(() => axios.post(`${API_BASE}/bulk/execute`, { operationType, params, preview }));
  }, [apiCall]);

  const getBulkOperationStatus = useCallback((operationId) => {
    return apiCall(() => axios.get(`${API_BASE}/bulk/status/${operationId}`));
  }, [apiCall]);

  const cancelBulkOperation = useCallback((operationId) => {
    return apiCall(() => axios.delete(`${API_BASE}/bulk/cancel/${operationId}`));
  }, [apiCall]);

  const bulkUpdateSkills = useCallback((jobIds, operation, skills, preview = false) => {
    return apiCall(() => axios.post(`${API_BASE}/bulk/update-skills`, {
      jobIds, operation, skills, preview
    }));
  }, [apiCall]);

  const bulkFixDates = useCallback((fixes, preview = false) => {
    return apiCall(() => axios.post(`${API_BASE}/bulk/fix-dates`, { fixes, preview }));
  }, [apiCall]);

  const bulkMergeDuplicates = useCallback((mergeGroups, preview = false) => {
    return apiCall(() => axios.post(`${API_BASE}/bulk/merge-duplicates`, { mergeGroups, preview }));
  }, [apiCall]);

  // System Operations API calls
  const regenerateAllEmbeddings = useCallback((options = {}) => {
    return apiCall(() => axios.post(`${API_BASE}/regenerate-all-embeddings`, options));
  }, [apiCall]);

  const deleteAllUserData = useCallback((confirmText) => {
    return apiCall(() => axios.delete(`${API_BASE}/delete-all-data`, {
      data: {
        confirm: true,
        confirmText: confirmText
      }
    }));
  }, [apiCall]);

  // Document Management API calls
  const getUploadedDocuments = useCallback(async (options = {}) => {
    const params = new URLSearchParams(options);
    setLoading(true);
    setError(null);
    try {
      const result = await axios.get(`${API_BASE}/documents?${params}`);
      console.log('Documents API raw result:', result.data);
      // For documents endpoint, return the full response to get pagination
      return result.data;
    } catch (err) {
      console.error('API call error:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    clearError,
    
    // Work History
    getWorkHistory,
    getExistingCompanies,
    getJobDetails,
    updateJob,
    deleteJob,
    bulkDeleteJobs,
    
    // Duplicate Management
    detectDuplicates,
    getDuplicatesSummary,
    previewMerge,
    executeMerge,
    undoMerge,
    autoMerge,
    getMergeCandidates,
    
    // Data Quality
    getDataQuality,
    validateData,
    getTimelineGaps,
    
    // Export Functions
    getExportFormats,
    getExportStats,
    validateExport,
    previewExport,
    exportJSON,
    exportCSV,
    exportResumeData,
    exportTimeline,
    
    // Resume Generation
    getResumeTemplates,
    getResumeFormats,
    validateResumeOptions,
    previewResume,
    generateResume,
    generateAdvancedResume,
    
    // Advanced Analysis
    getCompanyIntelligence,
    getSkillsAnalysis,
    suggestSkills,
    getQualityReport,
    getQualityScore,
    generateImprovementPlan,
    
    // Bulk Operations
    previewBulkOperation,
    executeBulkOperation,
    getBulkOperationStatus,
    cancelBulkOperation,
    bulkUpdateSkills,
    bulkFixDates,
    bulkMergeDuplicates,
    
    // System Operations
    regenerateAllEmbeddings,
    deleteAllUserData,

    // Document Management
    getUploadedDocuments
  };
};

export default useUserDataAPI;