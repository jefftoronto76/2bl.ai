import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatProvider } from './chatStore';
import { ChatHeader } from './ChatHeader';
import { __clearSingletonRegistry } from '@/services/chat/ui/v1/core/store-registry';

// Coverage for the profile/account dropdown's dismissal contract.
//
// The bug: the menu's only outside-close mechanism was an onBlur on its
// wrapper div, so it closed only when the trigger had actually held focus.
// Safari (desktop and iOS) does not focus a <button> on click/tap, and a
// tap on a non-focusable region moves focus nowhere — so nothing outside the
// menu closed it. Only an explicit action inside it did.
//
// These tests drive `pointerdown` (what the fix listens to) rather than
// `click`, because that is the event the outside-close path consumes; the
// in-menu action tests still go through `click`, which is what those buttons
// consume.

const signOut = vi.hoisted(() => vi.fn(async () => {}));
const openUserProfile = vi.hoisted(() => vi.fn());
const openSignIn = vi.hoisted(() => vi.fn());

vi.mock('@/services/auth/client', () => ({
  useAuthUser: () => ({
    isLoaded: true,
    isSignedIn: true,
    user: { providerUserId: 'u1', name: 'Ada Lovelace', email: 'ada@example.com' },
  }),
  useAuthActions: () => ({ signOut, openSignIn, openSignUp: vi.fn(), openUserProfile }),
}));

vi.mock('@/services/auth/supabase', () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock('@/services/auth/log-auth-step', () => ({ logAuthStep: vi.fn() }));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn(async (): Promise<Response> => jsonResponse({ sessions: [] }));

beforeEach(() => {
  fetchMock.mockClear();
  signOut.mockClear();
  openUserProfile.mockClear();
  openSignIn.mockClear();
  __clearSingletonRegistry();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Renders the header plus a sibling element that stands in for the rest of
 *  the page — the "outside" a visitor actually taps. */
function renderHeader() {
  return render(
    <ChatProvider>
      <div>
        <ChatHeader />
        <div data-testid="outside">chat transcript</div>
      </div>
    </ChatProvider>,
  );
}

function trigger() {
  return screen.getByRole('button', { name: 'Account' });
}

function openMenu() {
  fireEvent.click(trigger());
  expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
}

describe('ChatHeader profile dropdown — dismissal', () => {
  it('opens on trigger click', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');

    openMenu();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
  });

  it('closes when pointer goes down outside the dropdown', () => {
    renderHeader();
    openMenu();

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('stays open when pointer goes down inside the dropdown', () => {
    renderHeader();
    openMenu();

    // The identity block at the top of the menu — inside, but not an action.
    fireEvent.pointerDown(screen.getByText('ada@example.com'));

    expect(screen.getByRole('button', { name: /Sign out/ })).toBeTruthy();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderHeader();
    openMenu();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('still toggles closed when the trigger itself is clicked again', () => {
    renderHeader();
    openMenu();

    // A real pointer click fires pointerdown before click; the outside-close
    // listener must treat the trigger as inside so the two don't cancel out
    // (close-then-reopen would leave the menu stuck open).
    fireEvent.pointerDown(trigger());
    fireEvent.click(trigger());

    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });

  it('stops listening once closed', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');
    renderHeader();
    openMenu();
    expect(addSpy.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true);

    fireEvent.pointerDown(screen.getByTestId('outside'));

    expect(removeSpy.mock.calls.some(([type]) => type === 'pointerdown')).toBe(true);
  });
});

describe('ChatHeader profile dropdown — existing actions', () => {
  it('"Manage account" opens the profile modal and closes the menu', () => {
    renderHeader();
    openMenu();

    fireEvent.click(screen.getByRole('button', { name: /Manage account/ }));

    expect(openUserProfile).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Manage account/ })).toBeNull();
  });

  it('"Sign out" signs out and closes the menu', () => {
    renderHeader();
    openMenu();

    fireEvent.click(screen.getByRole('button', { name: /Sign out/ }));

    expect(signOut).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /Sign out/ })).toBeNull();
  });
});
