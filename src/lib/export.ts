import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import { Annotation } from '../types';
import {
  CHROMEPDF_SOURCE_FILENAME,
  CHROMEPDF_WORKSPACE_FILENAME,
  createWorkspacePayload,
} from './workspacePdf';

type PDFColor = ReturnType<typeof rgb>;

export async function exportToPDF(
  sourcePdfBytes: ArrayBuffer | Uint8Array,
  annotations: Annotation[],
  documentName?: string
): Promise<void> {
  const pdfBytes = clonePdfBytes(sourcePdfBytes);
  const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const SIDEBAR_WIDTH = 220;
  const MARGIN = 14;
  const QUOTE_SIZE = 7.5;
  const NOTE_SIZE = 8.5;
  const LINE_HEIGHT = 11;

  const pages = pdfDoc.getPages();

  for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
    const page = pages[pageNum - 1];
    const { width: pageW, height: pageH } = page.getSize();

    page.setSize(pageW + SIDEBAR_WIDTH, pageH);

    // Sidebar background
    page.drawRectangle({
      x: pageW,
      y: 0,
      width: SIDEBAR_WIDTH,
      height: pageH,
      color: rgb(1, 1, 1),
    });

    // Divider line
    page.drawLine({
      start: { x: pageW, y: 0 },
      end: { x: pageW, y: pageH },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const pageAnnotations = annotations.filter(a => a.pageNumber === pageNum);

    // ── Draw highlights ──────────────────────────────────────────────────────
    // Stored rects: x/y/width/height are 0-100 as % of canvas dimensions.
    // Canvas origin = top-left (y down); PDF-lib origin = bottom-left (y up).
    // drawRectangle takes the BOTTOM-LEFT corner in PDF-lib space:
    //   pdfY_bottomLeft = pageH - canvasY_top - rectH
    for (const ann of pageAnnotations) {
      const color = hexToRgb(ann.color);
      for (const rect of ann.highlightRects) {
        const rx = (rect.x / 100) * pageW;
        const ry = (rect.y / 100) * pageH;       // canvas y from top
        const rw = (rect.width / 100) * pageW;
        const rh = Math.max((rect.height / 100) * pageH, 1);

        page.drawRectangle({
          x: rx,
          y: pageH - ry - rh,                    // flip y-axis for PDF-lib
          width: rw,
          height: rh,
          color,
          opacity: 0.35,
        });
      }
    }

    // ── Sidebar notes ────────────────────────────────────────────────────────
    let cursorY = pageH - MARGIN;

    for (const ann of pageAnnotations) {
      const color = hexToRgb(ann.color);
      const noteX = pageW + MARGIN;
      const noteW = SIDEBAR_WIDTH - MARGIN * 2;
      const selectedText = sanitizeForWinAnsi(ann.selectedText);
      const noteText = sanitizeForWinAnsi(ann.noteText);

      const quoteLines = wrapText(`"${selectedText}"`, helvetica, QUOTE_SIZE, noteW);
      const bodyLines = noteText
        ? wrapText(noteText, helvetica, NOTE_SIZE, noteW)
        : [];

      const blockH =
        MARGIN / 2 +
        quoteLines.length * (QUOTE_SIZE + 2) +
        (bodyLines.length ? 4 + bodyLines.length * LINE_HEIGHT : 0) +
        MARGIN / 2;

      if (cursorY - blockH < MARGIN) break;

      // Background box
      page.drawRectangle({
        x: noteX - 4,
        y: cursorY - blockH,
        width: noteW + 4,
        height: blockH,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: color,
        borderWidth: 0.75,
        opacity: 1,
      });

      // Color accent bar
      page.drawRectangle({
        x: noteX - 4,
        y: cursorY - blockH,
        width: 3,
        height: blockH,
        color,
        opacity: 0.9,
      });

      let ty = cursorY - MARGIN / 2 - QUOTE_SIZE;

      for (const line of quoteLines) {
        if (ty < MARGIN) break;
        page.drawText(line, {
          x: noteX + 2,
          y: ty,
          size: QUOTE_SIZE,
          font: helvetica,
          color: rgb(0.45, 0.45, 0.45),
        });
        ty -= QUOTE_SIZE + 2;
      }

      if (bodyLines.length) {
        ty -= 4;
        for (const line of bodyLines) {
          if (ty < MARGIN) break;
          page.drawText(line, {
            x: noteX + 2,
            y: ty,
            size: NOTE_SIZE,
            font: helveticaBold,
            color: rgb(0.1, 0.1, 0.1),
          });
          ty -= LINE_HEIGHT;
        }
      }

      cursorY -= blockH + 6;
    }
  }

  const workspacePayload = createWorkspacePayload(annotations, documentName);
  pdfDoc.setKeywords(['source:chromepdf', `chromepdf:workspace:v1`]);

  await pdfDoc.attach(JSON.stringify(workspacePayload), CHROMEPDF_WORKSPACE_FILENAME, {
    mimeType: 'application/json',
    description: 'ChromePDF workspace metadata',
  });
  await pdfDoc.attach(pdfBytes, CHROMEPDF_SOURCE_FILENAME, {
    mimeType: 'application/pdf',
    description: 'Original PDF source for ChromePDF workspace recovery',
  });

  const exportedPdfBytes = await pdfDoc.save();
  const exportedPdfBuffer = exportedPdfBytes.buffer.slice(
    exportedPdfBytes.byteOffset,
    exportedPdfBytes.byteOffset + exportedPdfBytes.byteLength
  );
  const blob = new Blob([exportedPdfBuffer as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'annotated-document.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function clonePdfBytes(sourcePdfBytes: ArrayBuffer | Uint8Array): Uint8Array {
  if (sourcePdfBytes instanceof Uint8Array) {
    return sourcePdfBytes.slice();
  }

  return new Uint8Array(sourcePdfBytes.slice(0));
}

function hexToRgb(hex: string): PDFColor {
  const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!r) return rgb(1, 1, 0);
  return rgb(parseInt(r[1], 16) / 255, parseInt(r[2], 16) / 255, parseInt(r[3], 16) / 255);
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function sanitizeForWinAnsi(text: string): string {
  return text
    .replace(/\r\n/g, ' ')
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\u00A0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    .replace(/\s+/g, ' ')
    .trim();
}
