export type BoundingRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type NormalizedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

export type DocumentRecord = {
  id: string;
  name: string;
  sourceUrl?: string;
  file?: ArrayBuffer;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
};

export type DocumentSessionState = {
  documentId: string;
  currentPage: number;
  zoom: number;
  activeAnnotationId?: string | null;
  updatedAt: string;
};

export type Annotation = HighlightAnnotation | DrawingAnnotation;

export type HighlightAnnotation = {
  type: 'highlight';
  id: string;
  documentId: string;
  pageNumber: number;
  selectedText: string;
  noteText: string;
  highlightRects: NormalizedRect[];
  quotePosition?: {
    startOffset?: number;
    endOffset?: number;
  };
  color: string;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DrawingAnnotation = {
  type: 'drawing';
  id: string;
  documentId: string;
  pageNumber: number;
  paths: Point[][];
  color: string;
  strokeWidth: number;
  // Canvas dimensions at draw time — needed to scale paths to PDF coordinates on export
  viewportWidth?: number;
  viewportHeight?: number;
  resolved: boolean;
  createdAt: string;
  updatedAt: string;
};

export type HighlightColor = {
  name: string;
  value: string;
};

export const HIGHLIGHT_COLORS: HighlightColor[] = [
  { name: 'Yellow', value: '#FFEB3B' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Pink', value: '#E91E63' },
  { name: 'Orange', value: '#FF9800' },
];

export type DrawingColor = {
  name: string;
  value: string;
};

export const DRAWING_COLORS: DrawingColor[] = [
  { name: 'Black', value: '#000000' },
  { name: 'Blue', value: '#2196F3' },
  { name: 'Red', value: '#E91E63' },
  { name: 'Green', value: '#4CAF50' },
  { name: 'Orange', value: '#FF9800' },
];

export const STROKE_WIDTHS: number[] = [1, 2, 4, 6, 8];
