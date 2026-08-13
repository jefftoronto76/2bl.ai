'use client';

// components/shells/membership/v2/StoryAdminPanel.tsx
//
// Story kebab's "Admin" action (Updated Story Kebabs handover, 2026-08-13) —
// mounts as a third pane in ChatHero.tsx, same slot/pattern as MediaGallery
// and MemoryCardView (self-contained: fetches its own roster, owns its own
// mutation state, no parent-held collaborator list). Two things live here:
//
//   - Description — the story's `body` column (createStory's own field,
//     services/crm/stories.ts), editable here for the first time since
//     creation. Commits on blur via onDescriptionCommit, and only when the
//     trimmed value actually changed — the parent owns the PATCH call (same
//     shape as MemoryCardView's onRetitle) since the description is also
//     shown elsewhere (SidebarV2's row tooltip), so ChatHero.tsx's own
//     `stories` state needs to know about a successful edit too.
//   - Members — roster via GET /api/heirloom/story-invites?story_id=
//     (services/crm/story-invites.ts's listStoryCollaborators). Deliberately
//     NO memory count per row, even though the prototype reference shows
//     one (`c.memoryCount`) — story <-> memory linking isn't wired yet (see
//     System Docs/Known Gaps.md); fabricating a number nothing tracks was
//     already decided against in an earlier pass. Remove opens a confirm
//     dialog before calling the real DELETE /api/heirloom/story-invites/
//     collaborators (services/crm/story-invites.ts's revokeStoryCollaborator)
//     — on success the row drops from local state directly (no re-fetch); on
//     failure the dialog stays open with an inline error, the row is never
//     silently dropped.

import { useEffect, useRef, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { useModalA11y } from './useModalA11y';
import type { Story } from './types';

export interface StoryAdminPanelProps {
  story: Story;
  onClose: () => void;
  /** Fired on blur, only when the trimmed description actually changed.
   *  The parent performs the real PATCH /api/stories/[id] call and updates
   *  its own `stories` state on success — see ChatHero.tsx's
   *  handleUpdateStoryDescription. */
  onDescriptionCommit: (description: string) => void;
}

interface RosterRow {
  memberId: string;
  name: string;
  joinedDate: string;
}

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export function StoryAdminPanel({ story, onClose, onDescriptionCommit }: StoryAdminPanelProps) {
  const [desc, setDesc] = useState(story.description ?? '');
  // Resets only when switching to a different story, not on every parent
  // re-render — matches the prototype reference's own `[story.id]` deps
  // exactly. A successful commit leaves `desc` already equal to the fresh
  // `story.description` that flows back down, so there's nothing to resync.
  useEffect(() => {
    setDesc(story.description ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [story.id]);

  const [collaborators, setCollaborators] = useState<RosterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/heirloom/story-invites?story_id=${encodeURIComponent(story.id)}`);
        if (!res.ok || cancelled) return;
        const data: {
          collaborators?: Array<{ memberId: string; name: string | null; email: string | null; joinedAt: string }>;
        } = await res.json();
        if (cancelled) return;
        setCollaborators(
          (data.collaborators ?? []).map((c) => ({
            memberId: c.memberId,
            name: c.name ?? c.email ?? 'Member',
            joinedDate: new Date(c.joinedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
          })),
        );
      } catch (err) {
        console.error('[StoryAdminPanel] collaborators fetch failed:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [story.id]);

  const commitDescription = () => {
    const trimmed = desc.trim();
    if (trimmed !== (story.description ?? '')) {
      onDescriptionCommit(trimmed);
    }
  };

  const [pendingRemove, setPendingRemove] = useState<{ memberId: string; name: string } | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useModalA11y(pendingRemove !== null, confirmRef, () => {
    if (!removing) {
      setPendingRemove(null);
      setRemoveError(null);
    }
  }, cancelRef);

  const handleRemove = async () => {
    if (!pendingRemove) return;
    setRemoving(true);
    setRemoveError(null);
    try {
      const res = await fetch('/api/heirloom/story-invites/collaborators', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story_id: story.id, member_id: pendingRemove.memberId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error((data?.error as string | undefined) || 'Could not remove collaborator');
      }
      setCollaborators((prev) => prev.filter((c) => c.memberId !== pendingRemove.memberId));
      setPendingRemove(null);
    } catch (err) {
      console.error('[StoryAdminPanel] remove failed:', err);
      setRemoveError(err instanceof Error ? err.message : 'Could not remove collaborator');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="relative flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="min-w-0">
          <h2 className="font-display text-[15px] text-text-primary truncate">
            Admin · {story.name}
          </h2>
          <p className="font-mono text-[10px] tracking-[0.16em] uppercase text-text-muted mt-0.5">
            Members &amp; description
          </p>
        </div>
        <button
          type="button"
          aria-label="Close admin panel"
          onClick={onClose}
          className="grid place-items-center w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-text-primary/10 transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <X size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mb-6">
          <label
            htmlFor="story-admin-description"
            className="block font-mono text-[10.5px] tracking-[0.18em] uppercase text-text-muted mb-2"
          >
            Description
          </label>
          <textarea
            id="story-admin-description"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={commitDescription}
            rows={3}
            placeholder="What is this story about?"
            className="w-full px-3 py-2.5 bg-background/60 border border-border rounded-xl font-body text-sm text-text-primary placeholder-text-muted resize-y focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-all"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between mb-3">
            <span className="font-mono text-[10.5px] tracking-[0.18em] uppercase text-text-muted">
              Members
            </span>
            <span className="font-mono text-[10.5px] text-text-muted">{collaborators.length}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-20 text-text-muted">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : collaborators.length === 0 ? (
            <p className="font-body text-sm italic text-text-muted">No members yet.</p>
          ) : (
            <div className="flex flex-col">
              {collaborators.map((c) => (
                <div
                  key={c.memberId}
                  className="flex items-center gap-3 py-2.5 border-b border-border last:border-b-0"
                >
                  <span className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/15 border border-accent/30 flex items-center justify-center font-mono text-[11px] font-semibold text-accent">
                    {initials(c.name)}
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col leading-tight">
                    <span className="font-body text-sm text-text-primary truncate">{c.name}</span>
                    <span className="font-mono text-[10.5px] text-text-muted">Joined {c.joinedDate}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingRemove({ memberId: c.memberId, name: c.name })}
                    className="flex-shrink-0 px-2 py-1.5 rounded-lg font-mono text-[10.5px] tracking-[0.02em] text-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {pendingRemove && (
        <div
          role="presentation"
          className="absolute inset-0 z-10 flex items-center justify-center p-5 bg-black/55 backdrop-blur-sm"
        >
          <div
            ref={confirmRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-label={`Remove ${pendingRemove.name} from this story?`}
            className="w-full max-w-[300px] bg-surface border border-border rounded-2xl shadow-2xl p-5 focus:outline-none"
          >
            <p className="font-body text-sm text-text-primary leading-relaxed">
              Remove <strong className="font-semibold">{pendingRemove.name}</strong> from this
              story? They&rsquo;ll lose access immediately.
            </p>
            {removeError && (
              <p role="alert" className="mt-3 font-body text-xs text-red-400">
                {removeError}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-5">
              <button
                ref={cancelRef}
                type="button"
                onClick={() => {
                  setPendingRemove(null);
                  setRemoveError(null);
                }}
                disabled={removing}
                className="px-3.5 py-2 rounded-xl border border-border bg-transparent font-body text-sm font-semibold text-text-primary hover:bg-text-primary/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRemove}
                disabled={removing}
                className="px-3.5 py-2 rounded-xl border-none bg-red-500 font-body text-sm font-semibold text-white hover:bg-red-600 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
