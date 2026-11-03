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
IndexedDB holds all content; export/import is the portable backup. Do not add online persistence, tracking, or sharing by default. Any new UI variant requires editing this contract first.
