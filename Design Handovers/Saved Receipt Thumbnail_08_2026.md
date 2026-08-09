# Saved memory receipt — thumbnail (atomic handover)

Source: `chat-widget-canvas.jsx` → `MemoryCard`, `st === 'saved'` branch.

## Change
The collapsed saved-memory row in the transcript showed a small accent icon circle (kind icon) for every memory, regardless of media. It now shows the actual photo as a 34px rounded thumbnail when the memory has one (`message.photoSrc`), replacing the icon — not alongside it. Memories without a photo (or with a different media kind) keep the existing icon circle unchanged.

## Implementation
```jsx
{message.photoSrc ? (
  <img src={message.photoSrc} alt="" style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 9, objectFit: 'cover', border: '1px solid var(--hl-border)' }} />
) : (
  <span style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 22, height: 22, borderRadius: 99, background: 'var(--hl-accent-soft)', color: 'var(--hl-accent)' }}><Icon n={K.icon} s={12} /></span>
)}
```
Single condition on `message.photoSrc` — no separate flag for "has media" vs "has photo," since only image memories carry a usable thumbnail source today (video/audio memories don't have a static `photoSrc`).

## Scope
- Saved receipt row only. The draft card above it (pre-save) already renders a full media preview via `MemoryMedia` — untouched.
- No change to data model — reads the same `photoSrc` field already on the message.
