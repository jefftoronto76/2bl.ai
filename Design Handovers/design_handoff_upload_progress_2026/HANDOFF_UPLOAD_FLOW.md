# Handoff — Media upload flow (post-tap)

Everything that happens after the visitor taps **+** in the composer and picks an action, through to that upload becoming (or failing to become) a memory. Upload-only — memory creation/save/discard/rewrite for text conversation turns is unchanged and out of scope here.

**Source of truth (design):** `chat-widget-canvas.jsx` — `SOURCES`, `runMemory`, `UploadingCard`, `UploadedCard`, `UploadErrorCard`, `UPLOAD_TICKER`, `UPLOAD_DEFAULT_TITLE`.
**Production-ready components:** `tsx/UploadRunningCard.tsx`, `tsx/UploadReadyCard.tsx`, `tsx/UploadErrorCard.tsx`, `tsx/uploadCopy.ts` — written to the real codebase's conventions (Tailwind semantic tokens, `lucide-react`, `memoryKindOf`/`MEMORY_KINDS` from `components/shells/membership/memory/memoryKinds.ts`). Drop into `components/shells/membership/memory/` alongside `MemoryCard.tsx`.

---

## 1. Known knowns

**Six menu entries, three kinds:**

| Menu label | Kind |
|---|---|
| Take a photo / Photo library | `photo` |
| Record a video | `video` |
| Scan a document / Browse files | `document` |
| Record audio | `audio` |

**The state machine:**
```
tap menu item → running → ready ──Keep this──▸ saved
                        └─ error ──Try again──▸ running (retry)
                        (ready/error) ──Discard──▸ discarded
```

**`running`** (`UploadRunningCard`) — same card chrome as a full `MemoryCard` (border, radius, shadow) so running → ready reads as one card settling, not a jump. Photo/video get a full media block: a breathing accent glow behind a pulsing kind icon. Audio/document get a compact row: icon + shimmer bar. Below both: a ticker cycling every ~1.3s through kind-specific copy (`UPLOAD_TICKER`), and a progress bar tied to the same steps, capped at 92%. No cancel.

**`ready`** (`UploadReadyCard`) — reached only when there's no caption to write a passage from. Compact, not the full card: 44px icon chip, eyebrow, "Uploaded — add it to a story," a checkmark. Then the kind's quick actions (`MEMORY_KINDS[kind].extra` — e.g. photo: "Who's in this?" / "Add another"), story-picker chips, then **Keep this** / **Discard**. No title field, no passage, no Rewrite.

**`error`** (`UploadErrorCard`) — plain-language failure line, **Try again** (re-attempts the same upload), **Discard**. Shakes in on entry.

**`saved`** — same slim receipt every other memory kind already uses (icon + title + "Kept in {story}"). No new component needed.

**Default titles for a captionless upload:** `UPLOAD_DEFAULT_TITLE` — photo "A photograph, kept," video "A moment on film, kept," audio "A voice, kept," document "A paper, kept."

**The real media-upload pipeline already exists and works.** `mediaItems`, `/api/media/:id/url`, rendered inline as `InlineImage`/`InlineFileChip`/`FailedUploadChip` in `MessageList.tsx`. A photo/audio/document upload already lands as a real message attachment today. What doesn't exist is the memory-card *wrapper* around it (running/ready/error, quick actions, story chips) — that's what this package specifies and what the three new components implement.

**Reduced motion:** all animations (glow/hum/shimmer/ticker) must respect `prefers-reduced-motion` — components above gate on `motion-safe:`/`motion-reduce:` Tailwind variants.

---

## 2. Known unknowns

### Blocking — needs a decision before "Keep this" can be wired for real
`services/crm/memories.ts`'s `createMemoryFromAnchor` derives the memory body from the **anchor message's own text content** and returns a 400 (`empty_body_after_marker_strip`) if nothing's left after markers are stripped. A captionless upload has no text — so today, tapping **Keep this** on `UploadReadyCard` has nowhere to write to; it isn't designed to fail there, it just breaks.

Two ways to resolve, need a decision, not a design guess:
- **A.** Allow an empty/null `body` on the `artifacts` row for non-`conversation` kinds — the memory just is title + kind + story, no passage, ever.
- **B.** Require a caption before `UploadReadyCard` is reachable at all — changes the upload UI (a caption prompt) more than the card itself.

`UploadReadyCard`'s `onKeep` prop is typed to surface a rejected promise rather than swallow one, specifically so this gap shows up in integration instead of failing silently.

### Not blocking, but undesigned
- **Video has no upload path in production at all** (`MessageList.tsx`'s `sourceKindForUserMessage` says so directly) — "Record a video" has nothing server-side to attach to yet.
- **Three separate error-status patterns now exist** — `UploadErrorCard` (this doc), `MemoryErrorLine` (single-line, `components/shells/membership/memory/MemoryCard.tsx`), and `MessageBubble`'s failed-delivery bubble. Worth converging on one shared component/token set; not done here.
- **Ticker/progress are time-based**, not tied to a real upload or analysis event. No real latency or failure-rate number exists yet — the ~1-in-5 simulated failure rate in the prototype is a demo convenience, not a researched figure.
- **Retry has no backoff or attempt cap.**
- **Quick actions (`Who's in this?` etc.) are unwired** — same as the rest of the memory system, they fire a toast. Undesigned past that.
- **Multi-file / batch upload is not addressed.**
- **Real thumbnails vs. icon placeholders** — the glow/hum treatment animates a generic kind icon, not the file the visitor picked.

---

## 3. QA checklist

- [ ] All six menu entries map to the right kind, running card matches
- [ ] Running → ready holds card position and width, no jump
- [ ] Ticker + progress bar advance correctly, cap at 92%, per-kind copy
- [ ] `ready` card shows right quick actions, story chips, Keep/Discard
- [ ] Error card shakes in, retry re-attempts, discard removes it
- [ ] `prefers-reduced-motion` kills glow/hum/shimmer/ticker
- [ ] **Not testable until §2's blocking decision is made:** Keep this on a captionless upload actually saving
