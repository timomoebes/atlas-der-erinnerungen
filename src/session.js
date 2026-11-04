// Shared mutable app state for the account/atlas UI and the diary UI.
export const session = {
  user: null,      // { id, email }
  profile: null,   // { display_name }
  atlases: [],     // [{ id, title, dedication, from, to, role }]
  atlas: null,     // current atlas
  repo: null,      // data repository for the current atlas
  handlers: {}     // set by main.js: selectAtlas, reload, importLocal, afterSignOut
};

export const LOCAL_ATLAS = {
  id: 'local', local: true, title: null, role: 'owner',
  dedication: 'Ein Ort für alles, was wir unterwegs nicht vergessen wollen. Für dich, für Bia und für die Geschichten, die noch kommen.',
  from: { name: 'Berlin', lat: 52.52, lon: 13.405 },
  to: { name: 'Paphos', lat: 34.775, lon: 32.425 }
};

export const ROLE_LABEL = { owner: 'Besitzer:in', editor: 'Schreibt mit', viewer: 'Liest mit' };

export function canEditMoment(moment) {
  if (!session.atlas || session.atlas.local) return true;
  if (session.atlas.role === 'owner') return true;
  return session.atlas.role === 'editor' && moment.authorId === session.user?.id;
}
export const canWrite = () => !session.atlas || session.atlas.local || session.atlas.role !== 'viewer';
