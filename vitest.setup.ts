import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// Mantine Drawer / Popover / etc. use ResizeObserver. happy-dom
// doesn't ship one. Minimal no-op stub unblocks rendering. A plain class,
// NOT vi.fn().mockImplementation(...): test files that call
// vi.restoreAllMocks() in afterEach reset a vi.fn()'s implementation, after
// which `new ResizeObserver()` returned an object with no observe() — which
// broke ChatHero's panel re-clamp observer (2026-09) in every later test of
// that file. A class can't be reset that way. Tests that need to drive
// resizes stub their own (see ChatHero.workspaceGrow.test.tsx).
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

// Note: happy-dom ships a real matchMedia returning a MediaQueryList
// with proper addEventListener / removeEventListener support, so no
// shim is needed. Overriding it with a vi.fn() mock breaks Mantine's
// useMediaQuery because the mock's addEventListener doesn't register
// a real listener.
