'use client';

import { useCallback, useRef, useState } from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { ChevronDown, CircleUser as UserCircle, LogOut, Settings, X } from 'lucide-react';
import { IconButton } from './ui/IconButton';
import { useChatStore } from './chatStore';
import { heirloomClerkAppearance } from './clerkAppearance';

function getInitials(fullName: string | null | undefined): string {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function ChatHeader() {
  const { dispatch } = useChatStore();
  const { user, isSignedIn } = useUser();
  const { signOut, openSignIn, openUserProfile } = useClerk();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    openSignIn({ appearance: heirloomClerkAppearance });
  }, [openSignIn]);

  // Close dropdown on outside click.
  const handleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setDropdownOpen(false);
    }
  }, []);

  const initials = getInitials(user?.fullName);

  return (
    <header className="flex items-center justify-between px-4 h-12 border-b border-border flex-shrink-0">
      <button
        type="button"
        className="flex items-center gap-1.5 font-body text-text-primary font-semibold text-base hover:bg-text-primary/10 rounded-lg px-2 py-1.5 transition-colors"
      >
        <span>Your Story</span>
        <ChevronDown size={14} className="text-text-muted" />
      </button>

      <div className="flex items-center gap-1">
        <div ref={dropdownRef} className="relative" onBlur={handleBlur}>
          <button
            type="button"
            aria-label="Account"
            aria-expanded={dropdownOpen}
            onClick={handleAccountClick}
            className="flex items-center justify-center w-10 h-10 rounded-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent text-text-muted hover:bg-text-primary/10 hover:text-text-primary"
          >
            {isSignedIn && user?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.imageUrl}
                alt={user.fullName ?? 'Profile'}
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
                        alt={user.fullName ?? 'Profile'}
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
                      {user?.fullName && (
                        <p className="text-text-primary text-sm font-body font-semibold truncate">
                          {user.fullName}
                        </p>
                      )}
                      {user?.primaryEmailAddress?.emailAddress && (
                        <p className="text-text-muted text-xs font-body truncate">
                          {user.primaryEmailAddress.emailAddress}
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

        <IconButton label="Close" onClick={() => dispatch({ type: 'CLOSE_CHAT' })}>
          <X size={18} />
        </IconButton>
      </div>
    </header>
  );
}
