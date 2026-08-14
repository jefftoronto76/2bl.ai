'use client';

// components/shells/membership/v2/StoryView.tsx
//
// Real Story View — Phase 1a (real-story-view-1a-static-list): a static,
// read-only ordered list of a story's memories. Mounts as a third pane in
// ChatHero.tsx, same slot/pattern as MemoryCardView/MediaGallery/
// StoryAdminPanel (self-contained: fetches its own memory list, no
// parent-held list). Deliberately NOT in this pass, per the build sequence
// this Phase belongs to (Design Handovers/ Aug 2026 Atomic Updates/
// 01_real_story_view):
//   - No drag-reorder (Phase 1c — blocked on a real curated-order signal;
//     see getMemoriesForStory's own doc comment on why `position` being
//     all-NULL today isn't one yet).
//   - No row-tap-to-editor wiring (Phase 1b).
//   - No "Share this story" / "+" add-existing-memories buttons — neither
//     has a real production counterpart yet (only the design-handover
//     mockup has them); adding either here would be new work belonging to
//     its own later pass, not a read-only list view.
//   - No "Publish this story" — no defined behavior exists anywhere for
//     it; not guessed at here.
//
// Ownership line: uses `story.isOwner` (real — GET/POST /api/stories,
// services/crm/stories.ts's listStories/createStory), not fixed text. Only
// rendered when true, rather than showing anything false/misleading for a
// collaborator who reached this story via artifact_subscribers.
//
// Row tap (Phase 1b, real-story-view-1b-row-tap-editor): each row is a real
// <button>, not a decorative div — semantic + keyboard accessible per
// CLAUDE.md's Accessibility principle. Tapping one calls onOpenMemory with
// BOTH the memory id and its own session_id — the caller (ChatHero.tsx)
// needs the latter to open a correctly-scoped editor; see
// StoryMemoryEditor.tsx's doc comment for why a story's memory can't
// generally be opened through ChatHero's own currently-active-chat-scoped
// memory hook.

import { useEffect, useState } from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import type { Story } from './types';
import { memoryKindOf, KIND_ICONS } from '../memory/memoryKinds';

export interface StoryViewProps {
  story: Story;
  onClose: () => void;
  onOpenMemory: (memoryId: string, sessionId: string) => void;
}

interface StoryMemoryRow {
  id: string;
  session_id: string;
  title: string;
  body: string;
  source_kind: 'conversation' | 'photo' | 'video' | 'audio' | 'document';
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function StoryView({ story, onClose, onOpenMemory }: StoryViewProps) {
  const [memories, setMemories] = useState<StoryMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      try {
        const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/memories`);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(true);
          return;
        }
        const data: { memories?: StoryMemoryRow[] } = await res.json();
        if (cancelled) return;
        setMemories(Array.isArray(data.memories) ? data.memories : []);
      } catch (err) {
        console.error('[StoryView] memories fetch failed:', err);
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [story.id]);

  const countLabel = `${memories.length} ${memories.length === 1 ? 'memory' : 'memories'}`;

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="min-w-0 flex items-center gap-2.5">
          <BookOpen size={16} className="text-accent flex-shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="font-display text-[15px] text-text-primary truncate">{story.name}</h2>
            <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-text-muted mt-0.5">
              {countLabel}
              {story.isOwner ? ' · you own this story' : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          aria-label="Close story"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-20 text-text-muted">
            <Loader2 size={16} className="animate-spin" />
          </div>
        ) : loadError ? (
          <p className="font-body text-sm text-text-muted">Could not load this story&rsquo;s memories.</p>
        ) : memories.length === 0 ? (
          <p className="font-body text-sm italic text-text-muted">
            No memories in this story yet. New memories will show up here as they&rsquo;re kept.
          </p>
        ) : (
          <ol className="flex flex-col">
            {memories.map((memory) => {
              const kind = memoryKindOf(memory.source_kind);
              const Icon = KIND_ICONS[kind.icon] ?? BookOpen;
              return (
                <li key={memory.id} className="border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpenMemory(memory.id, memory.session_id)}
                    className="flex items-start gap-3 py-3 w-full text-left rounded-lg -mx-1 px-1 hover:bg-text-primary/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <span className="flex-shrink-0 w-8 h-8 mt-0.5 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
                      <Icon size={14} aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-body text-sm font-semibold text-text-primary truncate">{memory.title}</p>
                      {memory.body && (
                        <p className="font-body text-[13px] text-text-muted line-clamp-2 mt-0.5">{memory.body}</p>
                      )}
                      <p className="font-mono text-[10.5px] text-text-muted mt-1">{formatDate(memory.created_at)}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
