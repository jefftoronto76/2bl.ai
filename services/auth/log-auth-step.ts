'use client'

/**
 * Fire-and-forget client-side auth step logger. Posts to /api/auth/log and
 * returns immediately — never blocks the auth flow. keepalive: true ensures
 * the request survives page navigation.
 */
export function logAuthStep(params: {
  event_type: string
  outcome: 'success' | 'failure'
  failure_reason?: string
  metadata: Record<string, unknown>
}): void {
  void fetch('/api/auth/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
    keepalive: true,
  }).catch(() => { /* best-effort — never block the auth flow */ })
}
