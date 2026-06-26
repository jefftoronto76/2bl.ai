# Changes to `app/api/admin/prompt-sets/route.ts`

Two edits to the shipping route. Both are small; the rest of the file is unchanged.

---

## 1. GET — read from the view, return the compile metadata

The view `prompt_sets_with_compile_meta` (see `db/0002_prompt_set_compile_meta.sql`)
adds `block_count`, `last_compiled_at`, `compiled_version` to every row. Point the
GET at the view and widen the column list. **No N+1, no per-row fetches.**

### `PromptSet` interface — add three fields

```ts
interface PromptSet {
  id: string
  tenant_id: string
  label: string
  description: string | null
  status: PromptSetStatus
  is_composer_prompt: boolean
  is_default: boolean
  prompt_type_id: string | null
  version: number
  created_at: string
  updated_at: string
  // NEW — derived, read-only:
  block_count: number
  last_compiled_at: string | null
  compiled_version: number | null
}
```

### Add a read-only column list + use it in GET

```ts
const SELECT_COLUMNS =
  'id, tenant_id, label, description, status, is_composer_prompt, is_default, prompt_type_id, version, created_at, updated_at'

// NEW: GET also returns the derived compile metadata (view columns).
const SELECT_COLUMNS_WITH_META =
  SELECT_COLUMNS + ', block_count, last_compiled_at, compiled_version'
```

```ts
// in GET():  read from the view instead of the base table
const { data, error } = await supabase
  .from('prompt_sets_with_compile_meta')   // was: .from('prompt_sets')
  .select(SELECT_COLUMNS_WITH_META)        // was: SELECT_COLUMNS
  .eq('tenant_id', authCtx.tenant_id)
  .order('created_at', { ascending: false })
```

> Leave **PATCH** selecting from the base `prompt_sets` table with the original
> `SELECT_COLUMNS` — writes go to the table, not the view. The UI refetches (or the
> compile job runs) to pick up the derived fields; they are never written from here.

---

## 2. PATCH — persist `prompt_type_id` for drafts too

Today the route force-nulls `prompt_type_id` unless the set is live. The design now
lets a **type be assigned at creation regardless of status** (it stays *required* only
when Live). Replace the normalization block:

```ts
// BEFORE — drops a draft's type
const promptTypeId: string | null =
  status === 'live' && typeof body.prompt_type_id === 'string' && body.prompt_type_id.length > 0
    ? body.prompt_type_id
    : null

if (status === 'live' && !promptTypeId) {
  return Response.json({ error: 'A live set must be assigned a prompt type' }, { status: 400 })
}
```

```ts
// AFTER — keep the type for drafts; still require it for live
const promptTypeId: string | null =
  typeof body.prompt_type_id === 'string' && body.prompt_type_id.length > 0
    ? body.prompt_type_id
    : null

if (status === 'live' && !promptTypeId) {
  return Response.json({ error: 'A live set must be assigned a prompt type' }, { status: 400 })
}
```

The existing tenant-ownership check on `promptTypeId` (the `prompt_types` lookup
scoped by `tenant_id`) is unchanged and now also guards draft assignments. `version`,
`is_composer_prompt`, `is_default`, timestamps, and the derived compile fields remain
server-owned and are never written here.
