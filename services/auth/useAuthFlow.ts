'use client'

// services/auth/useAuthFlow.ts
//
// Stage machine for the email OTP / phone OTP membership auth flow. Owns UI
// state only: stages, the active contact, error display, the server
// validation gate, resend, and reset. Every provider call — sign-in-vs-sign-up
// detection, OTP send/verify, session finalize, and the step-by-step
// auth_events telemetry — lives in the provider adapter
// (providers/clerk/client.ts useAuthFlowAdapter). The public UseAuthFlowReturn
// shape is unchanged from the pre-boundary implementation, so consumers
// (MagicLinkCard) need no API changes.
//
// Stage transitions on failure follow the adapter's `terminal` flag:
// terminal → 'error' (reset() to start over); retryable → 'otp_input'.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuthFlowAdapter } from './providers/clerk/client'
import { extractErrorMessage } from './providers/clerk/errors'
import { logAuthStep } from './log-auth-step'

// ── Public types ─────────────────────────────────────────────────────────────

export type AuthFlowStage =
  | 'idle'        // nothing in progress
  | 'sending'     // API gate + provider send in flight
  | 'email_sent'  // email dispatched, waiting for link click
  | 'otp_input'   // OTP sent, waiting for code entry
  | 'verifying'   // OTP code verification in flight
  | 'success'     // session established
  | 'expired'     // magic link expired; resend is available
  | 'error'       // unrecoverable; reset() to start over

export type AuthContactType = 'email' | 'phone'

/** Which provider flow the current attempt resolved to — 'signin' for an
 *  existing user, 'signup' for a new one. Set when the OTP send succeeds;
 *  null before that and after reset(). Lets consumers branch success copy
 *  ("Welcome back" vs "You're now a member"). */
export type AuthFlowType = 'signin' | 'signup'

export interface UseAuthFlowReturn {
  stage: AuthFlowStage
  contactType: AuthContactType | null
  contactValue: string
  flowType: AuthFlowType | null
  error: string | null
  /** Optional name is attached to the Clerk profile on the sign-up path
   *  (first whitespace token → firstName, remainder → lastName).
   *  Optional inviteToken is written to Clerk unsafeMetadata on the sign-up
   *  path so the webhook can look up the invited members row by token.
   *  Optional storyInviteToken is written alongside it so the webhook can
   *  call acceptStoryInvite directly instead of racing the client's own
   *  accept call. */
  sendEmail: (email: string, name?: string, inviteToken?: string | null, storyInviteToken?: string | null) => Promise<void>
  sendPhone: (phone: string, name?: string, inviteToken?: string | null, storyInviteToken?: string | null) => Promise<void>
  verifyOtp: (code: string) => Promise<void>
  resend: () => Promise<void>
  reset: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Split a free-text name into Clerk's firstName/lastName: first whitespace
 *  token → firstName, remainder → lastName (mapClerkUser rejoins them). */
function splitFullName(name?: string): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim()
  if (!trimmed) return {}
  const idx = trimmed.search(/\s/)
  if (idx === -1) return { firstName: trimmed }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() }
}

/** Hit the server validation + rate-limit gate before calling the provider. */
async function callValidationGate(type: AuthContactType, value: string): Promise<void> {
  const res = await fetch('/api/auth/magic-link', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, value }),
  })
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? `Request failed (${res.status})`)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuthFlow(): UseAuthFlowReturn {
  const adapter = useAuthFlowAdapter()

  const [stage, setStage] = useState<AuthFlowStage>('idle')
  const [contactType, setContactType] = useState<AuthContactType | null>(null)
  const [contactValue, setContactValue] = useState('')
  const [flowType, setFlowType] = useState<AuthFlowType | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Name and invite token supplied with the active attempt, kept so resend() re-sends them.
  const nameRef = useRef<string | undefined>(undefined)
  const inviteTokenRef = useRef<string | null | undefined>(undefined)
  const storyInviteTokenRef = useRef<string | null | undefined>(undefined)

  // Guards setState calls after unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const reset = useCallback(() => {
    setStage('idle')
    setError(null)
    setContactType(null)
    setContactValue('')
    setFlowType(null)
  }, [])

  // ── Send (shared by email + phone) ─────────────────────────────────────────

  const send = useCallback(
    async (type: AuthContactType, value: string, name?: string, inviteToken?: string | null, storyInviteToken?: string | null) => {
      if (!adapter.isReady) return

      setStage('sending')
      setError(null)
      setContactType(type)
      setContactValue(value)
      setFlowType(null)
      nameRef.current = name?.trim() || undefined
      inviteTokenRef.current = inviteToken
      storyInviteTokenRef.current = storyInviteToken

      try {
        // Validation gate runs BEFORE any provider call — ordering is
        // load-bearing (server-side rate limiting fronts the provider).
        await callValidationGate(type, value)

        const result = await adapter.sendCode({ type, value, ...splitFullName(nameRef.current), inviteToken: inviteTokenRef.current ?? undefined, storyInviteToken: storyInviteTokenRef.current ?? undefined })
        if (!result.ok) {
          if (mountedRef.current) { setError(result.message); setStage('error') }
          return
        }
        if (mountedRef.current) {
          setFlowType(result.flow)
          setStage('otp_input')
        }
      } catch (err: unknown) {
        // Validation-gate failures and unexpected throws land here — the
        // adapter logs its own provider steps; this preserves the outer-catch
        // telemetry verbatim.
        logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
          failure_reason: extractErrorMessage(err),
          metadata: { auth_surface: 'custom_otp', step: type === 'email' ? 'sendEmail_outer_catch' : 'sendPhone_outer_catch', contactType: type } })
        if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('error') }
      }
    },
    [adapter],
  )

  const sendEmail = useCallback((email: string, name?: string, inviteToken?: string | null, storyInviteToken?: string | null) => send('email', email, name, inviteToken, storyInviteToken), [send])
  const sendPhone = useCallback((phone: string, name?: string, inviteToken?: string | null, storyInviteToken?: string | null) => send('phone', phone, name, inviteToken, storyInviteToken), [send])

  // ── OTP verification ───────────────────────────────────────────────────────

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!adapter.isReady || !contactType) return

      setStage('verifying')
      setError(null)

      const result = await adapter.verifyCode({ type: contactType, value: contactValue }, code)
      if (result.ok) {
        if (mountedRef.current) setStage('success')
        return
      }
      if (mountedRef.current) {
        setError(result.message)
        setStage(result.terminal ? 'error' : 'otp_input')
      }
    },
    [adapter, contactType, contactValue],
  )

  // ── Resend ─────────────────────────────────────────────────────────────────

  const resend = useCallback(async () => {
    if (!contactType || !contactValue) return
    await send(contactType, contactValue, nameRef.current, inviteTokenRef.current, storyInviteTokenRef.current)
  }, [contactType, contactValue, send])

  return {
    stage,
    contactType,
    contactValue,
    flowType,
    error,
    sendEmail,
    sendPhone,
    verifyOtp,
    resend,
    reset,
  }
}
