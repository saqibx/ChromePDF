import React, { useState, useEffect } from 'react';
import { Annotation, HIGHLIGHT_COLORS } from '../types';
import { formatDate, truncateText } from '../lib/utils';
import { RichNoteEditor } from './RichNoteEditor';
import { NotePreview } from './noteFormatting';

interface SidebarProps {
  annotations: Annotation[];
  activeAnnotationId: string | null;
  onAnnotationSelect: (ann: Annotation) => void;
  onAnnotationUpdate: (ann: Annotation) => void;
  onAnnotationDelete: (id: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  annotations,
  activeAnnotationId,
  onAnnotationSelect,
  onAnnotationUpdate,
  onAnnotationDelete
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (editingId) {
      const ann = annotations.find(a => a.id === editingId);
      if (ann) setEditText(ann.noteText);
    }
  }, [editingId, annotations]);

  useEffect(() => {
    if (!editingId) return;

    const ann = annotations.find(a => a.id === editingId);
    if (!ann || ann.noteText === editText) return;

    const timeout = window.setTimeout(() => {
      onAnnotationUpdate({ ...ann, noteText: editText });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [editingId, editText, annotations, onAnnotationUpdate]);

  const handleSaveEdit = (ann: Annotation) => {
    if (ann.noteText !== editText) {
      onAnnotationUpdate({ ...ann, noteText: editText });
    }
    setEditingId(null);
    setEditText('');
  };

  const handleColorChange = (ann: Annotation, color: string) => {
    onAnnotationUpdate({ ...ann, color });
  };

  const handleToggleResolved = (ann: Annotation) => {
    onAnnotationUpdate({ ...ann, resolved: !ann.resolved });
  };

  const handleToggleChecklistItem = (ann: Annotation, lineIndex: number) => {
    const lines = ann.noteText.replace(/\r\n/g, '\n').split('\n');
    const line = lines[lineIndex];
    if (!line) return;

    const checkedMatch = line.match(/^(\s*[-*]\s+\[)([ xX])(\]\s+.*)$/);
    if (checkedMatch) {
      const nextMarker = checkedMatch[2].toLowerCase() === 'x' ? ' ' : 'x';
      lines[lineIndex] = `${checkedMatch[1]}${nextMarker}${checkedMatch[3]}`;
      onAnnotationUpdate({ ...ann, noteText: lines.join('\n') });
      return;
    }

    if (/^\s*[-*]\s+/.test(line)) {
      lines[lineIndex] = line.replace(/^(\s*[-*]\s+)/, '$1[ ] ');
      onAnnotationUpdate({ ...ann, noteText: lines.join('\n') });
    }
  };

  const sortedAnnotations = [...annotations].sort((a, b) => {
    if (a.pageNumber !== b.pageNumber) return a.pageNumber - b.pageNumber;
    return a.highlightRects[0]?.y - b.highlightRects[0]?.y || 0;
  });

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h2>Notes</h2>
        <span className="annotation-count">{annotations.length}</span>
      </div>

      <div className="annotation-list">
        {sortedAnnotations.length === 0 && (
          <div className="empty-state">
            <p>No annotations yet.</p>
            <p className="hint">Select text in the PDF to create a highlight.</p>
          </div>
        )}

        {sortedAnnotations.map(ann => (
          <div
            key={ann.id}
            className={`annotation-card ${activeAnnotationId === ann.id ? 'active' : ''} ${ann.resolved ? 'resolved' : ''}`}
            onClick={() => onAnnotationSelect(ann)}
          >
            <div className="annotation-header">
              <span className="page-badge">Page {ann.pageNumber}</span>
              <div className="color-picker">
                {HIGHLIGHT_COLORS.map(c => (
                  <button
                    key={c.value}
                    className={`color-btn ${ann.color === c.value ? 'selected' : ''}`}
                    style={{ backgroundColor: c.value }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleColorChange(ann, c.value);
                    }}
                    title={c.name}
                  />
                ))}
              </div>
            </div>

            <div
              className="highlight-quote"
              style={{ borderLeft: `3px solid ${ann.color}` }}
            >
              {truncateText(ann.selectedText, 150)}
            </div>

            {editingId === ann.id ? (
              <div className="note-edit" onClick={e => e.stopPropagation()}>
                <RichNoteEditor
                  value={editText}
                  onChange={setEditText}
                  onDone={() => handleSaveEdit(ann)}
                  onCancel={() => setEditingId(null)}
                />
                <div className="edit-actions">
                  <button onClick={() => handleSaveEdit(ann)}>Done</button>
                  <button onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div
                className="note-text"
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingId(ann.id);
                }}
              >
                {ann.noteText ? (
                  <NotePreview
                    text={ann.noteText}
                    onToggleChecklistItem={(lineIndex) => handleToggleChecklistItem(ann, lineIndex)}
                  />
                ) : (
                  <span className="placeholder">Double-click to add note...</span>
                )}
              </div>
            )}

            <div className="annotation-footer">
              <span className="timestamp">{formatDate(ann.updatedAt)}</span>
              <div className="annotation-actions">
                <button
                  className={`resolve-btn ${ann.resolved ? 'is-resolved' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleResolved(ann);
                  }}
                  title={ann.resolved ? 'Mark unresolved' : 'Mark resolved'}
                >
                  {ann.resolved ? '↩' : '✓'}
                </button>
                <button
                  className="delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnnotationDelete(ann.id);
                  }}
                  title="Delete"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
