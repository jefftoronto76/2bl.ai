// Tests for useAuthFlowAdapter — the Clerk OTP flow encapsulation.
// Mocks @clerk/nextjs resources to drive: signin-first detection across BOTH
// error channels (returned { error } and the undocumented HTTP-4xx throw),
// the signup fallback, terminal-vs-retryable verify mapping, and log parity
// of the step strings.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const logAuthStep = vi.fn()
vi.mock('../../log-auth-step', () => ({ logAuthStep: (p: unknown) => logAuthStep(p) }))

type AnyFn = ReturnType<typeof vi.fn>

function makeClerkMocks() {
  const signIn = {
    status: 'complete',
    emailCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
    phoneCode: { sendCode: vi.fn(), verifyCode: vi.fn() },
    finalize: vi.fn(async () => {}),
  }
  const signUp = {
    status: 'complete',
    missingFields: [] as string[],
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

describe('useAuthFlowAdapter.sendCode — signin-first detection', () => {
  it('signin path when sendCode succeeds', async () => {
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'a@b.com' })
    expect(r).toEqual({ ok: true, flow: 'signin' })
    expect(mocks.current.signUp.create).not.toHaveBeenCalled()
    expect(steps()).toEqual(['otp_sent'])
  })

  it('returned-error channel falls through to signup', async () => {
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: { code: 'form_identifier_not_found' } })
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'new@b.com' })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.create).toHaveBeenCalledWith({ emailAddress: 'new@b.com' })
    expect(steps()).toEqual(['sendCode_returned', 'otp_sent'])
  })

  it('thrown-error channel (undocumented HTTP 4xx) also falls through to signup', async () => {
    const thrown = Object.assign(new Error('422'), { status: 422, errors: [{ code: 'form_identifier_not_found' }] })
    ;(mocks.current.signIn.phoneCode.sendCode as AnyFn).mockRejectedValue(thrown)
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'phone', value: '+15551234567' })
    expect(r).toEqual({ ok: true, flow: 'signup' })
    expect(mocks.current.signUp.create).toHaveBeenCalledWith({ phoneNumber: '+15551234567' })
    expect(steps()).toEqual(['sendCode_threw', 'otp_sent'])
    const threwLog = logAuthStep.mock.calls[0][0] as { failure_reason: string; metadata: { code: string; httpStatus: number } }
    expect(threwLog.failure_reason).toBe('sendCode_threw_422')
    expect(threwLog.metadata.code).toBe('form_identifier_not_found')
  })

  it('terminal failure when both signin sendCode and signup create fail', async () => {
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: { code: 'rate_limited' } })
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: { message: 'Too many attempts' } })
    const { result } = renderHook(() => useAuthFlowAdapter())
    const r = await result.current.sendCode({ type: 'email', value: 'a@b.com' })
    expect(r).toEqual({ ok: false, message: 'Too many attempts' })
    expect(steps()).toEqual(['sendCode_returned', 'signUp_create'])
  })
})

describe('useAuthFlowAdapter.verifyCode — terminal vs retryable', () => {
  async function startSignupFlow(result: { current: ReturnType<typeof useAuthFlowAdapter> }) {
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: { code: 'form_identifier_not_found' } })
    ;(mocks.current.signUp.create as AnyFn).mockResolvedValue({ error: null })
    await result.current.sendCode({ type: 'email', value: 'a@b.com' })
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
    ;(mocks.current.signIn.emailCode.sendCode as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    await result.current.sendCode({ type: 'email', value: 'a@b.com' })
    logAuthStep.mockClear()
    ;(mocks.current.signIn.emailCode.verifyCode as AnyFn).mockResolvedValue({ error: null })
    mocks.current.signIn.status = 'needs_second_factor'
    const r = await result.current.verifyCode({ type: 'email', value: 'a@b.com' }, '123456')
    expect(r).toEqual({ ok: false, terminal: false, message: 'Verification did not complete. Please try again.' })
    expect(steps()).toEqual(['status_not_complete'])
  })

  it('signin verify: success finalizes the session', async () => {
    ;(mocks.current.signIn.phoneCode.sendCode as AnyFn).mockResolvedValue({ error: null })
    const { result } = renderHook(() => useAuthFlowAdapter())
    await result.current.sendCode({ type: 'phone', value: '+15551234567' })
    logAuthStep.mockClear()
    ;(mocks.current.signIn.phoneCode.verifyCode as AnyFn).mockResolvedValue({ error: null })
    mocks.current.signIn.status = 'complete'
    const r = await result.current.verifyCode({ type: 'phone', value: '+15551234567' }, '123456')
    expect(r).toEqual({ ok: true })
    expect(mocks.current.signIn.finalize).toHaveBeenCalled()
    expect(steps()).toEqual(['finalize'])
  })
})
