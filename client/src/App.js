import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [message, setMessage] = useState('');
  const [response, setResponse] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;

    setLoading(true);
    try {
      const result = await axios.post('/api/chat', { message });
      setResponse(result.data.response);
    } catch (error) {
      setResponse('Error: Failed to get response from ScottGPT');
      console.error('Chat error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>ScottGPT</h1>
        <p>Interactive Resume - Ask me anything about Scott's experience!</p>
      </header>
      
      <main className="App-main">
        <form onSubmit={handleSubmit} className="chat-form">
          <div className="input-group">
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Ask about experience, skills, projects..."
              className="message-input"
              disabled={loading}
            />
            <button 
              type="submit" 
              disabled={loading || !message.trim()}
              className="send-button"
            >
              {loading ? 'Asking...' : 'Ask'}
            </button>
          </div>
        </form>

        {response && (
          <div className="response-area">
            <h3>Response:</h3>
            <div className="response-text">
              {response}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;