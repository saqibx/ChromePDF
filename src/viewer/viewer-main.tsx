import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { App } from './App';
import {
  getAllDocuments,
  getAllDocumentSessions,
  getAnnotationsForDocument,
  initDB,
  deleteDocument,
} from '../lib/db';
import { DocumentRecord, DocumentSessionState } from '../types';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

declare const chrome: any;

function getUrlParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name);
}

type PendingPdfSource = {
  buffer: ArrayBuffer;
  name?: string;
};

type SavedDocumentSummary = {
  document: DocumentRecord;
  session?: DocumentSessionState;
  annotationCount: number;
};

// ---------------------------------------------------------------------------
// DocumentThumbnail
// ---------------------------------------------------------------------------

function DocumentThumbnail({ doc }: { doc: DocumentRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!doc.file) return;
    let cancelled = false;

    (async () => {
      try {
        const pdf = await pdfjsLib.getDocument({ data: doc.file!.slice(0) }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1 });
        const targetWidth = 220;
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.round(scaled.width);
        canvas.height = Math.round(scaled.height);
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: scaled }).promise;
        if (!cancelled) setLoaded(true);
      } catch {
        // thumbnail stays hidden; placeholder shown instead
      }
    })();

    return () => { cancelled = true; };
  }, [doc.id]);

  return (
    <div className="doc-card-thumb">
      {!loaded && (
        <div className="doc-thumb-placeholder">
          <span style={{ fontSize: 36 }}>📄</span>
        </div>
      )}
      <canvas ref={canvasRef} style={{ display: loaded ? 'block' : 'none' }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

function HomePage({
  documents,
  onOpen,
  onFileSelect,
  onDelete,
}: {
  documents: SavedDocumentSummary[];
  onOpen: (id: string) => void;
  onFileSelect: (src: PendingPdfSource) => void;
  onDelete: (id: string) => void;
}) {
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) file.arrayBuffer().then((buffer) => onFileSelect({ buffer, name: file.name }));
    e.target.value = '';
  }, [onFileSelect]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      file.arrayBuffer().then((buffer) => onFileSelect({ buffer, name: file.name }));
    }
  }, [onFileSelect]);

  const hasDocs = documents.length > 0;

  return (
    <div className="home-page">
      {/* Header */}
      <header className="home-header">
        <div className="home-logo">
          <span className="home-logo-icon">📑</span>
          <span className="home-logo-text">ChromePDF</span>
        </div>
        {hasDocs && (
          <>
            <input
              type="file"
              accept=".pdf"
              className="file-input"
              ref={uploadInputRef}
              onChange={handleFileInput}
            />
            <button className="home-upload-btn" onClick={() => uploadInputRef.current?.click()}>
              + Upload New PDF
            </button>
          </>
        )}
      </header>

      {/* Content */}
      <div className="home-content">
        {hasDocs ? (
          <>
            <div className="home-section-header">
              <span className="home-section-title">Your Documents</span>
              <span className="home-section-count">{documents.length}</span>
            </div>
            <div className="doc-grid">
              {documents.map(({ document, session, annotationCount }) => (
                <div
                  key={document.id}
                  className="doc-card"
                  onClick={() => onOpen(document.id)}
                >
                  <DocumentThumbnail doc={document} />
                  <div className="doc-card-info">
                    <div className="doc-card-title" title={document.name}>{document.name}</div>
                    <div className="doc-card-meta">
                      <div className="doc-card-meta-row">
                        <span>{document.pageCount} page{document.pageCount !== 1 ? 's' : ''}</span>
                        <span className="doc-card-meta-sep">·</span>
                        <span>{annotationCount} note{annotationCount !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="doc-card-date">
                        {formatDate(session?.updatedAt ?? document.updatedAt)}
                      </div>
                    </div>
                  </div>
                  <button
                    className="doc-card-delete"
                    title="Delete"
                    onClick={(e) => { e.stopPropagation(); onDelete(document.id); }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="home-empty">
            <input
              type="file"
              accept=".pdf"
              className="file-input"
              ref={uploadInputRef}
              onChange={handleFileInput}
            />
            <div
              className={`home-empty-zone${dragging ? ' dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
            >
              <div className="home-empty-icon">📄</div>
              <h2>No documents yet</h2>
              <p>Drop a PDF here or click the button below to get started.</p>
              <button className="home-empty-btn" onClick={() => uploadInputRef.current?.click()}>
                Upload PDF
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Utility views
// ---------------------------------------------------------------------------

function ErrorView({ message }: { message: string }) {
  return (
    <div className="error-screen">
      <h2>Unable to Load PDF</h2>
      <p>{message}</p>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Loading PDF...</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Root() {
  const [pdfSource, setPdfSource] = useState<ArrayBuffer | string | null>(null);
  const [sourceName, setSourceName] = useState<string | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPdf() {
      await initDB();

      const storageData = await new Promise<any>((resolve) => {
        chrome.storage.local.get(['pendingPdfData'], (result: any) => resolve(result));
      });

      if (storageData?.pendingPdfData) {
        chrome.storage.local.remove(['pendingPdfData', 'pendingPdfName']);
        try {
          const binary = atob(storageData.pendingPdfData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setPdfSource(bytes.buffer);
          setSourceName(storageData.pendingPdfName || 'Local PDF');
        } catch {
          setError('Failed to decode PDF data');
        }
        setLoading(false);
        return;
      }

      const urlParam = getUrlParam('url');
      const modeParam = getUrlParam('mode');

      if (modeParam === 'local' || !urlParam) {
        if (!urlParam) {
          const docs = await loadSavedDocuments();
          setSavedDocuments(docs);
        }
        setLoading(false);
        return;
      }

      try {
        if (urlParam.startsWith('data:')) {
          const base64 = urlParam.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          setPdfSource(bytes.buffer);
        } else if (urlParam.startsWith('http') || urlParam.startsWith('blob:')) {
          const response = await fetch(urlParam);
          if (!response.ok) throw new Error('Failed to fetch PDF');
          setPdfSource(await response.arrayBuffer());
          setSourceUrl(urlParam);
          setSourceName(getNameFromUrl(urlParam));
        } else {
          // unrecognized param — fall back to home
        }
      } catch (err) {
        setError('Failed to load PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
      setLoading(false);
    }

    loadPdf();
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await deleteDocument(id);
    setSavedDocuments((prev) => prev.filter((s) => s.document.id !== id));
  }, []);

  const handleFileSelect = useCallback(({ buffer, name }: PendingPdfSource) => {
    setPdfSource(buffer);
    setSourceName(name);
  }, []);

  if (loading) return <LoadingView />;
  if (error) return <ErrorView message={error} />;
  if (documentId) return <App documentId={documentId} />;
  if (pdfSource) return <App pdfSource={pdfSource} sourceName={sourceName} sourceUrl={sourceUrl} />;

  return (
    <HomePage
      documents={savedDocuments}
      onOpen={setDocumentId}
      onFileSelect={handleFileSelect}
      onDelete={handleDelete}
    />
  );
}

const container = document.getElementById('root');
if (container) {
  createRoot(container).render(<Root />);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadSavedDocuments(): Promise<SavedDocumentSummary[]> {
  const [documents, sessions] = await Promise.all([getAllDocuments(), getAllDocumentSessions()]);
  const sessionMap = new Map(sessions.map((s) => [s.documentId, s]));

  const summaries = await Promise.all(
    documents.map(async (document) => {
      const annotations = await getAnnotationsForDocument(document.id);
      return { document, session: sessionMap.get(document.id), annotationCount: annotations.length };
    })
  );

  return summaries.sort((a, b) => {
    const aDate = a.session?.updatedAt ?? a.document.updatedAt;
    const bDate = b.session?.updatedAt ?? b.document.updatedAt;
    return new Date(bDate).getTime() - new Date(aDate).getTime();
  });
}

function getNameFromUrl(urlString: string): string {
  try {
    const parts = new URL(urlString).pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || 'Document');
  } catch {
    return 'Document';
  }
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
