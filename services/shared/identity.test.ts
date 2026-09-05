// services/shared/identity.test.ts
//
// The identity-write invariant and the display-name precedence rule, tested at
// the one place they now live. See services/shared/identity.ts for why these
// are centralised rather than guarded per call site.

import { describe, it, expect } from 'vitest'
import {
  identityValue,
  identityEmail,
  setIdentityField,
  setIdentityEmail,
  resolveMemberName,
} from './identity'

describe('identityValue — "no value" never means "clear the column"', () => {
  it('returns undefined for undefined', () => {
    expect(identityValue(undefined)).toBeUndefined()
  })

  // The D1 defect in one line: an explicit null must be indistinguishable from
  // "absent", never an instruction to write NULL.
  it('returns undefined for null', () => {
    expect(identityValue(null)).toBeUndefined()
  })

  it('returns undefined for an empty string', () => {
    expect(identityValue('')).toBeUndefined()
  })

  it('returns undefined for whitespace only', () => {
    expect(identityValue('   ')).toBeUndefined()
  })

  it('returns the trimmed value for a real name', () => {
    expect(identityValue('  Sarah Chen  ')).toBe('Sarah Chen')
  })

  it('preserves internal whitespace and casing', () => {
    expect(identityValue('Sarah  Chen')).toBe('Sarah  Chen')
  })
})

describe('identityEmail', () => {
  it('lowercases a real email', () => {
    expect(identityEmail('  Sarah@Example.COM ')).toBe('sarah@example.com')
  })

  it.each([undefined, null, '', '   '])('returns undefined for %p', (raw) => {
    expect(identityEmail(raw as string | null | undefined)).toBeUndefined()
  })
})

describe('setIdentityField — payload keys are absent, not null', () => {
  // Absence is what makes a Postgres upsert leave the existing column alone.
  // A key present with a null value overwrites it — that is the whole defect.
  it.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace', '  '],
  ])('omits the key entirely for %s', (_label, raw) => {
    const payload: Record<string, unknown> = { clerk_id: 'user_1' }
    setIdentityField(payload, 'name', raw as string | null | undefined)
    expect(payload).not.toHaveProperty('name')
    expect(Object.keys(payload)).toEqual(['clerk_id'])
  })

  it('writes a trimmed value when one is supplied', () => {
    const payload: Record<string, unknown> = {}
    setIdentityField(payload, 'name', ' Sarah ')
    expect(payload).toEqual({ name: 'Sarah' })
  })

  it('never leaves a null on the payload for any input', () => {
    for (const raw of [undefined, null, '', '   ', 'Sarah']) {
      const payload: Record<string, unknown> = {}
      setIdentityField(payload, 'name', raw as string | null | undefined)
      expect(Object.values(payload)).not.toContain(null)
    }
  })

  it('setIdentityEmail normalises case', () => {
    const payload: Record<string, unknown> = {}
    setIdentityEmail(payload, 'email', 'Sarah@Example.com')
    expect(payload).toEqual({ email: 'sarah@example.com' })
  })
})

describe('resolveMemberName — name wins, invited_name is only a fallback', () => {
  it('prefers name over invited_name when both are present', () => {
    expect(resolveMemberName({ name: 'Sarah Chen', invited_name: 'Sarah' })).toBe('Sarah Chen')
  })

  // The D2 case: 11 live members had exactly this shape and were invisible to
  // the AI because member-context.ts read invited_name alone.
  it('returns name when invited_name is null', () => {
    expect(resolveMemberName({ name: 'Sarah Chen', invited_name: null })).toBe('Sarah Chen')
  })

  it('falls back to invited_name when name is null', () => {
    expect(resolveMemberName({ name: null, invited_name: 'Sarah' })).toBe('Sarah')
  })

  it('falls back to invited_name when name is empty or whitespace', () => {
    expect(resolveMemberName({ name: '', invited_name: 'Sarah' })).toBe('Sarah')
    expect(resolveMemberName({ name: '   ', invited_name: 'Sarah' })).toBe('Sarah')
  })

  it('returns null when neither is usable', () => {
    expect(resolveMemberName({ name: null, invited_name: null })).toBeNull()
    expect(resolveMemberName({ name: '', invited_name: '  ' })).toBeNull()
    expect(resolveMemberName({})).toBeNull()
  })

  it('trims whatever it returns', () => {
    expect(resolveMemberName({ name: '  Sarah Chen  ' })).toBe('Sarah Chen')
    expect(resolveMemberName({ invited_name: ' Sarah ' })).toBe('Sarah')
  })
})
