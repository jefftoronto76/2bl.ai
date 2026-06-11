import { describe, it, expect } from 'vitest'
import { mapClerkUser, resolveIsPlatformAdmin, type ClerkUserLike } from './map'

const base: ClerkUserLike = { id: 'user_abc123' }

describe('resolveIsPlatformAdmin', () => {
  it('true only for publicMetadata.role === "platform_admin"', () => {
    expect(resolveIsPlatformAdmin({ ...base, publicMetadata: { role: 'platform_admin' } })).toBe(true)
  })

  it('false for other roles, missing role, and missing metadata', () => {
    expect(resolveIsPlatformAdmin({ ...base, publicMetadata: { role: 'member' } })).toBe(false)
    expect(resolveIsPlatformAdmin({ ...base, publicMetadata: {} })).toBe(false)
    expect(resolveIsPlatformAdmin({ ...base, publicMetadata: null })).toBe(false)
    expect(resolveIsPlatformAdmin(base)).toBe(false)
  })
})

describe('mapClerkUser', () => {
  it('maps the full shape: id, first email/phone, joined name, admin flag', () => {
    expect(
      mapClerkUser({
        id: 'user_abc123',
        publicMetadata: { role: 'platform_admin' },
        emailAddresses: [{ emailAddress: 'jeff@example.com' }, { emailAddress: 'second@example.com' }],
        phoneNumbers: [{ phoneNumber: '+16475551234' }],
        firstName: 'Jeff',
        lastName: 'Lougheed',
      }),
    ).toEqual({
      providerUserId: 'user_abc123',
      email: 'jeff@example.com',
      phone: '+16475551234',
      name: 'Jeff Lougheed',
      isPlatformAdmin: true,
    })
  })

  it('maps sparse users (phone-only sign-up, no name) to undefined fields', () => {
    expect(mapClerkUser({ ...base, phoneNumbers: [{ phoneNumber: '+16475551234' }] })).toEqual({
      providerUserId: 'user_abc123',
      email: undefined,
      phone: '+16475551234',
      name: undefined,
      isPlatformAdmin: false,
    })
  })

  it('joins a partial name without stray whitespace', () => {
    expect(mapClerkUser({ ...base, firstName: 'Jeff', lastName: null }).name).toBe('Jeff')
    expect(mapClerkUser({ ...base, firstName: null, lastName: 'Lougheed' }).name).toBe('Lougheed')
  })
})
