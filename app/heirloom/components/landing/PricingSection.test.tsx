import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { PricingSection } from './PricingSection';

// Test plan (written before the port):
//  1. id="pricing" survives — it is LandingNav's scroll target — and the
//     section carries data-screen-label="Public Release Soon".
//  2. Eyebrow / headline / beta prompt render; body copy says "Heirloom",
//     never the old brand name "Legacy".
//  3. The single CTA "Drop us a message" dispatches { type: 'OPEN_CHAT' }
//     via useChatStore — the same wiring as HeroSection's "Start Your Story".
//  4. The reference's `legacy-open-chat` window CustomEvent is NOT ported:
//     clicking fires no window event at all.
//  5. The old price card / billing toggle is gone (no tablist, no "$").

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('@/components/shells/membership/chatStore', () => ({
  useChatStore: () => ({ dispatch }),
}));

describe('PricingSection', () => {
  beforeEach(() => dispatch.mockClear());
  afterEach(cleanup);

  it('preserves the load-bearing id="pricing" and the reference screen label', () => {
    const { container } = render(<PricingSection />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'pricing');
    expect(section).toHaveAttribute('data-screen-label', 'Public Release Soon');
    expect(section).toHaveClass('scroll-mt-16');
  });

  it('renders the beta copy with the Heirloom brand name', () => {
    const { container } = render(<PricingSection />);
    expect(screen.getByText('Public Release Soon')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'We’re almost ready.' })).toBeInTheDocument();
    expect(screen.getByText(/make sure Heirloom is ready/)).toBeInTheDocument();
    expect(screen.getByText('Want to join the beta?')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/Legacy/);
  });

  it('dispatches OPEN_CHAT when "Drop us a message" is clicked', () => {
    render(<PricingSection />);
    const button = screen.getByRole('button', { name: 'Drop us a message' });
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: 'OPEN_CHAT' });
  });

  it('does not fire the reference prototype\'s window event', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    render(<PricingSection />);
    fireEvent.click(screen.getByRole('button', { name: 'Drop us a message' }));
    const custom = spy.mock.calls.filter(([e]) => e.type === 'legacy-open-chat');
    expect(custom).toHaveLength(0);
    spy.mockRestore();
  });

  it('has exactly one button and no leftover price card', () => {
    const { container } = render(<PricingSection />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('tablist')).toBeNull();
    expect(container.textContent).not.toMatch(/\$/);
  });
});
