'use client';

import { useEffect } from 'react';
import { ChatProvider, useChatStore } from '@/components/shells/membership/chatStore';
import { LandingPage } from './components/landing/LandingPage';
import { ChatHero } from '@/components/shells/membership/ChatHero';

function HeirloomInner() {
  const { state, dispatch } = useChatStore();

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

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Heirloom chat"
        aria-hidden={!state.isChatOpen}
        className={`fixed top-0 right-0 h-full z-50 w-full max-w-2xl transform transition-transform duration-500 ease-in-out ${
          state.isChatOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        <ChatHero />
      </div>
    </div>
  );
}

interface HeirloomAppProps {
  gateEnabled: boolean;
  isAuthorized: boolean;
}

export default function HeirloomApp({ gateEnabled, isAuthorized }: HeirloomAppProps) {
  return (
    <ChatProvider gateEnabled={gateEnabled} isAuthorized={isAuthorized} enableExitWarning>
      <HeirloomInner />
    </ChatProvider>
  );
}
