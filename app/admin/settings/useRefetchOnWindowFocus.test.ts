import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@/test/render'
import { useRefetchOnWindowFocus } from './useRefetchOnWindowFocus'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

function focusWindow() {
  window.dispatchEvent(new Event('focus'))
}

describe('useRefetchOnWindowFocus', () => {
  it('re-runs the fetcher when the window regains focus', async () => {
    const fetcher = vi.fn(() => Promise.resolve())
    renderHook(() => useRefetchOnWindowFocus(fetcher))

    expect(fetcher).not.toHaveBeenCalled()
    await act(async () => focusWindow())
    expect(fetcher).toHaveBeenCalledTimes(1)
    await act(async () => focusWindow())
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not start a second fetch while one is already in flight', async () => {
    const pending = deferred()
    const fetcher = vi.fn(() => pending.promise)
    const { result } = renderHook(() => useRefetchOnWindowFocus(fetcher))

    let first!: Promise<void>
    act(() => {
      first = result.current()
    })
    focusWindow()
    focusWindow()
    expect(fetcher).toHaveBeenCalledTimes(1)

    await act(async () => {
      pending.resolve()
      await first
    })

    fetcher.mockImplementation(() => Promise.resolve())
    await act(async () => focusWindow())
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('releases the guard when the fetcher rejects', async () => {
    const fetcher = vi.fn((): Promise<void> => Promise.reject(new Error('boom')))
    const { result } = renderHook(() => useRefetchOnWindowFocus(fetcher))

    await act(async () => {
      await expect(result.current()).rejects.toThrow('boom')
    })
    fetcher.mockImplementation(() => Promise.resolve())
    await act(async () => focusWindow())
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('removes the focus listener on unmount', async () => {
    const fetcher = vi.fn(() => Promise.resolve())
    const { unmount } = renderHook(() => useRefetchOnWindowFocus(fetcher))

    unmount()
    focusWindow()
    expect(fetcher).not.toHaveBeenCalled()
  })
})
