import './style.css';
import './cloud.css';
import { createGlobe } from './globe.js';
import { validateMoment, getMoments as getLocalMoments, replaceMoments, MAX_PHOTOS } from './storage.js';
import { cloudEnabled } from './config.js';
import * as cloud from './cloud.js';
import { localRepo, cloudRepo } from './data.js';
import { resizeToBlob, dataUrlToBlob, blobToDataUrl } from './images.js';
import { session, LOCAL_ATLAS, canEditMoment, canWrite } from './session.js';
import { showAuth, openHub, joinWithCode, loadAtlases } from './account-ui.js';
import { icon, esc, dateLabel, timeLabel, today, byId, latLabel, toast, friendlyError } from './ui.js';

const app = document.querySelector('#app');

app.innerHTML = `
  <div class="shell">
    <header class="masthead"><a class="brand" href="#" aria-label="Atlas der Erinnerungen, Startseite"><span class="brand-symbol">✳</span><span>atlas <i>der</i> erinnerungen</span></a><div class="masthead-actions"><span class="sync-pill" id="sync-pill" role="status" hidden></span><button class="text-button" id="about-button" type="button">Für unsere kleine Welt <span aria-hidden="true">↗</span></button></div></header>
    <main class="layout">
      <section class="story" aria-labelledby="page-title">
        <div class="edition"><span class="edition-line"></span> <span id="edition-text">UNSERE REISE</span> <span class="edition-dot">✦</span> <span id="edition-route"></span></div>
        <h1 id="page-title">Von hier<br>bis <em>ans Meer.</em></h1>
        <p class="lead" id="lead"></p>
        <div class="action-row"><button class="button button-primary" id="new-button" type="button">${icon('plus', 19)} Erinnerung festhalten</button><button class="button button-secondary" id="present-button" type="button">${icon('expand', 17)} Ansehen</button></div>
        <div class="timeline-heading"><div><span class="chapter-label">UNSER REISEBUCH</span><h2>Die Momente <span id="moment-count" class="count">00</span></h2></div></div>
        <div id="timeline" class="timeline" aria-live="polite"></div>
        <div class="utility"><button type="button" class="utility-button" id="export-button">${icon('download', 17)} Sicherung herunterladen</button><button type="button" class="utility-button" id="import-button">${icon('upload', 17)} Sicherung laden</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>
      </section>
      <section class="visual" id="visual" aria-label="Interaktiver Globus mit Reiseroute"><div class="map-top"><span class="map-overline">EINE REISE IN DREI WORTEN</span><span class="map-coordinates" id="map-coords"></span></div><div id="globe" class="globe"><div class="globe-fallback">Der 3D-Globus ist hier nicht verfügbar. Deine Erinnerungen kannst du trotzdem lesen und bearbeiten.</div><div id="labels" class="globe-labels" aria-hidden="true"><span class="place-label" data-globe-label><strong>BERLIN</strong><small>DER ANFANG</small></span><span class="place-label" data-globe-label><strong>PAPHOS</strong><small>DAS MEER</small></span></div></div><div class="map-bottom"><span class="map-route">${icon('compass', 19)} <span id="map-route-text"></span></span><span class="map-hint">Ziehen, um die Welt zu drehen</span><button id="reset-map" class="map-reset" type="button" aria-label="Globus zurücksetzen">↺</button></div><div class="map-corner" id="map-corner"></div></section>
    </main>
    <footer class="footer"><span>Mit Liebe gesammelt. Ein Moment nach dem anderen.</span><span id="footer-note"></span></footer>
  </div>
  <dialog id="editor" class="editor"><form id="moment-form" novalidate><div class="dialog-top"><span class="chapter-label">EINE SEITE FÜR IMMER</span><button type="button" class="icon-button" id="close-editor" aria-label="Schließen">${icon('close')}</button></div><h2 id="editor-title">Ein neuer Moment.</h2><p class="form-intro">Manchmal reicht ein einziger Satz, um einen ganzen Tag wiederzufinden.</p><label class="field"><span>Wie heißt dieser Moment?</span><input name="title" required maxlength="120" placeholder="Zum Beispiel: Unser erster Blick aufs Meer" autocomplete="off"></label><div class="field-grid"><label class="field"><span>Wann war das?</span><input name="date" required type="date"></label><label class="field"><span>Wo auf der Reise?</span><select name="place"></select></label></div><label class="field"><span>Was möchtest du erzählen?</span><textarea name="note" rows="5" maxlength="12000" placeholder="Was ist passiert? Wie hat es sich angefühlt?"></textarea></label><label class="photo-picker" for="photo-input">${icon('image', 20)} <span id="photo-label">Fotos hinzufügen (optional)</span><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden></label><div id="photo-preview" class="photo-grid" hidden></div><p id="form-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="button button-secondary" id="cancel-editor" type="button">Abbrechen</button><button class="button button-primary" id="save-button" type="submit">Erinnerung speichern ${icon('arrow', 18)}</button></div></form></dialog>
  <dialog id="presentation" class="presentation"><div class="presentation-shell"><div class="presentation-top"><span id="presentation-title">ATLAS DER ERINNERUNGEN</span><button class="icon-button" type="button" id="close-presentation" aria-label="Präsentation schließen">${icon('close')}</button></div><div id="presentation-content" class="presentation-content"></div><div class="presentation-bottom"><button class="presentation-nav" id="previous" type="button">${icon('back', 19)} Zurück</button><span id="presentation-progress"></span><button class="presentation-nav" id="next" type="button">Weiter ${icon('arrow', 19)}</button></div></div></dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

const globe = createGlobe(byId('globe'), byId('labels'));
let entries = [], selectedId = null, editingId = null, presentationIndex = 0, offline = false, pending = 0, reloadToken = 0, commentToken = 0, unsubscribe = null;
let draft = { kept: [], added: [], removed: [] };
let syncError = '', lastSyncToast = '';

const atlas = () => session.atlas ?? LOCAL_ATLAS;
const isCloud = () => Boolean(session.atlas && !session.atlas.local);
const midName = () => (isCloud() ? 'Unterwegs' : 'Über Europa');
const journeyPlace = position => position < .16 ? atlas().from.name : position > .84 ? atlas().to.name : midName();
const sorted = () => [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || ''));
const multiline = text => esc(text).replaceAll('\n', '<br>');

// ---------- atlas chrome ----------
function applyAtlas() {
  const a = atlas(), from = a.from.name, to = a.to.name;
  globe.setRoute({ from: a.from, to: a.to });
  byId('page-title').innerHTML = a.title ? esc(a.title) : 'Von hier<br>bis <em>ans Meer.</em>';
  document.title = a.title ? `${a.title} · Atlas der Erinnerungen` : 'Atlas der Erinnerungen · Berlin → Paphos';
  byId('lead').textContent = a.dedication || 'Ein Ort für alles, was wir unterwegs nicht vergessen wollen.';
  byId('edition-route').textContent = `${from} nach ${to}`.toUpperCase();
  byId('map-coords').textContent = `${latLabel(a.from.lat)} → ${latLabel(a.to.lat)}`;
  byId('map-route-text').innerHTML = `${esc(from.slice(0, 3).toUpperCase())} <span class="route-dash"></span> ${esc(to.slice(0, 3).toUpperCase())}`;
  byId('map-corner').innerHTML = `${esc(from.toUpperCase())} <span>✳</span> ${esc(to.toUpperCase())}`;
  byId('presentation-title').innerHTML = `ATLAS DER ERINNERUNGEN <span class="presentation-star">✳</span> ${esc(from.toUpperCase())} → ${esc(to.toUpperCase())}`;
  byId('visual').setAttribute('aria-label', `Interaktiver Globus mit Reiseroute ${from} nach ${to}`);
  byId('footer-note').textContent = isCloud() ? 'Privat gespeichert · nur Mitglieder dieses Atlas sehen die Fotos' : 'Nur auf diesem Gerät gespeichert · Sicherung für andere Geräte nutzen';
  const about = byId('about-button');
  about.innerHTML = isCloud() ? `${esc(a.title)} · Atlas &amp; Konto <span aria-hidden="true">↗</span>` : 'Für unsere kleine Welt <span aria-hidden="true">↗</span>';
  byId('export-button').hidden = !session.atlas && cloudEnabled;
  byId('import-button').hidden = !session.atlas && cloudEnabled;
  byId('import-button').lastChild.textContent = isCloud() ? ' Sicherung hinzufügen' : ' Sicherung laden';
  const select = byId('moment-form').elements.place;
  select.innerHTML = `<option value="0">${esc(from)}</option><option value="0.5">${esc(midName())}</option><option value="1">${esc(to)}</option>`;
  byId('new-button').disabled = !session.atlas && cloudEnabled || !canWrite();
}

function updateSync() {
  const pill = byId('sync-pill');
  pill.hidden = !(isCloud() && (offline || pending || syncError));
  pill.textContent = syncError ? `Synchronisierung hängt (${pending} wartend)` : offline ? (pending ? `Offline · ${pending} Änderung${pending > 1 ? 'en' : ''} warten` : 'Offline · zuletzt gespeicherter Stand') : 'Synchronisiert …';
  pill.classList.toggle('offline', offline || Boolean(syncError));
  pill.title = syncError;
}

// ---------- diary ----------
function photoMarkup(photo, title, className) {
  return photo.src ? `<img class="${className}" src="${esc(photo.src)}" alt="Foto zu ${esc(title)}" loading="lazy">` : `<div class="${className} photo-missing">Foto offline nicht verfügbar</div>`;
}

function refresh() {
  const list = sorted(), writable = Boolean(session.atlas || !cloudEnabled) && canWrite();
  byId('moment-count').textContent = String(list.length).padStart(2, '0');
  globe.setEntries(list, selectedId);
  if (!list.length) {
    const empty = !session.atlas && cloudEnabled
      ? '<h3>Noch kein Atlas.</h3><p>Lege deinen eigenen Atlas an oder tritt mit einem Einladungslink einem bei.</p>'
      : `<h3>Hier beginnt eure Geschichte.</h3><p>Noch ist alles offen. ${writable ? 'Halte den ersten Augenblick fest, dann wächst hier euer ganz persönliches Reisebuch.' : 'Sobald jemand die erste Erinnerung schreibt, erscheint sie hier.'}</p>${writable ? `<button class="empty-link" type="button" id="empty-add">Erste Erinnerung schreiben ${icon('arrow', 17)}</button>` : ''}`;
    byId('timeline').innerHTML = `<div class="empty-state"><span class="empty-illustration">✳</span>${empty}</div>`;
    byId('empty-add')?.addEventListener('click', () => openEditor());
    return;
  }
  if (!list.some(item => item.id === selectedId)) selectedId = list.at(-1).id;
  globe.setEntries(list, selectedId);
  const current = list.find(entry => entry.id === selectedId);
  const mayEdit = canEditMoment(current), mayDelete = mayEdit;
  const author = isCloud() && current.authorName ? ` · von ${esc(current.authorName)}` : '';
  byId('timeline').innerHTML = list.map((entry, i) => `<button type="button" class="moment-row ${entry.id === selectedId ? 'selected' : ''}" data-select="${esc(entry.id)}" aria-pressed="${entry.id === selectedId}"><span class="moment-index">${String(i + 1).padStart(2, '0')}</span><span class="moment-body"><span class="moment-meta">${esc(dateLabel(entry.date))} <span class="meta-dot">·</span> ${esc(journeyPlace(entry.position))}${entry.pending ? ' · wartet auf Sync' : ''}</span><strong>${esc(entry.title)}</strong></span><span class="moment-arrow">↗</span></button>`).join('') +
    `<article class="memory-detail"><div class="memory-detail-top"><span class="chapter-label">AUS UNSEREM ALBUM</span><div>${mayEdit ? `<button type="button" class="small-icon" id="edit-moment" aria-label="Erinnerung bearbeiten">${icon('pencil', 17)}</button>` : ''}${mayDelete ? `<button type="button" class="small-icon" id="delete-moment" aria-label="Erinnerung löschen">${icon('trash', 17)}</button>` : ''}</div></div>
    ${current.photos.length ? `<div class="memory-gallery count-${Math.min(current.photos.length, 4)}">${current.photos.map(photo => photoMarkup(photo, current.title, 'memory-photo')).join('')}</div>` : ''}
    <p class="memory-date">${esc(dateLabel(current.date))} · ${esc(journeyPlace(current.position))}${author}</p><h3>${esc(current.title)}</h3>
    ${current.note ? `<p class="memory-note">${multiline(current.note)}</p>` : '<p class="memory-note quiet">Noch keine Notiz. Du kannst sie jederzeit ergänzen.</p>'}
    ${isCloud() ? '<section class="comments" id="comments" aria-label="Kommentare"></section>' : ''}</article>`;
  byId('timeline').querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.select; refresh(); }));
  if (mayEdit) byId('edit-moment').onclick = () => {
    if (current.pending) return toast('Diese Erinnerung wird noch synchronisiert. Bitte versuche es gleich noch einmal.');
    openEditor(current);
  };
  if (mayDelete) byId('delete-moment').onclick = async () => {
    if (!confirm(`„${current.title}“ wirklich löschen? Dieser Schritt lässt sich nicht rückgängig machen.`)) return;
    try { const result = await session.repo.remove(current.id); selectedId = null; await reload(); toast(result.pending ? 'Gelöscht. Wird synchronisiert, sobald du online bist.' : 'Erinnerung gelöscht.'); }
    catch (error) { toast(friendlyError(error) || 'Löschen fehlgeschlagen. Bitte erneut versuchen.'); }
  };
  if (isCloud()) loadComments(current);
}

async function loadComments(moment) {
  const box = byId('comments'); if (!box) return;
  if (moment.pending) { box.innerHTML = '<p class="quiet">Kommentare gibt es, sobald die Erinnerung synchronisiert ist.</p>'; return; }
  const token = ++commentToken;
  try {
    const comments = await cloud.listComments(moment.id);
    if (token !== commentToken || !byId('comments')) return;
    box.innerHTML = `<h4>Kommentare${comments.length ? ` <span class="count">${comments.length}</span>` : ''}</h4>
      ${comments.map(item => `<div class="comment"><div><strong>${esc(item.authorName)}</strong><small>${esc(timeLabel(item.createdAt))}</small>${item.authorId === session.user.id || session.atlas.role === 'owner' ? `<button type="button" class="comment-delete" data-delete-comment="${esc(item.id)}" aria-label="Kommentar löschen">${icon('close', 14)}</button>` : ''}</div><p>${multiline(item.body)}</p></div>`).join('')}
      <form class="comment-form"><input name="body" maxlength="2000" required placeholder="Schreib etwas dazu …" aria-label="Kommentar schreiben" autocomplete="off"><button class="button button-secondary" type="submit">Senden</button></form>`;
    box.querySelectorAll('[data-delete-comment]').forEach(button => button.addEventListener('click', async () => {
      try { await cloud.deleteComment(button.dataset.deleteComment); loadComments(moment); } catch (error) { toast(friendlyError(error)); }
    }));
    box.querySelector('form').addEventListener('submit', async event => {
      event.preventDefault();
      const input = event.currentTarget.elements.body, body = input.value.trim(); if (!body) return;
      input.disabled = true;
      try { await cloud.addComment({ atlasId: session.atlas.id, momentId: moment.id, userId: session.user.id, body }); loadComments(moment); }
      catch (error) { toast(friendlyError(error)); input.disabled = false; }
    });
  } catch { if (token === commentToken && byId('comments')) byId('comments').innerHTML = '<p class="quiet">Kommentare sind gerade nicht verfügbar.</p>'; }
}

async function reload({ quiet = false } = {}) {
  if (!session.repo) { entries = []; refresh(); return; }
  const token = ++reloadToken;
  try {
    const result = await session.repo.list();
    if (token !== reloadToken) return;
    entries = result.moments; offline = result.offline; pending = result.pending; syncError = result.syncError || '';
    if (syncError && syncError !== lastSyncToast) toast(`Änderungen konnten nicht hochgeladen werden: ${syncError}`);
    lastSyncToast = syncError;
    updateSync(); refresh();
  } catch (error) {
    if (token !== reloadToken) return;
    if (!quiet) byId('timeline').innerHTML = `<p class="storage-error">${session.repo.mode === 'local' ? 'Der Gerätespeicher ist nicht verfügbar. Bitte öffne die Seite in einem normalen Browserfenster, damit Erinnerungen gespeichert werden können.' : esc(friendlyError(error))}</p>`;
    if (!quiet && session.repo.mode === 'local') byId('new-button').disabled = true;
  }
}

// ---------- editor ----------
function openEditor(entry = null) {
  editingId = entry?.id ?? null;
  draft = { kept: entry ? [...entry.photos] : [], added: [], removed: [] };
  const form = byId('moment-form'); form.reset();
  form.elements.title.value = entry?.title ?? '';
  form.elements.date.value = entry?.date ?? today();
  form.elements.place.value = String(entry?.position ?? .5);
  form.elements.note.value = entry?.note ?? '';
  byId('editor-title').textContent = entry ? 'Diesen Moment bewahren.' : 'Ein neuer Moment.';
  byId('form-error').hidden = true;
  renderDraft(); byId('editor').showModal(); form.elements.title.focus();
}

function renderDraft() {
  const total = draft.kept.length + draft.added.length;
  byId('photo-label').textContent = total >= MAX_PHOTOS ? `Höchstens ${MAX_PHOTOS} Fotos` : total ? 'Weitere Fotos hinzufügen' : 'Fotos hinzufügen (optional)';
  const grid = byId('photo-preview'); grid.hidden = !total;
  grid.innerHTML = [...draft.kept.map(photo => ({ ...photo, kind: 'kept' })), ...draft.added.map(photo => ({ ...photo, kind: 'added' }))]
    .map(photo => `<div class="thumb">${photo.src ? `<img src="${esc(photo.src)}" alt="Fotovorschau">` : '<span class="photo-missing">offline</span>'}<button type="button" data-remove-photo="${esc(photo.id)}" data-kind="${photo.kind}" aria-label="Foto entfernen">${icon('close', 14)}</button></div>`).join('');
  grid.querySelectorAll('[data-remove-photo]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.removePhoto;
    if (button.dataset.kind === 'kept') { draft.kept = draft.kept.filter(photo => photo.id !== id); draft.removed.push(id); }
    else { const gone = draft.added.find(photo => photo.id === id); if (gone) URL.revokeObjectURL(gone.src); draft.added = draft.added.filter(photo => photo.id !== id); }
    renderDraft();
  }));
}

function formError(message) { const el = byId('form-error'); el.textContent = message; el.hidden = !message; }
function closeEditor() { draft.added.forEach(photo => URL.revokeObjectURL(photo.src)); draft = { kept: [], added: [], removed: [] }; byId('editor').close(); }

byId('photo-input').onchange = async event => {
  const files = [...(event.target.files ?? [])]; event.target.value = '';
  formError('');
  for (const file of files) {
    if (draft.kept.length + draft.added.length >= MAX_PHOTOS) { formError(`Es passen höchstens ${MAX_PHOTOS} Fotos zu einer Erinnerung.`); break; }
    try { const blob = await resizeToBlob(file); draft.added.push({ id: crypto.randomUUID(), blob, src: URL.createObjectURL(blob) }); }
    catch (error) { formError(error.message); }
  }
  renderDraft();
};

byId('moment-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget;
  const title = form.elements.title.value.trim(), note = form.elements.note.value.trim();
  if (!title || !form.elements.date.value) return formError('Bitte Titel und Datum eintragen.');
  const old = entries.find(item => item.id === editingId);
  const moment = { id: editingId || crypto.randomUUID(), title, date: form.elements.date.value, note, position: Number(form.elements.place.value), createdAt: old?.createdAt || new Date().toISOString(), authorId: old?.authorId, authorName: old?.authorName, photos: draft.kept };
  if (!validateMoment({ id: moment.id, title, date: moment.date, note, position: moment.position })) return formError('Die Angaben sind zu lang oder ungültig.');
  const button = byId('save-button'); button.disabled = true; button.textContent = 'Speichert …';
  try {
    const result = await session.repo.save(moment, { added: draft.added, removed: draft.removed });
    if (result.errors?.length) throw new Error(result.errors[0]);
    selectedId = moment.id; closeEditor(); await reload();
    toast(result.pending ? 'Gespeichert. Wird synchronisiert, sobald du wieder online bist.' : isCloud() ? 'Gespeichert. Alle im Atlas sehen deine Erinnerung.' : 'Deine Erinnerung ist sicher auf diesem Gerät gespeichert.');
  } catch (error) { formError(isCloud() ? `Speichern fehlgeschlagen: ${friendlyError(error)}` : 'Speichern fehlgeschlagen. Prüfe den freien Speicherplatz und versuche es erneut.'); }
  finally { button.disabled = false; button.innerHTML = `Erinnerung speichern ${icon('arrow', 18)}`; }
};

byId('new-button').onclick = () => openEditor();
byId('close-editor').onclick = byId('cancel-editor').onclick = closeEditor;
byId('editor').addEventListener('cancel', event => { event.preventDefault(); closeEditor(); });
byId('reset-map').onclick = () => globe.focus();
byId('about-button').onclick = () => {
  if (isCloud() || (cloudEnabled && session.user)) openHub();
  else toast('Ein privates Reisetagebuch für Timo, Bia und euren Sohn.');
};

// ---------- backup: export / import ----------
async function toBackupRecord(moment) {
  const photos = [];
  for (const photo of moment.photos) {
    try {
      const dataUrl = photo.src?.startsWith('data:') ? photo.src : await blobToDataUrl(await (await fetch(photo.src)).blob());
      photos.push({ id: photo.id, dataUrl });
    } catch { /* photo not reachable (offline): skipped */ }
  }
  return { id: moment.id, title: moment.title, date: moment.date, note: moment.note, position: moment.position, createdAt: moment.createdAt, photo: photos[0]?.dataUrl ?? null, photos };
}

byId('export-button').onclick = async () => {
  toast('Sicherung wird erstellt …');
  try {
    const moments = await Promise.all(sorted().map(toBackupRecord));
    const payload = JSON.stringify({ format: 'atlas-der-erinnerungen', version: 1, exportedAt: new Date().toISOString(), atlas: isCloud() ? atlas().title : undefined, moments }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `atlas-der-erinnerungen-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Sicherung heruntergeladen. Bewahre sie gut auf.');
  } catch { toast('Die Sicherung konnte nicht erstellt werden.'); }
};

function normalizeBackup(records) {
  return records.map(record => ({
    id: record.id, title: record.title, date: record.date, note: record.note, position: Number(record.position), createdAt: record.createdAt,
    photos: record.photos?.length ? record.photos.map(photo => ({ id: photo.id, dataUrl: photo.dataUrl })) : record.photo ? [{ id: 'legacy', dataUrl: record.photo }] : []
  }));
}

async function readBackup(file) {
  if (file.size > 100 * 1024 * 1024) throw new Error('Die Sicherung ist zu groß.');
  const data = JSON.parse(await file.text());
  if (data.format !== 'atlas-der-erinnerungen' || data.version !== 1 || !Array.isArray(data.moments) || !data.moments.every(validateMoment) || new Set(data.moments.map(item => item.id)).size !== data.moments.length) throw new Error('Diese Datei ist keine gültige Atlas-Sicherung.');
  return normalizeBackup(data.moments);
}

// Cloud import: every record becomes a NEW moment in the current atlas (nothing is overwritten).
async function importIntoCloud(records) {
  let done = 0;
  for (const record of records) {
    const added = [];
    for (const photo of record.photos.slice(0, MAX_PHOTOS)) added.push({ id: crypto.randomUUID(), blob: await dataUrlToBlob(photo.dataUrl) });
    const result = await session.repo.save({ id: crypto.randomUUID(), title: record.title, date: record.date, note: record.note, position: record.position, createdAt: record.createdAt, photos: [] }, { added });
    if (result.errors?.length) throw new Error(result.errors[0]);
    toast(`Übertrage Erinnerungen … ${++done} von ${records.length}`);
  }
  await reload();
}

byId('import-button').onclick = () => byId('import-file').click();
byId('import-file').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    const records = await readBackup(file);
    if (isCloud()) {
      if (!canWrite()) throw new Error('In diesem Atlas darfst du nur lesen.');
      if (!confirm(`${records.length} Erinnerungen aus der Sicherung in den Atlas „${atlas().title}“ übernehmen? Bestehende Einträge bleiben unverändert.`)) return;
      await importIntoCloud(records); toast(`${records.length} Erinnerungen übernommen.`);
    } else {
      if (!confirm(`Sicherung mit ${records.length} Erinnerungen laden? Die ${entries.length} Erinnerungen auf diesem Gerät werden dabei ersetzt. Lade vorher bei Bedarf eine Sicherung herunter.`)) return;
      await replaceMoments(records); selectedId = null; await reload(); toast('Sicherung erfolgreich geladen.');
    }
  } catch (error) { toast(error.message || 'Sicherung konnte nicht geladen werden.'); }
  finally { event.target.value = ''; }
};

// One-time move of the old browser-only diary into the signed-in atlas.
async function offerLocalUpload({ force = false } = {}) {
  if (!isCloud() || !canWrite()) return;
  let local = [];
  try { local = normalizeBackup((await getLocalMoments()).filter(validateMoment)); } catch { return; }
  if (!local.length) { if (force) toast('Auf diesem Gerät liegen keine lokalen Erinnerungen.'); return; }
  const asked = localStorage.getItem('atlas.localOffered') === '1';
  if (asked && !force) return;
  localStorage.setItem('atlas.localOffered', '1');
  if (!confirm(`Auf diesem Gerät liegen ${local.length} Erinnerungen aus der Version ohne Konto. In den Atlas „${atlas().title}“ hochladen, damit alle Mitglieder sie sehen?`)) return;
  try {
    await importIntoCloud(local);
    toast(`${local.length} Erinnerungen sind jetzt im Atlas.`);
    if (confirm('Die lokale Kopie auf diesem Gerät jetzt löschen? (Sie ist nun im Atlas gesichert.)')) await replaceMoments([]);
  } catch (error) { toast(`Übertragung abgebrochen: ${friendlyError(error)}`); }
}

// ---------- presentation ----------
function showPresentation() {
  const list = sorted();
  if (!list.length) { toast('Schreibe zuerst eine Erinnerung, dann könnt ihr die Reise gemeinsam ansehen.'); return; }
  presentationIndex = Math.max(0, list.findIndex(item => item.id === selectedId));
  renderPresentation(); byId('presentation').showModal();
}
function renderPresentation() {
  const list = sorted(), entry = list[presentationIndex];
  if (!entry) return;
  byId('presentation-content').innerHTML = `<div class="presentation-copy"><span class="presentation-place">${esc(journeyPlace(entry.position))} <span>✳</span> ${esc(dateLabel(entry.date))}</span><h2>${esc(entry.title)}</h2><p>${entry.note ? multiline(entry.note) : 'Ein Moment, der bleibt.'}</p>${isCloud() && entry.authorName ? `<small class="presentation-author">von ${esc(entry.authorName)}</small>` : ''}</div>${entry.photos.length ? `<div class="presentation-image photos-${Math.min(entry.photos.length, 4)}">${entry.photos.map(photo => photoMarkup(photo, entry.title, 'presentation-photo')).join('')}</div>` : `<div class="presentation-art" aria-hidden="true"><span class="art-sun"></span><span class="art-horizon"></span><span class="art-caption">${esc(atlas().from.name)}  ·  ${esc(midName())}  ·  ${esc(atlas().to.name)}</span></div>`}`;
  byId('presentation-progress').textContent = `${presentationIndex + 1} / ${list.length}`;
  byId('previous').disabled = presentationIndex === 0; byId('next').disabled = presentationIndex === list.length - 1;
}
byId('present-button').onclick = showPresentation;
byId('close-presentation').onclick = () => byId('presentation').close();
byId('previous').onclick = () => { presentationIndex--; renderPresentation(); };
byId('next').onclick = () => { presentationIndex++; renderPresentation(); };
document.addEventListener('keydown', event => {
  if (!byId('presentation').open) return;
  if (event.key === 'ArrowRight' && presentationIndex < sorted().length - 1) { presentationIndex++; renderPresentation(); }
  if (event.key === 'ArrowLeft' && presentationIndex > 0) { presentationIndex--; renderPresentation(); }
});

// ---------- accounts & atlases ----------
async function selectAtlas(next) {
  if (!next) return;
  unsubscribe?.(); unsubscribe = null;
  session.atlas = next;
  try { localStorage.setItem('atlas.current', next.id); } catch { /* private mode */ }
  session.repo = cloudRepo({ atlasId: next.id, userId: session.user.id, userName: session.profile?.display_name });
  entries = []; selectedId = null; offline = false; pending = 0;
  applyAtlas(); updateSync(); refresh();
  await reload();
  unsubscribe = session.repo.subscribe(() => reload({ quiet: true }));
  offerLocalUpload();
}

function clearAtlas() {
  unsubscribe?.(); unsubscribe = null;
  session.atlas = null; session.repo = null; entries = []; selectedId = null; offline = false; pending = 0;
  applyAtlas(); updateSync(); refresh();
}

const lastUser = () => { try { return JSON.parse(localStorage.getItem('atlas.lastUser')); } catch { return null; } };
let enteringId = null;
async function enterApp(user) {
  if (enteringId === user.id) return;
  enteringId = user.id;
  session.user = { id: user.id, email: user.email };
  try { localStorage.setItem('atlas.lastUser', JSON.stringify(session.user)); } catch { /* private mode */ }
  try { session.profile = (await cloud.getProfile(user.id)) ?? { display_name: '' }; }
  catch { session.profile = { display_name: user.user_metadata?.display_name ?? '' }; }
  const invite = localStorage.getItem('atlas.pendingInvite');
  if (invite) {
    localStorage.removeItem('atlas.pendingInvite');
    try { const joined = await joinWithCode(invite); if (joined) toast(`Willkommen im Atlas „${joined.title}“.`); }
    catch (error) { toast(friendlyError(error)); }
  }
  if (session.atlas) return;
  try { await loadAtlases(); } catch (error) { toast(friendlyError(error)); }
  if (!session.atlases.length) { clearAtlas(); openHub(); return; }
  const saved = localStorage.getItem('atlas.current');
  await selectAtlas(session.atlases.find(item => item.id === saved) ?? session.atlases[0]);
}

session.handlers = {
  selectAtlas,
  reload: () => reload({ quiet: true }),
  importLocal: () => offerLocalUpload({ force: true }),
  afterLeave: async () => {
    session.atlas = null;
    if (session.atlases.length) await selectAtlas(session.atlases[0]);
    else { clearAtlas(); openHub(); }
  }
};

function captureInviteFromUrl() {
  const code = location.hash.match(/^#\/join\/([0-9a-f]{24})/i)?.[1];
  if (!code) return;
  try { localStorage.setItem('atlas.pendingInvite', code.toLowerCase()); } catch { /* private mode */ }
  history.replaceState(null, '', location.pathname + location.search);
}

async function startCloud() {
  captureInviteFromUrl();
  applyAtlas(); refresh();
  cloud.onAuthChange(async (event, current) => {
    if (event === 'PASSWORD_RECOVERY') { showAuth('recover'); return; }
    if (event === 'SIGNED_OUT') {
      session.user = null; session.profile = null; session.atlases = []; enteringId = null;
      try { localStorage.removeItem('atlas.lastUser'); } catch { /* private mode */ }
      clearAtlas(); showAuth('login'); return;
    }
    if (event === 'SIGNED_IN' && current?.user) {
      if (session.user?.id === current.user.id) { if (session.repo) reload({ quiet: true }); return; }  // back online after an offline start: upload the queue
      byId('auth-dialog')?.close();
      await enterApp(current.user);
    }
  });
  let current = null;
  try { current = await cloud.getSession(); } catch { /* offline with an unusable token: fall back to the last known user below */ }
  if (current?.user) await enterApp(current.user);
  else if (!navigator.onLine && lastUser()) await enterApp(lastUser());   // offline cold start: show the cached diary, queue edits
  else showAuth('login');
  window.addEventListener('online', () => reload({ quiet: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden && session.repo) reload({ quiet: true }); });
}

async function startLocal() {
  session.atlas = null; session.repo = localRepo();
  applyAtlas(); await reload();
}

// Installable web app (iPhone: Safari > Teilen > Zum Home-Bildschirm). Not used inside the native shell.
if ('serviceWorker' in navigator && import.meta.env.PROD && location.protocol.startsWith('http')) navigator.serviceWorker.register('/sw.js').catch(() => {});

if (cloudEnabled) startCloud();
else startLocal();
