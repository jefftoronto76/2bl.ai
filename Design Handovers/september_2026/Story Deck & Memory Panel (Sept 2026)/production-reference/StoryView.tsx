'use client';

// components/shells/membership/v2/StoryView.tsx
//
// Real Story View — Phase 1a (real-story-view-1a-static-list): an ordered
// list of a story's memories. Mounts as a third pane in ChatHero.tsx, same
// slot/pattern as MemoryCardView/MediaGallery/StoryAdminPanel
// (self-contained: fetches its own memory list, no parent-held list).
// Deliberately NOT in this pass, per the build sequence this Phase belongs
// to (Design Handovers/ Aug 2026 Atomic Updates/01_real_story_view):
//   - No "Share this story" / "+" add-existing-memories buttons — neither
//     has a real production counterpart yet (only the design-handover
//     mockup has them); adding either here would be new work belonging to
//     its own later pass, not this list view.
//   - No "Publish this story" — no defined behavior exists anywhere for
//     it; not guessed at here.
//
// Ownership line: uses `story.isOwner` (real — GET/POST /api/stories,
// services/crm/stories.ts's listStories/createStory), not fixed text. Only
// rendered when true, rather than showing anything false/misleading for a
// collaborator who reached this story via artifact_subscribers.
//
// Row tap (Phase 1b, real-story-view-1b-row-tap-editor): the row's own
// button (title/body/date) is a real <button>, not a decorative div —
// semantic + keyboard accessible per CLAUDE.md's Accessibility principle.
// Tapping it calls onOpenMemory with BOTH the memory id and its own
// session_id — the caller (ChatHero.tsx) needs the latter to open a
// correctly-scoped editor; see StoryMemoryEditor.tsx's doc comment for why
// a story's memory can't generally be opened through ChatHero's own
// currently-active-chat-scoped memory hook.
//
// Reorder (Phase 1c, real-story-view-1c-reorder): up/down move buttons per
// row, not drag-and-drop — deliberately simpler for this pass. Sibling
// buttons alongside the row's own open-editor button, not nested inside it
// (a <button> can't contain another <button>). PATCHes
// /api/stories/[id]/memories ({ memoryId, direction }), then refetches the
// list rather than reordering local state client-side — simplest correct
// option (see moveMemoryInStory's own doc comment, services/crm/
// story-containments.ts, for why the server is the only place that can
// safely compute the new order). Every row's move buttons disable while
// ANY move is in flight, not just the moved row's — a second click on a
// different row before the first move's round trip + refetch resolves
// could otherwise race against a server order the client hasn't seen yet.

import { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import type { Story } from './types';
import { memoryKindOf, KIND_ICONS } from '../memory/memoryKinds';

export interface StoryViewProps {
  story: Story;
  onClose: () => void;
  onOpenMemory: (memoryId: string, sessionId: string) => void;
  /** Shared toast — same one ChatHero passes to StoryMemoryEditor. Only
   *  used for a move failure; the initial load already has its own inline
   *  error state below. */
  onFlash: (message: string) => void;
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

export function StoryView({ story, onClose, onOpenMemory, onFlash }: StoryViewProps) {
  const [memories, setMemories] = useState<StoryMemoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  // Non-null while a move's PATCH + refetch round trip is in flight — the
  // moved memory's own id, though every row's buttons disable while it's
  // set (see this file's own header comment for why).
  const [moving, setMoving] = useState<string | null>(null);

  /** Returns the fresh list on success, or null on any failure — never
   *  throws, matching this component's existing silent-log-and-degrade
   *  posture for the initial load. */
  const loadMemories = useCallback(async (): Promise<StoryMemoryRow[] | null> => {
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/memories`);
      if (!res.ok) return null;
      const data: { memories?: StoryMemoryRow[] } = await res.json();
      return Array.isArray(data.memories) ? data.memories : [];
    } catch (err) {
      console.error('[StoryView] memories fetch failed:', err);
      return null;
    }
  }, [story.id]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    (async () => {
      const result = await loadMemories();
      if (cancelled) return;
      if (result === null) {
        setLoadError(true);
      } else {
        setMemories(result);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMemories]);

  const handleMove = async (memoryId: string, direction: 'up' | 'down') => {
    setMoving(memoryId);
    try {
      const res = await fetch(`/api/stories/${encodeURIComponent(story.id)}/memories`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memoryId, direction }),
      });
      if (!res.ok) {
        console.error('[StoryView] move failed:', res.status);
        onFlash('Could not move memory');
        return;
      }
      const result = await loadMemories();
      if (result === null) {
        onFlash('Could not move memory');
        return;
      }
      setMemories(result);
    } catch (err) {
      console.error('[StoryView] move threw:', err);
      onFlash('Could not move memory');
    } finally {
      setMoving(null);
    }
  };

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
            {memories.map((memory, index) => {
              const kind = memoryKindOf(memory.source_kind);
              const Icon = KIND_ICONS[kind.icon] ?? BookOpen;
              const isFirst = index === 0;
              const isLast = index === memories.length - 1;
              return (
                <li key={memory.id} className="flex items-center gap-1 border-b border-border last:border-b-0">
                  <button
                    type="button"
                    onClick={() => onOpenMemory(memory.id, memory.session_id)}
                    className="flex items-start gap-3 py-3 flex-1 min-w-0 text-left rounded-lg -mx-1 px-1 hover:bg-text-primary/[0.04] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
                  <div className="flex flex-col flex-shrink-0">
                    <button
                      type="button"
                      aria-label="Move up"
                      disabled={isFirst || moving !== null}
                      onClick={() => handleMove(memory.id, 'up')}
                      className="grid place-items-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ChevronUp size={14} aria-hidden />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={isLast || moving !== null}
                      onClick={() => handleMove(memory.id, 'down')}
                      className="grid place-items-center w-6 h-6 rounded text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <ChevronDown size={14} aria-hidden />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
