// client/src/components/ExportButtons.js
// Export buttons for DOCX and PDF formats

import React, { useState } from 'react';
import { validateExportOptions } from '../lib/validations';
import './ExportButtons.css';

const ExportButtons = ({ onExport, isExporting, disabled }) => {
  const [showOptions, setShowOptions] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    fileName: 'resume',
    fontSize: 11,
    margin: 'normal',
    includeHeader: true
  });

  const handleExport = async (format) => {
    try {
      const validatedOptions = validateExportOptions({
        ...exportOptions,
        format
      });
      await onExport(format, validatedOptions);
    } catch (err) {
      console.error('Export validation error:', err);
    }
  };

  const handleOptionsChange = (key, value) => {
    setExportOptions(prev => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <div className="export-buttons">
      <div className="export-main-buttons">
        <button
          className="btn btn-export"
          onClick={() => handleExport('docx')}
          disabled={disabled || isExporting}
          title="Export as Microsoft Word document"
          aria-label="Export resume as DOCX"
        >
          {isExporting ? (
            <>
              <span className="spinner-small"></span>
              Exporting...
            </>
          ) : (
            <>
              📄 DOCX
            </>
          )}
        </button>

        <button
          className="btn btn-export"
          onClick={() => handleExport('pdf')}
          disabled={disabled || isExporting}
          title="Export as PDF document"
          aria-label="Export resume as PDF"
        >
          {isExporting ? (
            <>
              <span className="spinner-small"></span>
              Exporting...
            </>
          ) : (
            <>
              📋 PDF
            </>
          )}
        </button>

        <button
          className="btn btn-options"
          onClick={() => setShowOptions(!showOptions)}
          disabled={isExporting}
          title="Export options"
          aria-label="Show export options"
          aria-expanded={showOptions}
        >
          ⚙️
        </button>
      </div>

      {showOptions && (
        <div className="export-options">
          <h4>Export Options</h4>
          
          <div className="option-group">
            <label htmlFor="fileName">File Name:</label>
            <input
              id="fileName"
              type="text"
              value={exportOptions.fileName}
              onChange={(e) => handleOptionsChange('fileName', e.target.value)}
              placeholder="resume"
              maxLength={50}
            />
          </div>

          <div className="option-group">
            <label htmlFor="fontSize">Font Size:</label>
            <select
              id="fontSize"
              value={exportOptions.fontSize}
              onChange={(e) => handleOptionsChange('fontSize', parseInt(e.target.value))}
            >
              <option value={10}>10pt</option>
              <option value={11}>11pt</option>
              <option value={12}>12pt</option>
              <option value={14}>14pt</option>
            </select>
          </div>

          <div className="option-group">
            <label htmlFor="margin">Margins:</label>
            <select
              id="margin"
              value={exportOptions.margin}
              onChange={(e) => handleOptionsChange('margin', e.target.value)}
            >
              <option value="narrow">Narrow (0.5")</option>
              <option value="normal">Normal (1")</option>
              <option value="wide">Wide (1.5")</option>
            </select>
          </div>

          <div className="option-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={exportOptions.includeHeader}
                onChange={(e) => handleOptionsChange('includeHeader', e.target.checked)}
              />
              Include header with contact info
            </label>
          </div>

          <div className="export-tips">
            <p><strong>💡 Export Tips:</strong></p>
            <ul>
              <li>DOCX files open in Microsoft Word for further editing</li>
              <li>PDF files are ideal for email attachments and online applications</li>
              <li>Use 11pt font size for optimal ATS scanning</li>
              <li>Normal margins provide the best balance of content and readability</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExportButtons;