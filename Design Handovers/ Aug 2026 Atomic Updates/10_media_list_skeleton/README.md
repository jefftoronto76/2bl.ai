# Handover — Media list: skeleton grid instead of spinner while loading

Source: `chat-widget-canvas.jsx`, `MediaItemsList` (+ new `MediaCardSkeleton`).
Main-side equivalent: **both** `components/shells/membership/MediaGallery.tsx`
(in-chat panel) and `components/shells/membership/MediaPage.tsx` (standalone
top-level Media page) — confirmed by reading both files; they carry the
identical `loading` → centered `Loader2` spinner pattern, each with its own
`fetch` (`/api/media?chat_id=` vs. `/api/media`) but the same render branch.
In the prototype, `MediaItemsList` is shared by both call sites (in-chat
`MediaGallery` and the standalone Media page at the bottom of
`chat-widget-canvas.jsx`), so this fix already applies to both there.

## Diff

**Main today** — a single centered spinner while `loading` is true, no shape
of the eventual grid (identical in both files):

```tsx
{loading ? (
  <div className="flex items-center justify-center h-32 text-text-muted">
    <Loader2 size={18} className="animate-spin" />
  </div>
) : items.length === 0 ? ( ... ) : ( <MediaItemsGrid items={items} ... /> )}
```

**This handover** — replaces the spinner with 6 shimmer placeholder cards
matching `MediaCard`'s real shape (thumbnail block + two text lines), so the
loading state previews the grid it's about to become instead of a generic
wait indicator:

```jsx
function MediaCardSkeleton() {
  return (
    <div style={{ flex: '1 1 220px', minWidth: 180, maxWidth: 320, border: '1px solid var(--hl-border)', borderRadius: 14, background: 'var(--hl-surface)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div className="up-shimmer-bar" style={{ aspectRatio: '16 / 10', borderRadius: 0 }} />
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="up-shimmer-bar" style={{ width: '70%', height: 12, borderRadius: 99 }} />
        <span className="up-shimmer-bar" style={{ width: '45%', height: 9, borderRadius: 99 }} />
      </div>
    </div>
  );
}
```

```jsx
// MediaItemsList
const [listLoading, setListLoading] = useState(true);
useEffect(() => { const t = setTimeout(() => setListLoading(false), 700); return () => clearTimeout(t); }, []);
...
if (listLoading) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }} aria-busy="true" aria-label="Loading media">
      {Array.from({ length: 6 }).map((_, i) => <MediaCardSkeleton key={i} />)}
    </div>
  );
}
```

Reuses the existing `up-shimmer-bar` shimmer CSS (already shipped in this
prototype for the upload-in-progress card and chat-composer attachment tile)
— no new animation/keyframes added.

## Known

- The prototype's `listLoading` is a fixed 700ms timeout (no real fetch to
  key off in this environment). On `main`, the equivalent gate is each file's
  own existing `loading` state, already tied to its fetch — swap the spinner
  branch for the skeleton grid in both `MediaGallery.tsx` and
  `MediaPage.tsx`, no new data-fetching logic needed. The two files don't
  share a component for this region (no `MediaItemsGrid`-level wrapper
  covers the loading branch), so the swap is a duplicated small edit in
  each, same as the spinner it replaces.
- Card count (6) is a static placeholder count, not derived from anything —
  pick whatever reads well at the gallery panel's typical width on `main`.
- Only the list-level loading state changed. Per-thumbnail lazy load
  (`loading="lazy"`, handover 09) and the upload-in-progress card shimmer
  are untouched and unrelated to this.

## Open questions

- None outstanding — confirmed this covers both media views (in-chat panel
  and standalone page) by reading both `MediaGallery.tsx` and
  `MediaPage.tsx` directly.
