'use client';

import { ChatProvider } from './components/store/chatStore';
import { LandingPage } from './components/landing/LandingPage';

// App root for the Heirloom storefront. The chat slide-out panel + real chat
// wiring (and removal of the mock) land in Commit 3; for now this mounts the
// store so the landing CTAs can dispatch OPEN_CHAT.
export default function HeirloomPage() {
  return (
    <ChatProvider>
      <LandingPage />
    </ChatProvider>
  );
}
