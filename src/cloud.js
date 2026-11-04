import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY, PHOTO_BUCKET, APP_URL } from './config.js';

export const client = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

function check({ data, error }) { if (error) throw error; return data; }

// Only errors that a retry can never fix may remove a queued change: RLS denial (42501), constraint/data errors (22xxx, 23xxx)
// and clear client errors from Storage. Everything else (5xx, expired token, captive portal, ...) stays queued.
export function isPermanentError(error) {
  if (/^(42501|22\d{3}|23\d{3})$/.test(String(error?.code ?? ''))) return true;
  const status = Number(error?.status ?? error?.statusCode);
  return [400, 403, 413, 415, 422].includes(status);
}

export async function hasSession() { try { return Boolean((await client.auth.getSession()).data.session); } catch { return false; } }

export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const text = `${error?.name ?? ''} ${error?.message ?? ''}`;
  return error instanceof TypeError || /failed to fetch|networkerror|network request failed|load failed|timeout/i.test(text);
}

// ---------- auth ----------
export async function getSession() { return check(await client.auth.getSession()).session; }
export function onAuthChange(callback) { return client.auth.onAuthStateChange((event, session) => callback(event, session)).data.subscription; }
export async function signUp(email, password, displayName) {
  return check(await client.auth.signUp({ email, password, options: { data: { display_name: displayName }, emailRedirectTo: APP_URL || undefined } }));
}
export async function signIn(email, password) { return check(await client.auth.signInWithPassword({ email, password })); }
export async function signOut() { check(await client.auth.signOut()); }
export async function requestPasswordReset(email) { check(await client.auth.resetPasswordForEmail(email, { redirectTo: APP_URL || undefined })); }
export async function setNewPassword(password) { check(await client.auth.updateUser({ password })); }

// ---------- profile ----------
export async function getProfile(userId) {
  return check(await client.from('profiles').select('id, display_name').eq('id', userId).maybeSingle());
}
export async function updateDisplayName(userId, name) {
  check(await client.from('profiles').update({ display_name: name }).eq('id', userId));
}

// ---------- atlases ----------
const toAtlas = row => ({
  id: row.id, title: row.title, dedication: row.dedication,
  from: { name: row.origin_name, lat: row.origin_lat, lon: row.origin_lon },
  to: { name: row.dest_name, lat: row.dest_lat, lon: row.dest_lon },
  createdAt: row.created_at
});

export async function listAtlases(userId) {
  const rows = check(await client.from('atlas_members').select('role, atlases(*)').eq('user_id', userId));
  return rows.filter(row => row.atlases).map(row => ({ ...toAtlas(row.atlases), role: row.role }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function createAtlas({ title, dedication, from, to }) {
  return check(await client.rpc('create_atlas', {
    p_title: title, p_dedication: dedication,
    p_origin_name: from.name, p_origin_lat: from.lat, p_origin_lon: from.lon,
    p_dest_name: to.name, p_dest_lat: to.lat, p_dest_lon: to.lon
  }));
}

export async function updateAtlas(id, { title, dedication, from, to }) {
  check(await client.from('atlases').update({
    title, dedication, origin_name: from.name, origin_lat: from.lat, origin_lon: from.lon,
    dest_name: to.name, dest_lat: to.lat, dest_lon: to.lon
  }).eq('id', id));
}

export async function listMembers(atlasId) {
  const rows = check(await client.from('atlas_members').select('user_id, role, joined_at, profiles(display_name)').eq('atlas_id', atlasId).order('joined_at'));
  return rows.map(row => ({ userId: row.user_id, role: row.role, name: row.profiles?.display_name || 'Mitglied' }));
}

export async function removeMember(atlasId, userId) {
  check(await client.from('atlas_members').delete().eq('atlas_id', atlasId).eq('user_id', userId));
}

export async function createInvite(atlasId, userId, role) {
  const row = check(await client.from('invites').insert({ atlas_id: atlasId, created_by: userId, role }).select('code, expires_at').single());
  return { code: row.code, expiresAt: row.expires_at, link: `${APP_URL}/#/join/${row.code}` };
}

export async function redeemInvite(code) { return check(await client.rpc('redeem_invite', { p_code: code })); }

async function removeFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) check(await client.storage.from(PHOTO_BUCKET).remove(paths.slice(i, i + 100)));
}

async function atlasPhotoPaths(atlasId) {
  return check(await client.from('moment_photos').select('storage_path').eq('atlas_id', atlasId)).map(row => row.storage_path);
}

// Leaves the atlas. When the user is its last member the atlas and all its photos are deleted.
export async function leaveAtlas(atlasId) {
  const members = check(await client.from('atlas_members').select('user_id').eq('atlas_id', atlasId));
  if (members.length <= 1) await removeFiles(await atlasPhotoPaths(atlasId));
  check(await client.rpc('leave_atlas', { p_atlas: atlasId }));
}

export async function deleteAccount(userId) {
  for (const atlas of await listAtlases(userId)) await leaveAtlas(atlas.id);
  check(await client.rpc('delete_my_account'));
  await client.auth.signOut({ scope: 'local' });
}

// ---------- moments ----------
const toMoment = row => ({
  id: row.id, atlasId: row.atlas_id, authorId: row.author_id, authorName: row.profiles?.display_name || '',
  title: row.title, note: row.note, date: row.moment_date, position: row.position,
  createdAt: row.created_at, updatedAt: row.updated_at,
  commentCount: row.comments?.[0]?.count ?? 0,
  photos: [...(row.moment_photos ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(photo => ({ id: photo.id, path: photo.storage_path }))
});

export async function listMoments(atlasId) {
  const rows = check(await client.from('moments')
    .select('id, atlas_id, author_id, title, note, moment_date, position, created_at, updated_at, profiles(display_name), moment_photos(id, storage_path, sort_order), comments(count)')
    .eq('atlas_id', atlasId).order('moment_date').order('created_at'));
  return rows.map(toMoment);
}

export async function signUrls(paths) {
  if (!paths.length) return new Map();
  const rows = check(await client.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600));
  return new Map(rows.filter(row => row.signedUrl).map(row => [row.path, row.signedUrl]));
}

// Idempotent: safe to replay from the outbox after a dropped connection.
export async function saveMoment({ atlasId, userId, moment, added = [], removed = [] }) {
  const fields = { title: moment.title, note: moment.note, moment_date: moment.date, position: moment.position };
  const existing = check(await client.from('moments').select('id').eq('id', moment.id).maybeSingle());
  if (existing) check(await client.from('moments').update(fields).eq('id', moment.id));
  else check(await client.from('moments').insert({ id: moment.id, atlas_id: atlasId, author_id: userId, ...fields }));

  const keptCount = moment.photos.length;
  for (const [index, photo] of added.entries()) {
    const path = `${atlasId}/${moment.id}/${photo.id}.jpg`;
    check(await client.storage.from(PHOTO_BUCKET).upload(path, photo.blob, { contentType: 'image/jpeg', upsert: true }));
    check(await client.from('moment_photos').upsert({ id: photo.id, moment_id: moment.id, atlas_id: atlasId, storage_path: path, sort_order: keptCount + index }, { onConflict: 'id', ignoreDuplicates: true }));
  }
  if (removed.length) {
    const rows = check(await client.from('moment_photos').select('id, storage_path').eq('moment_id', moment.id).in('id', removed));
    if (rows.length) {
      await removeFiles(rows.map(row => row.storage_path));
      check(await client.from('moment_photos').delete().in('id', rows.map(row => row.id)));
    }
  }
}

export async function deleteMoment(momentId) {
  const rows = check(await client.from('moment_photos').select('storage_path').eq('moment_id', momentId));
  if (rows.length) await removeFiles(rows.map(row => row.storage_path));
  check(await client.from('moments').delete().eq('id', momentId));
}

// ---------- comments ----------
export async function listComments(momentId) {
  const rows = check(await client.from('comments').select('id, body, created_at, author_id, profiles(display_name)').eq('moment_id', momentId).order('created_at'));
  return rows.map(row => ({ id: row.id, body: row.body, createdAt: row.created_at, authorId: row.author_id, authorName: row.profiles?.display_name || 'Mitglied' }));
}
export async function addComment({ atlasId, momentId, userId, body }) {
  check(await client.from('comments').insert({ atlas_id: atlasId, moment_id: momentId, author_id: userId, body }));
}
export async function deleteComment(id) { check(await client.from('comments').delete().eq('id', id)); }

// ---------- realtime ----------
export function subscribeAtlas(atlasId, onChange) {
  let timer;
  const ping = () => { clearTimeout(timer); timer = setTimeout(onChange, 400); };
  const channel = client.channel(`atlas-${atlasId}`);
  for (const table of ['moments', 'moment_photos', 'comments']) {
    channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `atlas_id=eq.${atlasId}` }, ping);
  }
  channel.subscribe();
  return () => { clearTimeout(timer); client.removeChannel(channel); };
}
