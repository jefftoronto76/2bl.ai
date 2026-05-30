import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act, cleanup } from '@testing-library/react'
import { useKeyboardViewport, type UseKeyboardViewportOptions } from './useKeyboardViewport'

// ── visualViewport stub ──────────────────────────────────────────────────────
// happy-dom has no VisualViewport API, so we install a controllable stub: a tiny
// EventTarget-ish object whose height/offsetTop we mutate and then fire a
// 'resize' on, simulating the iOS keyboard opening/closing.

type Listener = () => void

class VisualViewportStub {
  height: number
  offsetTop: number
  private listeners: Record<string, Set<Listener>> = { resize: new Set(), scroll: new Set() }

  constructor(height: number, offsetTop = 0) {
    this.height = height
    this.offsetTop = offsetTop
  }

  addEventListener(type: string, cb: Listener) {
    this.listeners[type]?.add(cb)
  }

  removeEventListener(type: string, cb: Listener) {
    this.listeners[type]?.delete(cb)
  }

  /** Mutate measurements then fire an event, like Safari does on keyboard open. */
  emit(type: 'resize' | 'scroll', next: { height?: number; offsetTop?: number }) {
    if (next.height !== undefined) this.height = next.height
    if (next.offsetTop !== undefined) this.offsetTop = next.offsetTop
    this.listeners[type].forEach((cb) => cb())
  }

  listenerCount(type: 'resize' | 'scroll') {
    return this.listeners[type].size
  }
}

const INNER_HEIGHT = 800

function installViewport(stub: VisualViewportStub | undefined) {
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: stub,
  })
}

// ── harness ───────────────────────────────────────────────────────────────────
// Render the hook into a component and capture its latest return value.

function renderHookValue(options: UseKeyboardViewportOptions) {
  const captured: { current: ReturnType<typeof useKeyboardViewport> | null } = { current: null }
  function Probe(props: UseKeyboardViewportOptions) {
    captured.current = useKeyboardViewport(props)
    return null
  }
  const utils = render(<Probe {...options} />)
  const rerender = (next: UseKeyboardViewportOptions) => utils.rerender(<Probe {...next} />)
  return { ...utils, captured, rerender }
}

beforeEach(() => {
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: INNER_HEIGHT })
})

afterEach(() => {
  cleanup()
  installViewport(undefined)
  vi.restoreAllMocks()
})

describe('useKeyboardViewport — measurements', () => {
  it('primes from the current viewport on mount', () => {
    installViewport(new VisualViewportStub(INNER_HEIGHT, 0))
    const { captured } = renderHookValue({})
    expect(captured.current?.height).toBe(INNER_HEIGHT)
    expect(captured.current?.offsetTop).toBe(0)
    expect(captured.current?.keyboardOpen).toBe(false)
  })

  it('flips keyboardOpen when the viewport height drops past the threshold', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const { captured } = renderHookValue({ keyboardThreshold: 120 })
    expect(captured.current?.keyboardOpen).toBe(false)

    // Keyboard opens: height shrinks well below innerHeight - 120, offsetTop grows.
    act(() => vv.emit('resize', { height: 400, offsetTop: 100 }))
    expect(captured.current?.height).toBe(400)
    expect(captured.current?.offsetTop).toBe(100)
    expect(captured.current?.keyboardOpen).toBe(true)
  })

  it('treats a height within the threshold band as keyboard-closed', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const { captured } = renderHookValue({ keyboardThreshold: 120 })
    // Drop only 100px — still inside the 120px band → not open.
    act(() => vv.emit('resize', { height: INNER_HEIGHT - 100 }))
    expect(captured.current?.keyboardOpen).toBe(false)
  })

  it('fires onViewportChange synchronously with the live measurement', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const onViewportChange = vi.fn()
    renderHookValue({ onViewportChange })
    onViewportChange.mockClear() // ignore the mount prime
    act(() => vv.emit('resize', { height: 350, offsetTop: 120 }))
    expect(onViewportChange).toHaveBeenCalledWith({ height: 350, offsetTop: 120, keyboardOpen: true })
  })
})

describe('useKeyboardViewport — lifecycle', () => {
  it('is inert and adds no listeners when active is false', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const { captured } = renderHookValue({ active: false })
    expect(captured.current?.height).toBeNull()
    expect(captured.current?.offsetTop).toBeNull()
    expect(captured.current?.keyboardOpen).toBe(false)
    expect(vv.listenerCount('resize')).toBe(0)
  })

  it('removes listeners on unmount', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const { unmount } = renderHookValue({})
    expect(vv.listenerCount('resize')).toBe(1)
    expect(vv.listenerCount('scroll')).toBe(1)
    unmount()
    expect(vv.listenerCount('resize')).toBe(0)
    expect(vv.listenerCount('scroll')).toBe(0)
  })

  it('resets to inert when toggled from active to inactive', () => {
    const vv = new VisualViewportStub(INNER_HEIGHT, 0)
    installViewport(vv)
    const { captured, rerender } = renderHookValue({ active: true })
    act(() => vv.emit('resize', { height: 400, offsetTop: 100 }))
    expect(captured.current?.keyboardOpen).toBe(true)
    rerender({ active: false })
    expect(captured.current?.height).toBeNull()
    expect(captured.current?.keyboardOpen).toBe(false)
  })

  it('does not throw without the VisualViewport API', () => {
    installViewport(undefined)
    expect(() => renderHookValue({})).not.toThrow()
    const { captured } = renderHookValue({})
    expect(captured.current?.height).toBeNull()
    expect(captured.current?.keyboardOpen).toBe(false)
  })
})

describe('useKeyboardViewport — body scroll lock', () => {
  it('freezes the body while active and restores scroll on unmount', () => {
    installViewport(new VisualViewportStub(INNER_HEIGHT, 0))
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 250 })
    const scrollTo = vi.fn()
    Object.defineProperty(window, 'scrollTo', { configurable: true, value: scrollTo })

    const { unmount } = renderHookValue({ lockBodyScroll: true })
    expect(document.body.style.position).toBe('fixed')
    expect(document.body.style.top).toBe('-250px')

    unmount()
    expect(document.body.style.position).toBe('')
    expect(document.body.style.top).toBe('')
    expect(scrollTo).toHaveBeenCalledWith({ top: 250, left: 0, behavior: 'instant' })
  })

  it('does not touch the body when lockBodyScroll is false', () => {
    installViewport(new VisualViewportStub(INNER_HEIGHT, 0))
    renderHookValue({ lockBodyScroll: false })
    expect(document.body.style.position).toBe('')
  })
})
