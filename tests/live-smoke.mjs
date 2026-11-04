// Two-user test against a REAL Supabase project (needs .env.local and two confirmed test accounts).
//   npx vite --host 127.0.0.1 --port 5173      (in another terminal)
//   LIVE_PASS=... node tests/live-smoke.mjs
// Accounts: atlas-test-a@example.com / atlas-test-b@example.com (create them, then delete them afterwards).
import { chromium } from 'playwright';

const BASE = process.env.APP_URL || 'http://127.0.0.1:5173/';
const PASS = process.env.LIVE_PASS;
if (!PASS) throw new Error('Set LIVE_PASS');
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const errors = [];
const open = async (label) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`${label}: ${error.message}`));
  return page;
};
const login = async (page, email) => {
  await page.locator('#auth-dialog[open]').waitFor();
  await page.locator('[name="email"]').fill(email); await page.locator('[name="password"]').fill(PASS);
  await page.locator('#auth-submit').click();
  await page.locator('#auth-dialog[open]').waitFor({ state: 'hidden', timeout: 15000 });
};
let failed = false;
const step = async (name, fn) => { try { await fn(); console.log('ok  ', name); } catch (error) { failed = true; console.log('FAIL', name, '-', error.message.split('\n')[0]); throw error; } };
const text = (page, selector) => page.locator(selector).first().innerText();
const TITLE = `Live-Test ${Date.now()}`;

try {
  const a = await open('A'), b = await open('B');
  let inviteLink = '', photoUrl = '';

  await step('A: sign in, create atlas (new account has none)', async () => {
    await a.goto(BASE); await login(a, 'atlas-test-a@example.com');
    await a.locator('#hub-dialog[open]').waitFor({ timeout: 15000 });
    await a.locator('#hub-new').click();
    await a.locator('#atlas-form [name="title"]').fill(TITLE); await a.locator('#atlas-form [name="dedication"]').fill('Echt-Test');
    await a.locator('[name="to-select"]').selectOption('Paphos');
    await a.locator('#atlas-save').click();
    await a.locator('#atlas-dialog').waitFor({ state: 'detached', timeout: 15000 });
    await a.locator('#hub-dialog').waitFor({ state: 'detached', timeout: 15000 });
    if (!(await text(a, '#page-title')).includes(TITLE)) throw new Error('atlas title not shown');
  });
  await step('A: moment with photo is saved to the cloud', async () => {
    await a.getByRole('button', { name: 'Erinnerung festhalten' }).click();
    await a.locator('[name="title"]').fill('Erster Eintrag von Anna'); await a.locator('[name="note"]').fill('Mit Foto.');
    await a.locator('#photo-input').setInputFiles('public/icon-192.png'); await a.locator('#photo-preview img').waitFor();
    await a.getByRole('button', { name: 'Erinnerung speichern' }).click();
    await a.locator('.memory-detail h3').getByText('Erster Eintrag von Anna').waitFor({ timeout: 20000 });
    await a.locator('.memory-photo').first().waitFor({ timeout: 20000 });
    photoUrl = await a.locator('.memory-photo').first().getAttribute('src');
    if (!photoUrl.includes('/storage/v1/object/sign/photos/')) throw new Error('photo is not served via signed URL: ' + photoUrl);
  });
  await step('A: creates invite link for editors', async () => {
    await a.locator('#about-button').click(); await a.locator('#hub-dialog[open]').waitFor();
    await a.locator('#invite-create').click(); await a.locator('#invite-result:not([hidden])').waitFor({ timeout: 15000 });
    inviteLink = await a.locator('#invite-link').inputValue();
    if (!/\/#\/join\/[0-9a-f]{24}$/.test(inviteLink)) throw new Error('bad invite link ' + inviteLink);
    await a.keyboard.press('Escape');
  });
  await step('photo is private: signed URL works, public URL does not', async () => {
    const signed = await fetch(photoUrl); if (signed.status !== 200) throw new Error('signed url status ' + signed.status);
    const publicUrl = photoUrl.split('?')[0].replace('/object/sign/', '/object/public/');
    const open = await fetch(publicUrl); if (open.status === 200) throw new Error('PUBLIC URL LEAKS THE PHOTO');
  });
  await step('B: opens invite link, signs in, joins the atlas, sees A\'s entry and photo', async () => {
    await b.goto(inviteLink); await login(b, 'atlas-test-b@example.com');
    await b.locator('.memory-detail h3').getByText('Erster Eintrag von Anna').waitFor({ timeout: 25000 });
    if (!(await text(b, '.memory-date')).includes('von Test Anna')) throw new Error('author missing: ' + await text(b, '.memory-date'));
    await b.locator('.memory-photo').first().waitFor({ timeout: 20000 });
  });
  await step('B (editor) cannot edit or delete A\'s entry', async () => {
    if (await b.getByRole('button', { name: 'Erinnerung bearbeiten' }).count()) throw new Error('edit button visible for foreign entry');
    if (await b.getByRole('button', { name: 'Erinnerung löschen' }).count()) throw new Error('delete button visible for foreign entry');
  });
  await step('B: comments and writes an own entry', async () => {
    await b.locator('.comment-form input').fill('Schön, Anna!'); await b.locator('.comment-form button').click();
    await b.locator('.comment p').getByText('Schön, Anna!').waitFor({ timeout: 15000 });
    await b.getByRole('button', { name: 'Erinnerung festhalten' }).click();
    await b.locator('[name="title"]').fill('Eintrag von Ben'); await b.getByRole('button', { name: 'Erinnerung speichern' }).click();
    await b.locator('.memory-detail h3').getByText('Eintrag von Ben').waitFor({ timeout: 20000 });
    if (!(await text(b, '.memory-date')).includes('von Test Ben')) throw new Error('own author missing');
  });
  await step('A sees B\'s entry and comment (live or after reload)', async () => {
    await a.reload(); await a.locator('.memory-detail').waitFor({ timeout: 20000 });
    await a.locator('.moment-row').getByText('Eintrag von Ben').click();
    await a.locator('.memory-date').getByText('von Test Ben').waitFor();
    await a.locator('.moment-row').getByText('Erster Eintrag von Anna').click();
    await a.locator('.comment p').getByText('Schön, Anna!').waitFor({ timeout: 15000 });
  });
  await step('no uncaught page errors', async () => { if (errors.length) throw new Error(errors.join(' | ')); });
} catch { /* reported above */ }
await browser.close();
process.exitCode = failed ? 1 : 0;
