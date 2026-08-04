# Patch: `app/admin/prompt-studio/blocks/BlocksTable.tsx`

Thread `topics / activeSetId / activeSetLabel` from `page.tsx` through to `BlocksOverview`
so the action buttons render inside the summary card. Two edits.

---

### 1 · Add the `Topic` import
```diff
 import type { BlockType } from '@/services/prompt/block-types'
+import type { Topic } from '@/components/admin/content/BlockEditForm'
 import { isOrdered } from '@/services/prompt/block-order'
```

---

### 2 · Accept the new props on the component
```diff
 export function BlocksTable({
   rows,
   sets,
+  topics,
+  activeSetId,
+  activeSetLabel,
   overview,
 }: {
   rows: BlockRow[]
   sets?: PromptSet[]
+  topics: Topic[]
+  activeSetId: string | null
+  activeSetLabel: string | null
   overview?: { version?: number | null; status?: string | null }
 }) {
```

---

### 3 · Pass them to `BlocksOverview`
```diff
       <SummarySection stats={summaryStats}>
         <BlocksOverview
           blocks={items}
           version={overview?.version}
           status={overview?.status}
+          topics={topics}
+          activeSetId={activeSetId}
+          activeSetLabel={activeSetLabel}
         />
       </SummarySection>
```

Nothing else in `BlocksTable` changes — it just forwards the props.
