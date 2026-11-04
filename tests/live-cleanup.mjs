// Deletes the two live test accounts through the app's own "Konto löschen" flow (also tests that flow).
//   LIVE_PASS=... node tests/live-cleanup.mjs
import { chromium } from 'playwright';
const BASE = process.env.APP_URL || 'http://127.0.0.1:5173/';
const PASS = process.env.LIVE_PASS;
if (!PASS) throw new Error('Set LIVE_PASS');
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader'] });
for (const email of ['atlas-test-b@example.com', 'atlas-test-a@example.com']) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  page.on('dialog', dialog => dialog.accept());
  await page.goto(BASE);
  await page.locator('#auth-dialog[open]').waitFor();
  await page.locator('[name="email"]').fill(email); await page.locator('[name="password"]').fill(PASS);
  await page.locator('#auth-submit').click();
  await page.locator('#auth-dialog[open]').waitFor({ state: 'hidden', timeout: 15000 });
  await page.locator('#about-button').click();
  await page.locator('#hub-dialog[open]').waitFor();
  await page.locator('#delete-account').click();
  await page.locator('#auth-dialog[open]').waitFor({ timeout: 30000 });   // signed out again after deletion
  console.log('deleted', email);
  await page.close();
}
await browser.close();
