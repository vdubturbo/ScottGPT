// routes/resume-export.js
// API endpoints for resume export functionality

import express from 'express';
import { z } from 'zod';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import puppeteer from 'puppeteer';
import { JSDOM } from 'jsdom';

const router = express.Router();

// Export request validation schema
const exportSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  format: z.enum(['docx', 'pdf']),
  options: z.object({
    fileName: z.string().optional(),
    fontSize: z.number().min(8).max(20).default(11),
    margin: z.enum(['narrow', 'normal', 'wide']).default('normal'),
    includeHeader: z.boolean().default(true)
  }).optional()
});

/**
 * POST /api/user/export/resume
 * Export resume as DOCX or PDF
 */
router.post('/resume', async (req, res) => {
  try {
    // Validate request
    const { content, format, options = {} } = exportSchema.parse(req.body);
    
    console.log(`Exporting resume as ${format.toUpperCase()}`);

    if (format === 'docx') {
      const docxBuffer = await generateDOCX(content, options);
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${options.fileName || 'resume'}.docx"`);
      res.send(docxBuffer);
      
    } else if (format === 'pdf') {
      const pdfBuffer = await generatePDF(content, options);
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${options.fileName || 'resume'}.pdf"`);
      res.send(pdfBuffer);
    }

  } catch (error) {
    console.error('Resume export error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid export request',
        details: error.errors
      });
    }

    res.status(500).json({
      error: 'Export failed',
      message: 'An error occurred while generating the document'
    });
  }
});

// Generate DOCX document
async function generateDOCX(htmlContent, options = {}) {
  const { fontSize = 11, margin = 'normal', includeHeader = true } = options;
  
  // Parse HTML content
  const dom = new JSDOM(htmlContent);
  const document = dom.window.document;
  
  // Convert margin setting to points
  const marginMap = {
    narrow: 360, // 0.5 inch = 360 twentieths of a point
    normal: 720, // 1 inch = 720 twentieths of a point
    wide: 1080   // 1.5 inch = 1080 twentieths of a point
  };

  const children = [];

  // Process each element in the HTML
  const processElement = (element) => {
    const tagName = element.tagName?.toLowerCase();
    const textContent = element.textContent?.trim();
    
    if (!textContent) return null;

    switch (tagName) {
      case 'h1':
        return new Paragraph({
          children: [new TextRun({ text: textContent, bold: true, size: (fontSize + 4) * 2 })],
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        });
      
      case 'h2':
        return new Paragraph({
          children: [new TextRun({ text: textContent, bold: true, size: (fontSize + 2) * 2 })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 }
        });
      
      case 'h3':
        return new Paragraph({
          children: [new TextRun({ text: textContent, bold: true, size: fontSize * 2 })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 100, after: 100 }
        });
      
      case 'p':
        const runs = [];
        if (element.querySelector('strong')) {
          // Handle mixed content with bold text
          Array.from(element.childNodes).forEach(node => {
            if (node.nodeType === 3) { // Text node
              runs.push(new TextRun({ text: node.textContent, size: fontSize * 2 }));
            } else if (node.tagName?.toLowerCase() === 'strong') {
              runs.push(new TextRun({ text: node.textContent, bold: true, size: fontSize * 2 }));
            }
          });
        } else {
          runs.push(new TextRun({ text: textContent, size: fontSize * 2 }));
        }
        
        return new Paragraph({
          children: runs,
          spacing: { after: 100 }
        });
      
      case 'li':
        return new Paragraph({
          children: [new TextRun({ text: `• ${textContent}`, size: fontSize * 2 })],
          spacing: { after: 50 },
          indent: { left: 360 } // Indent bullet points
        });
      
      default:
        if (textContent) {
          return new Paragraph({
            children: [new TextRun({ text: textContent, size: fontSize * 2 })],
            spacing: { after: 100 }
          });
        }
        return null;
    }
  };

  // Process all elements
  Array.from(document.body.children).forEach(element => {
    if (element.tagName?.toLowerCase() === 'ul' || element.tagName?.toLowerCase() === 'ol') {
      // Process list items
      Array.from(element.children).forEach(li => {
        const paragraph = processElement(li);
        if (paragraph) children.push(paragraph);
      });
    } else {
      const paragraph = processElement(element);
      if (paragraph) children.push(paragraph);
    }
  });

  // Create DOCX document
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: {
            top: marginMap[margin],
            right: marginMap[margin],
            bottom: marginMap[margin],
            left: marginMap[margin]
          }
        }
      },
      children
    }]
  });

  return await Packer.toBuffer(doc);
}

// Generate PDF document
async function generatePDF(htmlContent, options = {}) {
  const { fontSize = 11, margin = 'normal', includeHeader = true } = options;
  
  // Convert margin setting to CSS
  const marginMap = {
    narrow: '0.5in',
    normal: '1in',
    wide: '1.5in'
  };

  // Create styled HTML for PDF generation
  const styledHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        @page {
          margin: ${marginMap[margin]};
          size: A4;
        }
        
        body {
          font-family: 'Times New Roman', serif;
          font-size: ${fontSize}pt;
          line-height: 1.4;
          color: #000;
          margin: 0;
          padding: 0;
        }
        
        h1 {
          font-size: ${fontSize + 4}pt;
          font-weight: bold;
          margin: 0 0 12pt 0;
          text-align: center;
        }
        
        h2 {
          font-size: ${fontSize + 2}pt;
          font-weight: bold;
          margin: 16pt 0 8pt 0;
          border-bottom: 1px solid #000;
          padding-bottom: 2pt;
        }
        
        h3 {
          font-size: ${fontSize}pt;
          font-weight: bold;
          margin: 12pt 0 6pt 0;
        }
        
        p {
          margin: 0 0 8pt 0;
        }
        
        ul, ol {
          margin: 0 0 8pt 0;
          padding-left: 20pt;
        }
        
        li {
          margin: 0 0 4pt 0;
        }
        
        strong {
          font-weight: bold;
        }
        
        em {
          font-style: italic;
        }
        
        header p {
          text-align: center;
          margin: 4pt 0;
        }
      </style>
    </head>
    <body>
      ${htmlContent}
    </body>
    </html>
  `;

  // Launch Puppeteer and generate PDF
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const page = await browser.newPage();
    await page.setContent(styledHTML, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: false,
      margin: {
        top: marginMap[margin],
        right: marginMap[margin],
        bottom: marginMap[margin],
        left: marginMap[margin]
      }
    });
    
    return pdfBuffer;
  } finally {
    await browser.close();
  }
}

export default router;