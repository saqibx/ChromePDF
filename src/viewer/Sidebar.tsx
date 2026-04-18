import React, { useState, useEffect } from 'react';
import { Annotation, HighlightAnnotation, DrawingAnnotation, HIGHLIGHT_COLORS, DRAWING_COLORS } from '../types';
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
  onAnnotationDelete,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');

  useEffect(() => {
    if (editingId) {
      const ann = annotations.find(a => a.id === editingId);
      if (ann && ann.type === 'highlight') setEditText(ann.noteText);
    }
  }, [editingId, annotations]);

  useEffect(() => {
    if (!editingId) return;
    const ann = annotations.find(a => a.id === editingId);
    if (!ann || ann.type !== 'highlight' || ann.noteText === editText) return;

    const timeout = window.setTimeout(() => {
      onAnnotationUpdate({ ...ann, noteText: editText });
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [editingId, editText, annotations, onAnnotationUpdate]);

  const handleSaveEdit = (ann: HighlightAnnotation) => {
    if (ann.noteText !== editText) {
      onAnnotationUpdate({ ...ann, noteText: editText });
    }
    setEditingId(null);
    setEditText('');
  };

  const handleToggleResolved = (ann: Annotation) => {
    onAnnotationUpdate({ ...ann, resolved: !ann.resolved });
  };

  const handleToggleChecklistItem = (ann: HighlightAnnotation, lineIndex: number) => {
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
    if (a.type === 'highlight' && b.type === 'highlight') {
      return (a.highlightRects[0]?.y ?? 0) - (b.highlightRects[0]?.y ?? 0);
    }
    return 0;
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
            <p className="hint">Select text in the PDF to create a highlight, or use the draw tool.</p>
          </div>
        )}

        {sortedAnnotations.map(ann => {
          if (ann.type === 'drawing') {
            return <DrawingCard key={ann.id} ann={ann} isActive={activeAnnotationId === ann.id} onSelect={onAnnotationSelect} onUpdate={onAnnotationUpdate} onDelete={onAnnotationDelete} onToggleResolved={handleToggleResolved} />;
          }

          const h = ann as HighlightAnnotation;
          return (
            <div
              key={h.id}
              className={`annotation-card ${activeAnnotationId === h.id ? 'active' : ''} ${h.resolved ? 'resolved' : ''}`}
              onClick={() => onAnnotationSelect(h)}
            >
              <div className="annotation-header">
                <span className="page-badge">Page {h.pageNumber}</span>
                <div className="color-picker">
                  {HIGHLIGHT_COLORS.map(c => (
                    <button
                      key={c.value}
                      className={`color-btn ${h.color === c.value ? 'selected' : ''}`}
                      style={{ backgroundColor: c.value }}
                      onClick={(e) => { e.stopPropagation(); onAnnotationUpdate({ ...h, color: c.value }); }}
                      title={c.name}
                    />
                  ))}
                </div>
              </div>

              <div className="highlight-quote" style={{ borderLeft: `3px solid ${h.color}` }}>
                {truncateText(h.selectedText, 150)}
              </div>

              {editingId === h.id ? (
                <div className="note-edit" onClick={e => e.stopPropagation()}>
                  <RichNoteEditor
                    value={editText}
                    onChange={setEditText}
                    onDone={() => handleSaveEdit(h)}
                    onCancel={() => setEditingId(null)}
                  />
                  <div className="edit-actions">
                    <button onClick={() => handleSaveEdit(h)}>Done</button>
                    <button onClick={() => setEditingId(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div
                  className="note-text"
                  onDoubleClick={(e) => { e.stopPropagation(); setEditingId(h.id); }}
                >
                  {h.noteText ? (
                    <NotePreview
                      text={h.noteText}
                      onToggleChecklistItem={(lineIndex) => handleToggleChecklistItem(h, lineIndex)}
                    />
                  ) : (
                    <span className="placeholder">Double-click to add note...</span>
                  )}
                </div>
              )}

              <div className="annotation-footer">
                <span className="timestamp">{formatDate(h.updatedAt)}</span>
                <div className="annotation-actions">
                  <button
                    className={`resolve-btn ${h.resolved ? 'is-resolved' : ''}`}
                    onClick={(e) => { e.stopPropagation(); handleToggleResolved(h); }}
                    title={h.resolved ? 'Mark unresolved' : 'Mark resolved'}
                  >
                    {h.resolved ? '↩' : '✓'}
                  </button>
                  <button
                    className="delete-btn"
                    onClick={(e) => { e.stopPropagation(); onAnnotationDelete(h.id); }}
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface DrawingCardProps {
  ann: DrawingAnnotation;
  isActive: boolean;
  onSelect: (ann: Annotation) => void;
  onUpdate: (ann: Annotation) => void;
  onDelete: (id: string) => void;
  onToggleResolved: (ann: Annotation) => void;
}

const DrawingCard: React.FC<DrawingCardProps> = ({ ann, isActive, onSelect, onUpdate, onDelete, onToggleResolved }) => (
  <div
    className={`annotation-card ${isActive ? 'active' : ''} ${ann.resolved ? 'resolved' : ''} drawing-card`}
    onClick={() => onSelect(ann)}
  >
    <div className="annotation-header">
      <span className="page-badge">Page {ann.pageNumber}</span>
      <div className="annotation-type-badge">✏️ Drawing</div>
      <div className="color-picker">
        {DRAWING_COLORS.map(c => (
          <button
            key={c.value}
            className={`color-btn ${ann.color === c.value ? 'selected' : ''}`}
            style={{ backgroundColor: c.value }}
            onClick={(e) => { e.stopPropagation(); onUpdate({ ...ann, color: c.value }); }}
            title={c.name}
          />
        ))}
      </div>
    </div>

    <div className="drawing-preview" style={{ borderLeft: `3px solid ${ann.color}` }}>
      <span className="drawing-path-count">{ann.paths.length} stroke{ann.paths.length !== 1 ? 's' : ''}</span>
    </div>

    <div className="annotation-footer">
      <span className="timestamp">{formatDate(ann.updatedAt)}</span>
      <div className="annotation-actions">
        <button
          className={`resolve-btn ${ann.resolved ? 'is-resolved' : ''}`}
          onClick={(e) => { e.stopPropagation(); onToggleResolved(ann); }}
          title={ann.resolved ? 'Mark unresolved' : 'Mark resolved'}
        >
          {ann.resolved ? '↩' : '✓'}
        </button>
        <button
          className="delete-btn"
          onClick={(e) => { e.stopPropagation(); onDelete(ann.id); }}
          title="Delete"
        >
          ×
        </button>
      </div>
    </div>
  </div>
);
