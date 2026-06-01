'use client'

// services/auth/useAuthFlow.ts
//
// Client-side authentication flow hook for the magic-link / OTP membership
// workflow. Orchestrates:
//   - Email magic link (sign-in: Clerk createEmailLinkFlow polling;
//                       sign-up: prepareEmailAddressVerification redirect)
//   - Phone OTP        (sign-in: attemptFirstFactor;
//                       sign-up: preparePhoneNumberVerification + attemptPhoneNumberVerification)
//
// The hook calls POST /api/auth/magic-link first (validation + rate-limit gate),
// then uses Clerk's useSignIn / useSignUp hooks to actually send and verify.
//
// New-vs-existing user: sign-in is attempted first. When Clerk returns
// form_identifier_not_found the hook transparently retries via sign-up. The
// caller never needs to distinguish the two cases.
//
// Email link completion:
//   - Sign-in flow: startEmailLinkFlow polls Clerk's API; resolves when the
//     link is clicked from any tab. If clicked in the same tab, the Clerk
//     redirect completes the session before the promise resolves — ClerkProvider
//     picks it up and useUser().isSignedIn becomes true naturally.
//   - Sign-up flow: redirect-only (prepareEmailAddressVerification + Clerk's
//     __clerk_ticket redirect). No polling is needed because ClerkProvider on
//     the redirect target page handles completion.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSignIn, useSignUp } from '@clerk/nextjs'

// ── Public types ─────────────────────────────────────────────────────────────

export type AuthFlowStage =
  | 'idle'        // nothing in progress
  | 'sending'     // API gate + Clerk create() in flight
  | 'email_sent'  // email dispatched, waiting for link click
  | 'otp_input'   // OTP sent, waiting for code entry
  | 'verifying'   // OTP code verification in flight
  | 'success'     // session established (same-tab polling / OTP path)
  | 'expired'     // magic link expired; resend is available
  | 'error'       // unrecoverable; reset() to start over

export type AuthContactType = 'email' | 'phone'

export interface UseAuthFlowReturn {
  stage: AuthFlowStage
  /** Which contact method was submitted. */
  contactType: AuthContactType | null
  /** The submitted email or phone (displayed in "check your…" states). */
  contactValue: string
  /** Human-readable error for the current stage. Null when no error. */
  error: string | null
  sendEmail: (email: string) => Promise<void>
  sendPhone: (phone: string) => Promise<void>
  /** Phone OTP path only — submit the 6-digit code. */
  verifyOtp: (code: string) => Promise<void>
  /** Re-send to the same contact. Available in email_sent and expired stages. */
  resend: () => Promise<void>
  /** Cancel everything and return to idle. */
  reset: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getClerkErrorCode(err: unknown): string | null {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errors = (err as { errors: Array<{ code?: string }> }).errors
    return errors[0]?.code ?? null
  }
  return null
}

function extractClerkError(err: unknown): string {
  if (err && typeof err === 'object' && 'errors' in err) {
    const errors = (err as { errors: Array<{ longMessage?: string; message?: string }> }).errors
    const msg = errors[0]?.longMessage ?? errors[0]?.message
    if (msg) return msg
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

/** Error codes Clerk returns when the identifier has no account. */
const NOT_FOUND_CODES = new Set([
  'form_identifier_not_found',
  'strategy_for_user_invalid',
  'session_exists', // occasionally returned when sign-up is needed instead
])

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
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn()
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp()

  const [stage, setStage] = useState<AuthFlowStage>('idle')
  const [contactType, setContactType] = useState<AuthContactType | null>(null)
  const [contactValue, setContactValue] = useState('')
  const [error, setError] = useState<string | null>(null)

  // 'signin' | 'signup' — which Clerk flow is active. Determines which verify /
  // setActive / resend path to take. Written before any await so it is always
  // consistent with the in-flight Clerk state.
  const flowTypeRef = useRef<'signin' | 'signup' | null>(null)

  // Cancels the email-link polling loop. Set when startEmailLinkFlow is called;
  // cleared on reset / unmount.
  const cancelEmailFlowRef = useRef<(() => void) | null>(null)

  // Stop polling when the component unmounts.
  useEffect(() => {
    return () => {
      cancelEmailFlowRef.current?.()
    }
  }, [])

  const reset = useCallback(() => {
    cancelEmailFlowRef.current?.()
    cancelEmailFlowRef.current = null
    flowTypeRef.current = null
    setStage('idle')
    setError(null)
    setContactType(null)
    setContactValue('')
  }, [])

  // ── Email link ─────────────────────────────────────────────────────────────

  const sendEmail = useCallback(
    async (email: string) => {
      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) return

      cancelEmailFlowRef.current?.()
      cancelEmailFlowRef.current = null

      setStage('sending')
      setError(null)
      setContactType('email')
      setContactValue(email)

      try {
        await callValidationGate('email', email)

        const redirectUrl = window.location.href

        // ── Try sign-in first (existing user) ─────────────────────────────
        let usedSignUp = false
        try {
          await signIn.create({ identifier: email })

          const emailFactor = signIn.supportedFirstFactors?.find(
            (f): f is { strategy: 'email_link'; emailAddressId: string } =>
              f.strategy === 'email_link',
          )
          if (!emailFactor) {
            throw new Error('Email sign-in is not configured for this account.')
          }

          // startEmailLinkFlow sends the email and polls for same-tab completion.
          const { startEmailLinkFlow, cancelEmailLinkFlow } = signIn.createEmailLinkFlow()
          cancelEmailFlowRef.current = cancelEmailLinkFlow
          flowTypeRef.current = 'signin'

          setStage('email_sent')

          // Run in background — resolves when the link is clicked in another tab
          // (cross-tab polling). If clicked in the same tab, Clerk's redirect
          // completes the session before this promise resolves; ClerkProvider
          // handles it and the hook's success branch becomes a no-op race.
          startEmailLinkFlow({
            emailAddressId: emailFactor.emailAddressId,
            redirectUrl,
          })
            .then(async (result) => {
              if (result.status === 'complete' && result.createdSessionId) {
                await setSignInActive({ session: result.createdSessionId })
                setStage('success')
              } else {
                setStage('expired')
              }
            })
            .catch((err: unknown) => {
              // AbortError = cancelEmailLinkFlow() was called (reset / unmount) — silent.
              if ((err as { name?: string })?.name !== 'AbortError') {
                setError(extractClerkError(err))
                setStage('error')
              }
            })
        } catch (signInErr: unknown) {
          const code = getClerkErrorCode(signInErr)
          if (!NOT_FOUND_CODES.has(code ?? '')) throw signInErr

          // ── New user — create sign-up and send via email link redirect ────
          usedSignUp = true
          await signUp.create({ emailAddress: email })
          await signUp.prepareEmailAddressVerification({
            strategy: 'email_link',
            redirectUrl,
          })
          flowTypeRef.current = 'signup'
          setStage('email_sent')
          // Sign-up email links complete via Clerk's __clerk_ticket redirect.
          // No polling needed — ClerkProvider on the landing page handles it.
        }

        void usedSignUp // consumed above; suppress unused-var lint
      } catch (err: unknown) {
        setError(extractClerkError(err))
        setStage('error')
      }
    },
    [signIn, signUp, signInLoaded, signUpLoaded, setSignInActive],
  )

  // ── Phone OTP ──────────────────────────────────────────────────────────────

  const sendPhone = useCallback(
    async (phone: string) => {
      if (!signInLoaded || !signUpLoaded || !signIn || !signUp) return

      setStage('sending')
      setError(null)
      setContactType('phone')
      setContactValue(phone)

      try {
        await callValidationGate('phone', phone)

        // Try sign-in first (existing user).
        try {
          await signIn.create({ strategy: 'phone_code', identifier: phone })
          flowTypeRef.current = 'signin'
        } catch (signInErr: unknown) {
          const code = getClerkErrorCode(signInErr)
          if (!NOT_FOUND_CODES.has(code ?? '')) throw signInErr

          // New user — create sign-up and send OTP.
          await signUp.create({ phoneNumber: phone })
          await signUp.preparePhoneNumberVerification({ strategy: 'phone_code' })
          flowTypeRef.current = 'signup'
        }

        setStage('otp_input')
      } catch (err: unknown) {
        setError(extractClerkError(err))
        setStage('error')
      }
    },
    [signIn, signUp, signInLoaded, signUpLoaded],
  )

  // ── OTP verification ───────────────────────────────────────────────────────

  const verifyOtp = useCallback(
    async (code: string) => {
      if (!signIn || !signUp) return

      setStage('verifying')
      setError(null)

      try {
        if (flowTypeRef.current === 'signup') {
          const result = await signUp.attemptPhoneNumberVerification({ code })
          if (result.status === 'complete' && result.createdSessionId) {
            await setSignUpActive({ session: result.createdSessionId })
            setStage('success')
          } else {
            setError('Verification did not complete. Please try again.')
            setStage('otp_input')
          }
        } else {
          const result = await signIn.attemptFirstFactor({
            strategy: 'phone_code',
            code,
          })
          if (result.status === 'complete' && result.createdSessionId) {
            await setSignInActive({ session: result.createdSessionId })
            setStage('success')
          } else {
            setError('Verification did not complete. Please try again.')
            setStage('otp_input')
          }
        }
      } catch (err: unknown) {
        // Leave user in otp_input so they can correct the code.
        setError(extractClerkError(err))
        setStage('otp_input')
      }
    },
    [signIn, signUp, setSignInActive, setSignUpActive],
  )

  // ── Resend ─────────────────────────────────────────────────────────────────

  const resend = useCallback(async () => {
    if (!contactType || !contactValue) return
    if (contactType === 'email') {
      await sendEmail(contactValue)
    } else {
      await sendPhone(contactValue)
    }
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
