# Diff — publish release note

Two files change. Both are included in full in this folder; the hunks below are the
whole of it.

---

## 1 · `components/admin/prompt-studio/CompilePublishModal.tsx`

### 1a — imports

```diff
-import { useEffect, useState } from 'react'
-import { Badge, Button, Group, Loader, Modal, Stack, ThemeIcon } from '@mantine/core'
+import { useEffect, useMemo, useState } from 'react'
+import { Badge, Button, Group, Loader, Modal, Paper, Stack, Textarea, TextInput, ThemeIcon } from '@mantine/core'
 import { Text } from '@mantine/core'
-import { IconCheck, IconClipboard, IconDownload, IconFileText, IconRocket } from '@tabler/icons-react'
-import { ORDERED_TYPES } from '@/services/prompt/block-types'
+import {
+  IconArrowLeft, IconArrowRight, IconCheck, IconClipboard,
+  IconDownload, IconFileText, IconRocket,
+} from '@tabler/icons-react'
+import { ORDERED_TYPES, TYPE_COLORS } from '@/services/prompt/block-types'
```

### 1b — new exported helpers (after `compilePrompt`)

```diff
+const SUMMARY_MAX = 72
+
+export interface ChangedBlock { id: string; title: string; type: BlockType; updated_at: string | null }
+export interface ReleaseNote { summary: string; why: string; changed_block_ids: string[] }
+
+export function changedSince(blocks, lastCompiledAt) { … }   // updated_at > last_compiled_at
+export function suggestSummary(changed) { … }                // "Update identity and guardrails"
```

Both are exported so the eventual History screen can reuse the same derivation.

### 1c — props

```diff
   version: number
-  onPublish: () => void
+  previousTokens?: number          // live compiled prompt's token count → stage-3 delta
+  blocks?: ChangedBlock[]          // non-deleted blocks in the active set
+  lastCompiledAt?: string | null   // cut-off for "changed since"
+  onPublish: (note: ReleaseNote) => void
```

`version` semantics change: it is now **the version this publish will create**
(`activeSet.version + 1`), known before the POST, because both stages label it.
Previously it was the version returned by the compile response and was `0` during review.

### 1d — state + effects

```diff
   const [copied, setCopied] = useState(false)
+  const [stage, setStage] = useState<'review' | 'note'>('review')
+  const [summary, setSummary] = useState('')
+  const [why, setWhy] = useState('')
+  const changed = useMemo(() => changedSince(blocks, lastCompiledAt), [blocks, lastCompiledAt])

-  useEffect(() => { if (!opened) setCopied(false) }, [opened])
+  // Every open starts clean — a stale summary must never ride along with a new publish.
+  useEffect(() => {
+    if (!opened) { setCopied(false); setStage('review'); setSummary(''); setWhy('') }
+  }, [opened])
+
+  // Seed the suggestion on first arrival at stage 3; never clobber typed input on Back→forward.
+  useEffect(() => { if (stage === 'note') setSummary((s) => (s ? s : suggestSummary(changed))) }, [stage, changed])
```

### 1e — title swaps per stage

```diff
-      <ThemeIcon …><IconFileText size={18} /></ThemeIcon>
+      <ThemeIcon …>{note ? <IconRocket size={18} /> : <IconFileText size={18} />}</ThemeIcon>
       <div>
-        <Text fw={600} size="sm" …>Review compiled prompt</Text>
-        <Text c="dimmed" size="xs">{set.label}</Text>
+        <Text fw={600} size="sm" …>{note ? 'Describe this release' : 'Review compiled prompt'}</Text>
+        <Text c="dimmed" size="xs">{set.label}{note ? \` · publishing v\${version}\` : ''}</Text>
```

### 1f — body becomes a three-way branch

```diff
-      {compiling ? ( …loader… ) : ( …review… )}
+      {compiling ? ( …loader… ) : note ? ( …NEW stage 3… ) : ( …review… )}
```

Modal `size` follows: `size={note ? 'lg' : 'xl'}`.

### 1g — review footer: Publish becomes a step, not the commit

```diff
-              <Button leftSection={<IconRocket size={16} />} onClick={onPublish}>Publish</Button>
+              {/* Advances to stage 3 — the compile POST does not fire until the note is submitted. */}
+              <Button rightSection={<IconArrowRight size={16} />} onClick={() => setStage('note')}>Publish</Button>
```

Also in the review meta line, `Ready to publish` → `Will publish as v{version}`.

### 1h — stage 3 (new)

Change-summary `Paper` (gray-0) → `TextInput` Summary (required, `maxLength={72}`, live counter in
`rightSection`) → `Textarea` Why (optional, autosize 3–6) → footer `Back` / `Publish v{version}`.
The `Stack` carries `onKeyDown` for ⌘↵/Ctrl↵. Change chips are `Badge variant="light"` coloured by
`TYPE_COLORS[b.type]`. See the full file.

---

## 2 · `app/admin/prompt-studio/blocks/PublishButton.tsx`

```diff
-import { CompilePublishModal } from '@/components/admin/prompt-studio/CompilePublishModal'
+import { CompilePublishModal, type ChangedBlock, type ReleaseNote } from '@/components/admin/prompt-studio/CompilePublishModal'

 interface PublishButtonProps {
   activeSetId: string | null
   activeSetLabel: string
+  activeSetVersion?: number
+  lastCompiledAt?: string | null
+  previousTokens?: number
+  blocks?: ChangedBlock[]
 }

-  const [compiledVersion, setCompiledVersion] = useState(0)
+  const nextVersion = activeSetVersion + 1

-  async function handlePublish() {
+  async function handlePublish(note: ReleaseNote) {
       body: JSON.stringify({ prompt_set_id: activeSetId }),
+      body: JSON.stringify({ prompt_set_id: activeSetId, note }),

-      setCompiledVersion(data.version)
       notifications.show({
-        color: 'green', title: 'Prompt published', message: \`Version \${data.version}\`,
+        color: 'green', title: \`Published v\${data.version}\`, message: note.summary,
       })

-        version={compiledVersion}
+        version={nextVersion}
+        previousTokens={previousTokens}
+        blocks={blocks}
+        lastCompiledAt={lastCompiledAt}
```

---

## 3 · Call-site wiring — `app/admin/prompt-studio/blocks/BlocksOverview.tsx`

`<PublishButton/>` is mounted in **`BlocksOverview.tsx`** (left card, next to `NewBlockButton`),
not in `BlocksTable`. `BlocksOverview` already receives `blocks: BlockRow[]`, `version`,
`activeSetId`, `activeSetLabel` — so two of the four new props are free:

```diff
-            <PublishButton activeSetId={activeSetId} activeSetLabel={activeSetLabel ?? 'Prompt'} />
+            <PublishButton
+              activeSetId={activeSetId}
+              activeSetLabel={activeSetLabel ?? 'Prompt'}
+              activeSetVersion={version ?? 0}
+              blocks={active.map((b) => ({
+                id: b.id,
+                title: b.title,
+                type: b.type as BlockType,   // same cast TokenDonut already does on this row
+                updated_at: b.updated_at,
+              }))}
+              // lastCompiledAt / previousTokens — NOT AVAILABLE on this page today. See OQ-1, OQ-2.
+            />
```

`active` is the existing `blocks.filter((b) => b.status === 'active')` already computed a few
lines above for the guardrail count and donut. `BlockRow.type` is a `string`, so the
`as BlockType` cast is required — `BlocksOverview` already does exactly this for `donutBlocks`.

**Both omitted props degrade safely.** With no `lastCompiledAt`, `changedSince()` returns every
active block, so stage 3 lists all of them instead of only the edited ones — informative, but
not the design. With no `previousTokens` the delta reads `+411` against zero, which is wrong
and should be suppressed rather than shown — see OQ-2.

---

## 4 · Backend hook point (one endpoint, not designed here)

`POST /api/admin/prompt/compile` currently reads only `prompt_set_id`. It needs to accept and
persist `note`:

```diff
   const promptSetId = typeof body.prompt_set_id === 'string' && … ? body.prompt_set_id : null
+  const note = parseNote(body.note)   // { summary (required, ≤72), why, changed_block_ids }
+  if (!note) return NextResponse.json({ error: 'A release summary is required.' }, { status: 400 })
```

Persist alongside the compiled row (a `release_summary` / `release_why` /
`release_changed_block_ids` triple on the compiled-prompt record is the least invasive shape),
and add it to the existing `AuditAction.PROMPT_COMPILE` metadata:

```diff
-    metadata: { version: result.data.version, token_count: result.data.tokenCount },
+    metadata: { version: result.data.version, token_count: result.data.tokenCount, summary: note.summary },
```

Server-side validation must mirror the client: summary required, trimmed, ≤ 72 chars.

---

## 5 · Open questions

Things I could not confirm from the repo. Each one is a decision or a lookup for engineering —
none is settled by this design.

### OQ-1 · `last_compiled_at` is not on the Blocks page's prompt-set type
**Blocking for the "changed since" list.** `getPromptSets.ts` selects only
`id, label, version, status, prompt_type_id`, and `promptSets.ts`'s `PromptSet` interface has no
timestamp. The tenant-Settings `PromptSet` (`@/lib/promptSet`) *does* carry `last_compiled_at`,
which strongly suggests the column exists on `prompt_sets` — **but I did not read the schema and
have not verified it.**

If the column exists, threading it is mechanical but crosses four files outside the publisher:
`getPromptSets.ts` (select + map) → `promptSets.ts` (interface) → `page.tsx` (pass through) →
`BlocksTable` → `BlocksOverview`. **Is that in scope for this ticket, or a prerequisite one?**
If the column does not exist, what is the correct cut-off — the compiled row's `created_at`?

### OQ-2 · There is no compiled token count in this data path
`previousTokens` powers the `+154 tokens` delta. Nothing on the Blocks page knows the live
compiled prompt's token count, and I did not confirm whether one is persisted anywhere
(`/api/admin/prompt-sets/[id]/compiled` returns `{ content, version, updated_at }` — no count,
though it could be derived from `content`).

**Decide:** persist/expose a token count, derive it client-side from a second fetch, or **drop the
delta and show only the total.** Dropping it is the cheapest and costs little — the change-chip
list carries most of the signal. Do not ship the delta computed against `0`.

### OQ-3 · Does the compile always produce exactly `version + 1`?
The modal now labels the pending version — "Will publish as v8", "Publish v8" — **before** the
POST, computed as `activeSet.version + 1`. I did not read `services/prompt/compile.ts`. If the
server can produce a version that isn't `current + 1` (a no-op republish that doesn't bump, a
concurrent publish, a gap), the label will lie.

**Confirm the increment rule.** If it isn't guaranteed, the honest fallback is to drop the number
from both labels ("Publish" / "Ready to publish") and only name the version in the success toast,
which reads the real value from the response.

### OQ-4 · Where does the note get persisted?
I specified the request shape (`note: { summary, why, changed_block_ids }`) and the audit-metadata
addition, but **not the storage**, because I don't know the compiled-prompt schema — specifically
whether a **row per version** is retained or a single current row is overwritten. A note attached
to an overwritten row is lost on the next publish, which defeats the point.

**This is the one that decides whether the History screen is even possible.** Answer it before
building storage.

### OQ-5 · Should archived / disabled blocks appear in the change list?
The wiring passes `active` blocks only, so a block *disabled* since the last compile — a real,
publishable change that removes content from the prompt — will not appear in the list. Including
them means passing all non-deleted rows and labelling state per chip ("Edited" / "Disabled").
**Product call.** The current design under-reports that case.

### OQ-6 · Is this the only publish path?
I only traced the tenant Blocks screen. If a platform admin can compile/publish another tenant's
set from anywhere else, that surface needs the same note, or the history has holes.

### OQ-7 · Server-side validation is specified but not written
The diff asserts summary required / trimmed / ≤ 72 chars server-side to mirror the client. **72 is
a design choice, not a constraint I found in the codebase** — if there's a column width or an
existing convention for short text fields, that wins.

### OQ-8 · Not verified: nothing else consumes `CompilePublishModal`
`version`'s meaning changes (pending version, not returned version) and `onPublish`'s signature
changes. Search showed `PublishButton` as the only consumer, **but that search was bounded and
partial** — a second import elsewhere would break the build.

### Deliberately settled (not open)
- Summary is **required**. A hotfix exemption would be a deliberate exception, not a default.
- Stage 3 lives in the **same modal**, not a second dialog.
- The compile POST fires **only** from stage 3 — stage 2's "Publish" is a step, not the commit.
