const DB_NAME = 'atlas-der-erinnerungen';
const STORE = 'moments';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transaction(mode, operation) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = operation(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result.result); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Speichern abgebrochen')); };
  });
}

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

export function validateMoment(entry) {
  const dateValid = typeof entry?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    !Number.isNaN(Date.parse(`${entry.date}T12:00:00Z`)) &&
    new Date(`${entry.date}T12:00:00Z`).toISOString().slice(0, 10) === entry.date;
  return entry && typeof entry.id === 'string' && entry.id.length < 100 &&
    typeof entry.title === 'string' && entry.title.trim().length > 0 && entry.title.length <= 120 &&
    typeof entry.note === 'string' && entry.note.length <= 12000 &&
    dateValid &&
    Number.isFinite(Number(entry.position)) && Number(entry.position) >= 0 && Number(entry.position) <= 1 &&
    (entry.photo === null || entry.photo === undefined || (typeof entry.photo === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(entry.photo) && entry.photo.length < 8000000));
}
