/*
  CtaSection + Footer — port verification for the FadeCta / Footer reference sections.

  Test plan (written before the port):
    1. CtaSection "Start Your Story" dispatches exactly { type: 'OPEN_CHAT' } once
       — the same action, byte-for-byte, as the Hero and Pricing CTAs. This is the
       hard boundary of the port: visuals change, click behaviour does not.
    2. CtaSection renders the reference copy and the "All memories fade"
       data-screen-label (PageThread keys off data-screen-label attributes).
    3. Footer "About" links to the id WhatIsHeirloomSection actually renders
       (#what-is-heirloom — NOT the reference's #what-is), so the anchor scrolls.
    4. Footer contact link is a real mailto:; the placeholder links stay "#" as
       in the reference. data-screen-label stays "Footer".

  happy-dom doesn't implement IntersectionObserver (useReveal needs one), so a
  minimal stub is installed per test, same as useMediaPagination.test.tsx.
*/

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import { CtaSection } from './CtaSection'
import { Footer } from './Footer'
import { PricingSection } from './PricingSection'
import { WhatIsHeirloomSection } from './WhatIsHeirloomSection'

const mockDispatch = vi.fn()

vi.mock('@/components/shells/membership/chatStore', () => ({
  useChatStore: () => ({ dispatch: mockDispatch }),
}))

class MockIntersectionObserver {
  observe() {}
  disconnect() {}
  unobserve() {}
}

beforeEach(() => {
  mockDispatch.mockClear()
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('CtaSection (FadeCta port)', () => {
  it('dispatches exactly { type: "OPEN_CHAT" } once when "Start Your Story" is clicked', () => {
    render(<CtaSection />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Start Your Story' }))
    expect(mockDispatch).toHaveBeenCalledTimes(1)
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'OPEN_CHAT' })
  })

  it('dispatches the same action as the Pricing CTA', () => {
    render(<PricingSection />)
    fireEvent.click(screen.getByRole('button', { name: 'Start Your Story' }))
    const pricingCall = mockDispatch.mock.calls[0]
    mockDispatch.mockClear()

    render(<CtaSection />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Start Your Story' }).at(-1)!)
    expect(mockDispatch.mock.calls[0]).toEqual(pricingCall)
  })

  it('renders the reference copy and the "All memories fade" screen label', () => {
    const { container } = render(<CtaSection />)
    const section = container.querySelector('section')
    expect(section).toHaveAttribute('data-screen-label', 'All memories fade')
    expect(section).not.toHaveAttribute('id')
    expect(screen.getByText(/All memories fade\./)).toBeInTheDocument()
    expect(screen.getByText(/Don’t let yours be forgotten\./)).toBeInTheDocument()
    expect(screen.getByText('Write your first story in under two minutes.')).toBeInTheDocument()
  })
})

describe('Footer port', () => {
  it('"About" targets the id WhatIsHeirloomSection actually renders', () => {
    const { container } = render(
      <>
        <WhatIsHeirloomSection />
        <Footer />
      </>,
    )
    const about = screen.getByRole('link', { name: 'About' })
    const href = about.getAttribute('href')!
    expect(href.startsWith('#')).toBe(true)
    expect(container.querySelector(href)).not.toBeNull()
    expect(href).toBe('#what-is-heirloom')
  })

  it('renders the three columns, the mailto contact, and the placeholder links as-is', () => {
    const { container } = render(<Footer />)
    const footer = container.querySelector('footer')!
    expect(footer).toHaveAttribute('data-screen-label', 'Footer')
    expect(screen.getByText('Every life deserves to be a book.')).toBeInTheDocument()
    expect(screen.getByText('Brought to you by')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Learn' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Contact' })).toBeInTheDocument()

    expect(screen.getByRole('link', { name: 'hello@2bl.ai' })).toHaveAttribute('href', 'mailto:hello@2bl.ai')
    expect(screen.getByRole('link', { name: 'Blog' })).toHaveAttribute('href', '#')
    expect(screen.getByRole('link', { name: 'LinkedIn ↗' })).toHaveAttribute('href', '#')
    expect(screen.getByRole('link', { name: 'Toronto · Remote' })).toHaveAttribute('href', '#')

    const bottom = footer.querySelector('.hl-foot-bottom')!
    expect(within(bottom as HTMLElement).getByText(/Second Brain Labs, Inc\./)).toBeInTheDocument()
    expect(within(bottom as HTMLElement).getByText('Trying the impossible, one product at a time.')).toBeInTheDocument()

    expect(screen.queryAllByRole('button')).toHaveLength(0)
    expect(mockDispatch).not.toHaveBeenCalled()
  })
})
