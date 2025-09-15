/**
 * Company API Service
 * Handles all API operations related to company management and reassignment
 */

import axios from 'axios';

class CompanyAPIError extends Error {
  constructor(message, statusCode, details = null) {
    super(message);
    this.name = 'CompanyAPIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Company API Service for managing work history company operations
 */
export class CompanyAPIService {
  constructor() {
    this.baseURL = '/api/user';
  }

  /**
   * Generic API request handler with error handling and retries
   */
  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseURL}${endpoint}`;

    try {
      const response = await axios({
        url,
        method: options.method || 'GET',
        data: options.data,
        headers: options.headers,
        ...options
      });

      return response.data;
    } catch (error) {
      if (error.response) {
        // Server responded with error status
        const errorMessage = error.response.data?.message || error.response.data?.error || `Request failed with status ${error.response.status}`;
        throw new CompanyAPIError(errorMessage, error.response.status, error.response.data);
      } else if (error.request) {
        // Network error
        throw new CompanyAPIError('Network error: Failed to fetch', 0, { originalError: error.message });
      } else {
        // Other error
        throw new CompanyAPIError('Network error: ' + error.message, 0, { originalError: error.message });
      }
    }
  }

  /**
   * Reassign a job position to a different company
   * @param {string} sourceId - ID of the source/job position
   * @param {string} newCompanyName - New company name to assign to
   * @param {Object} options - Additional options for the reassignment
   * @returns {Promise<Object>} Updated source data
   */
  async reassignJobToCompany(sourceId, newCompanyName, options = {}) {
    const {
      preserveEmbeddings = false,
      validateCompanyName = true,
      notifyUser = true
    } = options;

    if (!sourceId || !newCompanyName) {
      throw new CompanyAPIError(
        'Source ID and new company name are required',
        400,
        { sourceId, newCompanyName }
      );
    }

    const payload = {
      newCompanyName: newCompanyName.trim(),
      preserveEmbeddings,
      validateCompanyName,
      notifyUser,
      timestamp: new Date().toISOString()
    };

    return this.makeRequest(`/sources/${sourceId}/reassign-company`, {
      method: 'PUT',
      data: payload
    });
  }

  /**
   * Bulk reassign multiple positions to the same company
   * @param {Array<string>} sourceIds - Array of source IDs to reassign
   * @param {string} newCompanyName - New company name
   * @param {Object} options - Additional options
   * @returns {Promise<Object>} Bulk operation results
   */
  async bulkReassignToCompany(sourceIds, newCompanyName, options = {}) {
    if (!Array.isArray(sourceIds) || sourceIds.length === 0) {
      throw new CompanyAPIError('Source IDs array is required and cannot be empty', 400);
    }

    const results = {
      successful: [],
      failed: [],
      total: sourceIds.length
    };

    // Process reassignments in parallel with concurrency limit
    const CONCURRENCY_LIMIT = 3;
    const chunks = this.chunkArray(sourceIds, CONCURRENCY_LIMIT);

    for (const chunk of chunks) {
      const promises = chunk.map(async (sourceId) => {
        try {
          const result = await this.reassignJobToCompany(sourceId, newCompanyName, options);
          results.successful.push({ sourceId, result });
          return { sourceId, success: true, result };
        } catch (error) {
          results.failed.push({ sourceId, error: error.message, details: error.details });
          return { sourceId, success: false, error };
        }
      });

      await Promise.all(promises);
    }

    return results;
  }

  /**
   * Merge multiple companies into one target company
   * @param {Array<string>} sourceCompanyNames - Companies to merge from
   * @param {string} targetCompanyName - Target company to merge into
   * @param {Object} options - Merge options
   * @returns {Promise<Object>} Merge operation results
   */
  async mergeCompanies(sourceCompanyNames, targetCompanyName, options = {}) {
    if (!Array.isArray(sourceCompanyNames) || sourceCompanyNames.length === 0) {
      throw new CompanyAPIError('Source company names array is required', 400);
    }

    // First, get all positions for the source companies
    const positionsToReassign = await this.getPositionsByCompanies(sourceCompanyNames);

    if (positionsToReassign.length === 0) {
      throw new CompanyAPIError('No positions found for the specified companies', 404);
    }

    // Bulk reassign all positions to the target company
    const sourceIds = positionsToReassign.map(pos => pos.id);
    return this.bulkReassignToCompany(sourceIds, targetCompanyName, {
      ...options,
      operation: 'merge',
      sourceCompanies: sourceCompanyNames
    });
  }

  /**
   * Split a company by moving specified positions to a new company
   * @param {string} sourceCompanyName - Original company name
   * @param {Array<string>} positionIds - Position IDs to move to new company
   * @param {string} newCompanyName - New company name for split positions
   * @param {Object} options - Split options
   * @returns {Promise<Object>} Split operation results
   */
  async splitCompany(sourceCompanyName, positionIds, newCompanyName, options = {}) {
    if (!Array.isArray(positionIds) || positionIds.length === 0) {
      throw new CompanyAPIError('Position IDs array is required for company split', 400);
    }

    return this.bulkReassignToCompany(positionIds, newCompanyName, {
      ...options,
      operation: 'split',
      sourceCompany: sourceCompanyName
    });
  }

  /**
   * Rename a company (reassign all positions to new company name)
   * @param {string} oldCompanyName - Current company name
   * @param {string} newCompanyName - New company name
   * @param {Object} options - Rename options
   * @returns {Promise<Object>} Rename operation results
   */
  async renameCompany(oldCompanyName, newCompanyName, options = {}) {
    if (!oldCompanyName || !newCompanyName) {
      throw new CompanyAPIError('Both old and new company names are required', 400);
    }

    if (oldCompanyName.trim() === newCompanyName.trim()) {
      throw new CompanyAPIError('New company name must be different from the current name', 400);
    }

    // Get all positions for the company
    const positions = await this.getPositionsByCompanies([oldCompanyName]);

    if (positions.length === 0) {
      throw new CompanyAPIError(`No positions found for company "${oldCompanyName}"`, 404);
    }

    const sourceIds = positions.map(pos => pos.id);
    return this.bulkReassignToCompany(sourceIds, newCompanyName, {
      ...options,
      operation: 'rename',
      oldCompanyName
    });
  }

  /**
   * Get all positions for specified companies
   * @param {Array<string>} companyNames - Array of company names
   * @returns {Promise<Array>} Array of position objects
   */
  async getPositionsByCompanies(companyNames) {
    if (!Array.isArray(companyNames)) {
      companyNames = [companyNames];
    }

    // Use the existing work history endpoint with company filtering
    const workHistory = await this.makeRequest('/work-history?groupByCompany=false');

    if (!workHistory || !workHistory.jobs) {
      return [];
    }

    // Filter positions by company names (case-insensitive)
    const normalizedCompanyNames = companyNames.map(name => name.toLowerCase().trim());

    return workHistory.jobs.filter(job =>
      job.org && normalizedCompanyNames.includes(job.org.toLowerCase().trim())
    );
  }

  /**
   * Validate company reassignment before executing
   * @param {string} sourceId - Source ID to validate
   * @param {string} newCompanyName - New company name to validate
   * @returns {Promise<Object>} Validation results
   */
  async validateReassignment(sourceId, newCompanyName) {
    const payload = {
      newCompanyName: newCompanyName.trim(),
      validateOnly: true
    };

    return this.makeRequest(`/sources/${sourceId}/reassign-company`, {
      method: 'POST', // Use POST for validation-only requests
      data: payload
    });
  }

  /**
   * Get company statistics and grouping information
   * @returns {Promise<Object>} Company statistics
   */
  async getCompanyStatistics() {
    return this.makeRequest('/companies/stats');
  }

  /**
   * Utility function to chunk arrays for batch processing
   * @param {Array} array - Array to chunk
   * @param {number} size - Chunk size
   * @returns {Array<Array>} Chunked arrays
   */
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Check if a company name is valid and available
   * @param {string} companyName - Company name to check
   * @returns {Promise<Object>} Validation result
   */
  async validateCompanyName(companyName) {
    if (!companyName || companyName.trim().length === 0) {
      return {
        valid: false,
        message: 'Company name cannot be empty',
        suggestions: []
      };
    }

    const trimmedName = companyName.trim();

    // Check for minimum length
    if (trimmedName.length < 2) {
      return {
        valid: false,
        message: 'Company name must be at least 2 characters long',
        suggestions: []
      };
    }

    // Check for maximum length
    if (trimmedName.length > 100) {
      return {
        valid: false,
        message: 'Company name cannot exceed 100 characters',
        suggestions: []
      };
    }

    // Check for invalid characters (basic validation)
    const invalidChars = /[<>{}[\]\\\/|`~!@#$%^&*()+=?]/;
    if (invalidChars.test(trimmedName)) {
      return {
        valid: false,
        message: 'Company name contains invalid characters',
        suggestions: [trimmedName.replace(invalidChars, '')]
      };
    }

    return {
      valid: true,
      message: 'Company name is valid',
      normalizedName: trimmedName
    };
  }

  /**
   * Get operation status for long-running company operations
   * @param {string} operationId - Operation ID to check
   * @returns {Promise<Object>} Operation status
   */
  async getOperationStatus(operationId) {
    return this.makeRequest(`/operations/${operationId}/status`);
  }
}

// Export singleton instance
export const companyAPI = new CompanyAPIService();

// Export error class for error handling
export { CompanyAPIError };

// Export utility functions
export const CompanyAPIUtils = {
  /**
   * Format company operation results for UI display
   */
  formatOperationResults(results) {
    const { successful, failed, total } = results;

    return {
      summary: `${successful.length} of ${total} operations completed successfully`,
      successRate: ((successful.length / total) * 100).toFixed(1),
      hasErrors: failed.length > 0,
      errors: failed.map(f => ({
        id: f.sourceId,
        message: f.error,
        details: f.details
      }))
    };
  },

  /**
   * Create user-friendly error messages
   */
  formatErrorMessage(error) {
    if (error instanceof CompanyAPIError) {
      switch (error.statusCode) {
        case 400:
          return `Invalid request: ${error.message}`;
        case 401:
          return 'Please log in to perform this action';
        case 403:
          return 'You do not have permission to perform this action';
        case 404:
          return 'The requested item was not found';
        case 429:
          return 'Too many requests. Please try again in a moment';
        case 500:
          return 'Server error. Please try again later';
        default:
          return error.message || 'An unexpected error occurred';
      }
    }

    return error.message || 'An unexpected error occurred';
  },

  /**
   * Validate bulk operation input
   */
  validateBulkOperation(items, operation) {
    if (!Array.isArray(items) || items.length === 0) {
      return {
        valid: false,
        message: `No items selected for ${operation}`
      };
    }

    if (items.length > 50) {
      return {
        valid: false,
        message: `Cannot ${operation} more than 50 items at once`
      };
    }

    return { valid: true };
  }
};