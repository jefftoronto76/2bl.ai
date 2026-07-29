// services/tenant/ — tenant management business logic (server-only).
//
// Tenant CRUD (create/update/delete) backing the platform-admin routes. The
// `app/api/platform/tenants/*` route handlers are thin consumers (auth gate +
// parsing + response mapping); the validation + data-access lives here.
//
// DEFERRED — `resolveTenantConfig(host)`: the centralization plan (Step C)
// earmarks a `resolveTenantConfig(host) => { tenant_id, shell_type, branding,
// capabilities }` resolver here for Step I (dynamic tenant routing) to consume.
// It is intentionally NOT built yet: `tenants.shell_type` does not exist (it is
// a Step I schema add by Jeff in Studio, per workflow rule #3), and the
// `tenant_branding` column list is still unconfirmed. Build it in Step I once
// the schema lands, alongside the existing host-resolution helpers in
// `services/auth/` (`getTenantFromRequest`, `resolveTenantIdFromHost`).

export {
  createTenant,
  updateTenant,
  deleteTenant,
  type TenantRow,
  type TenantInput,
  type TenantResult,
} from './tenants'

export { SBL_TENANT_ID } from './constants'
