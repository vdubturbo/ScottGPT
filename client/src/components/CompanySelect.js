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

  // Load existing companies (now always load, not just for editing)
  const loadCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getExistingCompanies();
      // Extract company names from company groups with enhanced data
      const companyNames = response?.companies?.map(company => ({
        name: company.originalNames[0], // Use the first original name
        normalizedName: company.normalizedName,
        totalPositions: company.totalPositions,
        variations: company.originalNames,
        isMultiplePositions: company.totalPositions > 1
      })) || [];

      // Sort companies by position count (descending) then alphabetically
      companyNames.sort((a, b) => {
        if (b.totalPositions !== a.totalPositions) {
          return b.totalPositions - a.totalPositions;
        }
        return a.name.localeCompare(b.name);
      });

      setCompanies(companyNames);
    } catch (err) {
      console.error('Failed to load existing companies:', err);
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, [getExistingCompanies]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  // Enhanced filtering with search and sections
  useEffect(() => {
    if (!value || value.trim() === '') {
      // Show all companies when no search term
      setFilteredCompanies(companies);
      return;
    }

    const searchTerm = value.toLowerCase().trim();
    const filtered = companies.filter(company =>
      company.name.toLowerCase().includes(searchTerm) ||
      company.normalizedName.toLowerCase().includes(searchTerm) ||
      company.variations.some(variation =>
        variation.toLowerCase().includes(searchTerm)
      )
    );

    setFilteredCompanies(filtered);
  }, [value, companies]);

  // Determine if we should show the "Create new company" option
  const shouldShowCreateNew = () => {
    if (!value || value.trim() === '') return false;

    const exactMatch = companies.some(company =>
      company.name.toLowerCase() === value.toLowerCase().trim() ||
      company.variations.some(variation =>
        variation.toLowerCase() === value.toLowerCase().trim()
      )
    );

    return !exactMatch;
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    onChange(newValue);
    setShowDropdown(true);
  };

  const handleInputClick = () => {
    if (companies.length > 0) {
      setShowDropdown(!showDropdown);
    }
  };

  const handleCompanySelect = (company) => {
    onChange(company.name);
    setShowDropdown(false);
  };

  const handleCreateNew = () => {
    // Keep current value as new company name
    setShowDropdown(false);
  };

  const handleInputFocus = () => {
    if (companies.length > 0) {
      setShowDropdown(true);
    }
  };

  const handleInputBlur = () => {
    // Delay closing dropdown to allow for selection
    setTimeout(() => setShowDropdown(false), 200);
  };

  // Enhanced component with sections and grouping
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
        className={`${className} ${companies.length > 0 ? 'dropdown-mode' : ''}`}
        required={required}
        disabled={loading}
        autoComplete="organization"
      />

      {showDropdown && (
        <div className="company-dropdown">
          {/* Create new company section */}
          {shouldShowCreateNew() && (
            <>
              <div className="dropdown-header">Create New Company</div>
              <ul className="company-list">
                <li
                  onClick={handleCreateNew}
                  className="company-option create-new-option"
                >
                  <div className="company-name">✨ Create "{value}"</div>
                  <div className="company-meta">New company</div>
                </li>
              </ul>
            </>
          )}

          {/* Existing companies section */}
          {filteredCompanies.length > 0 && (
            <>
              <div className="dropdown-header">
                {shouldShowCreateNew() ? 'Or Select Existing Company' : 'Select from Your Companies'}
              </div>
              <ul className="company-list">
                {filteredCompanies.map((company, index) => (
                  <li
                    key={`company-${index}`}
                    onClick={() => handleCompanySelect(company)}
                    className={`company-option ${company.isMultiplePositions ? 'multiple-positions' : 'single-position'}`}
                  >
                    <div className="company-name">
                      {company.isMultiplePositions && '🏢 '}
                      {company.name}
                    </div>
                    <div className="company-meta">
                      {company.totalPositions} position{company.totalPositions !== 1 ? 's' : ''}
                      {company.variations.length > 1 && (
                        <span className="variations-hint">
                          • {company.variations.length} name{company.variations.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* No companies message */}
          {companies.length === 0 && !loading && (
            <div className="no-companies-message">
              No existing companies found. Type a company name to create a new one.
            </div>
          )}
        </div>
      )}

      {!isEditing && (
        <div className="field-hint">
          Type to search existing companies or create a new one
        </div>
      )}
    </div>
  );
};

export default CompanySelect;