export const icons = {
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
  trash: '<path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M17 14c2.5 0 4.5 2 4.5 4.5"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'
};
export const icon = (name, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
export const dateLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`));
export const timeLabel = value => new Intl.DateTimeFormat('de-DE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
export const byId = id => document.getElementById(id);
export const latLabel = lat => { const abs = Math.abs(lat), deg = Math.floor(abs), min = Math.round((abs - deg) * 60); return `${deg}°${String(min).padStart(2, '0')}′ ${lat >= 0 ? 'N' : 'S'}`; };

let toastTimer;
export function toast(message) {
  const el = byId('toast'); if (!el) return;
  el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}

// Creates (or replaces) a native <dialog> using the existing .editor look and returns it.
export function makeDialog(id, html, { dismissible = true } = {}) {
  document.getElementById(id)?.remove();
  const dialog = document.createElement('dialog');
  dialog.id = id; dialog.className = 'editor sheet';
  dialog.innerHTML = html;
  document.body.append(dialog);
  if (!dismissible) dialog.addEventListener('cancel', event => event.preventDefault());
  dialog.addEventListener('close', () => { if (dialog.dataset.keep !== '1') dialog.remove(); });
  dialog.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => dialog.close()));
  return dialog;
}

export function showError(el, message) { el.textContent = message; el.hidden = !message; }

export function friendlyError(error) {
  const text = String(error?.message || error || '');
  if (/invalid login credentials/i.test(text)) return 'E-Mail oder Passwort stimmt nicht.';
  if (/email not confirmed/i.test(text)) return 'Bitte bestätige zuerst deine E-Mail-Adresse (Link in deinem Postfach).';
  if (/already registered|already been registered/i.test(text)) return 'Mit dieser E-Mail gibt es schon ein Konto. Bitte melde dich an.';
  if (/password should be at least|weak password/i.test(text)) return 'Das Passwort ist zu schwach. Nimm mindestens 8 Zeichen.';
  if (/rate limit|too many/i.test(text)) return 'Zu viele Versuche. Bitte warte kurz und versuche es dann erneut.';
  if (/invite invalid or expired/i.test(text)) return 'Dieser Einladungscode ist ungültig oder abgelaufen.';
  if (/failed to fetch|network|load failed/i.test(text)) return 'Keine Verbindung. Bitte prüfe dein Internet.';
  if (/row-level security|permission denied|not allowed/i.test(text)) return 'Dafür fehlt dir die Berechtigung.';
  return text || 'Das hat leider nicht geklappt.';
}
