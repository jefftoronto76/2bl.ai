'use client'

// Clerk client adapter — the only place client-side code may import
// @clerk/nextjs hooks. Product components consume useAuthUser / useAuthActions
// via @/services/auth/client; the OTP stage machine (useAuthFlow) consumes
// useAuthFlowAdapter directly (in-boundary).

import { useCallback, useMemo, useRef } from 'react'
import { useClerk, useSignIn, useSignUp, useUser } from '@clerk/nextjs'

import type { AuthActions, AuthAppearance, AuthUserState } from '../../types'
import { logAuthStep } from '../../log-auth-step'
import { extractClerkErrorCode, extractErrorMessage } from './errors'
import { mapClerkUser } from './map'

/**
 * Provider-agnostic mirror of Clerk's useUser().
 *
 * The `isLoaded` / `isSignedIn` tri-state is passed through VERBATIM:
 * `isSignedIn` stays `undefined` until Clerk has loaded. Consumers gate on the
 * loaded false→true transition (chatStore's session recovery and
 * first-observation guard) — coercing to boolean while `!isLoaded` would
 * corrupt those gates.
 */
export function useAuthUser(): AuthUserState {
  const { isLoaded, isSignedIn, user } = useUser()
  return {
    isLoaded,
    isSignedIn,
    // undefined = provider not loaded yet; null = loaded, signed out.
    user: !isLoaded ? undefined : user ? mapClerkUser(user) : null,
  }
}

/**
 * Imperative auth actions. `signOut` keeps the provider's configured
 * `afterSignOutUrl` semantics (set on AuthProvider in the root layout) —
 * do not wrap it with extra navigation. The open* modal launchers accept the
 * boundary's opaque AuthAppearance and hand it to Clerk unchanged.
 */
export function useAuthActions(): AuthActions {
  const clerk = useClerk()
  return {
    signOut: () => clerk.signOut(),
    openSignIn: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openSignIn({ appearance: opts?.appearance } as Parameters<typeof clerk.openSignIn>[0]),
    openSignUp: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openSignUp({ appearance: opts?.appearance } as Parameters<typeof clerk.openSignUp>[0]),
    openUserProfile: (opts?: { appearance?: AuthAppearance }) =>
      clerk.openUserProfile({ appearance: opts?.appearance } as Parameters<typeof clerk.openUserProfile>[0]),
  }
}

// ── OTP flow adapter ─────────────────────────────────────────────────────────
//
// Encapsulates the Clerk Core 3 OTP sign-in/sign-up mechanics behind two
// provider-agnostic calls. The stage machine (services/auth/useAuthFlow.ts)
// owns UI state; this owns every Clerk API call, both error channels (the
// documented { error } return AND the undocumented HTTP-4xx throw — see
// providers/clerk/errors.ts), and the step-by-step auth_events telemetry.
// All event_type / step / auth_surface strings are byte-identical to the
// pre-refactor useAuthFlow so the auth_events log stream is unchanged.

export interface AuthFlowContact {
  type: 'email' | 'phone'
  value: string
}

export type SendCodeResult =
  | { ok: true; flow: 'signin' | 'signup' }
  | { ok: false; message: string }

export type VerifyCodeResult =
  | { ok: true }
  /** terminal: true → unrecoverable (stage 'error'); false → retryable (stage 'otp_input'). */
  | { ok: false; terminal: boolean; message: string }

const VERIFY_INCOMPLETE_MSG = 'Verification did not complete. Please try again.'

export function useAuthFlowAdapter(): {
  isReady: boolean
  sendCode: (contact: AuthFlowContact) => Promise<SendCodeResult>
  verifyCode: (contact: AuthFlowContact, code: string) => Promise<VerifyCodeResult>
} {
  const { signIn } = useSignIn()
  const { signUp } = useSignUp()

  // Which Clerk flow the current attempt is on — set by sendCode, read by
  // verifyCode. Provider detail; deliberately not surfaced as UI state.
  const flowRef = useRef<'signin' | 'signup' | null>(null)

  // Known limitation (see CLAUDE.md "Known limitations"): the no-op navigate
  // skips session-task handling and Safari ITP decorateUrl. Fine while MFA and
  // session tasks are disabled in the provider dashboard; the warn below makes
  // it loud if a task ever appears.
  const noopNavigate = ({ session }: { session?: { currentTask?: unknown } | null }) => {
    if (session?.currentTask) {
      console.warn(
        '[auth/clerk] finalize: pending session task ignored — session tasks are not handled by this flow',
        session.currentTask,
      )
    }
  }

  const sendCode = useCallback(async (contact: AuthFlowContact): Promise<SendCodeResult> => {
    if (!signIn || !signUp) return { ok: false, message: 'Something went wrong. Please try again.' }
    const { type, value } = contact

    // Try sign-in first. Any failure — returned error or thrown — routes to
    // sign-up. The only terminal state is when both paths fail.
    let signInSucceeded = false
    try {
      const r =
        type === 'email'
          ? await signIn.emailCode.sendCode({ emailAddress: value })
          : await signIn.phoneCode.sendCode({ phoneNumber: value })
      if (!r.error) {
        signInSucceeded = true
      } else {
        logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
          failure_reason: r.error.code,
          metadata: { auth_surface: 'custom_otp', step: 'sendCode_returned', contactType: type, code: r.error.code } })
      }
    } catch (e: unknown) {
      const code = extractClerkErrorCode(e)
      const httpStatus = (e as Record<string, unknown>).status
      logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
        failure_reason: `sendCode_threw_${httpStatus ?? 'unknown'}`,
        metadata: { auth_surface: 'custom_otp', step: 'sendCode_threw', contactType: type, code, httpStatus } })
    }

    if (signInSucceeded) {
      logAuthStep({ event_type: 'otp_sent', outcome: 'success',
        metadata: { auth_surface: 'custom_otp', step: 'otp_sent', contactType: type, flowType: 'signin' } })
      flowRef.current = 'signin'
      return { ok: true, flow: 'signin' }
    }

    // sendCode failed for any reason — attempt sign-up.
    const { error: signUpErr } =
      type === 'email'
        ? await signUp.create({ emailAddress: value })
        : await signUp.create({ phoneNumber: value })
    if (signUpErr) {
      logAuthStep({ event_type: 'sign_up', outcome: 'failure',
        failure_reason: extractErrorMessage(signUpErr),
        metadata: { auth_surface: 'custom_otp', step: 'signUp_create', contactType: type } })
      return { ok: false, message: extractErrorMessage(signUpErr) }
    }
    const { error: sendErr } =
      type === 'email'
        ? await signUp.verifications.sendEmailCode()
        : await signUp.verifications.sendPhoneCode()
    if (sendErr) {
      logAuthStep({ event_type: 'otp_sent', outcome: 'failure',
        failure_reason: extractErrorMessage(sendErr),
        metadata: { auth_surface: 'custom_otp', step: type === 'email' ? 'signUp_sendEmailCode' : 'signUp_sendPhoneCode', contactType: type } })
      return { ok: false, message: extractErrorMessage(sendErr) }
    }
    logAuthStep({ event_type: 'otp_sent', outcome: 'success',
      metadata: { auth_surface: 'custom_otp', step: 'otp_sent', contactType: type, flowType: 'signup' } })
    flowRef.current = 'signup'
    return { ok: true, flow: 'signup' }
  }, [signIn, signUp])

  const verifyCode = useCallback(async (contact: AuthFlowContact, code: string): Promise<VerifyCodeResult> => {
    if (!signIn || !signUp) return { ok: false, terminal: false, message: 'Something went wrong. Please try again.' }
    const { type } = contact
    const verifyStep = type === 'email' ? 'verifyEmailCode' : 'verifyPhoneCode'

    try {
      if (flowRef.current === 'signup') {
        const { error: verifyErr } =
          type === 'email'
            ? await signUp.verifications.verifyEmailCode({ code })
            : await signUp.verifications.verifyPhoneCode({ code })
        if (verifyErr) {
          logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
            failure_reason: extractErrorMessage(verifyErr),
            metadata: { auth_surface: 'custom_otp', step: verifyStep, contactType: type, flowType: 'signup' } })
          return { ok: false, terminal: false, message: extractErrorMessage(verifyErr) }
        }
        if (signUp.status === 'missing_requirements') {
          console.log('[useAuthFlow] missing_requirements — missingFields:', signUp.missingFields)
          logAuthStep({ event_type: 'sign_up', outcome: 'success',
            metadata: { auth_surface: 'custom_otp', step: 'missing_requirements', contactType: type, flowType: 'signup', missingFields: signUp.missingFields } })
          const { error: updateErr } = await signUp.update({})
          if (updateErr) {
            logAuthStep({ event_type: 'sign_up', outcome: 'failure',
              failure_reason: extractErrorMessage(updateErr),
              metadata: { auth_surface: 'custom_otp', step: 'signUp_update', contactType: type, flowType: 'signup' } })
            return { ok: false, terminal: true, message: extractErrorMessage(updateErr) }
          }
          logAuthStep({ event_type: 'sign_up', outcome: 'success',
            metadata: { auth_surface: 'custom_otp', step: 'signUp_update', contactType: type, flowType: 'signup' } })
        }
        if (signUp.status === 'complete') {
          try {
            await signUp.finalize({ navigate: noopNavigate })
            logAuthStep({ event_type: 'sign_up', outcome: 'success',
              metadata: { auth_surface: 'custom_otp', step: 'finalize', contactType: type, flowType: 'signup' } })
            return { ok: true }
          } catch (finalizeErr: unknown) {
            logAuthStep({ event_type: 'sign_up', outcome: 'failure',
              failure_reason: extractErrorMessage(finalizeErr),
              metadata: { auth_surface: 'custom_otp', step: 'finalize_threw', contactType: type, flowType: 'signup' } })
            return { ok: false, terminal: true, message: extractErrorMessage(finalizeErr) }
          }
        }
        logAuthStep({ event_type: 'sign_up', outcome: 'failure',
          failure_reason: `signUp.status=${signUp.status}`,
          metadata: { auth_surface: 'custom_otp', step: 'status_not_complete', contactType: type, flowType: 'signup', status: signUp.status } })
        return { ok: false, terminal: false, message: VERIFY_INCOMPLETE_MSG }
      }

      // signin flow
      const { error: verifyErr } =
        type === 'email'
          ? await signIn.emailCode.verifyCode({ code })
          : await signIn.phoneCode.verifyCode({ code })
      if (verifyErr) {
        logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
          failure_reason: extractErrorMessage(verifyErr),
          metadata: { auth_surface: 'custom_otp', step: verifyStep, contactType: type, flowType: 'signin' } })
        return { ok: false, terminal: false, message: extractErrorMessage(verifyErr) }
      }
      if (signIn.status === 'complete') {
        try {
          await signIn.finalize({ navigate: noopNavigate })
          logAuthStep({ event_type: 'sign_in', outcome: 'success',
            metadata: { auth_surface: 'custom_otp', step: 'finalize', contactType: type, flowType: 'signin' } })
          return { ok: true }
        } catch (finalizeErr: unknown) {
          logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
            failure_reason: extractErrorMessage(finalizeErr),
            metadata: { auth_surface: 'custom_otp', step: 'finalize_threw', contactType: type, flowType: 'signin' } })
          return { ok: false, terminal: true, message: extractErrorMessage(finalizeErr) }
        }
      }
      logAuthStep({ event_type: 'sign_in_failed', outcome: 'failure',
        failure_reason: `signIn.status=${signIn.status}`,
        metadata: { auth_surface: 'custom_otp', step: 'status_not_complete', contactType: type, flowType: 'signin', status: signIn.status } })
      return { ok: false, terminal: false, message: VERIFY_INCOMPLETE_MSG }
    } catch (err: unknown) {
      logAuthStep({ event_type: 'otp_verified', outcome: 'failure',
        failure_reason: extractErrorMessage(err),
        metadata: { auth_surface: 'custom_otp', step: type === 'email' ? 'verifyOtp_email_catch' : 'verifyOtp_phone_catch', contactType: type } })
      return { ok: false, terminal: false, message: extractErrorMessage(err) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signIn, signUp])

  return useMemo(
    () => ({ isReady: Boolean(signIn && signUp), sendCode, verifyCode }),
    [signIn, signUp, sendCode, verifyCode],
  )
}
