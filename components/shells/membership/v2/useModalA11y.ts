'use client';

// components/shells/membership/v2/useModalA11y.ts
//
// Shared a11y behavior for the V2 modals (BeginStory / InviteCollaborators /
// ShareHeirloom):
//
//   • Escape closes the modal — registered in the CAPTURE phase with
//     stopPropagation, so the chat panel's own window-level Escape handler
//     (HeirloomApp dispatches CLOSE_CHAT) never sees the event. One Escape
//     press closes one layer.
//   • Initial focus moves into the dialog on open (an explicit field via
//     `initialFocusRef`, else the dialog container — give it tabIndex={-1}).
//   • Focus returns to the previously-focused element on close.
//   • Tab / Shift+Tab wrap within the dialog (lightweight focus trap).

import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), ' +
  'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useModalA11y(
  open: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
  /**
   * Explicit focus-restoration target, overriding the default of "whatever
   * had focus when the modal opened." Needed when the opener itself doesn't
   * survive to close time — e.g. a mobile nav button whose containing
   * overlay unmounts in the same render that opens the modal, in which case
   * `document.activeElement` has already reverted to `body` by the time this
   * effect runs (removing a focused element from the DOM moves focus away
   * from it synchronously, before passive effects fire).
   */
  restoreFocusRef?: RefObject<HTMLElement | null>,
) {
  // Ref-mirror onClose so an unstable callback identity never re-runs the
  // effect mid-open (which would restore focus early and re-register listeners).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const previouslyFocused = restoreFocusRef?.current ?? (document.activeElement as HTMLElement | null);
    const target = initialFocusRef?.current ?? dialogRef.current;
    const raf = requestAnimationFrame(() => target?.focus());

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const els = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (els.length === 0) {
          e.preventDefault();
          return;
        }
        const first = els[0];
        const last = els[els.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || active === dialog)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (active && !dialog.contains(active)) {
          // Focus escaped the dialog (e.g. via pointer) — pull it back.
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.();
    };
    // dialogRef / initialFocusRef / restoreFocusRef are stable ref objects.
  }, [open, dialogRef, initialFocusRef, restoreFocusRef]);
}
