// Ultra minimal test - just red background
import React from 'react';

const UltraMinimal = () => {
  console.log('UltraMinimal rendering...');
  
  return React.createElement('div', {
    style: {
      backgroundColor: 'red',
      width: '100vw',
      height: '100vh',
      fontSize: '50px',
      color: 'white',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'fixed',
      top: 0,
      left: 0,
      zIndex: 9999
    }
  }, 'RED TEST - CAN YOU SEE THIS?');
};

export default UltraMinimal;