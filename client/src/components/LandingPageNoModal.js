// LandingPage without AuthModal to test if modal is causing issues
import React from 'react';

const LandingPageNoModal = () => {
  console.log('LandingPageNoModal rendering...');

  const handleButtonClick = (action) => {
    alert(`${action} clicked - modal functionality disabled for testing`);
  };

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      color: '#1a1a1a',
      background: '#fafafa',
      minHeight: '100vh',
      margin: 0,
      padding: 0,
      position: 'absolute',
      top: 0,
      left: 0,
      width: '100%',
      zIndex: 1000
    }}>
      {/* Navigation */}
      <nav style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: 'rgba(255, 255, 255, 0.95)',
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
            color: '#1a1a1a',
            letterSpacing: '0.1em'
          }}>
            [ ]
          </div>
          <button 
            onClick={() => handleButtonClick('Sign In')}
            style={{
              background: 'none',
              border: 'none',
              color: '#666666',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '0.5rem 1rem'
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        padding: '8rem 2rem 6rem',
        textAlign: 'center',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #fafafa 0%, #ffffff 100%)'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <h1 style={{
            fontSize: '3rem',
            fontWeight: '700',
            lineHeight: '1.1',
            color: '#1a1a1a',
            marginBottom: '1.5rem',
            letterSpacing: '-0.02em'
          }}>
            Resumes that write themselves — from what you've actually done.
          </h1>
          <p style={{
            fontSize: '1.25rem',
            fontWeight: '400',
            color: '#666666',
            marginBottom: '2rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: '1.4'
          }}>
            Upload your real work — performance reviews, project notes, even stories — and let the system build resumes or answers tailored to any job description.
          </p>
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <button 
              onClick={() => handleButtonClick('Upload Your Work')}
              style={{
                background: '#2563eb',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                letterSpacing: '0.025em',
                textTransform: 'uppercase',
                fontFamily: 'inherit'
              }}
            >
              Upload Your Work
            </button>
            <button 
              onClick={() => alert('Scroll functionality disabled for testing')}
              style={{
                background: 'none',
                color: '#1a1a1a',
                border: '1px solid #e5e5e5',
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                cursor: 'pointer',
                letterSpacing: '0.025em',
                textTransform: 'uppercase',
                fontFamily: 'inherit'
              }}
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      <div style={{
        background: '#ffffff',
        padding: '2rem',
        textAlign: 'center'
      }}>
        <h2>Test Section</h2>
        <p>If you can see this section, the component is rendering properly.</p>
      </div>
    </div>
  );
};

export default LandingPageNoModal;