# Handoff — Memory Canvas & Photo Actions

Extends `design_handoff_memories` (package 3) with everything built since: a persistent
**memory canvas** (a side panel, not the sidebar list that package specified), photo-specific
actions on uploads, and the card-editing chrome. Read package 3 first — its object shape,
five kinds, and state-rule bugs (§6 there) still apply. This document only covers what's new
or changed.

Source of truth: `chat-widget-canvas.jsx` (`SessionMemoriesPanel`, `UploadThumb`, the photo/GPS
wiring) and `story-canvas-panel.jsx` (`CardView`), both loaded by
`Heirloom Lander - Summer 2026 - Story Canvas.html` — that's the interactive prototype, useful for
clicking through the flows. **This folder's `.ts`/`.tsx` files are the production-shaped reference
implementations** (TypeScript, semantic Tailwind, `lucide-react`) an engineer should actually work
from, translated from the prototype the same way package 3's files were:

| File | What it is |
|---|---|
| `types.ts` | `Upload` (extends the existing upload shape with `gpsFound`/`location`) and the canvas view-state union |
| `PhotoUploadActions.tsx` | Bookmark · Add-to-memory · GPS badge row under a ready photo upload |
| `writePhotoCaption.ts` | The archivist call seeded from a photo instead of a transcript |
| `MemoryCanvasList.tsx` | The panel's list view — browse mode and multi-select mode, in-panel save bar |
| `MemoryCardView.tsx` | The reshaped card chrome — header actions, footer action bar, independent scroll |
| `ScrollToLatestButton.tsx` | The chat nudge + its scroll-anchor hook (not memory-specific) |

No Tweaks panel covers this package yet — the prototype file is the only place to click through
the live behaviour; these reference files are what to build from.

**Scope.** Front-end UX only, same as package 3. Storage, real GPS/EXIF extraction, and media
pipelines are out of scope and flagged as considerations below.

---

# 1. Known knowns (new since package 3)

**The memory canvas is a side panel, not a sidebar list.** Package 3 specified sidebar counts
only; no reading surface existed. This package adds one: a right-hand panel that slides in
(sidebar collapses to a 60px rail, chat/panel split ~40/60, resizable divider). It has two views:

- **List view** (`SessionMemoriesPanel`) — every memory from the current session, opened via the
  bookmark icon in the header chrome.
- **Card view** (`CardView`, from `story-canvas-panel.jsx`) — one memory, opened by clicking a
  row in the list, or automatically after a memory is kept.

**Photo uploads get two actions.** Once a shared photo finishes uploading, two buttons appear
below it, styled like message actions (hidden until hover, matching the rest of the row):

| Action | Behaviour |
|---|---|
| Bookmark | Identical to the existing manual-bookmark path in package 3 — opens the same inline draft card, seeded with an AI caption instead of transcript context (see §3). |
| Add to a memory | Opens the memory canvas in **select mode**. |

**Add-to-memory is a multi-select action, not a picker.** Clicking "Add to a memory" opens the
list view with every row checkable. The user can check as many memories as they want; a **Save**
bar appears inside the panel (bottom chrome, not a toast or a bar outside the canvas) once at
least one is checked. Save confirms, shows "Saved," and the panel closes.

**CardView's chrome changed shape.** The header keeps only title + eyebrow/date meta. Its two
actions are now `+` (add this memory to a story) and `X` (close) — the overflow menu is gone.
What used to live behind that menu (Talk about this / Use as a base / Remove) is now a persistent
footer bar at the bottom of the card. The image + passage scroll independently between header and
footer.

**A "GPS data found" indicator.** A third, always-visible (not hover-gated) icon next to
bookmark/add-to-memory on a ready photo upload. **Simulated** — every successful photo upload is
flagged as having GPS for demo purposes; there is no real EXIF/location extraction. See §4.

**A scroll-to-latest nudge.** Standard pattern: when the chat transcript is scrolled up, a
floating circular button (chevron-down) appears at the bottom of the scroll area; clicking it
smooth-scrolls to the latest message. Not memory-specific, but shipped in this pass.

---

# 2. Known unknowns (new to this package)

- **Real GPS/EXIF extraction is entirely unbuilt.** The badge is cosmetic. What actually needs to
  happen server-side — reading EXIF GPS tags on upload, reverse-geocoding, what's stored, what's
  shown when a user taps the badge (currently nothing; it's non-interactive) — is undecided.
- **What does tapping the GPS badge do?** Right now: nothing. Likely candidates: show a map pin
  with place name, prefill a location field on the eventual memory, or nothing (silent
  confirmation only). Not decided.
- **Photo captions are pure placeholder text**, not a real vision-model description. `writePhotoCaption()`
  asks the model to write an *inviting-you-to-fill-in-details* caption blind, with no image data —
  there is no multimodal call. If/when a real caption pipeline exists (a model that actually sees
  the photo), this function is where it plugs in.
- **Add-to-memory has no data model.** Checking a memory in select mode currently just increments
  a local `photoCount` field and fires a toast — there is no real attachment of the photo into the
  memory's media. What "a photo belongs to a memory" means in the object model (§3) is undecided.
- **The memory canvas has no sorting/filtering.** Lists every memory on the account in save order.
  Needs a plan (by story, by date, a search field) before memory counts grow past a screenful.
- **CardView's footer actions assume desktop width.** Three buttons (`Talk about this`, `Use as a
  base`, `Remove`) in one row — not verified at narrow panel widths or on mobile.
- **Resizable split persistence.** The chat/canvas divider position isn't saved across sessions;
  unclear if it should be.

---

# 3. Photo bookmark — how it differs from the manual bookmark

Reuses the exact same draft-card mechanism as package 3's manual bookmark (`runMemory`), with one
difference: instead of summarizing the transcript, it calls `writePhotoCaption()`, which asks the
model (or falls back to a canned caption) for placeholder text appropriate to a just-shared photo
with no known details yet. The resulting draft card is kind `photo`, so it already gets the
media-first layout from package 3 §5 (media block before title) — no new layout was needed.

```js
// chat-widget-canvas.jsx
const bookmarkUpload = (uploadId) => {
  const up = messagesRef.current.find(x => x.id === uploadId);
  runMemory(null, '', null, 'photo', up?.upload?.photoSrc);
};
```

**Transition on click.** The button itself has no click animation — clicking it inserts a
`running` pill into the transcript, which resolves into the `draft` card using package 3's
existing entrance transition (§5 there): 260ms rise, opacity 0→1, `translateY` 10px→0, scale
.98→1, `cubic-bezier(.22,1,.36,1)`. Nothing new was built for this pass; it's the same transition
every other bookmark path already uses. Don't add a separate micro-animation to the icon itself.

---

# 4. GPS indicator — object shape (as prototyped)

```ts
type Upload = {
  kindKey: 'photo' | 'video' | 'audio' | 'document'
  filename: string
  photoSrc?: string        // demo only — a real upload has no client-side URL like this
  status: 'uploading' | 'ready' | 'failed'
  gps?: boolean            // simulated: true for every successful photo upload
}
```

In production this needs to become `gpsFound: boolean` (or richer — `{ lat, lng, place }`) set by
whatever actually reads the file's EXIF data server-side, delivered back to the client once
processing completes. The **badge's visual behaviour is real and can ship as designed** — always
visible once true, not hover-gated (unlike bookmark/add-to-memory, which are hover-only to match
the rest of the row). Only the *source* of the `true` is fake.

---

# 5. Add-to-memory — select-mode UI

`SessionMemoriesPanel` takes a `selectMode` boolean and an `onConfirm(memIds: string[])` callback.
In select mode:

- Each row shows no separate checkbox — **the row itself highlights** (accent border + soft
  background) when checked. This was a deliberate simplification; an earlier iteration had a
  checkbox square, removed because the highlight alone reads clearly enough.
- A footer bar appears inside the panel (not the chat, not a toast) once ≥1 row is checked, with a
  count and a **Save** button.
- Save confirms, shows "Saved" in place of the button, and the panel auto-closes after ~700ms —
  long enough to register the confirmation before it disappears. A toast also fires, naming the
  memory (or count, if more than one).

This pattern — count → in-panel save bar → auto-close — is worth reusing anywhere else in the
canvas that grows a multi-select in the future (e.g. bulk-move memories between stories).

---

# 6. CardView chrome — before / after

| | Before (package 3 prototype) | Now |
|---|---|---|
| Header right side | Move-to-story (folder icon) + overflow menu (⋮) | `+` (add to a story) + `X` (close) |
| Talk about this / Use as a base / Remove | Behind the ⋮ dropdown | Persistent footer bar, always visible |
| Content scroll | Scrolled with header fixed | Unchanged — now also scrolls independently above the new footer |

The story-move popover (clicking `+`) is functionally identical to the old folder button — same
list, same `onMoveStory` callback — only the trigger icon and position changed.

---

# 7. Where this attaches in the real codebase

Same shell-isolation constraints as package 3 apply (see that doc's §7) — the canvas is
Heirloom-only, must not live in `components/chat/`, and any shared row (photo action buttons)
takes an optional prop the widget shell can omit.

| Add | To | Notes |
|---|---|---|
| Photo bookmark / add-to-memory buttons | Wherever production renders an uploaded photo attachment | Mirror `ActionIconButton` usage from package 3, hover-gated like existing message actions |
| GPS badge | Same location, always-visible (not hover-gated) | Needs the real `gpsFound` field from the upload pipeline first |
| Memory canvas (list + card) | New Heirloom-only panel component | Not the sidebar from package 3 — this is additive, a new surface |
| CardView footer actions | New Heirloom-only component | `onTalk` / `onFork` / `onDelete` — same handlers as before, just relocated |

---

# 8. Suggested rollout order

Roughly least-risky / most-decided → most-open, so each phase can ship without blocking on the
next:

1. **CardView chrome (header + footer split).** Pure layout change, no new data, no backend
   dependency. Ship first.
2. **Photo bookmark.** Reuses the existing `runMemory` draft-card path from package 3 almost
   unchanged — only the caption source differs. Low risk once package 3's tool-message
   architecture question (its §2, "where does a memory card live in the transcript") is resolved,
   since this depends on that same mechanism.
3. **Add-to-memory (multi-select).** New UI pattern (in-panel select + save bar), but no new
   backend contract required *yet* — needs the data-model question in §2 answered before the
   "added" state means anything beyond a toast.
4. **Scroll-to-latest nudge.** Independent of everything else here; ship anytime.
5. **GPS indicator.** Ship the **badge and its always-visible display rule** now if desired — it's
   pure UI. Do not build against the simulated `gps: true` flag as if it were real; wire it to an
   actual `gpsFound` field once the extraction pipeline exists. Until then, consider shipping it
   behind a flag or leaving it out of production, since a permanently-true badge is misleading.

---

# 9. QA checklist (additions to package 3's)

- [ ] Bookmark and add-to-memory hidden until hover on a photo attachment; GPS badge is not
- [ ] Bookmarking a photo opens the same draft-card flow as a manual bookmark, seeded with a
      placeholder caption, media shown hero-first
- [ ] Add-to-memory: checking multiple rows keeps them all checked (not a single-select)
- [ ] Save bar appears only once ≥1 row is checked, lives inside the panel
- [ ] Save shows "Saved," panel auto-closes, toast names what was added
- [ ] CardView: `+` opens the story-move popover; `X` closes; footer actions all reachable without
      an overflow menu
- [ ] Image + passage scroll independently of the fixed header and footer
- [ ] Scroll-to-latest button appears only when scrolled away from the bottom, scrolls smoothly
