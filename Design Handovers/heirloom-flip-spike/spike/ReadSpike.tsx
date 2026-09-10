'use client';

import { useCallback, useRef } from 'react';
import { FlipSurface } from './FlipSurface';
import { useFlipBook } from './useFlipBook';

export interface ReadSpikeEvent {
  name: 'settled' | 'next' | 'prev';
  pageIndex: number;
  at: number;
}

const PAGES = Array.from({ length: 8 }, (_, i) => ({
  title: `Page ${i + 1}`,
  body: `Memoir text for page ${i + 1}. The summer we moved to the coast, the house smelled of salt and cedar.`,
}));

export function ReadSpike({ onEvent }: { onEvent?: (e: ReadSpikeEvent) => void }) {
  const book = useFlipBook(PAGES.length);
  const emit = useRef(onEvent);
  emit.current = onEvent;

  const settled = useCallback(() => {
    book.settle();
    emit.current?.({ name: 'settled', pageIndex: book.pageIndex, at: performance.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- settle is stable; pageIndex read for the log only
  }, [book.settle, book.pageIndex]);

  const next = useCallback(() => {
    const ok = book.next();
    if (ok) emit.current?.({ name: 'next', pageIndex: book.pageIndex + 1, at: performance.now() });
    return ok;
  }, [book]);
  const prev = useCallback(() => {
    const ok = book.prev();
    if (ok) emit.current?.({ name: 'prev', pageIndex: book.pageIndex - 1, at: performance.now() });
    return ok;
  }, [book]);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-4" aria-label="Read view spike">
      <div className="aspect-[3/4] w-full">
        <FlipSurface
          pageIndex={book.pageIndex}
          pageCount={book.pageCount}
          phase={book.phase}
          direction={book.direction}
          canNext={book.canNext}
          canPrev={book.canPrev}
          onNext={next}
          onPrev={prev}
          onSettled={settled}
          label="Memoir"
          renderPage={(i) => (
            <article className="flex h-full flex-col gap-3 p-6 text-text-primary">
              <h2 className="font-serif text-xl">{PAGES[i]?.title}</h2>
              <p className="text-base leading-relaxed text-text-muted">{PAGES[i]?.body}</p>
            </article>
          )}
        />
      </div>
      <nav className="flex items-center justify-between" aria-label="Book navigation">
        <button type="button" onClick={prev} disabled={!book.canPrev || book.phase !== 'idle'} className="rounded-full border border-border px-4 py-2 text-text-primary disabled:opacity-30">
          Previous
        </button>
        <output aria-live="polite" data-testid="status" className="text-sm text-text-muted">
          Page {book.pageIndex + 1} of {book.pageCount} · {book.phase}
        </output>
        <button type="button" onClick={next} disabled={!book.canNext || book.phase !== 'idle'} className="rounded-full border border-border px-4 py-2 text-text-primary disabled:opacity-30">
          Next
        </button>
      </nav>
    </section>
  );
}
