// client/src/components/AdvancedResumeGenerator.js
// Advanced Resume Generator with JD Pipeline features

import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import ResumeEditor from './ResumeEditor';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import { validateJobDescription } from '../lib/validations';
import { extractKeywords } from '../lib/keywordExtraction';
import './ResumeGenerator.css';

const AdvancedResumeGenerator = () => {
  const { generateAdvancedResume, error: apiError } = useUserDataAPI();
  
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
      // Validate the job description (advanced requires at least 100 chars)
      if (jobDescription.length < 100) {
        throw new Error('Job description must be at least 100 characters for advanced processing');
      }
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

      // Call advanced API for resume generation
      const response = await generateAdvancedResume({
        jobDescription: validatedJD.content,
        style: 'ats-optimized',
        maxBulletPoints: 5,
        prioritizeKeywords: true,
        outputFormat: 'json'
      });

      console.log('🚀 [ADVANCED FRONTEND DEBUG] Advanced resume generation response:', response);
      console.log('🚀 [ADVANCED FRONTEND DEBUG] Response type:', typeof response);
      console.log('🚀 [ADVANCED FRONTEND DEBUG] Response keys:', response ? Object.keys(response) : 'null/undefined');
      console.log('🚀 [ADVANCED FRONTEND DEBUG] Has response.data:', !!response?.data);
      console.log('🚀 [ADVANCED FRONTEND DEBUG] Has response.data.resumeHTML:', !!response?.data?.resumeHTML);

      // Simplified response parsing - API hook returns response.data.data directly
      // Expected structure: { resumeHTML, matchScore, extractedKeywords, sourceData }
      const responseData = response?.data || response;
      
      console.log('🔍 [ADVANCED FRONTEND DEBUG] responseData structure:', responseData);
      console.log('🔍 [ADVANCED FRONTEND DEBUG] Keys available:', Object.keys(responseData || {}));
      
      // Direct extraction - no complex fallback needed since field names are now consistent
      const resumeContent = responseData.resumeHTML;
      const matchScore = responseData.matchScore || 0;
      const extractedKeywords = responseData.extractedKeywords || {};
      const sourceData = responseData.sourceData || {};
      
      if (resumeContent && typeof resumeContent === 'string' && resumeContent.trim().length > 0) {
        
        console.log('✅ [ADVANCED FRONTEND DEBUG] Advanced resume content length:', resumeContent?.length || 0);
        console.log('✅ [ADVANCED FRONTEND DEBUG] Match score:', matchScore);
        console.log('✅ [ADVANCED FRONTEND DEBUG] Coverage percent:', sourceData.coveragePercent);
        console.log('✅ [ADVANCED FRONTEND DEBUG] Coverage report:', sourceData.coverageReport);
        
        // Clean up resume content - remove markdown code blocks if present
        let cleanedResumeContent = resumeContent;
        if (typeof resumeContent === 'string') {
          // Remove ```html and ``` wrappers if present
          cleanedResumeContent = resumeContent
            .replace(/^```html\s*/i, '')
            .replace(/\s*```$/, '')
            .trim();
        }
        
        console.log('🧹 [ADVANCED FRONTEND DEBUG] Cleaned resume content length:', cleanedResumeContent?.length || 0);
        console.log('🧹 [ADVANCED FRONTEND DEBUG] First 100 chars:', cleanedResumeContent?.substring(0, 100));
        
        setGeneratedResume(cleanedResumeContent);
        setResumeMetadata({
          matchScore: matchScore,
          keywordMatches: extractedKeywords,
          suggestions: responseData.suggestions || [],
          coverageReport: sourceData.coverageReport || [],
          coveragePercent: sourceData.coveragePercent || 0,
          advancedPipeline: true,
          enhancedFeatures: responseData.enhancedFeatures || {}
        });
      } else {
        // Simplified error handling - no more complex response format checking
        console.error('❌ [ADVANCED FRONTEND DEBUG] No valid resume content received');
        console.error('❌ [ADVANCED FRONTEND DEBUG] Response data:', {
          hasResumeHTML: !!responseData.resumeHTML,
          resumeType: typeof responseData.resumeHTML,
          resumeLength: responseData.resumeHTML?.length || 0,
          availableKeys: Object.keys(responseData || {})
        });
        throw new Error(responseData?.error || 'No resume content was generated. Please try again.');
      }
    } catch (err) {
      console.error('Advanced resume generation error:', err);
      setError(err.message || apiError || 'An error occurred while generating the advanced resume');
    } finally {
      setIsGenerating(false);
    }
  }, [jobDescription, generateAdvancedResume, apiError]);

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

  const isContentValid = jobDescription.length >= 100 && jobDescription.length <= 10000;
  const displayError = localError || error;
  const hasGeneratedResume = generatedResume.length > 0;

  return (
    <div className="resume-generator advanced-resume-generator">
      <div className="generator-header">
        <h1>🚀 Advanced Resume Generation</h1>
        <p>Powered by our enhanced JD pipeline with intelligent requirement extraction, hybrid search, and coverage tracking.</p>
        <div className="advanced-features-badge">
          <span className="feature-badge">📊 Coverage Tracking</span>
          <span className="feature-badge">🔍 Hybrid Search</span>
          <span className="feature-badge">🎯 Evidence Ranking</span>
          <span className="feature-badge">⚙️ Token Optimization</span>
        </div>
      </div>
      
      <div className="generator-layout">
        {/* Left Pane - Job Description Input */}
        <div className="input-pane">
          <div className="pane-header">
            <h2>Job Description</h2>
            <span className="character-count">
              {jobDescription.length}/10,000 characters
              {jobDescription.length < 100 && (
                <span className="min-requirement">
                  (minimum 100 required for advanced processing)
                </span>
              )}
            </span>
          </div>
          
          <form onSubmit={handleJobDescriptionSubmit} className="job-form">
            <div className="textarea-container">
              <textarea
                id="advanced-job-description"
                value={jobDescription}
                onChange={handleJobDescriptionChange}
                placeholder="Paste the job description here...

The advanced pipeline works best with detailed job descriptions including:
• Specific technical requirements and tools
• Must-have vs. nice-to-have qualifications
• Years of experience requirements
• Industry-specific terminology
• Responsibilities and expectations

Minimum 100 characters required for enhanced processing."
                className={`job-textarea ${displayError ? 'error' : ''}`}
                disabled={isGenerating}
                aria-describedby={displayError ? 'advanced-jd-error' : 'advanced-jd-help'}
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
              <div className="form-error" id="advanced-jd-error" role="alert">
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
                className="btn btn-primary btn-advanced"
                disabled={!isContentValid || isGenerating || isValidating}
              >
                {isGenerating ? (
                  <>
                    <span className="spinner-small" aria-hidden="true"></span>
                    Generating with Advanced Pipeline...
                  </>
                ) : isValidating ? (
                  'Validating...'
                ) : hasGeneratedResume ? (
                  '🚀 Regenerate Advanced Resume'
                ) : (
                  '🚀 Generate Advanced Resume'
                )}
              </button>
            </div>
          </form>

          <div className="input-tips">
            <h4>🚀 Advanced Pipeline Features:</h4>
            <ul>
              <li><strong>Intelligent Requirement Extraction:</strong> Automatically identifies must-have vs. nice-to-have requirements</li>
              <li><strong>Coverage Tracking:</strong> Shows exactly which requirements are addressed in your resume</li>
              <li><strong>Hybrid Retrieval:</strong> Combines dense vector search with BM25 text matching</li>
              <li><strong>Evidence Ranking:</strong> Prioritizes the most relevant experience for each requirement</li>
              <li><strong>Token Budget Management:</strong> Optimizes content length for maximum impact</li>
              <li><strong>Advanced Quality Scoring:</strong> More accurate match percentage calculation</li>
            </ul>
          </div>
        </div>

        {/* Right Pane - Resume Output */}
        <div className="output-pane">
          {!hasGeneratedResume ? (
            <div className="empty-state">
              <div className="empty-content">
                <h3>Your advanced resume will appear here</h3>
                <p>Paste a detailed job description and experience our next-generation resume generation.</p>
                <div className="empty-features">
                  <div className="feature">
                    <span className="feature-icon">🎯</span>
                    <span>Enhanced ATS optimization</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">📊</span>
                    <span>Requirement coverage tracking</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🔍</span>
                    <span>Hybrid search technology</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">⚙️</span>
                    <span>Intelligent token optimization</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">🚀</span>
                    <span>Advanced quality metrics</span>
                  </div>
                  <div className="feature">
                    <span className="feature-icon">✏️</span>
                    <span>Full editing capabilities</span>
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
                isAdvanced={true}
              />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdvancedResumeGenerator;