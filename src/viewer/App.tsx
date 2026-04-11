import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFPage } from './PDFPage';
import { Sidebar } from './Sidebar';
import { DocumentRecord, Annotation, NormalizedRect, HIGHLIGHT_COLORS } from '../types';
import { initDB, saveDocument, getDocument, getAnnotationsForDocument, saveAnnotation, deleteAnnotation, updateAnnotationNote } from '../lib/db';
import { generateId, hashArrayBuffer, debounce } from '../lib/utils';
import { exportToPDF } from '../lib/export';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface AppProps {
  pdfSource?: ArrayBuffer | string;
  documentId?: string;
}

export const App: React.FC<AppProps> = ({ pdfSource, documentId: initialDocId }) => {
  const [pdf, setPdf] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | null>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeAnnotationId, setActiveAnnotationId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.5);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    pageNumber: number;
    selectedText: string;
    rects: NormalizedRect[];
  } | null>(null);
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].value);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    const init = async () => {
      try {
        await initDB();

        if (initialDocId) {
          const doc = await getDocument(initialDocId);
          if (doc?.file) {
            const loadingTask = pdfjsLib.getDocument({ data: doc.file });
            const pdfDoc = await loadingTask.promise;
            setPdf(pdfDoc);
            setDocumentRecord(doc);

            const anns = await getAnnotationsForDocument(initialDocId);
            setAnnotations(anns);
          }
        } else if (pdfSource) {
          let data: ArrayBuffer;

          if (typeof pdfSource === 'string') {
            const response = await fetch(pdfSource);
            data = await response.arrayBuffer();
          } else {
            data = pdfSource;
          }

          const hash = await hashArrayBuffer(data);
          const existingDoc = await getDocument(hash);

          if (existingDoc) {
            const loadingTask = pdfjsLib.getDocument({ data: existingDoc.file! });
            const pdfDoc = await loadingTask.promise;
            setPdf(pdfDoc);
            setDocumentRecord(existingDoc);

            const anns = await getAnnotationsForDocument(hash);
            setAnnotations(anns);
          } else {
            const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
            const pdfDoc = await loadingTask.promise;

            const docRecord: DocumentRecord = {
              id: hash,
              name: 'Document',
              file: data,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              pageCount: pdfDoc.numPages
            };

            await saveDocument(docRecord);
            setPdf(pdfDoc);
            setDocumentRecord(docRecord);
            setAnnotations([]);
          }
        }
      } catch (err) {
        console.error('Failed to load PDF:', err);
        setError('Failed to load PDF. Please try again.');
      } finally {
        setLoading(false);
      }
    };

    init();
  }, [pdfSource, initialDocId]);

  const debouncedSaveAnnotation = useCallback(
    debounce((ann: Annotation) => {
      saveAnnotation(ann).catch(console.error);
    }, 500),
    []
  );

  const handleTextSelection = useCallback((
    pageNumber: number,
    selectedText: string,
    rects: NormalizedRect[]
  ) => {
    if (!documentRecord) return;

    setPendingSelection({ pageNumber, selectedText, rects });
  }, [documentRecord]);

  const handleCreateAnnotation = useCallback(async () => {
    if (!pendingSelection || !documentRecord) return;

    const { pageNumber, selectedText, rects } = pendingSelection;

    const newAnnotation: Annotation = {
      id: generateId(),
      documentId: documentRecord.id,
      pageNumber,
      selectedText,
      noteText: '',
      highlightRects: rects,
      color: selectedColor,
      resolved: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setAnnotations(prev => [...prev, newAnnotation]);
    await saveAnnotation(newAnnotation);
    setActiveAnnotationId(newAnnotation.id);
    setPendingSelection(null);
  }, [pendingSelection, documentRecord, selectedColor]);

  const handleCancelSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  const handleAnnotationSelect = useCallback((ann: Annotation) => {
    setActiveAnnotationId(ann.id);
    setCurrentPage(ann.pageNumber);
  }, []);

  const handleAnnotationUpdate = useCallback(async (updated: Annotation) => {
    updated.updatedAt = new Date().toISOString();
    setAnnotations(prev => prev.map(a => a.id === updated.id ? updated : a));
    await saveAnnotation(updated);
  }, []);

  const handleAnnotationDelete = useCallback(async (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (activeAnnotationId === id) setActiveAnnotationId(null);
    await deleteAnnotation(id);
  }, [activeAnnotationId]);

  const handleExport = useCallback(async () => {
    if (!pdf || !documentRecord) return;
    try {
      await exportToPDF(pdf, annotations, scale);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  }, [pdf, annotations, scale, documentRecord]);

  useEffect(() => {
    const pageEl = pageRefs.current.get(currentPage);
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading PDF...</p>
      </div>
    );
  }

  if (error || !pdf) {
    return (
      <div className="error-screen">
        <p>{error || 'No PDF loaded'}</p>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="toolbar">
        <div className="toolbar-left">
          <h1 className="doc-title">{documentRecord?.name || 'PDF Viewer'}</h1>
          <span className="page-info">Page {currentPage} of {pdf.numPages}</span>
        </div>
        <div className="toolbar-center">
          <button
            className="nav-btn"
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
          >
            ‹ Prev
          </button>
          <div className="page-input">
            <input
              type="number"
              value={currentPage}
              onChange={e => {
                const p = parseInt(e.target.value);
                if (p >= 1 && p <= pdf.numPages) setCurrentPage(p);
              }}
              min={1}
              max={pdf.numPages}
            />
          </div>
          <button
            className="nav-btn"
            onClick={() => setCurrentPage(p => Math.min(pdf.numPages, p + 1))}
            disabled={currentPage >= pdf.numPages}
          >
            Next ›
          </button>
          <span className="scale-control">
            <label>Scale:</label>
            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={scale}
              onChange={e => setScale(parseFloat(e.target.value))}
            />
            <span>{Math.round(scale * 100)}%</span>
          </span>
        </div>
        <div className="toolbar-right">
          <div className="color-picker-toolbar">
            {HIGHLIGHT_COLORS.map(c => (
              <button
                key={c.value}
                className={`color-btn ${selectedColor === c.value ? 'selected' : ''}`}
                style={{ backgroundColor: c.value }}
                onClick={() => setSelectedColor(c.value)}
                title={c.name}
              />
            ))}
          </div>
          <button className="export-btn" onClick={handleExport}>
            Export PDF
          </button>
        </div>
      </header>

      {pendingSelection && (
        <div className="selection-popup">
          <div className="selection-preview">
            <p>"{truncateText(pendingSelection.selectedText, 80)}"</p>
            <div className="color-select">
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.value}
                  className={`color-btn ${selectedColor === c.value ? 'selected' : ''}`}
                  style={{ backgroundColor: c.value }}
                  onClick={() => setSelectedColor(c.value)}
                />
              ))}
            </div>
          </div>
          <div className="selection-actions">
            <button onClick={handleCreateAnnotation}>Add Note</button>
            <button onClick={handleCancelSelection}>Cancel</button>
          </div>
        </div>
      )}

      <div className="main-content">
        <div className="pdf-viewer">
          <div className="pdf-pages">
            {Array.from({ length: pdf.numPages }, (_, i) => i + 1).map(pageNum => (
              <div
                key={pageNum}
                ref={el => {
                  if (el) pageRefs.current.set(pageNum, el);
                }}
                id={`page-${pageNum}`}
              >
                <PDFPage
                  pdf={pdf}
                  pageNumber={pageNum}
                  scale={scale}
                  annotations={annotations}
                  onTextSelection={handleTextSelection}
                  onAnnotationClick={handleAnnotationSelect}
                  activeAnnotationId={activeAnnotationId}
                />
              </div>
            ))}
          </div>
        </div>

        <Sidebar
          annotations={annotations}
          activeAnnotationId={activeAnnotationId}
          onAnnotationSelect={handleAnnotationSelect}
          onAnnotationUpdate={handleAnnotationUpdate}
          onAnnotationDelete={handleAnnotationDelete}
        />
      </div>
    </div>
  );
};

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}
