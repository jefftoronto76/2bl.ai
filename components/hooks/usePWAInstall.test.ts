import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@/test/render'

// vi.hoisted ensures trackMock is available inside the vi.mock factory
const { trackMock } = vi.hoisted(() => ({ trackMock: vi.fn() }))
vi.mock('@vercel/analytics', () => ({ track: trackMock }))

// Mock fetch so logPWAEvent doesn't hit the network
const fetchMock = vi.fn()
vi.stubGlobal('fetch', fetchMock)

import { usePWAInstall } from './usePWAInstall'

// ── Helpers ───────────────────────────────────────────────────────────────────

function setUserAgent(ua: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
}

const IOS_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36'

/** Create a proper BeforeInstallPromptEvent — must be a real Event instance
 *  so happy-dom's dispatchEvent can call composedPath() on it. */
function makeBIPrompt(outcome: 'accepted' | 'dismissed' = 'accepted'): Event {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  Object.assign(event, {
    platforms: [],
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome, platform: 'web' }),
  })
  return event
}

beforeEach(() => {
  trackMock.mockReset()
  fetchMock.mockResolvedValue({ ok: true })
  // Ensure navigator.standalone is not set (not in standalone mode)
  // @ts-ignore
  delete (navigator as any).standalone
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── iOS tests ─────────────────────────────────────────────────────────────────

describe('usePWAInstall — iOS', () => {
  it('non-standalone: canInstall=true, platform=ios', () => {
    setUserAgent(IOS_UA)
    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.canInstall).toBe(true)
    expect(result.current.platform).toBe('ios')
  })

  it('already standalone (matchMedia): canInstall=false', () => {
    setUserAgent(IOS_UA)
    // Override matchMedia to return standalone=true
    const original = window.matchMedia
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      if (query === '(display-mode: standalone)') {
        return { matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as any
      }
      return original(query)
    })

    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.canInstall).toBe(false)
  })

  it('already standalone (navigator.standalone): canInstall=false', () => {
    setUserAgent(IOS_UA)
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true })

    const { result } = renderHook(() => usePWAInstall())
    expect(result.current.canInstall).toBe(false)
  })

  it('promptInstall on iOS resolves without calling deferredPrompt.prompt', async () => {
    setUserAgent(IOS_UA)
    const { result } = renderHook(() => usePWAInstall())

    await act(async () => {
      await result.current.promptInstall()
    })

    // track called for install_triggered
    expect(trackMock).toHaveBeenCalledWith('pwa_install_triggered', { platform: 'ios' })
  })
})

// ── Android / beforeinstallprompt tests ──────────────────────────────────────

describe('usePWAInstall — Android', () => {
  it('beforeinstallprompt event → canInstall=true, platform=android', async () => {
    setUserAgent(ANDROID_UA)
    const { result } = renderHook(() => usePWAInstall())

    await act(async () => {
      window.dispatchEvent(makeBIPrompt())
    })

    expect(result.current.canInstall).toBe(true)
    expect(result.current.platform).toBe('android')
  })

  it('beforeinstallprompt → track("pwa_install_available") called', async () => {
    setUserAgent(ANDROID_UA)
    renderHook(() => usePWAInstall())

    await act(async () => {
      window.dispatchEvent(makeBIPrompt())
    })

    expect(trackMock).toHaveBeenCalledWith('pwa_install_available')
  })

  it('beforeinstallprompt → logPWAEvent(pwa.install_prompted) called via fetch', async () => {
    setUserAgent(ANDROID_UA)
    renderHook(() => usePWAInstall())

    await act(async () => {
      window.dispatchEvent(makeBIPrompt())
    })

    // Give logPWAEvent (fire-and-forget) a tick to resolve
    await act(async () => { await Promise.resolve() })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/events/pwa',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('pwa.install_prompted'),
      }),
    )
  })

  it('appinstalled event → canInstall=false, track("pwa_installed") called', async () => {
    setUserAgent(ANDROID_UA)
    const { result } = renderHook(() => usePWAInstall())

    // First fire beforeinstallprompt to set canInstall=true
    await act(async () => {
      window.dispatchEvent(makeBIPrompt())
    })

    expect(result.current.canInstall).toBe(true)

    // Then fire appinstalled
    await act(async () => {
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.canInstall).toBe(false)
    expect(trackMock).toHaveBeenCalledWith('pwa_installed', { platform: 'android' })
  })

  it('promptInstall accepted → canInstall=false', async () => {
    setUserAgent(ANDROID_UA)
    const prompt = makeBIPrompt('accepted')
    const { result } = renderHook(() => usePWAInstall())

    await act(async () => {
      window.dispatchEvent(prompt)
    })

    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.promptInstall()
    })

    expect(result.current.canInstall).toBe(false)
    expect(trackMock).toHaveBeenCalledWith('pwa_install_triggered', { platform: 'android' })
  })

  it('promptInstall dismissed → canInstall stays true', async () => {
    setUserAgent(ANDROID_UA)
    const prompt = makeBIPrompt('dismissed')
    const { result } = renderHook(() => usePWAInstall())

    await act(async () => {
      window.dispatchEvent(prompt)
    })

    await act(async () => {
      await result.current.promptInstall()
    })

    expect(result.current.canInstall).toBe(true)
  })

  it('cleanup: event listeners removed on unmount', async () => {
    setUserAgent(ANDROID_UA)
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => usePWAInstall())

    const registered = addSpy.mock.calls.map((c) => c[0])
    expect(registered).toContain('beforeinstallprompt')
    expect(registered).toContain('appinstalled')

    unmount()

    const removed = removeSpy.mock.calls.map((c) => c[0])
    expect(removed).toContain('beforeinstallprompt')
    expect(removed).toContain('appinstalled')
  })
})
