const env = import.meta.env ?? {};
export const SUPABASE_URL = env.VITE_SUPABASE_URL || '';
export const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || '';
// Without these two values the app behaves like the local-only MVP.
export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
// Invite links must point at the hosted web app, never at capacitor://localhost.
export const APP_URL = (env.VITE_APP_URL || (typeof location !== 'undefined' ? location.origin : '')).replace(/\/$/, '');
export const PHOTO_BUCKET = 'photos';
