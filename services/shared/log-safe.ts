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

function hash8(trimmedLowercased: string): string {
  return createHash('sha256').update(trimmedLowercased).digest('hex').slice(0, 8)
}

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
    hash: hash8(trimmed.toLowerCase()),
  }
}

/**
 * Same hash as logSafeIdentity's `hash` field, but returned bare (no
 * present/length wrapper) for writing into a plain scalar `text` column —
 * e.g. auth_events.email, which stores one value, not a jsonb object.
 * Presence is already encoded by NULL vs. non-NULL on that kind of column,
 * so there's nothing for a wrapper to add. Returns null for a
 * null/undefined/empty/whitespace-only value, same as logSafeIdentity's
 * present:false case.
 */
export function identityHash(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0) return null
  return hash8(trimmed.toLowerCase())
}
