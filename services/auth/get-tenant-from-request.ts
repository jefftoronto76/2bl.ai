import { getAdminClient } from './supabase-admin'

/**
 * Extracts the root domain from a Host header value, stripping subdomains.
 *
 * Examples:
 * - "app.jefflougheed.ca"     → "jefflougheed.ca"
 * - "www.jefflougheed.ca"     → "jefflougheed.ca"
 * - "jefflougheed.ca"         → "jefflougheed.ca"
 * - "jefflougheed.ca:3000"    → "jefflougheed.ca"
 * - "localhost"               → null (treated as dev)
 * - "localhost:3000"          → null
 * - "127.0.0.1"               → null
 *
 * For ccTLD-style hosts like "example.co.uk" this simple approach returns
 * "co.uk" which is wrong. For the current scope (all tenants use *.ca or
 * *.com) the last-two-parts rule is sufficient. Revisit with the PSL if a
 * tenant ever registers a multi-part ccTLD.
 */
function normalizeHost(host: string | null): string | null {
  if (!host) return null

  // Strip port if present
  const withoutPort = host.split(':')[0].trim().toLowerCase()
  if (!withoutPort) return null

  // Local/dev hosts
  if (
    withoutPort === 'localhost' ||
    withoutPort.endsWith('.localhost') ||
    withoutPort === '127.0.0.1' ||
    withoutPort === '0.0.0.0' ||
    withoutPort.endsWith('.local')
  ) {
    return null
  }

  return withoutPort
}

function extractRootDomain(host: string | null): string | null {
  const normalized = normalizeHost(host)
  if (!normalized) return null
  const parts = normalized.split('.')
  if (parts.length < 2) return null
  return parts.slice(-2).join('.')
}

/**
 * Resolves the tenant_id for an incoming public request based on its Host
 * header. Used by anonymous endpoints (e.g. the Sage public chat) where
 * there is no Clerk session to fall back on.
 *
 * Returns null if the host cannot be mapped — the caller should handle the
 * fallback (e.g. DEFAULT_SYSTEM_PROMPT).
 */
/**
 * Preview/dev tenant fallback. Vercel preview hosts (*.vercel.app) and local
 * dev hosts never match tenants.domain, which made every tenant-resolved
 * surface (session create, tenant-scoped chat) untestable on preview — the
 * §11/§12 blocker in docs/test-plans/auth-boundary-test-plan.md.
 *
 * Honored ONLY when both hold:
 *  - PREVIEW_TENANT_ID is set (configure it in Vercel's Preview environment
 *    ONLY — never in Production), and
 *  - VERCEL_ENV !== 'production' (belt-and-braces: even a misconfigured
 *    Production env var is ignored).
 * A real tenants.domain match always wins over the fallback.
 */
function previewTenantFallback(): string | null {
  const id = process.env.PREVIEW_TENANT_ID
  if (!id) return null
  if (process.env.VERCEL_ENV === 'production') return null
  return id
}

// Hardcoded slug → tenant_id entries for preview tenants whose DB slug column
// may not match the ?preview= value. Checked before the DB lookup so these
// always resolve, even without a matching slug in the tenants row. Only honored
// in non-production (the production guard at the top of resolvePreviewHeader
// makes the map unreachable in production regardless).
const PREVIEW_SLUG_MAP: Record<string, string> = {
  'jeff-lougheed': 'e07334a0-2afd-4544-898b-edb124d2dd33',
}

/**
 * Resolves the tenant from the x-preview-tenant request header (non-production
 * only). The header is set by middleware when an API request arrives with the
 * hl-preview cookie — itself set when the page loaded with ?preview=<slug>.
 * Checks PREVIEW_SLUG_MAP first (hardcoded overrides), then falls back to
 * querying tenants.slug for slugs not in the map.
 */
async function resolvePreviewHeader(
  req: Request,
  supabase: ReturnType<typeof getAdminClient>,
): Promise<string | null> {
  if (process.env.VERCEL_ENV === 'production') return null
  const slug = req.headers.get('x-preview-tenant')
  if (!slug) return null

  const hardcoded = PREVIEW_SLUG_MAP[slug]
  if (hardcoded) {
    console.log('[getTenantFromRequest] resolved via preview slug map:', hardcoded, '(slug:', slug, ')')
    return hardcoded
  }

  const { data, error } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .limit(1)

  if (error) {
    console.error('[getTenantFromRequest] preview slug lookup failed:', error.message)
    return null
  }
  if (data && data.length > 0) {
    console.log('[getTenantFromRequest] resolved via x-preview-tenant:', data[0].id, '(slug:', slug, ')')
    return data[0].id as string
  }
  console.log('[getTenantFromRequest] x-preview-tenant slug not matched:', slug)
  return null
}

export async function getTenantFromRequest(req: Request): Promise<string | null> {
  const host = req.headers.get('host')
  const fullHost = normalizeHost(host)
  const rootDomain = extractRootDomain(host)
  console.log('[getTenantFromRequest] host:', host, 'fullHost:', fullHost, 'rootDomain:', rootDomain)

  // Candidate domains, most specific first: the exact host (so product
  // subdomains like heirloom.2bl.ai resolve to their own tenant) then the
  // registrable root (so app.jefflougheed.ca still falls back to jefflougheed.ca).
  const candidates = Array.from(
    new Set([fullHost, rootDomain].filter((d): d is string => Boolean(d))),
  )
  if (candidates.length === 0) {
    const fallback = previewTenantFallback()
    if (fallback) {
      console.log('[getTenantFromRequest] no resolvable host — using PREVIEW_TENANT_ID fallback:', fallback)
      return fallback
    }
    console.log('[getTenantFromRequest] no resolvable host — returning null')
    return null
  }

  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('tenants')
    .select('id, domain')
    .in('domain', candidates)

  if (error) {
    console.error('[getTenantFromRequest] tenants lookup failed:', error.message)
    return null
  }

  if (!data || data.length === 0) {
    const preview = await resolvePreviewHeader(req, supabase)
    if (preview) return preview
    const fallback = previewTenantFallback()
    if (fallback) {
      console.log('[getTenantFromRequest] no tenant matched candidates:', candidates, '— using PREVIEW_TENANT_ID fallback:', fallback)
      return fallback
    }
    console.log('[getTenantFromRequest] no tenant matched candidates:', candidates)
    return null
  }

  // Prefer the exact-host match over the root-domain fallback.
  const matched =
    (fullHost && data.find((t) => t.domain === fullHost)) ||
    (rootDomain && data.find((t) => t.domain === rootDomain)) ||
    null

  if (!matched) {
    const preview = await resolvePreviewHeader(req, supabase)
    if (preview) return preview
    const fallback = previewTenantFallback()
    if (fallback) {
      console.log('[getTenantFromRequest] no tenant matched candidates:', candidates, '— using PREVIEW_TENANT_ID fallback:', fallback)
      return fallback
    }
    console.log('[getTenantFromRequest] no tenant matched candidates:', candidates)
    return null
  }

  console.log('[getTenantFromRequest] resolved tenant_id:', matched.id, 'via domain:', matched.domain)
  return matched.id as string
}
