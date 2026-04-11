import { PDFDocument, rgb, StandardFonts, PDFFont } from 'pdf-lib';
import * as pdfjsLib from 'pdfjs-dist';
import { Annotation } from '../types';

type PDFColor = ReturnType<typeof rgb>;

export async function exportToPDF(
  sourcePdf: pdfjsLib.PDFDocumentProxy,
  annotations: Annotation[],
  scale: number
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const SIDEBAR_WIDTH = 220;
  const MARGIN = 14;
  const QUOTE_SIZE = 7.5;
  const NOTE_SIZE = 8.5;
  const LINE_HEIGHT = 11;

  for (let pageNum = 1; pageNum <= sourcePdf.numPages; pageNum++) {
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const pageW = viewport.width;
    const pageH = viewport.height;

    const newPage = pdfDoc.addPage([pageW + SIDEBAR_WIDTH, pageH]);

    // White background
    newPage.drawRectangle({ x: 0, y: 0, width: pageW + SIDEBAR_WIDTH, height: pageH, color: rgb(1, 1, 1) });

    // Render PDF page to canvas
    const canvas = document.createElement('canvas');
    canvas.width = pageW;
    canvas.height = pageH;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;

    const pngImage = await pdfDoc.embedPng(canvas.toDataURL('image/png'));
    // PDF-lib drawImage: bottom-left corner at (0,0), image renders right-side-up
    newPage.drawImage(pngImage, { x: 0, y: 0, width: pageW, height: pageH });

    // Divider line
    newPage.drawLine({
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

        newPage.drawRectangle({
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

      const quoteLines = wrapText(`"${ann.selectedText}"`, helvetica, QUOTE_SIZE, noteW);
      const bodyLines = ann.noteText
        ? wrapText(ann.noteText, helvetica, NOTE_SIZE, noteW)
        : [];

      const blockH =
        MARGIN / 2 +
        quoteLines.length * (QUOTE_SIZE + 2) +
        (bodyLines.length ? 4 + bodyLines.length * LINE_HEIGHT : 0) +
        MARGIN / 2;

      if (cursorY - blockH < MARGIN) break;

      // Background box
      newPage.drawRectangle({
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
      newPage.drawRectangle({
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
        newPage.drawText(line, {
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
          newPage.drawText(line, {
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

  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'annotated-document.pdf';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
