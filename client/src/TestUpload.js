import React from 'react';
import CompactUploadProcessor from './components/CompactUploadProcessor';
import './App.css';

function TestUpload() {
  return (
    <div className="App">
      <header className="App-header">
        <img src="/Logo3.png" alt="SplitOut.ai" className="app-logo" />
        <h1>Upload Test - Progress Tracking</h1>
      </header>
      
      <main className="main-content">
        <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
          <CompactUploadProcessor />
        </div>
      </main>
    </div>
  );
}

export default TestUpload;