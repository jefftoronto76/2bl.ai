# Tenant Service

### Tenant service (`services/tenant/`)

Tenant management business logic (server-only). Backs the platform-admin tenant
routes as thin consumers — the routes own the `platform_admin` auth gate
(defense-in-depth), JSON parsing, and the `[id]` path param; validation +
data-access live here. Functions return a discriminated `TenantResult<T>`
(`{ ok: true; status; data } | { ok: false; status; error }`) so routes preserve
exact status codes (201/200/400/403/404/409/500), messages, and log strings.

| File | Exports | Purpose |
|------|---------|---------|
| `tenants.ts` | `createTenant`, `updateTenant`, `deleteTenant` (+ `TenantRow`, `TenantInput`, `TenantResult`) | `tenants`-table create/update/delete against the service-role client. Shared validation (name/type/slug/self-parent/domain) + parent-existence check are factored into helpers reused by create + update. Slug/domain uniqueness pre-checks plus the `23505`/`23503` race/FK catches. Backs `POST /api/platform/tenants` and `PATCH`/`DELETE /api/platform/tenants/[id]`. |
| `index.ts` | barrel | Re-exports the public surface above. **`resolveTenantConfig(host)` is DEFERRED to Step I** — it depends on `tenants.shell_type`, which does not exist yet (a Step I schema add by Jeff), so per workflow rule #3 it is not built against missing schema yet. The `tenant_branding` column list, previously also cited as a blocker, is no longer unconfirmed — it's fully documented (see `System Docs/Database Schema.md`'s `tenant_branding` row) and is not what's holding this up. |
