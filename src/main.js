import './style.css';
import { createGlobe } from './globe.js';
import { getMoments, saveMoment, deleteMoment, replaceMoments, validateMoment } from './storage.js';

const icons = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 17v3h16v-3"/>',
  upload: '<path d="M12 16V4m-4 4 4-4 4 4M4 17v3h16v-3"/>',
  expand: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15 9-2 4-4 2 2-4 4-2Z"/>',
  pencil: '<path d="m15 5 4 4M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>'
};
const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
const journeyPlace = position => position < .16 ? 'Berlin' : position > .84 ? 'Paphos' : 'Über Europa';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const app = document.querySelector('#app');

app.innerHTML = `
  <div class="shell">
    <header class="masthead"><a class="brand" href="#" aria-label="Atlas der Erinnerungen, Startseite"><span class="brand-symbol">✳</span><span>atlas <i>der</i> erinnerungen</span></a><button class="text-button" id="about-button" type="button">Für unsere kleine Welt <span aria-hidden="true">↗</span></button></header>
    <main class="layout">
      <section class="story" aria-labelledby="page-title">
        <div class="edition"><span class="edition-line"></span> UNSERE REISE <span class="edition-dot">✦</span> BERLIN NACH PAPHOS</div>
        <h1 id="page-title">Von hier<br>bis <em>ans Meer.</em></h1>
        <p class="lead">Ein Ort für alles, was wir unterwegs nicht vergessen wollen. Für dich, für Bia und für die Geschichten, die noch kommen.</p>
        <div class="action-row"><button class="button button-primary" id="new-button" type="button">${icon('plus', 19)} Erinnerung festhalten</button><button class="button button-secondary" id="present-button" type="button">${icon('expand', 17)} Ansehen</button></div>
        <div class="timeline-heading"><div><span class="chapter-label">UNSER REISEBUCH</span><h2>Die Momente <span id="moment-count" class="count">00</span></h2></div></div>
        <div id="timeline" class="timeline" aria-live="polite"></div>
        <div class="utility"><button type="button" class="utility-button" id="export-button">${icon('download', 17)} Sicherung herunterladen</button><button type="button" class="utility-button" id="import-button">${icon('upload', 17)} Sicherung laden</button><input type="file" id="import-file" accept="application/json,.json" hidden></div>
      </section>
      <section class="visual" aria-label="Interaktiver Globus mit Flugroute Berlin nach Paphos"><div class="map-top"><span class="map-overline">EINE REISE IN DREI WORTEN</span><span class="map-coordinates">52°31′ N → 34°47′ N</span></div><div id="globe" class="globe"><div class="globe-fallback">Der 3D-Globus ist hier nicht verfügbar. Deine Erinnerungen kannst du trotzdem lesen und bearbeiten.</div><div id="labels" class="globe-labels" aria-hidden="true"><span class="place-label" data-globe-label><strong>BERLIN</strong><small>DER ANFANG</small></span><span class="place-label" data-globe-label><strong>PAPHOS</strong><small>DAS MEER</small></span></div></div><div class="map-bottom"><span class="map-route">${icon('compass', 19)} BER <span class="route-dash"></span> PFO</span><span class="map-hint">Ziehen, um die Welt zu drehen</span><button id="reset-map" class="map-reset" type="button" aria-label="Globus auf Europa zurücksetzen">↺</button></div><div class="map-corner">BERLIN <span>✳</span> PAPHOS</div></section>
    </main>
    <footer class="footer"><span>Mit Liebe gesammelt. Ein Moment nach dem anderen.</span><span>Nur auf diesem Gerät gespeichert · Sicherung für andere Geräte nutzen</span></footer>
  </div>
  <dialog id="editor" class="editor"><form id="moment-form" novalidate><div class="dialog-top"><span class="chapter-label">EINE SEITE FÜR IMMER</span><button type="button" class="icon-button" id="close-editor" aria-label="Schließen">${icon('close')}</button></div><h2 id="editor-title">Ein neuer Moment.</h2><p class="form-intro">Manchmal reicht ein einziger Satz, um einen ganzen Tag wiederzufinden.</p><label class="field"><span>Wie heißt dieser Moment?</span><input name="title" required maxlength="120" placeholder="Zum Beispiel: Unser erster Blick aufs Meer" autocomplete="off"></label><div class="field-grid"><label class="field"><span>Wann war das?</span><input name="date" required type="date"></label><label class="field"><span>Wo auf der Reise?</span><select name="place"><option value="0">Berlin</option><option value="0.5">Über Europa</option><option value="1">Paphos</option></select></label></div><label class="field"><span>Was möchtest du erzählen?</span><textarea name="note" rows="5" maxlength="12000" placeholder="Was ist passiert? Wie hat es sich angefühlt?"></textarea></label><label class="photo-picker" for="photo-input">${icon('image', 20)} <span id="photo-label">Ein Foto hinzufügen (optional)</span><input id="photo-input" type="file" accept="image/jpeg,image/png,image/webp" hidden></label><div id="photo-preview" class="photo-preview" hidden></div><p id="form-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button class="button button-secondary" id="cancel-editor" type="button">Abbrechen</button><button class="button button-primary" id="save-button" type="submit">Erinnerung speichern ${icon('arrow', 18)}</button></div></form></dialog>
  <dialog id="presentation" class="presentation"><div class="presentation-shell"><div class="presentation-top"><span>ATLAS DER ERINNERUNGEN <span class="presentation-star">✳</span> BERLIN → PAPHOS</span><button class="icon-button" type="button" id="close-presentation" aria-label="Präsentation schließen">${icon('close')}</button></div><div id="presentation-content" class="presentation-content"></div><div class="presentation-bottom"><button class="presentation-nav" id="previous" type="button">${icon('back', 19)} Zurück</button><span id="presentation-progress"></span><button class="presentation-nav" id="next" type="button">Weiter ${icon('arrow', 19)}</button></div></div></dialog>
  <div class="toast" id="toast" role="status" aria-live="polite"></div>`;

const byId = id => document.getElementById(id);
const globe = createGlobe(byId('globe'), byId('labels'));
let entries = [], selectedId = null, editingId = null, photo = null, presentationIndex = 0, toastTimer;
function sorted() { return [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || '').localeCompare(b.createdAt || '')); }
function toast(message) { const el = byId('toast'); el.textContent = message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 3500); }
function refresh() {
  const list = sorted();
  byId('moment-count').textContent = String(list.length).padStart(2, '0');
  globe.setEntries(list, selectedId);
  if (!list.length) {
    byId('timeline').innerHTML = `<div class="empty-state"><span class="empty-illustration">✳</span><h3>Hier beginnt eure Geschichte.</h3><p>Noch ist alles offen. Halte den ersten Augenblick fest, dann wächst hier euer ganz persönliches Reisebuch.</p><button class="empty-link" type="button" id="empty-add">Erste Erinnerung schreiben ${icon('arrow', 17)}</button></div>`;
    byId('empty-add').onclick = () => openEditor();
    return;
  }
  if (!list.some(item => item.id === selectedId)) selectedId = list.at(-1).id;
  globe.setEntries(list, selectedId);
  byId('timeline').innerHTML = list.map((entry, i) => `<button type="button" class="moment-row ${entry.id === selectedId ? 'selected' : ''}" data-select="${esc(entry.id)}" aria-pressed="${entry.id === selectedId}"><span class="moment-index">${String(i + 1).padStart(2, '0')}</span><span class="moment-body"><span class="moment-meta">${esc(dateLabel(entry.date))} <span class="meta-dot">·</span> ${journeyPlace(entry.position)}</span><strong>${esc(entry.title)}</strong></span><span class="moment-arrow">↗</span></button>`).join('');
  const current = list.find(entry => entry.id === selectedId);
  byId('timeline').insertAdjacentHTML('beforeend', `<article class="memory-detail"><div class="memory-detail-top"><span class="chapter-label">AUS UNSEREM ALBUM</span><div><button type="button" class="small-icon" id="edit-moment" aria-label="Erinnerung bearbeiten">${icon('pencil', 17)}</button><button type="button" class="small-icon" id="delete-moment" aria-label="Erinnerung löschen">${icon('trash', 17)}</button></div></div>${current.photo ? `<img class="memory-photo" src="${esc(current.photo)}" alt="Foto zu ${esc(current.title)}">` : ''}<p class="memory-date">${esc(dateLabel(current.date))} · ${journeyPlace(current.position)}</p><h3>${esc(current.title)}</h3>${current.note ? `<p class="memory-note">${esc(current.note).replaceAll('\n', '<br>')}</p>` : '<p class="memory-note quiet">Noch keine Notiz. Du kannst sie jederzeit ergänzen.</p>'}</article>`);
  byId('timeline').querySelectorAll('[data-select]').forEach(button => button.addEventListener('click', () => { selectedId = button.dataset.select; refresh(); }));
  byId('edit-moment').onclick = () => openEditor(current);
  byId('delete-moment').onclick = async () => {
    if (!confirm(`„${current.title}“ wirklich löschen? Dieser Schritt lässt sich nicht rückgängig machen.`)) return;
    try { await deleteMoment(current.id); entries = entries.filter(item => item.id !== current.id); selectedId = null; refresh(); toast('Erinnerung gelöscht.'); }
    catch { toast('Löschen fehlgeschlagen. Bitte erneut versuchen.'); }
  };
}
function openEditor(entry = null) {
  editingId = entry?.id ?? null; photo = entry?.photo ?? null;
  const form = byId('moment-form'); form.reset();
  form.elements.title.value = entry?.title ?? '';
  form.elements.date.value = entry?.date ?? today();
  form.elements.place.value = String(entry?.position ?? .5);
  form.elements.note.value = entry?.note ?? '';
  byId('editor-title').textContent = entry ? 'Diesen Moment bewahren.' : 'Ein neuer Moment.';
  byId('form-error').hidden = true;
  updatePhoto(); byId('editor').showModal(); form.elements.title.focus();
}
function updatePhoto() {
  byId('photo-label').textContent = photo ? 'Foto ersetzen' : 'Ein Foto hinzufügen (optional)';
  const preview = byId('photo-preview'); preview.hidden = !photo;
  preview.innerHTML = photo ? `<img src="${esc(photo)}" alt="Fotovorschau"><button type="button" id="remove-photo" aria-label="Foto entfernen">${icon('close', 15)} Foto entfernen</button>` : '';
  if (photo) byId('remove-photo').onclick = () => { photo = null; updatePhoto(); };
}
async function resizePhoto(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild wählen.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Das Foto darf höchstens 20 MB groß sein.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  return canvas.toDataURL('image/jpeg', .82);
}
byId('new-button').onclick = () => openEditor();
byId('close-editor').onclick = byId('cancel-editor').onclick = () => byId('editor').close();
byId('reset-map').onclick = () => globe.focus();
byId('about-button').onclick = () => toast('Ein privates Reisetagebuch für Timo, Bia und euren Sohn.');
byId('photo-input').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try { photo = await resizePhoto(file); updatePhoto(); }
  catch (error) { byId('form-error').textContent = error.message; byId('form-error').hidden = false; }
  event.target.value = '';
};
byId('moment-form').onsubmit = async event => {
  event.preventDefault(); const form = event.currentTarget;
  const title = form.elements.title.value.trim(); const note = form.elements.note.value.trim();
  if (!title || !form.elements.date.value) { byId('form-error').textContent = 'Bitte Titel und Datum eintragen.'; byId('form-error').hidden = false; return; }
  const old = entries.find(item => item.id === editingId);
  const entry = { id: editingId || crypto.randomUUID(), title, date: form.elements.date.value, note, position: Number(form.elements.place.value), photo, createdAt: old?.createdAt || new Date().toISOString() };
  if (!validateMoment(entry)) { byId('form-error').textContent = 'Die Angaben sind zu lang oder das Foto ist zu groß.'; byId('form-error').hidden = false; return; }
  const button = byId('save-button'); button.disabled = true; button.textContent = 'Speichert …';
  try { await saveMoment(entry); entries = [...entries.filter(item => item.id !== entry.id), entry]; selectedId = entry.id; byId('editor').close(); refresh(); toast('Deine Erinnerung ist sicher auf diesem Gerät gespeichert.'); }
  catch { byId('form-error').textContent = 'Speichern fehlgeschlagen. Prüfe den freien Speicherplatz und versuche es erneut.'; byId('form-error').hidden = false; }
  finally { button.disabled = false; button.innerHTML = `Erinnerung speichern ${icon('arrow', 18)}`; }
};
byId('export-button').onclick = () => {
  const payload = JSON.stringify({ format: 'atlas-der-erinnerungen', version: 1, exportedAt: new Date().toISOString(), moments: sorted() }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = `atlas-der-erinnerungen-${today()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  toast('Sicherung heruntergeladen. Bewahre sie gut auf.');
};
byId('import-button').onclick = () => byId('import-file').click();
byId('import-file').onchange = async event => {
  const file = event.target.files?.[0]; if (!file) return;
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('Die Sicherung ist zu groß.');
    const data = JSON.parse(await file.text());
    if (data.format !== 'atlas-der-erinnerungen' || data.version !== 1 || !Array.isArray(data.moments) || !data.moments.every(validateMoment) || new Set(data.moments.map(item => item.id)).size !== data.moments.length) throw new Error('Diese Datei ist keine gültige Atlas-Sicherung.');
    if (!confirm(`Sicherung mit ${data.moments.length} Erinnerungen laden? Die ${entries.length} Erinnerungen auf diesem Gerät werden dabei ersetzt. Lade vorher bei Bedarf eine Sicherung herunter.`)) return;
    await replaceMoments(data.moments); entries = data.moments; selectedId = null; refresh(); toast('Sicherung erfolgreich geladen.');
  } catch (error) { toast(error.message || 'Sicherung konnte nicht geladen werden.'); }
  finally { event.target.value = ''; }
};
function showPresentation() {
  const list = sorted();
  if (!list.length) { toast('Schreibe zuerst eine Erinnerung, dann könnt ihr die Reise gemeinsam ansehen.'); return; }
  presentationIndex = Math.max(0, list.findIndex(item => item.id === selectedId));
  renderPresentation(); byId('presentation').showModal();
}
function renderPresentation() {
  const list = sorted(), entry = list[presentationIndex];
  if (!entry) return;
  byId('presentation-content').innerHTML = `<div class="presentation-copy"><span class="presentation-place">${journeyPlace(entry.position)} <span>✳</span> ${esc(dateLabel(entry.date))}</span><h2>${esc(entry.title)}</h2><p>${entry.note ? esc(entry.note).replaceAll('\n', '<br>') : 'Ein Moment, der bleibt.'}</p></div>${entry.photo ? `<div class="presentation-image"><img src="${esc(entry.photo)}" alt="Foto zu ${esc(entry.title)}"></div>` : '<div class="presentation-art" aria-hidden="true"><span class="art-sun"></span><span class="art-horizon"></span><span class="art-caption">Berlin  ·  Europa  ·  Paphos</span></div>'}`;
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
try { entries = (await getMoments()).filter(validateMoment); refresh(); }
catch { byId('timeline').innerHTML = '<p class="storage-error">Der Gerätespeicher ist nicht verfügbar. Bitte öffne die Seite in einem normalen Browserfenster, damit Erinnerungen gespeichert werden können.</p>'; byId('new-button').disabled = true; }
