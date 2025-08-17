/**
 * ValidationMessage - Component for displaying field validation messages
 */

import React from 'react';
import './ValidationMessage.css';

const ValidationMessage = ({ field, errors = [], warnings = [] }) => {
  const fieldErrors = errors.filter(error => error.field === field);
  const fieldWarnings = warnings.filter(warning => warning.field === field);

  if (fieldErrors.length === 0 && fieldWarnings.length === 0) {
    return null;
  }

  return (
    <div className="validation-messages">
      {fieldErrors.map((error, index) => (
        <div key={`error-${index}`} className="validation-message error">
          <span className="message-icon">⚠️</span>
          <span className="message-text">{error.message}</span>
        </div>
      ))}
      
      {fieldWarnings.map((warning, index) => (
        <div key={`warning-${index}`} className="validation-message warning">
          <span className="message-icon">💡</span>
          <span className="message-text">{warning.message}</span>
        </div>
      ))}
    </div>
  );
};

export default ValidationMessage;