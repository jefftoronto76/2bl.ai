export interface TenantCandidate {
  tenant_id: string
  domain: string | null
}

/**
 * Normalizes a Host header value for exact comparison against a tenant's
 * `domain`: lowercases, strips the port, strips a single leading `www.`.
 *
 * Crucially it does NOT collapse subdomains — `heirloom.jefflougheed.ca`
 * stays distinct from `jefflougheed.ca`, because subdomain-per-tenant routing
 * is the whole point here. (Contrast `getTenantFromRequest`, which collapses
 * to the root domain for the anonymous public Sage chat.)
 */
export function normalizeHost(host: string | null | undefined): string | null {
  if (!host) return null
  let h = host.split(':')[0].trim().toLowerCase()
  if (h.startsWith('www.')) h = h.slice(4)
  return h || null
}

/**
 * Full-host exact match of a request Host against candidate tenant domains.
 * Returns the matching tenant_id, or null when nothing matches (Vercel
 * preview hosts, localhost, unconfigured domains) — the caller owns the
 * fallback decision.
 */
export function resolveTenantIdFromHost(
  host: string | null | undefined,
  candidates: TenantCandidate[],
): string | null {
  const normalized = normalizeHost(host)
  if (!normalized) return null
  for (const candidate of candidates) {
    if (normalizeHost(candidate.domain) === normalized) {
      return candidate.tenant_id
    }
  }
  return null
}
