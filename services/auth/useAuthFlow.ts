'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the email OTP / phone OTP membership
// workflow. Written for @clerk/nextjs v7 (Core 3 — SignInFutureResource /
// SignUpFutureResource). Core 3 documents { error: ClerkError | null } returns
// (no throw), but some builds throw ClerkAPIResponseError on HTTP 4xx — both
// paths are normalised at the sendCode call sites.
//
// Sign-in OTP:
//   signIn.emailCode.sendCode({ emailAddress }) / phoneCode.sendCode({ phoneNumber })
//   → signIn.emailCode.verifyCode({ code }) / phoneCode.verifyCode({ code })
//   → signIn.finalize({ navigate: () => {} })
//
// Sign-up OTP:
//   signUp.create({ emailAddress / phoneNumber })
//   → signUp.verifications.sendEmailCode() / sendPhoneCode()
//   → signUp.verifications.verifyEmailCode({ code }) / verifyPhoneCode({ code })
//   → signUp.finalize({ navigate: () => {} })
//
// New-vs-existing user: sendCode is attempted first. When Clerk returns
// form_identifier_not_found the hook transparently creates a sign-up.
// The caller never needs to distinguish the two cases.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/nextjs'

// ── Public types ─────────────────────────────────────────────────────────────

export type AuthFlowStage =
  | 'idle'        // nothing in progress
  | 'sending'     // API gate + Clerk create() in flight
  | 'email_sent'  // email dispatched, waiting for link click
  | 'otp_input'   // OTP sent, waiting for code entry
  | 'verifying'   // OTP code verification in flight
  | 'success'     // session established
  | 'expired'     // magic link expired; resend is available
  | 'error'       // unrecoverable; reset() to start over

export type AuthContactType = 'email' | 'phone'

export interface UseAuthFlowReturn {
  stage: AuthFlowStage
  contactType: AuthContactType | null
  contactValue: string
  error: string | null
  sendEmail: (email: string) => Promise<void>
  sendPhone: (phone: string) => Promise<void>
  verifyOtp: (code: string) => Promise<void>
  resend: () => Promise<void>
  reset: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractErrorMessage(err: unknown): string {
  if (!err) return 'Something went wrong. Please try again.'
  if (typeof err === 'object' && err !== null) {
    if ('longMessage' in err && typeof (err as { longMessage?: string }).longMessage === 'string')
      return (err as { longMessage: string }).longMessage
    if ('message' in err && typeof (err as { message?: string }).message === 'string')
      return (err as { message: string }).message
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

/**
 * Extract a Clerk error code from a thrown value.
 * ClerkAPIResponseError shape: { errors: [{ code, message, longMessage }] }
 */
function extractClerkErrorCode(err: unknown): string {
  if (!err || typeof err !== 'object') return 'unknown_error'
  const e = err as Record<string, unknown>
  if (Array.isArray(e.errors) && e.errors.length > 0) {
    const first = e.errors[0] as Record<string, unknown>
    if (typeof first.code === 'string') return first.code
  }
  if (typeof e.code === 'string') return e.code
  return 'unknown_error'
}

/**
 * Fire-and-forget auth step logger. Posts to /api/auth/log and returns
 * immediately — never awaited so it never blocks the auth flow.
 * keepalive: true ensures the request survives page navigation.
 */
function logAuthStep(params: {
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

/** Hit the server validation + rate-limit gate before calling Clerk. */
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
  const { signIn, errors: signInErrors, fetchStatus: signInFetchStatus } = useSignIn()
  const { signUp, errors: signUpErrors, fetchStatus: signUpFetchStatus } = useSignUp()

  // Suppress unused-variable warnings — available for future diagnostic use
  void signInErrors; void signInFetchStatus; void signUpErrors; void signUpFetchStatus

  const [stage, setStage] = useState<AuthFlowStage>('idle')
  const [contactType, setContactType] = useState<AuthContactType | null>(null)
  const [contactValue, setContactValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 'signin' | 'signup' — which Clerk flow is active.
  const flowTypeRef = useRef<'signin' | 'signup' | null>(null)

  // Guards setState calls after unmount.
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const reset = useCallback(() => {
    flowTypeRef.current = null
    setStage('idle')
    setError(null)
    setContactType(null)
    setContactValue('')
  }, [])

  // ── Email OTP ──────────────────────────────────────────────────────────────

  const sendEmail = useCallback(
    async (email: string) => {
      if (!signIn || !signUp) return

      setStage('sending')
      setError(null)
      setContactType('email')
      setContactValue(email)

      try {
        await callValidationGate('email', email)

        // Try sign-in first. Any failure — returned error or thrown — routes to
        // sign-up. The only terminal state is when both paths fail.
        let signInSucceeded = false
        try {
          const r = await signIn.emailCode.sendCode({ emailAddress: email })
          if (!r.error) {
            signInSucceeded = true
          } else {
            logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
              failure_reason: r.error.code,
              metadata: { step: 'sendCode_returned', contactType: 'email', code: r.error.code } })
          }
        } catch (e: unknown) {
          const code = extractClerkErrorCode(e)
          const httpStatus = (e as Record<string, unknown>).status
          logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
            failure_reason: `sendCode_threw_${httpStatus ?? 'unknown'}`,
            metadata: { step: 'sendCode_threw', contactType: 'email', code, httpStatus } })
        }

        if (signInSucceeded) {
          logAuthStep({ event_type: 'otp_sent', outcome: 'success',
            metadata: { step: 'otp_sent', contactType: 'email', flowType: 'signin' } })
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
          return
        }

        // sendCode failed for any reason — attempt sign-up.
        const { error: signUpErr } = await signUp.create({ emailAddress: email })
        if (signUpErr) {
          logAuthStep({ event_type: 'sign_up', outcome: 'failure',
            failure_reason: extractErrorMessage(signUpErr),
            metadata: { step: 'signUp_create', contactType: 'email' } })
          if (mountedRef.current) { setError(extractErrorMessage(signUpErr)); setStage('error') }
          return
        }
        const { error: sendErr } = await signUp.verifications.sendEmailCode()
        if (sendErr) {
          logAuthStep({ event_type: 'otp_sent', outcome: 'failure',
            failure_reason: extractErrorMessage(sendErr),
            metadata: { step: 'signUp_sendEmailCode', contactType: 'email' } })
          if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
          return
        }
        logAuthStep({ event_type: 'otp_sent', outcome: 'success',
          metadata: { step: 'otp_sent', contactType: 'email', flowType: 'signup' } })
        flowTypeRef.current = 'signup'
        if (mountedRef.current) setStage('otp_input')
      } catch (err: unknown) {
        logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
          failure_reason: extractErrorMessage(err),
          metadata: { step: 'sendEmail_outer_catch', contactType: 'email' } })
        if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('error') }
      }
    },
    [signIn, signUp],
  )

  // ── Phone OTP ──────────────────────────────────────────────────────────────

  const sendPhone = useCallback(
    async (phone: string) => {
      if (!signIn || !signUp) return

      setStage('sending')
      setError(null)
      setContactType('phone')
      setContactValue(phone)

      try {
        await callValidationGate('phone', phone)

        // Try sign-in first. Any failure — returned error or thrown — routes to
        // sign-up. The only terminal state is when both paths fail.
        let signInSucceeded = false
        try {
          const r = await signIn.phoneCode.sendCode({ phoneNumber: phone })
          if (!r.error) {
            signInSucceeded = true
          } else {
            logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
              failure_reason: r.error.code,
              metadata: { step: 'sendCode_returned', contactType: 'phone', code: r.error.code } })
          }
        } catch (e: unknown) {
          const code = extractClerkErrorCode(e)
          const httpStatus = (e as Record<string, unknown>).status
          logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
            failure_reason: `sendCode_threw_${httpStatus ?? 'unknown'}`,
            metadata: { step: 'sendCode_threw', contactType: 'phone', code, httpStatus } })
        }

        if (signInSucceeded) {
          logAuthStep({ event_type: 'otp_sent', outcome: 'success',
            metadata: { step: 'otp_sent', contactType: 'phone', flowType: 'signin' } })
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
          return
        }

        // sendCode failed for any reason — attempt sign-up.
        const { error: signUpErr } = await signUp.create({ phoneNumber: phone })
        if (signUpErr) {
          logAuthStep({ event_type: 'sign_up', outcome: 'failure',
            failure_reason: extractErrorMessage(signUpErr),
            metadata: { step: 'signUp_create', contactType: 'phone' } })
          if (mountedRef.current) { setError(extractErrorMessage(signUpErr)); setStage('error') }
          return
        }
        const { error: sendErr } = await signUp.verifications.sendPhoneCode()
        if (sendErr) {
          logAuthStep({ event_type: 'otp_sent', outcome: 'failure',
            failure_reason: extractErrorMessage(sendErr),
            metadata: { step: 'signUp_sendPhoneCode', contactType: 'phone' } })
          if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
          return
        }
        logAuthStep({ event_type: 'otp_sent', outcome: 'success',
          metadata: { step: 'otp_sent', contactType: 'phone', flowType: 'signup' } })
        flowTypeRef.current = 'signup'
        if (mountedRef.current) setStage('otp_input')
      } catch (err: unknown) {
        logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
          failure_reason: extractErrorMessage(err),
          metadata: { step: 'sendPhone_outer_catch', contactType: 'phone' } })
        if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('error') }
      }
    },
    [signIn, signUp],
  )

  // ── OTP verification ───────────────────────────────────────────────────────

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!signIn || !signUp) return

      setStage('verifying')
      setError(null)

      // ── Email OTP paths ──────────────────────────────────────────────────
      if (contactType === 'email') {
        try {
          if (flowTypeRef.current === 'signup') {
            const { error: verifyErr } = await signUp.verifications.verifyEmailCode({ code })
            if (verifyErr) {
              logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
                failure_reason: extractErrorMessage(verifyErr),
                metadata: { step: 'verifyEmailCode', contactType: 'email', flowType: 'signup' } })
              if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
              return
            }
            if (signUp.status === 'missing_requirements') {
              const { error: updateErr } = await signUp.update({})
              if (updateErr) {
                logAuthStep({ event_type: 'sign_up', outcome: 'failure',
                  failure_reason: extractErrorMessage(updateErr),
                  metadata: { step: 'signUp_update', contactType: 'email', flowType: 'signup' } })
                if (mountedRef.current) { setError(extractErrorMessage(updateErr)); setStage('error') }
                return
              }
              logAuthStep({ event_type: 'sign_up', outcome: 'success',
                metadata: { step: 'signUp_update', contactType: 'email', flowType: 'signup' } })
            }
            if (signUp.status === 'complete') {
              try {
                await signUp.finalize({ navigate: () => {} })
                logAuthStep({ event_type: 'sign_up', outcome: 'success',
                  metadata: { step: 'finalize', contactType: 'email', flowType: 'signup' } })
                if (mountedRef.current) setStage('success')
              } catch (finalizeErr: unknown) {
                logAuthStep({ event_type: 'sign_up', outcome: 'failure',
                  failure_reason: extractErrorMessage(finalizeErr),
                  metadata: { step: 'finalize_threw', contactType: 'email', flowType: 'signup' } })
                if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              }
            } else {
              logAuthStep({ event_type: 'sign_up', outcome: 'failure',
                failure_reason: `signUp.status=${signUp.status}`,
                metadata: { step: 'status_not_complete', contactType: 'email', flowType: 'signup', status: signUp.status } })
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          } else {
            const { error: verifyErr } = await signIn.emailCode.verifyCode({ code })
            if (verifyErr) {
              logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
                failure_reason: extractErrorMessage(verifyErr),
                metadata: { step: 'verifyEmailCode', contactType: 'email', flowType: 'signin' } })
              if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
              return
            }
            if (signIn.status === 'complete') {
              try {
                await signIn.finalize({ navigate: () => {} })
                logAuthStep({ event_type: 'sign_in', outcome: 'success',
                  metadata: { step: 'finalize', contactType: 'email', flowType: 'signin' } })
                if (mountedRef.current) setStage('success')
              } catch (finalizeErr: unknown) {
                logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
                  failure_reason: extractErrorMessage(finalizeErr),
                  metadata: { step: 'finalize_threw', contactType: 'email', flowType: 'signin' } })
                if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              }
            } else {
              logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
                failure_reason: `signIn.status=${signIn.status}`,
                metadata: { step: 'status_not_complete', contactType: 'email', flowType: 'signin', status: signIn.status } })
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          }
        } catch (err: unknown) {
          logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
            failure_reason: extractErrorMessage(err),
            metadata: { step: 'verifyOtp_email_catch', contactType: 'email' } })
          if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('otp_input') }
        }
        return
      }

      // ── Phone OTP paths ──────────────────────────────────────────────────
      try {
        if (flowTypeRef.current === 'signup') {
          const { error: verifyErr } = await signUp.verifications.verifyPhoneCode({ code })
          if (verifyErr) {
            logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
              failure_reason: extractErrorMessage(verifyErr),
              metadata: { step: 'verifyPhoneCode', contactType: 'phone', flowType: 'signup' } })
            if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
            return
          }
          if (signUp.status === 'missing_requirements') {
            const { error: updateErr } = await signUp.update({})
            if (updateErr) {
              logAuthStep({ event_type: 'sign_up', outcome: 'failure',
                failure_reason: extractErrorMessage(updateErr),
                metadata: { step: 'signUp_update', contactType: 'phone', flowType: 'signup' } })
              if (mountedRef.current) { setError(extractErrorMessage(updateErr)); setStage('error') }
              return
            }
            logAuthStep({ event_type: 'sign_up', outcome: 'success',
              metadata: { step: 'signUp_update', contactType: 'phone', flowType: 'signup' } })
          }
          if (signUp.status === 'complete') {
            try {
              await signUp.finalize({ navigate: () => {} })
              logAuthStep({ event_type: 'sign_up', outcome: 'success',
                metadata: { step: 'finalize', contactType: 'phone', flowType: 'signup' } })
              if (mountedRef.current) setStage('success')
            } catch (finalizeErr: unknown) {
              logAuthStep({ event_type: 'sign_up', outcome: 'failure',
                failure_reason: extractErrorMessage(finalizeErr),
                metadata: { step: 'finalize_threw', contactType: 'phone', flowType: 'signup' } })
              if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
            }
          } else {
            logAuthStep({ event_type: 'sign_up', outcome: 'failure',
              failure_reason: `signUp.status=${signUp.status}`,
              metadata: { step: 'status_not_complete', contactType: 'phone', flowType: 'signup', status: signUp.status } })
            if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
          }
        } else {
          const { error: verifyErr } = await signIn.phoneCode.verifyCode({ code })
          if (verifyErr) {
            logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
              failure_reason: extractErrorMessage(verifyErr),
              metadata: { step: 'verifyPhoneCode', contactType: 'phone', flowType: 'signin' } })
            if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
            return
          }
          if (signIn.status === 'complete') {
            try {
              await signIn.finalize({ navigate: () => {} })
              logAuthStep({ event_type: 'sign_in', outcome: 'success',
                metadata: { step: 'finalize', contactType: 'phone', flowType: 'signin' } })
              if (mountedRef.current) setStage('success')
            } catch (finalizeErr: unknown) {
              logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
                failure_reason: extractErrorMessage(finalizeErr),
                metadata: { step: 'finalize_threw', contactType: 'phone', flowType: 'signin' } })
              if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
            }
          } else {
            logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
              failure_reason: `signIn.status=${signIn.status}`,
              metadata: { step: 'status_not_complete', contactType: 'phone', flowType: 'signin', status: signIn.status } })
            if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
          }
        }
      } catch (err: unknown) {
        logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
          failure_reason: extractErrorMessage(err),
          metadata: { step: 'verifyOtp_phone_catch', contactType: 'phone' } })
        if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('otp_input') }
      }
    },
    [signIn, signUp, contactType],
  )

  // ── Resend ─────────────────────────────────────────────────────────────────

  const resend = useCallback(async () => {
    if (!contactType || !contactValue) return
    if (contactType === 'email') await sendEmail(contactValue)
    else await sendPhone(contactValue)
  }, [contactType, contactValue, sendEmail, sendPhone])

  return {
    stage,
    contactType,
    contactValue,
    error,
    sendEmail,
    sendPhone,
    verifyOtp,
    resend,
    reset,
  }
}
