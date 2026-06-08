'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the email OTP / phone OTP membership
// workflow. Written for @clerk/nextjs v7 (Core 3 — SignInFutureResource /
// SignUpFutureResource). All Clerk methods return { error: ClerkError | null };
// they do not throw.
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

/** Error codes Clerk returns when the identifier has no account. */
const NOT_FOUND_CODES = new Set([
  'form_identifier_not_found',
  'strategy_for_user_invalid',
])

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

        // Core 3: sendCode with emailAddress handles user lookup internally.
        // Returns form_identifier_not_found when the email has no account.
        const { error: signInErr } = await signIn.emailCode.sendCode({ emailAddress: email })

        if (signInErr && NOT_FOUND_CODES.has(signInErr.code)) {
          // New user — create sign-up and send email OTP.
          const { error: signUpErr } = await signUp.create({ emailAddress: email })
          if (signUpErr) {
            if (mountedRef.current) { setError(extractErrorMessage(signUpErr)); setStage('error') }
            return
          }
          const { error: sendErr } = await signUp.verifications.sendEmailCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signup'
          if (mountedRef.current) setStage('otp_input')
          return
        }

        if (signInErr) {
          if (mountedRef.current) { setError(extractErrorMessage(signInErr)); setStage('error') }
          return
        }

        // Existing user — OTP sent via sendCode above.
        flowTypeRef.current = 'signin'
        if (mountedRef.current) setStage('otp_input')
      } catch (err: unknown) {
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

        // Core 3: sendCode with phoneNumber handles user lookup internally.
        // Returns form_identifier_not_found when the phone has no account.
        const { error: signInErr } = await signIn.phoneCode.sendCode({ phoneNumber: phone })

        if (signInErr && NOT_FOUND_CODES.has(signInErr.code)) {
          // New user — create sign-up and send phone OTP.
          const { error: signUpErr } = await signUp.create({ phoneNumber: phone })
          if (signUpErr) {
            if (mountedRef.current) { setError(extractErrorMessage(signUpErr)); setStage('error') }
            return
          }
          const { error: sendErr } = await signUp.verifications.sendPhoneCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signup'
          if (mountedRef.current) setStage('otp_input')
          return
        }

        if (signInErr) {
          if (mountedRef.current) { setError(extractErrorMessage(signInErr)); setStage('error') }
          return
        }

        // Existing user — OTP sent via sendCode above.
        flowTypeRef.current = 'signin'
        if (mountedRef.current) setStage('otp_input')
      } catch (err: unknown) {
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
              if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
              return
            }
            if (signUp.status === 'complete') {
              try {
                await signUp.finalize({ navigate: () => {} })
                if (mountedRef.current) setStage('success')
              } catch (finalizeErr: unknown) {
                if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              }
            } else {
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          } else {
            const { error: verifyErr } = await signIn.emailCode.verifyCode({ code })
            if (verifyErr) {
              if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
              return
            }
            if (signIn.status === 'complete') {
              try {
                await signIn.finalize({ navigate: () => {} })
                if (mountedRef.current) setStage('success')
              } catch (finalizeErr: unknown) {
                if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              }
            } else {
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          }
        } catch (err: unknown) {
          if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('otp_input') }
        }
        return
      }

      // ── Phone OTP paths ──────────────────────────────────────────────────
      try {
        if (flowTypeRef.current === 'signup') {
          const { error: verifyErr } = await signUp.verifications.verifyPhoneCode({ code })
          if (verifyErr) {
            if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
            return
          }
          if (signUp.status === 'complete') {
            try {
              await signUp.finalize({ navigate: () => {} })
              if (mountedRef.current) setStage('success')
            } catch (finalizeErr: unknown) {
              if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
            }
          } else {
            if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
          }
        } else {
          const { error: verifyErr } = await signIn.phoneCode.verifyCode({ code })
          if (verifyErr) {
            if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
            return
          }
          if (signIn.status === 'complete') {
            try {
              await signIn.finalize({ navigate: () => {} })
              if (mountedRef.current) setStage('success')
            } catch (finalizeErr: unknown) {
              if (mountedRef.current) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
            }
          } else {
            if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
          }
        }
      } catch (err: unknown) {
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
