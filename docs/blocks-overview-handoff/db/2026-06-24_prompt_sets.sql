-- 2026-06-24_prompt_sets.sql
--
-- Backs the "Current Prompt Set" picker on the Blocks page. A prompt set is a
-- named, versioned collection of blocks that compiles into one system prompt.
-- Blocks belong to a set via blocks.prompt_set_id.
--
-- Adapt names to your schema. Run in a transaction; review the backfill first.

begin;

-- 1. prompt_sets ──────────────────────────────────────────────────────────────
create table if not exists prompt_sets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants (id) on delete cascade,
  label       text not null,
  version     integer not null default 0,
  status      text not null default 'Draft'
              check (status in ('Live', 'Draft', 'archived')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prompt_sets_tenant_idx on prompt_sets (tenant_id);

-- At most one Live set per tenant (optional — drop if multiple Live allowed):
create unique index if not exists prompt_sets_one_live_per_tenant
  on prompt_sets (tenant_id)
  where status = 'Live';

-- 2. blocks.prompt_set_id ─────────────────────────────────────────────────────
alter table blocks
  add column if not exists prompt_set_id uuid references prompt_sets (id) on delete cascade;

create index if not exists blocks_prompt_set_idx on blocks (prompt_set_id);

-- 3. Backfill — seed one default set per tenant from existing blocks ───────────
--    (Adjust to give each tenant its real production set name/version.)
-- insert into prompt_sets (tenant_id, label, version, status)
--   select distinct tenant_id, 'Default', 1, 'Live' from blocks
--   on conflict do nothing;
--
-- update blocks b
--   set prompt_set_id = ps.id
--   from prompt_sets ps
--   where ps.tenant_id = b.tenant_id and b.prompt_set_id is null;

-- Note: the duplicate-order uniqueness check (BlocksTable.persistEdit) is
-- per type. If a set should allow re-using order numbers across sets, scope any
-- DB-level order constraint to (prompt_set_id, type, order), not (tenant_id, …).

commit;
