import { describe, it, expect, vi, beforeEach } from 'vitest'

// next/headers is a Next.js server API — mock it so the test runs in happy-dom.
const getHeaderMock = vi.fn()
vi.mock('next/headers', () => ({
  headers: () => Promise.resolve({ get: getHeaderMock }),
}))

import manifest from './manifest'

function setHost(host: string | null) {
  getHeaderMock.mockReturnValue(host)
}

beforeEach(() => {
  getHeaderMock.mockReset()
})

describe('manifest()', () => {
  describe('Heirloom hosts', () => {
    it('heirloom.2bl.ai → full Heirloom manifest', async () => {
      setHost('heirloom.2bl.ai')
      const result = await manifest()

      expect(result.name).toBe('Heirloom')
      expect(result.short_name).toBe('Heirloom')
      expect(result.start_url).toBe('/')
      expect(result.scope).toBe('/')
      expect(result.display).toBe('standalone')
      expect(result.background_color).toBe('#1C0F06')
      expect(result.theme_color).toBe('#1C0F06')
      expect(result.icons).toHaveLength(3)
    })

    it('heirloom.localhost:3000 → full Heirloom manifest', async () => {
      setHost('heirloom.localhost:3000')
      const result = await manifest()
      expect(result.name).toBe('Heirloom')
      expect(result.icons).toHaveLength(3)
    })

    it('HEIRLOOM.2BL.AI (uppercase) → full Heirloom manifest (case-insensitive)', async () => {
      setHost('HEIRLOOM.2BL.AI')
      const result = await manifest()
      // host is lowercased before prefix check
      expect(result.name).toBe('Heirloom')
    })

    it('maskable icon has purpose: maskable', async () => {
      setHost('heirloom.2bl.ai')
      const result = await manifest()
      const maskable = result.icons?.find((i) => i.purpose === 'maskable')
      expect(maskable).toBeDefined()
      expect(maskable?.src).toContain('maskable')
      expect(maskable?.sizes).toBe('512x512')
    })

    it('non-maskable icons have purpose: any', async () => {
      setHost('heirloom.2bl.ai')
      const result = await manifest()
      const anyIcons = result.icons?.filter((i) => i.purpose === 'any')
      expect(anyIcons).toHaveLength(2)
    })

    it('icons include 192px and 512px sizes', async () => {
      setHost('heirloom.2bl.ai')
      const result = await manifest()
      const sizes = result.icons?.map((i) => i.sizes)
      expect(sizes).toContain('192x192')
      expect(sizes).toContain('512x512')
    })
  })

  describe('non-Heirloom hosts', () => {
    it('2bl.ai → stub manifest with empty icons', async () => {
      setHost('2bl.ai')
      const result = await manifest()
      expect(result.name).toBe('Second Brain Labs')
      expect(result.icons).toHaveLength(0)
    })

    it('www.2bl.ai → stub manifest', async () => {
      setHost('www.2bl.ai')
      const result = await manifest()
      expect(result.name).toBe('Second Brain Labs')
      expect(result.icons).toHaveLength(0)
    })

    it('null host → stub manifest', async () => {
      setHost(null)
      const result = await manifest()
      expect(result.name).toBe('Second Brain Labs')
    })

    it('jefflougheed.ca → stub manifest', async () => {
      setHost('jefflougheed.ca')
      const result = await manifest()
      expect(result.name).toBe('Second Brain Labs')
    })
  })
})
