'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChatProvider, useChatStore } from '@/components/shells/membership/chatStore';
import { ChatDrawerV2 } from '@/components/shells/membership/v2/ChatDrawerV2';
import { LandingPage } from './components/landing/LandingPage';
import { ChatHero } from '@/components/shells/membership/ChatHero';

function HeirloomInner() {
  const { state, dispatch } = useChatStore();
  // Drawer width state (default ↔ full screen). Deliberately local — shell
  // chrome the reducer doesn't need to know about. Toggled from ChatHeader.
  const [isFullScreen, setIsFullScreen] = useState(false);
  const toggleFullScreen = useCallback(() => setIsFullScreen((v) => !v), []);

  // Escape closes the chat panel. The V2 modals and row menus register their
  // own capture-phase Escape handlers with stopPropagation, so when one of
  // them is open this handler never fires — one press closes one layer.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.isChatOpen) {
        dispatch({ type: 'CLOSE_CHAT' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.isChatOpen, dispatch]);

  return (
    <div className="relative overflow-hidden">
      <LandingPage />

      {state.isChatOpen && (
        <div
          aria-hidden="true"
          onClick={() => dispatch({ type: 'CLOSE_CHAT' })}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      {/* Headerless drawer — ChatHero renders the v1 ChatHeader (account
          dropdown + auth telemetry), which carries the fullscreen toggle. */}
      <ChatDrawerV2
        isOpen={state.isChatOpen}
        isFullScreen={isFullScreen}
        onToggleFullScreen={toggleFullScreen}
        onClose={() => dispatch({ type: 'CLOSE_CHAT' })}
        showHeader={false}
        title="Heirloom chat"
        defaultWidthClassName="w-full max-w-2xl"
      >
        <ChatHero isFullScreen={isFullScreen} onToggleFullScreen={toggleFullScreen} />
      </ChatDrawerV2>
    </div>
  );
}

interface HeirloomAppProps {
  gateEnabled: boolean;
  isAuthorized: boolean;
  isAdmin?: boolean;
  invitedName?: string | null;
  /** Email the admin set on the invite (members.email) — pre-fills
   *  MagicLinkCard's sign-up form when no [EMAIL:] marker has fired yet. */
  invitedEmail?: string | null;
  /** Phone the admin set on the invite (members.phone) — same pre-fill use
   *  as invitedEmail above. */
  invitedPhone?: string | null;
  hasInviteToken?: boolean;
  /** True when the ?invite= token exists in this tenant's members table
   *  (regardless of status/used_at/revoked_at) but didn't authorize this
   *  visitor — distinct from hasInviteToken, which is raw query-param
   *  presence with no server-side validation. Drives the chat-first
   *  "expired invite" gate bypass in chatStore.tsx. */
  tokenExistsButUnauthorized?: boolean;
  /** Raw invite token string — present only when the visitor was authorized via
   *  an unused token (not when already an active signed-in member). The
   *  ChatProvider calls /api/heirloom/invites/accept on the false→true
   *  isSignedIn transition to consume it. */
  inviteToken?: string;
  /** members.id for the invited member — present only for pre-auth invite holders.
   *  Passed through to /api/sage so getMemberContext can look up the member
   *  directly without needing chat_sessions.user_id. */
  memberId?: string;
  /** When true, the chat panel opens automatically on mount. Sourced from
   *  members.auto_open on the invite row. */
  autoOpenChat?: boolean;
  /** Raw story_invite_links token — present whenever the visitor arrived via
   *  a valid /join/[token] link, regardless of sign-in state (unlike
   *  inviteToken above). ChatProvider fires the accept call from either a
   *  sign-in transition or an already-signed-in mount check. */
  storyInviteToken?: string;
  /** Story title resolved from storyInviteToken's story_id — display-only
   *  data for chatStore.tsx's one-time contextual auto-greet. */
  storyInviteStoryTitle?: string | null;
  /** Display name of the member who created the story invite link — same
   *  auto-greet use as storyInviteStoryTitle above. */
  storyInviteInviterName?: string | null;
}

export default function HeirloomApp({
  gateEnabled,
  isAuthorized,
  isAdmin,
  invitedName,
  invitedEmail,
  invitedPhone,
  hasInviteToken,
  tokenExistsButUnauthorized,
  inviteToken,
  memberId,
  autoOpenChat,
  storyInviteToken,
  storyInviteStoryTitle,
  storyInviteInviterName,
}: HeirloomAppProps) {
  return (
    <ChatProvider
      gateEnabled={gateEnabled}
      isAuthorized={isAuthorized}
      isAdmin={isAdmin}
      invitedName={invitedName}
      invitedEmail={invitedEmail}
      invitedPhone={invitedPhone}
      hasInviteToken={hasInviteToken}
      tokenExistsButUnauthorized={tokenExistsButUnauthorized}
      inviteToken={inviteToken}
      memberId={memberId}
      autoOpenChat={autoOpenChat}
      storyInviteToken={storyInviteToken}
      storyInviteStoryTitle={storyInviteStoryTitle}
      storyInviteInviterName={storyInviteInviterName}
      enableExitWarning
    >
      <HeirloomInner />
    </ChatProvider>
  );
}
