-- 2026-06-24_branding_targets_and_sync.sql
--
-- Adds (1) the Storefront/Admin branding-target dimension and (2) the read-only
-- sync columns the SyncStatus card renders. Adapt names to your actual schema —
-- in particular the existing single-row uniqueness constraint on tenant_branding
-- (drop it, then add the composite below).
--
-- Run in a transaction; review the backfill before committing.

begin;

-- 1. Target dimension ────────────────────────────────────────────────────────
alter table tenant_branding
  add column if not exists target text not null default 'storefront';

alter table tenant_branding
  add constraint tenant_branding_target_chk
  check (target in ('storefront', 'admin'));

-- Existing rows are storefront rows (the default covers them). One row per
-- (tenant, target):
--   • DROP the old unique-on-tenant_id constraint/index (name varies — inspect
--     with \d tenant_branding), then:
-- alter table tenant_branding drop constraint tenant_branding_tenant_id_key;
create unique index if not exists tenant_branding_tenant_target_uniq
  on tenant_branding (tenant_id, target);

-- 2. Read-only sync columns ───────────────────────────────────────────────────
-- Written by the defaults sync job, never by the Appearance PATCH handler.
-- branding_warnings is a JSON array of { token, message } (strings also accepted
-- and normalized client-side).
alter table tenant_branding
  add column if not exists defaults_synced_at timestamptz,
  add column if not exists branding_warnings  jsonb;

-- Example shape for branding_warnings:
--   [
--     { "token": "accent",       "message": "Contrast 3.1:1 on background — below AA." },
--     { "token": "font_primary", "message": "No web license on file; fell back to serif." }
--   ]

commit;
