# DESIGN.md · Atlas der Erinnerungen

## Identity
A private illustrated flight chart inside a daylight family album. The globe, not ornamental cards, carries the travel narrative. See `COMMIT-SHEET.md` for original decisions.

## Tokens
- Shell: `#edf3f3` cool off-white, ink `#1c3338`, muted `#546a6d`, lines `#d4dfdf`.
- Map: `#0d293b` deep sea, `#17475b` ocean, `#8db6ad` land, `#e98266` coral interaction.
- Headline: Fraunces 500; interface/copy: DM Sans 400/600/700. Fallback Georgia and sans-serif.
- Radius: small controls 7–8px, map/dialog 12–15px.
- Layout: asymmetrical editorial rail + sticky globe. Below 760px, story intro → globe → diary.

## Component contract
- Buttons: primary coral, secondary outline, quiet text/icon, danger only for deletion. All controls have focus-visible 3px coral outline.
- Timeline: list rows, one selected state. Detail follows the list rather than nesting more cards.
- Editor: single native modal; inline field validation; disabled save while writing; photo preview and removal.
- Presentation: native modal, text/photo two-column on desktop and one-column on mobile; disabled end navigation and keyboard arrows.
- Messages: one ephemeral status toast; storage errors beside the affected form or diary.
- Motion: globe plane follows route slowly; controls 160ms, toast 200ms. Reduced motion freezes plane. Avoid ornamental entrance reveals.

## Data
**Amended at the owner's request: accounts, cloud sync and sharing are now in scope.**
- Without `VITE_SUPABASE_URL` the app runs exactly like the MVP: local only, IndexedDB, JSON backup.
- With Supabase configured: email login, one or more *Atlanten* per member, members share an Atlas through an invite link. Moments and comments live in Postgres (EU region). Photos live in a **private** Storage bucket and are shown through short-lived signed URLs, never public URLs, because the photos show children.
- IndexedDB stays the offline cache and the outbox for changes made without network.
- Row Level Security on every table and on `storage.objects` is the only access control. The client holds the anon key only.
- No tracking, no analytics, no third-party sign-in.
- New UI (auth, atlas, members, settings, comments) reuses the dialog, field, button and toast contract above.
