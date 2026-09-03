import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { BuyerPersonasSection } from './BuyerPersonasSection';

// Test plan (written before the port):
//  1. Section keeps id="personas" and carries the reference's
//     data-screen-label ("Every story deserves to be told") — PageThread
//     reads that attribute to find section boundaries.
//  2. Headline + eyebrow render.
//  3. Exactly five persona cards, in reference order.
//  4. Asymmetric grid: only the 4th card (The Group) is offset to column 2
//     via the hl-p-col-2 class + inline gridColumn '2 / span 2'; the other
//     four are plain 'span 2'.
//  5. Every card carries 3 tag chips; "The Individual" keeps the common-word
//     "Legacy" tag (Memoir / Retirement / Legacy) — that one is NOT the brand.
//  6. No other brand-name "Legacy" reference remains in the section copy.
//  7. Presentational only: no button in the section.

const TITLES = ['The Individual', 'The Family', 'The Parents', 'The Group', 'The Organization'];

describe('BuyerPersonasSection', () => {
  afterEach(cleanup);

  it('keeps the production id and carries the reference screen label', () => {
    const { container } = render(<BuyerPersonasSection />);
    const section = container.querySelector('section');
    expect(section).not.toBeNull();
    expect(section).toHaveAttribute('id', 'personas');
    expect(section).toHaveAttribute('data-screen-label', 'Every story deserves to be told');
  });

  it('renders the eyebrow and headline', () => {
    render(<BuyerPersonasSection />);
    expect(screen.getByText('Who We’re Building For')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Every story deserves to be told.' })).toBeInTheDocument();
  });

  it('renders five persona cards in reference order', () => {
    render(<BuyerPersonasSection />);
    const cards = screen.getAllByRole('heading', { level: 3 });
    expect(cards.map((h) => h.textContent)).toEqual(TITLES);
  });

  it('offsets only the 4th card to column 2 of the 6-column grid', () => {
    render(<BuyerPersonasSection />);
    const cards = screen.getAllByRole('heading', { level: 3 }).map((h) => h.closest('.hl-rise') as HTMLElement);
    expect(cards).toHaveLength(5);
    cards.forEach((card, i) => {
      if (i === 3) {
        expect(card).toHaveClass('hl-p-col-2');
        expect(card.style.gridColumn).toBe('2 / span 2');
      } else {
        expect(card).not.toHaveClass('hl-p-col-2');
        expect(card.style.gridColumn).toBe('span 2');
      }
    });
  });

  it('keeps the common-word "Legacy" tag on The Individual and gives every card three tags', () => {
    render(<BuyerPersonasSection />);
    const individual = screen.getByRole('heading', { level: 3, name: 'The Individual' }).closest('.hl-rise') as HTMLElement;
    const chips = within(individual).getAllByText(/Memoir|Retirement|Legacy/);
    expect(chips.map((c) => c.textContent)).toEqual(['Memoir', 'Retirement', 'Legacy']);

    const allCards = screen.getAllByRole('heading', { level: 3 }).map((h) => h.closest('.hl-rise') as HTMLElement);
    allCards.forEach((card) => {
      expect(card.querySelectorAll('span.font-mono')).toHaveLength(3);
      // each chip carries a decorative lucide icon
      expect(card.querySelectorAll('span.font-mono svg[aria-hidden="true"]')).toHaveLength(3);
    });
  });

  it('has no brand-name "Legacy" in the body copy (only the tag chip)', () => {
    const { container } = render(<BuyerPersonasSection />);
    const bodies = [...container.querySelectorAll('p')].map((p) => p.textContent ?? '');
    bodies.forEach((text) => expect(text).not.toMatch(/Legacy/));
    expect(screen.getAllByText('Legacy')).toHaveLength(1);
  });

  it('is presentational — renders no buttons', () => {
    render(<BuyerPersonasSection />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
