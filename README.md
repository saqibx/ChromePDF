# ChromePDF Viewer

A local-first Chrome extension for annotating PDFs with highlights, rich notes, LaTeX, and exported PDFs.

## Features

- **Upload-first workflow**: Click the extension icon and choose a PDF from your device
- **PDF rendering**: View PDFs in a custom reader with full control
- **Text highlighting**: Select text and create colored highlights
- **Rich notes**: Attach notes with headings, lists, callouts, quotes, code blocks, toggles, checklists, and LaTeX
- **Slash commands**: Type `/` in the note editor to insert formatting blocks and templates
- **Sidebar**: See all annotations organized by page
- **Local storage**: Documents, annotations, and session state are saved locally in IndexedDB and Chrome storage
- **Export**: Generate an annotated PDF with notes in the right margin, including rendered math and checklist boxes

## Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Build the extension:
   ```bash
   npm run build
   ```

3. Open Chrome and navigate to `chrome://extensions/`

4. Enable Developer mode

5. Click "Load unpacked" and select the `dist` folder

## Usage

1. Click the ChromePDF extension icon
2. Choose a PDF from your device
3. Annotate the document in the viewer
4. Export the annotated PDF when you are done

## Writing Notes

- Type `/` in the note editor to open the command menu
- Use commands to insert headings, bullets, checklists, quotes, callouts, code blocks, math blocks, toggles, links, and templates
- Use LaTeX inside `$$ ... $$` blocks for display math
- Click checklist items in the sidebar preview to toggle them on and off

## Exporting

Click "Export PDF" in the toolbar to download a new PDF with:
- Original content on the left
- Notes aligned on the right margin
- Math blocks rendered in the export
- Checklist items exported as real boxes

## Development

```bash
npm install
npm run dev
npm run build
```

## Tech Stack

- React 18 + TypeScript
- PDF.js for PDF rendering and text extraction
- pdf-lib for PDF export
- KaTeX for math rendering
- IndexedDB and chrome.storage.local for local state
- Vite for bundling

## Data Handling

ChromePDF is local-first:

- PDF bytes, highlights, notes, and session state are stored on the device
- The extension does not send your notes or documents to a backend server
- The upload flow is user-initiated and stays local unless you choose to open a remote PDF URL in the viewer

## Privacy

See [privacy-policy.md](./privacy-policy.md) or the GitHub Pages policy at `docs/index.html`.
