import React, { useState, useEffect } from 'react';
import AuthModal from './AuthModal';

const LandingPage = () => {
  console.log('LandingPage rendering...');
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

  // Use the working React.createElement approach with VISIBLE colors
  return React.createElement('div', {
    style: {
      backgroundColor: '#e5e5e5', // Much more visible gray
      width: '100vw',
      minHeight: '100vh',
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
          onClick: () => openAuthModal('login'),
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
        background: 'linear-gradient(180deg, #e5e5e5 0%, #f5f5f5 100%)'
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
            onClick: () => openAuthModal('register'),
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
            onClick: () => scrollToSection('how-it-works'),
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

    // How It Works Section
    React.createElement('section', {
      key: 'how-it-works',
      id: 'how-it-works',
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
        React.createElement('div', {
          key: 'process-grid',
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '3rem',
            marginTop: '2rem'
          }
        }, [
          // Step 1
          React.createElement('div', {
            key: 'step1',
            style: { textAlign: 'center' }
          }, [
            React.createElement('div', {
              key: 'icon1',
              style: {
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #e5e5e5',
                backgroundColor: '#ffffff'
              }
            }, 
              React.createElement('div', {
                style: {
                  width: '32px',
                  height: '32px',
                  border: '2px solid #1a1a1a',
                  backgroundColor: '#1a1a1a'
                }
              })
            ),
            React.createElement('h3', {
              key: 'label1',
              style: {
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                letterSpacing: '0.025em',
                textTransform: 'uppercase'
              }
            }, 'Upload Anything'),
            React.createElement('p', {
              key: 'desc1',
              style: {
                fontSize: '1rem',
                color: '#666666',
                lineHeight: '1.5'
              }
            }, 'Resumes, portfolios, reviews, or even dictated notes.')
          ]),
          
          // Step 2
          React.createElement('div', {
            key: 'step2',
            style: { textAlign: 'center' }
          }, [
            React.createElement('div', {
              key: 'icon2',
              style: {
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #e5e5e5',
                backgroundColor: '#ffffff'
              }
            }, 
              React.createElement('div', {
                style: {
                  width: '32px',
                  height: '32px',
                  border: '2px solid #1a1a1a'
                }
              })
            ),
            React.createElement('h3', {
              key: 'label2',
              style: {
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                letterSpacing: '0.025em',
                textTransform: 'uppercase'
              }
            }, 'Target a Job'),
            React.createElement('p', {
              key: 'desc2',
              style: {
                fontSize: '1rem',
                color: '#666666',
                lineHeight: '1.5'
              }
            }, 'Drop in a job description.')
          ]),
          
          // Step 3
          React.createElement('div', {
            key: 'step3',
            style: { textAlign: 'center' }
          }, [
            React.createElement('div', {
              key: 'icon3',
              style: {
                width: '80px',
                height: '80px',
                margin: '0 auto 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #e5e5e5',
                backgroundColor: '#ffffff'
              }
            }, 
              React.createElement('div', {
                style: {
                  width: '20px',
                  height: '20px',
                  border: '2px solid #1a1a1a'
                }
              })
            ),
            React.createElement('h3', {
              key: 'label3',
              style: {
                fontSize: '1.25rem',
                fontWeight: '600',
                color: '#1a1a1a',
                marginBottom: '0.5rem',
                letterSpacing: '0.025em',
                textTransform: 'uppercase'
              }
            }, 'Get Results'),
            React.createElement('p', {
              key: 'desc3',
              style: {
                fontSize: '1rem',
                color: '#666666',
                lineHeight: '1.5'
              }
            }, 'Receive a curated resume or answer pack, built from your own evidence.')
          ])
        ])
      ])
    ),

    // Why Different Section  
    React.createElement('section', {
      key: 'why-different',
      style: {
        padding: '6rem 2rem',
        backgroundColor: '#ffffff'
      }
    },
      React.createElement('div', {
        style: {
          maxWidth: '600px',
          margin: '0 auto',
          textAlign: 'left'
        }
      }, [
        React.createElement('div', {
          key: 'diff1',
          style: { marginBottom: '1.5rem', display: 'flex', gap: '1rem' }
        }, [
          React.createElement('span', {
            key: 'marker1',
            style: { fontSize: '1.5rem', color: '#1a1a1a', marginTop: '0.25rem' }
          }, '—'),
          React.createElement('span', {
            key: 'text1',
            style: { fontSize: '1.125rem', color: '#666666', lineHeight: '1.5' }
          }, 'No profiles. No likes. No headshots.')
        ]),
        React.createElement('div', {
          key: 'diff2',
          style: { marginBottom: '1.5rem', display: 'flex', gap: '1rem' }
        }, [
          React.createElement('span', {
            key: 'marker2',
            style: { fontSize: '1.5rem', color: '#1a1a1a', marginTop: '0.25rem' }
          }, '—'),
          React.createElement('span', {
            key: 'text2',
            style: { fontSize: '1.125rem', color: '#666666', lineHeight: '1.5' }
          }, 'Built for accuracy and substance, not connections.')
        ]),
        React.createElement('div', {
          key: 'diff3',
          style: { marginBottom: '1.5rem', display: 'flex', gap: '1rem' }
        }, [
          React.createElement('span', {
            key: 'marker3',
            style: { fontSize: '1.5rem', color: '#1a1a1a', marginTop: '0.25rem' }
          }, '—'),
          React.createElement('span', {
            key: 'text3',
            style: { fontSize: '1.125rem', color: '#666666', lineHeight: '1.5' }
          }, 'Every line is backed by what you have uploaded.')
        ]),
        React.createElement('div', {
          key: 'diff4',
          style: { marginBottom: '1.5rem', display: 'flex', gap: '1rem' }
        }, [
          React.createElement('span', {
            key: 'marker4',
            style: { fontSize: '1.5rem', color: '#1a1a1a', marginTop: '0.25rem' }
          }, '—'),
          React.createElement('span', {
            key: 'text4',
            style: { fontSize: '1.125rem', color: '#666666', lineHeight: '1.5' }
          }, 'Designed to keep you in control - your data, your story.')
        ])
      ])
    ),

    // Final CTA Section
    React.createElement('section', {
      key: 'final-cta',
      style: {
        padding: '6rem 2rem',
        backgroundColor: '#f5f5f5',
        borderTop: '1px solid #e5e5e5'
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
          key: 'cta-title',
          style: {
            fontSize: '1.875rem',
            fontWeight: '700',
            color: '#1a1a1a',
            marginBottom: '2rem',
            lineHeight: '1.2'
          }
        }, 'You have already done the work. Let it work for you.'),
        
        React.createElement('button', {
          key: 'cta-button',
          onClick: () => openAuthModal('register'),
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
        }, 'Start Now')
      ])
    ),

    // Footer
    React.createElement('footer', {
      key: 'footer',
      style: {
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e5e5e5',
        padding: '2rem'
      }
    },
      React.createElement('div', {
        style: {
          maxWidth: '1200px',
          margin: '0 auto',
          textAlign: 'center'
        }
      },
        React.createElement('div', {
          style: {
            display: 'flex',
            gap: '2rem',
            justifyContent: 'center'
          }
        }, [
          React.createElement('a', {
            key: 'privacy',
            href: '/privacy',
            style: {
              color: '#999999',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }
          }, 'Privacy Policy'),
          React.createElement('a', {
            key: 'terms',
            href: '/terms',
            style: {
              color: '#999999',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }
          }, 'Terms of Service'),
          React.createElement('a', {
            key: 'contact',
            href: '/contact',
            style: {
              color: '#999999',
              textDecoration: 'none',
              fontSize: '0.875rem',
              fontWeight: '500',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }
          }, 'Contact')
        ])
      )
    ),

    // Auth Modal
    authModalOpen ? React.createElement(AuthModal, {
      key: 'auth-modal',
      isOpen: authModalOpen,
      onClose: closeAuthModal,
      initialTab: authModalTab
    }) : null
  ]);
};

export default LandingPage;