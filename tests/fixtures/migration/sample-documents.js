/**
 * Sample Document Fixtures for Migration Tests
 * Provides test data in various formats for comparing processing methods
 */

import crypto from 'crypto';

// Create realistic sample DOCX buffer (simulated)
export const sampleDOCXBuffer = createMockDOCXBuffer();

// Create realistic sample PDF buffer (simulated)  
export const samplePDFBuffer = createMockPDFBuffer();

// Sample Markdown content
export const sampleMarkdownContent = `---
title: Software Engineer Resume
author: John Doe
date: 2024-01-15
type: resume
skills:
  - JavaScript
  - Python
  - React
  - Node.js
---

# John Doe
## Software Engineer

### Contact Information
- Email: john.doe@example.com
- Phone: (555) 123-4567
- Location: San Francisco, CA
- LinkedIn: linkedin.com/in/johndoe

### Professional Summary

Experienced Software Engineer with 5+ years of full-stack development experience. 
Proven track record of delivering scalable web applications using modern JavaScript 
frameworks and cloud technologies.

### Work Experience

#### Senior Software Engineer
**TechCorp Inc.** | *Jan 2022 - Present*

- Led development of customer-facing React application serving 100k+ users
- Implemented microservices architecture reducing response time by 40%
- Mentored junior developers and established code review processes
- Technologies: React, Node.js, PostgreSQL, AWS

#### Software Engineer
**StartupXYZ** | *Jun 2019 - Dec 2021*

- Developed RESTful APIs using Node.js and Express
- Built responsive web interfaces with React and TypeScript
- Collaborated with product team to deliver features on tight deadlines
- Technologies: Node.js, React, MongoDB, Docker

### Education

#### Bachelor of Science in Computer Science
**University of California, Berkeley** | *2015 - 2019*

- Relevant Coursework: Data Structures, Algorithms, Database Systems
- GPA: 3.8/4.0

### Skills

**Programming Languages:** JavaScript, Python, TypeScript, Java
**Frameworks:** React, Node.js, Express, Django
**Databases:** PostgreSQL, MongoDB, Redis
**Tools:** Git, Docker, AWS, Jenkins

### Projects

#### E-Commerce Platform
Open source e-commerce platform built with React and Node.js
- GitHub: github.com/johndoe/ecommerce-platform
- 500+ stars, 100+ forks

#### Task Management App
Personal productivity app with real-time collaboration
- Technologies: React, Socket.io, MongoDB
- 1000+ active users
`;

// Expected processing results for validation
export const expectedDOCXResult = {
  text: "John Doe Software Engineer Experience includes React, Node.js, and cloud technologies",
  wordCount: 250,
  pages: 2,
  metadata: {
    author: "John Doe",
    title: "Software Engineer Resume",
    createdDate: "2024-01-15T00:00:00.000Z",
    modifiedDate: "2024-01-15T00:00:00.000Z"
  },
  sections: [
    { type: "header", content: "John Doe" },
    { type: "subheader", content: "Software Engineer" },
    { type: "section", content: "Professional Summary" },
    { type: "section", content: "Work Experience" },
    { type: "section", content: "Education" },
    { type: "section", content: "Skills" }
  ]
};

export const expectedPDFResult = {
  text: "John Doe Software Engineer Resume with experience in JavaScript and cloud technologies",
  pageCount: 2,
  metadata: {
    producer: "Test PDF Creator",
    creator: "Migration Test Suite",
    title: "Software Engineer Resume",
    subject: "Resume Document",
    keywords: "software engineer, resume, javascript",
    creationDate: "2024-01-15T00:00:00.000Z"
  },
  extractedData: {
    name: "John Doe",
    title: "Software Engineer",
    email: "john.doe@example.com",
    skills: ["JavaScript", "Python", "React", "Node.js"],
    experience: [
      {
        title: "Senior Software Engineer",
        company: "TechCorp Inc.",
        duration: "Jan 2022 - Present"
      },
      {
        title: "Software Engineer", 
        company: "StartupXYZ",
        duration: "Jun 2019 - Dec 2021"
      }
    ]
  }
};

export const expectedMarkdownResult = {
  content: sampleMarkdownContent,
  frontmatter: {
    title: "Software Engineer Resume",
    author: "John Doe",
    date: "2024-01-15",
    type: "resume",
    skills: ["JavaScript", "Python", "React", "Node.js"]
  },
  markdown: {
    headings: [
      { level: 1, text: "John Doe" },
      { level: 2, text: "Software Engineer" },
      { level: 3, text: "Contact Information" },
      { level: 3, text: "Professional Summary" },
      { level: 3, text: "Work Experience" },
      { level: 4, text: "Senior Software Engineer" },
      { level: 4, text: "Software Engineer" },
      { level: 3, text: "Education" },
      { level: 4, text: "Bachelor of Science in Computer Science" },
      { level: 3, text: "Skills" },
      { level: 3, text: "Projects" }
    ],
    lists: [
      ["Email: john.doe@example.com", "Phone: (555) 123-4567", "Location: San Francisco, CA"],
      ["JavaScript", "Python", "TypeScript", "Java"],
      ["React", "Node.js", "Express", "Django"]
    ]
  },
  wordCount: 285,
  characterCount: 1847
};

// Document variants for testing different scenarios
export const documentVariants = {
  // Small document (< 10KB)
  small: {
    docx: createMockDOCXBuffer(5000),
    pdf: createMockPDFBuffer(3000),
    markdown: "# Small Document\n\nThis is a small test document with minimal content."
  },
  
  // Medium document (100KB - 1MB)
  medium: {
    docx: createMockDOCXBuffer(500000),
    pdf: createMockPDFBuffer(300000),
    markdown: generateMarkdownContent(50000)
  },
  
  // Large document (> 1MB)
  large: {
    docx: createMockDOCXBuffer(2000000),
    pdf: createMockPDFBuffer(1500000),
    markdown: generateMarkdownContent(800000)
  },
  
  // Corrupted documents for error testing
  corrupted: {
    docx: Buffer.from([0xFF, 0xFE, 0x00, 0x00, 0xDE, 0xAD, 0xBE, 0xEF]),
    pdf: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2D, 0xFF, 0xFF]), // Invalid PDF
    markdown: Buffer.from([0x00, 0x01, 0x02, 0x03]) // Binary data as markdown
  },
  
  // Empty documents
  empty: {
    docx: Buffer.alloc(0),
    pdf: Buffer.alloc(0),
    markdown: ""
  },
  
  // Documents with special characters and Unicode
  unicode: {
    docx: createMockDOCXBuffer(10000, "unicode"),
    pdf: createMockPDFBuffer(8000, "unicode"),
    markdown: `# Résumé - José María
    
## Información Personal
- Nombre: José María González-Pérez
- Teléfono: +34 123 456 789
- Email: josé.maría@ejemplo.es
- Ubicación: Madrid, España

## Habilidades Técnicas
- Programación: JavaScript, Python, Java
- Idiomas: Español (nativo), English (fluent), Français (intermediate)
- Emojis: 🚀 💻 🎯 ⭐

## Experiencia
Desarrollador Senior con experiencia en múltiples tecnologías...`
  }
};

// Test scenarios with expected outcomes
export const testScenarios = [
  {
    name: "Resume Processing",
    input: sampleDOCXBuffer,
    metadata: {
      originalName: "resume.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    },
    expected: expectedDOCXResult
  },
  {
    name: "PDF Report Processing",
    input: samplePDFBuffer,
    metadata: {
      originalName: "report.pdf",
      mimeType: "application/pdf"
    },
    expected: expectedPDFResult
  },
  {
    name: "Markdown Documentation",
    input: Buffer.from(sampleMarkdownContent),
    metadata: {
      originalName: "readme.md",
      mimeType: "text/markdown"
    },
    expected: expectedMarkdownResult
  }
];

// Performance test data sets
export const performanceTestData = {
  // Batch processing test data
  batch: {
    small: Array(100).fill(null).map(() => createMockDOCXBuffer(5000)),
    medium: Array(50).fill(null).map(() => createMockDOCXBuffer(100000)),
    large: Array(10).fill(null).map(() => createMockDOCXBuffer(1000000))
  },
  
  // Concurrent processing test data
  concurrent: Array(20).fill(null).map((_, i) => ({
    buffer: createMockDOCXBuffer(50000 + i * 1000),
    metadata: {
      originalName: `doc-${i}.docx`,
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }
  })),
  
  // Memory stress test data
  memoryStress: [
    createMockDOCXBuffer(10 * 1024 * 1024),   // 10MB
    createMockDOCXBuffer(50 * 1024 * 1024),   // 50MB
    createMockDOCXBuffer(100 * 1024 * 1024)   // 100MB
  ]
};

// Helper functions

function createMockDOCXBuffer(size = 15000, variant = "normal") {
  // Create a buffer that simulates a DOCX file structure
  const header = Buffer.from([
    0x50, 0x4B, 0x03, 0x04, // ZIP file signature (DOCX is ZIP-based)
    0x14, 0x00, 0x06, 0x00  // Version, flags
  ]);
  
  let content;
  if (variant === "unicode") {
    // Include Unicode characters
    content = Buffer.from("José María González-Pérez résumé with special chars: áéíóú ñ 中文 日本語", 'utf8');
  } else {
    content = Buffer.from("Sample DOCX content: " + "A".repeat(Math.max(0, size - 100)));
  }
  
  const footer = Buffer.from([0x50, 0x4B, 0x05, 0x06]); // ZIP end signature
  
  return Buffer.concat([header, content, footer]);
}

function createMockPDFBuffer(size = 12000, variant = "normal") {
  // Create a buffer that simulates a PDF file structure
  const header = Buffer.from("%PDF-1.4\n");
  
  let content;
  if (variant === "unicode") {
    content = Buffer.from("PDF content with Unicode: José María résumé", 'utf8');
  } else {
    content = Buffer.from("Sample PDF content: " + "B".repeat(Math.max(0, size - 100)));
  }
  
  const footer = Buffer.from("\n%%EOF");
  
  return Buffer.concat([header, content, footer]);
}

function generateMarkdownContent(targetSize) {
  let content = sampleMarkdownContent;
  
  // Repeat content to reach target size
  while (content.length < targetSize) {
    content += "\n\n" + sampleMarkdownContent;
  }
  
  return content.substring(0, targetSize);
}

// Utility functions for tests

export function createTestBuffer(format, size, variant = "normal") {
  switch (format) {
    case 'docx':
      return createMockDOCXBuffer(size, variant);
    case 'pdf':
      return createMockPDFBuffer(size, variant);
    case 'markdown':
      return Buffer.from(generateMarkdownContent(size));
    default:
      return Buffer.alloc(size, 'X'); // Generic buffer
  }
}

export function getExpectedResult(format) {
  switch (format) {
    case 'docx':
      return expectedDOCXResult;
    case 'pdf':
      return expectedPDFResult;
    case 'markdown':
      return expectedMarkdownResult;
    default:
      return null;
  }
}

export function generateTestMetadata(filename, format) {
  const mimeTypes = {
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pdf': 'application/pdf',
    'markdown': 'text/markdown',
    'txt': 'text/plain'
  };
  
  return {
    originalName: filename,
    mimeType: mimeTypes[format] || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
    size: 0 // Will be set by the test
  };
}

// Export validation helpers
export function validateProcessingResult(result, expected) {
  const errors = [];
  
  if (expected.wordCount && Math.abs(result.wordCount - expected.wordCount) > 10) {
    errors.push(`Word count mismatch: expected ~${expected.wordCount}, got ${result.wordCount}`);
  }
  
  if (expected.pageCount && result.pageCount !== expected.pageCount) {
    errors.push(`Page count mismatch: expected ${expected.pageCount}, got ${result.pageCount}`);
  }
  
  if (expected.text && !result.extractedText?.includes(expected.text.substring(0, 50))) {
    errors.push("Extracted text doesn't match expected content");
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export default {
  sampleDOCXBuffer,
  samplePDFBuffer,
  sampleMarkdownContent,
  expectedDOCXResult,
  expectedPDFResult,
  expectedMarkdownResult,
  documentVariants,
  testScenarios,
  performanceTestData,
  createTestBuffer,
  getExpectedResult,
  generateTestMetadata,
  validateProcessingResult
};