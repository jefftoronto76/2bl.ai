# Handoff — Upload progress card

Replaces the old "uploading" pill with a card that occupies the **same shape and position** as
the resolved card, so uploading → done reads as one card settling in place. Second pass (this
revision): uploads with no accompanying text no longer force an AI-written title/passage — they
land on a compact quick-actions card instead — and a failed upload now has a status line + retry.

Source of truth: `chat-widget-canvas.jsx` (`UploadingCard`, `UploadedCard`, `UploadErrorCard`,
`MemoryCard`, `UPLOAD_TICKER`, `UPLOAD_DEFAULT_TITLE`, `runMemory`), loaded by
`Heirloom Lander - Summer 2026 - Story Canvas.html`. Extract in `UploadingCard.jsx` alongside this
file. Builds on `design_handoff_memories` — read that first.

---

## 1. Known knowns

**Three states now, not two.** `running` → `ready` (or `error`) → `saved`. `ready` and `error`
are new; `draft` (full title+passage card) is now reached only by the `conversation` kind, which
has real transcript text to write from.

**Why uploads skip passage generation.** A bare file upload with no caption has nothing for the
archivist prompt to write from — forcing a passage there meant fabricating detail or producing a
generic "add a little about this" placeholder. `runMemory` now branches on kind: `conversation`
still calls `writeMemory` as before; photo/video/audio/document skip it entirely and go straight
from a simulated upload delay to `ready`, with a kind-generic default title
(`UPLOAD_DEFAULT_TITLE`, e.g. "A photograph, kept") and no passage.

**`ready` state — compact quick-actions card, not the big card.** Thumbnail-scale header (44px
icon chip, eyebrow, "Uploaded — add it to a story"), then the kind's quick actions (`K.extra` —
already existed per kind: photo → "Who's in this?" / "Add another", audio → "Keep the recording",
document → "Check the transcription", video → "Choose a still"), then the same story-picker chips
and Keep/Discard footer the full card uses. No title edit, no passage, no Rewrite (nothing to
rewrite).

**Running state — humming/glowing thumbnail**, not a flat pulsing icon. A soft blurred accent-color
halo breathes behind the kind icon (`up-glow`, 2.3s scale+opacity+blur) while the icon itself
pulses in place (`up-hum`) — reads closer to a generative-AI processing state than the old flat
icon pulse. Status ticker (`UPLOAD_TICKER`, per-kind copy, advances every 1.3s, crossfades via
`up-in`) and progress bar (caps at 92%, tied to ticker step) are unchanged from the first pass.

**Error state — status copy + retry**, not a silent stall. ~1 in 5 simulated uploads land on
`error`: red-tinted card, plain-language line ("Couldn't finish uploading — check your
connection."), a filled "Try again" button that re-runs the same upload (`runMemory(id, '', null,
kindKey)`), and Discard. Shakes in (`hl-shake`) to call attention to it, matching how the
composer already flags a failed sent message.

**Reduced motion respected.** `up-glow`, `up-hum`, `up-shimmer-bar`, `up-ticker` all killed under
`prefers-reduced-motion: reduce`.

---

## 2. Known unknowns

**Two error/retry patterns exist side by side and should probably become one.** The composer
already has a mature failed-message pattern (`Bubble`, `message.status === 'failed'`: red tint,
shake, "Not delivered · Tap to retry", tap-to-retry on the bubble itself). `UploadErrorCard` is a
second, separately-built implementation of the same idea for a different message type. Worth
generalizing into one shared error-status component/token set (copy tone, red tint, shake, retry
affordance) that both the message bubble and any tool-card (uploads, and future async operations)
draw from, rather than maintaining two parallel versions that will drift.

**Retry re-runs the same failure odds.** In this prototype, retrying an upload has the same
simulated 1-in-5 failure chance as the original attempt — there's no backoff, no distinction
between "still offline" and "should work now," and no cap on retry attempts.

**Progress bar and ticker are still time-based, not signal-based** (unchanged from the first
pass) — no real upload-progress event, no real analysis callback.

**We do not know real upload/analysis latency**, nor real failure rate — the 1-in-5 error rate is
a prototype convenience for demoing the retry UI, not a researched number.

**No cancel**, on any of the three states.

**Multi-file / batch upload is not addressed.**

**Real thumbnails vs. icon placeholders.** The glow/hum treatment still animates a generic kind
icon, not the actual file the user picked — no real file picker wired in yet (see
`upload/Heirloom-Upload-Flow-Handoff.md` §4a). Once that lands, the glow should probably wrap the
real thumbnail rather than an icon.

**What happens to the quick actions on the `ready` card?** `K.extra` buttons (e.g. "Who's in
this?") currently all just open the memory canvas (`onExtra` → `onOpen`) — none of them have a
distinct in-place behavior yet. That's a placeholder, not a designed interaction.

---

## 3. Where this attaches

Same attachment point as `design_handoff_memories` §7 — `running`/`ready`/`error` are three
render branches of the same memory-card component family, keyed off `message.state`.

## 4. QA checklist

- [ ] Uploading card occupies the same position/width as the resolved card (no layout jump)
- [ ] Running: thumbnail halo breathes (glow) and the icon pulses (hum) together, ~2.3s cycle
- [ ] Ticker advances every ~1.3s, per-kind copy, holds on last step if resolution is slow
- [ ] Progress bar reaches ~92% max, never snaps to 100 before the real result
- [ ] Uploads with no caption land on the compact `ready` card — no fabricated title/passage
- [ ] `ready` card shows the right quick actions per kind, story chips, Keep/Discard
- [ ] Failed upload shows red status line + "Try again" + Discard; retry re-attempts the upload
- [ ] `conversation` kind is unaffected — still gets the full title+passage card via `writeMemory`
- [ ] `prefers-reduced-motion: reduce` kills glow/hum/shimmer/ticker animations
- [ ] No console/text bug in the ticker ellipsis (regression check, carried from v1)

**Not coverable yet:** real progress/failure signal, consolidated error-status component, cancel,
multi-file batch, real thumbnails, designed quick-action behaviors. See §2.
