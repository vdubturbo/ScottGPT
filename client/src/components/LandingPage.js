import React, { useState } from 'react';
import AuthModal from './AuthModal';

const LandingPage = () => {
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState('register');

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
    <div style={{ 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      minHeight: '100vh',
      color: '#e0e0e0'
    }}>
      {/* Navigation */}
      <nav style={{
        background: '#1a1a1a',
        borderBottom: '1px solid #333333',
        padding: '1rem 0',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 1.5rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <img
            src="/Logo3.png"
            alt="ScottGPT Logo"
            style={{
              height: '80px',
              width: 'auto'
            }}
          />
          <button
            onClick={() => openAuthModal('login')}
            style={{
              background: 'none',
              border: '2px solid #8b5cf6',
              color: '#e0e0e0',
              fontSize: '0.875rem',
              fontWeight: '500',
              cursor: 'pointer',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#8b5cf6';
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#e0e0e0';
            }}
          >
            Sign In
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section style={{
        background: 'linear-gradient(135deg, #2d2d2d 0%, #333333 100%)',
        padding: '4rem 1.5rem',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto'
        }}>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: '800',
            lineHeight: '1.1',
            color: '#f5f5f5',
            marginBottom: '1.5rem',
            letterSpacing: '-0.025em'
          }}>
            Resumes that write themselves - from what you have actually done.
          </h1>
          
          <p style={{
            fontSize: '1.25rem',
            color: '#b0b0b0',
            marginBottom: '2.5rem',
            lineHeight: '1.6',
            maxWidth: '700px',
            margin: '0 auto 2.5rem'
          }}>
            Upload your real work - performance reviews, project notes, even stories - and let the system build resumes or answers tailored to any job description.
          </p>
          
          <div style={{
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap'
          }}>
            <button
              onClick={() => openAuthModal('register')}
              style={{
                background: '#8b5cf6',
                color: 'white',
                border: 'none',
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
              onMouseEnter={(e) => {
                e.target.style.background = '#7c3aed';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.background = '#8b5cf6';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              Upload Your Work
            </button>
            
            <button
              onClick={() => scrollToSection('how-it-works')}
              style={{
                background: 'transparent',
                color: '#e0e0e0',
                border: '2px solid #4a4a4a',
                padding: '1rem 2rem',
                fontSize: '1rem',
                fontWeight: '600',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = '#8b5cf6';
                e.target.style.color = '#8b5cf6';
                e.target.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#4a4a4a';
                e.target.style.color = '#e0e0e0';
                e.target.style.transform = 'translateY(0)';
              }}
            >
              See How It Works
            </button>
          </div>
        </div>
      </section>

      {/* What We Do Section */}
      <section style={{
        padding: '5rem 1.5rem',
        background: '#2a2a2a'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto',
          textAlign: 'center'
        }}>
          <h2 style={{
            fontSize: '2.25rem',
            fontWeight: '700',
            color: '#f5f5f5',
            marginBottom: '2rem',
            lineHeight: '1.2'
          }}>
            Not who you know. What you know.
          </h2>
          
          <p style={{
            fontSize: '1.125rem',
            color: '#b0b0b0',
            lineHeight: '1.7',
            maxWidth: '700px',
            margin: '0 auto'
          }}>
            Other platforms revolve around profiles, headshots, and connections. This one does not. Instead, it ingests the substance of your work - reports, reviews, accomplishments - and turns them into targeted resumes or answers. You do not have to fit into a template. You just bring the work you have done.
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" style={{
        padding: '5rem 1.5rem',
        background: '#333333'
      }}>
        <div style={{
          maxWidth: '1000px',
          margin: '0 auto'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '3rem',
            marginTop: '2rem'
          }}>
            {/* Step 1 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#8b5cf6',
                borderRadius: '50%',
                color: 'white',
                fontSize: '2rem',
                fontWeight: 'bold'
              }}>
                1
              </div>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: '#f5f5f5',
                marginBottom: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Upload Anything
              </h3>
              <p style={{
                fontSize: '1rem',
                color: '#b0b0b0',
                lineHeight: '1.6'
              }}>
                Resumes, portfolios, reviews, or even dictated notes.
              </p>
            </div>
            
            {/* Step 2 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#8b5cf6',
                borderRadius: '50%',
                color: 'white',
                fontSize: '2rem',
                fontWeight: 'bold'
              }}>
                2
              </div>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: '#f5f5f5',
                marginBottom: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Target a Job
              </h3>
              <p style={{
                fontSize: '1rem',
                color: '#b0b0b0',
                lineHeight: '1.6'
              }}>
                Drop in a job description.
              </p>
            </div>
            
            {/* Step 3 */}
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#8b5cf6',
                borderRadius: '50%',
                color: 'white',
                fontSize: '2rem',
                fontWeight: 'bold'
              }}>
                3
              </div>
              <h3 style={{
                fontSize: '1.5rem',
                fontWeight: '600',
                color: '#f5f5f5',
                marginBottom: '1rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Get Results
              </h3>
              <p style={{
                fontSize: '1rem',
                color: '#b0b0b0',
                lineHeight: '1.6'
              }}>
                Receive a curated resume or answer pack, built from your own evidence.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Why Different Section */}
      <section style={{
        padding: '5rem 1.5rem',
        background: '#2a2a2a'
      }}>
        <div style={{
          maxWidth: '700px',
          margin: '0 auto'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {[
              'No profiles. No likes. No headshots.',
              'Built for accuracy and substance, not connections.',
              'Every line is backed by what you have uploaded.',
              'Designed to keep you in control - your data, your story.'
            ].map((text, index) => (
              <div key={index} style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '1rem',
                padding: '1rem',
                borderLeft: '4px solid #8b5cf6',
                background: '#333333'
              }}>
                <span style={{
                  fontSize: '1.5rem',
                  color: '#8b5cf6',
                  fontWeight: 'bold',
                  lineHeight: '1'
                }}>
                  —
                </span>
                <span style={{
                  fontSize: '1.125rem',
                  color: '#f5f5f5',
                  lineHeight: '1.6',
                  fontWeight: '500'
                }}>
                  {text}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section style={{
        padding: '5rem 1.5rem',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        color: 'white',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '800px',
          margin: '0 auto'
        }}>
          <h2 style={{
            fontSize: '2.25rem',
            fontWeight: '700',
            marginBottom: '2rem',
            lineHeight: '1.2'
          }}>
            You have already done the work. Let it work for you.
          </h2>
          
          <button
            onClick={() => openAuthModal('register')}
            style={{
              background: '#8b5cf6',
              color: 'white',
              border: 'none',
              padding: '1.25rem 2.5rem',
              fontSize: '1.125rem',
              fontWeight: '600',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#7c3aed';
              e.target.style.transform = 'translateY(-2px) scale(1.05)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = '#8b5cf6';
              e.target.style.transform = 'translateY(0) scale(1)';
            }}
          >
            Start Now
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        background: '#1a1a1a',
        color: '#9ca3af',
        padding: '2rem 1.5rem',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '2rem',
            flexWrap: 'wrap'
          }}>
            <a
              href="/privacy"
              style={{
                color: '#9ca3af',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#f3f4f6'}
              onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              style={{
                color: '#9ca3af',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#f3f4f6'}
              onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
            >
              Terms of Service
            </a>
            <a
              href="/contact"
              style={{
                color: '#9ca3af',
                textDecoration: 'none',
                fontSize: '0.875rem',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                transition: 'color 0.2s ease'
              }}
              onMouseEnter={(e) => e.target.style.color = '#f3f4f6'}
              onMouseLeave={(e) => e.target.style.color = '#9ca3af'}
            >
              Contact
            </a>
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