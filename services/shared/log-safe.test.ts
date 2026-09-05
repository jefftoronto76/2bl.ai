// services/shared/log-safe.test.ts

import { describe, it, expect } from 'vitest'
import { logSafeIdentity, identityHash } from './log-safe'

describe('logSafeIdentity', () => {
  it('marks null as absent', () => {
    expect(logSafeIdentity(null)).toEqual({ present: false, length: 0 })
  })

  it('marks undefined as absent', () => {
    expect(logSafeIdentity(undefined)).toEqual({ present: false, length: 0 })
  })

  it('marks an empty string as absent', () => {
    expect(logSafeIdentity('')).toEqual({ present: false, length: 0 })
  })

  it('marks a whitespace-only string as absent', () => {
    expect(logSafeIdentity('   ')).toEqual({ present: false, length: 0 })
  })

  it('reports present:true with the trimmed length and an 8-hex-char hash for a real value', () => {
    const result = logSafeIdentity('  Jane  ')
    expect(result.present).toBe(true)
    expect(result.length).toBe(4) // trimmed length, not raw
    expect(result.hash).toMatch(/^[0-9a-f]{8}$/)
  })

  it('never includes the raw value anywhere in the result', () => {
    const result = logSafeIdentity('jane@example.com')
    expect(JSON.stringify(result)).not.toContain('jane@example.com')
    expect(JSON.stringify(result)).not.toContain('jane')
  })

  it('produces the same hash for the same value regardless of case or surrounding whitespace', () => {
    const a = logSafeIdentity('Jane')
    const b = logSafeIdentity('  jane  ')
    expect(a.hash).toBe(b.hash)
  })

  it('produces different hashes for different values', () => {
    const a = logSafeIdentity('Jane')
    const b = logSafeIdentity('John')
    expect(a.hash).not.toBe(b.hash)
  })
})

describe('identityHash', () => {
  it('returns null for null, undefined, empty, and whitespace-only values', () => {
    expect(identityHash(null)).toBeNull()
    expect(identityHash(undefined)).toBeNull()
    expect(identityHash('')).toBeNull()
    expect(identityHash('   ')).toBeNull()
  })

  it('returns an 8-hex-char hash for a real value, never the raw value', () => {
    const result = identityHash('jane@example.com')
    expect(result).toMatch(/^[0-9a-f]{8}$/)
    expect(result).not.toContain('jane')
  })

  it('matches logSafeIdentity\'s hash for the same value (same algorithm)', () => {
    expect(identityHash('jane@example.com')).toBe(logSafeIdentity('jane@example.com').hash)
  })

  it('produces the same hash regardless of case or surrounding whitespace', () => {
    expect(identityHash('Jane@Example.com')).toBe(identityHash('  jane@example.com  '))
  })

  it('produces different hashes for different values', () => {
    expect(identityHash('a@example.com')).not.toBe(identityHash('b@example.com'))
  })
})
