// services/auth/magic-link.ts
//
// Server-side validation for magic-link / OTP requests. The actual sending is
// Clerk's responsibility — initiated client-side via useSignIn (email link flow
// or phone OTP). This module provides the validation gate that /api/auth/magic-link
// applies before the client proceeds with the Clerk SDK call.
//
// Rate limiting (Vercel KV + @upstash/ratelimit) is stubbed in the route handler
// and does not live here — that layer wraps the whole request, not just validation.

export type MagicLinkType = 'email' | 'phone'

export interface MagicLinkInput {
  type: MagicLinkType
  value: string
}

export type MagicLinkResult = { ok: true } | { ok: false; error: string; status: number }

// Basic email format: must have exactly one @, a local part, and a domain with
// at least one dot. Rejects obvious garbage without being RFC 5321 pedantic.
function isValidEmail(value: string): boolean {
  const trimmed = value.trim()
  const at = trimmed.indexOf('@')
  if (at <= 0) return false
  if (at !== trimmed.lastIndexOf('@')) return false
  const domain = trimmed.slice(at + 1)
  return domain.length > 0 && domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

// Phone: must contain at least 7 digits (after stripping formatting characters).
// Accepts international (+1 ...), local, and various formatting styles.
function isValidPhone(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 7
}

/**
 * Validates a magic-link or OTP input. Returns `{ ok: true }` when valid;
 * `{ ok: false, error, status }` when the input should be rejected at the
 * route layer before Clerk is contacted.
 */
export function validateMagicLinkInput(input: MagicLinkInput): MagicLinkResult {
  const value = input.value?.trim() ?? ''

  if (!value) {
    return { ok: false, error: 'Please enter your email or phone number.', status: 400 }
  }

  if (input.type === 'email') {
    if (!isValidEmail(value)) {
      return { ok: false, error: 'Please enter a valid email address.', status: 400 }
    }
  } else {
    if (!isValidPhone(value)) {
      return { ok: false, error: 'Please enter a valid phone number (at least 7 digits).', status: 400 }
    }
  }

  return { ok: true }
}
