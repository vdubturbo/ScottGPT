// client/src/components/ResumeGenerator.js
// Main Resume Generator component with modal and editor

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Dialog from '@radix-ui/react-dialog';
import JobDescriptionModal from './JobDescriptionModal';
import ResumeEditor from './ResumeEditor';
import { validateJobDescription } from '../lib/validations';
import { extractKeywords } from '../lib/keywordExtraction';
import './ResumeGenerator.css';

const ResumeGenerator = () => {
  const [step, setStep] = useState('modal'); // 'modal' | 'editor'
  const [jobDescription, setJobDescription] = useState('');
  const [jobKeywords, setJobKeywords] = useState(null);
  const [generatedResume, setGeneratedResume] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');

  const handleJobDescriptionSubmit = useCallback(async (jdContent, options = {}) => {
    setError('');
    setIsGenerating(true);

    try {
      // Validate job description
      const validatedJD = validateJobDescription(jdContent);
      setJobDescription(validatedJD.content);

      // Extract keywords for matching
      const keywords = extractKeywords(validatedJD.content);
      setJobKeywords(keywords);

      // Generate resume (call API)
      const response = await generateResume(validatedJD.content, {
        ...options,
        keywords
      });

      if (response.success) {
        setGeneratedResume(response.resume);
        setStep('editor');
      } else {
        throw new Error(response.error || 'Failed to generate resume');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while generating the resume');
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const handleBackToModal = useCallback(() => {
    setStep('modal');
    setGeneratedResume('');
    setJobKeywords(null);
    setError('');
  }, []);

  const handleRegenerate = useCallback(async () => {
    if (!jobDescription) return;
    
    const confirmed = window.confirm(
      'This will overwrite your current resume content. Are you sure?'
    );
    
    if (confirmed) {
      await handleJobDescriptionSubmit(jobDescription);
    }
  }, [jobDescription, handleJobDescriptionSubmit]);

  return (
    <div className="resume-generator">
      <AnimatePresence mode="wait">
        {step === 'modal' && (
          <motion.div
            key="modal"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.3 }}
          >
            <JobDescriptionModal
              isOpen={true}
              onSubmit={handleJobDescriptionSubmit}
              isGenerating={isGenerating}
              error={error}
              onClose={() => setStep('modal')}
            />
          </motion.div>
        )}

        {step === 'editor' && (
          <motion.div
            key="editor"
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 100 }}
            transition={{ duration: 0.3 }}
            className="editor-container"
          >
            <ResumeEditor
              content={generatedResume}
              jobKeywords={jobKeywords}
              jobDescription={jobDescription}
              onBack={handleBackToModal}
              onRegenerate={handleRegenerate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Mock API call for resume generation (replace with actual API call)
const generateResume = async (jobDescription, options) => {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Mock resume data - in real implementation, this would call your LLM service
  const mockResume = {
    personalInfo: {
      name: 'John Doe',
      title: 'Senior Software Engineer',
      email: 'john.doe@email.com',
      phone: '(555) 123-4567',
      location: 'San Francisco, CA'
    },
    summary: 'Experienced software engineer with 8+ years developing scalable web applications using React, Node.js, and cloud technologies. Proven track record of leading cross-functional teams and delivering high-impact projects in fast-paced environments.',
    experience: [
      {
        title: 'Senior Software Engineer',
        company: 'Tech Corp',
        dateRange: 'Jan 2020 - Present',
        bullets: [
          'Led development of microservices architecture serving 1M+ daily active users',
          'Implemented React-based dashboard reducing load times by 40%',
          'Mentored team of 5 junior developers and established code review practices',
          'Built CI/CD pipeline using Docker and Kubernetes, improving deployment frequency by 300%'
        ]
      },
      {
        title: 'Software Engineer',
        company: 'StartupCo',
        dateRange: 'Mar 2018 - Dec 2019',
        bullets: [
          'Developed RESTful APIs using Node.js and Express serving 100K+ requests daily',
          'Created responsive web applications using React and TypeScript',
          'Collaborated with product team to define technical requirements and deliverables',
          'Optimized database queries resulting in 25% performance improvement'
        ]
      }
    ],
    skills: [
      'JavaScript', 'TypeScript', 'React', 'Node.js', 'Python', 'AWS',
      'Docker', 'Kubernetes', 'PostgreSQL', 'MongoDB', 'Git', 'Agile'
    ],
    education: [
      {
        degree: 'Bachelor of Science in Computer Science',
        school: 'University of Technology',
        year: '2018'
      }
    ]
  };

  // Convert to HTML format
  const resumeHTML = `
    <header>
      <h1>${mockResume.personalInfo.name}</h1>
      <p><strong>${mockResume.personalInfo.title}</strong></p>
      <p>${mockResume.personalInfo.email} | ${mockResume.personalInfo.phone} | ${mockResume.personalInfo.location}</p>
    </header>

    <section>
      <h2>Professional Summary</h2>
      <p>${mockResume.summary}</p>
    </section>

    <section>
      <h2>Professional Experience</h2>
      ${mockResume.experience.map(job => `
        <div>
          <h3>${job.title}</h3>
          <p><strong>${job.company}</strong> | ${job.dateRange}</p>
          <ul>
            ${job.bullets.map(bullet => `<li>${bullet}</li>`).join('')}
          </ul>
        </div>
      `).join('')}
    </section>

    <section>
      <h2>Core Competencies</h2>
      <ul>
        ${mockResume.skills.map(skill => `<li>${skill}</li>`).join('')}
      </ul>
    </section>

    <section>
      <h2>Education</h2>
      ${mockResume.education.map(edu => `
        <div>
          <h3>${edu.degree}</h3>
          <p><strong>${edu.school}</strong> | ${edu.year}</p>
        </div>
      `).join('')}
    </section>
  `;

  return {
    success: true,
    resume: resumeHTML,
    matchScore: 85,
    extractedKeywords: options.keywords
  };
};

export default ResumeGenerator;