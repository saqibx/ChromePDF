import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { TextLayer } from 'pdfjs-dist';
import { Annotation, NormalizedRect, Point, DrawingAnnotation, HighlightAnnotation } from '../types';
import { DrawingCanvas } from './DrawingCanvas';

interface PDFPageProps {
  pdf: pdfjsLib.PDFDocumentProxy;
  pageNumber: number;
  scale: number;
  annotations: Annotation[];
  onTextSelection: (pageNumber: number, selectedText: string, rects: NormalizedRect[]) => void;
  onAnnotationClick: (annotation: Annotation) => void;
  activeAnnotationId: string | null;
  onRenderComplete?: () => void;
  drawingMode: 'highlight' | 'draw';
  drawingColor: string;
  drawingStrokeWidth: number;
  currentDrawingPath: Point[];
  onDrawingStart: (point: Point) => void;
  onDrawingMove: (point: Point) => void;
  onDrawingEnd: (pageNumber: number, finalPath: Point[], viewportWidth: number, viewportHeight: number) => void;
  isDrawingEnabled: boolean;
}

export const PDFPage: React.FC<PDFPageProps> = ({
  pdf,
  pageNumber,
  scale,
  annotations,
  onTextSelection,
  onAnnotationClick,
  activeAnnotationId,
  onRenderComplete,
  drawingMode,
  drawingColor,
  drawingStrokeWidth,
  currentDrawingPath,
  onDrawingStart,
  onDrawingMove,
  onDrawingEnd,
  isDrawingEnabled,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const highlightLayerRef = useRef<HTMLDivElement>(null);
  const [rendering, setRendering] = useState(false);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const drawingAnnotations = annotations.filter(
    (ann): ann is DrawingAnnotation => ann.type === 'drawing' && ann.pageNumber === pageNumber
  );

  useEffect(() => {
    if (!canvasRef.current || !textLayerRef.current || !pdf) return;

    let cancelled = false;
    setRendering(true);

    pdf.getPage(pageNumber).then((page) => {
      if (cancelled) return;

      const viewport = page.getViewport({ scale });
      setViewportSize({ width: viewport.width, height: viewport.height });

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
        textLayerRef.current.style.setProperty('--scale-factor', viewport.scale.toString());

        const textLayer = new TextLayer({
          textContentSource: content,
          container: textLayerRef.current,
          viewport,
        });

        textLayer.render();
      });
    });

    return () => { cancelled = true; };
  }, [pdf, pageNumber, scale, onRenderComplete]);

  useEffect(() => {
    if (!highlightLayerRef.current || !pdf) return;

    highlightLayerRef.current.innerHTML = '';

    pdf.getPage(pageNumber).then((page) => {
      const viewport = page.getViewport({ scale });
      const highlights = annotations.filter(
        (ann): ann is HighlightAnnotation => ann.type === 'highlight' && ann.pageNumber === pageNumber
      );

      highlights.forEach(ann => {
        ann.highlightRects.forEach((rect) => {
          const highlightEl = document.createElement('div');
          highlightEl.className = 'pdf-highlight';
          highlightEl.style.cssText = `
            position: absolute;
            left: ${(rect.x / 100) * viewport.width}px;
            top: ${(rect.y / 100) * viewport.height}px;
            width: ${(rect.width / 100) * viewport.width}px;
            height: ${(rect.height / 100) * viewport.height}px;
            background-color: ${ann.color};
            opacity: 0.4;
            cursor: pointer;
            z-index: 2;
            mix-blend-mode: multiply;
            ${activeAnnotationId === ann.id ? 'box-shadow: 0 0 0 2px #8a4e85, inset 0 0 0 1px rgba(87,47,83,0.4);' : ''}
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
    if (isDrawingEnabled && drawingMode === 'draw') return;

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

  const completedPaths: Point[][] = drawingAnnotations.flatMap(ann => ann.paths);

  const handleDrawingEndWrapper = useCallback((finalPath: Point[]) => {
    onDrawingEnd(pageNumber, finalPath, viewportSize.width, viewportSize.height);
  }, [onDrawingEnd, pageNumber, viewportSize]);

  return (
    <div className="pdf-page-container" style={{ position: 'relative', marginBottom: '20px' }}>
      <canvas ref={canvasRef} style={{ display: 'block' }} />
      <div
        ref={textLayerRef}
        className="text-layer"
        style={{
          zIndex: 1,
          pointerEvents: isDrawingEnabled && drawingMode === 'draw' ? 'none' : 'auto',
        }}
        onMouseUp={handleMouseUp}
      />
      <div
        ref={highlightLayerRef}
        className="highlight-layer"
        style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none', zIndex: 2 }}
      />
      {viewportSize.width > 0 && (
        <DrawingCanvas
          width={viewportSize.width}
          height={viewportSize.height}
          paths={completedPaths}
          currentPath={currentDrawingPath}
          color={drawingColor}
          strokeWidth={drawingStrokeWidth}
          isActive={isDrawingEnabled && drawingMode === 'draw'}
          onMouseDown={onDrawingStart}
          onMouseMove={onDrawingMove}
          onMouseUp={handleDrawingEndWrapper}
        />
      )}
      {rendering && (
        <div className="page-rendering-overlay">Rendering…</div>
      )}
    </div>
  );
};

function getSelectionRects(range: Range, containerRect: DOMRect): NormalizedRect[] {
  const rects: NormalizedRect[] = [];
  const rawRects = range.getClientRects();

  if (rawRects.length === 0) {
    const cr = range.getBoundingClientRect();
    if (cr.width > 0 && cr.height > 0) return [normalizeRect(cr, containerRect)];
    return [];
  }

  for (let i = 0; i < rawRects.length; i++) {
    const r = rawRects[i] as DOMRect;
    if (r.width > 0 && r.height > 0) rects.push(normalizeRect(r, containerRect));
  }

  return rects;
}

function normalizeRect(rect: DOMRect, containerRect: DOMRect): NormalizedRect {
  return {
    x: ((rect.x - containerRect.x) / containerRect.width) * 100,
    y: ((rect.y - containerRect.y) / containerRect.height) * 100,
    width: (rect.width / containerRect.width) * 100,
    height: (rect.height / containerRect.height) * 100,
  };
}

export { pdfjsLib };
