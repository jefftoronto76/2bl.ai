'use client';

/**
 * Smallest possible working example: mock pages + prev/next buttons.
 * `onEvent` is a test seam so a harness can record the engine's event order.
 */

import { useCallback, useRef, useState, type Ref } from 'react';
import { FlipBook } from './FlipBook';
import type { FlipBookHandle, PageFlipState } from './pageFlipTypes';

export interface SpikeEvent {
  name: 'init' | 'flip' | 'changeState' | 'changeOrientation' | 'update';
  data: unknown;
  at: number;
}

interface PageProps {
  title: string;
  body: string;
  /** react-pageflip clones children with a DOM ref; pages must forward it. */
  ref?: Ref<HTMLDivElement>;
}

function Page({ title, body, ref }: PageProps) {
  return (
    <div ref={ref} className="page">
      <h2 className="page__title">{title}</h2>
      <p className="page__body">{body}</p>
    </div>
  );
}

const MOCK_PAGES = Array.from({ length: 6 }, (_, i) => ({
  title: `Page ${i + 1}`,
  body: `Mock content for page ${i + 1}.`,
}));

export interface BookSpikeProps {
  onEvent?: (event: SpikeEvent) => void;
  pageCount?: number;
}

export function BookSpike({ onEvent, pageCount = MOCK_PAGES.length }: BookSpikeProps) {
  const book = useRef<FlipBookHandle>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [state, setState] = useState<PageFlipState>('read');

  const record = useCallback(
    (name: SpikeEvent['name'], data: unknown) => onEvent?.({ name, data, at: performance.now() }),
    [onEvent],
  );

  const flipNext = () => book.current?.pageFlip()?.flipNext();
  const flipPrev = () => book.current?.pageFlip()?.flipPrev();

  return (
    <section className="spike" aria-label="Page-flip spike">
      <FlipBook
        ref={book}
        width={300}
        height={420}
        flippingTime={400}
        onInit={(e) => record('init', e.data)}
        onFlip={(e) => {
          setPageIndex(e.data);
          record('flip', e.data);
        }}
        onChangeState={(e) => {
          setState(e.data);
          record('changeState', e.data);
        }}
        onChangeOrientation={(e) => record('changeOrientation', e.data)}
        onUpdate={(e) => record('update', e.data)}
      >
        {MOCK_PAGES.slice(0, pageCount).map((p) => (
          <Page key={p.title} title={p.title} body={p.body} />
        ))}
      </FlipBook>
      <nav className="spike__nav" aria-label="Book navigation">
        <button type="button" onClick={flipPrev} disabled={state === 'flipping'}>
          Previous
        </button>
        <output aria-live="polite" data-testid="status">
          page {pageIndex} · {state}
        </output>
        <button type="button" onClick={flipNext} disabled={state === 'flipping'}>
          Next
        </button>
      </nav>
    </section>
  );
}
