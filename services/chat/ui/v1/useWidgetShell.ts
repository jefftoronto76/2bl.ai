// services/chat/ui/v1/useWidgetShell.ts
//
// The widget-shell presentation store for the jefflougheed Sage surfaces — a
// headless, module-level Zustand singleton (no JSX). It owns only SHELL state
// (overlay open/close, question mode, composer ref); conversation state
// (messages, sessionId, streaming, error) lives in the shared session
// (useChatSession / ChatSessionProvider instanceKey="sage"), NOT here.
//
// Being a module singleton is load-bearing: the overlay (Chat), the inline Hero
// composer, and SectionProcess all read/write the SAME store object, so opening
// the overlay from one surface is observed by the others. This mirrors the
// session singleton's "multiple surfaces, one instance" guarantee.
//
// Extracted from src/lib/store.ts (useSageStore) in centralization Step E. The
// conversation slice had already migrated to useChatSession; this carries only
// the live shell fields. The five callerless fields (visitorName/setVisitorName,
// hasGreeted/setGreeted, focusComposer) and the callerless reset() were dropped.

import type { RefObject } from 'react'
import { create } from 'zustand'

interface WidgetShellStore {
  isExpanded: boolean
  mode: 'question' | null
  composerRef: RefObject<HTMLTextAreaElement | null> | null
  heroEngaged: boolean
  setMode: (mode: 'question' | null) => void
  setComposerRef: (ref: RefObject<HTMLTextAreaElement | null> | null) => void
  setHeroEngaged: (engaged: boolean) => void
  expand: (mode?: 'question') => void
  collapse: () => void
}

export const useWidgetShell = create<WidgetShellStore>((set) => ({
  isExpanded: false,
  mode: null,
  composerRef: null,
  heroEngaged: false,
  setMode: (mode) => set({ mode }),
  setComposerRef: (ref) => set({ composerRef: ref }),
  setHeroEngaged: (engaged) => set({ heroEngaged: engaged }),
  // Opens the full-viewport overlay (Chat.tsx). Called from the in-page #chat
  // CTA (expand()) and SectionProcess (expand('question')). Hero's inline
  // composer does NOT use expand() — it owns its own UI and writes to the
  // shared session directly. expand('question') sets isExpanded AND mode
  // together; Chat's mode-bridge mirrors mode into the session on open, so the
  // pairing is load-bearing — do not split it.
  expand: (mode) => set({ isExpanded: true, mode: mode ?? null }),
  collapse: () => set({ isExpanded: false }),
}))
