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

export type DocumentRecord = {
  id: string;
  name: string;
  sourceUrl?: string;
  file?: ArrayBuffer;
  createdAt: string;
  updatedAt: string;
  pageCount: number;
};

export type Annotation = {
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
