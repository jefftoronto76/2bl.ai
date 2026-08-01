// Covers the race-condition fix: the Supabase Database Webhook fires the
// instant media_items is INSERTed, which happens before the client's PUT of
// the file bytes lands in Storage. waitForStorageObject closes that gap with
// a bounded existence-check retry before any type-specific processing (STT/
// vision/extraction) is attempted against the object.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockObjectExists = vi.fn()

vi.mock('./storage', () => ({
  objectExists: (...args: unknown[]) => mockObjectExists(...args),
}))

import { waitForStorageObject, STORAGE_WAIT_DELAYS_MS } from './processor'

beforeEach(() => {
  mockObjectExists.mockReset()
  vi.useRealTimers()
})

describe('waitForStorageObject', () => {
  it('resolves immediately when the object already exists on the first check', async () => {
    mockObjectExists.mockResolvedValueOnce(true)

    await waitForStorageObject('tenant-1/media/member-1/item-1/dog.jpg')

    expect(mockObjectExists).toHaveBeenCalledTimes(1)
    expect(mockObjectExists).toHaveBeenCalledWith('tenant-1/media/member-1/item-1/dog.jpg')
  })

  it('retries with backoff and succeeds once the object shows up', async () => {
    vi.useFakeTimers()
    mockObjectExists
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const promise = waitForStorageObject('path/to/object')
    await vi.runAllTimersAsync()
    await promise

    expect(mockObjectExists).toHaveBeenCalledTimes(3)
  })

  it('throws a clear error after exhausting every retry attempt', async () => {
    vi.useFakeTimers()
    mockObjectExists.mockResolvedValue(false)

    const promise = waitForStorageObject('path/to/missing-object')
    // Attach the rejection assertion before advancing timers so the rejection
    // is never briefly unhandled (avoids a spurious PromiseRejectionHandledWarning).
    const assertion = expect(promise).rejects.toThrow(
      `Storage object not available after ${STORAGE_WAIT_DELAYS_MS.length} attempts: path/to/missing-object`,
    )
    await vi.runAllTimersAsync()
    await assertion

    expect(mockObjectExists).toHaveBeenCalledTimes(STORAGE_WAIT_DELAYS_MS.length)
  })
})
