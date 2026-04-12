import { PDFDocument, PDFFont, PDFImage, rgb, StandardFonts } from 'pdf-lib';
import katex from 'katex';
import katexCss from 'katex/dist/katex.min.css?raw';
import { Annotation } from '../types';
import { CHROMEPDF_SOURCE_FILENAME, createWorkspacePayload } from './workspacePdf';

type PDFColor = ReturnType<typeof rgb>;

type NoteBlock =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'quote'; text: string }
  | { type: 'code'; text: string }
  | { type: 'math'; text: string }
  | { type: 'divider' }
  | { type: 'toggle'; text: string }
  | { type: 'list'; ordered: boolean; kind: 'bullet' | 'checklist'; items: NoteListItem[] };

type NoteListItem = {
  text: string;
  checked?: boolean;
};

type LayoutBlock =
  | { type: 'heading'; level: 1 | 2 | 3; lines: string[]; pdfImage: PDFImage | null; height: number }
  | { type: 'paragraph'; lines: string[]; pdfImage: PDFImage | null; height: number }
  | { type: 'quote'; lines: string[]; pdfImage: PDFImage | null; height: number }
  | { type: 'code'; lines: string[]; pdfImage: PDFImage | null; height: number }
  | { type: 'math'; pdfImage: PDFImage | null; lines: string[]; height: number }
  | { type: 'divider'; height: number }
  | { type: 'toggle'; lines: string[]; pdfImage: PDFImage | null; height: number }
  | { type: 'list'; ordered: boolean; kind: 'bullet' | 'checklist'; items: LayoutListItem[]; height: number };

type LayoutListItem = {
  label: string;
  lines: string[];
  pdfImage: PDFImage | null;
  checked?: boolean;
  height: number;
};

const LINE_HEIGHT = 11;
const BLOCK_INNER_GAP = 3;
const NOTE_CONTENT_PAD_X = 8;
const NOTE_CONTENT_PAD_Y = 8;
const MATH_BOX_PAD = 6;
const TEXT_IMAGE_PAD_X = 8;
const TEXT_IMAGE_PAD_Y = 5;

const _fontB64Cache = new Map<string, string>();

async function _fetchFontB64(url: string): Promise<string> {
  if (_fontB64Cache.has(url)) return _fontB64Cache.get(url)!;
  const buf = await (await fetch(url)).arrayBuffer();
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  _fontB64Cache.set(url, b64);
  return b64;
}

async function renderMathToPng(latex: string, maxWidthPt: number): Promise<Uint8Array | null> {
  const container = document.createElement('div');
  try {
    const pxWidth = Math.round(maxWidthPt * 2); // 2× for sharpness

    container.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${pxWidth}px;background:white;padding:6px;box-sizing:border-box;font-size:16px;text-align:center`;
    container.innerHTML = katex.renderToString(latex, { displayMode: true, throwOnError: false });
    document.body.appendChild(container);
    await new Promise<void>((r) => requestAnimationFrame(() => { requestAnimationFrame(() => r()); }));

    const rect = container.getBoundingClientRect();
    const w = Math.ceil(rect.width) || pxWidth;
    const h = Math.ceil(rect.height) || 80;
    const usedKeys = new Set<string>();
    const walk = (el: Element) => {
      const cs = window.getComputedStyle(el);
      const fam = cs.fontFamily.split(',')[0].replace(/['"]/g, '').trim();
      if (fam.startsWith('KaTeX')) usedKeys.add(`${fam}|||${cs.fontStyle}|||${cs.fontWeight}`);
      for (const c of el.children) walk(c);
    };
    walk(container);

    const fontFaceRules: string[] = [];
    const fontUrls = extractKatexFontUrls(katexCss);
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (!(rule instanceof CSSFontFaceRule)) continue;
          const fam = rule.style.fontFamily.replace(/['"]/g, '').trim();
          const sty = rule.style.fontStyle || 'normal';
          const wgt = rule.style.fontWeight || '400';
          if (!usedKeys.has(`${fam}|||${sty}|||${wgt}`)) continue;
          const src = rule.style.getPropertyValue('src') || '';
          const woff2 = src.match(/url\(['"]?([^'")\s]+\.woff2)['"]?\)/)?.[1];
          if (!woff2) continue;
          const fontUrl = resolveKatexFontUrl(woff2, fontUrls);
          const b64 = await _fetchFontB64(fontUrl);
          fontFaceRules.push(`@font-face{font-family:"${fam}";font-style:${sty};font-weight:${wgt};src:url('data:font/woff2;base64,${b64}') format('woff2')}`);
        }
      } catch {
        // Ignore stylesheets we can't read; the bundled KaTeX CSS is enough.
      }
    }

    const xmlns = 'http://www.w3.org/2000/svg';
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const svg = document.createElementNS(xmlns, 'svg');
    svg.setAttribute('xmlns', xmlns);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const styleEl = document.createElementNS(xmlns, 'style');
    styleEl.textContent = `${fontFaceRules.join('\n')}\n${stripFontFaceRules(katexCss)}`;
    svg.appendChild(styleEl);

    const foreignObject = document.createElementNS(xmlns, 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', '100%');
    foreignObject.setAttribute('height', '100%');
    svg.appendChild(foreignObject);

    const wrapper = document.createElementNS(xhtml, 'div');
    wrapper.setAttribute('xmlns', xhtml);
    wrapper.setAttribute(
      'style',
      `width:${w}px;height:${h}px;background:white;padding:6px;box-sizing:border-box;font-size:16px;text-align:center`
    );
    wrapper.innerHTML = container.innerHTML;
    foreignObject.appendChild(wrapper);

    const serialized = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    const pngDataUrl = await svgDataUrlToPng(svgDataUrl, w, h);

    const b64 = pngDataUrl.split(',')[1];
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (err) {
    if (err instanceof Error) {
      console.error('renderMathToPng:', err.name, err.message, err.stack);
    } else {
      console.error('renderMathToPng:', err);
    }
    return null;
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

async function svgDataUrlToPng(svgDataUrl: string, width: number, height: number): Promise<string> {
  const img = new Image();
  img.decoding = 'async';
  img.src = svgDataUrl;
  await img.decode();

  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to acquire 2D canvas context');
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function extractKatexFontUrls(css: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /url\((['"]?)([^'")]+)\1\)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(css)) !== null) {
    const url = match[2];
    map.set(url.split('/').pop() ?? url, url);
  }
  return map;
}

function resolveKatexFontUrl(url: string, fontUrls: Map<string, string>): string {
  const base = url.split('/').pop() ?? url;
  return fontUrls.get(base) ?? url;
}

function stripFontFaceRules(css: string): string {
  return css.replace(/@font-face\s*\{[\s\S]*?\}/g, '');
}

function canEncodeText(font: PDFFont, text: string): boolean {
  try {
    font.encodeText(text);
    return true;
  } catch {
    return false;
  }
}

async function layoutQuotedSelection(
  pdfDoc: PDFDocument,
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number
): Promise<{ lines: string[]; pdfImage: PDFImage | null; height: number }> {
  const quoted = `"${text}"`;
  if (canEncodeText(font, quoted)) {
    const lines = wrapText(quoted, font, size, maxWidth);
    return { lines, pdfImage: null, height: Math.max(lines.length * (size + 2), size + 2) };
  }

  const png = await renderTextToPng(quoted, maxWidth, {
    fontSize: size,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontWeight: '400',
    lineHeight: size + 2,
    paddingX: 0,
    paddingY: 0,
    textAlign: 'left',
    color: '#666666',
  });
  if (!png) return { lines: [quoted], pdfImage: null, height: size + 2 };
  const image = await pdfDoc.embedPng(png);
  const scale = Math.min((maxWidth - 2) / image.width, 1);
  return { lines: [], pdfImage: image, height: Math.max(Math.round(image.height * scale), size + 2) };
}

async function renderTextToPng(
  text: string,
  maxWidthPt: number,
  options: {
    fontSize: number;
    fontFamily: string;
    fontWeight?: string;
    fontStyle?: string;
    lineHeight: number;
    paddingX?: number;
    paddingY?: number;
    textAlign?: 'left' | 'center';
    color?: string;
  }
): Promise<Uint8Array | null> {
  const container = document.createElement('div');
  try {
    const pxWidth = Math.max(1, Math.round(maxWidthPt * 2));
    const padX = options.paddingX ?? 0;
    const padY = options.paddingY ?? 0;

    container.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      `width:${pxWidth}px`,
      'background:white',
      `padding:${padY}px ${padX}px`,
      'box-sizing:border-box',
      `font-size:${options.fontSize}px`,
      `line-height:${options.lineHeight}px`,
      `font-family:${options.fontFamily}`,
      `font-weight:${options.fontWeight ?? '400'}`,
      `font-style:${options.fontStyle ?? 'normal'}`,
      `text-align:${options.textAlign ?? 'left'}`,
      `color:${options.color ?? '#111111'}`,
      'white-space:pre-wrap',
      'overflow-wrap:anywhere',
      'word-break:break-word',
    ].join(';');
    container.textContent = text;
    document.body.appendChild(container);
    await new Promise<void>((r) => requestAnimationFrame(() => { requestAnimationFrame(() => r()); }));

    const rect = container.getBoundingClientRect();
    const w = Math.ceil(rect.width) || pxWidth;
    const h = Math.ceil(rect.height) || Math.max(options.fontSize + options.lineHeight, 24);
    const xmlns = 'http://www.w3.org/2000/svg';
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const svg = document.createElementNS(xmlns, 'svg');
    svg.setAttribute('xmlns', xmlns);
    svg.setAttribute('width', String(w));
    svg.setAttribute('height', String(h));
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const foreignObject = document.createElementNS(xmlns, 'foreignObject');
    foreignObject.setAttribute('x', '0');
    foreignObject.setAttribute('y', '0');
    foreignObject.setAttribute('width', '100%');
    foreignObject.setAttribute('height', '100%');
    svg.appendChild(foreignObject);

    const wrapper = document.createElementNS(xhtml, 'div');
    wrapper.setAttribute('xmlns', xhtml);
    wrapper.setAttribute('style', `width:${w}px;height:${h}px;background:white;`);
    wrapper.innerHTML = container.innerHTML;
    foreignObject.appendChild(wrapper);

    const serialized = new XMLSerializer().serializeToString(svg);
    const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`;
    const pngDataUrl = await svgDataUrlToPng(svgDataUrl, w, h);

    const b64 = pngDataUrl.split(',')[1];
    return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  } catch (err) {
    if (err instanceof Error) {
      console.error('renderTextToPng:', err.name, err.message, err.stack);
    } else {
      console.error('renderTextToPng:', err);
    }
    return null;
  } finally {
    if (container.parentNode) container.parentNode.removeChild(container);
  }
}

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
  const BLOCK_PAD_X = 8;
  const BLOCK_PAD_Y = 5;

  const pages = pdfDoc.getPages();

  for (let pageNum = 1; pageNum <= pages.length; pageNum++) {
    const page = pages[pageNum - 1];
    const { width: pageW, height: pageH } = page.getSize();

    page.setSize(pageW + SIDEBAR_WIDTH, pageH);

    page.drawRectangle({
      x: pageW,
      y: 0,
      width: SIDEBAR_WIDTH,
      height: pageH,
      color: rgb(1, 1, 1),
    });

    page.drawLine({
      start: { x: pageW, y: 0 },
      end: { x: pageW, y: pageH },
      thickness: 0.5,
      color: rgb(0.8, 0.8, 0.8),
    });

    const pageAnnotations = annotations.filter((annotation) => annotation.pageNumber === pageNum);

    for (const ann of pageAnnotations) {
      const color = hexToRgb(ann.color);
      for (const rect of ann.highlightRects) {
        const rx = (rect.x / 100) * pageW;
        const ry = (rect.y / 100) * pageH;
        const rw = (rect.width / 100) * pageW;
        const rh = Math.max((rect.height / 100) * pageH, 1);

        page.drawRectangle({
          x: rx,
          y: pageH - ry - rh,
          width: rw,
          height: rh,
          color,
          opacity: 0.35,
        });
      }
    }

    let cursorY = pageH - MARGIN;

    for (const ann of pageAnnotations) {
      const accentColor = hexToRgb(ann.color);
      const noteX = pageW + MARGIN;
      const noteW = SIDEBAR_WIDTH - MARGIN * 2;
      const contentX = noteX + NOTE_CONTENT_PAD_X;
      const contentW = noteW - NOTE_CONTENT_PAD_X * 2;
      const selectedText = ann.selectedText.replace(/\r\n/g, '\n');
      const noteBlocks = parseNoteBlocks(ann.noteText);
      const mathImages = new Map<number, PDFImage>();
      for (let bi = 0; bi < noteBlocks.length; bi++) {
        const nb = noteBlocks[bi];
        if (nb.type === 'math' && nb.text.trim()) {
          const png = await renderMathToPng(nb.text, contentW);
          if (png) mathImages.set(bi, await pdfDoc.embedPng(png));
        }
      }
      const quoteRender = await layoutQuotedSelection(pdfDoc, selectedText, helvetica, QUOTE_SIZE, contentW);
      const bodyBlocks = await layoutNoteBlocks(pdfDoc, noteBlocks, helvetica, helveticaBold, NOTE_SIZE, contentW, mathImages);

      const bodyHeight = bodyBlocks.reduce((sum, block) => sum + block.height, 0) + Math.max(0, (bodyBlocks.length - 1) * BLOCK_INNER_GAP);
      const blockH =
        NOTE_CONTENT_PAD_Y +
        quoteRender.height +
        (bodyBlocks.length ? BLOCK_INNER_GAP + bodyHeight : 0) +
        NOTE_CONTENT_PAD_Y;

      if (cursorY - blockH < MARGIN) break;

      page.drawRectangle({
        x: noteX - 4,
        y: cursorY - blockH,
        width: noteW + 4,
        height: blockH,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: accentColor,
        borderWidth: 0.75,
        opacity: 1,
      });

      page.drawRectangle({
        x: noteX - 4,
        y: cursorY - blockH,
        width: 3,
        height: blockH,
        color: accentColor,
        opacity: 0.9,
      });

      let ty = cursorY - NOTE_CONTENT_PAD_Y;
      if (quoteRender.pdfImage) {
        const dims = quoteRender.pdfImage.scale((contentW - 2) / quoteRender.pdfImage.width);
        const quoteH = Math.min(dims.height, quoteRender.height);
        page.drawImage(quoteRender.pdfImage, {
          x: contentX,
          y: ty - quoteH,
          width: Math.min(contentW - 2, dims.width),
          height: quoteH,
        });
        ty -= quoteH;
      } else {
        const quoteLines = quoteRender.lines;
        ty -= QUOTE_SIZE;
        for (const line of quoteLines) {
          if (ty < MARGIN) break;
          page.drawText(line, {
            x: contentX,
            y: ty,
            size: QUOTE_SIZE,
            font: helvetica,
            color: rgb(0.45, 0.45, 0.45),
          });
          ty -= QUOTE_SIZE + 2;
        }
      }

      if (bodyBlocks.length) {
        ty -= BLOCK_INNER_GAP;
        for (const block of bodyBlocks) {
          ty = drawLayoutBlock(
            page,
            block,
            contentX,
            ty,
            contentW,
            helvetica,
            helveticaBold,
            NOTE_SIZE,
            accentColor,
            BLOCK_PAD_X,
            BLOCK_PAD_Y,
            BLOCK_INNER_GAP
          );
          ty -= BLOCK_INNER_GAP;
          if (ty < MARGIN) break;
        }
      }

      cursorY -= blockH + 6;
    }
  }

  const workspacePayload = createWorkspacePayload(annotations, documentName);
  const workspaceJson = JSON.stringify(workspacePayload);
  const workspaceB64 = uint8ArrayToBase64(new TextEncoder().encode(workspaceJson));
  pdfDoc.setKeywords(['source:chromepdf', `chromepdf-workspace:${workspaceB64}`]);

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

function drawLayoutBlock(
  page: any,
  block: LayoutBlock,
  x: number,
  topY: number,
  maxWidth: number,
  bodyFont: PDFFont,
  boldFont: PDFFont,
  bodySize: number,
  accentColor: PDFColor,
  padX: number,
  padY: number,
  innerGap: number
): number {
  switch (block.type) {
    case 'heading': {
      const size = block.level === 1 ? 13 : block.level === 2 ? 11.5 : 10.5;
      if (block.pdfImage) {
        page.drawImage(block.pdfImage, {
          x: x + padX,
          y: topY - block.height + padY,
          width: maxWidth - padX * 2,
          height: block.height - padY * 2,
        });
      } else {
        let y = topY - padY - size;
        for (const line of block.lines) {
          page.drawText(line, {
            x: x + padX,
            y,
            size,
            font: boldFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= size + 1.5;
        }
      }
      return topY - block.height;
    }
    case 'paragraph': {
      if (block.pdfImage) {
        page.drawImage(block.pdfImage, {
          x: x + padX,
          y: topY - block.height + padY,
          width: maxWidth - padX * 2,
          height: block.height - padY * 2,
        });
      } else {
        let y = topY - padY - bodySize;
        for (const line of block.lines) {
          if (line) {
            page.drawText(line, {
              x: x + padX,
              y,
              size: bodySize,
              font: bodyFont,
              color: rgb(0.12, 0.12, 0.12),
            });
          }
          y -= LINE_HEIGHT;
        }
      }
      return topY - block.height;
    }
    case 'quote': {
      page.drawRectangle({
        x,
        y: topY - block.height,
        width: maxWidth,
        height: block.height,
        color: rgb(0.97, 0.97, 0.97),
        borderColor: rgb(0.75, 0.75, 0.75),
        borderWidth: 0.5,
      });
      page.drawRectangle({
        x,
        y: topY - block.height,
        width: 2.5,
        height: block.height,
        color: accentColor,
      });
      if (block.pdfImage) {
        page.drawImage(block.pdfImage, {
          x: x + padX,
          y: topY - block.height + padY,
          width: maxWidth - padX * 2,
          height: block.height - padY * 2,
        });
      } else {
        let y = topY - padY - bodySize;
        for (const line of block.lines) {
          page.drawText(line, {
            x: x + padX,
            y,
            size: bodySize,
            font: bodyFont,
            color: rgb(0.35, 0.35, 0.35),
          });
          y -= LINE_HEIGHT;
        }
      }
      return topY - block.height;
    }
    case 'math': {
      const boxX = x;
      const boxY = topY - block.height;
      const boxW = maxWidth;
      const boxH = block.height;
      page.drawRectangle({
        x: boxX,
        y: boxY,
        width: boxW,
        height: boxH,
        color: rgb(0.98, 0.98, 1),
      });
      if (block.pdfImage) {
        const imgW = boxW - MATH_BOX_PAD * 2;
        const dims = block.pdfImage.scale(imgW / block.pdfImage.width);
        const imgH = Math.min(dims.height, boxH - MATH_BOX_PAD * 2);
        page.drawImage(block.pdfImage, {
          x: boxX + MATH_BOX_PAD,
          y: boxY + (boxH - imgH) / 2,
          width: imgW,
          height: imgH,
        });
      } else {
        let y = boxY + boxH - MATH_BOX_PAD - bodySize;
        for (const line of block.lines) {
          page.drawText(line, {
            x: boxX + MATH_BOX_PAD,
            y,
            size: bodySize,
            font: bodyFont,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= LINE_HEIGHT;
        }
      }
      return topY - block.height;
    }
    case 'code': {
      page.drawRectangle({
        x,
        y: topY - block.height,
        width: maxWidth,
        height: block.height,
        color: rgb(0.12, 0.14, 0.18),
        borderColor: rgb(0.12, 0.14, 0.18),
        borderWidth: 0.5,
      });
      if (block.pdfImage) {
        page.drawImage(block.pdfImage, {
          x: x + padX,
          y: topY - block.height + padY,
          width: maxWidth - padX * 2,
          height: block.height - padY * 2,
        });
      } else {
        let y = topY - padY - bodySize;
        for (const line of block.lines) {
          page.drawText(line, {
            x: x + padX,
            y,
            size: bodySize,
            font: bodyFont,
            color: rgb(0.95, 0.95, 0.95),
          });
          y -= LINE_HEIGHT;
        }
      }
      return topY - block.height;
    }
    case 'divider': {
      page.drawLine({
        start: { x: x + padX, y: topY - block.height / 2 },
        end: { x: x + maxWidth - padX, y: topY - block.height / 2 },
        thickness: 0.5,
        color: rgb(0.82, 0.82, 0.82),
      });
      return topY - block.height;
    }
    case 'toggle': {
      if (block.pdfImage) {
        page.drawImage(block.pdfImage, {
          x: x + padX,
          y: topY - block.height + padY,
          width: maxWidth - padX * 2,
          height: block.height - padY * 2,
        });
      } else {
        page.drawText('>', {
          x: x + padX,
          y: topY - padY - bodySize,
          size: bodySize,
          font: boldFont,
          color: rgb(0.5, 0.5, 0.5),
        });
        let y = topY - padY - bodySize;
        for (const line of block.lines) {
          page.drawText(line, {
            x: x + padX + 10,
            y,
            size: bodySize,
            font: bodyFont,
            color: rgb(0.12, 0.12, 0.12),
          });
          y -= LINE_HEIGHT;
        }
      }
      return topY - block.height;
    }
    case 'list': {
      let y = topY - padY;
      for (const item of block.items) {
        if (block.kind === 'checklist') {
          const boxSize = 8;
          const boxX = x + padX;
          const boxY = y - 8;
          page.drawRectangle({
            x: boxX,
            y: boxY,
            width: boxSize,
            height: boxSize,
            borderColor: rgb(0.3, 0.3, 0.3),
            borderWidth: 0.8,
            color: rgb(1, 1, 1),
          });
          if (item.checked) {
            page.drawLine({
              start: { x: boxX + 1.8, y: boxY + 1.8 },
              end: { x: boxX + boxSize - 1.8, y: boxY + boxSize - 1.8 },
              thickness: 1.2,
              color: rgb(0.15, 0.15, 0.15),
            });
            page.drawLine({
              start: { x: boxX + 1.8, y: boxY + boxSize - 1.8 },
              end: { x: boxX + boxSize - 1.8, y: boxY + 1.8 },
              thickness: 1.2,
              color: rgb(0.15, 0.15, 0.15),
            });
          }
        } else {
          page.drawText(item.label, {
            x: x + padX,
            y: y - bodySize,
            size: bodySize,
            font: bodyFont,
            color: rgb(0.2, 0.2, 0.2),
          });
        }

        const textX = block.kind === 'checklist' ? x + padX + 14 : x + padX + 10;
        if (item.pdfImage) {
          page.drawImage(item.pdfImage, {
            x: textX,
            y: y - item.height + 2,
            width: maxWidth - (block.kind === 'checklist' ? 18 : 10) - 4,
            height: item.height - 2,
          });
        } else {
          let textY = y - bodySize;
          for (const line of item.lines) {
            page.drawText(line, {
              x: textX,
              y: textY,
              size: bodySize,
              font: bodyFont,
              color: rgb(0.12, 0.12, 0.12),
            });
            textY -= LINE_HEIGHT;
          }
        }

        y -= item.height + innerGap;
      }
      return topY - block.height;
    }
  }
}

function parseNoteBlocks(text: string): NoteBlock[] {
  const normalized = sanitizeForPdfText(text);
  const lines = normalized.split('\n');
  const blocks: NoteBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        collected.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', text: collected.join('\n') });
      continue;
    }

    if (trimmed === '$$') {
      const collected: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== '$$') {
        collected.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'math', text: collected.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length as 1 | 2 | 3,
        text: headingMatch[2],
      });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const collected: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith('>')) {
        collected.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ type: 'quote', text: collected.join('\n') });
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      index += 1;
      continue;
    }

    if (trimmed.startsWith('▸')) {
      blocks.push({ type: 'toggle', text: trimmed.slice(1).trim() });
      index += 1;
      continue;
    }

    const listMatch = trimmed.match(/^(\d+\.|-|\*)\s+(.*)$/);
    if (listMatch) {
      const ordered = /^\d+\./.test(listMatch[1]);
      const items: NoteListItem[] = [];
      let kind: 'bullet' | 'checklist' = 'bullet';

      while (index < lines.length) {
        const current = lines[index].trim();
        const currentMatch = current.match(/^(\d+\.|-|\*)\s+(.*)$/);
        if (!currentMatch || /^\d+\./.test(currentMatch[1]) !== ordered) break;

        const itemText = currentMatch[2];
        const checkedMatch = current.match(/^-+\s+\[([ xX])\]\s+(.*)$/);
        if (checkedMatch) {
          items.push({
            text: checkedMatch[2],
            checked: checkedMatch[1].toLowerCase() !== ' ',
          });
          kind = 'checklist';
        } else {
          items.push({ text: itemText });
        }

        index += 1;
      }

      blocks.push({ type: 'list', ordered, kind, items });
      continue;
    }

    const collected: string[] = [];
    while (index < lines.length) {
      const current = lines[index];
      const currentTrimmed = current.trim();
      if (!currentTrimmed) break;
      if (
        currentTrimmed.startsWith('```') ||
        currentTrimmed === '$$' ||
        currentTrimmed.startsWith('>') ||
        /^#{1,3}\s+/.test(currentTrimmed) ||
        /^---+$/.test(currentTrimmed) ||
        /^(\d+\.|-|\*)\s+/.test(currentTrimmed) ||
        currentTrimmed.startsWith('▸')
      ) {
        break;
      }

      collected.push(current);
      index += 1;
    }

    if (collected.length === 0) {
      collected.push(line);
      index += 1;
    }

    blocks.push({ type: 'paragraph', text: collected.join('\n') });
  }

  return blocks;
}

async function layoutNoteBlocks(
  pdfDoc: PDFDocument,
  blocks: NoteBlock[],
  bodyFont: PDFFont,
  boldFont: PDFFont,
  bodySize: number,
  maxWidth: number,
  mathImages: Map<number, PDFImage> = new Map()
): Promise<LayoutBlock[]> {
  const renderedBlocks: LayoutBlock[] = [];
  for (const [blockIndex, block] of blocks.entries()) {
    switch (block.type) {
      case 'heading': {
        const size = block.level === 1 ? 13 : block.level === 2 ? 11.5 : 10.5;
        if (canEncodeText(boldFont, block.text)) {
          const lines = wrapText(block.text, boldFont, size, maxWidth);
          renderedBlocks.push({
            type: 'heading',
            level: block.level,
            lines,
            pdfImage: null,
            height: Math.max(lines.length * (size + 2) + 6, size + 10),
          });
        } else {
          const png = await renderTextToPng(block.text, maxWidth, {
            fontSize: size,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontWeight: '700',
            lineHeight: size + 2,
            paddingX: TEXT_IMAGE_PAD_X,
            paddingY: TEXT_IMAGE_PAD_Y,
            textAlign: 'left',
            color: '#1a1a1a',
          });
          const image = png ? await pdfDoc.embedPng(png) : null;
          renderedBlocks.push({
            type: 'heading',
            level: block.level,
            lines: [],
            pdfImage: image,
            height: image ? Math.max(Math.round((image.height * (maxWidth / image.width))), size + 10) : Math.max(size + 10, size + 4),
          });
        }
        continue;
      }
      case 'paragraph': {
        if (canEncodeText(bodyFont, block.text)) {
          const lines = wrapTextMultiline(block.text, bodyFont, bodySize, maxWidth);
          renderedBlocks.push({
            type: 'paragraph',
            lines,
            pdfImage: null,
            height: Math.max(lines.length * LINE_HEIGHT + 10, LINE_HEIGHT + 10),
          });
        } else {
          const png = await renderTextToPng(block.text, maxWidth, {
            fontSize: bodySize,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: LINE_HEIGHT,
            paddingX: TEXT_IMAGE_PAD_X,
            paddingY: TEXT_IMAGE_PAD_Y,
            textAlign: 'left',
            color: '#1f1f1f',
          });
          const image = png ? await pdfDoc.embedPng(png) : null;
          renderedBlocks.push({
            type: 'paragraph',
            lines: [],
            pdfImage: image,
            height: image ? Math.max(Math.round(image.height * (maxWidth / image.width)), LINE_HEIGHT + 10) : LINE_HEIGHT + 10,
          });
        }
        continue;
      }
      case 'quote': {
        if (canEncodeText(bodyFont, block.text)) {
          const lines = wrapTextMultiline(block.text, bodyFont, bodySize, maxWidth - 8);
          renderedBlocks.push({
            type: 'quote',
            lines,
            pdfImage: null,
            height: Math.max(lines.length * LINE_HEIGHT + 12, LINE_HEIGHT + 12),
          });
        } else {
          const png = await renderTextToPng(block.text, maxWidth - 8, {
            fontSize: bodySize,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: LINE_HEIGHT,
            paddingX: TEXT_IMAGE_PAD_X,
            paddingY: TEXT_IMAGE_PAD_Y,
            textAlign: 'left',
            color: '#5a5a5a',
          });
          const image = png ? await pdfDoc.embedPng(png) : null;
          renderedBlocks.push({
            type: 'quote',
            lines: [],
            pdfImage: image,
            height: image ? Math.max(Math.round(image.height * ((maxWidth - 8) / image.width)), LINE_HEIGHT + 12) : LINE_HEIGHT + 12,
          });
        }
        continue;
      }
      case 'code': {
        if (canEncodeText(bodyFont, block.text)) {
          const lines = block.text.split('\n').map((line) => line || ' ');
          renderedBlocks.push({
            type: 'code',
            lines,
            pdfImage: null,
            height: Math.max(lines.length * LINE_HEIGHT + 12, LINE_HEIGHT + 12),
          });
        } else {
          const png = await renderTextToPng(block.text, maxWidth, {
            fontSize: bodySize,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            lineHeight: LINE_HEIGHT,
            paddingX: TEXT_IMAGE_PAD_X,
            paddingY: TEXT_IMAGE_PAD_Y,
            textAlign: 'left',
            color: '#f2f2f2',
          });
          const image = png ? await pdfDoc.embedPng(png) : null;
          renderedBlocks.push({
            type: 'code',
            lines: [],
            pdfImage: image,
            height: image ? Math.max(Math.round(image.height * (maxWidth / image.width)), LINE_HEIGHT + 12) : LINE_HEIGHT + 12,
          });
        }
        continue;
      }
      case 'math': {
        const pdfImage = mathImages.get(blockIndex) ?? null;
        if (pdfImage) {
          const innerWidth = maxWidth - MATH_BOX_PAD * 2;
          const scale = innerWidth / pdfImage.width;
          const imgH = Math.max(Math.round(pdfImage.height * scale), LINE_HEIGHT);
          renderedBlocks.push({ type: 'math', pdfImage, lines: [], height: imgH + MATH_BOX_PAD * 2 });
          continue;
        }
        const rendered = formatLatexForDisplay(block.text);
        const innerWidth = maxWidth - MATH_BOX_PAD * 2;
        const lines = wrapTextMultiline(rendered, bodyFont, bodySize, innerWidth);
        renderedBlocks.push({
          type: 'math',
          pdfImage: null,
          lines,
          height: Math.max(lines.length * LINE_HEIGHT + MATH_BOX_PAD * 2, LINE_HEIGHT + MATH_BOX_PAD * 2),
        });
        continue;
      }
      case 'divider':
        renderedBlocks.push({ type: 'divider', height: 10 });
        continue;
      case 'toggle': {
        if (canEncodeText(bodyFont, block.text)) {
          const lines = wrapTextMultiline(block.text, bodyFont, bodySize, maxWidth - 14);
          renderedBlocks.push({
            type: 'toggle',
            lines,
            pdfImage: null,
            height: Math.max(lines.length * LINE_HEIGHT + 6, LINE_HEIGHT + 6),
          });
        } else {
          const png = await renderTextToPng(block.text, maxWidth - 14, {
            fontSize: bodySize,
            fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            lineHeight: LINE_HEIGHT,
            paddingX: TEXT_IMAGE_PAD_X,
            paddingY: TEXT_IMAGE_PAD_Y,
            textAlign: 'left',
            color: '#1f1f1f',
          });
          const image = png ? await pdfDoc.embedPng(png) : null;
          renderedBlocks.push({
            type: 'toggle',
            lines: [],
            pdfImage: image,
            height: image ? Math.max(Math.round(image.height * ((maxWidth - 14) / image.width)), LINE_HEIGHT + 6) : LINE_HEIGHT + 6,
          });
        }
        continue;
      }
      case 'list': {
        const items: LayoutListItem[] = [];
        for (const [itemIndex, item] of block.items.entries()) {
          const textWidth = maxWidth - (block.kind === 'checklist' ? 18 : 10);
          if (canEncodeText(bodyFont, item.text)) {
            const lines = wrapTextMultiline(item.text, bodyFont, bodySize, textWidth);
            items.push({
              label: block.ordered ? `${itemIndex + 1}.` : '-',
              lines,
              pdfImage: null,
              checked: item.checked,
              height: Math.max(lines.length * LINE_HEIGHT + 1, LINE_HEIGHT + 1),
            });
          } else {
            const png = await renderTextToPng(item.text, textWidth, {
              fontSize: bodySize,
              fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
              lineHeight: LINE_HEIGHT,
              paddingX: TEXT_IMAGE_PAD_X,
              paddingY: TEXT_IMAGE_PAD_Y,
              textAlign: 'left',
              color: '#1f1f1f',
            });
            const image = png ? await pdfDoc.embedPng(png) : null;
            items.push({
              label: block.ordered ? `${itemIndex + 1}.` : '-',
              lines: [],
              pdfImage: image,
              checked: item.checked,
              height: image ? Math.max(Math.round(image.height * (textWidth / image.width)), LINE_HEIGHT + 1) : LINE_HEIGHT + 1,
            });
          }
        }
        renderedBlocks.push({
          type: 'list',
          ordered: block.ordered,
          kind: block.kind,
          items,
          height: items.reduce((sum, item) => sum + item.height, 0) + Math.max(0, (items.length - 1) * BLOCK_INNER_GAP) + 10,
        });
        continue;
      }
    }
  }
  return renderedBlocks;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
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

function wrapTextMultiline(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (!paragraph.trim()) {
      lines.push('');
      continue;
    }
    lines.push(...wrapText(paragraph, font, size, maxWidth));
  }
  return lines;
}

function sanitizeForPdfText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function sanitizeLineText(text: string): string {
  return sanitizeForPdfText(text)
    .replace(/[\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatLatexForDisplay(text: string): string {
  let rendered = sanitizeForPdfText(text).replace(/\r?\n/g, ' ');

  rendered = rendered.replace(/\\left/g, '').replace(/\\right/g, '');
  rendered = rendered.replace(/\\pm/g, '+/-');
  rendered = rendered.replace(/\\cdot/g, '*');
  rendered = rendered.replace(/\\times/g, 'x');
  rendered = rendered.replace(/\\div/g, '/');
  rendered = rendered.replace(/\\sqrt\{([^{}]+)\}/g, 'sqrt($1)');

  // Handle a few nested/common fractions by repeatedly applying the pattern.
  let previous = '';
  while (previous !== rendered) {
    previous = rendered;
    rendered = rendered.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1) / ($2)');
  }

  rendered = rendered.replace(/\^([a-zA-Z0-9]+)/g, '^$1');
  rendered = rendered.replace(/\\[a-zA-Z]+/g, ' ');
  rendered = rendered.replace(/[{}]/g, '');
  rendered = rendered.replace(/\s+/g, ' ').trim();

  return rendered;
}
