'use client'

/**
 * useMode — shared Operator/Coach engagement mode
 * ────────────────────────────────────────────────
 * A tiny external store (no context/provider needed) so every section
 * that exposes the Operator/Coach toggle stays in sync, and the choice
 * survives a page refresh via localStorage.
 *
 * Consumers:
 *   - SectionOutcomes  (toggle + mode-specific cards + coda call-out)
 *   - SectionWhy       (toggle + mode-specific cards + coda call-out)
 *   - SectionProcess   (track chips; maps 'coach' ⇄ 'coaching')
 *
 * SSR note: the server snapshot is always 'operator' so server and first
 * client render match (no hydration mismatch). The persisted value is read
 * from localStorage on first subscribe — i.e. right after hydration — and a
 * re-render is triggered if it differs.
 */

import { useSyncExternalStore } from 'react'

export type Mode = 'operator' | 'coach'

const STORAGE_KEY = 'jl-mode'

let currentMode: Mode = 'operator'
let hydrated = false
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

/** Pull the persisted value once, after hydration, on the first subscribe. */
function hydrateFromStorage() {
  if (hydrated) return
  hydrated = true
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if ((saved === 'operator' || saved === 'coach') && saved !== currentMode) {
      currentMode = saved
      emit()
    }
  } catch {
    /* localStorage unavailable (private mode, SSR) — ignore. */
  }
}

export function setMode(next: Mode) {
  if (next === currentMode) return
  currentMode = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    /* ignore */
  }
  emit()
}

export function getMode(): Mode {
  return currentMode
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  hydrateFromStorage()
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): Mode {
  return currentMode
}

function getServerSnapshot(): Mode {
  return 'operator'
}

/**
 * Returns `[mode, setMode]`, mirroring useState's shape so it reads
 * naturally at the call site.
 */
export function useMode(): [Mode, (m: Mode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return [mode, setMode]
}
