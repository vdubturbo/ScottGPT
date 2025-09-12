import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AuthModal from './AuthModal';
import './LandingPage.css';

const LandingPage = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('register');

  useEffect(() => {
    setIsVisible(true);
  }, []);

  const openAuthModal = (tab = 'register') => {
    setAuthModalTab(tab);
    setAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setAuthModalOpen(false);
  };

  const scrollToSection = (sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className={`landing-page ${isVisible ? 'fade-in' : ''}`}>
      {/* Navigation Header */}
      <nav className="industrial-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <div className="logo-mark">[ ]</div>
          </div>
          <div className="nav-actions">
            <button onClick={() => openAuthModal('login')} className="nav-link">
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-container">
          <h1 className="hero-headline">
            Resumes that write themselves — from what you've actually done.
          </h1>
          <p className="hero-subline">
            Upload your real work — performance reviews, project notes, even stories — and let the system build resumes or answers tailored to any job description.
          </p>
          <div className="hero-actions">
            <button 
              onClick={() => openAuthModal('register')} 
              className="btn-primary"
            >
              Upload Your Work
            </button>
            <button 
              onClick={() => scrollToSection('how-it-works')} 
              className="btn-secondary"
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Section 1: What We Do */}
      <section className="what-we-do">
        <div className="section-container">
          <h2 className="section-title">
            Not who you know. What you know.
          </h2>
          <p className="section-body">
            Other platforms revolve around profiles, headshots, and connections. This one doesn't. Instead, it ingests the substance of your work — reports, reviews, accomplishments — and turns them into targeted resumes or answers. You don't have to fit into a template. You just bring the work you've done.
          </p>
        </div>
      </section>

      {/* Section 2: How It Works */}
      <section id="how-it-works" className="how-it-works">
        <div className="section-container">
          <div className="process-grid">
            <div className="process-step">
              <div className="step-icon">
                <svg viewBox="0 0 24 24" className="step-svg">
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M9 9h6v6H9z" fill="currentColor"/>
                </svg>
              </div>
              <div className="step-content">
                <h3 className="step-label">Upload Anything</h3>
                <p className="step-desc">Resumes, portfolios, reviews, or even dictated notes.</p>
              </div>
            </div>

            <div className="process-step">
              <div className="step-icon">
                <svg viewBox="0 0 24 24" className="step-svg">
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 3v18m-9-9h18" stroke="currentColor" strokeWidth="1"/>
                </svg>
              </div>
              <div className="step-content">
                <h3 className="step-label">Target a Job</h3>
                <p className="step-desc">Drop in a job description.</p>
              </div>
            </div>

            <div className="process-step">
              <div className="step-icon">
                <svg viewBox="0 0 24 24" className="step-svg">
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 12l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
              </div>
              <div className="step-content">
                <h3 className="step-label">Get Results</h3>
                <p className="step-desc">Receive a curated resume or answer pack, built from your own evidence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Why It's Different */}
      <section className="why-different">
        <div className="section-container">
          <div className="differences-list">
            <div className="difference-item">
              <div className="diff-marker">—</div>
              <div className="diff-text">No profiles. No likes. No headshots.</div>
            </div>
            <div className="difference-item">
              <div className="diff-marker">—</div>
              <div className="diff-text">Built for accuracy and substance, not connections.</div>
            </div>
            <div className="difference-item">
              <div className="diff-marker">—</div>
              <div className="diff-text">Every line is backed by what you've uploaded.</div>
            </div>
            <div className="difference-item">
              <div className="diff-marker">—</div>
              <div className="diff-text">Designed to keep you in control — your data, your story.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta">
        <div className="cta-container">
          <h2 className="cta-headline">
            You've already done the work. Let it work for you.
          </h2>
          <button 
            onClick={() => openAuthModal('register')} 
            className="btn-primary"
          >
            Start Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="industrial-footer">
        <div className="footer-container">
          <div className="footer-links">
            <a href="/privacy" className="footer-link">Privacy Policy</a>
            <a href="/terms" className="footer-link">Terms of Service</a>
            <a href="/contact" className="footer-link">Contact</a>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {authModalOpen && (
        <AuthModal 
          isOpen={authModalOpen}
          onClose={closeAuthModal}
          initialTab={authModalTab}
        />
      )}
    </div>
  );
};

export default LandingPage;