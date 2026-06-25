-- 0001_prompt_sets.sql
-- The prompt_sets table powers BOTH Settings surfaces:
--   • Tenant Settings → Prompt Sets  (CRUD on a tenant's own sets)
--   • Platform Settings → Master Prompt  (flips is_master across tenants)
-- One row per prompt set. version is a COMPILE artifact (see bump function below);
-- the Settings editor never writes it.

create table if not exists public.prompt_sets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  label       text not null,
  description text,
  status      text not null default 'draft' check (status in ('live', 'draft')),
  is_master   boolean not null default false,   -- set ONLY from Platform Settings
  usage_type  text,                             -- meaningful only while status = 'live'
  version     integer not null default 1,       -- auto-increments on compile; read-only in UI
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists prompt_sets_tenant_id_idx on public.prompt_sets (tenant_id);

-- At most one platform master at a time (the Master Prompt screen enforces single-select).
-- Drop this if you decide to allow multiple masters.
create unique index if not exists prompt_sets_single_master_idx
  on public.prompt_sets ((true)) where is_master;

-- ── updated_at trigger ─────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists prompt_sets_touch_updated_at on public.prompt_sets;
create trigger prompt_sets_touch_updated_at
  before update on public.prompt_sets
  for each row execute function public.touch_updated_at();

-- ── version bump (compile artifact, NOT a per-update trigger) ───────────────────
-- Call this from the COMPILE pipeline when a set is compiled — never from the
-- Settings PATCH path. Keeps version aligned to "compiled reality" so it can't
-- drift from manual edits. (Design decision: version is auto, read-only in UI.)
create or replace function public.bump_prompt_set_version(p_id uuid)
returns integer language sql as $$
  update public.prompt_sets
     set version = version + 1
   where id = p_id
  returning version;
$$;

-- RLS sketch (match your existing tenant-scoping policies):
--   • Tenant Settings: a member may select/insert/update/delete rows where
--     tenant_id = current tenant, EXCEPT is_master and version (server-owned).
--   • Platform Settings: platform admins may update is_master across any tenant.
