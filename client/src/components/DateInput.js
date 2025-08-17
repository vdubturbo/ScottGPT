/**
 * DateInput - Component for date input with current position support
 */

import React, { useState, useEffect } from 'react';
import './DateInput.css';

const DateInput = ({ 
  id, 
  value, 
  onChange, 
  allowCurrent = false,
  className = '',
  ...props 
}) => {
  const [dateValue, setDateValue] = useState('');
  const [isCurrent, setIsCurrent] = useState(false);

  // Initialize from value
  useEffect(() => {
    if (value === null || value === '') {
      setIsCurrent(allowCurrent);
      setDateValue('');
    } else {
      setIsCurrent(false);
      // Convert date to YYYY-MM format for input
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        setDateValue(`${year}-${month}`);
      } else {
        setDateValue('');
      }
    }
  }, [value, allowCurrent]);

  // Handle date input change
  const handleDateChange = (e) => {
    const newValue = e.target.value;
    setDateValue(newValue);
    
    if (newValue) {
      // Convert YYYY-MM to date string
      const [year, month] = newValue.split('-');
      const dateStr = `${year}-${month}-01`;
      onChange(dateStr);
      setIsCurrent(false);
    } else {
      onChange('');
    }
  };

  // Handle current checkbox change
  const handleCurrentChange = (e) => {
    const checked = e.target.checked;
    setIsCurrent(checked);
    
    if (checked) {
      setDateValue('');
      onChange(null); // null indicates current position
    } else {
      onChange('');
    }
  };

  // Format date for display
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long' 
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className={`date-input-container ${className}`}>
      <div className="date-input-wrapper">
        <input
          id={id}
          type="month"
          value={dateValue}
          onChange={handleDateChange}
          disabled={isCurrent}
          className={`date-input ${isCurrent ? 'disabled' : ''}`}
          {...props}
        />
        
        {allowCurrent && (
          <div className="current-checkbox-wrapper">
            <label className="current-checkbox">
              <input
                type="checkbox"
                checked={isCurrent}
                onChange={handleCurrentChange}
              />
              <span className="checkbox-label">Current</span>
            </label>
          </div>
        )}
      </div>
      
      {value && !isCurrent && (
        <div className="date-display">
          {formatDateForDisplay(value)}
        </div>
      )}
      
      {isCurrent && (
        <div className="date-display current">
          Present
        </div>
      )}
    </div>
  );
};

export default DateInput;