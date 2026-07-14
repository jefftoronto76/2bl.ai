import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'
import { vi } from 'vitest'

// Mantine Drawer / Popover / etc. use ResizeObserver. happy-dom
// doesn't ship one. Minimal no-op mock unblocks rendering.
globalThis.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Note: happy-dom ships a real matchMedia returning a MediaQueryList
// with proper addEventListener / removeEventListener support, so no
// shim is needed. Overriding it with a vi.fn() mock breaks Mantine's
// useMediaQuery because the mock's addEventListener doesn't register
// a real listener.
