# Pass 2 — New hero: the memory constellation (+ image handling)

**Goal:** replace the hero's right-side visual with the scattered **memory constellation** — a collage of photos and "chrome" cards (audio player, voice memo, handwritten note, message bubble, location pin, date chip, address label, video player) joined by a curved dotted connector. Left copy column is unchanged.

**Reference:** `Heirloom_Combined Lander v2.html` → switch to **Constellation** mode. Component in source: `MemoryConstellation`.

### Target look
![Constellation hero — target](screenshots/pass-2-hero.png)

---

## Layout model (important)
The collage is a **fixed coordinate canvas of `1080 × 840`** with every element absolutely positioned inside it, then the whole canvas is **scaled to fit** its column. This is deliberate — 20 overlapping, rotated elements are only sane in one fixed space.

- **Scaling:** in the prototype a `ResizeObserver` sets `scale = containerWidth / 1080` and the canvas gets `transform: scale(var(--s))`. **In production prefer CSS container-query units** so it renders server-side with no hydration pop: `width: 1080px; transform: scale(calc(100cqw / 1080)); transform-origin: top left;` on the canvas, `container-type: inline-size` on the wrapper, wrapper height `= 840 * scale`.
- **Hero grid:** left copy column `minmax(340px,430px)`, collage column `1fr`, gap 40, max-width ~1340; collage may bleed toward the right edge.
- **Responsive:** below **920px** the hero stacks to one column and the collage sits **below** the copy (matches the mobile mockup). Keep it visible; scale to full column width.

Copy positions/rotations for every element from the source (`MC_PHOTOS` array + the chrome-card blocks). Don't eyeball — lift the `left/top/width/height/rotate` values directly.

---

## Element inventory
**11 photo slots** (rounded 14, `object-fit: cover`, per-element rotation −4°…+3°, photo shadow from Pass 1). IDs and subjects:

| id | subject | note |
|---|---|---|
| `mc-hiker` | lone hiker over a lake/mountains | |
| `mc-swing` | child laughing on a swing | |
| `mc-couple` | couple, foreheads together, bokeh | |
| `mc-dog` | golden retriever running in a meadow | |
| `mc-beach` | friends around a beach campfire | **centrepiece (largest)** — LCP `priority` |
| `mc-apt` | cosy apartment interior | |
| `mc-grad` | graduate raising diploma | |
| `mc-birthday` | birthday cake with candles | |
| `mc-mtn` | two hikers with packs, summit | |
| `mc-van` | road-trip van on a desert highway | |
| `mc-video` | child running through water | rendered as a **video card** (play button + scrubber overlay) |

**Chrome cards** (pure CSS/SVG — no images): audio player ("Grandpa's story", waveform, 03:47), voice memo (mic + waveform, 00:28), **handwritten note** (Caveat font, "Never forget where you came from…"), message bubble ("Maya · That trip was unforgettable" + heart reaction), location pin ("Banff National Park · Aug 12, 2017"), date chip ("JUN 21"), address label ("First apartment · San Francisco, CA"), heart doodle. Rebuild these from the source markup — icons are `lucide-react`.

---

## 🖼 Image handling — the clear plan
These are **decorative marketing images, fixed and curated by us** — *not* user uploads. In the prototype they're drag-and-drop `<image-slot>` placeholders purely so the design can be filled in; **do not** ship image-slot.

Production:
1. **Assets:** place the 11 curated photos in `public/heirloom/hero/` (e.g. `hiker.jpg`, `beach.jpg`, …). If marketing needs to swap them without a deploy, back them with a small CMS/Storage map instead — but a static `public/` set is fine and fastest.
2. **Render with `next/image`:** each slot is a positioned box of fixed `width/height`; put `<Image fill sizes="..." style={{objectFit:'cover'}}>` inside, wrapped in a `rounded-[14px] overflow-hidden` box with the rotation on the wrapper. `object-fit: cover` handles framing (the composition tolerates small crops).
3. **Performance / LCP:** the collage is image-dense. Mark **`mc-beach`** (and optionally `mc-couple`) `priority`; let the rest **lazy-load** — most of the collage is below the fold on mobile, so this is free. Use `next/image` AVIF/WebP + blur placeholders.
4. **Alt text:** each photo gets a short descriptive alt (subjects above). The chrome cards are decorative — `aria-hidden`.
5. **No user-content wiring.** There is no upload/persistence here; ignore the prototype's slot persistence entirely.

---

## Connector line (curved dotted thread through the cards)
One SVG over the canvas (`viewBox 0 0 1080 840`), **behind the cards**. It visits the elements in a set order and, for each consecutive pair, draws a **quadratic curve from one card's edge to the next card's edge** (interrupted by the cards, so it reads as a ribbon stitching them together), with a small ring **node** at each gap.

Algorithm (from source `buildConstellation`):
- For pair (A,B): compute the edge point on A facing B's centre and on B facing A's centre (ray-to-rect-boundary, +6px outward margin).
- Bow the curve **perpendicular to the chord, away from the cluster centre** `(531,396)`: `bow = clamp(gap*0.36, 20, 72)`; control point = chord midpoint + perpendicular·bow. Emit `M e1 Q ctrl e2` per segment (each segment starts with `M` so cards interrupt the line).
- Node ring at the curve's midpoint: r 4.5, fill `background`, stroke `accent` @ ~55% opacity, 1.6px.
- Stroke: solid, `accent` @ ~40% opacity, 1.7px, round caps. **Not dashed** — it's a fine continuous line.

---

## ✅ Pass 2 acceptance checklist
- [ ] Hero right side shows the collage: 11 photos + the chrome cards, positions/rotations matching the source at desktop width.
- [ ] Photos load via `next/image` from curated assets; `mc-beach` is `priority`, others lazy; nothing stretched or clipped oddly.
- [ ] The curved dotted connector runs card-edge to card-edge with ring nodes in the gaps (solid fine terracotta line, not dashes).
- [ ] Handwritten note renders in **Caveat**; audio/voice waveforms, message bubble, pin, date chip, address label all present.
- [ ] Left copy column unchanged; collage bleeds right on desktop and **stacks below copy under 920px**.
- [ ] No `<image-slot>` and no upload/persistence code shipped.
