---
name: Multiviewer slot access validation
description: Why saving a multiviewer layout can 403 even when it displays fine
---

# Multiviewer slot/stream access must match the display path

When validating which slot stream ids a user may save into a multiviewer layout,
use the SAME access resolution as the read/display path (`getAccessibleStreamsByIds`
/ `getUserAccessibleStreamIds`). Do NOT derive the viewable set from
`getUserStudios`.

**Why:** `getUserStudios` only returns *active* studios and *active* streams, while
the display path resolves any accessible stream regardless of `isActive`. Using the
studio path for write-validation means a layout that renders fine (GET 200) is
rejected on save/update with 403 the moment one of its slotted streams (or its
studio) is marked inactive. This produced a "Could not update layout" error.

**How to apply:** Any new endpoint that gates layout slots (POST/PATCH layouts,
shares, etc.) should validate against the accessible-streams set, not studio-level
active filtering, so view-ability and save-ability stay consistent.
