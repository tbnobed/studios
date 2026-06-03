---
name: Multiviewer layout system
description: How multiviewer layouts are defined and rendered, and what must change in lockstep to add one.
---

# Multiviewer layout system

Layouts are a single source of truth in `client/src/lib/multiviewerLayouts.ts`
(`LAYOUT_DEFS`), where each layout is a set of CSS-grid cells `{r,c,rs,cs}`.
`MultiviewerGrid.tsx` renders any layout generically; `LayoutPicker.tsx` shows
grouped miniatures of the same defs. Both the editable `Multiviewer.tsx` page and
the chrome-less `MultiviewerWall.tsx` pop-out render through `MultiviewerGrid`
with `renderCell={(i,big)=>renderTile(i,big)}`, so they stay in visual parity.

**Rule:** to add a layout you must change it in TWO places in lockstep — the Zod
enum `MULTIVIEWER_LAYOUT_TYPES` in `shared/schema.ts` AND `LAYOUT_DEFS` in the
lib. Slot count is derived from `cells.length` (no separate slot table). Layout
type is `varchar` validated only by Zod, so there is NO Postgres enum and adding
a layout needs NO DB migration.

**Why:** the enum gates validation/typing; the registry gates rendering. A type
present in only one place either fails validation or renders as the `2x2`
fallback.

**Back-compat:** keep `2x2`/`3x3`/`4x4`/`featured` in the enum and registry —
existing saved layouts reference them; `fitSlots(slots, slotCount(type))`
resizes a saved `slots` array to the layout's tile count, preserving order.
