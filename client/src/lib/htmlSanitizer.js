// client/src/lib/htmlSanitizer.js
// HTML sanitization utilities for ATS-friendly resume output

// Allowed HTML tags for ATS compatibility
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr',
  'ul', 'ol', 'li',
  'strong', 'b', 'em', 'i',
  'span', 'div',
  'section', 'article', 'header'
]);

// Allowed attributes (very limited for ATS)
const ALLOWED_ATTRIBUTES = new Set([
  'class', 'id'
]);

// Sanitize HTML to be ATS-friendly
export const sanitizeHTML = (html) => {
  if (!html || typeof html !== 'string') return '';

  // Create a temporary DOM element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Recursively clean the DOM
  const cleanElement = (element) => {
    const tagName = element.tagName?.toLowerCase();
    
    // Remove disallowed tags but keep their content
    if (tagName && !ALLOWED_TAGS.has(tagName)) {
      const textContent = element.textContent || '';
      const textNode = document.createTextNode(textContent);
      element.parentNode?.replaceChild(textNode, element);
      return;
    }

    // Clean attributes
    if (element.attributes) {
      const attrs = Array.from(element.attributes);
      attrs.forEach(attr => {
        if (!ALLOWED_ATTRIBUTES.has(attr.name)) {
          element.removeAttribute(attr.name);
        }
      });
    }

    // Recursively clean children
    if (element.children) {
      Array.from(element.children).forEach(cleanElement);
    }
  };

  // Clean all elements
  Array.from(tempDiv.children).forEach(cleanElement);

  return tempDiv.innerHTML;
};

// Convert resume content to ATS-optimized HTML structure
export const formatResumeHTML = (resumeData) => {
  if (!resumeData) return '';

  const {
    personalInfo = {},
    summary = '',
    experience = [],
    education = [],
    skills = [],
    projects = []
  } = resumeData;

  let html = '';

  // Header section
  if (personalInfo.name) {
    html += `<header>
      <h1>${escapeHTML(personalInfo.name)}</h1>
      ${personalInfo.title ? `<p><strong>${escapeHTML(personalInfo.title)}</strong></p>` : ''}
      ${personalInfo.email ? `<p>${escapeHTML(personalInfo.email)}</p>` : ''}
      ${personalInfo.phone ? `<p>${escapeHTML(personalInfo.phone)}</p>` : ''}
      ${personalInfo.location ? `<p>${escapeHTML(personalInfo.location)}</p>` : ''}
    </header>`;
  }

  // Professional Summary
  if (summary) {
    html += `<section>
      <h2>Professional Summary</h2>
      <p>${escapeHTML(summary)}</p>
    </section>`;
  }

  // Work Experience
  if (experience.length > 0) {
    html += `<section>
      <h2>Professional Experience</h2>`;
    
    experience.forEach(job => {
      html += `<div>
        <h3>${escapeHTML(job.title || '')}</h3>
        <p><strong>${escapeHTML(job.company || '')}</strong></p>
        <p>${escapeHTML(job.dateRange || '')}</p>
        ${job.bullets ? `<ul>${job.bullets.map(bullet => `<li>${escapeHTML(bullet)}</li>`).join('')}</ul>` : ''}
      </div>`;
    });
    
    html += `</section>`;
  }

  // Skills
  if (skills.length > 0) {
    html += `<section>
      <h2>Core Competencies</h2>
      <ul>
        ${skills.map(skill => `<li>${escapeHTML(skill)}</li>`).join('')}
      </ul>
    </section>`;
  }

  // Education
  if (education.length > 0) {
    html += `<section>
      <h2>Education</h2>`;
    
    education.forEach(edu => {
      html += `<div>
        <h3>${escapeHTML(edu.degree || '')}</h3>
        <p><strong>${escapeHTML(edu.school || '')}</strong></p>
        <p>${escapeHTML(edu.year || '')}</p>
      </div>`;
    });
    
    html += `</section>`;
  }

  // Projects (if any)
  if (projects.length > 0) {
    html += `<section>
      <h2>Notable Projects</h2>`;
    
    projects.forEach(project => {
      html += `<div>
        <h3>${escapeHTML(project.name || '')}</h3>
        <p>${escapeHTML(project.description || '')}</p>
        ${project.technologies ? `<p><strong>Technologies:</strong> ${escapeHTML(project.technologies)}</p>` : ''}
      </div>`;
    });
    
    html += `</section>`;
  }

  return sanitizeHTML(html);
};

// Escape HTML special characters
const escapeHTML = (text) => {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
};

// Convert HTML to plain text for keyword analysis
export const htmlToText = (html) => {
  if (!html) return '';
  
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

// Validate HTML structure for ATS compatibility
export const validateATSCompatibility = (html) => {
  const issues = [];
  
  if (!html) {
    issues.push('Empty content');
    return { isValid: false, issues };
  }

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Check for tables (not ATS-friendly)
  if (tempDiv.querySelector('table')) {
    issues.push('Contains tables - use lists or divs instead');
  }

  // Check for images
  if (tempDiv.querySelector('img')) {
    issues.push('Contains images - remove for better ATS compatibility');
  }

  // Check for inline styles
  if (html.includes('style=')) {
    issues.push('Contains inline styles - use semantic HTML instead');
  }

  // Check for complex layouts
  if (tempDiv.querySelector('div[style*="float"]') || tempDiv.querySelector('div[style*="position"]')) {
    issues.push('Contains complex CSS layouts');
  }

  return {
    isValid: issues.length === 0,
    issues
  };
};