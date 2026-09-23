'use client';

// components/shells/membership/v2/PreviewModal.tsx
//
// Preview reader — Story Deck & Memory Panel handover, Phase 5, 2026-09.
// Full-screen book view: cover -> memories -> back, paginated. Novel (6x9,
// ratio 0.667) / Landscape (9x7, ratio 1.286) are hard constants, confirmed
// against the Lulu print research given for this round — not derived from
// anything configurable, and this view never persists a print size (more
// trims may be offered later per the handover's own Known-unknowns).
//
// View-only, no schema/API of its own — reads whatever StoryView.tsx
// already holds (its fetched `memories`, its local stub `cover`/`backPage`
// state). Mobile: this component itself ships responsive today (smaller
// page box, wrapping header), per CLAUDE.md's mobile-first rule — but
// StoryView.tsx's own mobile ENTRY POINT (tap Preview -> toast instead of
// opening this) is deliberately Phase 6's job, not built here, per the
// staged plan's own phasing.

import { useEffect, useRef, useState } from 'react';
import { BookOpen, Bookmark, ChevronLeft, ChevronRight, Upload, X } from 'lucide-react';
import type { CoverBackData } from './CoverBackPanel';
import { memoryKindOf } from '../memory/memoryKinds';
import { useModalA11y } from './useModalA11y';
import { useWorkspaceWidthRequest } from './WorkspaceContext';

export interface PreviewMemory {
  id: string;
  title: string;
  body: string;
  source_kind: 'conversation' | 'photo' | 'video' | 'audio' | 'document';
}

type ReaderPage =
  | { kind: 'cover' | 'back'; data: CoverBackData | null }
  | { kind: 'memory'; title: string; text: string; first: boolean }
  | { kind: 'empty' };

/** Splits one memory's body into page-sized word chunks — a real memory,
 *  book layout can't fit onto one printed page. First-page limit is
 *  smaller when the memory has a media block above the text (still image
 *  placeholder, etc.) eating into the page, matching the handover's own
 *  pagination rule. */
function paginate(text: string, hasMedia: boolean): string[] {
  const words = (text || '').split(/\s+/).filter(Boolean);
  const firstLimit = hasMedia ? 300 : 620;
  const restLimit = 620;
  const pages: string[] = [];
  let i = 0;
  let limit = firstLimit;
  while (i < words.length) {
    pages.push(words.slice(i, i + limit).join(' '));
    i += limit;
    limit = restLimit;
  }
  return pages.length ? pages : [''];
}

function readerPages(cover: CoverBackData | null, memories: PreviewMemory[], backPage: CoverBackData | null): ReaderPage[] {
  const pages: ReaderPage[] = [];
  if (cover) pages.push({ kind: 'cover', data: cover });
  memories.forEach((m) => {
    const hasMedia = memoryKindOf(m.source_kind).media !== null;
    paginate(m.body, hasMedia).forEach((text, i) => pages.push({ kind: 'memory', title: m.title, text, first: i === 0 }));
  });
  if (backPage) pages.push({ kind: 'back', data: backPage });
  return pages.length ? pages : [{ kind: 'empty' }];
}

function PreviewCoverBack({ data, kind }: { data: CoverBackData | null; kind: 'cover' | 'back' }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3.5">
      {data?.hasImage && (
        <div className="w-[68%] aspect-[4/5] rounded-md bg-surface-2 border border-border grid place-items-center text-text-muted">
          {kind === 'cover' ? <BookOpen size={26} className="opacity-40" aria-hidden /> : <Bookmark size={26} className="opacity-40" aria-hidden />}
        </div>
      )}
      <h2 className={`m-0 font-display font-medium leading-tight text-text-primary ${kind === 'cover' ? 'text-[28px]' : 'text-[22px]'}`}>
        {data?.heading || (kind === 'cover' ? 'Untitled story' : '')}
      </h2>
      {data?.text && <p className="m-0 font-body text-[13.5px] leading-relaxed text-text-muted max-w-[85%]">{data.text}</p>}
    </div>
  );
}

export interface PreviewModalProps {
  open: boolean;
  storyName: string;
  cover: CoverBackData | null;
  backPage: CoverBackData | null;
  memories: PreviewMemory[];
  onClose: () => void;
}

export function PreviewModal({ open, storyName, cover, backPage, memories, onClose }: PreviewModalProps) {
  const [format, setFormat] = useState<'novel' | 'landscape'>('novel');
  const [page, setPage] = useState(0);
  const pages = readerPages(cover, memories, backPage);
  const total = pages.length;
  const current = pages[Math.min(page, total - 1)];
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Back to page 1 every time the modal opens fresh.
  useEffect(() => {
    if (open) setPage(0);
  }, [open]);

  // Focus in on open, Tab trap, focus restore on close, Escape (capture) —
  // same a11y baseline every other modal in this codebase gets. Escape is
  // NOT handled in the page-navigation listener below; the hook already
  // owns it.
  useModalA11y(open, dialogRef, onClose, closeButtonRef);

  // This dialog is `fixed inset-0` inside ChatDrawerV2, whose transform
  // makes the drawer its containing block — so Preview is exactly
  // Workspace-sized. Landscape's page is wider than the default Workspace,
  // so while it's showing, ask the drawer to grow to fit it rather than
  // squeezing the page (story-deck workspace fixes item 3, 2026-09).
  // Cleared automatically on Novel, close, or unmount.
  useWorkspaceWidthRequest('landscapePreview', open && format === 'landscape');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') setPage((p) => Math.min(total - 1, p + 1));
      else if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, total]);

  if (!open) return null;

  // Both branches are static Tailwind arbitrary-value classes (Tailwind
  // utility classes only, no inline styles/style objects per CLAUDE.md) —
  // `ratio` only ever takes one of these two hard-constant values, so the
  // width can be a precomputed class string per format rather than a
  // runtime style calculation.
  const boxWidthClass =
    format === 'novel'
      ? 'w-[calc(min(58vh,520px)*0.667)] sm:w-[calc(min(74vh,660px)*0.667)]'
      : 'w-[calc(min(58vh,520px)*1.286)] sm:w-[calc(min(74vh,660px)*1.286)]';

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${storyName}`}
      onClick={onClose}
      className="fixed inset-0 z-[92] flex flex-col bg-black/[0.86] backdrop-blur-md focus:outline-none"
    >
      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 flex items-center justify-between flex-wrap gap-2.5 px-4 py-3.5 sm:px-5 sm:py-4">
        <span className="font-display text-[15px] sm:text-base font-medium text-white">{storyName} — preview</span>
        <div className="flex items-center gap-2.5">
          <div role="group" aria-label="Page format" className="flex gap-0.5 p-0.5 rounded-lg bg-white/10">
            {(['novel', 'landscape'] as const).map((f) => (
              <button
                key={f}
                type="button"
                aria-pressed={format === f}
                onClick={() => { setFormat(f); setPage(0); }}
                className={`px-3 py-1.5 rounded-md font-body text-xs font-semibold capitalize transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                  format === f ? 'bg-accent text-background' : 'text-white/75'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            type="button"
            aria-label="Share this story — coming soon"
            title="Sharing is coming soon"
            disabled
            className="grid place-items-center w-9 h-9 rounded-full bg-white/10 text-white/40 cursor-not-allowed"
          >
            <Upload size={16} aria-hidden />
          </button>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Close preview"
            onClick={onClose}
            className="grid place-items-center w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X size={17} aria-hidden />
          </button>
        </div>
      </div>

      <div onClick={(e) => e.stopPropagation()} className="flex-1 min-h-0 flex items-center justify-center gap-2 sm:gap-4 px-3 pb-3.5">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 0}
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          className="flex-shrink-0 grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/25 bg-white/[0.08] text-white disabled:text-white/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronLeft size={17} aria-hidden />
        </button>

        <div className={`relative flex-shrink-0 rounded-[3px] bg-background shadow-[0_40px_90px_-20px_rgba(0,0,0,0.6)] overflow-hidden h-[min(58vh,520px)] sm:h-[min(74vh,660px)] max-w-[78vw] ${boxWidthClass}`}>
          <div className="absolute inset-0 border border-black/[0.06]" aria-hidden="true" title="0.125in bleed" />
          <div className={`absolute overflow-y-auto flex flex-col ${format === 'novel' ? 'inset-[9%_11%]' : 'inset-[8%]'}`}>
            {current.kind === 'cover' && <PreviewCoverBack data={current.data} kind="cover" />}
            {current.kind === 'back' && <PreviewCoverBack data={current.data} kind="back" />}
            {current.kind === 'empty' && (
              <p className="m-auto font-body text-[13.5px] text-text-muted text-center">Nothing to preview yet.</p>
            )}
            {current.kind === 'memory' && (
              <>
                {current.first && (
                  <h2 className="m-0 mb-2.5 font-display font-medium text-[21px] leading-tight text-text-primary">{current.title}</h2>
                )}
                <p className="m-0 font-body text-[14.5px] leading-[1.75] text-text-primary/[0.88]">{current.text}</p>
              </>
            )}
          </div>
        </div>

        <button
          type="button"
          aria-label="Next page"
          disabled={page === total - 1}
          onClick={() => setPage((p) => Math.min(total - 1, p + 1))}
          className="flex-shrink-0 grid place-items-center w-9 h-9 sm:w-10 sm:h-10 rounded-full border border-white/25 bg-white/[0.08] text-white disabled:text-white/30 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <ChevronRight size={17} aria-hidden />
        </button>
      </div>

      <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0 text-center py-1 pb-4 font-mono text-[11px] tracking-[0.08em] text-white/55">
        {page + 1} / {total}
      </div>
    </div>
  );
}
