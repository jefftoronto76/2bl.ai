# API routes

Two surfaces, one table. Confirm exact paths against your existing `app/api/admin/*`
and `app/api/platform/*` conventions — these mirror the Sage-parameters routes.

## Tenant Settings → Prompt Sets

### `GET /api/admin/prompt-sets`
Returns `PromptSet[]` for the **session tenant** (resolve `tenant_id` from the session,
never from the client). Order by `created_at desc` (or `updated_at desc`).

### `PATCH /api/admin/prompt-sets`  — upsert
Body (editable fields only):
```jsonc
{ "id": "uuid|omit-to-insert", "label": "string", "description": "string",
  "status": "live|draft", "usage_type": "string|null" }
```
Server rules:
- Resolve `tenant_id` from the session; reject if an `id` is passed that isn't in that tenant.
- **Ignore** any client-sent `version`, `is_master`, `created_at`, `updated_at` — all server-owned.
- If `status !== 'live'`, force `usage_type = null`.
- On insert: `version = 1`, `is_master = false`.
- Return the full saved `PromptSet`.

### `DELETE /api/admin/prompt-sets/[id]`
Delete one set in the session tenant. Return `{ ok: true }` or `{ error }`.

## Platform Settings → Master Prompt

### `GET /api/platform/prompt-sets`
Returns the cross-tenant superset the platform admin can see (each option carries
`tenantId` + `tenantName`). Feeds the `MasterPromptPicker`.

### `GET /api/platform/settings/master-prompt`
Returns `{ promptSetId, setByName?, setAt? }` — the current master pointer.

### `PUT /api/platform/settings/master-prompt`
Body `{ "promptSetId": "uuid" }`. Sets `is_master = true` on that row and (given the
single-master unique index) clears it elsewhere — do both in one transaction:
```sql
update public.prompt_sets set is_master = false where is_master and id <> $1;
update public.prompt_sets set is_master = true  where id = $1;
```
Platform-admin auth only. This is the **write** side of the read-only "Master" badge
shown on the Tenant Settings card.

## version (both surfaces)
No HTTP route mutates `version`. It is bumped by `bump_prompt_set_version(id)` from the
**compile** pipeline (see migration). Treat it as read-only everywhere in Settings.
