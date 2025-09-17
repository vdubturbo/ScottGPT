// client/src/components/ResumeGenerator.js
// Main Resume Generator component with pane-based layout (no modal)

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ResumeEditor from './ResumeEditor';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import { useBilling } from '../contexts/BillingContext';
import { validateJobDescription } from '../lib/validations';
import { extractKeywords } from '../lib/keywordExtraction';
import UsageTracker from './billing/UsageTracker';
import './ResumeGenerator.css';

const ResumeGenerator = () => {
  const { generateResume, loading, error: apiError } = useUserDataAPI();
  const {
    usage,
    isAtLimit,
    isPremium,
    usagePercentage,
    checkUsage,
    incrementUsage
  } = useBilling();

  const [jobDescription, setJobDescription] = useState('');
  const [jobKeywords, setJobKeywords] = useState(null);
  const [generatedResume, setGeneratedResume] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [resumeMetadata, setResumeMetadata] = useState(null);
  const [localError, setLocalError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [currentPhase, setCurrentPhase] = useState('input'); // 'input' or 'editor'

  const handleJobDescriptionChange = useCallback((e) => {
    const value = e.target.value;
    setJobDescription(value);
    setLocalError('');

    // Real-time character count and basic validation
    if (value.length > 10000) {
      setLocalError('Job description cannot exceed 10,000 characters');
    }
  }, []);


  const handleJobDescriptionSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    setLocalError('');
    setIsValidating(true);

    // Check if user has reached their limit
    if (isAtLimit) {
      setLocalError('I\'m sorry, that\'s all the resumes for today. A subscription service is coming soon to provide more access!');
      setIsValidating(false);
      return;
    }

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
          suggestions: response.suggestions || response.data?.suggestions || response.resume?.suggestions || [],
          usage: response.usage // Include usage info from response
        });
        setCurrentPhase('editor'); // Transition to editor phase

        // Increment usage count for successful generation
        await incrementUsage(1);

        console.log('✅ [FRONTEND DEBUG] Usage incremented after successful resume generation');
      } else {
        console.error('❌ [FRONTEND DEBUG] Invalid response format detected');
        console.error('❌ [FRONTEND DEBUG] Full response:', JSON.stringify(response, null, 2));
        throw new Error(response?.error || 'Failed to generate resume - invalid response format');
      }
    } catch (err) {
      console.error('Resume generation error:', err);

      // Handle billing-specific errors
      if (err.response?.status === 429 && err.response?.data?.code === 'RESUME_LIMIT_EXCEEDED') {
        setError('I\'m sorry, that\'s all the resumes for today. A subscription service is coming soon to provide more access!');
      } else {
        setError(err.message || apiError || 'An error occurred while generating the resume');
      }
    } finally {
      setIsGenerating(false);
    }
  }, [jobDescription, generateResume, apiError, isAtLimit, checkUsage]);

  const handleClearResume = useCallback(() => {
    setGeneratedResume('');
    setJobKeywords(null);
    setResumeMetadata(null);
    setError('');
    setCurrentPhase('input'); // Return to input phase
  }, []);

  const handleBackToJobDescription = useCallback(() => {
    // Keep resume data but go back to input phase
    setError('');
    setCurrentPhase('input'); // Return to input phase while preserving resume
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
  const canGenerate = isContentValid && !isAtLimit && !isGenerating && !isValidating;
  const displayError = localError || error;
  const hasGeneratedResume = generatedResume.length > 0;

  return (
    <div className="resume-generator">
      {currentPhase === 'input' ? (
        <motion.div
          key="input-phase"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.4 }}
          className="input-phase"
        >
          {/* Header */}
          <div className="phase-header">
            <div className="phase-header-content">
              <h1>🎯 Generate ATS-Optimized Resume</h1>
              <p>Paste a job description below and we'll create a tailored resume optimized for Applicant Tracking Systems.</p>
              {hasGeneratedResume && (
                <div className="resume-ready-notice">
                  <span className="notice-icon">✅</span>
                  <span>You have a generated resume ready!</span>
                  <button
                    className="btn-return-to-resume"
                    onClick={() => setCurrentPhase('editor')}
                  >
                    View Resume →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Main Input Form */}
          <form onSubmit={handleJobDescriptionSubmit} className="input-form">
            <div className="input-container">
              <div className="input-header">
                <label htmlFor="job-description" className="input-label">
                  Job Description
                </label>
                <div className="input-meta">
                  <span className="character-count">
                    {jobDescription.length}/10,000
                  </span>
                  {jobDescription.length < 50 && (
                    <span className="min-requirement">
                      minimum 50 characters
                    </span>
                  )}
                </div>
              </div>

              <div className="textarea-wrapper">
                <textarea
                  id="job-description"
                  value={jobDescription}
                  onChange={handleJobDescriptionChange}
                  placeholder="Paste the complete job description here...

Include:
• Job title and company
• Key responsibilities 
• Required skills and qualifications
• Experience requirements

The more detailed the job posting, the better your resume match!"
                  className={`job-textarea ${displayError ? 'error' : ''}`}
                  disabled={isGenerating}
                  rows="18"
                />
              </div>

              {displayError && (
                <div className="input-error" role="alert">
                  {displayError}
                </div>
              )}
            </div>

            <div className="action-area">
              <button
                type="submit"
                className="generate-btn"
                disabled={!canGenerate}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner" />
                    Generating Resume...
                  </>
                ) : isValidating ? (
                  <>
                    <span className="spinner" />
                    Validating...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">🚀</span>
                    Generate Resume
                  </>
                )}
              </button>
              
              <div className="tips-compact">
                <span className="tip-icon">💡</span>
                <span>Include complete job posting with skills and requirements for best results</span>
              </div>
            </div>
          </form>
        </motion.div>
      ) : (
        <motion.div
          key="editor-phase"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="editor-phase"
        >
          {/* Resume Editor */}
          <div className="editor-container">
            <ResumeEditor
              content={generatedResume}
              jobKeywords={jobKeywords}
              jobDescription={jobDescription}
              metadata={resumeMetadata}
              onBack={handleClearResume}
              onRegenerate={handleRegenerate}
              onBackToJobDescription={handleBackToJobDescription}
              isRegenerating={isGenerating}
            />
          </div>
        </motion.div>
      )}


    </div>
  );
};

export default ResumeGenerator;