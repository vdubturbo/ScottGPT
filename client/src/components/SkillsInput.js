/**
 * SkillsInput - Component for managing skills input with tags
 */

import React, { useState, useRef, useEffect } from 'react';
import './SkillsInput.css';

const SkillsInput = ({ value = [], onChange, placeholder = "Add skills..." }) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(-1);
  const inputRef = useRef(null);

  // Common skills suggestions
  const commonSkills = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'TypeScript', 'Go', 'Rust', 'Swift', 'Kotlin',
    'React', 'Angular', 'Vue.js', 'Node.js', 'Express', 'Next.js', 'Django', 'Flask', 'Spring', 'Laravel',
    'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'GitLab CI', 'GitHub Actions',
    'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch', 'GraphQL', 'REST APIs', 'Microservices',
    'Machine Learning', 'Data Science', 'TensorFlow', 'PyTorch', 'Pandas', 'NumPy', 'Scikit-learn',
    'Project Management', 'Agile', 'Scrum', 'Leadership', 'Team Management', 'Communication', 'Problem Solving',
    'Git', 'Linux', 'Bash', 'PowerShell', 'CI/CD', 'DevOps', 'Testing', 'Unit Testing', 'Integration Testing',
    'HTML', 'CSS', 'Sass', 'Bootstrap', 'Tailwind CSS', 'Material-UI', 'Responsive Design', 'UI/UX Design'
  ];

  // Filter suggestions based on input
  useEffect(() => {
    if (inputValue.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const filtered = commonSkills
      .filter(skill => 
        skill.toLowerCase().includes(inputValue.toLowerCase()) &&
        !value.some(existingSkill => 
          existingSkill.toLowerCase() === skill.toLowerCase()
        )
      )
      .slice(0, 8); // Limit to 8 suggestions

    setSuggestions(filtered);
    setShowSuggestions(filtered.length > 0);
    setSelectedSuggestion(-1);
  }, [inputValue, value]);

  // Handle input change
  const handleInputChange = (e) => {
    setInputValue(e.target.value);
  };

  // Handle key down
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSuggestion >= 0 && suggestions[selectedSuggestion]) {
        addSkill(suggestions[selectedSuggestion]);
      } else if (inputValue.trim()) {
        addSkill(inputValue.trim());
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSuggestion(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSuggestion(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedSuggestion(-1);
    } else if (e.key === 'Backspace' && inputValue === '' && value.length > 0) {
      // Remove last skill if input is empty
      removeSkill(value.length - 1);
    } else if (e.key === ',' || e.key === ';') {
      e.preventDefault();
      if (inputValue.trim()) {
        addSkill(inputValue.trim());
      }
    }
  };

  // Add skill
  const addSkill = (skill) => {
    const trimmedSkill = skill.trim();
    if (trimmedSkill && !value.some(s => s.toLowerCase() === trimmedSkill.toLowerCase())) {
      onChange([...value, trimmedSkill]);
    }
    setInputValue('');
    setShowSuggestions(false);
    setSelectedSuggestion(-1);
  };

  // Remove skill
  const removeSkill = (index) => {
    const newSkills = value.filter((_, i) => i !== index);
    onChange(newSkills);
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion) => {
    addSkill(suggestion);
    inputRef.current?.focus();
  };

  // Handle input blur
  const handleBlur = () => {
    // Delay hiding suggestions to allow for clicks
    setTimeout(() => {
      setShowSuggestions(false);
      setSelectedSuggestion(-1);
    }, 200);
  };

  // Handle input focus
  const handleFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className="skills-input-container">
      <div className="skills-input">
        <div className="skills-tags">
          {value.map((skill, index) => (
            <span key={index} className="skill-tag">
              {skill}
              <button
                type="button"
                className="remove-skill"
                onClick={() => removeSkill(index)}
                aria-label={`Remove ${skill}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={handleFocus}
            onBlur={handleBlur}
            placeholder={value.length === 0 ? placeholder : ''}
            className="skill-input"
            autoComplete="off"
          />
        </div>
        
        {showSuggestions && suggestions.length > 0 && (
          <div className="suggestions-dropdown">
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                className={`suggestion-item ${
                  index === selectedSuggestion ? 'selected' : ''
                }`}
                onClick={() => handleSuggestionClick(suggestion)}
                onMouseEnter={() => setSelectedSuggestion(index)}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
      
      <div className="skills-help">
        <span className="help-text">
          Press Enter, comma, or semicolon to add skills. Use ↑↓ to navigate suggestions.
        </span>
        <span className="skill-count">
          {value.length} skill{value.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
};

export default SkillsInput;