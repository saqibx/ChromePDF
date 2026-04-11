import React, { useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

// Chrome extension types
declare const chrome: any;

function getUrlParam(name: string): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

function UploadView({ onFileSelect }: { onFileSelect: (buffer: ArrayBuffer) => void }) {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.type === 'application/pdf') {
      console.log("ChromePDF: File dropped:", file.name);
      file.arrayBuffer().then(onFileSelect);
    } else {
      console.log("ChromePDF: Dropped file is not PDF:", file?.type);
    }
  }, [onFileSelect]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    console.log("ChromePDF: File selected:", file?.name, file?.type);
    if (file) {
      file.arrayBuffer().then(onFileSelect);
    }
  }, [onFileSelect]);

  return (
    <div className="drop-zone-container" style={{ padding: '40px', textAlign: 'center' }}>
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadPdf() {
      console.log("ChromePDF: Loading PDF, URL:", window.location.href);

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
        setLoading(false);
        return;
      }

      if (!urlParam) {
        console.log("ChromePDF: No URL param - showing upload dialog");
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
        } else {
          // Invalid URL, show upload
          console.log("ChromePDF: Invalid URL - showing upload");
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
  if (!pdfSource) {
    return <UploadView onFileSelect={(buffer) => setPdfSource(buffer)} />;
  }

  return <App pdfSource={pdfSource} />;
}

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<Root />);
}
