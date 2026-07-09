# Patch: `app/admin/prompt-studio/blocks/page.tsx`

Three edits: drop the "Blocks" H1 + subtitle, remove the header action buttons, and
forward `topics / activeSetId / activeSetLabel` into `BlocksTable` (the buttons now live in
the summary card).

---

### 1 · Remove the two now-unused imports
```diff
-import { NewBlockButton } from '@/components/admin/content/NewBlockButton'
 import type { Topic } from '@/components/admin/content/BlockEditForm'
 import { BlocksTable, type BlockRow } from './BlocksTable'
-import { PublishButton } from './PublishButton'
 import { PromptSetSelect } from './PromptSetSelect'
```
(`NewBlockButton` and `PublishButton` are now imported by `BlocksOverview` instead. Keep the
`Topic` import — it still types the `topics` fetch.)

---

### 2 · Header — drop the title/subtitle and the right-hand button Flex

Replace the whole returned header `<Flex>…</Flex>` (the success-path one, not the catch
fallback) with a picker-only bar:

```diff
       <Flex
         direction={{ base: 'column', sm: 'row' }}
         justify="space-between"
-        align={{ base: 'stretch', sm: 'flex-start' }}
+        align={{ base: 'stretch', sm: 'center' }}
         gap="md"
         px={{ base: 16, sm: 24 }}
         py={{ base: 12, sm: 16 }}
         style={HEADER_FRAME_STYLE}
       >
-        <Stack gap="sm">
-          <Stack gap={4}>
-            <Title order={1} fz="lg" fw={600}>
-              Blocks
-            </Title>
-            <Text variant="muted">
-              Reusable prompt blocks — compiled into your system prompt.
-            </Text>
-          </Stack>
-
-          {sets.length > 0 && activeSet && (
-            <PromptSetSelect sets={sets} activeId={activeSet.id} />
-          )}
-        </Stack>
-
-        <Flex direction={{ base: 'column', sm: 'row' }} gap="sm" align="flex-start">
-          <NewBlockButton
-              topics={topics}
-              activeSetId={activeSet?.id ?? null}
-              activeSetLabel={activeSet?.label ?? null}
-            />
-          <PublishButton
-              activeSetId={activeSet?.id ?? null}
-              activeSetLabel={activeSet?.label ?? 'Prompt'}
-            />
-        </Flex>
+        {sets.length > 0 && activeSet && (
+          <PromptSetSelect sets={sets} activeId={activeSet.id} />
+        )}
       </Flex>
```

`PromptSetSelect` already renders the "CURRENT PROMPT SET" label, so the bar now matches
the design's lead element. (`Title` may become an unused import on the success path but is
still used by the catch fallback below — leave the `Title` import in place.)

---

### 3 · Forward the button props into `BlocksTable`
```diff
         <BlocksTable
           rows={rows}
           sets={sets}
+          topics={topics}
+          activeSetId={activeSet?.id ?? null}
+          activeSetLabel={activeSet?.label ?? null}
           overview={{
             version: activeSet?.version ?? null,
             status: activeSet?.status ?? null,
           }}
         />
```
