# ChromePDF Viewer

A Chrome extension for annotating PDFs with highlights and notes.

## Features

- **PDF Rendering**: View PDFs in a custom viewer with full control
- **Text Highlighting**: Select text and create colored highlights
- **Notes**: Attach notes to any highlight
- **Sidebar**: See all annotations organized by page
- **Persistent Storage**: Annotations saved locally in IndexedDB
- **Export**: Generate annotated PDF with notes in right margin

## Installation

1. Build the project:
   ```bash
   npm install
   npm run build
   ```

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `dist` folder

**Note**: For production use, add icon files to `dist/assets/`:
- `icon16.png` (16x16)
- `icon48.png` (48x48)
- `icon128.png` (128x128)

The extension works without icons but will show a default puzzle piece.

## Usage

### Opening a PDF

**Option 1: Open via extension**
1. Navigate to any PDF in Chrome
2. Click the ChromePDF extension icon in the toolbar
3. The PDF opens in the custom viewer

**Option 2: Drag and drop**
1. Click the extension icon when not on a PDF
2. Drag and drop a PDF file onto the viewer
3. Or click "Select PDF" to browse

### Creating Annotations

1. Select text in the PDF
2. Choose a highlight color from the popup
3. Click "Add Note" to add a note to the highlight

### Managing Notes

- **Click** a note card to jump to its highlight
- **Double-click** a note to edit the note text
- **Change colors** using the color pickers
- **Mark resolved** using the checkmark button
- **Delete** using the × button

### Exporting

Click "Export PDF" in the toolbar to download a new PDF with:
- Original content on the left
- Notes aligned on the right margin

## Development

```bash
# Install dependencies
npm install

# Build for development
npm run dev

# Build for production
npm run build

# Copy extension files to dist (automatic with build)
cp manifest.json dist/
cp src/background.js dist/
cp src/content.js dist/
```

## Tech Stack

- **React 18** + TypeScript
- **PDF.js** for PDF rendering and text layer
- **pdf-lib** for PDF export
- **IndexedDB** for local storage
- **Vite** for bundling
- **Chrome Extension MV3**

## Project Structure

```
chromepdf/
├── manifest.json          # Chrome extension manifest
├── src/
│   ├── background.js       # Service worker
│   ├── content.js          # Content script
│   ├── types/
│   │   └── index.ts        # TypeScript types
│   ├── lib/
│   │   ├── db.ts           # IndexedDB operations
│   │   ├── utils.ts        # Utilities
│   │   └── export.ts       # PDF export
│   ├── viewer/
│   │   ├── App.tsx         # Main viewer component
│   │   ├── PDFPage.tsx     # Page renderer
│   │   ├── Sidebar.tsx     # Notes sidebar
│   │   ├── viewer.html     # Viewer page
│   │   └── viewer-main.tsx # Entry point
└── dist/                   # Built output
```

## Data Model

```typescript
DocumentRecord {
  id: string
  name: string
  sourceUrl?: string
  file?: ArrayBuffer
  createdAt: string
  updatedAt: string
  pageCount: number
}

Annotation {
  id: string
  documentId: string
  pageNumber: number
  selectedText: string
  noteText: string
  highlightRects: NormalizedRect[]
  color: string
  resolved: boolean
  createdAt: string
  updatedAt: string
}
```

## Known Limitations

- Text selection works best with text-based PDFs (not scanned images)
- Export creates a new PDF via canvas rendering (original fidelity may vary)
- Large PDFs may take time to render
- File:// URLs require manual permission grant in Chrome:
  - Go to `chrome://extensions/`
  - Find ChromePDF
  - Toggle "Allow access to file URLs"
