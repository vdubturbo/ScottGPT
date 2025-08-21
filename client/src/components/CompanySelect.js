/**
 * CompanySelect - Smart company selection component
 * Shows dropdown for existing companies when editing, allows new company creation when adding
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useUserDataAPI } from '../hooks/useUserDataAPI';
import './CompanySelect.css';

const CompanySelect = ({ 
  value, 
  onChange, 
  isEditing = false, 
  placeholder = "e.g., Tech Corp Inc.",
  className = "",
  required = false,
  id = "company"
}) => {
  const { getExistingCompanies } = useUserDataAPI();
  const [companies, setCompanies] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filteredCompanies, setFilteredCompanies] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load existing companies
  const loadCompanies = useCallback(async () => {
    if (!isEditing) return; // Only load for editing mode
    
    setLoading(true);
    try {
      const response = await getExistingCompanies();
      // Extract company names from company groups
      const companyNames = response?.companies?.map(company => ({
        name: company.originalNames[0], // Use the first original name
        normalizedName: company.normalizedName,
        totalPositions: company.totalPositions,
        variations: company.originalNames
      })) || [];
      
      setCompanies(companyNames);
    } catch (err) {
      console.error('Failed to load existing companies:', err);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [getExistingCompanies, isEditing]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Filter companies based on input (only for add mode, show all for edit mode)
  useEffect(() => {
    if (isEditing) {
      // In edit mode, always show all companies
      setFilteredCompanies(companies);
      return;
    }

    if (!value) {
      setFilteredCompanies(companies);
      return;
    }

    const searchTerm = value.toLowerCase();
    const filtered = companies.filter(company =>
      company.name.toLowerCase().includes(searchTerm) ||
      company.normalizedName.toLowerCase().includes(searchTerm) ||
      company.variations.some(variation => 
        variation.toLowerCase().includes(searchTerm)
      )
    );
    setFilteredCompanies(filtered);
  }, [value, companies, isEditing]);

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    
    if (isEditing) {
      setShowDropdown(true);
    }
  };

  const handleInputClick = () => {
    if (isEditing && companies.length > 0) {
      setShowDropdown(!showDropdown);
    }
  };

  const handleCompanySelect = (company) => {
    onChange(company.name);
    setShowDropdown(false);
  };

  const handleInputFocus = () => {
    if (isEditing && companies.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing dropdown to allow for selection
    setTimeout(() => setShowDropdown(false), 200);
  };

  // For editing mode: show dropdown with existing companies only
  if (isEditing) {
    return (
      <div className={`company-select ${className}`}>
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleInputChange}
          onClick={handleInputClick}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          placeholder={loading ? "Loading companies..." : placeholder}
          className={`${className} ${isEditing ? 'dropdown-mode' : ''}`}
          required={required}
          disabled={loading}
          readOnly={isEditing}
          autoComplete="organization"
        />
        
        {showDropdown && filteredCompanies.length > 0 && (
          <div className="company-dropdown">
            <div className="dropdown-header">
              Select from your existing companies:
            </div>
            <ul className="company-list">
              {filteredCompanies.map((company, index) => (
                <li 
                  key={index}
                  onClick={() => handleCompanySelect(company)}
                  className="company-option"
                >
                  <div className="company-name">{company.name}</div>
                  <div className="company-meta">
                    {company.totalPositions} position{company.totalPositions !== 1 ? 's' : ''}
                    {company.variations.length > 1 && (
                      <span className="variations-hint">
                        +{company.variations.length - 1} variation{company.variations.length - 1 !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {isEditing && companies.length === 0 && !loading && (
          <div className="no-companies-message">
            No existing companies found. You can type a new company name.
          </div>
        )}
      </div>
    );
  }

  // For adding mode: regular input that allows any company name
  return (
    <div className={`company-select ${className}`}>
      <input
        id={id}
        type="text"
        value={value}
        onChange={handleInputChange}
        placeholder={placeholder}
        className={className}
        required={required}
        autoComplete="organization"
      />
      <div className="field-hint">
        Enter a new company name or use an existing one from your work history.
      </div>
    </div>
  );
};

export default CompanySelect;