// client/src/components/PublicProfile.js
// Public profile view with AI chat functionality

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from './LoadingSpinner';

const PublicProfile = () => {
  const { slug } = useParams();
  const { getPublicProfile, chatWithProfile } = useAuth();
  
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Chat state
  const [message, setMessage] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [chatLoading, setChatLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [slug]);

  const loadProfile = async () => {
    if (!slug) return;

    try {
      setLoading(true);
      const result = await getPublicProfile(slug);
      
      if (result.success) {
        setProfile(result.profile);
        setError(null);
      } else {
        setError(result.error || 'Profile not found');
        setProfile(null);
      }
    } catch (err) {
      setError('Failed to load profile');
      setProfile(null);
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim() || chatLoading) return;

    const userMessage = message.trim();
    setMessage('');
    setChatLoading(true);

    // Add user message to chat
    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }]);

    try {
      const response = await chatWithProfile(slug, userMessage, {
        conversationHistory: chatHistory
      });

      // Add AI response to chat
      setChatHistory(prev => [...prev, { 
        role: 'assistant', 
        content: response.response,
        confidence: response.confidence,
        sources: response.sources,
        profileInfo: response.profileInfo
      }]);

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

  if (loading) {
    return <LoadingSpinner message="Loading profile..." />;
  }

  if (error) {
    return (
      <div className="error-page">
        <h1>Profile Not Found</h1>
        <p>{error}</p>
        <a href="/" className="btn btn-primary">Go Home</a>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="error-page">
        <h1>Profile Not Available</h1>
        <p>This profile is not publicly accessible.</p>
        <a href="/" className="btn btn-primary">Go Home</a>
      </div>
    );
  }

  return (
    <div className="public-profile">
      {/* Profile Header */}
      <header className="profile-header">
        <div className="profile-info">
          <h1>{profile.display_name || profile.full_name}</h1>
          {profile.job_title && <h2 className="job-title">{profile.job_title}</h2>}
          {profile.location && <p className="location">📍 {profile.location}</p>}
          
          <div className="profile-links">
            {profile.website_url && (
              <a href={profile.website_url} target="_blank" rel="noopener noreferrer" className="profile-link">
                🌐 Website
              </a>
            )}
            {profile.linkedin_url && (
              <a href={profile.linkedin_url} target="_blank" rel="noopener noreferrer" className="profile-link">
                💼 LinkedIn
              </a>
            )}
            {profile.github_url && (
              <a href={profile.github_url} target="_blank" rel="noopener noreferrer" className="profile-link">
                💻 GitHub
              </a>
            )}
            {profile.portfolio_url && (
              <a href={profile.portfolio_url} target="_blank" rel="noopener noreferrer" className="profile-link">
                🎨 Portfolio
              </a>
            )}
          </div>
          
          {profile.bio && (
            <div className="bio">
              <p>{profile.bio}</p>
            </div>
          )}
        </div>

        <div className="profile-stats">
          <div className="stat">
            <span className="stat-number">{profile.profile_views || 0}</span>
            <span className="stat-label">Profile Views</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="profile-content">
        {/* AI Chat Interface */}
        <div className="chat-section">
          <h3>Ask about {profile.display_name || profile.full_name}'s experience</h3>
          
          {chatHistory.length === 0 && (
            <div className="chat-welcome">
              <p>Hi! I'm an AI assistant that can answer questions about {profile.display_name || profile.full_name}'s professional experience and background.</p>
              <div className="suggested-questions">
                <h4>Try asking:</h4>
                <button 
                  className="suggestion-btn"
                  onClick={() => setMessage("What's your background in software development?")}
                >
                  "What's your background in software development?"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => setMessage("Tell me about your leadership experience")}
                >
                  "Tell me about your leadership experience"
                </button>
                <button 
                  className="suggestion-btn"
                  onClick={() => setMessage("What technologies do you work with?")}
                >
                  "What technologies do you work with?"
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
                          <p>{msg.content}</p>
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
                              {source.title} - {source.organization} ({source.type})
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
              placeholder={`Ask about ${profile.display_name || profile.full_name}'s experience...`}
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
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;