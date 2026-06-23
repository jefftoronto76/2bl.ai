-- Add build-time branding sync tracking columns to tenant_branding.
-- Written by the prebuild sync script (scripts/sync-branding.ts):
--   defaults_synced_at — stamped each time the script runs without error
--   branding_warnings  — JSON array of { type, property, currentValue, message }
--                        entries for tokens the script cannot auto-update

ALTER TABLE tenant_branding
  ADD COLUMN IF NOT EXISTS defaults_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS branding_warnings  TEXT;
