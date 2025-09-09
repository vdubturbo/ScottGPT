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
      <nav className="landing-nav">
        <div className="nav-container">
          <div className="nav-logo">
            <img src="/Logo3.png" alt="SplitOut.ai" className="nav-logo-img" />
          </div>
          <div className="nav-links">
            <button onClick={() => scrollToSection('features')} className="nav-link">Features</button>
            <button onClick={() => scrollToSection('how-it-works')} className="nav-link">How It Works</button>
            <button onClick={() => openAuthModal('register')} className="btn btn-primary nav-cta">Get Started</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-container">
          <div className="hero-content">
            <div className="hero-logo">
              <img src="/Logo3.png" alt="SplitOut.ai" className="hero-logo-img" />
            </div>
            <h1 className="hero-title">
              Transform Your Career Documents Into An 
              <span className="gradient-text"> AI-Powered Professional Profile</span>
            </h1>
            <p className="hero-subtitle">
              Upload all your scattered professional documents. Our AI creates a unified knowledge base 
              that recruiters can explore through natural conversations, generating tailored resumes that beat ATS systems.
            </p>
            <div className="hero-actions">
              <button onClick={() => openAuthModal('register')} className="btn btn-primary btn-large">
                Start Building Your AI Profile
              </button>
              <button onClick={() => scrollToSection('how-it-works')} className="btn btn-outline btn-large">
                See How It Works
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Value Propositions */}
      <section className="value-props-section">
        <div className="container">
          <h2 className="section-title">Why SplitOut.ai Changes Everything</h2>
          <div className="value-props-grid">
            <div className="value-prop">
              <div className="value-prop-icon">📁</div>
              <h3>No More Scattered Documents</h3>
              <p>Upload resumes, performance reviews, project summaries, portfolios - everything in one intelligent system</p>
            </div>
            <div className="value-prop">
              <div className="value-prop-icon">🤖</div>
              <h3>Profile-less Conversations</h3>
              <p>Skip static profiles. Share a URL where recruiters ask questions and get intelligent, contextual answers</p>
            </div>
            <div className="value-prop">
              <div className="value-prop-icon">🎯</div>
              <h3>ATS-Optimized Resumes</h3>
              <p>Generate perfectly tailored resumes for specific jobs that pass AI screening and impress human reviewers</p>
            </div>
            <div className="value-prop">
              <div className="value-prop-icon">⚡</div>
              <h3>Always Current</h3>
              <p>Add new experiences anytime. Your AI profile instantly incorporates and leverages all your latest achievements</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="how-it-works-section">
        <div className="container">
          <h2 className="section-title">Simple 3-Step Process</h2>
          <div className="steps-container">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Upload Everything</h3>
                <p>Drop in all your professional documents - resumes, reviews, project files, portfolios. Any format works.</p>
              </div>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>AI Creates Your Knowledge Base</h3>
                <p>Our AI processes and understands your entire career story, creating an intelligent, searchable profile.</p>
              </div>
            </div>
            <div className="step-connector"></div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Share & Generate</h3>
                <p>Share your unique URL with recruiters or instantly generate tailored resumes for specific opportunities.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Showcase */}
      <section id="features" className="features-section">
        <div className="container">
          <h2 className="section-title">Powerful Features That Get You Noticed</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3>Conversational Interface</h3>
              <p>Recruiters ask natural questions, AI answers with your real experience and achievements</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Smart Resume Generation</h3>
              <p>AI creates targeted resumes that match job requirements and optimize for ATS scanning</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔗</div>
              <h3>Shareable Profile URLs</h3>
              <p>One link showcases your entire career intelligently - perfect for networking and applications</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔄</div>
              <h3>Dynamic Updates</h3>
              <p>Add new experiences, skills, or projects - your AI profile immediately incorporates them</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🎯</div>
              <h3>Context-Aware Responses</h3>
              <p>AI understands the full context of your career progression and presents relevant information</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🏆</div>
              <h3>Competitive Advantage</h3>
              <p>Stand out with AI-powered storytelling that highlights your unique value proposition</p>
            </div>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="social-proof-section">
        <div className="container">
          <h2 className="section-title">Join The Future of Professional Networking</h2>
          <div className="social-stats">
            <div className="stat">
              <div className="stat-number">10x</div>
              <div className="stat-label">More Recruiter Engagement</div>
            </div>
            <div className="stat">
              <div className="stat-number">95%</div>
              <div className="stat-label">ATS Pass Rate</div>
            </div>
            <div className="stat">
              <div className="stat-number">3min</div>
              <div className="stat-label">Average Setup Time</div>
            </div>
          </div>
          <div className="testimonials">
            <div className="testimonial">
              <div className="testimonial-content">
                "Finally, a way to showcase my full career story without losing recruiters in a boring PDF. The AI conversations are incredible."
              </div>
              <div className="testimonial-author">— Sarah Chen, Software Engineer</div>
            </div>
            <div className="testimonial">
              <div className="testimonial-content">
                "I've never seen anything like this. Candidates share their SplitOut.ai link and I can explore their experience naturally."
              </div>
              <div className="testimonial-author">— Marcus Williams, Tech Recruiter</div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="final-cta-section">
        <div className="container">
          <div className="cta-content">
            <h2>Ready to Transform Your Career Presence?</h2>
            <p>Join thousands of professionals who've ditched static resumes for AI-powered career storytelling.</p>
            <div className="cta-actions">
              <button onClick={() => openAuthModal('register')} className="btn btn-primary btn-large">
                Create Your AI Profile Now
              </button>
              <button onClick={() => openAuthModal('login')} className="btn btn-secondary btn-large">
                Already have an account? Sign in
              </button>
            </div>
            <p className="cta-note">Free to start • No credit card required • Setup in under 3 minutes</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-brand">
              <img src="/Logo3.png" alt="SplitOut.ai" className="footer-logo" />
              <p>AI-powered career intelligence that gets you noticed.</p>
            </div>
            <div className="footer-links">
              <div className="footer-section">
                <h4>Product</h4>
                <button onClick={() => openAuthModal('register')} className="footer-link">Get Started</button>
                <button onClick={() => scrollToSection('features')} className="footer-link">Features</button>
                <button onClick={() => scrollToSection('how-it-works')} className="footer-link">How It Works</button>
              </div>
              <div className="footer-section">
                <h4>Company</h4>
                <button className="footer-link">About</button>
                <button className="footer-link">Contact</button>
                <button className="footer-link">Privacy</button>
              </div>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2025 SplitOut.ai. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      <AuthModal 
        isOpen={authModalOpen} 
        onClose={closeAuthModal}
        initialTab={authModalTab}
      />
    </div>
  );
};

export default LandingPage;