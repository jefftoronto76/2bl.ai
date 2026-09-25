import { useCallback, useEffect, useRef } from 'react'

/**
 * Wraps a list fetcher so it also re-runs whenever the window regains focus —
 * a Settings panel mounted before a row was created elsewhere (another tab,
 * the Composer) otherwise never learns about it until a manual reload.
 *
 * Returns a guarded runner: while a call is in flight, further calls (from
 * focus or the caller's own mount effect) are no-ops, so rapid focus/blur
 * never stacks overlapping requests. The guard is a ref, not state, so it
 * causes no re-render and leaves the caller's `loading` skeleton untouched.
 * The fetcher owns its own error handling; this hook only sequences it.
 */
export function useRefetchOnWindowFocus(fetcher: () => Promise<void>): () => Promise<void> {
  const inFlightRef = useRef(false)

  const run = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true
    try {
      await fetcher()
    } finally {
      inFlightRef.current = false
    }
  }, [fetcher])

  useEffect(() => {
    const onFocus = () => {
      void run()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [run])

  return run
}
