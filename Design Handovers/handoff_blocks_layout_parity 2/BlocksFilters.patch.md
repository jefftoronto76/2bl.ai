# Patch: `components/admin/content/BlocksFilters.tsx`

**Difference #3 — search box fill.** The design's search bar is a white pill (`#fff`) on
the cream page; the branch renders it in the page background colour so it disappears.

One edit, in `FilterBar` — the search-bar container `<div>`:

```diff
       <div
         style={{
           display: 'flex',
           alignItems: 'center',
           gap: 8,
           minHeight: 42,
           padding: '6px 6px 6px 13px',
           border: '1px solid var(--mantine-color-gray-3)',
           borderRadius: 'var(--mantine-radius-md)',
-          background: 'var(--mantine-color-body)',
+          background: '#fff',
           flexWrap: 'wrap',
         }}
       >
```

The design uses a literal `#fff` (not `var(--mantine-color-white)`, which the admin theme
remaps toward cream). If you flip `FILTER_LAYOUT` to `popover`, apply the same `#fff` to the
`SearchField` `TextInput` (`styles={{ input: { background: '#fff' } }}`) for consistency —
but the default `bar` layout is the one in the design.
