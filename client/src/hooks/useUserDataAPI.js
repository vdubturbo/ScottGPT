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
      console.log('API call raw result:', result);
      // The API returns { success: true, data: {...} }, so we need result.data.data
      return result.data?.data || result.data;
    } catch (err) {
      console.error('API call error:', err);
      const errorMessage = err.response?.data?.message || err.response?.data?.error || err.message;
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Work History API calls
  const getWorkHistory = useCallback(() => {
    return apiCall(() => axios.get(`${API_BASE}/work-history`));
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

  return {
    loading,
    error,
    clearError,
    
    // Work History
    getWorkHistory,
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
    getTimelineGaps
  };
};

export default useUserDataAPI;