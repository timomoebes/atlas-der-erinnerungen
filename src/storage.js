// Local IndexedDB. Three stores:
//  - moments: the local-only diary (MVP behaviour, used when no cloud is configured)
//  - cache:   last known cloud data per atlas, so the app opens offline
//  - outbox:  changes made without network, replayed in order when the connection is back
const DB_NAME = 'atlas-der-erinnerungen';
const STORE = 'moments';
const CACHE = 'cache';
const OUTBOX = 'outbox';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(OUTBOX)) db.createObjectStore(OUTBOX, { keyPath: 'seq', autoIncrement: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, operation, store = STORE) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const result = operation(tx.objectStore(store));
    tx.oncomplete = () => { db.close(); resolve(result.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Speichern abgebrochen')); };
  });
}

// ----- local diary -----
export function getMoments() { return transaction('readonly', store => store.getAll()); }
export function saveMoment(entry) { return transaction('readwrite', store => store.put(entry)); }
export function deleteMoment(id) { return transaction('readwrite', store => store.delete(id)); }
export function replaceMoments(entries) {
  return transaction('readwrite', store => {
    store.clear();
    for (const entry of entries) store.put(entry);
    return { result: entries.length };
  });
}

// ----- cloud cache -----
export function cacheGet(key) { return transaction('readonly', store => store.get(key), CACHE).then(row => row?.value ?? null); }
export function cachePut(key, value) { return transaction('readwrite', store => store.put({ key, value }), CACHE); }
export function cacheDelete(key) { return transaction('readwrite', store => store.delete(key), CACHE); }

// ----- outbox -----
export function outboxAll() { return transaction('readonly', store => store.getAll(), OUTBOX); }
export function outboxAdd(op) { return transaction('readwrite', store => store.add(op), OUTBOX); }
export function outboxRemove(seq) { return transaction('readwrite', store => store.delete(seq), OUTBOX); }
export function outboxClear() { return transaction('readwrite', store => store.clear(), OUTBOX); }

// ----- validation -----
const DATA_URL = /^data:image\/(jpeg|png|webp);base64,/;
export const MAX_PHOTOS = 8;

function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

export function validatePhoto(photo) {
  if (!photo || typeof photo.id !== 'string' || photo.id.length >= 100) return false;
  if (photo.dataUrl !== undefined) return typeof photo.dataUrl === 'string' && DATA_URL.test(photo.dataUrl) && photo.dataUrl.length < 8000000;
  return typeof photo.path === 'string' && photo.path.length > 0 && photo.path.length < 300 && !photo.path.includes('..');
}

export function validateMoment(entry) {
  return Boolean(entry) && typeof entry.id === 'string' && entry.id.length < 100 &&
    typeof entry.title === 'string' && entry.title.trim().length > 0 && entry.title.length <= 120 &&
    typeof entry.note === 'string' && entry.note.length <= 12000 &&
    validDate(entry.date) &&
    Number.isFinite(Number(entry.position)) && Number(entry.position) >= 0 && Number(entry.position) <= 1 &&
    (entry.photo === null || entry.photo === undefined || (typeof entry.photo === 'string' && DATA_URL.test(entry.photo) && entry.photo.length < 8000000)) &&
    (entry.photos === undefined || (Array.isArray(entry.photos) && entry.photos.length <= MAX_PHOTOS && entry.photos.every(validatePhoto)));
}
