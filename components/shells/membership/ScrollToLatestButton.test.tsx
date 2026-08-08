// Unit coverage for useScrollAnchor + ScrollToLatestButton (scroll-to-latest
// nudge). happy-dom has no real layout engine — scrollHeight/scrollTop/
// clientHeight all default to 0 and Element.scrollTo isn't implemented — so
// every test stubs them directly on the container node, the same pattern
// used for clientWidth in ChatHero.memoryPanel.test.tsx.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import { useScrollAnchor, ScrollToLatestButton } from './ScrollToLatestButton';

afterEach(cleanup);

function stubScrollMetrics(el: HTMLElement, { scrollHeight, scrollTop, clientHeight }: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: scrollHeight });
  Object.defineProperty(el, 'scrollTop', { configurable: true, value: scrollTop });
  Object.defineProperty(el, 'clientHeight', { configurable: true, value: clientHeight });
}

function Harness() {
  const { ref, atBottom, handleScroll, scrollToBottom } = useScrollAnchor();
  return (
    <div className="relative">
      <div ref={ref} onScroll={handleScroll} data-testid="scroll-container">
        content
      </div>
      <ScrollToLatestButton visible={!atBottom} onClick={scrollToBottom} />
    </div>
  );
}

describe('useScrollAnchor + ScrollToLatestButton', () => {
  it('button is hidden by default (starts anchored to the bottom)', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Scroll to latest' })).toBeNull();
  });

  it('scrolling up more than the 48px threshold shows the button', () => {
    render(<Harness />);
    const container = screen.getByTestId('scroll-container');
    stubScrollMetrics(container, { scrollHeight: 1000, scrollTop: 500, clientHeight: 400 }); // 100px from bottom
    fireEvent.scroll(container);
    expect(screen.getByRole('button', { name: 'Scroll to latest' })).toBeInTheDocument();
  });

  it('within the 48px threshold, the button stays hidden', () => {
    render(<Harness />);
    const container = screen.getByTestId('scroll-container');
    stubScrollMetrics(container, { scrollHeight: 1000, scrollTop: 590, clientHeight: 400 }); // 10px from bottom
    fireEvent.scroll(container);
    expect(screen.queryByRole('button', { name: 'Scroll to latest' })).toBeNull();
  });

  it('scrolling back down within the threshold hides the button again', () => {
    render(<Harness />);
    const container = screen.getByTestId('scroll-container');
    stubScrollMetrics(container, { scrollHeight: 1000, scrollTop: 500, clientHeight: 400 });
    fireEvent.scroll(container);
    expect(screen.getByRole('button', { name: 'Scroll to latest' })).toBeInTheDocument();

    stubScrollMetrics(container, { scrollHeight: 1000, scrollTop: 600, clientHeight: 400 });
    fireEvent.scroll(container);
    expect(screen.queryByRole('button', { name: 'Scroll to latest' })).toBeNull();
  });

  it('clicking the button smooth-scrolls the container to its bottom', () => {
    render(<Harness />);
    const container = screen.getByTestId('scroll-container');
    stubScrollMetrics(container, { scrollHeight: 1200, scrollTop: 500, clientHeight: 400 });
    container.scrollTo = vi.fn();
    fireEvent.scroll(container);

    fireEvent.click(screen.getByRole('button', { name: 'Scroll to latest' }));
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 1200, behavior: 'smooth' });
  });
});
