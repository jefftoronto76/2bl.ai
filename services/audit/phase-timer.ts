import { logEvent } from './audit'
import type { AuditAction } from './types'

/**
 * Per-request phase timing, logged as ONE fire-and-forget audit_events row.
 * Same measurement-only posture as services/auth/get-current-user-timed.ts
 * (AUTH_CURRENT_USER_TIMING): nothing about the timed calls changes — same
 * return values, same errors rethrown, no caching/retry — it only records
 * how long each phase took so real latency data accumulates before any fix
 * is attempted.
 *
 * `time(name, fn)` ACCUMULATES into `phases[name]` and counts calls in
 * `counts[name]`, so a phase made of several sequential queries (e.g. a
 * 1–3 query access check) reports its total cost plus how many queries ran.
 *
 * Metadata stays PII-free by construction: callers only ever pass static
 * labels, durations, counts, and an HTTP status — never ids, titles, or
 * request data. The tenant goes in the event's tenant_id column, like every
 * other audit row, not in metadata.
 */
export interface PhaseTimer {
  time<T>(name: string, fn: () => PromiseLike<T>): Promise<T>
  /** Returns the insert's promise so a route can hand it to Next's
   *  `after()` — a bare fire-and-forget can be cut off when a serverless
   *  function stops after sending its response. logEvent never rejects. */
  log(action: AuditAction, base: PhaseTimerLogBase): Promise<void>
  /** Snapshot for tests/inspection — not needed by callers. */
  readonly phases: Readonly<Record<string, number>>
  readonly counts: Readonly<Record<string, number>>
}

export interface PhaseTimerLogBase {
  /** Static label for the route/file — never request data. */
  path: string
  method: string
  status: number
  /** Number of rows returned, when meaningful. A count, not content. */
  rowCount?: number
  /** Written to the `tenant_id` COLUMN (not metadata), per Audit.md's
   *  convention that every logEvent call site passes tenant_id — lets
   *  timing rows be split per tenant. Null/omitted when unresolved. */
  tenantId?: string | null
}

export function createPhaseTimer(now: () => number = Date.now): PhaseTimer {
  const start = now()
  const phases: Record<string, number> = {}
  const counts: Record<string, number> = {}

  return {
    phases,
    counts,
    async time<T>(name: string, fn: () => PromiseLike<T>): Promise<T> {
      const t0 = now()
      try {
        return await fn()
      } finally {
        phases[name] = (phases[name] ?? 0) + (now() - t0)
        counts[name] = (counts[name] ?? 0) + 1
      }
    },
    log(action, base) {
      return logEvent({
        action,
        tenant_id: base.tenantId ?? null,
        outcome: base.status < 400 ? 'success' : 'failure',
        metadata: {
          path: base.path,
          method: base.method,
          status: base.status,
          totalMs: now() - start,
          phases: { ...phases },
          queryCounts: { ...counts },
          ...(base.rowCount !== undefined ? { rowCount: base.rowCount } : {}),
        },
      })
    },
  }
}

/** Times `fn` under `name` when a timer is supplied; otherwise just runs it.
 *  Lets service functions accept an optional timer with zero behavior
 *  change for callers that don't pass one. */
export function timePhase<T>(timer: PhaseTimer | undefined, name: string, fn: () => PromiseLike<T>): Promise<T> {
  return timer ? timer.time(name, fn) : Promise.resolve(fn())
}
