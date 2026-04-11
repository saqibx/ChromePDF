import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument } from 'pdf-lib';
import {
  PDFArray,
  PDFDict,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  PDFString,
  decodePDFRawStream,
} from 'pdf-lib/es/core';
import { Annotation } from '../types';

export const CHROMEPDF_WORKSPACE_FILENAME = 'chromepdf-workspace.json';
export const CHROMEPDF_SOURCE_FILENAME = 'chromepdf-original.pdf';
export const CHROMEPDF_WORKSPACE_VERSION = 1;

type WorkspacePayload = {
  app: 'ChromePDF';
  version: number;
  documentName?: string;
  annotations: Annotation[];
};

type WorkspaceImport = {
  sourcePdfBytes: ArrayBuffer;
  documentName?: string;
  annotations: Annotation[];
};

type ChromePdfInspection = {
  isChromePdf: boolean;
  hasCatalogMarker: boolean;
  hasKeywordMarker: boolean;
  hasWorkspaceField: boolean;
  hasOriginalField: boolean;
};

export function createWorkspacePayload(
  annotations: Annotation[],
  documentName?: string
): WorkspacePayload {
  return {
    app: 'ChromePDF',
    version: CHROMEPDF_WORKSPACE_VERSION,
    documentName,
    annotations,
  };
}

export async function inspectChromePdfMetadata(pdfBytes: ArrayBuffer): Promise<ChromePdfInspection> {
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const keywords = pdfDoc.getKeywords() ?? '';
  const hasKeywordMarker = keywords.includes('source:chromepdf');
  const workspacePayload = extractWorkspaceFromKeywords(keywords);
  const catalog = (pdfDoc as any).catalog as PDFDict;
  const sourceBytes = extractSourceBytesFromCatalog(catalog);

  return {
    isChromePdf: hasKeywordMarker,
    hasCatalogMarker: false,
    hasKeywordMarker,
    hasWorkspaceField: workspacePayload !== null,
    hasOriginalField: sourceBytes !== null,
  };
}

export async function extractChromePdfWorkspace(pdfBytes: ArrayBuffer): Promise<WorkspaceImport | null> {
  // Primary path: workspace JSON stored as base64 in keywords (reliable, no stream decoding)
  const primary = await extractViaKeywords(pdfBytes);
  if (primary) return primary;

  // Fallback: legacy pdfjs attachment scan (for any old-format exports)
  return extractViaPdfjsAttachments(pdfBytes);
}

async function extractViaKeywords(pdfBytes: ArrayBuffer): Promise<WorkspaceImport | null> {
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const keywords = pdfDoc.getKeywords() ?? '';
  if (!keywords.includes('source:chromepdf')) return null;

  const workspacePayload = extractWorkspaceFromKeywords(keywords);
  if (!workspacePayload) return null;

  // Get original PDF from embedded files
  const catalog = (pdfDoc as any).catalog as PDFDict;
  const sourceBytes = extractSourceBytesFromCatalog(catalog);

  if (!sourceBytes) return null;

  return {
    sourcePdfBytes: copyToArrayBuffer(sourceBytes),
    documentName: workspacePayload.documentName,
    annotations: workspacePayload.annotations,
  };
}

/**
 * Extract workspace payload from PDF keywords.
 * Format: "chromepdf-workspace:<base64-encoded-utf8-json>"
 */
function extractWorkspaceFromKeywords(keywords: string): WorkspacePayload | null {
  const match = keywords.match(/chromepdf-workspace:([A-Za-z0-9+/=]+)/);
  if (!match) return null;

  try {
    const bytes = base64ToUint8Array(match[1]);
    const json = new TextDecoder().decode(bytes);
    return parseWorkspaceJson(json);
  } catch {
    return null;
  }
}

/**
 * Extract original source PDF bytes from the embedded files in the PDF catalog.
 * The original PDF is stored as an embedded file attachment (FlateDecode compressed
 * by pdf-lib). We read the raw stream bytes and let pdfjs handle decompression
 * via the getAttachments() API in the fallback path.
 *
 * For the pdf-lib path, we try decodePDFRawStream which should decompress it,
 * and fall back to raw bytes + check the PDF header.
 */
function extractSourceBytesFromCatalog(catalog: PDFDict): Uint8Array | null {
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embeddedFiles = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const embeddedNames = embeddedFiles?.lookupMaybe(PDFName.of('Names'), PDFArray);

  if (!embeddedNames) return null;

  for (let index = 0; index < embeddedNames.size(); index += 2) {
    const fileNameObject = embeddedNames.lookup(index, PDFString, PDFHexString);
    const fileSpec = embeddedNames.lookup(index + 1, PDFDict);
    const fileName = normalizeAttachmentFilename(fileNameObject.decodeText());

    if (fileName === CHROMEPDF_SOURCE_FILENAME) {
      return extractEmbeddedFileContent(fileSpec);
    }
  }

  return null;
}

async function extractViaPdfjsAttachments(pdfBytes: ArrayBuffer): Promise<WorkspaceImport | null> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });

  try {
    const pdfDoc = await loadingTask.promise;
    const attachments = await pdfDoc.getAttachments();

    if (!attachments || Object.keys(attachments).length === 0) return null;

    const entries = Object.values(attachments)
      .map(toAttachmentCandidate)
      .filter((a): a is AttachmentCandidate => a !== null);

    // Look for the source PDF attachment
    const sourceEntry =
      entries.find((a) => a.filename === CHROMEPDF_SOURCE_FILENAME) ??
      entries.find((a) => looksLikePdfBytes(a.content)) ??
      null;

    if (!sourceEntry) return null;

    // Try to get workspace from the JSON attachment (may or may not be present
    // depending on export format version)
    const jsonEntry = entries.find((a) => a.filename === CHROMEPDF_WORKSPACE_FILENAME);
    if (!jsonEntry) return null;

    const workspacePayload = parseWorkspaceFromBytes(jsonEntry.content);
    if (!workspacePayload) return null;

    return {
      sourcePdfBytes: copyToArrayBuffer(sourceEntry.content),
      documentName: workspacePayload.documentName,
      annotations: workspacePayload.annotations,
    };
  } finally {
    await loadingTask.destroy();
  }
}

type AttachmentCandidate = {
  filename?: string;
  content: Uint8Array;
};

function toAttachmentCandidate(attachment: unknown): AttachmentCandidate | null {
  if (!attachment || typeof attachment !== 'object') return null;
  const candidate = attachment as { filename?: string; content?: Uint8Array | ArrayBuffer };

  if (candidate.content instanceof Uint8Array) {
    return { filename: normalizeAttachmentFilename(candidate.filename), content: candidate.content };
  }
  if (candidate.content instanceof ArrayBuffer) {
    return { filename: normalizeAttachmentFilename(candidate.filename), content: new Uint8Array(candidate.content) };
  }
  return null;
}

function parseWorkspaceFromBytes(bytes: Uint8Array): WorkspacePayload | null {
  try {
    return parseWorkspaceJson(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function parseWorkspaceJson(text: string): WorkspacePayload | null {
  try {
    const payload = JSON.parse(text) as WorkspacePayload;
    if (payload.app !== 'ChromePDF' || !Array.isArray(payload.annotations)) return null;
    return payload;
  } catch {
    return null;
  }
}

function looksLikePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
    bytes[3] === 0x46 && bytes[4] === 0x2d
  );
}

function normalizeAttachmentFilename(filename?: string): string | undefined {
  if (!filename) return undefined;
  return filename.replace(/\u0000/g, '').split(/[\\/]/).pop()?.trim();
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}

function extractEmbeddedFileContent(fileSpec: PDFDict): Uint8Array | null {
  const embeddedFiles = fileSpec.lookupMaybe(PDFName.of('EF'), PDFDict);
  if (!embeddedFiles) return null;

  const stream = embeddedFiles.lookupMaybe(PDFName.of('F'), PDFStream);
  if (!stream) return null;

  try {
    return decodePDFRawStream(stream as PDFRawStream).decode();
  } catch {
    // fall through
  }

  const flateLikeStream = stream as PDFStream & { getUnencodedContents?: () => Uint8Array };
  if (typeof flateLikeStream.getUnencodedContents === 'function') {
    try {
      return flateLikeStream.getUnencodedContents();
    } catch {
      // fall through
    }
  }

  return stream.getContents();
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
