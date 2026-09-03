// services/shared/log-safe.ts
//
// Server-only — uses Node's crypto, unlike services/shared/identity.ts
// (deliberately dependency-free so it can also back client components).
// Never import this from a 'use client' file.
//
// D9 (System Docs/Identity System.md's defect register): raw name/email/
// phone values were being written straight into console.log/warn/error
// calls across several identity-write paths. This is the fix's shared
// primitive — produces a safe-to-log fingerprint (presence, length, an
// 8-hex-char hash) instead of the raw value.
//
// Same algorithm as the Gate 3 identity audit trigger's hash design
// (Design Handovers/identity-tracking-proposal.md §1.6: SHA-256 of the
// trimmed, lowercased value, first 8 hex chars) — deliberately reused
// rather than inventing a second scheme, and chosen specifically because
// it's comparable: two log lines (or a log line and a trigger-logged
// audit_events row) with the same hash carried the same value, without
// either one ever storing or printing what that value actually was.

import { createHash } from 'crypto'

export interface LogSafeIdentity {
  present: boolean
  length: number
  hash?: string
}

export function logSafeIdentity(value: string | null | undefined): LogSafeIdentity {
  if (typeof value !== 'string') return { present: false, length: 0 }
  const trimmed = value.trim()
  if (trimmed.length === 0) return { present: false, length: 0 }
  return {
    present: true,
    length: trimmed.length,
    hash: createHash('sha256').update(trimmed.toLowerCase()).digest('hex').slice(0, 8),
  }
}
