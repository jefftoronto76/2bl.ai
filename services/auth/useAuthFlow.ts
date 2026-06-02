'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the email OTP / phone OTP membership
// workflow. Orchestrates:
//   - Email OTP  (sign-in: prepareFirstFactor email_code;
//                 sign-up: prepareEmailAddressVerification email_code)
//   - Phone OTP  (sign-in: phoneCode.sendCode + phoneCode.verifyCode;
//                 sign-up: verifications.sendPhoneCode + verifications.verifyPhoneCode)
//
// Written for Clerk v7 stable API. useSignIn/useSignUp return the classic
// SignInResource / SignUpResource. setActive is used for session activation.
// Email methods use try/catch; phone methods use { error } destructuring
// (the phone path predates this file and is left as-is — it is working).
//
// New-vs-existing user: sign-in is attempted first. When Clerk throws with
// form_identifier_not_found the hook transparently retries via sign-up. The
// caller never needs to distinguish the two cases.

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
  const { signIn, setActive } = useSignIn()
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
      if (!signIn || !signUp || !setActive) return

      setStage('sending')
      setError(null)
      setContactType('email')
      setContactValue(email)

      try {
        await callValidationGate('email', email)

        // Try sign-in first (existing user).
        let si
        try {
          si = await signIn.create({ identifier: email })
        } catch (createErr: unknown) {
          const code = (
            createErr as { errors?: Array<{ code: string }> }
          )?.errors?.[0]?.code
          if (code && NOT_FOUND_CODES.has(code)) {
            // New user — create sign-up and send email_code OTP.
            await signUp.create({ emailAddress: email })
            await signUp.prepareEmailAddressVerification({ strategy: 'email_code' })
            flowTypeRef.current = 'signup'
            if (mountedRef.current) setStage('otp_input')
            return
          }
          throw createErr
        }

        // Existing user — find the email_code factor and send OTP.
        const emailFactor = si.supportedFirstFactors?.find(
          (f) => f.strategy === 'email_code',
        ) as { strategy: 'email_code'; emailAddressId: string } | undefined

        if (!emailFactor) {
          throw new Error(
            'Email code sign-in is not available for this account. Please use phone or another method.',
          )
        }

        await si.prepareFirstFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        })

        flowTypeRef.current = 'signin'
        if (mountedRef.current) setStage('otp_input')
      } catch (err: unknown) {
        if (mountedRef.current) { setError(extractErrorMessage(err)); setStage('error') }
      }
    },
    [signIn, signUp, setActive],
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

        // Try sign-in first (existing user).
        const { error: createErr } = await signIn.create({ identifier: phone })

        if (createErr && NOT_FOUND_CODES.has(createErr.code)) {
          // New user — create sign-up and send OTP.
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

        if (createErr) {
          if (mountedRef.current) { setError(extractErrorMessage(createErr)); setStage('error') }
          return
        }

        // Existing user — send phone OTP.
        const { error: sendErr } = await signIn.phoneCode.sendCode()
        if (sendErr) {
          if (mountedRef.current) { setError(extractErrorMessage(sendErr)); setStage('error') }
          return
        }

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
      if (!signIn || !signUp || !setActive) return

      setStage('verifying')
      setError(null)

      // ── Email OTP paths (stable API, try/catch) ──────────────────────────
      if (contactType === 'email') {
        try {
          if (flowTypeRef.current === 'signup') {
            const result = await signUp.attemptEmailAddressVerification({ code })
            if (result.status === 'complete') {
              await setActive({ session: result.createdSessionId })
              if (mountedRef.current) setStage('success')
            } else {
              if (mountedRef.current) { setError('Verification did not complete. Please try again.'); setStage('otp_input') }
            }
          } else {
            const result = await signIn.attemptFirstFactor({ strategy: 'email_code', code })
            if (result.status === 'complete') {
              await setActive({ session: result.createdSessionId })
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
    [signIn, signUp, setActive, contactType],
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
