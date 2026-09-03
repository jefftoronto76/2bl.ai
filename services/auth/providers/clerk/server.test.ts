// services/auth/providers/clerk/server.test.ts
//
// Boundary-level test for updateClerkUserFirstName — the name-completion
// interstitial's Clerk-sync write (item 3b correction). First test in this
// file to mock @clerk/nextjs/server directly; mirrors only the three names
// server.ts actually imports (auth, currentUser, clerkClient).

import { describe, it, expect, vi, beforeEach } from 'vitest'

const { updateUserMock, clerkClientMock } = vi.hoisted(() => ({
  updateUserMock: vi.fn(async (_id: string, _params: unknown) => ({})),
  clerkClientMock: vi.fn(async () => ({ users: { updateUser: updateUserMock } })),
}))

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(async () => ({ userId: null })),
  currentUser: vi.fn(async () => null),
  clerkClient: clerkClientMock,
}))

import { updateClerkUserFirstName } from './server'

beforeEach(() => {
  updateUserMock.mockClear()
  clerkClientMock.mockClear()
})

describe('updateClerkUserFirstName', () => {
  it('awaits the clerkClient() factory, then calls users.updateUser(id, { firstName })', async () => {
    await updateClerkUserFirstName('clerk-1', 'Jane')

    expect(clerkClientMock).toHaveBeenCalledTimes(1)
    expect(updateUserMock).toHaveBeenCalledWith('clerk-1', { firstName: 'Jane' })
  })

  it('propagates a rejection from the Clerk API rather than swallowing it — callers own non-fatal handling', async () => {
    updateUserMock.mockRejectedValueOnce(new Error('clerk down'))

    await expect(updateClerkUserFirstName('clerk-1', 'Jane')).rejects.toThrow('clerk down')
  })
})
