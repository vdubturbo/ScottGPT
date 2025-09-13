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

  // Format AI response with proper paragraph structure
  const formatResponse = (content) => {
    if (!content) return null;
    
    // Split content into paragraphs
    const paragraphs = content.split('\n\n').filter(p => p.trim());
    
    return (
      <div className="formatted-response">
        {paragraphs.map((paragraph, index) => {
          const trimmedParagraph = paragraph.trim();
          
          // Check if paragraph looks like a header (short and ends without punctuation)
          const isHeader = trimmedParagraph.length < 100 && 
                          !trimmedParagraph.endsWith('.') && 
                          !trimmedParagraph.endsWith('!') &&
                          !trimmedParagraph.includes('\n') &&
                          (trimmedParagraph.includes('experience') || 
                           trimmedParagraph.includes('background') ||
                           trimmedParagraph.includes('skills') ||
                           index === 0);
          
          // Check for bullet points
          const hasBullets = trimmedParagraph.includes('- ') || trimmedParagraph.includes('• ');
          
          if (hasBullets) {
            const lines = trimmedParagraph.split('\n');
            const bulletItems = [];
            let currentText = '';
            
            lines.forEach(line => {
              if (line.trim().startsWith('- ') || line.trim().startsWith('• ')) {
                if (currentText) {
                  // Add any preceding text as a paragraph
                  bulletItems.push(
                    <p key={`text-${bulletItems.length}`} className="response-text">
                      {currentText.trim()}
                    </p>
                  );
                  currentText = '';
                }
                bulletItems.push(line.trim().substring(2));
              } else {
                currentText += line + '\n';
              }
            });
            
            // Add any remaining text
            if (currentText) {
              bulletItems.push(
                <p key={`text-${bulletItems.length}`} className="response-text">
                  {currentText.trim()}
                </p>
              );
            }
            
            // Separate bullet points from text elements
            const textElements = bulletItems.filter(item => typeof item !== 'string');
            const bullets = bulletItems.filter(item => typeof item === 'string');
            
            return (
              <div key={index}>
                {textElements}
                {bullets.length > 0 && (
                  <ul className="response-bullet-list">
                    {bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                )}
              </div>
            );
          }
          
          // Regular paragraph - use proper HTML paragraph tag
          return (
            <p key={index} className={isHeader ? 'response-header' : 'response-text'}>
              {trimmedParagraph}
            </p>
          );
        })}
      </div>
    );
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
        <div className="profile-header-logo">
          <img src="/Logo3.png" alt="SplitOut.ai" className="profile-logo" />
        </div>
        
      </header>

      {/* Main Content */}
      <div className="profile-content">
        {/* AI Chat Interface */}
        <div className="chat-section">
          <h3>Ask about {profile.display_name || profile.full_name}'s experience</h3>
          
          {chatHistory.length === 0 && (
            <div className="chat-welcome">
              <div className="suggested-questions">
                <h4>Ask me about my experience, skills, or even for an example of an approach!</h4>
              </div>
            </div>
          )}

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

          {/* Chat History - Enhanced for Long Content */}
          <div className="enhanced-chat-history">
            {chatHistory.map((msg, index) => (
              <div key={index} className={`enhanced-chat-message ${msg.role}`}>
                {msg.role === 'user' ? (
                  <div className="user-message-container">
                    <div className="message-avatar user-avatar">
                      <span>👤</span>
                    </div>
                    <div className="user-message-bubble">
                      <p>{msg.content}</p>
                    </div>
                  </div>
                ) : (
                  <div className="ai-message-container">
                    <div className="message-avatar ai-avatar">
                      <span>🤖</span>
                    </div>
                    <div className="ai-message-content">
                      {msg.error ? (
                        <div className="error-response">
                          <p className="error-message">{msg.content}</p>
                        </div>
                      ) : (
                        <div className="ai-response-card">
                          <div className="response-header">
                            <span className="response-title">Response #{index/2 + 1}</span>
                            {msg.confidence && (
                              <span className={`confidence-badge confidence-${msg.confidence}`}>
                                {msg.confidence} confidence
                              </span>
                            )}
                          </div>
                          
                          <div className="response-content">
                            {formatResponse(msg.content)}
                          </div>
                          
                          {msg.sources && msg.sources.length > 0 && (
                            <details className="response-sources">
                              <summary className="sources-toggle">
                                📚 View Sources ({msg.sources.length})
                              </summary>
                              <div className="sources-list">
                                {msg.sources.map((source, idx) => (
                                  <div key={idx} className="source-item">
                                    <div className="source-title">{source.title}</div>
                                    <div className="source-meta">
                                      {source.organization} • {source.type}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            
            {chatLoading && (
              <div className="enhanced-chat-message assistant">
                <div className="ai-message-container">
                  <div className="message-avatar ai-avatar">
                    <span>🤖</span>
                  </div>
                  <div className="ai-message-content">
                    <div className="ai-response-card loading">
                      <div className="response-header">
                        <span className="response-title">Thinking...</span>
                      </div>
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PublicProfile;