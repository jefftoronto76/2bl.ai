# Stage 2 \u2014 Card anatomy & icons

## Card structure (`function MediaCard`)
Vertical, image-forward card:
1. **Thumbnail area** (top), `aspect-ratio: 16/10`.
2. **Body** (bottom): filename, classification + size/date, optional expandable "extracted content", optional failed-state error line, then a footer action row.

## Thumbnail area
- If the item is `type: 'image'` or `'video'` AND has a `photoSrc`: shows the real image (`object-fit: cover`). Video additionally gets a small dark play-icon badge, top-right.
- Otherwise (no thumbnail \u2014 audio, document, or an image/video without a `photoSrc`): shows a **per-type tinted tile background** (`MEDIA_TILE_BG` map \u2014 image/video 8% accent tint, audio 5%, document 3%, all mixed into `var(--hl-surface-2)`) with a **56px circular accent-soft badge** centered, holding a 24px type icon. This consistent treatment was an explicit request \u2014 don't revert to a bare icon on flat gray.
- Status badge (`ready`/`processing`/`failed`) is absolutely positioned top-left of the thumbnail, always visible regardless of thumbnail vs. fallback tile.

## Icon-name gotcha (read before adding new MediaTypeIcon types)
`chat-widget-canvas.jsx` has its **own inline icon path map** (search `/* \u2500\u2500 Icons (lucide subset) \u2500\u2500 */` near the top of the file) \u2014 it is a different, smaller set than `icons.jsx` in this same project. `MediaTypeIcon` must use names that exist in THIS file's map: `image`, `video`, `mic` (for audio), `file` (for document). Using icons.jsx-only names like `audioLines`/`fileText` silently renders a blank `<svg>` with no path \u2014 this exact bug shipped once and was caught by the verifier. Check the local map before introducing a new type.

## Status badge (`function StatusBadge`)
Three states, small mono-uppercase pill:
- `ready` \u2014 accent-soft bg, check icon.
- `failed` \u2014 danger-tinted bg, x icon.
- anything else (`processing`) \u2014 muted-tinted bg, spinning refresh icon (`hl-spin` keyframe, defined once in the page's `<style>` block \u2014 don't redefine it elsewhere).
