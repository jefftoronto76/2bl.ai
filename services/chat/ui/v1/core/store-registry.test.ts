import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  getSingletonStore,
  hasSingletonStore,
  __resetSingletonStore,
  __clearSingletonRegistry,
} from './store-registry'

afterEach(() => {
  __clearSingletonRegistry()
  vi.unstubAllGlobals()
})

describe('registry identity', () => {
  it('returns the same store instance for the same key', () => {
    const a = getSingletonStore('sage')
    const b = getSingletonStore('sage')
    expect(a).toBe(b)
  })

  it('returns different stores for different keys', () => {
    expect(getSingletonStore('sage')).not.toBe(getSingletonStore('heirloom'))
  })

  it('shares state across resolutions of the same key (sharing invariant)', () => {
    const a = getSingletonStore('sage')
    a.setState({ sessionId: 'sess-1' })
    const b = getSingletonStore('sage')
    expect(b.getState().sessionId).toBe('sess-1')
  })

  it('isolates state across different keys (isolation invariant)', () => {
    getSingletonStore('sage').setState({ sessionId: 'sage-session' })
    expect(getSingletonStore('heirloom').getState().sessionId).toBeNull()
  })
})

describe('registry lifecycle helpers', () => {
  it('reports presence via hasSingletonStore', () => {
    expect(hasSingletonStore('sage')).toBe(false)
    getSingletonStore('sage')
    expect(hasSingletonStore('sage')).toBe(true)
  })

  it('drops a single key, yielding a fresh store on next access', () => {
    const first = getSingletonStore('sage')
    first.setState({ sessionId: 'old' })
    __resetSingletonStore('sage')
    expect(hasSingletonStore('sage')).toBe(false)
    const second = getSingletonStore('sage')
    expect(second).not.toBe(first)
    expect(second.getState().sessionId).toBeNull()
  })

  it('clears the whole registry', () => {
    getSingletonStore('a')
    getSingletonStore('b')
    __clearSingletonRegistry()
    expect(hasSingletonStore('a')).toBe(false)
    expect(hasSingletonStore('b')).toBe(false)
  })
})

describe('SSR safety', () => {
  it('throws when called with no window (server), never touching module state', () => {
    vi.stubGlobal('window', undefined)
    expect(typeof window).toBe('undefined')
    expect(() => getSingletonStore('sage')).toThrow(/client-only/)
    // and nothing was registered as a side effect
    vi.unstubAllGlobals()
    expect(hasSingletonStore('sage')).toBe(false)
  })
})
