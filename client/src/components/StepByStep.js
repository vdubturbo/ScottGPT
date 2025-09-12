// Step by step test - start with working red and modify gradually
import React from 'react';

const StepByStep = () => {
  console.log('StepByStep rendering...');
  
  // Build complete landing page with darker background
  return React.createElement('div', {
    style: {
      backgroundColor: '#f0f0f0', // Darker gray so it's clearly visible
      width: '100vw',
      height: '100vh',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999,
      overflow: 'auto',
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
    }
  }, [
    // Navigation
    React.createElement('nav', {
      key: 'nav',
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderBottom: '1px solid #e5e5e5',
        padding: '1rem 2rem'
      }
    }, 
      React.createElement('div', {
        style: {
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          maxWidth: '1200px',
          margin: '0 auto'
        }
      }, [
        React.createElement('div', {
          key: 'logo',
          style: {
            fontFamily: "'Courier New', monospace",
            fontSize: '1.25rem',
            fontWeight: '700',
            color: '#1a1a1a',
            letterSpacing: '0.1em'
          }
        }, '[ ]'),
        React.createElement('button', {
          key: 'signin',
          style: {
            backgroundColor: 'transparent',
            border: 'none',
            color: '#666666',
            fontSize: '0.875rem',
            fontWeight: '500',
            cursor: 'pointer',
            padding: '0.5rem 1rem'
          }
        }, 'Sign In')
      ])
    ),
    
    // Hero Section
    React.createElement('section', {
      key: 'hero',
      style: {
        padding: '8rem 2rem 6rem',
        textAlign: 'center',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #f0f0f0 0%, #ffffff 100%)'
      }
    },
      React.createElement('div', {
        style: {
          maxWidth: '800px',
          margin: '0 auto'
        }
      }, [
        React.createElement('h1', {
          key: 'headline',
          style: {
            fontSize: '3rem',
            fontWeight: '700',
            lineHeight: '1.1',
            color: '#1a1a1a',
            marginBottom: '1.5rem',
            letterSpacing: '-0.02em'
          }
        }, 'Resumes that write themselves - from what you have actually done.'),
        
        React.createElement('p', {
          key: 'subtitle',
          style: {
            fontSize: '1.25rem',
            fontWeight: '400',
            color: '#666666',
            marginBottom: '2rem',
            maxWidth: '600px',
            marginLeft: 'auto',
            marginRight: 'auto',
            lineHeight: '1.4'
          }
        }, 'Upload your real work - performance reviews, project notes, even stories - and let the system build resumes or answers tailored to any job description.'),
        
        React.createElement('div', {
          key: 'buttons',
          style: {
            display: 'flex',
            gap: '1rem',
            justifyContent: 'center',
            alignItems: 'center',
            flexWrap: 'wrap'
          }
        }, [
          React.createElement('button', {
            key: 'upload',
            style: {
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              padding: '1rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              letterSpacing: '0.025em',
              textTransform: 'uppercase',
              fontFamily: 'inherit'
            }
          }, 'Upload Your Work'),
          
          React.createElement('button', {
            key: 'learn',
            style: {
              backgroundColor: 'transparent',
              color: '#1a1a1a',
              border: '1px solid #e5e5e5',
              padding: '1rem 2rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              letterSpacing: '0.025em',
              textTransform: 'uppercase',
              fontFamily: 'inherit'
            }
          }, 'See How It Works')
        ])
      ])
    ),

    // What We Do Section
    React.createElement('section', {
      key: 'what-we-do',
      style: {
        padding: '6rem 2rem',
        backgroundColor: '#ffffff'
      }
    },
      React.createElement('div', {
        style: {
          maxWidth: '800px',
          margin: '0 auto',
          textAlign: 'center'
        }
      }, [
        React.createElement('h2', {
          key: 'title',
          style: {
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#1a1a1a',
            marginBottom: '2rem',
            lineHeight: '1.2'
          }
        }, 'Not who you know. What you know.'),
        
        React.createElement('p', {
          key: 'description',
          style: {
            fontSize: '1.125rem',
            color: '#666666',
            lineHeight: '1.6',
            maxWidth: '700px',
            margin: '0 auto'
          }
        }, 'Other platforms revolve around profiles, headshots, and connections. This one does not. Instead, it ingests the substance of your work - reports, reviews, accomplishments - and turns them into targeted resumes or answers. You do not have to fit into a template. You just bring the work you have done.')
      ])
    ),

    // Footer
    React.createElement('footer', {
      key: 'footer',
      style: {
        backgroundColor: '#f5f5f5',
        borderTop: '1px solid #e5e5e5',
        padding: '2rem',
        textAlign: 'center'
      }
    }, 'Complete Industrial Landing Page - Working!')
  ]);
};

export default StepByStep;