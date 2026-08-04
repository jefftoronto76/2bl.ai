# Diff

Two production files are included whole. Everything else is a hunk below.

---

## 1 · `app/admin/prompt-studio/blocks/PromptSetSelect.tsx` — family switch

```diff
+export type SetFamily = 'tenant' | 'composer'
+const SET_FAMILIES = [
+  { value: 'tenant',   label: '2bl.ai',   hint: 'Prompt sets your tenants ship to their users.' },
+  { value: 'composer', label: 'Composer', hint: 'The prompt that powers the Composer AI itself.' },
+]
+// TODO(UK-1): the ONE line that changes with the schema decision.
+function familyOf(set: PromptSet): SetFamily {
+  return (set as PromptSet & { kind?: string }).kind === 'composer' ? 'composer' : 'tenant'
+}
```

```diff
   const active = resolveActiveSet(sets, activeId)
-  if (!active) return null
+  const activeFamilyValue = active ? familyOf(active) : 'tenant'
+  // Browsing scope — local, not the URL (UK-3). Reopening returns you to your real family.
+  const [family, setFamily] = useState<SetFamily>(activeFamilyValue)
+  useEffect(() => { if (menuOpen) setFamily(activeFamilyValue) }, [menuOpen, activeFamilyValue])
+  const counts = useMemo(() => { /* per-family tally */ }, [sets])
+  const showFamilySwitch = counts.tenant > 0 && counts.composer > 0
+  const inFamily = useMemo(() => (showFamilySwitch ? sets.filter((s) => familyOf(s) === family) : sets), [/* … */])
+  if (!active) return null
```

Search and the empty state now scope to `inFamily` rather than `sets`:

```diff
-  const showSearch = sets.length > 6
-  const visible = showSearch && search.trim() ? sets.filter(…) : sets
+  const showSearch = inFamily.length > 6
+  const visible = showSearch && search.trim() ? inFamily.filter(…) : inFamily
```

```diff
-  {showSearch && visible.length === 0 && (
-    <Text …>No prompt sets match.</Text>
+  {visible.length === 0 && (
+    <Text …>No {activeFamilyMeta?.label} prompt sets{search.trim() ? ' match.' : ' yet.'}</Text>
   )}
```

Trigger gains the chip; `Menu width` 280 → 300 to fit the switch:

```diff
   <UnstyledButton aria-haspopup="listbox" style={{…}}>
+    {activeFamilyValue === 'composer' && <FamilyChip />}
     <Text fw={600} …>{active.label}</Text>
```

The switch row itself is a new `<Box>` at the top of `<Menu.Dropdown>` — see the full file. Its
buttons call `e.stopPropagation()` so changing scope neither closes the menu nor selects a set.

Rows also gain `truncate` on the label and `flexShrink: 0` on the right-hand group, matching the
fix applied to the Settings picker.

---

## 2 · `app/(platform)/platform/settings/MasterPromptPicker.tsx` — filter + edit

```diff
-import { Badge, Box, Group, Paper, Select, Text } from '@mantine/core'
+import { ActionIcon, Badge, Box, Group, Paper, Select, Text, Tooltip } from '@mantine/core'
+import { IconPencil } from '@tabler/icons-react'
```

```diff
 interface MasterPromptPickerProps {
   options: MasterPromptOption[]
+  /** Composer-family sets only — page.tsx filters. */
+  onEdit?: (option: MasterPromptOption) => void
```

```diff
-      label="System prompt set"
+      label="Composer prompt set"
+      description="Only prompt sets built for the Composer appear here."
-      placeholder="Select a prompt set…"
+      placeholder={options.length ? 'Select a prompt set…' : 'No composer prompt sets yet'}
-      nothingFoundMessage="No matching prompt sets"
+      nothingFoundMessage="No matching composer prompt sets"
-      disabled={disabled}
+      disabled={disabled || options.length === 0}
```

In `renderOption`, the right-hand `<Group>` gains `style={NO_SHRINK}`, each badge and the version
`Text` gain `flexShrink: 0`, and the pencil is appended:

```diff
       {o.id === masterId && (<Badge …>Composer Prompt</Badge>)}
+      {onEdit && (
+        <Tooltip label="Edit blocks" withArrow position="left" openDelay={400}>
+          <ActionIcon component="span" role="button" tabIndex={0} variant="subtle" color="gray" size="sm"
+            aria-label={/* `Edit ${o.label} in Blocks` */} style={NO_SHRINK}
+            onClick={(e) => { e.stopPropagation(); onEdit(o) }}
+            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onEdit(o) } }}>
+            <IconPencil size={14} />
+          </ActionIcon>
+        </Tooltip>
+      )}
```

**Why `flexShrink: 0` is not cosmetic:** without it, adding the ~30px pencil shrinks the
pre-existing children instead of truncating the label — measured in the prototype, "Live"
rendered as "L.", "Composer Prompt" ellipsised, and "v7" wrapped to two lines. Raising the
container width does not hold once a longer label appears.

---

## 3 · `app/(platform)/platform/settings/page.tsx` — filter, edit route, Add New

### 3a — filter the options (UK-1)

```diff
+// TODO(UK-1): predicate depends on how the family is stored. is_composer_prompt is the
+// singleton LIVE pointer and must NOT be used here — it would return exactly one row.
+function isComposerSet(o: MasterPromptOption): boolean {
+  return (o as MasterPromptOption & { kind?: string }).kind === 'composer'
+}
+
+const composerOptions = options.filter(isComposerSet)
```

Feed `composerOptions` to `<MasterPromptPicker/>`; keep the unfiltered `options` for `current`
(the live pointer must still resolve even if its set somehow is not composer-family) and for
`<TenantPrompts/>`'s refresh.

`isEmpty` must also become composer-aware, or the panel shows a picker with an empty dropdown:

```diff
-const isEmpty = !loading && options.length === 0
+const isEmpty = !loading && composerOptions.length === 0
```

…and the empty copy needs rewording — "Create a prompt set in any tenant's Settings" is no longer
the instruction; it is "Add New here."

### 3b — the edit route (UK-5)

```diff
+import { useRouter } from 'next/navigation'
+const router = useRouter()
+
+<MasterPromptPicker
+  onEdit={(o) => router.push(`/admin/prompt-studio/blocks?set=${encodeURIComponent(o.id)}`)}
```

**Read UK-5 before shipping this line.** `/admin/prompt-studio/blocks` resolves its sets from
`getPromptSets(tenantId)`. If the composer set is not in the acting tenant, `resolveActiveSet`
falls back to that tenant's Live set — the user lands somewhere else with no error at all.

### 3c — Add New (UK-4)

A green `Button` with `IconPlus`, `size="sm"`, in the `<Group>` that currently holds
`<CurrentSystemPromptPill/>` and "Revert to fallback" — placed BEFORE the red button:

```diff
   <Group gap="sm" align="center" wrap="wrap">
     <CurrentSystemPromptPill … />
+    <Button color="green" size="sm" leftSection={<IconPlus size={14} />} onClick={() => setCreateOpen(true)}>
+      Add New
+    </Button>
     <Button variant="light" color="red" size="sm" …>Revert to fallback</Button>
   </Group>
```

The modal is the existing prompt-set create modal **with the Tenant field omitted**. On success:
`loadOptions()`, then `setPending(created.id)` — the new set becomes the pending selection but
does NOT go live until Save. **The create call itself is not designed here — see UK-4:** both
prompt-set write routes treat `is_composer_prompt` as server-owned and neither has a way to say
"this new set is a composer set."

---

## 4 · Data plumbing

Both pickers need the family on the wire. Neither type carries it.

`app/(platform)/platform/settings/types.ts`:

```diff
 export interface MasterPromptOption {
   id: string
   label: string
   tenantId: string
   tenantName: string
   status: PromptSetStatus
   version?: number
+  /** TODO(UK-1) — 'tenant' | 'composer'. */
+  kind?: string
 }
```

`app/admin/prompt-studio/blocks/promptSets.ts`:

```diff
 export interface PromptSet {
   …
+  /** TODO(UK-1) — 'tenant' | 'composer'; defaults to 'tenant' when absent. */
+  kind?: string
 }
```

`app/admin/prompt-studio/blocks/getPromptSets.ts` — the select needs the column, and the view
`prompt_sets_with_compile_meta` must expose it:

```diff
-    .select('id, label, version, status, prompt_type_id, last_compiled_at, compiled_version')
+    .select('id, label, version, status, prompt_type_id, last_compiled_at, compiled_version, kind')
```

```diff
     status: …,
+    kind: (row.kind as string | null) ?? 'tenant',
```

Same addition to the SELECT constants in `app/api/platform/prompt-sets/route.ts` and
`app/api/admin/prompt-sets/route.ts` (both list their columns explicitly).

### `resolveActiveSet` and the family
`resolveActiveSet(sets, requestedId)` falls back to the Live set, then the first set. With two
families in one array a miss can now land you in the *other* family — UK-5's failure mode in a
second place. Consider making the fallback family-aware, or making a miss explicit rather than
silent.

---

## 5 · Migration sketch (only if UK-1 resolves to option A)

```sql
ALTER TABLE prompt_sets
  ADD COLUMN kind text NOT NULL DEFAULT 'tenant'
  CHECK (kind IN ('tenant', 'composer'));

CREATE INDEX prompt_sets_kind_idx ON prompt_sets (kind);
```

Backfill: the existing `is_composer_prompt = true` row is certainly `kind = 'composer'`. **Which
OTHER rows should be backfilled is a product question, not a mechanical one** — a set used as the
composer prompt historically has no marker today (though `compiled_prompts_history` and the
`PROMPT_SET_MASTER_SET` audit entries may be able to reconstruct it — I have verified neither).

Worth an entry in `System Docs/DB_CHANGELOG.md` alongside the `is_master` → `is_composer_prompt` rename,
since the two will otherwise read as duplicates of each other.
