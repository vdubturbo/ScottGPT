// Diagnostic test component to isolate rendering issues
import React from 'react';

const DiagnosticTest = () => {
  return (
    <div style={{
      background: 'red',
      color: 'white',
      padding: '2rem',
      fontSize: '2rem',
      textAlign: 'center',
      minHeight: '100vh'
    }}>
      <h1>DIAGNOSTIC TEST COMPONENT</h1>
      <p>If you can see this red background and white text, React rendering is working.</p>
      <div style={{
        background: 'blue',
        color: 'yellow',
        padding: '1rem',
        margin: '1rem',
        border: '5px solid green'
      }}>
        This should be blue with yellow text and green border
      </div>
    </div>
  );
};

export default DiagnosticTest;