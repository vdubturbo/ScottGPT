// Simple JSX version using same positioning as working red test
import React from 'react';

const LandingPageSimple = () => {
  console.log('LandingPageSimple rendering...');

  return (
    <div style={{
      backgroundColor: '#fafafa',
      color: '#1a1a1a',
      width: '100vw',
      height: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      overflow: 'auto',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }}>
      {/* Navigation */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottom: '1px solid #e5e5e5',
        padding: '1rem 2rem'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div style={{
            fontFamily: "'Courier New', monospace",
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#1a1a1a'
          }}>
            [ ]
          </div>
          <button style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: '#666666',
            fontSize: '0.875rem',
            cursor: 'pointer',
            padding: '0.5rem 1rem'
          }}>
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: '8rem 2rem 4rem',
        textAlign: 'center',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #fafafa 0%, #ffffff 100%)'
      }}>
        <div style={{ maxWidth: '800px' }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: '700',
            color: '#1a1a1a',
            marginBottom: '1.5rem',
            lineHeight: '1.1'
          }}>
            Resumes that write themselves
          </h1>
          <p style={{
            fontSize: '1.25rem',
            color: '#666666',
            marginBottom: '2rem',
            lineHeight: '1.4'
          }}>
            Upload your real work and let the system build resumes tailored to any job description.
          </p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <button style={{
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '1rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}>
              Upload Your Work
            </button>
            <button style={{
              backgroundColor: 'transparent',
              color: '#1a1a1a',
              border: '1px solid #e5e5e5',
              padding: '1rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}>
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* Simple test section */}
      <div style={{
        backgroundColor: '#ffffff',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2>Not who you know. What you know.</h2>
        <p>This is the industrial landing page. Can you see this section?</p>
      </div>
    </div>
  );
};

export default LandingPageSimple;