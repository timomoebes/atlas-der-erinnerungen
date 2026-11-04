import test from 'node:test';
import assert from 'node:assert/strict';
import { validateMoment } from '../src/storage.js';
const good = { id: 'one', title: 'Ankunft', note: 'Das Meer!', date: '2025-08-12', position: 1, photo: null };
test('valid diary memory', () => assert.equal(validateMoment(good), true));
test('rejects impossible dates', () => assert.equal(validateMoment({ ...good, date: '2025-02-31' }), false));
test('rejects out-of-route position', () => assert.equal(validateMoment({ ...good, position: 1.2 }), false));
test('rejects empty title', () => assert.equal(validateMoment({ ...good, title: '   ' }), false));
test('rejects non-image data URL', () => assert.equal(validateMoment({ ...good, photo: 'data:text/html;base64,PHNjcmlwdD4=' }), false));

test('accepts cloud photos referenced by storage path', () =>
  assert.equal(validateMoment({ ...good, photos: [{ id: 'p1', path: 'atlas/moment/p1.jpg' }] }), true));
test('accepts local photos as image data URLs', () =>
  assert.equal(validateMoment({ ...good, photos: [{ id: 'p1', dataUrl: 'data:image/jpeg;base64,AAAA' }] }), true));
test('rejects path traversal in photo path', () =>
  assert.equal(validateMoment({ ...good, photos: [{ id: 'p1', path: '../other/p1.jpg' }] }), false));
test('rejects more than 8 photos', () =>
  assert.equal(validateMoment({ ...good, photos: Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, path: `a/m/p${i}.jpg` })) }), false));
test('rejects script data URL inside photos', () =>
  assert.equal(validateMoment({ ...good, photos: [{ id: 'p1', dataUrl: 'data:text/html;base64,PHNjcmlwdD4=' }] }), false));
