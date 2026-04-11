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

  const MARGIN_NOTE_WIDTH = 200;
  const PAGE_MARGIN = 20;
  const NOTE_HEADER_HEIGHT = 30;
  const NOTE_LINE_HEIGHT = 12;
  const NOTE_PADDING = 10;

  for (let pageNum = 1; pageNum <= sourcePdf.numPages; pageNum++) {
    const page = await sourcePdf.getPage(pageNum);
    const viewport = page.getViewport({ scale });
    const originalWidth = viewport.width;
    const originalHeight = viewport.height;

    const newPageWidth = originalWidth + MARGIN_NOTE_WIDTH;
    const newPage = pdfDoc.addPage([newPageWidth, originalHeight]);

    newPage.drawRectangle({
      x: 0,
      y: 0,
      width: newPageWidth,
      height: originalHeight,
      color: rgb(1, 1, 1),
    });

    const pageAnnotations = annotations.filter(a => a.pageNumber === pageNum);

    const dividerX = originalWidth;
    newPage.drawLine({
      start: { x: dividerX, y: 0 },
      end: { x: dividerX, y: originalHeight },
      thickness: 1,
      color: rgb(0.9, 0.9, 0.9),
    });

    const canvas = document.createElement('canvas');
    canvas.width = originalWidth;
    canvas.height = originalHeight;
    const context = canvas.getContext('2d');
    if (!context) continue;

    await page.render({ canvasContext: context, viewport }).promise;

    const imgData = canvas.toDataURL('image/png');
    const pngImage = await pdfDoc.embedPng(imgData);

    newPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: originalWidth,
      height: originalHeight,
    });

    for (const ann of pageAnnotations) {
      const avgY = ann.highlightRects.reduce((sum, r) => sum + r.y, 0) / ann.highlightRects.length;
      const normalizedY = avgY / 100;

      const highlightX = (ann.highlightRects[0]?.x || 0) / 100 * scale;
      const highlightW = (ann.highlightRects[0]?.width || 50) / 100 * scale;

      newPage.drawRectangle({
        x: highlightX,
        y: normalizedY * scale,
        width: highlightW,
        height: 12,
        color: hexToRgb(ann.color),
        opacity: 0.4,
      });

      const noteX = dividerX + PAGE_MARGIN;
      let noteY = normalizedY * scale;

      newPage.drawRectangle({
        x: noteX,
        y: noteY - NOTE_PADDING,
        width: MARGIN_NOTE_WIDTH - PAGE_MARGIN * 2,
        height: NOTE_HEADER_HEIGHT + (ann.noteText ? getTextHeight(ann.noteText, helvetica, MARGIN_NOTE_WIDTH - PAGE_MARGIN * 2 - NOTE_PADDING * 2, NOTE_LINE_HEIGHT) * NOTE_LINE_HEIGHT + NOTE_PADDING : NOTE_HEADER_HEIGHT),
        borderColor: hexToRgb(ann.color),
        borderWidth: 1,
        opacity: 0.1,
      });

      newPage.drawText(`Page ${ann.pageNumber}`, {
        x: noteX + NOTE_PADDING,
        y: noteY,
        size: 8,
        font: helveticaBold,
        color: rgb(0.4, 0.4, 0.4),
      });

      noteY -= NOTE_HEADER_HEIGHT + NOTE_PADDING;

      if (ann.noteText) {
        const lines = wrapText(ann.noteText, helvetica, NOTE_LINE_HEIGHT, MARGIN_NOTE_WIDTH - PAGE_MARGIN * 2 - NOTE_PADDING * 2);
        for (const line of lines) {
          newPage.drawText(line, {
            x: noteX + NOTE_PADDING,
            y: noteY,
            size: 9,
            font: helvetica,
            color: rgb(0.2, 0.2, 0.2),
          });
          noteY -= NOTE_LINE_HEIGHT;
        }
      } else {
        newPage.drawText('(No note)', {
          x: noteX + NOTE_PADDING,
          y: noteY,
          size: 9,
          font: helvetica,
          color: rgb(0.6, 0.6, 0.6),
        });
      }

      newPage.drawLine({
        start: { x: dividerX, y: normalizedY * scale },
        end: { x: dividerX + MARGIN_NOTE_WIDTH * 0.3, y: normalizedY * scale },
        thickness: 0.5,
        color: hexToRgb(ann.color),
        opacity: 0.6,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();

  const arrayBuffer = new ArrayBuffer(pdfBytes.length);
  new Uint8Array(arrayBuffer).set(pdfBytes);
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
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
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return rgb(1, 1, 0);

  return rgb(
    parseInt(result[1], 16) / 255,
    parseInt(result[2], 16) / 255,
    parseInt(result[3], 16) / 255
  );
}

function wrapText(
  text: string,
  font: PDFFont,
  fontSize: number,
  maxWidth: number
): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);

    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function getTextHeight(text: string, font: PDFFont, maxWidth: number, lineHeight: number): number {
  const lines = wrapText(text, font, 9, maxWidth);
  return Math.max(lines.length, 1);
}
