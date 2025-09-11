// client/src/components/JobDescriptionModal.js
// Modal for pasting and validating job descriptions

import React, { useState, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { validateJobDescription } from '../lib/validations';
import './JobDescriptionModal.css';

const JobDescriptionModal = ({ 
  isOpen, 
  onSubmit, 
  onClose, 
  isGenerating, 
  error 
}) => {
  const [content, setContent] = useState('');
  const [localError, setLocalError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleContentChange = useCallback((e) => {
    const value = e.target.value;
    setContent(value);
    setLocalError('');

    // Real-time character count and basic validation
    if (value.length > 10000) {
      setLocalError('Job description cannot exceed 10,000 characters');
    }
  }, []);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setLocalError('');
    setIsValidating(true);

    try {
      // Validate the job description
      await validateJobDescription(content);
      
      // If validation passes, submit
      onSubmit(content, {
        style: 'professional',
        includeSkillsMatch: true,
        prioritizeKeywords: true
      });
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setIsValidating(false);
    }
  }, [content, onSubmit]);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setContent(text);
      setLocalError('');
    } catch (err) {
      setLocalError('Unable to access clipboard. Please paste manually.');
    }
  }, []);

  const isContentValid = content.length >= 50 && content.length <= 10000;
  const displayError = localError || error;

  return (
    <Dialog.Root open={isOpen} onOpenChange={() => !isGenerating && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content job-description-modal">
          <Dialog.Title className="dialog-title">
            Generate ATS-Optimized Resume
          </Dialog.Title>
          
          <Dialog.Description className="dialog-description">
            Paste a job description below and we'll generate a tailored resume 
            optimized for Applicant Tracking Systems (ATS).
          </Dialog.Description>

          <form onSubmit={handleSubmit} className="modal-form">
            <div className="form-group">
              <label htmlFor="job-description" className="form-label">
                Job Description
              </label>
              
              <div className="textarea-container">
                <textarea
                  id="job-description"
                  value={content}
                  onChange={handleContentChange}
                  placeholder="Paste the job description here... Include job title, responsibilities, requirements, and qualifications for best results."
                  className={`form-textarea ${displayError ? 'error' : ''}`}
                  rows={15}
                  disabled={isGenerating}
                  aria-describedby={displayError ? 'jd-error' : 'jd-help'}
                />
                
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  className="paste-button"
                  disabled={isGenerating}
                  title="Paste from clipboard"
                >
                  📋 Paste
                </button>
              </div>

              <div className="form-help" id="jd-help">
                <div className="character-count">
                  {content.length}/10,000 characters
                  {content.length < 50 && (
                    <span className="min-requirement">
                      (minimum 50 characters)
                    </span>
                  )}
                </div>
              </div>

              {displayError && (
                <div className="form-error" id="jd-error" role="alert">
                  {displayError}
                </div>
              )}
            </div>

            <div className="modal-actions">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={isGenerating}
                >
                  Cancel
                </button>
              </Dialog.Close>
              
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isContentValid || isGenerating || isValidating}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner" aria-hidden="true"></span>
                    Generating Resume...
                  </>
                ) : isValidating ? (
                  'Validating...'
                ) : (
                  'Generate Resume'
                )}
              </button>
            </div>
          </form>

          <div className="modal-tips">
            <h4>💡 Tips for best results:</h4>
            <ul>
              <li>Include the complete job posting with requirements and qualifications</li>
              <li>Ensure technical skills and tools are clearly mentioned</li>
              <li>Include both hard and soft skills from the job description</li>
              <li>The more detailed the job description, the better the resume match</li>
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default JobDescriptionModal;