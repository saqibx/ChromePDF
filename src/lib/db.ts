import { DocumentRecord, Annotation, DocumentSessionState } from '../types';

const DB_NAME = 'chromepdf';
const DB_VERSION = 2;

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      if (!database.objectStoreNames.contains('documents')) {
        const docStore = database.createObjectStore('documents', { keyPath: 'id' });
        docStore.createIndex('name', 'name', { unique: false });
        docStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!database.objectStoreNames.contains('annotations')) {
        const annStore = database.createObjectStore('annotations', { keyPath: 'id' });
        annStore.createIndex('documentId', 'documentId', { unique: false });
        annStore.createIndex('pageNumber', 'pageNumber', { unique: false });
      }

      if (!database.objectStoreNames.contains('documentSessions')) {
        const sessionStore = database.createObjectStore('documentSessions', { keyPath: 'documentId' });
        sessionStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
}

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documents', 'readwrite');
    const store = tx.objectStore('documents');
    const request = store.put(doc);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getDocument(id: string): Promise<DocumentRecord | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const request = store.get(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documents', 'readonly');
    const store = tx.objectStore('documents');
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function saveDocumentSession(session: DocumentSessionState): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documentSessions', 'readwrite');
    const store = tx.objectStore('documentSessions');
    const request = store.put(session);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getDocumentSession(documentId: string): Promise<DocumentSessionState | undefined> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documentSessions', 'readonly');
    const store = tx.objectStore('documentSessions');
    const request = store.get(documentId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

export async function getAllDocumentSessions(): Promise<DocumentSessionState[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('documentSessions', 'readonly');
    const store = tx.objectStore('documentSessions');
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function deleteDocument(id: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(['documents', 'annotations'], 'readwrite');

    const docStore = tx.objectStore('documents');
    docStore.delete(id);

    const annStore = tx.objectStore('annotations');
    const index = annStore.index('documentId');
    const annRequest = index.openCursor(IDBKeyRange.only(id));

    annRequest.onsuccess = () => {
      const cursor = annRequest.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteAnnotationsForDocument(docId: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const index = store.index('documentId');
    const request = index.openCursor(IDBKeyRange.only(docId));

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveAnnotation(ann: Annotation): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.put(ann);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function getAnnotationsForDocument(docId: string): Promise<Annotation[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('annotations', 'readonly');
    const store = tx.objectStore('annotations');
    const index = store.index('documentId');
    const request = index.getAll(docId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || []);
  });
}

export async function deleteAnnotation(id: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const request = store.delete(id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
}

export async function updateAnnotationNote(id: string, noteText: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction('annotations', 'readwrite');
    const store = tx.objectStore('annotations');
    const getRequest = store.get(id);

    getRequest.onerror = () => reject(getRequest.error);
    getRequest.onsuccess = () => {
      const ann = getRequest.result as Annotation;
      if (ann && ann.type === 'highlight') {
        ann.noteText = noteText;
        ann.updatedAt = new Date().toISOString();
        const putRequest = store.put(ann);
        putRequest.onerror = () => reject(putRequest.error);
        putRequest.onsuccess = () => resolve();
      } else {
        resolve();
      }
    };
  });
}
