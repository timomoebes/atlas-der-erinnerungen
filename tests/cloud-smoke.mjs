// Browser smoke test of the CLOUD flows against a mocked Supabase API (no real project needed).
//   VITE_SUPABASE_URL=https://mock.supabase.test VITE_SUPABASE_ANON_KEY=mock npx vite build --outDir dist-mock
//   npx vite preview --outDir dist-mock --port 4174 --strictPort   (in another terminal)
//   node tests/cloud-smoke.mjs
// It checks the UI wiring (login, atlas, moments, authors, comments, editor, invites). Real access rules
// are verified separately by supabase/tests/rls_test.sql (npm run test:rls).
import { chromium } from 'playwright';   // WebKit cannot intercept the fake API host, so this suite is Chromium-only

const BASE = process.env.APP_URL || 'http://127.0.0.1:4174/';
const API = 'https://mock.supabase.test';
const ME = '00000000-0000-0000-0000-00000000000a', BIA = '00000000-0000-0000-0000-00000000000b';
const ATLAS = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const now = new Date().toISOString();

const state = {
  atlas: { id: ATLAS, title: 'Unser erstes Jahr', dedication: 'Für uns drei.', origin_name: 'Berlin', origin_lat: 52.52, origin_lon: 13.405, dest_name: 'Paphos', dest_lat: 34.775, dest_lon: 32.425, created_at: now },
  moments: [{ id: 'm1', atlas_id: ATLAS, author_id: BIA, title: 'Erster Tag am Meer', note: 'Bia hat geschrieben.', moment_date: '2025-08-12', position: 1, created_at: now, updated_at: now, profiles: { display_name: 'Bia' }, moment_photos: [], comments: [{ count: 0 }] }],
  comments: [], invites: 0, noAtlas: true,   // a brand-new account has no atlas yet
  offline: false   // routed requests bypass Playwright's offline emulation, so the mock itself drops them
};
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors(), body: JSON.stringify(body) });
const cors = () => ({ 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' });

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const pageErrors = [];
await context.route(`${API}/**`, async route => {
  const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method();
  if (state.offline) return route.abort('internetdisconnected');
  if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors() });
  const wantsObject = (request.headers().accept || '').includes('pgrst.object');
  const select = url.searchParams.get('select') || '';
  const body = () => { try { return JSON.parse(request.postData() || '{}'); } catch { return {}; } };
  if (path === '/auth/v1/token') return json(route, { access_token: 'mock.access.token', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh', user: { id: ME, email: 'timo@example.com', aud: 'authenticated', role: 'authenticated', user_metadata: { display_name: 'Timo' }, app_metadata: {}, created_at: now } });
  if (path === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors() });
  if (path === '/rest/v1/profiles') return json(route, [{ id: ME, display_name: 'Timo' }]);
  if (path === '/rest/v1/atlas_members' && method === 'GET') {
    if (select.includes('atlases')) return json(route, state.noAtlas ? [] : [{ role: 'owner', atlases: state.atlas }]);
    if (select.includes('profiles')) return json(route, [{ user_id: ME, role: 'owner', joined_at: now, profiles: { display_name: 'Timo' } }, { user_id: BIA, role: 'editor', joined_at: now, profiles: { display_name: 'Bia' } }]);
    return json(route, [{ user_id: ME }, { user_id: BIA }]);
  }
  if (path === '/rest/v1/moments') {
    if (method === 'GET' && url.searchParams.get('id')) {
      const id = url.searchParams.get('id').replace('eq.', ''), hit = state.moments.find(item => item.id === id);
      return json(route, hit ? [{ id }] : []); // maybeSingle() asks for a plain array
    }
    if (method === 'GET') return json(route, state.moments);
    if (method === 'POST') { const row = body(); state.moments.push({ ...row, created_at: now, updated_at: now, profiles: { display_name: 'Timo' }, moment_photos: [], comments: [{ count: 0 }] }); return route.fulfill({ status: 201, headers: cors(), body: '' }); }
    if (method === 'PATCH') { const id = url.searchParams.get('id').replace('eq.', ''); Object.assign(state.moments.find(item => item.id === id) || {}, body()); return route.fulfill({ status: 204, headers: cors() }); }
    if (method === 'DELETE') { const id = url.searchParams.get('id').replace('eq.', ''); state.moments = state.moments.filter(item => item.id !== id); return route.fulfill({ status: 204, headers: cors() }); }
  }
  if (path === '/rest/v1/rpc/create_atlas') {
    const p = body();
    Object.assign(state.atlas, { title: p.p_title, dedication: p.p_dedication, origin_name: p.p_origin_name, origin_lat: p.p_origin_lat, origin_lon: p.p_origin_lon, dest_name: p.p_dest_name, dest_lat: p.p_dest_lat, dest_lon: p.p_dest_lon });
    state.noAtlas = false; return json(route, ATLAS);
  }
  if (path === '/rest/v1/moment_photos') return method === 'GET' ? json(route, []) : route.fulfill({ status: 201, headers: cors(), body: '' });
  if (path === '/rest/v1/comments') {
    if (method === 'GET') return json(route, state.comments);
    if (method === 'POST') { const row = body(); state.comments.push({ id: `c${state.comments.length}`, body: row.body, created_at: now, author_id: row.author_id, profiles: { display_name: 'Timo' } }); return route.fulfill({ status: 201, headers: cors(), body: '' }); }
  }
  if (path === '/rest/v1/invites' && method === 'POST') { state.invites++; return json(route, wantsObject ? { code: 'abcdef0123456789abcdef01', expires_at: now } : [{ code: 'abcdef0123456789abcdef01', expires_at: now }], 201); }
  if (path.startsWith('/storage/v1/object/sign')) return json(route, []);
  return json(route, wantsObject ? {} : [], 200);
});

const page = await context.newPage();
const uploads = [];
page.on('request', request => { if (request.method() === 'POST' && request.url().includes('/storage/v1/object/photos/')) uploads.push(new URL(request.url()).pathname); });
page.on('pageerror', error => pageErrors.push(error.message));
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (error) { console.log('FAIL', name, '-', error.message.split('\n')[0]); process.exitCode = 1; throw error; } };
const text = selector => page.locator(selector).first().innerText();

try {
  await step('login dialog appears', async () => { await page.goto(BASE, { waitUntil: 'domcontentloaded' }); await page.locator('#auth-dialog[open]').waitFor(); });
  await step('login with email and password', async () => {
    await page.locator('[name="email"]').fill('timo@example.com'); await page.locator('[name="password"]').fill('correct horse 1');
    await page.locator('#auth-submit').click(); await page.locator('#auth-dialog[open]').waitFor({ state: 'hidden', timeout: 8000 });
  });
  await step('new account without atlas is guided to create one (custom place, decimal comma)', async () => {
    await page.locator('#hub-dialog[open]').waitFor();
    if (!(await text('#hub-dialog h2')).includes('Hallo Timo')) throw new Error('welcome missing');
    if (await page.locator('#hub-dialog [data-close]').count()) throw new Error('welcome sheet must not be dismissible');
    await page.locator('#hub-new').click();
    await page.locator('#atlas-form [name="title"]').fill('Unser erstes Jahr');
    await page.locator('#atlas-form [name="dedication"]').fill('Für uns drei.');
    await page.locator('[name="to-select"]').selectOption('__custom');
    await page.locator('[name="to-name"]').fill('Paphos'); await page.locator('[name="to-lat"]').fill('34,775'); await page.locator('[name="to-lon"]').fill('32.425');
    await page.locator('#atlas-save').click();
    await page.locator('#atlas-dialog').waitFor({ state: 'detached' });
  });
  await step('atlas title, dedication and route are shown', async () => {
    await page.locator('.memory-detail h3').getByText('Erster Tag am Meer').waitFor({ timeout: 8000 });
    if (!(await text('#page-title')).includes('Unser erstes Jahr')) throw new Error('title missing');
    if (!(await text('#lead')).includes('Für uns drei')) throw new Error('dedication missing');
    if (!(await text('#edition-route')).includes('BERLIN NACH PAPHOS')) throw new Error('route missing');
  });
  await step('author of a partner entry is attributed', async () => { if (!(await text('.memory-date')).includes('von Bia')) throw new Error(await text('.memory-date')); });
  await step('owner may edit a partner entry', async () => { await page.getByRole('button', { name: 'Erinnerung bearbeiten' }).waitFor(); });
  await step('comment can be added', async () => {
    await page.locator('.comment-form input').fill('Wie schön!'); await page.locator('.comment-form button').click();
    await page.locator('.comment p').getByText('Wie schön!').waitFor();
  });
  await step('new moment is saved and attributed', async () => {
    await page.getByRole('button', { name: 'Erinnerung festhalten' }).click();
    await page.locator('[name="title"]').fill('Unser Spaziergang'); await page.locator('[name="note"]').fill('Zu dritt am Strand.');
    await page.locator('#photo-input').setInputFiles('public/icon-192.png'); await page.locator('#photo-preview img').waitFor();
    await page.getByRole('button', { name: 'Erinnerung speichern' }).click();
    await page.locator('.memory-detail h3').getByText('Unser Spaziergang').waitFor();
    if (uploads.length !== 1 || !uploads[0].includes(`/photos/${ATLAS}/`)) throw new Error('photo upload path wrong: ' + uploads.join(','));
    if (!(await text('.memory-date')).includes('von Timo')) throw new Error('author missing: ' + await text('.memory-date'));
  });
  await step('atlas & account sheet lists members and creates an invite link', async () => {
    await page.locator('#about-button').click(); await page.locator('#hub-dialog[open]').waitFor();
    await page.locator('#hub-members .member-row').first().waitFor();
    if (await page.locator('#hub-members .member-row').count() !== 2) throw new Error('expected 2 members');
    await page.locator('#invite-create').click();
    await page.locator('#invite-result:not([hidden])').waitFor();
    const link = await page.locator('#invite-link').inputValue();
    if (!link.endsWith('/#/join/abcdef0123456789abcdef01')) throw new Error('bad link ' + link);
  });
  await step('offline edit is queued, shown as pending, and uploaded when back online', async () => {
    const wait = async (label, fn) => {
      try { await fn(); }
      catch (error) { throw new Error(`${label}: ${error.message.split('\n')[0]}`); }
    };
    await page.keyboard.press('Escape');
    await wait('hub closes', () => page.locator('#hub-dialog[open]').waitFor({ state: 'hidden', timeout: 5000 }));
    state.offline = true; await context.setOffline(true);
    await page.getByRole('button', { name: 'Erinnerung festhalten' }).click();
    await page.locator('[name="title"]').fill('Im Flugzeug geschrieben');
    await page.getByRole('button', { name: 'Erinnerung speichern' }).click();
    await wait('entry shown', () => page.locator('.memory-detail h3').getByText('Im Flugzeug geschrieben').waitFor({ timeout: 8000 }));
    await wait('pill visible', () => page.locator('#sync-pill:not([hidden])').waitFor({ timeout: 5000 }));
    if (!(await text('#sync-pill')).includes('Offline')) throw new Error('pill: ' + await text('#sync-pill'));
    if (state.moments.some(item => item.title === 'Im Flugzeug geschrieben')) throw new Error('reached server while offline');
    state.offline = false; await context.setOffline(false);
    await wait('pill clears after reconnect', () => page.waitForFunction(() => document.querySelector('#sync-pill').hidden, null, { timeout: 15000 }));
    if (!state.moments.some(item => item.title === 'Im Flugzeug geschrieben')) throw new Error('queued entry never reached the server');
  });
  await step('sign out returns to login', async () => {
    await page.locator('#about-button').click(); await page.locator('#hub-dialog[open]').waitFor();
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#sign-out').click(); await page.locator('#auth-dialog[open]').waitFor();
  });
  await step('no uncaught page errors', async () => { if (pageErrors.length) throw new Error(pageErrors.join(' | ')); });
} catch { /* reported above */ }
await browser.close();
