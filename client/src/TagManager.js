import React, { useState, useEffect } from 'react';
import './TagManager.css';

function TagManager() {
  const [pendingTags, setPendingTags] = useState([]);
  const [approvedTags, setApprovedTags] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  // Load tags on component mount
  useEffect(() => {
    loadPendingTags();
    loadApprovedTags();
  }, []);

  const loadPendingTags = async () => {
    try {
      const response = await fetch('/api/tags/pending');
      const data = await response.json();
      if (data.success) {
        setPendingTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to load pending tags:', error);
      setMessage('Failed to load pending tags');
    }
  };

  const loadApprovedTags = async () => {
    try {
      const response = await fetch('/api/tags/approved');
      const data = await response.json();
      if (data.success) {
        setApprovedTags(data.tags);
      }
    } catch (error) {
      console.error('Failed to load approved tags:', error);
    }
  };

  const handleTagSelection = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleApprove = async () => {
    if (selectedTags.length === 0) {
      setMessage('Please select tags to approve');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/tags/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selectedTags })
      });

      const data = await response.json();
      if (data.success) {
        setMessage(`✅ Approved ${data.approved.length} tags`);
        setSelectedTags([]);
        await loadPendingTags();
        await loadApprovedTags();
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to approve tags:', error);
      setMessage('Failed to approve tags');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (selectedTags.length === 0) {
      setMessage('Please select tags to reject');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/tags/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: selectedTags })
      });

      const data = await response.json();
      if (data.success) {
        setMessage(`🗑️ Rejected ${data.rejected.length} tags`);
        setSelectedTags([]);
        await loadPendingTags();
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      console.error('Failed to reject tags:', error);
      setMessage('Failed to reject tags');
    } finally {
      setLoading(false);
    }
  };

  const selectAll = () => {
    if (activeTab === 'pending') {
      setSelectedTags(pendingTags.map(t => t.tag));
    }
  };

  const selectNone = () => {
    setSelectedTags([]);
  };

  return (
    <div className="tag-manager">
      <h2>🏷️ Tag Vocabulary Manager</h2>
      
      {message && (
        <div className="message">{message}</div>
      )}

      <div className="tabs">
        <button 
          className={activeTab === 'pending' ? 'active' : ''}
          onClick={() => {
            setActiveTab('pending');
            setSelectedTags([]);
          }}
        >
          Pending Tags ({pendingTags.length})
        </button>
        <button 
          className={activeTab === 'approved' ? 'active' : ''}
          onClick={() => {
            setActiveTab('approved');
            setSelectedTags([]);
          }}
        >
          Approved Tags ({approvedTags.length})
        </button>
      </div>

      {activeTab === 'pending' && (
        <>
          <div className="actions">
            <button onClick={selectAll} disabled={loading}>
              Select All
            </button>
            <button onClick={selectNone} disabled={loading}>
              Select None
            </button>
            <button 
              onClick={handleApprove} 
              disabled={loading || selectedTags.length === 0}
              className="approve-btn"
            >
              ✅ Approve Selected ({selectedTags.length})
            </button>
            <button 
              onClick={handleReject} 
              disabled={loading || selectedTags.length === 0}
              className="reject-btn"
            >
              ❌ Reject Selected ({selectedTags.length})
            </button>
          </div>

          <div className="tags-grid">
            {pendingTags.length === 0 ? (
              <div className="no-tags">No pending tags</div>
            ) : (
              pendingTags.map((tagObj) => (
                <div 
                  key={tagObj.tag}
                  className={`tag-card ${selectedTags.includes(tagObj.tag) ? 'selected' : ''}`}
                  onClick={() => handleTagSelection(tagObj.tag)}
                >
                  <div className="tag-name">{tagObj.tag}</div>
                  <div className="tag-info">
                    <span className="occurrences">
                      {tagObj.occurrences} occurrence{tagObj.occurrences !== 1 ? 's' : ''}
                    </span>
                    <span className="first-seen">
                      First seen: {new Date(tagObj.firstSeen).toLocaleDateString()}
                    </span>
                  </div>
                  {tagObj.context && (
                    <div className="tag-context">
                      <div className="context-file">📁 {tagObj.context.file}</div>
                      {tagObj.context.additionalFiles && tagObj.context.additionalFiles.length > 0 && (
                        <div className="additional-files">
                          +{tagObj.context.additionalFiles.length} more files
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === 'approved' && (
        <div className="approved-tags">
          {approvedTags.length === 0 ? (
            <div className="no-tags">No approved tags yet</div>
          ) : (
            <div className="tags-list">
              {approvedTags.map((tag) => (
                <span key={tag} className="approved-tag">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TagManager;