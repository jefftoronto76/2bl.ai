// components/shells/membership/v2/useModalA11y.test.tsx
//
// Behavior contract for the shared V2 modal a11y hook:
//   1. Escape closes the modal AND is stopped in the capture phase, so an
//      outer window-level Escape handler (the chat panel's CLOSE_CHAT) never
//      sees the event.
//   2. Focus moves into the dialog on open (initialFocusRef when provided,
//      else the dialog container).
//   3. Focus returns to the previously-focused element on close.
//   4. Tab wraps last → first and Shift+Tab wraps first → last (focus trap).

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { useRef, useState } from 'react';
import { useModalA11y } from './useModalA11y';

function TestModal({
  open,
  onClose,
  useInitialFocus = false,
}: {
  open: boolean;
  onClose: () => void;
  useInitialFocus?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useModalA11y(open, dialogRef, onClose, useInitialFocus ? firstRef : undefined);
  if (!open) return null;
  return (
    <div ref={dialogRef} tabIndex={-1} role="dialog" aria-label="Test dialog">
      <button ref={firstRef} type="button" data-testid="first">
        First
      </button>
      <button type="button" data-testid="last">
        Last
      </button>
    </div>
  );
}

function Harness({ useInitialFocus = false }: { useInitialFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="opener" onClick={() => setOpen(true)}>
        Open
      </button>
      <TestModal open={open} onClose={() => setOpen(false)} useInitialFocus={useInitialFocus} />
    </div>
  );
}

afterEach(cleanup);

describe('useModalA11y', () => {
  it('closes on Escape and stops the event before outer window listeners', async () => {
    const outerEscapeSpy = vi.fn();
    // Simulates HeirloomApp's window-level Escape handler (bubble phase).
    const outerListener = (e: KeyboardEvent) => {
      if (e.key === 'Escape') outerEscapeSpy();
    };
    window.addEventListener('keydown', outerListener);

    const onClose = vi.fn();
    const { getByTestId } = render(<TestModal open onClose={onClose} />);

    fireEvent.keyDown(getByTestId('first'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerEscapeSpy).not.toHaveBeenCalled();

    window.removeEventListener('keydown', outerListener);
  });

  it('moves focus to the dialog container on open by default', async () => {
    const { getByTestId, getByRole } = render(<Harness />);
    fireEvent.click(getByTestId('opener'));
    await waitFor(() => expect(document.activeElement).toBe(getByRole('dialog')));
  });

  it('moves focus to initialFocusRef when provided', async () => {
    const { getByTestId } = render(<Harness useInitialFocus />);
    fireEvent.click(getByTestId('opener'));
    await waitFor(() => expect(document.activeElement).toBe(getByTestId('first')));
  });

  it('restores focus to the previously-focused element on close', async () => {
    const { getByTestId } = render(<Harness />);
    const opener = getByTestId('opener');
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(document.activeElement).not.toBe(opener));

    fireEvent.keyDown(getByTestId('first'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it('wraps Tab from the last focusable to the first', () => {
    const { getByTestId } = render(<TestModal open onClose={() => {}} />);
    const last = getByTestId('last');
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(getByTestId('first'));
  });

  it('wraps Shift+Tab from the first focusable to the last', () => {
    const { getByTestId } = render(<TestModal open onClose={() => {}} />);
    const first = getByTestId('first');
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(getByTestId('last'));
  });
});
