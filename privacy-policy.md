# ChromePDF Privacy Policy

Effective date: 2026-04-12

ChromePDF is a local-first PDF annotation extension.

## What ChromePDF Does

ChromePDF lets you open PDFs, create highlights, add rich notes, and export annotated PDFs. The extension also stores your local workspace so you can reopen documents and continue where you left off.

## Data We Process

ChromePDF processes the following information:

- PDF document bytes that you open in the extension
- Document metadata such as file name, page count, and source URL when available
- Highlight positions and colors
- Selected text from the PDF
- Note content, including rich notes and LaTeX
- Local session state such as the current page, zoom level, and active annotation

For file-based imports, ChromePDF may temporarily store the file contents in `chrome.storage.local` so the viewer can reopen them.

## Where Data Is Stored

ChromePDF stores annotation data and workspace state locally on your device using IndexedDB and Chrome local storage. ChromePDF does not require you to create an online account.

## How Data Is Used

The data is used only to:

- Display and reopen your saved PDF workspace
- Save highlights, notes, and session state locally
- Export annotated PDFs that include your notes and highlights

## Data Sharing

ChromePDF does not send your PDF content, notes, highlights, or workspace data to ChromePDF servers.

ChromePDF does not sell or transfer your data to third parties.

## Network Access

ChromePDF may fetch a PDF only when you explicitly open a user-provided `http://` or `https://` PDF URL in the viewer. This request is user-directed and is used only to load the document you chose to open.

ChromePDF does not load remote JavaScript or remote code.

## Permissions

ChromePDF requests browser permissions required to:

- Detect and open PDFs from the current tab
- Open the viewer for the active PDF
- Store annotations and local workspace data

## Changes

If this policy changes, the updated version will be published with the extension listing and repository documentation.
