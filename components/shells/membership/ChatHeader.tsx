'use client';

import { useCallback, useRef, useState } from 'react';
import { useAuthUser, useAuthActions } from '@/services/auth/client';
import {
  ChevronDown,
  CircleUser as UserCircle,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Settings,
  Share2,
  X,
} from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { useChatStore, setOAuthInProgress } from './chatStore';
import { heirloomClerkAppearance } from './clerkAppearance';
import { logAuthStep } from '@/services/auth/log-auth-step';

// Conversation switcher toggle — off by default (Design Handovers/ Aug 2026
// Atomic Updates/Updated Headers): the switcher is replaced by a static
// logo/wordmark when false. Flip back to true to restore it; the switcher's
// own code below is untouched, not deleted, so this is reversible.
const SHOW_STORY_SWITCHER = false;

function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export interface ChatHeaderProps {
  /** Drawer width state; the expand toggle renders only when the handler is
   *  provided (keeps the header usable outside the V2 drawer). */
  isFullScreen?: boolean;
  onToggleFullScreen?: () => void;
  /** When provided, renders a hamburger button (mobile-only via md:hidden)
   *  to the left of the title. Desktop passes undefined — no button rendered. */
  onMenuOpen?: () => void;
}

export function ChatHeader({ isFullScreen = false, onToggleFullScreen, onMenuOpen }: ChatHeaderProps) {
  const { state, dispatch, isAdmin, recentSessions, loadSession } = useChatStore();
  const { user, isSignedIn } = useAuthUser();
  const { signOut, openSignIn, openUserProfile } = useAuthActions();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // "Your Story ⌄" is the conversation switcher — its label reflects the
  // active conversation (falling back to "Your Story" for a brand new,
  // not-yet-saved one), and clicking it lists every Recent conversation so a
  // visitor can switch. On mobile this used to be the ONLY visible surface
  // for switching conversations (the docked SidebarV2 Memories list is
  // desktop-only / tucked behind the hamburger), but the button had no
  // onClick at all — clicking it looked like it did nothing.
  const [storyDropdownOpen, setStoryDropdownOpen] = useState(false);
  const storyDropdownRef = useRef<HTMLDivElement>(null);
  const activeSession = recentSessions.find((s) => s.id === state.sessionId);
  const storyLabel = activeSession?.title ?? 'Your Story';

  const handleStoryClick = useCallback(() => {
    setStoryDropdownOpen((prev) => !prev);
  }, []);

  const handleSelectConversation = useCallback(
    (id: string) => {
      setStoryDropdownOpen(false);
      loadSession(id);
    },
    [loadSession],
  );

  // Close dropdown on outside click.
  const handleStoryBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!storyDropdownRef.current?.contains(e.relatedTarget as Node)) {
      setStoryDropdownOpen(false);
    }
  }, []);

  const handleAccountClick = useCallback(() => {
    setDropdownOpen((prev) => !prev);
  }, []);

  const handleSignOut = useCallback(async () => {
    setDropdownOpen(false);
    await signOut();
  }, [signOut]);

  const handleManageAccount = useCallback(() => {
    setDropdownOpen(false);
    openUserProfile({ appearance: heirloomClerkAppearance });
  }, [openUserProfile]);

  const handleSignIn = useCallback(() => {
    setDropdownOpen(false);
    logAuthStep({
      event_type: 'sign_in',
      outcome: 'success',
      metadata: { auth_surface: 'prebuilt_modal', step: 'modal_opened', component: 'ChatHeader' },
    });
    setOAuthInProgress(true);
    openSignIn({ appearance: heirloomClerkAppearance });
  }, [openSignIn]);

  // Close dropdown on outside click.
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setDropdownOpen(false);
    }
  }, []);

  const initials = getInitials(user?.name ?? null);

  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
      {onMenuOpen && (
        <button
          type="button"
          aria-label="Open navigation"
          onClick={onMenuOpen}
          className="relative md:hidden grid place-items-center w-10 h-10 rounded-lg text-text-muted hover:bg-text-primary/10 hover:text-text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent mr-1 flex-shrink-0 before:absolute before:content-[''] before:inset-[-4px]"
        >
          <Menu size={18} />
        </button>
      )}
      {SHOW_STORY_SWITCHER ? (
        <div ref={storyDropdownRef} className="relative min-w-0 flex-1" onBlur={handleStoryBlur}>
          <button
            type="button"
            aria-label="Switch conversation"
            aria-expanded={storyDropdownOpen}
            onClick={handleStoryClick}
            className="flex items-center gap-1.5 min-w-0 max-w-full font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors"
          >
            <span className="truncate">{storyLabel}</span>
            <ChevronDown
              size={14}
              className={`text-text-muted flex-shrink-0 transition-transform ${storyDropdownOpen ? 'rotate-180' : ''}`}
            />
          </button>

          {storyDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-72 max-w-[85vw] rounded-xl bg-surface border border-border shadow-lg z-50 overflow-hidden">
              <div className="max-h-80 overflow-y-auto py-1.5">
                {recentSessions.length === 0 ? (
                  <p className="px-4 py-3 font-body text-sm italic text-text-muted">
                    No conversations yet
                  </p>
                ) : (
                  recentSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => handleSelectConversation(session.id)}
                      aria-current={state.sessionId === session.id ? 'true' : undefined}
                      className={`w-full text-left px-4 py-2.5 font-body text-sm truncate transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent ${
                        state.sessionId === session.id
                          ? 'bg-text-primary/10 text-text-primary'
                          : 'text-text-muted hover:bg-text-primary/5 hover:text-text-primary'
                      }`}
                    >
                      {session.title}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Static brand mark — same markup as LandingNav.tsx's logo (the
        // project's one definition of it), scaled down for this 48px
        // in-app header instead of LandingNav's 64px marketing bar.
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="w-6 h-6 rounded-lg bg-accent/20 border border-accent/40 flex items-center justify-center flex-shrink-0">
            <img
              src="/heirloom/favicons/icons/heirloom-feather-cream.svg"
              width={12}
              height={12}
              alt=""
              aria-hidden="true"
            />
          </div>
          <span className="font-display font-semibold text-base text-text-primary tracking-wide truncate">
            Legacy
          </span>
        </div>
      )}

      <div className="flex items-center gap-1 flex-shrink-0">
        {/* Icon cluster: gap-1 (4px) between all of Share/Fullscreen/Account/
            Close — half-gap (2px) horizontally on every button (uniform,
            not first/last-optimized, to stay correct regardless of which
            optional buttons render); vertical is open so it expands fully. */}
        {/* Share Heirloom — deliberately inert in this pass (decision: item
            visible, action stubbed; no share backend/modal mounted yet). */}
        <IconButton
          label="Share Heirloom"
          aria-disabled="true"
          className="relative before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
        >
          <Share2 size={16} />
        </IconButton>

        {onToggleFullScreen && (
          <IconButton
            label={isFullScreen ? 'Exit full screen' : 'Expand to full screen'}
            onClick={onToggleFullScreen}
            className="relative before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
          >
            {isFullScreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </IconButton>
        )}

        <div ref={dropdownRef} className="relative" onBlur={handleBlur}>
          <button
            type="button"
            aria-label="Account"
            aria-expanded={dropdownOpen}
            onClick={handleAccountClick}
            className="relative flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent text-text-muted hover:bg-text-primary/10 hover:text-text-primary before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
          >
            {isSignedIn && user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={user.name ?? 'Profile'}
                className="w-6 h-6 rounded-full object-cover"
              />
            ) : isSignedIn && initials ? (
              <span className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center text-[10px] font-semibold text-accent">
                {initials}
              </span>
            ) : (
              <UserCircle size={18} />
            )}
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 rounded-xl bg-surface border border-border shadow-lg z-50 overflow-hidden">
              {isSignedIn ? (
                <>
                  <div className="px-4 py-3 border-b border-border flex items-center gap-3">
                    {user?.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.imageUrl}
                        alt={user.name ?? 'Profile'}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : initials ? (
                      <span className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center text-xs font-semibold text-accent flex-shrink-0">
                        {initials}
                      </span>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
                        <UserCircle size={16} className="text-accent" />
                      </div>
                    )}
                    <div className="min-w-0">
                      {user?.name && (
                        <p className="text-text-primary text-sm font-body font-semibold truncate">
                          {user.name}
                        </p>
                      )}
                      {(user?.email ?? user?.phone) && (
                        <p className="text-text-muted text-xs font-body truncate">
                          {user?.email ?? user?.phone}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleManageAccount}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-body text-text-muted hover:text-text-primary hover:bg-text-primary/5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <Settings size={14} />
                    Manage account
                  </button>

                  {isAdmin && (
                    <a
                      href="/admin"
                      onClick={() => setDropdownOpen(false)}
                      className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-body text-text-muted hover:text-text-primary hover:bg-text-primary/5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                    >
                      <LayoutDashboard size={14} />
                      Admin
                    </a>
                  )}

                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-body text-text-muted hover:text-text-primary hover:bg-text-primary/5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <LogOut size={14} />
                    Sign out
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleSignIn}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-body text-text-muted hover:text-text-primary hover:bg-text-primary/5 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                >
                  <UserCircle size={14} />
                  Sign in
                </button>
              )}
            </div>
          )}
        </div>

        <IconButton
          label="Close"
          onClick={() => dispatch({ type: 'CLOSE_CHAT' })}
          className="relative before:absolute before:content-[''] before:-inset-y-1 before:-inset-x-[2px]"
        >
          <X size={18} />
        </IconButton>
      </div>
    </header>
  );
}
