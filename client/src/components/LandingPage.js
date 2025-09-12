import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import AuthModal from './AuthModal';

// Complete inline styles - no external CSS
const styles = {
  landingPage: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#1a1a1a',
    background: '#fafafa',
    minHeight: '100vh',
    margin: 0,
    padding: 0,
    opacity: 0,
    transition: 'opacity 0.8s ease-out'
  },
  landingPageVisible: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    color: '#1a1a1a',
    background: '#fafafa',
    minHeight: '100vh',
    margin: 0,
    padding: 0,
    opacity: 1,
    transition: 'opacity 0.8s ease-out'
  },
  nav: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    background: 'rgba(255, 255, 255, 0.95)',
    backdropFilter: 'blur(12px)',
    borderBottom: '1px solid #e5e5e5'
  },
  navContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    padding: '1rem 1.5rem',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  logoMark: {
    fontFamily: "'Courier New', monospace",
    fontSize: '1.25rem',
    fontWeight: '700',
    color: '#1a1a1a',
    letterSpacing: '0.1em'
  },
  navLink: {
    background: 'none',
    border: 'none',
    color: '#666666',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    padding: '0.5rem 1rem',
    transition: 'color 0.2s ease'
  },
  hero: {
    padding: '8rem 1.5rem 6rem',
    textAlign: 'center',
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(180deg, #fafafa 0%, #ffffff 100%)'
  },
  heroContainer: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  heroHeadline: {
    fontSize: '3rem',
    fontWeight: '700',
    lineHeight: '1.1',
    color: '#1a1a1a',
    marginBottom: '1.5rem',
    letterSpacing: '-0.02em'
  },
  heroSubline: {
    fontSize: '1.25rem',
    fontWeight: '400',
    color: '#666666',
    marginBottom: '2rem',
    maxWidth: '600px',
    marginLeft: 'auto',
    marginRight: 'auto',
    lineHeight: '1.4'
  },
  heroActions: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  btnPrimary: {
    background: '#2563eb',
    color: 'white',
    border: 'none',
    padding: '1rem 2rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    letterSpacing: '0.025em',
    textTransform: 'uppercase',
    fontFamily: 'inherit',
    borderRadius: '0',
    transition: 'all 0.2s ease'
  },
  btnSecondary: {
    background: 'none',
    color: '#1a1a1a',
    border: '1px solid #e5e5e5',
    padding: '1rem 2rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    letterSpacing: '0.025em',
    textTransform: 'uppercase',
    fontFamily: 'inherit',
    borderRadius: '0',
    transition: 'all 0.2s ease'
  },
  section: {
    padding: '6rem 1.5rem',
    background: '#ffffff'
  },
  sectionContainer: {
    maxWidth: '800px',
    margin: '0 auto',
    textAlign: 'center'
  },
  sectionTitle: {
    fontSize: '1.875rem',
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: '2rem',
    lineHeight: '1.2',
    letterSpacing: '-0.01em'
  },
  sectionBody: {
    fontSize: '1.125rem',
    color: '#666666',
    lineHeight: '1.6',
    maxWidth: '700px',
    margin: '0 auto'
  },
  processGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '3rem',
    marginTop: '4rem'
  },
  processStep: {
    textAlign: 'center'
  },
  stepIcon: {
    width: '80px',
    height: '80px',
    margin: '0 auto 1.5rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #e5e5e5',
    background: '#ffffff'
  },
  stepSvg: {
    width: '32px',
    height: '32px',
    color: '#1a1a1a'
  },
  stepLabel: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#1a1a1a',
    marginBottom: '0.5rem',
    letterSpacing: '0.025em',
    textTransform: 'uppercase'
  },
  stepDesc: {
    fontSize: '1rem',
    color: '#666666',
    lineHeight: '1.5'
  },
  differencesList: {
    maxWidth: '600px',
    margin: '0 auto',
    textAlign: 'left'
  },
  differenceItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  diffMarker: {
    fontSize: '1.5rem',
    fontWeight: '300',
    color: '#1a1a1a',
    lineHeight: '1',
    flexShrink: 0,
    marginTop: '0.25rem'
  },
  diffText: {
    fontSize: '1.125rem',
    color: '#666666',
    lineHeight: '1.5'
  },
  finalCta: {
    padding: '6rem 1.5rem',
    background: '#f5f5f5',
    borderTop: '1px solid #e5e5e5'
  },
  footer: {
    background: '#ffffff',
    borderTop: '1px solid #e5e5e5',
    padding: '2rem 1.5rem'
  },
  footerContainer: {
    maxWidth: '1200px',
    margin: '0 auto',
    textAlign: 'center'
  },
  footerLinks: {
    display: 'flex',
    gap: '2rem',
    justifyContent: 'center'
  },
  footerLink: {
    color: '#999999',
    textDecoration: 'none',
    fontSize: '0.875rem',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  }
};

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
    <div style={isVisible ? styles.landingPageVisible : styles.landingPage}>
      {/* Navigation Header */}
      <nav style={styles.nav}>
        <div style={styles.navContainer}>
          <div>
            <div style={styles.logoMark}>[ ]</div>
          </div>
          <div>
            <button onClick={() => openAuthModal('login')} style={styles.navLink}>
              Sign In
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={styles.hero}>
        <div style={styles.heroContainer}>
          <h1 style={styles.heroHeadline}>
            Resumes that write themselves — from what you've actually done.
          </h1>
          <p style={styles.heroSubline}>
            Upload your real work — performance reviews, project notes, even stories — and let the system build resumes or answers tailored to any job description.
          </p>
          <div style={styles.heroActions}>
            <button 
              onClick={() => openAuthModal('register')} 
              style={styles.btnPrimary}
            >
              Upload Your Work
            </button>
            <button 
              onClick={() => scrollToSection('how-it-works')} 
              style={styles.btnSecondary}
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Section 1: What We Do */}
      <section style={styles.section}>
        <div style={styles.sectionContainer}>
          <h2 style={styles.sectionTitle}>
            Not who you know. What you know.
          </h2>
          <p style={styles.sectionBody}>
            Other platforms revolve around profiles, headshots, and connections. This one doesn't. Instead, it ingests the substance of your work — reports, reviews, accomplishments — and turns them into targeted resumes or answers. You don't have to fit into a template. You just bring the work you've done.
          </p>
        </div>
      </section>

      {/* Section 2: How It Works */}
      <section id="how-it-works" style={styles.section}>
        <div style={styles.sectionContainer}>
          <div style={styles.processGrid}>
            <div style={styles.processStep}>
              <div style={styles.stepIcon}>
                <svg viewBox="0 0 24 24" style={styles.stepSvg}>
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M9 9h6v6H9z" fill="currentColor"/>
                </svg>
              </div>
              <div>
                <h3 style={styles.stepLabel}>Upload Anything</h3>
                <p style={styles.stepDesc}>Resumes, portfolios, reviews, or even dictated notes.</p>
              </div>
            </div>

            <div style={styles.processStep}>
              <div style={styles.stepIcon}>
                <svg viewBox="0 0 24 24" style={styles.stepSvg}>
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M12 3v18m-9-9h18" stroke="currentColor" strokeWidth="1"/>
                </svg>
              </div>
              <div>
                <h3 style={styles.stepLabel}>Target a Job</h3>
                <p style={styles.stepDesc}>Drop in a job description.</p>
              </div>
            </div>

            <div style={styles.processStep}>
              <div style={styles.stepIcon}>
                <svg viewBox="0 0 24 24" style={styles.stepSvg}>
                  <rect x="3" y="3" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"/>
                  <path d="M7 12l3 3 7-7" stroke="currentColor" strokeWidth="2" fill="none"/>
                </svg>
              </div>
              <div>
                <h3 style={styles.stepLabel}>Get Results</h3>
                <p style={styles.stepDesc}>Receive a curated resume or answer pack, built from your own evidence.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Why It's Different */}
      <section style={styles.section}>
        <div style={styles.sectionContainer}>
          <div style={styles.differencesList}>
            <div style={styles.differenceItem}>
              <div style={styles.diffMarker}>—</div>
              <div style={styles.diffText}>No profiles. No likes. No headshots.</div>
            </div>
            <div style={styles.differenceItem}>
              <div style={styles.diffMarker}>—</div>
              <div style={styles.diffText}>Built for accuracy and substance, not connections.</div>
            </div>
            <div style={styles.differenceItem}>
              <div style={styles.diffMarker}>—</div>
              <div style={styles.diffText}>Every line is backed by what you've uploaded.</div>
            </div>
            <div style={styles.differenceItem}>
              <div style={styles.diffMarker}>—</div>
              <div style={styles.diffText}>Designed to keep you in control — your data, your story.</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section style={styles.finalCta}>
        <div style={styles.sectionContainer}>
          <h2 style={styles.sectionTitle}>
            You've already done the work. Let it work for you.
          </h2>
          <button 
            onClick={() => openAuthModal('register')} 
            style={styles.btnPrimary}
          >
            Start Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={styles.footer}>
        <div style={styles.footerContainer}>
          <div style={styles.footerLinks}>
            <a href="/privacy" style={styles.footerLink}>Privacy Policy</a>
            <a href="/terms" style={styles.footerLink}>Terms of Service</a>
            <a href="/contact" style={styles.footerLink}>Contact</a>
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