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
  const catalog = (pdfDoc as any).catalog as PDFDict;
  const keywords = pdfDoc.getKeywords() ?? '';
  const hasKeywordMarker = keywords.includes('source:chromepdf');
  const embeddedFiles = extractEmbeddedChromePdfFiles(catalog);
  const hasWorkspaceField = embeddedFiles.workspacePayload !== null;
  const hasOriginalField = embeddedFiles.sourceBytes !== null;

  return {
    isChromePdf: hasKeywordMarker,
    hasCatalogMarker: false,
    hasKeywordMarker,
    hasWorkspaceField,
    hasOriginalField,
  };
}

export async function extractChromePdfWorkspace(pdfBytes: ArrayBuffer): Promise<WorkspaceImport | null> {
  const directWorkspace = await extractChromePdfWorkspaceWithPdfLib(pdfBytes);
  if (directWorkspace) {
    return directWorkspace;
  }

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice(0) });

  try {
    const pdfDoc = await loadingTask.promise;
    const attachments = await pdfDoc.getAttachments();

    if (!attachments) return null;

    const attachmentEntries = Object.values(attachments)
      .map((attachment) => toAttachmentCandidate(attachment))
      .filter((attachment): attachment is AttachmentCandidate => attachment !== null);

    const workspacePayload = findWorkspacePayload(attachmentEntries);
    const sourceAttachment = findSourceAttachment(attachmentEntries);

    if (!workspacePayload || !sourceAttachment) {
      return null;
    }

    return {
      sourcePdfBytes: copyToArrayBuffer(sourceAttachment.content),
      documentName: workspacePayload.documentName,
      annotations: workspacePayload.annotations,
    };
  } finally {
    await loadingTask.destroy();
  }
}

async function extractChromePdfWorkspaceWithPdfLib(pdfBytes: ArrayBuffer): Promise<WorkspaceImport | null> {
  const pdfDoc = await PDFDocument.load(pdfBytes.slice(0), { ignoreEncryption: true });
  const catalog = (pdfDoc as any).catalog as PDFDict;
  const keywords = pdfDoc.getKeywords() ?? '';
  if (!keywords.includes('source:chromepdf')) return null;

  const embeddedFiles = extractEmbeddedChromePdfFiles(catalog);
  const workspacePayload = embeddedFiles.workspacePayload;
  const sourceBytes = embeddedFiles.sourceBytes;

  if (!workspacePayload || !sourceBytes) {
    return null;
  }

  return {
    sourcePdfBytes: copyToArrayBuffer(sourceBytes),
    documentName: workspacePayload.documentName,
    annotations: workspacePayload.annotations,
  };
}

function extractEmbeddedChromePdfFiles(catalog: PDFDict): {
  workspacePayload: WorkspacePayload | null;
  sourceBytes: Uint8Array | null;
} {
  const names = catalog.lookupMaybe(PDFName.of('Names'), PDFDict);
  const embeddedFiles = names?.lookupMaybe(PDFName.of('EmbeddedFiles'), PDFDict);
  const embeddedNames = embeddedFiles?.lookupMaybe(PDFName.of('Names'), PDFArray);

  if (!embeddedNames) {
    return { workspacePayload: null, sourceBytes: null };
  }

  let workspacePayload: WorkspacePayload | null = null;
  let sourceBytes: Uint8Array | null = null;

  for (let index = 0; index < embeddedNames.size(); index += 2) {
    const fileNameObject = embeddedNames.lookup(index, PDFString, PDFHexString);
    const fileSpec = embeddedNames.lookup(index + 1, PDFDict);
    const fileName = normalizeAttachmentFilename(fileNameObject.decodeText());
    const content = extractEmbeddedFileContent(fileSpec);

    if (!content) continue;

    if (!workspacePayload && fileName === CHROMEPDF_WORKSPACE_FILENAME) {
      workspacePayload = tryParseWorkspacePayload(content);
      continue;
    }

    if (!sourceBytes && fileName === CHROMEPDF_SOURCE_FILENAME) {
      sourceBytes = content;
    }
  }

  return { workspacePayload, sourceBytes };
}

type AttachmentCandidate = {
  filename?: string;
  content: Uint8Array;
};

function toAttachmentCandidate(attachment: unknown): AttachmentCandidate | null {
  if (!attachment || typeof attachment !== 'object') return null;

  const candidate = attachment as { filename?: string; content?: Uint8Array | ArrayBuffer };

  if (candidate.content instanceof Uint8Array) {
    return {
      filename: normalizeAttachmentFilename(candidate.filename),
      content: candidate.content,
    };
  }

  if (candidate.content instanceof ArrayBuffer) {
    return {
      filename: normalizeAttachmentFilename(candidate.filename),
      content: new Uint8Array(candidate.content),
    };
  }

  return null;
}

function findWorkspacePayload(attachments: AttachmentCandidate[]): WorkspacePayload | null {
  const filenameMatch = attachments.find((attachment) => attachment.filename === CHROMEPDF_WORKSPACE_FILENAME);

  if (filenameMatch) {
    const payload = tryParseWorkspacePayload(filenameMatch.content);
    if (payload) return payload;
  }

  for (const attachment of attachments) {
    const payload = tryParseWorkspacePayload(attachment.content);
    if (payload) return payload;
  }

  return null;
}

function findSourceAttachment(attachments: AttachmentCandidate[]): AttachmentCandidate | null {
  const filenameMatch = attachments.find((attachment) => attachment.filename === CHROMEPDF_SOURCE_FILENAME);
  if (filenameMatch) return filenameMatch;

  return attachments.find((attachment) => looksLikePdfBytes(attachment.content)) ?? null;
}

function tryParseWorkspacePayload(bytes: Uint8Array): WorkspacePayload | null {
  try {
    return tryParseWorkspacePayloadFromText(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

function tryParseWorkspacePayloadFromText(text: string): WorkspacePayload | null {
  try {
    const payload = JSON.parse(text) as WorkspacePayload;
    if (payload.app !== 'ChromePDF' || !Array.isArray(payload.annotations)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function looksLikePdfBytes(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

function normalizeAttachmentFilename(filename?: string): string | undefined {
  if (!filename) return undefined;

  return filename
    .replace(/\u0000/g, '')
    .split(/[\\/]/)
    .pop()
    ?.trim();
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

  if (stream instanceof PDFRawStream) {
    return decodePDFRawStream(stream).decode();
  }

  const flateLikeStream = stream as PDFStream & { getUnencodedContents?: () => Uint8Array };
  if (typeof flateLikeStream.getUnencodedContents === 'function') {
    return flateLikeStream.getUnencodedContents();
  }

  return stream.getContents();
}
