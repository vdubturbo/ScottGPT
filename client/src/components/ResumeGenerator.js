// client/src/components/ResumeGenerator.js
// Main Resume Generator component with pane-based layout (no modal)

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ResumeEditor from './ResumeEditor';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import { validateJobDescription } from '../lib/validations';
import { extractKeywords } from '../lib/keywordExtraction';
import './ResumeGenerator.css';

const ResumeGenerator = () => {
  const { generateResume, loading, error: apiError } = useUserDataAPI();
  
  const [jobDescription, setJobDescription] = useState('');
  const [jobKeywords, setJobKeywords] = useState(null);
  const [generatedResume, setGeneratedResume] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [resumeMetadata, setResumeMetadata] = useState(null);
  const [localError, setLocalError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  const handleJobDescriptionChange = useCallback((e) => {
    const value = e.target.value;
    setJobDescription(value);
    setLocalError('');

    // Real-time character count and basic validation
    if (value.length > 10000) {
      setLocalError('Job description cannot exceed 10,000 characters');
    }
  }, []);

  const handlePasteFromClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      setJobDescription(text);
      setLocalError('');
    } catch (err) {
      setLocalError('Unable to access clipboard. Please paste manually.');
    }
  }, []);

  const handleJobDescriptionSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLocalError('');
    setIsValidating(true);

    try {
      // Validate the job description
      await validateJobDescription(jobDescription);
    } catch (err) {
      setLocalError(err.message);
      setIsValidating(false);
      return;
    }

    setIsValidating(false);
    setIsGenerating(true);

    try {
      // Validate job description
      const validatedJD = validateJobDescription(jobDescription);

      // Extract keywords for matching
      const keywords = extractKeywords(validatedJD.content);
      setJobKeywords(keywords);

      // Call real API for resume generation
      const response = await generateResume({
        jobDescription: validatedJD.content,
        style: 'professional',
        maxBulletPoints: 5,
        prioritizeKeywords: true,
        outputFormat: 'json'
      });

      console.log('🔍 [FRONTEND DEBUG] Resume generation response:', response);
      console.log('🔍 [FRONTEND DEBUG] Response type:', typeof response);
      console.log('🔍 [FRONTEND DEBUG] Response keys:', response ? Object.keys(response) : 'null/undefined');
      console.log('🔍 [FRONTEND DEBUG] Has response.resume:', !!response?.resume);
      console.log('🔍 [FRONTEND DEBUG] Has response.data:', !!response?.data);
      console.log('🔍 [FRONTEND DEBUG] Has response.data.resumeHTML:', !!response?.data?.resumeHTML);
      console.log('🔍 [FRONTEND DEBUG] Has response.resumeHTML:', !!response?.resumeHTML);

      if (response && (response.resume || response.data?.resumeHTML || response.resumeHTML)) {
        // Handle different response formats from API
        const resumeContent = response.resume?.content || response.resume || response.data?.resumeHTML || response.resumeHTML;
        const matchScore = response.matchScore || response.data?.matchScore || response.resume?.matchScore || 0;
        const extractedKeywords = response.extractedKeywords || response.data?.extractedKeywords || response.keywordMatches || response.resume?.keywordMatches || {};
        
        console.log('✅ [FRONTEND DEBUG] Resume content length:', resumeContent?.length || 0);
        console.log('✅ [FRONTEND DEBUG] Match score:', matchScore);
        
        setGeneratedResume(resumeContent);
        setResumeMetadata({
          matchScore: matchScore,
          keywordMatches: extractedKeywords,
          suggestions: response.suggestions || response.data?.suggestions || response.resume?.suggestions || []
        });
      } else {
        console.error('❌ [FRONTEND DEBUG] Invalid response format detected');
        console.error('❌ [FRONTEND DEBUG] Full response:', JSON.stringify(response, null, 2));
        throw new Error(response?.error || 'Failed to generate resume - invalid response format');
      }
    } catch (err) {
      console.error('Resume generation error:', err);
      setError(err.message || apiError || 'An error occurred while generating the resume');
    } finally {
      setIsGenerating(false);
    }
  }, [jobDescription, generateResume, apiError]);

  const handleClearResume = useCallback(() => {
    setGeneratedResume('');
    setJobKeywords(null);
    setResumeMetadata(null);
    setError('');
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (!jobDescription) return;
    
    const confirmed = window.confirm(
      'This will overwrite your current resume content. Are you sure?'
    );
    
    if (confirmed) {
      // Create a fake event object for the submit handler
      const fakeEvent = { preventDefault: () => {} };
      await handleJobDescriptionSubmit(fakeEvent);
    }
  }, [jobDescription, handleJobDescriptionSubmit]);

  const isContentValid = jobDescription.length >= 50 && jobDescription.length <= 10000;
  const displayError = localError || error;
  const hasGeneratedResume = generatedResume.length > 0;

  return (
    <div className="resume-generator">
      <div className="generator-header">
        <h1>Generate ATS-Optimized Resume</h1>
        <p>Paste a job description and we'll generate a tailored resume optimized for Applicant Tracking Systems.</p>
      </div>
      
      <div className="generator-layout">
        {/* Left Pane - Job Description Input */}
        <div className="input-pane">
          <div className="pane-header">
            <h2>Job Description</h2>
            <span className="character-count">
              {jobDescription.length}/10,000 characters
              {jobDescription.length < 50 && (
                <span className="min-requirement">
                  (minimum 50 required)
                </span>
              )}
            </span>
          </div>
          
          <form onSubmit={handleJobDescriptionSubmit} className="job-form">
            <div className="textarea-container">
              <textarea
                id="job-description"
                value={jobDescription}
                onChange={handleJobDescriptionChange}
                placeholder="Paste the job description here...

Include job title, responsibilities, requirements, and qualifications for best results."
                className={`job-textarea ${displayError ? 'error' : ''}`}
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

            {displayError && (
              <div className="form-error" id="jd-error" role="alert">
                {displayError}
              </div>
            )}

            <div className="form-actions">
              {hasGeneratedResume && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={handleClearResume}
                  disabled={isGenerating}
                >
                  Clear Resume
                </button>
              )}
              
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isContentValid || isGenerating || isValidating}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner-small" aria-hidden="true"></span>
                    Generating...
                  </>
                ) : isValidating ? (
                  'Validating...'
                ) : hasGeneratedResume ? (
                  'Regenerate Resume'
                ) : (
                  'Generate Resume'
                )}
              </button>
            </div>
          </form>

          <div className="input-tips">
            <h4>💡 Tips for best results:</h4>
            <ul>
              <li>Include the complete job posting with requirements</li>
              <li>Ensure technical skills and tools are clearly mentioned</li>
              <li>Include both hard and soft skills from the description</li>
              <li>More detailed descriptions produce better matches</li>
            </ul>
          </div>
        </div>

        {/* Right Pane - Resume Output */}
        <div className="output-pane">
          {!hasGeneratedResume ? (
            <div className="empty-state">
              <div className="empty-content">
                <h3>Your generated resume will appear here</h3>
                <p>Paste a job description on the left and click "Generate Resume" to get started.</p>
                <div className="empty-features">
                  <div className="feature">
                    <span className="feature-icon">🎯</span>
                    <span>ATS-optimized formatting</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">📊</span>
                    <span>Keyword matching score</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">✏️</span>
                    <span>Full editing capabilities</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">📄</span>
                    <span>Multiple export formats</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="editor-container"
            >
              <ResumeEditor
                content={generatedResume}
                jobKeywords={jobKeywords}
                jobDescription={jobDescription}
                metadata={resumeMetadata}
                onBack={handleClearResume}
                onRegenerate={handleRegenerate}
                isRegenerating={isGenerating}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeGenerator;