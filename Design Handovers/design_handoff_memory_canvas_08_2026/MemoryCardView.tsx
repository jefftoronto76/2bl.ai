'use client';

/**
 * MemoryCardView — one memory, open for reading/editing.
 *
 * Chrome change from the original prototype (design_handoff_memories has no
 * file for this — it wasn't built yet when that package shipped):
 *
 *   BEFORE: header held [X close][title][folder: move-to-story][⋮: overflow menu]
 *   NOW:    header holds [title][+ : add to a story][X: close]
 *           the ⋮ menu's three actions (Talk about this / Use as a base /
 *           Remove) moved to a persistent FOOTER bar — always visible, no menu.
 *
 * The body (media + passage) scrolls independently between the fixed header
 * and fixed footer — a plain flex column with `overflow-y-auto` on the middle
 * child does this for free, no special layout needed.
 */

import { useState } from 'react';
import { X, Plus, MessageCircle, GitFork, Trash2, BookOpen } from 'lucide-react';

type Story = { id: string; name: string };

type Props = {
  title: string;
  date: string;
  passage: string;
  eyebrow: string; // e.g. "A photograph, remembered" — from MemoryKindSpec.eyebrow
  media?: React.ReactNode; // rendered above the title when the kind has a hero media block
  stories: Story[];
  activeStoryId?: string;
  onClose: () => void;
  onTitleChange: (title: string) => void;
  onDateChange: (date: string) => void;
  onPassageChange: (passage: string) => void;
  onMoveToStory: (storyId: string) => void;
  onTalk: () => void;
  onFork: () => void;
  onDelete: () => void;
};

const footerBtn =
  'inline-flex items-center gap-[7px] rounded-lg border border-border bg-transparent px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary';

export function MemoryCardView({
  title, date, passage, eyebrow, media, stories, activeStoryId,
  onClose, onTitleChange, onDateChange, onPassageChange, onMoveToStory, onTalk, onFork, onDelete,
}: Props) {
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header — title + meta only. Two actions: add to a story, close. */}
      <header className="relative flex-shrink-0 border-b border-border px-[18px] py-[14px]">
        <div className="flex items-center gap-2">
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="min-w-0 flex-1 border-none bg-transparent px-0.5 py-1 font-display text-xl font-medium tracking-tight text-text-primary outline-none"
          />
          {stories.length > 0 && (
            <button
              aria-label="Add to a story" title="Add to a story"
              onClick={() => setMoveOpen((v) => !v)}
              className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border-none bg-accent text-background"
            >
              <Plus size={16} />
            </button>
          )}
          <button aria-label="Close" onClick={onClose} className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-lg border-none bg-transparent text-text-secondary">
            <X size={18} />
          </button>
        </div>

        <div className="mt-2 flex items-center gap-[7px] font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary">
          <span>{eyebrow}</span>
          <span className="opacity-50">·</span>
          <input
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-[84px] border-none bg-transparent p-0 font-mono text-[10px] uppercase tracking-[0.16em] text-text-tertiary outline-none"
          />
        </div>

        {moveOpen && (
          <>
            <div onClick={() => setMoveOpen(false)} className="fixed inset-0 z-[29]" />
            <div className="absolute right-[46px] top-full z-30 mt-1 min-w-[190px] rounded-xl border border-border bg-surface p-1.5 shadow-lg">
              {stories.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setMoveOpen(false); onMoveToStory(s.id); }}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left font-body text-[13px] hover:bg-black/[0.06]',
                    s.id === activeStoryId ? 'text-accent' : 'text-text-primary',
                  ].join(' ')}
                >
                  <BookOpen size={14} />{s.name}
                </button>
              ))}
            </div>
          </>
        )}
      </header>

      {/* Body — scrolls independently of header and footer */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[560px] px-[22px] pb-8 pt-5">
          {media && <div className="mb-4.5 overflow-hidden rounded-[13px] border border-border">{media}</div>}
          <textarea
            value={passage}
            onChange={(e) => onPassageChange(e.target.value)}
            rows={4}
            className="block w-full resize-none border-none bg-transparent p-0 font-body text-[15.5px] leading-[1.75] text-text-primary/90 outline-none"
          />
        </div>
      </div>

      {/* Footer — was behind the ⋮ menu; now a persistent action bar */}
      <div className="flex flex-shrink-0 items-center gap-2 border-t border-border bg-surface px-4 py-3">
        <button onClick={onTalk} className={footerBtn}><MessageCircle size={14} />Talk about this</button>
        <button onClick={onFork} className={footerBtn}><GitFork size={14} />Use as a base</button>
        <button onClick={onDelete} className={`${footerBtn} ml-auto text-danger hover:border-danger`}>
          <Trash2 size={14} />Remove
        </button>
      </div>
    </div>
  );
}
