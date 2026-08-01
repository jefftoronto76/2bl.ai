import { describe, it, expect, vi, beforeEach } from 'vitest'

let listResult: { data: Array<{ name: string }> | null; error: { message: string } | null } = {
  data: [],
  error: null,
}

const mockList = vi.fn(() => Promise.resolve(listResult))
const mockFrom = vi.fn(() => ({ list: mockList }))

vi.mock('@/services/auth/supabase-admin', () => ({
  getAdminClient: () => ({ storage: { from: mockFrom } }),
}))

import { objectExists } from './storage'

beforeEach(() => {
  listResult = { data: [], error: null }
  mockFrom.mockClear()
  mockList.mockClear()
})

describe('objectExists', () => {
  it('splits the storage path into folder + filename and checks list() for an exact name match', async () => {
    listResult = { data: [{ name: 'dog.jpg' }], error: null }

    const exists = await objectExists('tenant-1/media/member-1/item-1/dog.jpg')

    expect(exists).toBe(true)
    expect(mockList).toHaveBeenCalledWith('tenant-1/media/member-1/item-1', {
      search: 'dog.jpg',
      limit: 1,
    })
  })

  it('returns false when the object is not yet listed (upload still in flight)', async () => {
    listResult = { data: [], error: null }

    expect(await objectExists('tenant-1/media/member-1/item-1/dog.jpg')).toBe(false)
  })

  it('returns false on a Storage API error rather than throwing', async () => {
    listResult = { data: null, error: { message: 'boom' } }

    expect(await objectExists('tenant-1/media/member-1/item-1/dog.jpg')).toBe(false)
  })

  it('does not false-positive on a same-prefix filename', async () => {
    listResult = { data: [{ name: 'dog.jpg.tmp' }], error: null }

    expect(await objectExists('tenant-1/media/member-1/item-1/dog.jpg')).toBe(false)
  })
})
