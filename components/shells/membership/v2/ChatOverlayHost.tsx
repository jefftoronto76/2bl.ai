'use client';

// components/shells/membership/v2/ChatOverlayHost.tsx
//
// Exposes ChatDrawerV2's *relative body* DOM node to descendants so a deep
// child (e.g. ChatInput's full-screen voice surface) can portal an overlay
// into it and position with `absolute inset-0`.
//
// Why not `position: fixed`? ChatDrawerV2 animates its slide with a CSS
// `transform`, which makes it the containing block for `fixed` descendants —
// a fixed overlay gets trapped in the (off-screen-when-closed) drawer box.
// `absolute` scoped to this relative body is transform-safe AND drawer-relative.

import { createContext, useContext } from 'react';

const ChatOverlayHostContext = createContext<HTMLElement | null>(null);

export const ChatOverlayProvider = ChatOverlayHostContext.Provider;

export function useChatOverlayHost(): HTMLElement | null {
  return useContext(ChatOverlayHostContext);
}
