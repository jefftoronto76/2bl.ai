'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the email OTP / phone OTP membership
// workflow. Orchestrates:
//   - Email OTP  (sign-in: prepareFirstFactor email_code + attemptFirstFactor;
//                 sign-up: prepareEmailAddressVerification + attemptEmailAddressVerification)
//   - Phone OTP  (sign-in: prepareFirstFactor phone_code + attemptFirstFactor;
//                 sign-up: preparePhoneNumberVerification + attemptPhoneNumberVerification)
//
// Written for @clerk/nextjs v7 (Core 3). useSignIn/useSignUp return
// { signIn/signUp, errors, fetchStatus }. Session activation uses finalize().
//
// New-vs-existing user: sign-in is attempted first. When Clerk throws with
// form_identifier_not_found the hook transparently retries via sign-up.

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

/** Read the first Clerk error code from a thrown ClerkAPIResponseError. */
function getClerkErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errors = (err as { errors?: { code?: string }[] }).errors
    return errors?.[0]?.code ?? null
  }
  return null
}

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

  // Suppress unused-variable warnings — errors/fetchStatus available for future use
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

        // Try sign-in first (existing user). Clerk throws on unknown identifier.
        try {
          await signIn.create({ identifier: email })
          // Existing user — send email OTP.
          await signIn.prepareFirstFactor({ strategy: 'email_code' })
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
        } catch (createErr: unknown) {
          const code = getClerkErrorCode(createErr)
          if (code && NOT_FOUND_CODES.has(code)) {
            // New user — create sign-up and send email OTP.
            await signUp.create({ emailAddress: email })
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
            flowTypeRef.current = 'signup'
            if (mountedRef.current) setStage('otp_input')
          } else {
            throw createErr
          }
        }
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

        // Try sign-in first (existing user). Clerk throws on unknown identifier.
        try {
          await signIn.create({ identifier: phone })
          // Existing user — send phone OTP.
          await signIn.prepareFirstFactor({ strategy: 'phone_code' })
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
        } catch (createErr: unknown) {
          const code = getClerkErrorCode(createErr)
          if (code && NOT_FOUND_CODES.has(code)) {
            // New user — create sign-up and send phone OTP.
            await signUp.create({ phoneNumber: phone })
            await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
            flowTypeRef.current = 'signup'
            if (mountedRef.current) setStage('otp_input')
          } else {
            throw createErr
          }
        }
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
            await signUp.attemptEmailAddressVerification({ code })
            if (signUp.status === 'complete') {
              await signUp.finalize()
              if (mountedRef.current) setStage('success')
            } else {
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          } else {
            await signIn.attemptFirstFactor({ strategy: 'email_code', code })
            if (signIn.status === 'complete') {
              await signIn.finalize()
              if (mountedRef.current) setStage('success')
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
          await signUp.attemptPhoneNumberVerification({ code })
          if (signUp.status === 'complete') {
            await signUp.finalize()
            if (mountedRef.current) setStage('success')
          } else {
            if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
          }
        } else {
          await signIn.attemptFirstFactor({ strategy: 'phone_code', code })
          if (signIn.status === 'complete') {
            await signIn.finalize()
            if (mountedRef.current) setStage('success')
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
