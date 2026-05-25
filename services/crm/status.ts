// Derives the current state of a chat session from its last activity time
// and the tenant's idle thresholds. Pure function — no DB calls. The PATCH
// route writes `in_progress` on every visitor message; the forward
// transitions into `active` and `abandoned` are computed at read time by
// this helper, so the displayed status always reflects the actual elapsed
// time without a background sweep.

export type SessionStatus = 'in_progress' | 'active' | 'abandoned'

export interface SessionStatusThresholds {
  chat_in_progress_idle_seconds: number
  chat_active_idle_seconds: number
}

export interface DeriveSessionStatusInput {
  updatedAt: string | Date
  thresholds: SessionStatusThresholds
  now: Date
}

export function deriveSessionStatus({
  updatedAt,
  thresholds,
  now,
}: DeriveSessionStatusInput): SessionStatus {
  const updated = updatedAt instanceof Date ? updatedAt : new Date(updatedAt)
  const idleSeconds = (now.getTime() - updated.getTime()) / 1000
  if (idleSeconds < thresholds.chat_in_progress_idle_seconds) return 'in_progress'
  if (idleSeconds < thresholds.chat_active_idle_seconds) return 'active'
  return 'abandoned'
}
