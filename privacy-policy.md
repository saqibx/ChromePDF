# ChromePDF Privacy Policy

Effective date: 2026-04-12

ChromePDF is a local-first PDF annotation extension.

## What ChromePDF Does

ChromePDF lets you open a PDF from your device, create highlights, add rich notes, and export an annotated PDF. It also saves your local workspace so you can reopen documents and continue where you left off.

## Data We Process

ChromePDF processes the following information when you use the extension:

- PDF document bytes that you upload into the viewer
- Document metadata such as file name and page count
- Highlight positions and colors
- Selected text from the PDF
- Note content, including rich notes and LaTeX
- Local session state such as the current page, zoom level, and active annotation

If you open a remote `http://` or `https://` PDF URL in the viewer manually, ChromePDF may fetch that document only because you explicitly asked it to open that URL.

## Where Data Is Stored

ChromePDF stores annotation data, documents, and workspace state locally on your device using IndexedDB and Chrome local storage. ChromePDF does not require you to create an online account.

## How Data Is Used

The data is used only to:

- Display and reopen your saved PDF workspace
- Save highlights, notes, and session state locally
- Export annotated PDFs that include your notes and highlights

## Data Sharing

ChromePDF does not send your PDF content, notes, highlights, or workspace data to ChromePDF servers.

ChromePDF does not sell or transfer your data to third parties.

## Network Access

ChromePDF does not load remote JavaScript, remote code, or remote Wasm.

ChromePDF may fetch a PDF only when you explicitly open a user-provided `http://` or `https://` PDF URL in the viewer. That request is user-directed and is used only to load the document you chose to open.

## Permissions

ChromePDF only requests browser access needed to store local workspace data and open the extension viewer when you click the extension.

ChromePDF does not inject code into websites, and it does not require broad host permissions for normal use.

## Changes

If this policy changes, the updated version will be published with the extension listing and repository documentation.
