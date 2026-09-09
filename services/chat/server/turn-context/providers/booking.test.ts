import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeInput } from '../test-input'

const mockGetBookingCardSection = vi.fn<(tenantId: string) => Promise<string>>()
vi.mock('../../booking', () => ({
  getBookingCardSection: (tenantId: string) => mockGetBookingCardSection(tenantId),
}))

import { bookingProvider } from './booking'

beforeEach(() => mockGetBookingCardSection.mockReset())

describe('bookingProvider', () => {
  it('applies only when a tenant resolved — the same gate streamChat uses', () => {
    expect(bookingProvider.appliesTo(makeInput({ tenantId: 'tenant-1' }))).toBe(true)
    expect(bookingProvider.appliesTo(makeInput({ tenantId: null }))).toBe(false)
  })

  it('returns the booking section verbatim', async () => {
    mockGetBookingCardSection.mockResolvedValue('Booking cards — …\n[BOOKING: a | b | c | https://x]')
    const out = await bookingProvider.resolve(makeInput({ tenantId: 'tenant-1' }))
    expect(out).toBe('Booking cards — …\n[BOOKING: a | b | c | https://x]')
    expect(mockGetBookingCardSection).toHaveBeenCalledWith('tenant-1')
  })

  it("passes through '' for a tenant with no booking parameters (the runner records it as empty)", async () => {
    mockGetBookingCardSection.mockResolvedValue('')
    expect(await bookingProvider.resolve(makeInput({ tenantId: 'tenant-1' }))).toBe('')
  })
})
