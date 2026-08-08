'use client';

/**
 * MemoryPanelLayout — the three-pane shell only. No memory-card content lives here; pass whatever
 * you're rendering as `panelContent` and `chatContent` as plain children.
 *
 * Deliberately minimal so this is easy to drop in: it owns pane widths and the two curtains, and
 * nothing else. Wire `panelOpen`/`onOpenPanel`/`onClosePanel` to your own trigger (clicking a saved
 * memory card) and content (whatever that card renders) — this component doesn't know what a
 * memory is.
 */

import { useEffect, useRef, useState } from 'react';
import { Curtain, clampWidth } from './Curtain';

const RAIL_WIDTH = 60; // sidebar's collapsed, icon-only width while the panel is open
const MIN_CHAT_WIDTH = 380;
const MIN_PANEL_WIDTH = 320;
const DEFAULT_SIDEBAR_WIDTH = 264;
const MIN_SIDEBAR_WIDTH = 190;

export function MemoryPanelLayout({
  panelOpen,
  onClosePanel,
  sidebarContent,
  chatContent,
  panelContent,
}: {
  panelOpen: boolean;
  onClosePanel: () => void;
  sidebarContent: React.ReactNode;
  chatContent: React.ReactNode;
  panelContent: React.ReactNode;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [panelWidth, setPanelWidth] = useState(480);
  const wasOpenRef = useRef(false);

  // On open, seed the panel at ~55-60% of the space left after the rail — matches the "~40/60"
  // starting split (chat keeps the rest). Re-seeds every time the panel transitions closed->open,
  // so a manual resize from a PREVIOUS open doesn't carry over stale.
  useEffect(() => {
    if (panelOpen && !wasOpenRef.current) {
      const total = bodyRef.current?.clientWidth ?? window.innerWidth;
      setPanelWidth(clampWidth(Math.round(total * 0.55), MIN_PANEL_WIDTH, maxPanelWidth(total)));
    }
    wasOpenRef.current = panelOpen;
  }, [panelOpen]);

  function maxPanelWidth(total: number) {
    return Math.max(MIN_PANEL_WIDTH, total - RAIL_WIDTH - 9 - MIN_CHAT_WIDTH);
  }

  return (
    <div ref={bodyRef} className="relative flex h-full min-h-0">
      <div
        className="shrink-0 overflow-hidden transition-[width] duration-[400ms] ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ width: panelOpen ? RAIL_WIDTH : sidebarWidth }}
      >
        <div style={{ width: panelOpen ? RAIL_WIDTH : sidebarWidth, height: '100%' }}>{sidebarContent}</div>
      </div>

      {!panelOpen && (
        <Curtain
          label="Resize the menu"
          onStart={() => sidebarWidth}
          onReset={() => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH)}
          onMove={(base, delta) => {
            const v = base + delta;
            const total = bodyRef.current?.clientWidth ?? window.innerWidth;
            setSidebarWidth(v < 150 ? 53 : clampWidth(v, MIN_SIDEBAR_WIDTH, total - MIN_CHAT_WIDTH));
          }}
        />
      )}

      <div className="min-w-0 flex-1">{chatContent}</div>

      {panelOpen && (
        <Curtain
          label="Resize the memory panel"
          onStart={() => panelWidth}
          onReset={() => {
            const total = bodyRef.current?.clientWidth ?? window.innerWidth;
            setPanelWidth(clampWidth(Math.round(total * 0.55), MIN_PANEL_WIDTH, maxPanelWidth(total)));
          }}
          onMove={(base, delta) => {
            const total = bodyRef.current?.clientWidth ?? window.innerWidth;
            setPanelWidth(clampWidth(base - delta, MIN_PANEL_WIDTH, maxPanelWidth(total)));
          }}
        />
      )}

      <div
        className="shrink-0 overflow-hidden border-l border-border transition-[flex-basis] duration-[400ms] ease-[cubic-bezier(.22,1,.36,1)]"
        style={{ flexBasis: panelOpen ? panelWidth : 0, borderLeftWidth: panelOpen ? 1 : 0 }}
      >
        <div style={{ width: panelWidth, height: '100%' }}>{panelContent}</div>
      </div>
    </div>
  );
}

// onClosePanel is accepted above for API completeness but not called by this component itself —
// closing is triggered by whatever's inside panelContent (e.g. its own close button), which should
// call the onClosePanel your app passed down to it.
