// client/src/components/DefaultLandingPage.js
// Default landing page with original ScottGPT functionality

import React, { useState, useEffect } from 'react';

const DefaultLandingPage = () => {
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || chatLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setChatLoading(true);

    // Add user message to chat
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await fetch('/api/chat/public', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: userMessage,
          conversationHistory: chatHistory
        })
      });

      const data = await response.json();

      if (response.ok && data.response) {
        // Add AI response to chat
        setChatHistory(prev => [...prev, { 
          role: 'assistant', 
          content: data.response,
          confidence: data.confidence,
          sources: data.sources || []
        }]);
      } else {
        throw new Error(data.error || 'Failed to get response');
      }

    } catch (error) {
      console.error('Chat error:', error);
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: `Sorry, I'm having trouble processing your question right now. Please try again later.`,
        error: true
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleSuggestionClick = (suggestionText) => {
    setMessage(suggestionText);
  };

  return (
    <div className="public-profile">
      {/* Profile Header */}
      <header className="profile-header">
        <div className="profile-info">
          <h1>Scott Lovett</h1>
          <h2 className="job-title">Senior Software Engineer & Technical Leader</h2>
          <p className="location">📍 Austin, Texas</p>
          
          <div className="profile-links">
            <a href="https://linkedin.com/in/scottlovett" target="_blank" rel="noopener noreferrer" className="profile-link">
              💼 LinkedIn
            </a>
            <a href="https://github.com/scottlovett" target="_blank" rel="noopener noreferrer" className="profile-link">
              💻 GitHub  
            </a>
          </div>
          
          <div className="bio">
            <p>Interactive AI-powered resume. Ask me anything about my professional experience, technical skills, and career background.</p>
          </div>
        </div>

        <div className="profile-stats">
          <div className="stat">
            <span className="stat-number">∞</span>
            <span className="stat-label">Questions Answered</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="profile-content">
        {/* AI Chat Interface */}
        <div className="chat-section">
          <h3>Ask about Scott's professional experience</h3>
          
          {chatHistory.length === 0 && (
            <div className="chat-welcome">
              <p>Hi! I'm an AI assistant that can answer questions about Scott's professional experience, technical background, and career journey. I have access to detailed information about his work history, projects, and expertise.</p>
              <div className="suggested-questions">
                <h4>Try asking:</h4>
                <button 
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick("What's your background in software development?")}
                >
                  "What's your background in software development?"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick("Tell me about your leadership experience")}
                >
                  "Tell me about your leadership experience"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick("What technologies do you work with?")}
                >
                  "What technologies do you work with?"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick("What's your experience with AI and machine learning?")}
                >
                  "What's your experience with AI and machine learning?"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => handleSuggestionClick("Tell me about a challenging project you've worked on")}
                >
                  "Tell me about a challenging project you've worked on"
                </button>
              </div>
            </div>
          )}

          {/* Chat History */}
          <div className="chat-history">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`chat-message ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="message-content user-message">
                    <p>{msg.content}</p>
                  </div>
                ) : (
                  <div className="message-content ai-message">
                    <div className="message-text">
                      {msg.error ? (
                        <p className="error-message">{msg.content}</p>
                      ) : (
                        <div>
                          <p style={{whiteSpace: 'pre-wrap'}}>{msg.content}</p>
                          {msg.confidence && (
                            <span className={`confidence-badge confidence-${msg.confidence}`}>
                              Confidence: {msg.confidence}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="message-sources">
                        <h5>Sources:</h5>
                        <ul>
                          {msg.sources.map((source, idx) => (
                            <li key={idx}>
                              {source.title || source.filename} {source.organization && `- ${source.organization}`} ({source.type || 'document'})
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            
            {chatLoading && (
              <div className="chat-message assistant">
                <div className="message-content ai-message">
                  <div className="typing-indicator">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form onSubmit={handleChatSubmit} className="chat-form">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about Scott's experience, skills, projects, or career background..."
              className="chat-input"
              disabled={chatLoading}
            />
            <button 
              type="submit" 
              className="chat-submit"
              disabled={!message.trim() || chatLoading}
            >
              {chatLoading ? '...' : 'Send'}
            </button>
          </form>

          {/* Footer with auth link */}
          <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1rem', borderTop: '1px solid #3a3a3a', color: '#888' }}>
            <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem' }}>
              Want to create your own AI-powered resume? 
            </p>
            <a 
              href="/register" 
              style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: '500' }}
              onMouseOver={(e) => e.target.style.color = '#7c3aed'}
              onMouseOut={(e) => e.target.style.color = '#8b5cf6'}
            >
              Sign up here
            </a>
            <span style={{ margin: '0 1rem', color: '#555' }}>•</span>
            <a 
              href="/login" 
              style={{ color: '#8b5cf6', textDecoration: 'none', fontWeight: '500' }}
              onMouseOver={(e) => e.target.style.color = '#7c3aed'}
              onMouseOut={(e) => e.target.style.color = '#8b5cf6'}
            >
              Already have an account?
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefaultLandingPage;