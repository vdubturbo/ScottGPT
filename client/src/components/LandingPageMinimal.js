// Minimal LandingPage test - just basic elements with simple inline styles
import React from 'react';

const LandingPageMinimal = () => {
  console.log('LandingPageMinimal rendering...');
  
  return (
    <div style={{ background: 'lightblue', minHeight: '100vh', padding: '2rem' }}>
      <h1 style={{ color: 'darkblue', fontSize: '3rem' }}>
        TEST - Resumes that write themselves
      </h1>
      <p style={{ color: 'black', fontSize: '1.2rem' }}>
        This is a minimal test version. If you can see blue background and this text, 
        the issue is with the full LandingPage component.
      </p>
      <button style={{ 
        background: 'orange', 
        color: 'white', 
        padding: '1rem 2rem',
        fontSize: '1rem',
        border: 'none',
        borderRadius: '8px'
      }}>
        Test Button
      </button>
    </div>
  );
};

export default LandingPageMinimal;