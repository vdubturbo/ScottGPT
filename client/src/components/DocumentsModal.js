// client/src/components/DocumentsModal.js
// Modal component to display list of uploaded documents

import React, { useState, useEffect } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import './DocumentsModal.css';

const DocumentsModal = ({ isOpen, onClose }) => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getUploadedDocuments } = useUserDataAPI();

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen]);

  const loadDocuments = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getUploadedDocuments();
      // Handle both the full response object and direct data array
      const docs = response?.data || response || [];
      setDocuments(Array.isArray(docs) ? docs : []);
    } catch (err) {
      console.error('Failed to load documents:', err);
      setError('Failed to load documents. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      'uploaded': { label: 'Uploaded', className: 'status-uploaded' },
      'normalized': { label: 'Normalized', className: 'status-normalized' },
      'extracted': { label: 'Extracted', className: 'status-extracted' },
      'indexed': { label: 'Indexed', className: 'status-indexed' },
      'processing': { label: 'Processing', className: 'status-processing' },
      'failed': { label: 'Failed', className: 'status-failed' }
    };
    const config = statusConfig[status] || { label: status || 'Unknown', className: 'status-unknown' };
    return <span className={`status-badge ${config.className}`}>{config.label}</span>;
  };

  return (
    <>
      <div className="modal-overlay" onClick={onClose} />
      <div className="modal-container">
        <div className="modal-header">
          <h2>📄 Uploaded Documents</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body">
          {loading && (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading documents...</p>
            </div>
          )}
          
          {error && (
            <div className="error-state">
              <p>{error}</p>
              <button className="btn btn-secondary" onClick={loadDocuments}>
                Retry
              </button>
            </div>
          )}
          
          {!loading && !error && documents.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">📂</div>
              <p>No documents uploaded yet</p>
              <p className="empty-subtitle">Upload documents from the Data Management tab</p>
            </div>
          )}
          
          {!loading && !error && documents.length > 0 && (
            <div className="documents-list">
              <div className="documents-stats">
                <span>Total: {documents.length} document{documents.length !== 1 ? 's' : ''}</span>
              </div>
              
              <div className="documents-table">
                <table>
                  <thead>
                    <tr>
                      <th>Document Name</th>
                      <th>Type</th>
                      <th>Size</th>
                      <th>Status</th>
                      <th>Upload Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td className="document-name">
                          <span title={doc.original_name}>{doc.original_name}</span>
                        </td>
                        <td className="document-type">{doc.document_type || 'Unknown'}</td>
                        <td className="document-size">{formatFileSize(doc.character_count)}</td>
                        <td className="document-status">{getStatusBadge(doc.processing_status)}</td>
                        <td className="document-date">{formatDate(doc.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </>
  );
};

export default DocumentsModal;