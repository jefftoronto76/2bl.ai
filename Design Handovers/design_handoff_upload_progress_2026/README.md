# Handoff — Upload progress card

Replaces the old "uploading" pill (small pulsing icon + one line of static text, positioned
differently from the resolved card) with a card that occupies the **same shape and position** as
the finished memory card, so the swap from uploading → written reads as one card settling in
place rather than a small thing disappearing and a big thing appearing elsewhere.

Source of truth: `chat-widget-canvas.jsx` (`UploadingCard`, `MemoryCard`, `UPLOAD_TICKER`), loaded
by `Heirloom Lander - Summer 2026 - Story Canvas.html`. Extract in `UploadingCard.jsx` alongside
this file. Builds directly on `design_handoff_memories` — read that first; this only changes the
`running` state of the same card.

---

## 1. Known knowns

**Card shape is identical to `draft`/`saved`.** Same gutter spacer (32px) + max-width 520 body,
same radius 16 / border / shadow / header row (kind icon + eyebrow). Only the body content
differs. This is the fix for the reported bug: the running state used to be a small pill,
positioned inline with an avatar, that had no visual relationship to the card that replaced it.

**Media area pulses instead of sitting static.**
- Photo / video kinds: the same aspect-ratio frame the resolved card uses (16:10 / 16:9), showing
  the kind's icon at 26px, pulsing (`hl-pulse`, scale + opacity, 1.6s), over a shimmer sweep
  (`up-sweep`, a soft accent-tinted gradient band moving left→right, 1.8s).
- Audio / document kinds: the same row layout the resolved card's icon+bar would occupy — a
  pulsing icon circle plus a shimmering placeholder bar standing in for the waveform/page.
- `conversation` kind (no media) shows no media block, same as the resolved card.

**A status ticker, not a static line.** Per-kind copy in `UPLOAD_TICKER` (3–4 short steps, e.g.
photo: "Uploading your photo" → "Looking closely" → "Remembering the moment" → "Almost there").
Advances one step every 1.3s via `setInterval`, holds on the last step (does not loop) if
resolution takes longer than the step sequence. Each step change crossfades in (`up-in`, 350ms).

**A progress bar tied to the same steps**, not an independent/fake timer. `progress =
((stepIndex + 1) / totalSteps) * 92` — caps at 92% so it never visually completes before the
real result lands; the state flips to `draft` (the resolved card mounts) at whatever true
progress is, not exactly 100%.

**Reduced motion respected.** All four animations (`up-sweep`, `up-pulse` via `hl-pulse`,
`up-ticker` via `up-in`) are killed under `prefers-reduced-motion: reduce`.

---

## 2. Known unknowns

**The progress bar and ticker are time-based, not signal-based.** They advance on a fixed
1.3s interval regardless of what's actually happening upload-side. There is no real progress
percentage from an XHR/fetch upload event, no real "analyzing" callback from the vision/OCR/STT
call — the ticker is a deterministic proxy for "something is happening," tuned only by eye against
the prototype's own simulated ~1.4s+ `writeMemory` delay.

**We do not know real upload/analysis latency.** Same open question as `design_handoff_memories`
§2: if a real upload + vision/OCR/STT round trip takes materially longer than a few seconds, the
ticker will hit "Almost there" and sit there — that reads as stuck. **Needs a real number**, and
ideally a real progress event to drive the bar instead of the fixed interval.

**No failure state.** If the real upload or analysis call fails, this card has no error/retry
treatment — same gap flagged in `design_handoff_memories` §2, now also true for the progress
bar specifically (a bar frozen at 92% with no explanation is worse than the old static pill).

**No cancel.** Same as the base memory card — no affordance to cancel an in-flight upload.

**Multi-file / batch upload is not addressed.** This card assumes one item uploading at a time.
The `upload/` package's "Multiple" pill (`Process one by one` / `Add all to a chapter`) implies a
queue or batch progress view that doesn't exist here.

**Real thumbnails vs. icon placeholders.** The photo/video media area currently pulses a generic
icon, not the actual image/video frame the user picked (there's no real file picker wired in yet —
see `upload/Heirloom-Upload-Flow-Handoff.md` §4a). Once real file selection lands, decide whether
the thumbnail should show the actual local preview (via object URL) under the shimmer/pulse, which
would read as more "modern" than an icon — likely yes, but unbuilt.

---

## 3. Where this attaches

Same attachment point as `design_handoff_memories` §7 — this card is the `running` render branch
of the same memory-card component family. No new attachment surface; implement it as part of that
same card component, keyed off the same `state === 'running'`.

## 4. QA checklist

- [ ] Uploading card occupies the same position/width as the resolved card (no layout jump)
- [ ] Photo/video: icon pulses over a shimmer sweep, correct aspect ratio per kind
- [ ] Audio/document: icon circle pulses, placeholder bar shimmers
- [ ] Ticker advances every ~1.3s, per-kind copy, holds on last step if resolution is slow
- [ ] Progress bar reaches ~92% max, never snaps to 100 before the real result
- [ ] `prefers-reduced-motion: reduce` kills all four animations
- [ ] No console/text bug — ticker renders a real "…" (regression: it once rendered a literal
      escaped `\u2026` string instead of the character)

**Not coverable yet:** real progress signal, failure/retry, cancel, multi-file batch, real
thumbnails. See §2.
