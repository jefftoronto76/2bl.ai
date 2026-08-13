'use client';

// components/shells/membership/v2/ConfirmDeleteModal.tsx
//
// Destructive-action guard for the sidebar kebab's Delete action.
// Owned by the parent (ChatHero) — the kebab delegates 'delete' upward;
// the parent intercepts it, opens this dialog, and only calls deleteSession
// on explicit confirmation. The modal itself performs no mutation.
//
// Matches the design spec: alertdialog role, Cancel auto-focused so a
// stray Enter cancels rather than destroys, scrim anchored to the drawer
// (absolute inset-0, resolves to ChatDrawerV2's relative body).

import { useRef } from 'react';
import { Trash2 } from 'lucide-react';
import { useModalA11y } from './useModalA11y';
import type { RowTarget } from './types';

// 'media' — added Stage 3 of media_stages_08_2026 (MediaCard's trash icon).
// Not part of the shared v2/types.ts RowTarget (SidebarV2's kebab never
// produces it, so extending that shared union would mean touching switches
// that will never see this value) — local to this modal's own prop type
// only.
type ConfirmDeleteTarget = RowTarget | 'media';

export interface ConfirmDeleteModalProps {
  /** The row to be deleted, or null when the dialog is closed.
   *  hasActiveInviteOrSubscribers (story only) adds one more warning
   *  sentence — reusable-story-invite-links, 2026-08-10 — a story with an
   *  active invite link or subscribers should warn before removing the
   *  access those people currently have. UI-only: no backend behavior
   *  changes based on this flag, deletion proceeds identically either way. */
  item: { target: ConfirmDeleteTarget; id: string; title?: string; hasActiveInviteOrSubscribers?: boolean } | null;
  onClose: () => void;
  onConfirm: () => void;
  /**
   * Override the target-derived default copy — added Stage 3 of
   * media_stages_08_2026 for media delete, which needs file-specific
   * wording ("Delete this file?" + filename in italics) the noun-based
   * defaults below don't produce, and can't honestly reuse the default
   * body's "permanently removed, can't be undone" claim — there is no
   * DELETE /api/media/[id] endpoint yet (see Known Gaps.md), so a media
   * delete only removes the item from local state; the copy must not
   * promise persistence it doesn't have. Omitted for every existing
   * chat/story/memory call site — their copy is byte-for-byte unchanged.
   */
  heading?: string;
  body?: React.ReactNode;
  confirmLabel?: string;
}

export function ConfirmDeleteModal({ item, onClose, onConfirm, heading, body, confirmLabel }: ConfirmDeleteModalProps) {
  const open = item !== null;
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Escape (capture-phase, stopPropagation), initial focus on Cancel,
  // Tab trap, focus restore on close.
  useModalA11y(open, dialogRef, onClose, cancelRef);

  if (!open) return null;

  const noun =
    item.target === 'story' ? 'story' : item.target === 'memory' ? 'memory' : item.target === 'media' ? 'file' : 'chat';
  const title = item.title;
  // Deleting a conversation or a story cascades to every memory anchored to
  // it — worth the extra warning line. Deleting a single memory doesn't
  // cascade to anything else, so it gets its own narrower copy instead of
  // reusing "and every memory it holds," which would be wrong here (a
  // memory doesn't hold other memories).
  const cascadeWarning = item.target === 'memory' ? '' : 'and every memory it holds ';
  // Extra sentence, story-only — the orphaned story_invite_links/
  // artifact_subscribers rows aren't cleaned up on delete (nothing
  // re-surfaces a discarded story, so there's nothing to clean up), but the
  // person clicking Delete should still know they're cutting others off.
  const grantWarning = item.target === 'story' && item.hasActiveInviteOrSubscribers
    ? ' This story has an active invite link and people with access to it — they will lose that access.'
    : '';

  return (
    // Scrim — anchored to the drawer's relative body (ChatDrawerV2 sets
    // position:relative on its body). Click-to-dismiss outside the panel.
    <div
      onClick={onClose}
      role="presentation"
      className="absolute inset-0 z-[85] flex items-center justify-center p-5 bg-black/55 backdrop-blur-[3px] hl-animate-fade"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={heading ?? `Delete ${noun}`}
        className="w-[min(418px,100%)] bg-surface border border-[rgba(245,239,230,0.20)] rounded-[20px] p-7 shadow-[0_40px_100px_-24px_rgba(0,0,0,.75),0_0_0_.5px_rgba(0,0,0,.4)] focus:outline-none hl-animate-modal"
      >
        {/* Danger badge */}
        <div className="w-[46px] h-[46px] rounded-[13px] bg-[#E58D80]/[0.14] border border-[#E58D80]/[0.34] flex items-center justify-center text-[#E58D80] mb-4">
          <Trash2 size={20} />
        </div>

        {/* Title */}
        <h4 className="font-display font-medium text-[25px] leading-[1.12] tracking-[-0.01em] text-text-primary m-0">
          {heading ?? `Delete this ${noun}?`}
        </h4>

        {/* Body */}
        <p className="font-body text-[14.5px] leading-[1.55] text-text-muted mt-[9px] mb-0">
          {body ??
            (title ? (
              <>
                <span className="font-display italic text-base text-text-primary">
                  &ldquo;{title}&rdquo;
                </span>{' '}
                {cascadeWarning}will be permanently removed. This can&rsquo;t be undone.{grantWarning}
              </>
            ) : (
              <>This {noun} {cascadeWarning}will be permanently removed. This can&rsquo;t be undone.{grantWarning}</>
            ))}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-[10px] mt-6">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="rounded-[11px] border border-[rgba(245,239,230,0.20)] bg-transparent px-[18px] py-[11px] font-body text-sm font-semibold text-text-primary hover:bg-text-primary/[0.06] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex items-center gap-2 rounded-[11px] bg-[#E58D80] border border-[#E58D80] px-5 py-[11px] font-body text-sm font-semibold text-white hover:bg-[#cc7d72] hover:border-[#cc7d72] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#E58D80]"
          >
            <Trash2 size={15} />
            {confirmLabel ?? 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}
