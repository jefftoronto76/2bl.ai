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
// event_type / auth_surface strings match the pre-refactor useAuthFlow; the
// verify-path step strings are byte-identical. Detection-path steps changed
// when the signIn-first heuristic was replaced with the documented
// transferable pattern (signUp_create_transferable / signIn_sendCode_existing
// / signIn_sendCode_threw / signUp_create_threw). Detection is error-code
// driven (form_identifier_exists) — see the note inside sendCode.

export interface AuthFlowContact {
  type: 'email' | 'phone'
  value: string
  /** Optional profile name, attached to the attempt on the SIGN-UP path only
   *  (via signUp.update — create stays identifier-only so the new-vs-existing
   *  detection is untouched). Ignored for sign-ins: an existing user's
   *  profile is never overwritten from this flow. */
  firstName?: string
  lastName?: string
  /** Invite token from the URL (?invite=TOKEN). Written to Clerk unsafeMetadata
   *  on the sign-up path so the user.created webhook can look up the invited
   *  members row directly by token instead of relying on email match. Non-fatal
   *  on failure — same pattern as the name update. Sign-in path: ignored. */
  inviteToken?: string | null
  /** Story-invite token from the URL (?join=TOKEN). Written to Clerk
   *  unsafeMetadata on the sign-up path alongside inviteToken (same
   *  signUp.update() call — unsafeMetadata is a full-object replace, not a
   *  merge, so both must be written together) so the user.created webhook
   *  can call acceptStoryInvite directly instead of racing the client's own
   *  accept call. Non-fatal on failure — same pattern as inviteToken.
   *  Sign-in path: ignored. */
  storyInviteToken?: string | null
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

  // Known limitation (see System Docs/Utilities/Auth.md "Auth Known Limitations"): the no-op navigate
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

    // New-vs-existing detection: attempt signUp.create() first; an existing
    // identifier comes back as a form_identifier_exists error and routes to
    // sign-in (see the existing-user block below for why the error code, not
    // signUp.isTransferable, is the primary signal). Unlike the old
    // signIn-first fallback heuristic, a transient failure (rate limit,
    // network) is a surfaced, retryable error instead of being misread as
    // "new user". Both error channels are handled (create can throw on
    // HTTP 4xx — see ./errors.ts).
    let createErr: unknown = null
    try {
      const { error } =
        type === 'email'
          ? await signUp.create({ emailAddress: value })
          : await signUp.create({ phoneNumber: value })
      createErr = error
    } catch (e: unknown) {
      const code = extractClerkErrorCode(e)
      const httpStatus = (e as Record<string, unknown>).status
      logAuthStep({ event_type: 'sign_up', outcome: 'failure',
        failure_reason: `signUp_create_threw_${httpStatus ?? 'unknown'}`,
        metadata: { auth_surface: 'custom_otp', step: 'signUp_create_threw', contactType: type, code, httpStatus } })
      createErr = e
    }

    if (!createErr) {
      // No matching user — genuine sign-up. Attach the visitor's name to the
      // attempt before the OTP send — signUp.update() is the documented Core 3
      // mechanism for adding optional fields (name) to an existing sign-up.
      // Non-fatal by design: a name failure (e.g. name attribute disabled in
      // the dashboard) is logged but never blocks the sign-up itself.
      if (contact.firstName || contact.lastName) {
        try {
          const { error: nameErr } = await signUp.update({
            ...(contact.firstName && { firstName: contact.firstName }),
            ...(contact.lastName && { lastName: contact.lastName }),
          })
          if (nameErr) {
            logAuthStep({ event_type: 'sign_up', outcome: 'failure',
              failure_reason: extractErrorMessage(nameErr),
              metadata: { auth_surface: 'custom_otp', step: 'signUp_update_name', contactType: type, code: extractClerkErrorCode(nameErr) } })
          }
        } catch (e: unknown) {
          logAuthStep({ event_type: 'sign_up', outcome: 'failure',
            failure_reason: extractErrorMessage(e),
            metadata: { auth_surface: 'custom_otp', step: 'signUp_update_name_threw', contactType: type, code: extractClerkErrorCode(e) } })
        }
      }
      // Write the invite token(s) to Clerk unsafeMetadata so the user.created
      // webhook can look up the invited members row / story invite directly
      // instead of relying on email match or racing the client's own accept
      // call. Both keys go in ONE signUp.update() call — unsafeMetadata is a
      // full-object replace, not a merge, so writing them separately would let
      // the second call silently wipe the first. Non-fatal by design — a
      // metadata failure never blocks the sign-up itself.
      if (contact.inviteToken || contact.storyInviteToken) {
        try {
          const unsafeMetadata: Record<string, string> = {}
          if (contact.inviteToken) unsafeMetadata.heirloom_invite_token = contact.inviteToken
          if (contact.storyInviteToken) unsafeMetadata.heirloom_story_invite_token = contact.storyInviteToken

          const { error: tokenErr } = await signUp.update({ unsafeMetadata })
          if (tokenErr) {
            logAuthStep({ event_type: 'sign_up', outcome: 'failure',
              failure_reason: extractErrorMessage(tokenErr),
              metadata: { auth_surface: 'custom_otp', step: 'signUp_update_invite_token', contactType: type, code: extractClerkErrorCode(tokenErr) } })
          } else {
            logAuthStep({ event_type: 'sign_up', outcome: 'success',
              metadata: { auth_surface: 'custom_otp', step: 'signUp_update_invite_token', contactType: type } })
          }
        } catch (e: unknown) {
          logAuthStep({ event_type: 'sign_up', outcome: 'failure',
            failure_reason: extractErrorMessage(e),
            metadata: { auth_surface: 'custom_otp', step: 'signUp_update_invite_token_threw', contactType: type, code: extractClerkErrorCode(e) } })
        }
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
    }

    // Existing-user detection. Clerk's docs say signUp.isTransferable flips
    // when the identifier matches an existing user, but in production
    // (2026-06-11, both email and phone) the flag stayed false on the
    // create-error path — existing users got "That email address / phone
    // number is taken" instead of a sign-in. The dependable signal is the
    // error code form_identifier_exists, from EITHER error channel; the flag
    // is kept as a secondary signal in case Clerk starts setting it.
    const createErrCode = extractClerkErrorCode(createErr)
    if (createErrCode === 'form_identifier_exists' || signUp.isTransferable) {
      logAuthStep({ event_type: 'sign_in', outcome: 'success',
        metadata: { auth_surface: 'custom_otp', step: 'signUp_create_transferable', contactType: type, code: createErrCode, isTransferable: signUp.isTransferable } })
      // Sign in DIRECTLY with the identifier — the pre-refactor production-
      // proven shape. signIn.create({ transfer: true }) is deliberately not
      // used: the documented transfer depends on the same isTransferable
      // mechanics that failed to fire. Both error channels handled, as with
      // every sendCode call (see ./errors.ts).
      try {
        const { error: sendErr } =
          type === 'email'
            ? await signIn.emailCode.sendCode({ emailAddress: value })
            : await signIn.phoneCode.sendCode({ phoneNumber: value })
        if (sendErr) {
          logAuthStep({ event_type: 'otp_sent', outcome: 'failure',
            failure_reason: extractErrorMessage(sendErr),
            metadata: { auth_surface: 'custom_otp', step: 'signIn_sendCode_existing', contactType: type, code: sendErr.code } })
          return { ok: false, message: extractErrorMessage(sendErr) }
        }
      } catch (e: unknown) {
        const code = extractClerkErrorCode(e)
        const httpStatus = (e as Record<string, unknown>).status
        logAuthStep({ event_type: 'otp_sent', outcome: 'failure',
          failure_reason: `signIn_sendCode_threw_${httpStatus ?? 'unknown'}`,
          metadata: { auth_surface: 'custom_otp', step: 'signIn_sendCode_threw', contactType: type, code, httpStatus } })
        return { ok: false, message: extractErrorMessage(e) }
      }
      logAuthStep({ event_type: 'otp_sent', outcome: 'success',
        metadata: { auth_surface: 'custom_otp', step: 'otp_sent', contactType: type, flowType: 'signin' } })
      flowRef.current = 'signin'
      return { ok: true, flow: 'signin' }
    }

    // Create failed and the attempt is not transferable — surfaced as a
    // retryable-by-resubmit error (rate limit, invalid identifier, network).
    logAuthStep({ event_type: 'sign_up', outcome: 'failure',
      failure_reason: extractErrorMessage(createErr),
      metadata: { auth_surface: 'custom_otp', step: 'signUp_create', contactType: type } })
    return { ok: false, message: extractErrorMessage(createErr) }
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
