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
  invitedName?: string | null;
  hasInviteToken?: boolean;
  /** Raw invite token string — present only when the visitor was authorized via
   *  an unused token (not when already an active signed-in member). The
   *  ChatProvider calls /api/heirloom/invites/accept on the false→true
   *  isSignedIn transition to consume it. */
  inviteToken?: string;
}

export default function HeirloomApp({
  gateEnabled,
  isAuthorized,
  invitedName,
  hasInviteToken,
  inviteToken,
}: HeirloomAppProps) {
  return (
    <ChatProvider
      gateEnabled={gateEnabled}
      isAuthorized={isAuthorized}
      invitedName={invitedName}
      hasInviteToken={hasInviteToken}
      inviteToken={inviteToken}
      enableExitWarning
    >
      <HeirloomInner />
    </ChatProvider>
  );
}
