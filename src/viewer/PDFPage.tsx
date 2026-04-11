import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { Annotation, NormalizedRect } from '../types';

interface PDFPageProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  annotations: Annotation[];
  onTextSelection: (pageNumber: number, selectedText: string, rects: NormalizedRect[]) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  activeAnnotationId: string | null;
  onRenderComplete?: () => void;
}

export const PDFPage: React.FC<PDFPageProps> = ({
  pdf,
  pageNumber,
  scale,
  annotations,
  onTextSelection,
  onAnnotationClick,
  activeAnnotationId,
  onRenderComplete
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !textLayerRef.current || !pdf) return;

    let cancelled = false;
    setRendering(true);

    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;

      const viewport = page.getViewport({ scale });

      const canvas = canvasRef.current!;
      const context = canvas.getContext('2d');
      if (!context) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;

      page.render({ canvasContext: context, viewport }).promise.then(() => {
        if (cancelled) return;
        setRendering(false);
        onRenderComplete?.();
      });

      page.getTextContent().then((content) => {
        if (cancelled || !textLayerRef.current) return;

        textLayerRef.current.innerHTML = '';
        textLayerRef.current.style.width = `${viewport.width}px`;
        textLayerRef.current.style.height = `${viewport.height}px`;

        const textLayer = new TextLayer({
          textContentSource: content,
          container: textLayerRef.current,
          viewport,
        });

        textLayer.render();

        textLayerRef.current.querySelectorAll('.endOfLine').forEach(el => {
          el.textContent = ' ';
        });
      });
    });

    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber, scale, onRenderComplete]);

  useEffect(() => {
    if (!highlightLayerRef.current || !pdf) return;

    highlightLayerRef.current.innerHTML = '';

    pdf.getPage(pageNumber).then((page) => {
      const viewport = page.getViewport({ scale });
      annotations.forEach(ann => {
        if (ann.pageNumber !== pageNumber) return;

        ann.highlightRects.forEach(rect => {
          const normalizedX = rect.x / 100;
          const normalizedY = rect.y / 100;
          const normalizedW = rect.width / 100;
          const normalizedH = rect.height / 100;

          const highlightEl = document.createElement('div');
          highlightEl.className = 'pdf-highlight';
          highlightEl.style.cssText = `
            position: absolute;
            left: ${normalizedX * viewport.width}px;
            top: ${normalizedY * viewport.height}px;
            width: ${normalizedW * viewport.width}px;
            height: ${normalizedH * viewport.height}px;
            background-color: ${ann.color}80;
            opacity: 0.5;
            cursor: pointer;
            z-index: 2;
            ${activeAnnotationId === ann.id ? 'box-shadow: 0 0 0 2px #2196F3;' : ''}
          `;
          highlightEl.dataset.annotationId = ann.id;
          highlightEl.addEventListener('click', (e) => {
            e.stopPropagation();
            onAnnotationClick(ann);
          });
          highlightLayerRef.current?.appendChild(highlightEl);
        });
      });
    });
  }, [annotations, pageNumber, scale, activeAnnotationId, pdf, onAnnotationClick]);

  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selectedText = selection.toString().trim();
    if (!selectedText) return;

    const range = selection.getRangeAt(0);
    const containerRect = canvasRef.current?.getBoundingClientRect();
    if (!containerRect) return;

    const rects = getSelectionRects(range, containerRect);
    if (rects.length === 0) return;

    onTextSelection(pageNumber, selectedText, rects);
    selection.removeAllRanges();
  };

  return (
    <div className="pdf-page-container" style={{ position: 'relative', marginBottom: '20px' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div
        ref={textLayerRef}
        className="text-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'auto',
          zIndex: 1
        }}
        onMouseUp={handleMouseUp}
      />
      <div
        ref={highlightLayerRef}
        className="highlight-layer"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          pointerEvents: 'none',
          zIndex: 2
        }}
      />
      {rendering && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.5)',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '4px'
        }}>
          Rendering...
        </div>
      )}
    </div>
  );
};

function getSelectionRects(range: Range, containerRect: DOMRect): NormalizedRect[] {
  const rects: NormalizedRect[] = [];
  const rawRects = range.getClientRects();

  if (rawRects.length === 0) {
    const cr = range.getBoundingClientRect();
    if (cr.width > 0 && cr.height > 0) {
      return [normalizeRect(cr, containerRect)];
    }
    return [];
  }

  for (let i = 0; i < rawRects.length; i++) {
    const r = rawRects[i] as DOMRect;
    if (r.width > 0 && r.height > 0) {
      rects.push(normalizeRect(r, containerRect));
    }
  }

  return rects;
}

function normalizeRect(rect: DOMRect, containerRect: DOMRect): NormalizedRect {
  return {
    x: ((rect.x - containerRect.x) / containerRect.width) * 100,
    y: ((rect.y - containerRect.y) / containerRect.height) * 100,
    width: (rect.width / containerRect.width) * 100,
    height: (rect.height / containerRect.height) * 100
  };
}

export { pdfjsLib };
