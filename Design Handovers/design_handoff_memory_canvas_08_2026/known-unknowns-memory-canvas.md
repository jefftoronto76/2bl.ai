# Known Unknowns — Memory Canvas & Photo Actions (companion to README)

Working through each open question from the handoff's §2, one at a time,
confirmed with Jeff before any becomes a build decision. Status per item:
**Confirmed** (locked, ready to build against) or **Open** (still being
worked through).

---

## 1. Add-to-memory's data model

**Status: Confirmed — full redesign (Option B), fully locked**

Full redesign confirmed. Both relationships are many-to-many, via real
join tables — not Notion's single-parent-per-block model, deliberately
more flexible:

- **Photo ↔ artifact**: many-to-many. A photo can attach to multiple
  memories/artifacts. New join table replacing the single `artifact_id`
  FK on `media_items`.
- **Memory ↔ story**: many-to-many. A memory can belong to multiple
  stories simultaneously. `story_id` collapses into the self-referential
  artifact model — stories become `type: 'story'` artifacts — via a
  second join table (artifact-to-artifact containment), not a simple
  `parent_artifact_id` column, specifically to allow multi-story
  membership.

Reasoning: flexibility chosen deliberately over Notion's simpler
single-parent pattern, to avoid a costly rework later if a stricter model
turned out to be wrong.

Validated against real precedent: the underlying "one type, self-
referential" concept matches Notion's block model, proven at scale — the
specific choice to make containment many-to-many rather than
single-parent is Jeff's own deliberate flexibility call, not itself an
industry pattern being copied.

**This is a real, non-trivial schema proposal** — two new join tables,
`artifacts.type` gaining a `story` value, `media_items.story_id` and
`artifact_id` both being deprecated in favor of the join tables. Full
schema proposal to be written up separately for Jeff's review/execution
in Studio, per the standing DB-ownership rule — not something to build
around blindly once implementation starts.

---

## 2. Real GPS/EXIF extraction

**Status: Confirmed**

Extract real EXIF GPS tags server-side during upload processing
(lightweight header-only read, no full image decode). Store raw
`lat`/`lng` only. No reverse-geocoding (place names) this pass — deferred
along with the mapping feature the badge tap will eventually lead to.

---

## 3. What tapping the GPS badge does

**Status: Confirmed**

Stub — no-op for now. Real behavior (map pin, place name, etc.) deferred
to a future mapping feature.

---

## 4. Real photo captions

**Status: Confirmed**

`writePhotoCaption()` is unnecessary — a real, working vision pipeline
already exists in production (`processImage`,
`services/media/processor.ts`): every uploaded photo is sent to Claude
Haiku vision automatically on upload, returning a real
`{caption, classification, extracted_text}`, stored in
`media_items.derived_content`. This is the same mechanism already
confirmed working for Sage's in-chat photo descriptions.

Resolution: the photo-bookmark flow should read the existing
`derived_content` for the draft card's seed text, not call a separate
blind placeholder function. No new vision integration, no new cost —
just point the existing draft-card mechanism at data that's already
there. This also means the caption is real from day one, not a "known
gap" needing a future fix.

---

## 5. Memory canvas sorting/filtering

**Status: Confirmed**

Deferred — ship with simple save-order listing, revisit once it's live in
production and real usage shows what's actually needed.

---

## 6. CardView footer at narrow/mobile width

**Status: Confirmed**

Needs real handling, not shipped unverified — three footer buttons must
work correctly at mobile widths before this is done.

---

## 7. Resizable split persistence

**Status: Confirmed**

Reset each session — don't persist the chat/canvas divider position.
Small UI nicety, not worth a client-storage decision now, and easy to
add later if it turns out people want it.

---

## Next step

All seven items confirmed. Ready to move from Known Unknowns to an
implementation plan — item 1's schema redesign (two join tables,
`artifacts.type` gaining `story`, deprecating `media_items.story_id`/
`artifact_id`) needs its own written proposal for Jeff's review before
any code work starts, per the standing DB-ownership rule.
