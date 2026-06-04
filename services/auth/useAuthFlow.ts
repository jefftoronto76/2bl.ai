'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the email OTP / phone OTP membership
// workflow. Orchestrates:
//   - Email OTP  (sign-up: verifications.sendEmailCode;
//                 sign-in: emailCode.sendCode)
//   - Phone OTP  (sign-up: verifications.sendPhoneCode;
//                 sign-in: phoneCode.sendCode)
//
// Written for Clerk v7 stable API. useSignIn/useSignUp return the classic
// SignInResource / SignUpResource.
//
// New-vs-existing user: sign-up is attempted first (this is a sign-up surface).
// When Clerk throws form_identifier_exists the hook transparently falls back to
// sign-in. The caller never needs to distinguish the two cases.

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

/** Extract the first Clerk error code from a thrown ClerkAPIResponseError. */
function getClerkErrorCode(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null
  if (!('errors' in err) || !Array.isArray((err as Record<string, unknown>).errors)) return null
  const first = (err as { errors: unknown[] }).errors[0]
  if (typeof first !== 'object' || first === null || !('code' in first)) return null
  const code = (first as Record<string, unknown>).code
  return typeof code === 'string' ? code : null
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
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()

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

        // Try sign-up first (this is a sign-up surface).
        let isExistingUser = false
        try {
          await signUp.create({ emailAddress: email })
        } catch (signUpCreateErr: unknown) {
          if (getClerkErrorCode(signUpCreateErr) === 'form_identifier_exists') {
            // Account already exists — fall back to sign-in silently.
            isExistingUser = true
          } else {
            throw signUpCreateErr
          }
        }

        if (isExistingUser) {
          // Existing user — sign in and send email code.
          const { error: createErr } = await signIn.create({ identifier: email })
          if (createErr) {
            if (mountedRef.current) { setError(extractErrorMessage(createErr)); setStage('error') }
            return
          }
          const { error: sendErr } = await signIn.emailCode.sendCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
        } else {
          // New user — send email code via sign-up.
          const { error: sendErr } = await signUp.verifications.sendEmailCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signup'
          if (mountedRef.current) setStage('otp_input')
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

        // Try sign-up first (this is a sign-up surface).
        let isExistingUser = false
        try {
          await signUp.create({ phoneNumber: phone })
        } catch (signUpCreateErr: unknown) {
          if (getClerkErrorCode(signUpCreateErr) === 'form_identifier_exists') {
            // Account already exists — fall back to sign-in silently.
            isExistingUser = true
          } else {
            throw signUpCreateErr
          }
        }

        if (isExistingUser) {
          // Existing user — sign in and send phone OTP.
          const { error: createErr } = await signIn.create({ identifier: phone })
          if (createErr) {
            if (mountedRef.current) { setError(extractErrorMessage(createErr)); setStage('error') }
            return
          }
          const { error: sendErr } = await signIn.phoneCode.sendCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signin'
          if (mountedRef.current) setStage('otp_input')
        } else {
          // New user — send phone OTP via sign-up.
          const { error: sendErr } = await signUp.verifications.sendPhoneCode()
          if (sendErr) {
            if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
            return
          }
          flowTypeRef.current = 'signup'
          if (mountedRef.current) setStage('otp_input')
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
            const { error: verifyErr } = await signUp.verifications.verifyEmailCode({ code })
            if (verifyErr) {
              if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
              return
            }
            if (signUp.status === 'complete') {
              const { error: finalizeErr } = await signUp.finalize()
              if (mountedRef.current) {
                if (finalizeErr) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
                else setStage('success')
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
              const { error: finalizeErr } = await signIn.finalize()
              if (mountedRef.current) {
                if (finalizeErr) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
                else setStage('success')
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

      // ── Phone OTP paths (unchanged) ──────────────────────────────────────
      try {
        if (flowTypeRef.current === 'signup') {
          const { error: verifyErr } = await signUp.verifications.verifyPhoneCode({ code })
          if (verifyErr) {
            if (mountedRef.current) { setError(extractErrorMessage(verifyErr)); setStage('otp_input') }
            return
          }
          if (signUp.status === 'complete') {
            const { error: finalizeErr } = await signUp.finalize()
            if (mountedRef.current) {
              if (finalizeErr) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              else setStage('success')
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
            const { error: finalizeErr } = await signIn.finalize()
            if (mountedRef.current) {
              if (finalizeErr) { setError(extractErrorMessage(finalizeErr)); setStage('error') }
              else setStage('success')
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
