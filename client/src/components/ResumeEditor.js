// client/src/components/ResumeEditor.js
// Tiptap editor for resume editing with export functionality

import React, { useState, useCallback, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { calculateMatchScore } from '../lib/keywordExtraction';
import { htmlToText } from '../lib/htmlSanitizer';
import { validateATSCompatibility } from '../lib/htmlSanitizer';
import KeywordMatchMeter from './KeywordMatchMeter';
import ExportButtons from './ExportButtons';
import './ResumeEditor.css';

const ResumeEditor = ({ 
  content, 
  jobKeywords, 
  jobDescription,
  onBack, 
  onRegenerate 
}) => {
  const [matchScore, setMatchScore] = useState(0);
  const [atsIssues, setATSIssues] = useState([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  // Initialize Tiptap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: 'Make any edits here…',
        emptyEditorClass: 'is-editor-empty',
      }),
    ],
    content: content,
    editorProps: {
      attributes: {
        class: 'resume-editor-content',
        'aria-label': 'Resume content editor',
      },
    },
    onUpdate: ({ editor }) => {
      updateAnalysis(editor.getHTML());
    },
  });

  // Update match score and ATS compatibility when content changes
  const updateAnalysis = useCallback((html) => {
    if (!jobKeywords) return;

    const textContent = htmlToText(html);
    const score = calculateMatchScore(jobKeywords, textContent);
    setMatchScore(score);

    const compatibility = validateATSCompatibility(html);
    setATSIssues(compatibility.issues);
  }, [jobKeywords]);

  // Initialize analysis when component mounts
  useEffect(() => {
    if (content && jobKeywords) {
      updateAnalysis(content);
    }
  }, [content, jobKeywords, updateAnalysis]);

  // Editor commands
  const handleUndo = useCallback(() => {
    editor?.chain().focus().undo().run();
  }, [editor]);

  const handleRedo = useCallback(() => {
    editor?.chain().focus().redo().run();
  }, [editor]);

  const handleCopyToClipboard = useCallback(async () => {
    if (!editor) return;

    try {
      const html = editor.getHTML();
      const text = htmlToText(html);
      
      // Copy both HTML and plain text
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' })
        })
      ]);
      
      // Show success feedback
      const button = document.querySelector('.copy-button');
      if (button) {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(() => {
          button.textContent = originalText;
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      // Fallback: copy as plain text
      try {
        await navigator.clipboard.writeText(htmlToText(editor.getHTML()));
      } catch (fallbackErr) {
        setExportError('Failed to copy to clipboard');
      }
    }
  }, [editor]);

  const handleExport = useCallback(async (format, options = {}) => {
    if (!editor) return;

    setIsExporting(true);
    setExportError('');

    try {
      const html = editor.getHTML();
      const response = await fetch('/api/user/export/resume', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: html,
          format,
          options,
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Handle file download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `resume.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setExportError(`Failed to export as ${format.toUpperCase()}`);
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  }, [editor]);

  if (!editor) {
    return (
      <div className="editor-loading">
        <div className="spinner"></div>
        <p>Loading editor...</p>
      </div>
    );
  }

  return (
    <div className="resume-editor">
      {/* Header with controls */}
      <header className="editor-header">
        <div className="editor-header-left">
          <button
            className="btn btn-secondary"
            onClick={onBack}
            aria-label="Go back to job description"
          >
            ← Back
          </button>
          
          <h1 className="editor-title">Resume Editor</h1>
        </div>

        <div className="editor-header-right">
          <KeywordMatchMeter score={matchScore} />
        </div>
      </header>

      {/* Toolbar */}
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <button
            className="toolbar-button"
            onClick={handleUndo}
            disabled={!editor.can().undo()}
            title="Undo (Ctrl+Z)"
            aria-label="Undo"
          >
            ↶
          </button>
          
          <button
            className="toolbar-button"
            onClick={handleRedo}
            disabled={!editor.can().redo()}
            title="Redo (Ctrl+Y)"
            aria-label="Redo"
          >
            ↷
          </button>
        </div>

        <div className="toolbar-group">
          <button
            className="toolbar-button copy-button"
            onClick={handleCopyToClipboard}
            title="Copy to clipboard"
            aria-label="Copy resume to clipboard"
          >
            📋 Copy
          </button>
          
          <button
            className="toolbar-button"
            onClick={onRegenerate}
            title="Regenerate resume"
            aria-label="Regenerate resume from job description"
          >
            🔄 Regenerate
          </button>
        </div>

        <div className="toolbar-group">
          <ExportButtons 
            onExport={handleExport}
            isExporting={isExporting}
            disabled={!editor.getHTML().trim()}
          />
        </div>
      </div>

      {/* ATS Issues Warning */}
      {atsIssues.length > 0 && (
        <div className="ats-warning" role="alert">
          <h3>⚠️ ATS Compatibility Issues:</h3>
          <ul>
            {atsIssues.map((issue, index) => (
              <li key={index}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Export Error */}
      {exportError && (
        <div className="export-error" role="alert">
          {exportError}
        </div>
      )}

      {/* Editor */}
      <div className="editor-container">
        <EditorContent 
          editor={editor} 
          className="tiptap-editor"
        />
      </div>

      {/* Footer with tips */}
      <footer className="editor-footer">
        <div className="editor-tips">
          <h4>📝 Editing Tips:</h4>
          <ul>
            <li><strong>Keep it ATS-friendly:</strong> Use standard headings (h1, h2) and simple formatting</li>
            <li><strong>Match keywords:</strong> Include relevant terms from the job description</li>
            <li><strong>Use bullet points:</strong> Make achievements scannable with clear bullet points</li>
            <li><strong>Quantify results:</strong> Add numbers and percentages where possible</li>
          </ul>
        </div>
      </footer>
    </div>
  );
};

export default ResumeEditor;