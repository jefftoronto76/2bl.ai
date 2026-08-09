# Lander v-latest — image handover

Source: `Heirloom Lander - Summer 2026 - Story Canvas.html`, sections: hero image collage (`MemoryConstellation`) and scroll-thread images (`PageThread`).

## How images are matched — the labeling scheme
Every image placeholder on the page is an `<image-slot id="...">` element. The `id` is the permanent key a real image gets wired to; the placeholder text shown inside each empty slot (`Hero-0`, `Hero-1`, `Family`, etc.) is a human-readable label pointing at that same id, so you can match your photo files to slots by eye, then hand the id→file mapping to whoever wires the real assets.

**Hero collage (10 photos, `MC_PHOTOS` array, ~line 391):**
- Center image = `Hero-0` → id `mc-beach`.
- The remaining 9 photos are numbered `Hero-1`–`Hero-9` clockwise starting from the photo nearest 12 o'clock, going around the outside of the collage:

| Label | id |
|---|---|
| Hero-0 (center) | mc-beach |
| Hero-1 | mc-couple |
| Hero-2 | mc-apt |
| Hero-3 | mc-mtn |
| Hero-4 | mc-birthday |
| Hero-5 | mc-van |
| Hero-6 | mc-grad |
| Hero-7 | mc-dog |
| Hero-8 | mc-hiker |
| Hero-9 | mc-swing |

There's also one video slot in the same collage, id `mc-video` (placeholder "Video") — not part of the Hero-N numbering since it isn't a still image.

**Scroll-thread images (`PageThread`, ~line 986):** four beads that light up as the page scrolls, ids `th-bead-0`, `th-bead-2`, `th-bead-4`, `th-bead-6`. Each one's placeholder is its own caption text, not a generic number — currently `Family`, `Pets`, `Friendships`, plus one more still unset (`th-bead-6`, caption "A day"). Match your photo to whichever caption fits.

## Matching your images to slots
1. Name your image files (or just keep a simple list) using the labels above — e.g. `Hero-0.jpg`, `Family.jpg`.
2. Drop this file open in a browser and drag each image onto its matching slot — it persists to a sidecar file and reloads correctly from then on. **Or:** send the labeled folder back and I'll drop them in for you.
3. For production (outside this prototype), each `<image-slot id="mc-beach">` becomes a real `<img src="...">` (or CDN-backed component) — the id is the only thing that needs to carry over; swap the element, keep the id as your asset key.

## Mobile — flagged, not yet verified tight
Current responsive behavior: `hero-cover-grid` collapses to a single column under 920px and the hero collage (`mc-scaler`) scales down proportionally by width, so the 10-photo layout should shrink as one unit rather than reflow. This has **not been re-checked at phone width since the recent image-label changes** — before this ships, do a pass at ~390px width to confirm nothing overlaps or clips once real photos (not placeholders) are in. Flagging this explicitly rather than asserting it's done.

## Files in this package
- `Heirloom Lander - Summer 2026 - Story Canvas.html` — the lander, current state.
- `image-slot.js` — the placeholder/upload component every image and video slot uses.
