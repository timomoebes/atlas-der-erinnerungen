// Login, atlas switcher, members and invitations, account settings.
import * as cloud from './cloud.js';
import { cachePut, cacheGet, cacheDelete, outboxAll, outboxClear } from './storage.js';
import { session, ROLE_LABEL } from './session.js';
import { PLACES, findPlace } from './places.js';
import { routeDistance } from './globe.js';
import { icon, esc, byId, makeDialog, showError, friendlyError, toast } from './ui.js';

// ---------- atlas list (with offline fallback) ----------
export async function loadAtlases() {
  const key = `atlases:${session.user.id}`;
  try {
    session.atlases = await cloud.listAtlases(session.user.id);
    await cachePut(key, session.atlases);
  } catch (error) {
    if (!cloud.isNetworkError(error)) throw error;
    session.atlases = (await cacheGet(key)) ?? [];
  }
  return session.atlases;
}

export async function joinWithCode(input) {
  const code = String(input).match(/[0-9a-f]{24}/i)?.[0]?.toLowerCase();
  if (!code) throw new Error('Das sieht nicht wie ein Einladungscode aus.');
  const atlasId = await cloud.redeemInvite(code);
  await loadAtlases();
  const atlas = session.atlases.find(item => item.id === atlasId);
  if (atlas) await session.handlers.selectAtlas(atlas);
  return atlas;
}

// ---------- sign in / register ----------
const AUTH_COPY = {
  login: { eyebrow: 'WILLKOMMEN ZURÜCK', title: 'Anmelden.', intro: 'Mit deinem Konto siehst du die Erinnerungen deiner Familie auf jedem Gerät.', submit: 'Anmelden' },
  register: { eyebrow: 'NEU HIER', title: 'Konto anlegen.', intro: 'Ein Konto pro Person. Gemeinsame Atlanten teilt ihr später per Einladungslink.', submit: 'Konto anlegen' },
  reset: { eyebrow: 'PASSWORT VERGESSEN', title: 'Neues Passwort.', intro: 'Wir schicken dir einen Link zum Zurücksetzen per E-Mail.', submit: 'Link senden' },
  recover: { eyebrow: 'FAST GESCHAFFT', title: 'Neues Passwort wählen.', intro: 'Wähle ein neues Passwort für dein Konto.', submit: 'Passwort speichern' }
};

export function showAuth(initialMode = 'login') {
  let mode = initialMode;
  const dialog = makeDialog('auth-dialog', '', { dismissible: false });
  dialog.dataset.keep = '1';
  const render = (notice = '') => {
    const copy = AUTH_COPY[mode];
    dialog.innerHTML = `<form id="auth-form" novalidate>
      <div class="dialog-top"><span class="chapter-label">${copy.eyebrow}</span></div>
      <h2>${copy.title}</h2><p class="form-intro">${copy.intro}</p>
      ${mode === 'register' ? '<label class="field"><span>Wie sollen wir dich nennen?</span><input name="name" maxlength="60" autocomplete="name" placeholder="Zum Beispiel: Timo"></label>' : ''}
      ${mode !== 'recover' ? '<label class="field"><span>E-Mail</span><input name="email" type="email" required autocomplete="email" inputmode="email" autocapitalize="none"></label>' : ''}
      ${mode === 'login' || mode === 'register' || mode === 'recover' ? `<label class="field"><span>${mode === 'recover' ? 'Neues Passwort' : 'Passwort'}</span><input name="password" type="password" required minlength="8" autocomplete="${mode === 'login' ? 'current-password' : 'new-password'}" placeholder="Mindestens 8 Zeichen"></label>` : ''}
      <p class="form-notice" id="auth-notice" ${notice ? '' : 'hidden'}>${esc(notice)}</p>
      <p class="form-error" id="auth-error" role="alert" hidden></p>
      <div class="dialog-actions"><button class="button button-primary" id="auth-submit" type="submit">${copy.submit} ${icon('arrow', 18)}</button></div>
      <div class="auth-links">
        ${mode === 'login' ? '<button type="button" class="text-button" data-mode="register">Neu hier? Konto anlegen</button><button type="button" class="text-button" data-mode="reset">Passwort vergessen?</button>' : ''}
        ${mode === 'register' || mode === 'reset' ? '<button type="button" class="text-button" data-mode="login">Ich habe schon ein Konto</button>' : ''}
      </div></form>`;
    dialog.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { mode = button.dataset.mode; render(); }));
    dialog.querySelector('#auth-form').addEventListener('submit', submit);
    dialog.querySelector('input')?.focus();
  };
  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget, error = byId('auth-error'), button = byId('auth-submit');
    const value = name => form.elements[name]?.value.trim() ?? '';
    const email = value('email'), password = form.elements.password?.value ?? '';
    showError(error, '');
    if (mode !== 'recover' && !/^\S+@\S+\.\S+$/.test(email)) return showError(error, 'Bitte eine gültige E-Mail-Adresse eintragen.');
    if (['login', 'register', 'recover'].includes(mode) && password.length < 8) return showError(error, 'Das Passwort braucht mindestens 8 Zeichen.');
    if (mode === 'register' && !value('name')) return showError(error, 'Bitte sag uns, wie wir dich nennen sollen.');
    button.disabled = true;
    try {
      if (mode === 'login') { await cloud.signIn(email, password); dialog.close(); }
      else if (mode === 'register') {
        const { session: created } = await cloud.signUp(email, password, value('name'));
        if (created) dialog.close();
        else { mode = 'login'; render('Fast geschafft: Wir haben dir eine E-Mail geschickt. Bestätige sie und melde dich dann an.'); }
      } else if (mode === 'reset') { await cloud.requestPasswordReset(email); mode = 'login'; render('Wenn es dieses Konto gibt, ist ein Link zum Zurücksetzen unterwegs.'); }
      else if (mode === 'recover') { await cloud.setNewPassword(password); dialog.close(); toast('Neues Passwort gespeichert.'); }
    } catch (failure) { showError(error, friendlyError(failure)); }
    finally { button.disabled = false; }
  }
  render();
  dialog.showModal();
  return dialog;
}

// ---------- atlas form ----------
const placeOptions = selected => PLACES.map(place => `<option value="${esc(place.name)}" ${place.name === selected ? 'selected' : ''}>${esc(place.name)}</option>`).join('') +
  `<option value="__custom" ${selected === '__custom' ? 'selected' : ''}>Eigener Ort …</option>`;

function placeFields(prefix, label, place) {
  const preset = place && findPlace(place.name) && Math.abs(findPlace(place.name).lat - place.lat) < 0.01 ? place.name : place ? '__custom' : null;
  return `<div class="field place-field" data-place="${prefix}"><label class="field"><span>${label}</span><select name="${prefix}-select">${placeOptions(preset ?? (prefix === 'from' ? 'Berlin' : 'Paphos'))}</select></label>
    <div class="custom-place" ${preset === '__custom' ? '' : 'hidden'}>
      <label class="field"><span>Name des Ortes</span><input name="${prefix}-name" maxlength="60" value="${esc(preset === '__custom' ? place.name : '')}"></label>
      <div class="field-grid"><label class="field"><span>Breitengrad</span><input name="${prefix}-lat" inputmode="decimal" placeholder="52.52" value="${preset === '__custom' ? place.lat : ''}"></label>
      <label class="field"><span>Längengrad</span><input name="${prefix}-lon" inputmode="decimal" placeholder="13.405" value="${preset === '__custom' ? place.lon : ''}"></label></div>
    </div></div>`;
}

function readPlace(form, prefix) {
  const choice = form.elements[`${prefix}-select`].value;
  if (choice !== '__custom') { const place = findPlace(choice); return { name: place.name, lat: place.lat, lon: place.lon }; }
  const name = form.elements[`${prefix}-name`].value.trim();
  const lat = Number(form.elements[`${prefix}-lat`].value.replace(',', '.')), lon = Number(form.elements[`${prefix}-lon`].value.replace(',', '.'));
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Bitte Namen und gültige Koordinaten für den eigenen Ort eintragen (Breite −90 bis 90, Länge −180 bis 180).');
  return { name, lat, lon };
}

export function openAtlasForm({ atlas = null, dismissible = true } = {}) {
  return new Promise(resolve => {
    const dialog = makeDialog('atlas-dialog', `<form id="atlas-form" novalidate>
      <div class="dialog-top"><span class="chapter-label">${atlas ? 'ATLAS ANPASSEN' : 'EIN NEUER ATLAS'}</span>${dismissible ? `<button type="button" class="icon-button" data-close aria-label="Schließen">${icon('close')}</button>` : ''}</div>
      <h2>${atlas ? 'Euer Atlas.' : 'Euer Atlas beginnt.'}</h2>
      <p class="form-intro">Ein Atlas ist das gemeinsame Reisebuch einer Familie: eine Route, viele Erinnerungen.</p>
      <label class="field"><span>Wie heißt euer Atlas?</span><input name="title" required maxlength="80" placeholder="Zum Beispiel: Unser erstes Jahr zu dritt" value="${esc(atlas?.title ?? '')}"></label>
      <label class="field"><span>Ein Satz zum Anfang (optional)</span><textarea name="dedication" rows="3" maxlength="400" placeholder="Für wen ist dieses Buch? Was soll darin bewahrt werden?">${esc(atlas?.dedication ?? '')}</textarea></label>
      ${placeFields('from', 'Wo beginnt die Reise?', atlas?.from)}
      ${placeFields('to', 'Wo endet sie?', atlas?.to)}
      <p class="form-error" id="atlas-error" role="alert" hidden></p>
      <div class="dialog-actions">${dismissible ? '<button class="button button-secondary" type="button" data-close>Abbrechen</button>' : ''}<button class="button button-primary" id="atlas-save" type="submit">${atlas ? 'Speichern' : 'Atlas anlegen'} ${icon('arrow', 18)}</button></div></form>`, { dismissible });
    dialog.addEventListener('close', () => resolve());
    dialog.querySelectorAll('select[name$="-select"]').forEach(select => select.addEventListener('change', () => {
      select.closest('.place-field').querySelector('.custom-place').hidden = select.value !== '__custom';
    }));
    dialog.querySelector('#atlas-form').addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget, error = byId('atlas-error'), button = byId('atlas-save');
      showError(error, '');
      try {
        const title = form.elements.title.value.trim();
        if (!title) throw new Error('Bitte gib eurem Atlas einen Namen.');
        const from = readPlace(form, 'from'), to = readPlace(form, 'to');
        if (routeDistance(from, to) < 0.002) throw new Error('Start und Ziel dürfen nicht derselbe Ort sein.');
        const fields = { title, dedication: form.elements.dedication.value.trim(), from, to };
        button.disabled = true;
        if (atlas) { await cloud.updateAtlas(atlas.id, fields); await loadAtlases(); await session.handlers.selectAtlas(session.atlases.find(item => item.id === atlas.id)); }
        else { const id = await cloud.createAtlas(fields); await loadAtlases(); await session.handlers.selectAtlas(session.atlases.find(item => item.id === id)); }
        dialog.close(); toast(atlas ? 'Atlas gespeichert.' : 'Euer Atlas ist angelegt. Lade jetzt die Familie ein!');
      } catch (failure) { showError(error, friendlyError(failure)); button.disabled = false; }
    });
    dialog.showModal(); dialog.querySelector('input')?.focus();
  });
}

// ---------- join by code ----------
function openJoinDialog(parent) {
  const dialog = makeDialog('join-dialog', `<form id="join-form" novalidate>
    <div class="dialog-top"><span class="chapter-label">EINLADUNG</span><button type="button" class="icon-button" data-close aria-label="Schließen">${icon('close')}</button></div>
    <h2>Einem Atlas beitreten.</h2><p class="form-intro">Füge den Einladungslink oder den Code ein, den du bekommen hast.</p>
    <label class="field"><span>Link oder Code</span><input name="code" required autocomplete="off" autocapitalize="none" placeholder="https://… oder 24 Zeichen"></label>
    <p class="form-error" id="join-error" role="alert" hidden></p>
    <div class="dialog-actions"><button class="button button-secondary" type="button" data-close>Abbrechen</button><button class="button button-primary" id="join-submit" type="submit">Beitreten ${icon('arrow', 18)}</button></div></form>`);
  dialog.querySelector('#join-form').addEventListener('submit', async event => {
    event.preventDefault();
    const error = byId('join-error'), button = byId('join-submit');
    showError(error, ''); button.disabled = true;
    try { const atlas = await joinWithCode(event.currentTarget.elements.code.value); dialog.close(); parent?.close(); toast(atlas ? `Willkommen im Atlas „${atlas.title}“.` : 'Beigetreten.'); }
    catch (failure) { showError(error, friendlyError(failure)); button.disabled = false; }
  });
  dialog.showModal(); dialog.querySelector('input').focus();
}

// ---------- hub: atlases, members, account ----------
async function copyText(text, input) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch { input?.select(); try { return document.execCommand('copy'); } catch { return false; } }
}

export async function openHub() {
  const hasAtlas = session.atlases.length > 0;
  const dialog = makeDialog('hub-dialog', '<div class="sheet-body" id="hub-body"></div>', { dismissible: hasAtlas });
  dialog.showModal();
  await renderHub(dialog);
}

async function renderHub(dialog) {
  const body = dialog.querySelector('#hub-body'), atlas = session.atlas, hasAtlas = session.atlases.length > 0;
  const isOwner = atlas?.role === 'owner';
  body.innerHTML = `
    <div class="dialog-top"><span class="chapter-label">${hasAtlas ? 'ATLAS &amp; KONTO' : 'WILLKOMMEN'}</span>${hasAtlas ? `<button type="button" class="icon-button" data-close aria-label="Schließen">${icon('close')}</button>` : ''}</div>
    <h2>${hasAtlas ? 'Eure Atlanten.' : `Hallo${session.profile?.display_name ? ` ${esc(session.profile.display_name)}` : ''}!`}</h2>
    ${hasAtlas ? '' : '<p class="form-intro">Du bist noch in keinem Atlas. Lege einen eigenen an oder tritt mit einem Einladungslink einem bestehenden bei.</p>'}
    <section class="hub-section"><ul class="hub-list">${session.atlases.map(item => `<li><button type="button" class="hub-row ${item.id === atlas?.id ? 'current' : ''}" data-atlas="${esc(item.id)}"><strong>${esc(item.title)}</strong><small>${esc(item.from.name)} → ${esc(item.to.name)} · ${ROLE_LABEL[item.role]}</small></button></li>`).join('')}</ul>
      <div class="hub-actions"><button class="button button-secondary" id="hub-new" type="button">${icon('plus', 17)} Neuer Atlas</button><button class="button button-secondary" id="hub-join" type="button">${icon('link', 17)} Mit Code beitreten</button></div></section>
    ${hasAtlas ? `<section class="hub-section"><h3>Mitglieder in „${esc(atlas.title)}“</h3><ul class="hub-list" id="hub-members"><li class="quiet">Lädt …</li></ul>
      ${isOwner ? `<div class="invite-box"><label class="field"><span>Neue Person einladen</span><select id="invite-role"><option value="editor">Darf Erinnerungen schreiben</option><option value="viewer">Darf nur lesen</option></select></label>
        <button class="button button-secondary" id="invite-create" type="button">${icon('link', 17)} Einladungslink erstellen</button>
        <div id="invite-result" hidden><input id="invite-link" readonly aria-label="Einladungslink"><div class="hub-actions"><button class="button button-secondary" id="invite-copy" type="button">Kopieren</button><button class="button button-secondary" id="invite-share" type="button" hidden>Teilen</button></div><small>Gilt 7 Tage und für bis zu 5 Personen.</small></div></div>
        <div class="hub-actions"><button class="button button-secondary" id="atlas-edit" type="button">${icon('pencil', 17)} Atlas anpassen</button></div>` : ''}
      <div class="hub-actions"><button class="text-button danger" id="atlas-leave" type="button">Atlas verlassen</button></div></section>` : ''}
    <section class="hub-section"><h3>Mein Konto</h3><p class="quiet">${esc(session.user.email ?? '')}</p>
      <form id="name-form" class="inline-form"><label class="field"><span>Mein Name im Atlas</span><input name="name" maxlength="60" value="${esc(session.profile?.display_name ?? '')}"></label><button class="button button-secondary" type="submit">Speichern</button></form>
      ${hasAtlas ? `<div class="hub-actions"><button class="button button-secondary" id="hub-upload-local" type="button">${icon('upload', 17)} Alte Erinnerungen von diesem Gerät hochladen</button></div>` : ''}
      <div class="hub-actions"><button class="button button-secondary" id="sign-out" type="button">Abmelden</button><button class="text-button danger" id="delete-account" type="button">Konto löschen</button></div></section>`;

  body.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  body.querySelectorAll('[data-atlas]').forEach(button => button.addEventListener('click', async () => {
    await session.handlers.selectAtlas(session.atlases.find(item => item.id === button.dataset.atlas)); dialog.close();
  }));
  byId('hub-new').onclick = async () => { const before = session.atlas?.id; await openAtlasForm({ dismissible: hasAtlas }); if (session.atlas?.id !== before) dialog.close(); };
  byId('hub-join').onclick = () => openJoinDialog(dialog);

  byId('name-form').onsubmit = async event => {
    event.preventDefault();
    const name = event.currentTarget.elements.name.value.trim();
    try { await cloud.updateDisplayName(session.user.id, name); session.profile = { ...session.profile, display_name: name }; toast('Name gespeichert.'); await session.handlers.reload?.(); }
    catch (failure) { toast(friendlyError(failure)); }
  };
  if (hasAtlas) byId('hub-upload-local').onclick = () => { dialog.close(); session.handlers.importLocal(); };
  byId('sign-out').onclick = async () => {
    const pending = (await outboxAll()).length;
    if (pending && !confirm(`Es warten noch ${pending} Änderung(en) auf die Synchronisierung. Wenn du dich jetzt abmeldest, gehen sie verloren. Trotzdem abmelden?`)) return;
    await clearLocalCloudData(); dialog.close(); await cloud.signOut();
  };
  byId('delete-account').onclick = async () => {
    if (!confirm('Konto wirklich löschen?\n\nDein Zugang wird endgültig entfernt. Atlanten, in denen du allein bist, werden samt Fotos gelöscht. In geteilten Atlanten bleiben deine Erinnerungen für die anderen erhalten, ohne deinen Namen.')) return;
    if (!confirm('Letzte Rückfrage: Das lässt sich nicht rückgängig machen. Konto jetzt löschen?')) return;
    try { await cloud.deleteAccount(session.user.id); await clearLocalCloudData(); dialog.close(); toast('Dein Konto wurde gelöscht.'); }
    catch (failure) { toast(friendlyError(failure)); }
  };

  if (!hasAtlas) return;
  byId('atlas-leave').onclick = async () => {
    const alone = (await cloud.listMembers(atlas.id)).length <= 1;
    if (!confirm(alone ? `Du bist allein in „${atlas.title}“. Verlassen löscht den Atlas mit allen Erinnerungen und Fotos endgültig. Fortfahren?` : `„${atlas.title}“ verlassen? Die Erinnerungen bleiben für die anderen erhalten.`)) return;
    try { await cloud.leaveAtlas(atlas.id); await loadAtlases(); dialog.close(); await session.handlers.afterLeave(); }
    catch (failure) { toast(friendlyError(failure)); }
  };
  if (isOwner) {
    byId('atlas-edit').onclick = () => openAtlasForm({ atlas }).then(() => renderHub(dialog));
    byId('invite-create').onclick = async () => {
      try {
        const invite = await cloud.createInvite(atlas.id, session.user.id, byId('invite-role').value);
        byId('invite-link').value = invite.link; byId('invite-result').hidden = false;
        byId('invite-share').hidden = !navigator.share;
      } catch (failure) { toast(friendlyError(failure)); }
    };
    byId('invite-copy').onclick = async () => toast(await copyText(byId('invite-link').value, byId('invite-link')) ? 'Link kopiert.' : 'Bitte den Link markieren und selbst kopieren.');
    byId('invite-share').onclick = () => navigator.share({ title: `Einladung zu „${atlas.title}“`, text: `Komm in unseren Atlas der Erinnerungen: ${atlas.title}`, url: byId('invite-link').value }).catch(() => {});
  }
  try {
    const members = await cloud.listMembers(atlas.id);
    const list = byId('hub-members'); if (!list) return;
    list.innerHTML = members.map(member => `<li class="member-row"><span><strong>${esc(member.name)}${member.userId === session.user.id ? ' (du)' : ''}</strong><small>${ROLE_LABEL[member.role]}</small></span>${isOwner && member.userId !== session.user.id ? `<button type="button" class="text-button danger" data-remove="${esc(member.userId)}">Entfernen</button>` : ''}</li>`).join('');
    list.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', async () => {
      if (!confirm('Diese Person aus dem Atlas entfernen? Ihre Erinnerungen bleiben erhalten.')) return;
      try { await cloud.removeMember(atlas.id, button.dataset.remove); await renderHub(dialog); } catch (failure) { toast(friendlyError(failure)); }
    }));
  } catch (failure) { const list = byId('hub-members'); if (list) list.innerHTML = `<li class="quiet">${esc(friendlyError(failure))}</li>`; }
}

// Removes cached atlas data and queued changes: shared phones must not keep another person's family album.
export async function clearLocalCloudData() {
  await outboxClear();
  for (const atlas of session.atlases) await cacheDelete(`atlas:${atlas.id}`);
  if (session.user) await cacheDelete(`atlases:${session.user.id}`);
}
