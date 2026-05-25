'use client';

import { useEffect } from 'react';
import { ChatProvider, useChatStore } from './components/store/chatStore';
import { LandingPage } from './components/landing/LandingPage';
import { ChatHero } from './components/chat/ChatHero';

// App root for the Heirloom storefront: the landing page with a slide-in chat
// panel layered over it. The panel is always mounted and slides off-canvas when
// closed; the backdrop only renders while open. Escape and a backdrop click
// both close the panel.
function HeirloomApp() {
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

export default function HeirloomPage() {
  return (
    <ChatProvider>
      <HeirloomApp />
    </ChatProvider>
  );
}
