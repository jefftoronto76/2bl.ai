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
import { useRef, useState, type RefObject } from 'react';
import { useModalA11y } from './useModalA11y';

function TestModal({
  open,
  onClose,
  useInitialFocus = false,
  restoreFocusRef,
}: {
  open: boolean;
  onClose: () => void;
  useInitialFocus?: boolean;
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useModalA11y(open, dialogRef, onClose, useInitialFocus ? firstRef : undefined, restoreFocusRef);
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

  // Regression: a mobile nav button whose containing overlay unmounts the
  // instant it's clicked (e.g. ChatHero's mobile "Media" button, which
  // closes the sidebar sheet in the same state update that opens the modal).
  // By the time this hook's effect runs, `document.activeElement` has
  // already reverted to <body> — capturing it would restore focus nowhere.
  // restoreFocusRef lets the caller name a persistent target instead.
  function VanishingOpenerHarness() {
    const [open, setOpen] = useState(false);
    const [openerMounted, setOpenerMounted] = useState(true);
    const persistentRef = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button type="button" data-testid="persistent" ref={persistentRef}>
          Persistent
        </button>
        {openerMounted && (
          <button
            type="button"
            data-testid="vanishing-opener"
            onClick={() => {
              setOpen(true);
              setOpenerMounted(false);
            }}
          >
            Open (vanishes)
          </button>
        )}
        <TestModal open={open} onClose={() => setOpen(false)} restoreFocusRef={persistentRef} />
      </div>
    );
  }

  it('restores focus to restoreFocusRef when the real opener unmounts before the modal closes', async () => {
    const { getByTestId, queryByTestId } = render(<VanishingOpenerHarness />);
    const opener = getByTestId('vanishing-opener');
    opener.focus();
    fireEvent.click(opener);

    // The opener is gone — confirms this test actually exercises the race,
    // not just a same-tick focus check.
    await waitFor(() => expect(queryByTestId('vanishing-opener')).toBeNull());

    fireEvent.keyDown(getByTestId('first'), { key: 'Escape' });
    await waitFor(() => expect(document.activeElement).toBe(getByTestId('persistent')));
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
