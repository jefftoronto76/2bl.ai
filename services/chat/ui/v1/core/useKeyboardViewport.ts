'use client'

// services/chat/ui/v1/core/useKeyboardViewport.ts
//
// Shared iOS-keyboard / visual-viewport hook for the chat shells. Both the
// widget shell (jefflougheed — the Hero inline surface + the Chat overlay) and
// the membership shell (Heirloom panel) need the same two things on mobile
// Safari when the software keyboard opens:
//
//   1. Live visual-viewport measurements — `height` + `offsetTop` — and a
//      derived `keyboardOpen` flag, so a surface can pin itself to the visible
//      area above the keyboard (height + a compositor `translateY`) instead of
//      being shoved off-screen by Safari.
//   2. Optional document-body scroll-lock — freeze the page with
//      `position: fixed` while the chat is open and restore the scroll position
//      on close — so the page can't scroll under a full-viewport overlay.
//
// Why a hook (not per-surface inline code): the same `visualViewport` plumbing
// (listener lifecycle, SSR guards, scroll-lock) was duplicated across surfaces.
// Centralizing it means every shell behaves identically and the iOS handling is
// fixed in one place (see docs/chat-shells.md).
//
// SSR-safe: every `window` / `document` / `visualViewport` access is guarded,
// so the hook is inert during server render and on browsers without the
// VisualViewport API — measurements stay `null` and `keyboardOpen` stays
// `false`. The hook itself never touches the DOM layout: a consumer applies the
// returned measurements (or those handed to `onViewportChange`) to whatever
// element it owns, via CSS vars or inline styles.

import { useCallback, useEffect, useRef, useState } from 'react'

/** A single visual-viewport reading, handed to `onViewportChange`. */
export interface KeyboardViewportMeasurement {
  /** `visualViewport.height` in CSS px. */
  height: number
  /** `visualViewport.offsetTop` in CSS px (grows as Safari shifts the page up). */
  offsetTop: number
  /** Whether the keyboard is judged open for this reading. */
  keyboardOpen: boolean
}

/** The reactive state the hook returns (re-renders the consumer on change). */
export interface KeyboardViewportState {
  /**
   * `visualViewport.height`, or `null` before the first measurement, during
   * SSR, and on browsers without the VisualViewport API.
   */
  height: number | null
  /** `visualViewport.offsetTop`, with the same `null` semantics as `height`. */
  offsetTop: number | null
  /**
   * `true` while the software keyboard is judged open (mobile Safari). Always
   * `false` on desktop (the viewport height never drops below the threshold)
   * and during SSR.
   */
  keyboardOpen: boolean
}

export interface UseKeyboardViewportOptions {
  /**
   * Gate the hook. When `false` it is fully inert — no listeners, no scroll
   * lock, state pinned to its inert defaults. Lets a consumer bind the hook to
   * an overlay-open flag. Default `true`.
   */
  active?: boolean
  /**
   * Freeze `document.body` (`position: fixed` + preserved `scrollY`) while
   * active and restore the scroll position on deactivation / unmount. The
   * full-viewport overlay enables this; the inline surfaces deliberately leave
   * it off — `position: fixed` on the body breaks iOS keyboard detection in an
   * inline (non-overlay) context. Default `false`.
   */
  lockBodyScroll?: boolean
  /**
   * px below `window.innerHeight` at which the keyboard counts as open. Matches
   * the inline surface's `innerHeight - 120`. Default `120`.
   */
  keyboardThreshold?: number
  /**
   * Whether to attach the `visualViewport` resize/scroll listeners and track
   * measurements. When `false` the hook reports inert state (no listeners, no
   * re-renders) and only the optional `lockBodyScroll` runs — for a consumer
   * that wants the scroll-lock alone (the overlay, whose keyboard handling is
   * pure CSS today). Default `true`.
   */
  trackViewport?: boolean
  /**
   * Fired synchronously on every viewport sync, before the React state commit,
   * with the live measurement. For surfaces that mirror `height` / `offsetTop`
   * onto an element's CSS vars or inline styles reflow-free (no render
   * latency). The reactive return value still updates for declarative consumers.
   */
  onViewportChange?: (measurement: KeyboardViewportMeasurement) => void
}

export interface UseKeyboardViewportReturn extends KeyboardViewportState {
  /**
   * Imperatively recompute the viewport now — used to prime a surface before
   * the first `resize`/`scroll` event lands (e.g. on composer focus). No-op
   * during SSR or without the VisualViewport API.
   */
  sync: () => void
}

const INERT_STATE: KeyboardViewportState = {
  height: null,
  offsetTop: null,
  keyboardOpen: false,
}

function isInert(state: KeyboardViewportState): boolean {
  return state.height === null && state.offsetTop === null && !state.keyboardOpen
}

/**
 * Track the visual viewport (and optionally lock body scroll) for a chat
 * surface. Returns the live `{ height, offsetTop, keyboardOpen }` plus a `sync`
 * primer. See the file header for the design rationale and the two shells that
 * consume it.
 */
export function useKeyboardViewport(
  options: UseKeyboardViewportOptions = {},
): UseKeyboardViewportReturn {
  const {
    active = true,
    lockBodyScroll = false,
    keyboardThreshold = 120,
    trackViewport = true,
    onViewportChange,
  } = options

  const [state, setState] = useState<KeyboardViewportState>(INERT_STATE)

  // Latest-callback ref so changing `onViewportChange` identity never forces the
  // listener effect to tear down and re-subscribe.
  const onChangeRef = useRef(onViewportChange)
  onChangeRef.current = onViewportChange

  const sync = useCallback(() => {
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return
    const height = vv.height
    const offsetTop = vv.offsetTop
    const keyboardOpen = height < window.innerHeight - keyboardThreshold
    onChangeRef.current?.({ height, offsetTop, keyboardOpen })
    setState((prev) =>
      prev.height === height && prev.offsetTop === offsetTop && prev.keyboardOpen === keyboardOpen
        ? prev
        : { height, offsetTop, keyboardOpen },
    )
  }, [keyboardThreshold])

  // VisualViewport listener lifecycle. Inert (and reset to defaults) whenever
  // `active` is false, on SSR, or without the VisualViewport API.
  useEffect(() => {
    if (!active || !trackViewport) {
      setState((prev) => (isInert(prev) ? prev : INERT_STATE))
      return
    }
    if (typeof window === 'undefined') return
    const vv = window.visualViewport
    if (!vv) return

    sync() // prime before the first event lands
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [active, trackViewport, sync])

  // Optional body scroll-lock. Freezes the page with position:fixed and the
  // preserved scrollY, restoring the exact scroll position on cleanup. Mirrors
  // the overlay's hardened iOS lock (overflow:hidden alone is ignored by iOS
  // during focused-input auto-scroll).
  useEffect(() => {
    if (!active || !lockBodyScroll) return
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    return () => {
      body.style.position = ''
      body.style.top = ''
      body.style.left = ''
      body.style.right = ''
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [active, lockBodyScroll])

  return { ...state, sync }
}
