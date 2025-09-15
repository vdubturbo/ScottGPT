/**
 * Custom React hook for managing company operations
 * Provides state management, error handling, and optimistic updates
 */

import { useState, useCallback, useRef } from 'react';
import { companyAPI, CompanyAPIError, CompanyAPIUtils } from '../services/companyApi';

/**
 * Hook for managing company operations with state management and error handling
 */
export const useCompanyOperations = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [operationStatus, setOperationStatus] = useState(null);
  const [optimisticUpdates, setOptimisticUpdates] = useState(new Map());

  // Track ongoing operations to prevent duplicates
  const ongoingOperations = useRef(new Set());

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Clear operation status
   */
  const clearStatus = useCallback(() => {
    setOperationStatus(null);
  }, []);

  /**
   * Generic operation handler with loading states and error handling
   */
  const handleOperation = useCallback(async (
    operationFn,
    operationId,
    optimisticUpdate = null
  ) => {
    // Prevent duplicate operations
    if (ongoingOperations.current.has(operationId)) {
      return { success: false, error: 'Operation already in progress' };
    }

    ongoingOperations.current.add(operationId);
    setLoading(true);
    setError(null);

    // Apply optimistic update if provided
    if (optimisticUpdate) {
      setOptimisticUpdates(prev => new Map(prev.set(operationId, optimisticUpdate)));
    }

    try {
      const result = await operationFn();

      setOperationStatus({
        type: 'success',
        message: 'Operation completed successfully',
        timestamp: new Date().toISOString(),
        details: result
      });

      // Clear optimistic update on success
      if (optimisticUpdate) {
        setOptimisticUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(operationId);
          return newMap;
        });
      }

      return { success: true, data: result };
    } catch (error) {
      console.error(`Operation ${operationId} failed:`, error);

      const formattedError = CompanyAPIUtils.formatErrorMessage(error);
      setError(formattedError);

      setOperationStatus({
        type: 'error',
        message: formattedError,
        timestamp: new Date().toISOString(),
        details: error.details || null
      });

      // Revert optimistic update on error
      if (optimisticUpdate) {
        setOptimisticUpdates(prev => {
          const newMap = new Map(prev);
          newMap.delete(operationId);
          return newMap;
        });
      }

      return { success: false, error: formattedError, details: error.details };
    } finally {
      setLoading(false);
      ongoingOperations.current.delete(operationId);
    }
  }, []);

  /**
   * Reassign a single job to a different company
   */
  const reassignJob = useCallback(async (sourceId, newCompanyName, options = {}) => {
    const operationId = `reassign-${sourceId}-${Date.now()}`;

    const optimisticUpdate = options.enableOptimistic ? {
      type: 'reassign',
      sourceId,
      oldCompany: options.oldCompany,
      newCompany: newCompanyName,
      timestamp: new Date().toISOString()
    } : null;

    return handleOperation(
      () => companyAPI.reassignJobToCompany(sourceId, newCompanyName, options),
      operationId,
      optimisticUpdate
    );
  }, [handleOperation]);

  /**
   * Bulk reassign multiple jobs to the same company
   */
  const bulkReassignJobs = useCallback(async (sourceIds, newCompanyName, options = {}) => {
    const operationId = `bulk-reassign-${sourceIds.length}-${Date.now()}`;

    // Validate bulk operation
    const validation = CompanyAPIUtils.validateBulkOperation(sourceIds, 'reassign');
    if (!validation.valid) {
      setError(validation.message);
      return { success: false, error: validation.message };
    }

    const optimisticUpdate = options.enableOptimistic ? {
      type: 'bulk-reassign',
      sourceIds,
      newCompany: newCompanyName,
      count: sourceIds.length,
      timestamp: new Date().toISOString()
    } : null;

    return handleOperation(
      () => companyAPI.bulkReassignToCompany(sourceIds, newCompanyName, options),
      operationId,
      optimisticUpdate
    );
  }, [handleOperation]);

  /**
   * Merge multiple companies into one
   */
  const mergeCompanies = useCallback(async (sourceCompanies, targetCompany, options = {}) => {
    const operationId = `merge-${sourceCompanies.length}-${Date.now()}`;

    if (!Array.isArray(sourceCompanies) || sourceCompanies.length === 0) {
      const errorMsg = 'No source companies specified for merge';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const optimisticUpdate = options.enableOptimistic ? {
      type: 'merge',
      sourceCompanies,
      targetCompany,
      timestamp: new Date().toISOString()
    } : null;

    return handleOperation(
      () => companyAPI.mergeCompanies(sourceCompanies, targetCompany, options),
      operationId,
      optimisticUpdate
    );
  }, [handleOperation]);

  /**
   * Split a company by moving positions to a new company
   */
  const splitCompany = useCallback(async (sourceCompany, positionIds, newCompanyName, options = {}) => {
    const operationId = `split-${sourceCompany}-${Date.now()}`;

    if (!Array.isArray(positionIds) || positionIds.length === 0) {
      const errorMsg = 'No positions specified for company split';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const optimisticUpdate = options.enableOptimistic ? {
      type: 'split',
      sourceCompany,
      newCompanyName,
      positionIds,
      timestamp: new Date().toISOString()
    } : null;

    return handleOperation(
      () => companyAPI.splitCompany(sourceCompany, positionIds, newCompanyName, options),
      operationId,
      optimisticUpdate
    );
  }, [handleOperation]);

  /**
   * Rename a company
   */
  const renameCompany = useCallback(async (oldCompanyName, newCompanyName, options = {}) => {
    const operationId = `rename-${oldCompanyName}-${Date.now()}`;

    if (!oldCompanyName || !newCompanyName) {
      const errorMsg = 'Both old and new company names are required';
      setError(errorMsg);
      return { success: false, error: errorMsg };
    }

    const optimisticUpdate = options.enableOptimistic ? {
      type: 'rename',
      oldCompanyName,
      newCompanyName,
      timestamp: new Date().toISOString()
    } : null;

    return handleOperation(
      () => companyAPI.renameCompany(oldCompanyName, newCompanyName, options),
      operationId,
      optimisticUpdate
    );
  }, [handleOperation]);

  /**
   * Validate company name
   */
  const validateCompanyName = useCallback(async (companyName) => {
    try {
      return await companyAPI.validateCompanyName(companyName);
    } catch (error) {
      console.error('Company name validation failed:', error);
      return {
        valid: false,
        message: CompanyAPIUtils.formatErrorMessage(error),
        suggestions: []
      };
    }
  }, []);

  /**
   * Validate reassignment before executing
   */
  const validateReassignment = useCallback(async (sourceId, newCompanyName) => {
    const operationId = `validate-${sourceId}-${Date.now()}`;

    return handleOperation(
      () => companyAPI.validateReassignment(sourceId, newCompanyName),
      operationId
    );
  }, [handleOperation]);

  /**
   * Get company statistics
   */
  const getCompanyStats = useCallback(async () => {
    const operationId = `stats-${Date.now()}`;

    return handleOperation(
      () => companyAPI.getCompanyStatistics(),
      operationId
    );
  }, [handleOperation]);

  /**
   * Check if any operations are currently loading
   */
  const isAnyOperationLoading = useCallback(() => {
    return loading || ongoingOperations.current.size > 0;
  }, [loading]);

  /**
   * Get optimistic update for a specific operation
   */
  const getOptimisticUpdate = useCallback((operationId) => {
    return optimisticUpdates.get(operationId);
  }, [optimisticUpdates]);

  /**
   * Get all current optimistic updates
   */
  const getAllOptimisticUpdates = useCallback(() => {
    return Array.from(optimisticUpdates.values());
  }, [optimisticUpdates]);

  /**
   * Cancel all optimistic updates (useful for reloading fresh data)
   */
  const clearOptimisticUpdates = useCallback(() => {
    setOptimisticUpdates(new Map());
  }, []);

  /**
   * Format operation results for display
   */
  const formatResults = useCallback((results) => {
    return CompanyAPIUtils.formatOperationResults(results);
  }, []);

  return {
    // State
    loading,
    error,
    operationStatus,

    // Operations
    reassignJob,
    bulkReassignJobs,
    mergeCompanies,
    splitCompany,
    renameCompany,

    // Validation
    validateCompanyName,
    validateReassignment,

    // Utilities
    getCompanyStats,
    formatResults,

    // State management
    clearError,
    clearStatus,
    isAnyOperationLoading,

    // Optimistic updates
    getOptimisticUpdate,
    getAllOptimisticUpdates,
    clearOptimisticUpdates,
  };
};

export default useCompanyOperations;