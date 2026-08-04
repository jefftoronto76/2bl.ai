-- Migration: prompt_conversations
-- The persistence layer behind the Composer's conversation-history drawer
-- (handover §3). One row per saved Composer conversation, tenant- + owner-scoped.
--
-- Conventions matched to the existing schema (see `topics`, `blocks`):
--   • uuid PK via gen_random_uuid()  • tenant_id scoping on every query
--   • created_at / updated_at timestamptz  • snake_case columns
-- Log this change in System Docs/DB_CHANGELOG.md after applying.

create table if not exists public.prompt_conversations (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  owner_id      uuid not null,                       -- the admin user who owns the thread
  title         text not null default 'New conversation',
  preview       text,                                -- last assistant line, truncated (list view)
  messages      jsonb not null default '[]'::jsonb,  -- [{ role, content, timestamp }]
  prompt_set_id uuid,                                -- optional: set active when the thread ran
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- The drawer lists a tenant+owner's threads newest-first.
create index if not exists prompt_conversations_owner_recent_idx
  on public.prompt_conversations (tenant_id, owner_id, updated_at desc);

-- Keep updated_at fresh on every write (append path relies on it for grouping).
create or replace function public.touch_prompt_conversations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_prompt_conversations_touch on public.prompt_conversations;
create trigger trg_prompt_conversations_touch
  before update on public.prompt_conversations
  for each row execute function public.touch_prompt_conversations_updated_at();

-- RLS: match whatever the sibling tables do. The admin API uses the service-role
-- client (getAdminClient) and filters by tenant_id in every query, same as
-- `topics`/`blocks`. If those tables enable RLS with tenant policies, mirror it
-- here; otherwise the explicit tenant_id filter in the service layer is the guard.
