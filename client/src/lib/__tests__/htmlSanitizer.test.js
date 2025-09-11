// client/src/lib/__tests__/htmlSanitizer.test.js
// Unit tests for HTML sanitization functionality

/**
 * @jest-environment jsdom
 */

import {
  sanitizeHTML,
  formatResumeHTML,
  htmlToText,
  validateATSCompatibility
} from '../htmlSanitizer';

describe('HTML Sanitizer', () => {
  describe('sanitizeHTML', () => {
    test('allows standard HTML tags', () => {
      const input = '<h1>Title</h1><p>Paragraph</p><ul><li>Item</li></ul>';
      const result = sanitizeHTML(input);
      
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<p>Paragraph</p>');
      expect(result).toContain('<ul><li>Item</li></ul>');
    });

    test('removes disallowed tags but keeps content', () => {
      const input = '<table><tr><td>Table content</td></tr></table>';
      const result = sanitizeHTML(input);
      
      expect(result).not.toContain('<table>');
      expect(result).not.toContain('<tr>');
      expect(result).not.toContain('<td>');
      expect(result).toContain('Table content');
    });

    test('removes disallowed attributes', () => {
      const input = '<p style="color: red;" onclick="alert()">Text</p>';
      const result = sanitizeHTML(input);
      
      expect(result).not.toContain('style=');
      expect(result).not.toContain('onclick=');
      expect(result).toContain('<p>Text</p>');
    });

    test('allows class and id attributes', () => {
      const input = '<div class="test" id="main">Content</div>';
      const result = sanitizeHTML(input);
      
      expect(result).toContain('class="test"');
      expect(result).toContain('id="main"');
    });

    test('handles empty input', () => {
      expect(sanitizeHTML('')).toBe('');
      expect(sanitizeHTML(null)).toBe('');
      expect(sanitizeHTML(undefined)).toBe('');
    });

    test('handles malformed HTML gracefully', () => {
      const input = '<p>Unclosed paragraph <div>Nested</div>';
      const result = sanitizeHTML(input);
      
      expect(result).toContain('Unclosed paragraph');
      expect(result).toContain('Nested');
    });
  });

  describe('formatResumeHTML', () => {
    const sampleResumeData = {
      personalInfo: {
        name: 'John Doe',
        title: 'Software Engineer',
        email: 'john@example.com',
        phone: '(555) 123-4567',
        location: 'San Francisco, CA'
      },
      summary: 'Experienced software engineer with 5+ years of experience.',
      experience: [
        {
          title: 'Senior Developer',
          company: 'Tech Corp',
          dateRange: '2020-2023',
          bullets: ['Built web applications', 'Led team of 3 developers']
        }
      ],
      skills: ['JavaScript', 'React', 'Node.js'],
      education: [
        {
          degree: 'BS Computer Science',
          school: 'University',
          year: '2018'
        }
      ]
    };

    test('formats complete resume data correctly', () => {
      const html = formatResumeHTML(sampleResumeData);
      
      expect(html).toContain('<h1>John Doe</h1>');
      expect(html).toContain('<h2>Professional Summary</h2>');
      expect(html).toContain('<h2>Professional Experience</h2>');
      expect(html).toContain('<h2>Core Competencies</h2>');
      expect(html).toContain('<h2>Education</h2>');
    });

    test('handles missing personal info gracefully', () => {
      const data = { ...sampleResumeData, personalInfo: {} };
      const html = formatResumeHTML(data);
      
      expect(html).not.toContain('<header>');
    });

    test('handles empty arrays gracefully', () => {
      const data = {
        personalInfo: { name: 'John Doe' },
        experience: [],
        skills: [],
        education: []
      };
      const html = formatResumeHTML(data);
      
      expect(html).toContain('John Doe');
      expect(html).not.toContain('<h2>Professional Experience</h2>');
      expect(html).not.toContain('<h2>Core Competencies</h2>');
      expect(html).not.toContain('<h2>Education</h2>');
    });

    test('escapes HTML special characters', () => {
      const data = {
        personalInfo: { name: 'John & Jane <Doe>' },
        summary: 'Experience with <script> tags'
      };
      const html = formatResumeHTML(data);
      
      expect(html).toContain('John &amp; Jane &lt;Doe&gt;');
      expect(html).toContain('&lt;script&gt;');
    });

    test('handles null input gracefully', () => {
      expect(formatResumeHTML(null)).toBe('');
      expect(formatResumeHTML(undefined)).toBe('');
    });
  });

  describe('htmlToText', () => {
    test('converts HTML to plain text', () => {
      const html = '<h1>Title</h1><p>Paragraph with <strong>bold</strong> text.</p>';
      const text = htmlToText(html);
      
      expect(text).toContain('Title');
      expect(text).toContain('Paragraph with bold text.');
      expect(text).not.toContain('<h1>');
      expect(text).not.toContain('<strong>');
    });

    test('handles empty input', () => {
      expect(htmlToText('')).toBe('');
      expect(htmlToText(null)).toBe('');
    });

    test('preserves text content from complex HTML', () => {
      const html = `
        <div>
          <h2>Section</h2>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
        </div>
      `;
      const text = htmlToText(html);
      
      expect(text).toContain('Section');
      expect(text).toContain('Item 1');
      expect(text).toContain('Item 2');
    });
  });

  describe('validateATSCompatibility', () => {
    test('passes validation for ATS-friendly HTML', () => {
      const html = '<h1>Title</h1><p>Text</p><ul><li>Item</li></ul>';
      const result = validateATSCompatibility(html);
      
      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    test('detects tables as issue', () => {
      const html = '<table><tr><td>Data</td></tr></table>';
      const result = validateATSCompatibility(html);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Contains tables - use lists or divs instead');
    });

    test('detects images as issue', () => {
      const html = '<p>Text <img src="image.jpg" alt="Image"> more text</p>';
      const result = validateATSCompatibility(html);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Contains images - remove for better ATS compatibility');
    });

    test('detects inline styles as issue', () => {
      const html = '<p style="color: red;">Styled text</p>';
      const result = validateATSCompatibility(html);
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Contains inline styles - use semantic HTML instead');
    });

    test('handles empty content', () => {
      const result = validateATSCompatibility('');
      
      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Empty content');
    });

    test('detects multiple issues', () => {
      const html = '<table style="width: 100%;"><tr><td><img src="logo.jpg"></td></tr></table>';
      const result = validateATSCompatibility(html);
      
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(1);
    });
  });
});