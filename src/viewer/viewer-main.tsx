import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { getAllDocuments, getAllDocumentSessions, getAnnotationsForDocument, initDB } from '../lib/db';
import { DocumentRecord, DocumentSessionState } from '../types';

// Chrome extension types
declare const chrome: any;

function getUrlParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
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

function UploadView({ onFileSelect, onBack }: { onFileSelect: (source: PendingPdfSource) => void; onBack?: () => void }) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      console.log("ChromePDF: File dropped:", file.name);
      file.arrayBuffer().then((buffer) => onFileSelect({ buffer, name: file.name }));
    } else {
      console.log("ChromePDF: Dropped file is not PDF:", file?.type);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("ChromePDF: File selected:", file?.name, file?.type);
    if (file) {
      file.arrayBuffer().then((buffer) => onFileSelect({ buffer, name: file.name }));
    }
  }, [onFileSelect]);

  return (
    <div className="drop-zone-container">
      <div
        className={`drop-zone ${dragging ? 'dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div className="drop-zone-icon">📄</div>
        <h2>Drop a PDF here</h2>
        <p>or click the button to select a file</p>
        <input
          type="file"
          accept=".pdf"
          className="file-input"
          ref={fileInputRef}
          onChange={handleFileInput}
        />
        <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>Select PDF</button>
        {onBack && (
          <button className="nav-btn" onClick={onBack}>Back to Library</button>
        )}
      </div>
    </div>
  );
}

function LibraryView({
  documents,
  onOpen,
  onUploadNew,
}: {
  documents: SavedDocumentSummary[];
  onOpen: (documentId: string) => void;
  onUploadNew: () => void;
}) {
  return (
    <div className="drop-zone-container">
      <div className="drop-zone">
        <div className="drop-zone-icon">📚</div>
        <h2>Your Local Work</h2>
        <p>Open a saved workspace or start a new PDF.</p>
        <div style={{ width: '100%', maxWidth: 720, marginTop: 16 }}>
          {documents.map(({ document, session, annotationCount }) => (
            <button
              key={document.id}
              className="nav-btn"
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 16px',
                marginBottom: 10,
                textAlign: 'left',
              }}
              onClick={() => onOpen(document.id)}
            >
              <span>
                <strong>{document.name}</strong>
                <br />
                {annotationCount} notes • {document.pageCount} pages
              </span>
              <span>
                {formatLibraryDate(session?.updatedAt ?? document.updatedAt)}
              </span>
            </button>
          ))}
        </div>
        <button className="upload-btn" onClick={onUploadNew}>Open New PDF</button>
      </div>
    </div>
  );
}

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

function Root() {
  const [pdfSource, setPdfSource] = useState<ArrayBuffer | string | null>(null);
  const [sourceName, setSourceName] = useState<string | undefined>(undefined);
  const [sourceUrl, setSourceUrl] = useState<string | undefined>(undefined);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [savedDocuments, setSavedDocuments] = useState<SavedDocumentSummary[]>([]);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPdf() {
      console.log("ChromePDF: Loading PDF, URL:", window.location.href);
      await initDB();

      // Check for pending PDF data from chrome.storage (for file:// URLs)
      const storageData = await new Promise<any>((resolve) => {
        chrome.storage.local.get(['pendingPdfData'], (result: any) => {
          resolve(result);
        });
      });

      if (storageData?.pendingPdfData) {
        console.log("ChromePDF: Found pending PDF data in storage");
        chrome.storage.local.remove(['pendingPdfData']);

        try {
          const binary = atob(storageData.pendingPdfData);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          setPdfSource(bytes.buffer);
          setSourceName('Local PDF');
          setLoading(false);
          return;
        } catch (err) {
          console.error("ChromePDF: Failed to decode PDF data:", err);
          setError('Failed to decode PDF data');
          setLoading(false);
          return;
        }
      }

      // Check URL params
      const urlParam = getUrlParam('url');
      const modeParam = getUrlParam('mode');

      console.log("ChromePDF: URL param:", urlParam, "Mode param:", modeParam);

      // If mode=local, show upload dialog (for file:// URLs that we couldn't fetch)
      if (modeParam === 'local') {
        console.log("ChromePDF: Local mode - showing upload dialog");
        setShowUpload(true);
        setLoading(false);
        return;
      }

      if (!urlParam) {
        console.log("ChromePDF: No URL param - checking saved documents");
        const documents = await loadSavedDocuments();
        setSavedDocuments(documents);
        setShowUpload(documents.length === 0);
        setLoading(false);
        return;
      }

      try {
        if (urlParam.startsWith('data:')) {
          console.log("ChromePDF: Loading data URL");
          const base64 = urlParam.split(',')[1];
          const binary = atob(base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          setPdfSource(bytes.buffer);
        } else if (urlParam.startsWith('http') || urlParam.startsWith('blob:')) {
          console.log("ChromePDF: Fetching web URL");
          const response = await fetch(urlParam);
          if (!response.ok) throw new Error('Failed to fetch PDF');
          const buffer = await response.arrayBuffer();
          setPdfSource(buffer);
          setSourceUrl(urlParam);
          setSourceName(getNameFromUrl(urlParam));
        } else {
          // Invalid URL, show upload
          console.log("ChromePDF: Invalid URL - showing upload");
          setShowUpload(true);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error("ChromePDF: Error loading PDF:", err);
        setError('Failed to load PDF: ' + (err instanceof Error ? err.message : 'Unknown error'));
      } finally {
        setLoading(false);
      }
    }

    loadPdf();
  }, []);

  if (loading) return <LoadingView />;
  if (error) return <ErrorView message={error} />;
  if (documentId) {
    return <App documentId={documentId} />;
  }
  if (!pdfSource) {
    if (!showUpload && savedDocuments.length > 0) {
      return (
        <LibraryView
          documents={savedDocuments}
          onOpen={setDocumentId}
          onUploadNew={() => setShowUpload(true)}
        />
      );
    }

    return (
      <UploadView
        onFileSelect={({ buffer, name }) => {
          setPdfSource(buffer);
          setSourceName(name);
        }}
        onBack={!showUpload || savedDocuments.length === 0 ? undefined : () => setShowUpload(false)}
      />
    );
  }

  return <App pdfSource={pdfSource} sourceName={sourceName} sourceUrl={sourceUrl} />;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Root />);
}

async function loadSavedDocuments(): Promise<SavedDocumentSummary[]> {
  const [documents, sessions] = await Promise.all([
    getAllDocuments(),
    getAllDocumentSessions(),
  ]);

  const sessionMap = new Map(sessions.map((session) => [session.documentId, session]));

  const documentSummaries = await Promise.all(
    documents.map(async (document) => {
      const annotations = await getAnnotationsForDocument(document.id);
      return {
        document,
        session: sessionMap.get(document.id),
        annotationCount: annotations.length,
      };
    })
  );

  return documentSummaries.sort((a, b) => {
    const aUpdatedAt = a.session?.updatedAt ?? a.document.updatedAt;
    const bUpdatedAt = b.session?.updatedAt ?? b.document.updatedAt;
    return new Date(bUpdatedAt).getTime() - new Date(aUpdatedAt).getTime();
  });
}

function getNameFromUrl(urlString: string): string {
  try {
    const url = new URL(urlString);
    const parts = url.pathname.split('/');
    return decodeURIComponent(parts[parts.length - 1] || 'Document');
  } catch {
    return 'Document';
  }
}

function formatLibraryDate(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
