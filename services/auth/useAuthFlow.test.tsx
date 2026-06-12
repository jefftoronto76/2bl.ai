// Tests for useAuthFlow — the provider-agnostic OTP stage machine.
// Mocks the Clerk flow adapter and the /api/auth/magic-link validation gate
// to drive the stage transitions and the flowType ('signin' | 'signup')
// exposure that consumers (SaveChatCTA) branch success copy on.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const logAuthStep = vi.fn()
vi.mock('./log-auth-step', () => ({ logAuthStep: (p: unknown) => logAuthStep(p) }))

const adapter = vi.hoisted(() => ({
  isReady: true,
  sendCode: vi.fn(),
  verifyCode: vi.fn(),
}))

vi.mock('./providers/clerk/client', () => ({
  useAuthFlowAdapter: () => adapter,
}))

import { useAuthFlow } from './useAuthFlow'

beforeEach(() => {
  adapter.isReady = true
  adapter.sendCode = vi.fn(async () => ({ ok: true as const, flow: 'signup' as const }))
  adapter.verifyCode = vi.fn(async () => ({ ok: true as const }))
  // Validation gate passes by default.
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('useAuthFlow flowType', () => {
  it('is null before any send', () => {
    const { result } = renderHook(() => useAuthFlow())
    expect(result.current.flowType).toBeNull()
    expect(result.current.stage).toBe('idle')
  })

  it("exposes 'signup' when the adapter routed a new user to sign-up", async () => {
    const { result } = renderHook(() => useAuthFlow())
    await act(async () => {
      await result.current.sendPhone('+15550001111')
    })
    expect(result.current.stage).toBe('otp_input')
    expect(result.current.flowType).toBe('signup')
  })

  it("exposes 'signin' when the adapter routed an existing user to sign-in", async () => {
    adapter.sendCode = vi.fn(async () => ({ ok: true as const, flow: 'signin' as const }))
    const { result } = renderHook(() => useAuthFlow())
    await act(async () => {
      await result.current.sendEmail('existing@example.com')
    })
    expect(result.current.stage).toBe('otp_input')
    expect(result.current.flowType).toBe('signin')
  })

  it('survives into the success stage so consumers can branch copy', async () => {
    adapter.sendCode = vi.fn(async () => ({ ok: true as const, flow: 'signin' as const }))
    const { result } = renderHook(() => useAuthFlow())
    await act(async () => {
      await result.current.sendEmail('existing@example.com')
    })
    await act(async () => {
      await result.current.verifyOtp('123456')
    })
    expect(result.current.stage).toBe('success')
    expect(result.current.flowType).toBe('signin')
  })

  it('stays null when the adapter send fails', async () => {
    adapter.sendCode = vi.fn(async () => ({ ok: false as const, message: 'nope' }))
    const { result } = renderHook(() => useAuthFlow())
    await act(async () => {
      await result.current.sendEmail('bad@example.com')
    })
    expect(result.current.stage).toBe('error')
    expect(result.current.flowType).toBeNull()
  })

  it('clears on reset()', async () => {
    const { result } = renderHook(() => useAuthFlow())
    await act(async () => {
      await result.current.sendPhone('+15550001111')
    })
    expect(result.current.flowType).toBe('signup')
    act(() => {
      result.current.reset()
    })
    expect(result.current.flowType).toBeNull()
    expect(result.current.stage).toBe('idle')
  })
})
