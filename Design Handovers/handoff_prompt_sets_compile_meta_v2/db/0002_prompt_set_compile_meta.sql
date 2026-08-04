-- 0002_prompt_set_compile_meta.sql
--
-- Adds the read-side "compile metadata" the prompt-set cards show:
--     block_count        — active blocks in the set
--     last_compiled_at   — when the set's compiled prompt was last written
--     compiled_version   — the version stamped by the compile pipeline
--
-- NOTHING is stored on prompt_sets. These are DERIVED in a VIEW from data that
-- already exists (blocks + the compiled-prompt table). "Stale" is computed in the
-- UI as prompt_sets.updated_at > last_compiled_at — also not stored.
--
-- Why a view: it keeps the GET routes a single SELECT (no N+1), and the values can
-- never drift from reality the way denormalized columns would.

-- ── Compiled-prompt source ──────────────────────────────────────────────────────
-- The compiled output currently lives in `master_prompt` (being renamed to
-- `compiled_prompts` — see Backlog/prompt-schema-design.md "Cleanup Needed"). This view
-- joins on `prompt_set_id`, which is the TARGET shape (one compiled row per set).
--
--   ⚠ OPEN QUESTION: if `master_prompt` is still ONE ROW PER TENANT in your env
--   (the current app/admin/prompt-studio/prompt/page.tsx reads it with .limit(1)
--   per tenant, no prompt_set_id), then the per-set join below yields NULLs and
--   every set reads "Never compiled". Resolve the per-tenant→per-set migration
--   first, OR swap the `mp` lateral to key on tenant_id. See handover §5.

create or replace view public.prompt_sets_with_compile_meta as
select
  ps.*,
  coalesce(bc.block_count, 0) as block_count,
  mp.updated_at               as last_compiled_at,
  mp.version                  as compiled_version
from public.prompt_sets ps
left join lateral (
  select count(*)::int as block_count
  from public.blocks b
  where b.prompt_set_id = ps.id
    and b.status = 'active'
) bc on true
left join lateral (
  select cp.updated_at, cp.version
  from public.master_prompt cp          -- a.k.a. compiled_prompts
  where cp.prompt_set_id = ps.id
  order by cp.version desc
  limit 1
) mp on true;

-- The view inherits the base table's RLS (Postgres runs it as the querying role).
-- The API routes use the service-role admin client and scope by tenant_id (tenant
-- route) / platform-admin gate (platform route), exactly as the base-table queries do.

-- ── OPTIONAL: denormalized columns instead of the view ───────────────────────────
-- If you'd rather store the metadata (e.g. to index/sort on it cheaply), add the
-- columns below and have the COMPILE pipeline write last_compiled_at + compiled_version
-- alongside its existing version bump, and a blocks insert/delete trigger maintain
-- block_count. Then point the routes back at `prompt_sets`. Not required for the UI.
--
-- alter table public.prompt_sets
--   add column if not exists block_count       integer     not null default 0,
--   add column if not exists last_compiled_at  timestamptz,
--   add column if not exists compiled_version  integer;
