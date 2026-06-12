// Tests for useAuthFlowAdapter — the Clerk OTP flow encapsulation.
// Mocks @clerk/nextjs resources to drive the error-code-driven
// new-vs-existing detection (signUp.create → form_identifier_exists →
// direct signIn sendCode with the identifier) across BOTH error channels
// (returned { error } and the undocumented HTTP-4xx throw),
// terminal-vs-retryable verify mapping, and log parity of step strings.
// NOTE (production, 2026-06-11): signUp.isTransferable did NOT flip on the
// create-error path despite Clerk's docs — the error code is primary and
// the tests model that (isTransferable stays false in the existing-user
// cases; one belt test keeps the flag honored if Clerk ever sets it).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const logAuthStep = vi.fn()
vi.mock('../../log-auth-step', () => ({ logAuthStep: (p: unknown) => logAuthStep(p) }))

type AnyFn = ReturnType<typeof vi.fn>

function makeClerkMocks() {
  const signIn = {
    status: 'complete',
    create: vi.fn(async () => ({ error: null })),
    emailCode: { sendCode: vi.fn(async () => ({ error: null })), verifyCode: vi.fn() },
    phoneCode: { sendCode: vi.fn(async () => ({ error: null })), verifyCode: vi.fn() },
    finalize: vi.fn(async () => {}),
  }
  const signUp = {
    status: 'complete',
    missingFields: [] as string[],
    isTransferable: false,
    create: vi.fn(),
    update: vi.fn(async () => ({ error: null })),
    verifications: {
      sendEmailCode: vi.fn(async () => ({ error: null })),
      sendPhoneCode: vi.fn(async () => ({ error: null })),
      verifyEmailCode: vi.fn(async () => ({ error: null })),
      verifyPhoneCode: vi.fn(async () => ({ error: null })),
    },
    finalize: vi.fn(async () => {}),
  }
  return { signIn, signUp }
}

const mocks = vi.hoisted(() => ({ current: null as unknown as ReturnType<typeof makeClerkMocks> }))

vi.mock('@clerk/nextjs', () => ({
  useSignIn: () => ({ signIn: mocks.current.signIn }),
  useSignUp: () => ({ signUp: mocks.current.signUp }),
  useUser: () => ({ isLoaded: true, isSignedIn: false, user: null }),
  useClerk: () => ({}),
}))

import { useAuthFlowAdapter } from './client'

function steps(): string[] {
  return logAuthStep.mock.calls.map((c) => (c[0] as { metadata: { step: string } }).metadata.step)
}

beforeEach(() => {
  mocks.current = makeClerkMocks()
  logAuthStep.mockClear()
})

describe('useAuthFlowAdapter.sendCode — error-code-driven detection (signUp-first)', () => {
  it('new user: signUp.create succeeds → signup flow', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'new@b.com' })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.create).toHaveBeenCalledWith({ emailAddress: 'new@b.com' })
    expect(mocks.current.signIn.emailCode.sendCode).not.toHaveBeenCalled()
    expect(steps()).toEqual(['otp_sent'])
  })

  it('existing email: form_identifier_exists (isTransferable false, as in production) → direct sign-in', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({
      error: { code: 'form_identifier_exists', message: 'That email address is taken. Please try another.' },
    })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'existing@b.com' })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    // Direct identifier sign-in — the transfer mechanism is deliberately unused.
    expect(mocks.current.signIn.create).not.toHaveBeenCalled()
    expect(mocks.current.signIn.emailCode.sendCode).toHaveBeenCalledWith({ emailAddress: 'existing@b.com' })
    expect(steps()).toEqual(['signUp_create_transferable', 'otp_sent'])
  })

  it('existing phone: form_identifier_exists (isTransferable false) → direct sign-in', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({
      error: { code: 'form_identifier_exists', message: 'That phone number is taken. Please try another.' },
    })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'phone', value: '+15551234567' })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    expect(mocks.current.signIn.phoneCode.sendCode).toHaveBeenCalledWith({ phoneNumber: '+15551234567' })
    expect(steps()).toEqual(['signUp_create_transferable', 'otp_sent'])
  })

  it('existing user via the thrown create channel (undocumented HTTP 4xx) still routes to sign-in', async () => {
    const thrown = Object.assign(new Error('422'), { status: 422, errors: [{ code: 'form_identifier_exists' }] })
    ;(mocks.current.signUp.create as AnyFn).mockRejectedValue(thrown)
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'phone', value: '+15551234567' })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    expect(mocks.current.signIn.phoneCode.sendCode).toHaveBeenCalledWith({ phoneNumber: '+15551234567' })
    expect(steps()).toEqual(['signUp_create_threw', 'signUp_create_transferable', 'otp_sent'])
    const threwLog = logAuthStep.mock.calls[0][0] as { failure_reason: string; metadata: { code: string } }
    expect(threwLog.failure_reason).toBe('signUp_create_threw_422')
    expect(threwLog.metadata.code).toBe('form_identifier_exists')
  })

  it('belt: isTransferable true with a different error code still routes to sign-in', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockImplementation(async () => {
      mocks.current.signUp.isTransferable = true
      return { error: { code: 'some_other_code', message: 'whatever' } }
    })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'existing@b.com' })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    expect(steps()).toEqual(['signUp_create_transferable', 'otp_sent'])
  })

  it('non-existing create failure (rate limit / transient) is a surfaced error, NOT a misrouted signup', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: { code: 'rate_limited', message: 'Too many attempts' } })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'a@b.com' })
    expect(r).toEqual({ ok: false, message: 'Too many attempts' })
    expect(mocks.current.signIn.emailCode.sendCode).not.toHaveBeenCalled()
    expect(mocks.current.signUp.verifications.sendEmailCode).not.toHaveBeenCalled()
    expect(steps()).toEqual(['signUp_create'])
  })

  it('existing user whose sign-in sendCode fails gets the error surfaced (returned channel)', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({
      error: { code: 'form_identifier_exists', message: 'That email address is taken. Please try another.' },
    })
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: { code: 'boom', message: 'Send failed' } })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'existing@b.com' })
    expect(r).toEqual({ ok: false, message: 'Send failed' })
    expect(steps()).toEqual(['signUp_create_transferable', 'signIn_sendCode_existing'])
  })

  it('existing user whose sign-in sendCode throws gets the error surfaced (thrown channel)', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({
      error: { code: 'form_identifier_exists', message: 'That phone number is taken. Please try another.' },
    })
    const thrown = Object.assign(new Error('Send blew up'), { status: 422, errors: [{ code: 'kaboom' }] })
    ;(mocks.current.signIn.phoneCode.sendCode as AnyFn).mockRejectedValue(thrown)
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'phone', value: '+15551234567' })
    expect(r).toEqual({ ok: false, message: 'Send blew up' })
    expect(steps()).toEqual(['signUp_create_transferable', 'signIn_sendCode_threw'])
  })
})

describe('useAuthFlowAdapter.sendCode — name attachment (sign-up path only)', () => {
  it('sign-up with a name calls signUp.update({ firstName, lastName }) before the OTP send', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({
      type: 'phone', value: '+15551234567', firstName: 'Jane', lastName: 'Doe',
    })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.update).toHaveBeenCalledWith({ firstName: 'Jane', lastName: 'Doe' })
    // create stays identifier-only — detection is untouched.
    expect(mocks.current.signUp.create).toHaveBeenCalledWith({ phoneNumber: '+15551234567' })
    const updateOrder = (mocks.current.signUp.update as AnyFn).mock.invocationCallOrder[0]
    const sendOrder = (mocks.current.signUp.verifications.sendPhoneCode as AnyFn).mock.invocationCallOrder[0]
    expect(updateOrder).toBeLessThan(sendOrder)
  })

  it('firstName-only name omits lastName from the update payload', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    await result.current.sendCode({ type: 'email', value: 'new@b.com', firstName: 'Jane' })
    expect(mocks.current.signUp.update).toHaveBeenCalledWith({ firstName: 'Jane' })
  })

  it('a name-update failure is logged but never blocks the sign-up (returned channel)', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    ;(mocks.current.signUp.update as AnyFn).mockResolvedValue({
      error: { code: 'form_param_unknown', message: 'first_name is not a valid parameter' },
    })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'phone', value: '+15551234567', firstName: 'Jane' })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.verifications.sendPhoneCode).toHaveBeenCalled()
    expect(steps()).toEqual(['signUp_update_name', 'otp_sent'])
  })

  it('a thrown name-update failure is logged but never blocks the sign-up (thrown channel)', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    ;(mocks.current.signUp.update as AnyFn).mockRejectedValue(
      Object.assign(new Error('422'), { status: 422, errors: [{ code: 'form_param_unknown' }] }),
    )
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'new@b.com', firstName: 'Jane' })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.verifications.sendEmailCode).toHaveBeenCalled()
    expect(steps()).toEqual(['signUp_update_name_threw', 'otp_sent'])
  })

  it('sign-in path NEVER attaches the name — existing profiles are not overwritten', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({
      error: { code: 'form_identifier_exists', message: 'That phone number is taken. Please try another.' },
    })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({
      type: 'phone', value: '+15551234567', firstName: 'Jane', lastName: 'Doe',
    })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    expect(mocks.current.signUp.update).not.toHaveBeenCalled()
  })

  it('no name supplied → update is not called at all', async () => {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    await result.current.sendCode({ type: 'email', value: 'new@b.com' })
    expect(mocks.current.signUp.update).not.toHaveBeenCalled()
  })
})

describe('useAuthFlowAdapter.verifyCode — terminal vs retryable', () => {
  async function startSignupFlow(result: { current: ReturnType<typeof useAuthFlowAdapter> }) {
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    await result.current.sendCode({ type: 'email', value: 'a@b.com' })
    logAuthStep.mockClear()
  }

  async function startSigninFlow(result: { current: ReturnType<typeof useAuthFlowAdapter> }, type: 'email' | 'phone', value: string) {
    // Production-realistic: error code present, isTransferable stays false.
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: { code: 'form_identifier_exists' } })
    await result.current.sendCode({ type, value })
    logAuthStep.mockClear()
  }

  it('signup verify: wrong code is retryable', async () => {
    const { result } = renderHook(() => useAuthFlowAdapter())
    await startSignupFlow(result)
    ;(mocks.current.signUp.verifications.verifyEmailCode as AnyFn).mockResolvedValue({ error: { message: 'Incorrect code' } })
    const r = await result.current.verifyCode({ type: 'email', value: 'a@b.com' }, '000000')
    expect(r).toEqual({ ok: false, terminal: false, message: 'Incorrect code' })
    expect(steps()).toEqual(['verifyEmailCode'])
  })

  it('signup verify: missing_requirements → update({}) → finalize success', async () => {
    const { result } = renderHook(() => useAuthFlowAdapter())
    await startSignupFlow(result)
    mocks.current.signUp.status = 'missing_requirements'
    ;(mocks.current.signUp.update as AnyFn).mockImplementation(async () => {
      mocks.current.signUp.status = 'complete'
      return { error: null }
    })
    const r = await result.current.verifyCode({ type: 'email', value: 'a@b.com' }, '123456')
    expect(r).toEqual({ ok: true })
    expect(mocks.current.signUp.finalize).toHaveBeenCalled()
    expect(steps()).toEqual(['missing_requirements', 'signUp_update', 'finalize'])
  })

  it('signup verify: finalize throw is terminal', async () => {
    const { result } = renderHook(() => useAuthFlowAdapter())
    await startSignupFlow(result)
    mocks.current.signUp.status = 'complete'
    ;(mocks.current.signUp.finalize as AnyFn).mockRejectedValue(new Error('finalize boom'))
    const r = await result.current.verifyCode({ type: 'email', value: 'a@b.com' }, '123456')
    expect(r).toEqual({ ok: false, terminal: true, message: 'finalize boom' })
    expect(steps()).toEqual(['finalize_threw'])
  })

  it('signin verify: status not complete is retryable with the canonical message', async () => {
    const { result } = renderHook(() => useAuthFlowAdapter())
    await startSigninFlow(result, 'email', 'a@b.com')
    ;(mocks.current.signIn.emailCode.verifyCode as AnyFn).mockResolvedValue({ error: null })
    mocks.current.signIn.status = 'needs_second_factor'
    const r = await result.current.verifyCode({ type: 'email', value: 'a@b.com' }, '123456')
    expect(r).toEqual({ ok: false, terminal: false, message: 'Verification did not complete. Please try again.' })
    expect(steps()).toEqual(['status_not_complete'])
  })

  it('signin verify: success finalizes the session', async () => {
    const { result } = renderHook(() => useAuthFlowAdapter())
    await startSigninFlow(result, 'phone', '+15551234567')
    ;(mocks.current.signIn.phoneCode.verifyCode as AnyFn).mockResolvedValue({ error: null })
    mocks.current.signIn.status = 'complete'
    const r = await result.current.verifyCode({ type: 'phone', value: '+15551234567' }, '123456')
    expect(r).toEqual({ ok: true })
    expect(mocks.current.signIn.finalize).toHaveBeenCalled()
    expect(steps()).toEqual(['finalize'])
  })
})
