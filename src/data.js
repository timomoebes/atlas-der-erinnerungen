// One repository interface, two implementations:
//   localRepo()  – the MVP behaviour: everything stays in this browser's IndexedDB
//   cloudRepo()  – Supabase, with an IndexedDB cache and an outbox for offline edits
// A "moment" as the UI sees it:
//   { id, title, date, note, position, authorId, authorName, createdAt, updatedAt, commentCount,
//     photos: [{ id, src?, path? }] }
import * as local from './storage.js';
import * as cloud from './cloud.js';
import { blobToDataUrl } from './images.js';

// ---------- local-only ----------
const fromLocal = record => ({
  id: record.id, title: record.title, date: record.date, note: record.note, position: Number(record.position),
  createdAt: record.createdAt || '', updatedAt: record.updatedAt || record.createdAt || '', authorId: null, authorName: '', commentCount: 0,
  photos: record.photos?.length ? record.photos.map(photo => ({ id: photo.id, src: photo.dataUrl })) : record.photo ? [{ id: 'legacy', src: record.photo }] : []
});

export function localRepo() {
  return {
    mode: 'local',
    async list() {
      const moments = (await local.getMoments()).filter(local.validateMoment).map(fromLocal);
      return { moments, offline: false, pending: 0 };
    },
    async save(moment, { added = [], removed = [] } = {}) {
      const kept = moment.photos.filter(photo => !removed.includes(photo.id)).map(photo => ({ id: photo.id, dataUrl: photo.src }));
      const fresh = await Promise.all(added.map(async photo => ({ id: photo.id, dataUrl: await blobToDataUrl(photo.blob) })));
      const record = {
        id: moment.id, title: moment.title, date: moment.date, note: moment.note, position: moment.position,
        createdAt: moment.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), photos: [...kept, ...fresh]
      };
      if (!local.validateMoment(record)) throw new Error('Die Angaben sind zu lang oder ein Foto ist zu groß.');
      await local.saveMoment(record);
      return { pending: 0 };
    },
    async remove(id) { await local.deleteMoment(id); return { pending: 0 }; },
    async flush() { return { pending: 0, errors: [] }; },
    subscribe() { return () => {}; },
    async exportAll() { return (await this.list()).moments; }
  };
}

// ---------- cloud ----------
const cacheKey = atlasId => `atlas:${atlasId}`;
// The Supabase SDK retries failed requests with back-off (several seconds). When the device knows it is offline, do not even try.
const deviceOnline = () => typeof navigator === 'undefined' || navigator.onLine !== false;
const stripSrc = photos => photos.map(photo => ({ id: photo.id, path: photo.path }));

function overlay(moments, ops) {
  let result = [...moments];
  for (const op of ops) {
    if (op.kind === 'delete') result = result.filter(item => item.id !== op.momentId);
    if (op.kind === 'save') {
      const previous = result.find(item => item.id === op.moment.id);
      const photos = [...op.moment.photos, ...op.added.map(photo => ({ id: photo.id, src: URL.createObjectURL(photo.blob), pending: true }))];
      const merged = { ...previous, ...op.moment, photos, pending: true };
      result = previous ? result.map(item => item.id === merged.id ? merged : item) : [...result, merged];
    }
  }
  return result;
}

export function cloudRepo({ atlasId, userId, userName }) {
  let flushing = null;

  async function runFlush() {
    const errors = [];
    let stuck = '';
    const queued = () => local.outboxAll().then(all => all.filter(op => op.atlasId === atlasId));
    if (!deviceOnline()) return { pending: (await queued()).length, errors, stuck: '' };
    if ((await queued()).length && !(await cloud.hasSession())) return { pending: (await queued()).length, errors, stuck: 'Bitte melde dich erneut an, damit deine Änderungen hochgeladen werden.' };
    for (const op of await queued()) {
      try {
        if (op.kind === 'save') await cloud.saveMoment({ atlasId, userId, moment: op.moment, added: op.added, removed: op.removed });
        else await cloud.deleteMoment(op.momentId);
        await local.outboxRemove(op.seq);
      } catch (error) {
        if (cloud.isNetworkError(error)) break;                 // offline: try again later
        if (cloud.isPermanentError(error)) {                    // e.g. no permission: retrying can never work
          errors.push(error.message || 'Unbekannter Fehler');
          await local.outboxRemove(op.seq);
          continue;
        }
        stuck = error.message || 'Synchronisierung fehlgeschlagen';  // transient/unknown: keep the change, keep order
        break;
      }
    }
    return { pending: (await queued()).length, errors, stuck };
  }

  return {
    mode: 'cloud',
    flush() { return flushing ??= runFlush().finally(() => { flushing = null; }); },

    async list() {
      const flushed = await this.flush();
      const ops = (await local.outboxAll()).filter(op => op.atlasId === atlasId);
      let moments, offline = false;
      try {
        if (!deviceOnline()) throw new TypeError('offline');
        moments = await cloud.listMoments(atlasId);
        await local.cachePut(cacheKey(atlasId), moments);
        const urls = await cloud.signUrls(moments.flatMap(item => item.photos.map(photo => photo.path)));
        for (const item of moments) for (const photo of item.photos) photo.src = urls.get(photo.path);
      } catch (error) {
        if (!cloud.isNetworkError(error)) throw error;
        moments = (await local.cacheGet(cacheKey(atlasId))) ?? [];
        offline = true;
      }
      return { moments: overlay(moments, ops), offline, pending: ops.length, syncError: flushed.stuck || flushed.errors[0] || '' };
    },

    async save(moment, { added = [], removed = [] } = {}) {
      const record = {
        id: moment.id, title: moment.title, date: moment.date, note: moment.note, position: moment.position,
        authorId: moment.authorId ?? userId, authorName: moment.authorName || userName || '', createdAt: moment.createdAt || new Date().toISOString(),
        photos: stripSrc(moment.photos.filter(photo => !removed.includes(photo.id)))
      };
      if (!local.validateMoment(record)) throw new Error('Die Angaben sind zu lang oder ungültig.');
      await local.outboxAdd({ kind: 'save', atlasId, moment: record, added, removed });
      return this.flush();
    },

    async remove(momentId) {
      await local.outboxAdd({ kind: 'delete', atlasId, momentId });
      return this.flush();
    },

    subscribe(onChange) { return cloud.subscribeAtlas(atlasId, onChange); },
    async exportAll() { return (await this.list()).moments; }
  };
}
