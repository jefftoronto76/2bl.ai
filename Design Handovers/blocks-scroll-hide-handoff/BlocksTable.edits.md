# BlocksTable.tsx — the edits

All edits are in `app/admin/prompt-studio/blocks/BlocksTable.tsx`. `tokensFor` is
already imported there; you're adding one component import, one CSS-module import,
two derived values, and two JSX wraps.

---

### 1. Add imports (top of file, with the other local imports)

```tsx
import { SummarySection } from './SummarySection'
import layout from './BlocksLayout.module.css'
```

`tokensFor` is already imported:
```tsx
import { tokensFor } from '@/services/prompt/tokenize'
```

---

### 2. Derive the recall-bar stats (inside the component, near the other derived values — e.g. just after `maxVisibleTokens`)

```tsx
// Summary recall stats — shown in the collapsed bar when the summary is hidden.
// Active-only, matching BlocksOverview (the meter measures reality, not the view).
const activeBlocks = items.filter(b => b.status === 'active')
const summaryStats = {
  status: overview?.status ?? null,
  count: activeBlocks.length,
  tokens: activeBlocks.reduce((sum, b) => sum + tokensFor(b.body), 0),
}
```

---

### 3. Wrap the overview in `SummarySection` (Gap 2)

**Before**
```tsx
<Box mb="md">
  <BlocksOverview
    blocks={items}
    version={overview?.version}
    status={overview?.status}
  />
</Box>
```

**After**
```tsx
<SummarySection stats={summaryStats}>
  <BlocksOverview
    blocks={items}
    version={overview?.version}
    status={overview?.status}
  />
</SummarySection>
```

(`SummarySection` owns its own bottom margin, so the wrapping `<Box mb="md">` is no
longer needed here.)

---

### 4. Make the filter toolbar sticky (Gap 1)

**Before**
```tsx
<Box mb="md">
  <BlocksToolbar
    query={query}
    onQueryChange={setQuery}
    /* …unchanged props… */
    filteredCount={filtered.length}
    totalCount={items.length}
  />
</Box>
```

**After**
```tsx
<Box className={layout.stickyToolbar}>
  <BlocksToolbar
    query={query}
    onQueryChange={setQuery}
    /* …unchanged props… */
    filteredCount={filtered.length}
    totalCount={items.length}
  />
</Box>
```

`.stickyToolbar` carries its own background, bottom border, bleed, and bottom margin,
so drop the `mb="md"`.

> Order matters: the sticky toolbar must sit **after** `SummarySection` and **before**
> the bulk bar / table in the JSX (it already does). The bulk-actions bar stays
> non-sticky — it appears below the pinned toolbar only when rows are selected.

---

### Optional polish to `page.tsx`

Not required — sticky works as-is. If you want the pinned bar to sit perfectly flush
at the very top with no summary sliver during the pin transition, drop the scroll
container's **top** padding only and let the summary's own margin carry the gap:

```tsx
// app/admin/prompt-studio/blocks/page.tsx
<Box style={SCROLL_AREA_STYLE} px={{ base: 'md', sm: 'lg' }} pt={0} pb={{ base: 'md', sm: 'lg' }}>
```

Leave it alone if the default already looks right in your build.
