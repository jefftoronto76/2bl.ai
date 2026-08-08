'use client';

/**
 * ScrollToLatestButton — the floating "jump to newest message" nudge over
 * MessageList's transcript. Adapted from (not copied from)
 * ScrollToLatestButton.tsx in
 * Design Handovers/design_handoff_memory_canvas_08_2026/, which is explicitly
 * "not memory-specific."
 *
 * The reference hook also force-scrolled to bottom on every render while at
 * the bottom (a bare `useEffect(() => {...})`, no dependency array). That's
 * dropped here: components/chat/ChatThread.tsx already owns the transcript's
 * stay-pinned-to-bottom behavior — its own near-bottom tracking plus
 * scrollIntoView keyed to scrollDeps — so this hook only needs to track how
 * far the visitor has scrolled from the bottom (to drive the button's
 * visibility) and provide the button's own explicit scroll. Reusing
 * ChatThread's pin-to-bottom logic instead of transplanting a second,
 * dependency-less copy of it avoids two independent implementations of the
 * same job drifting apart — the same reasoning as memory-panel-layout Stage
 * E's single width-setting path for MemoryPanelDivider.
 */

import { useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function useScrollAnchor(threshold = 48) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < threshold);
  };

  const scrollToBottom = () => {
    ref.current?.scrollTo({ top: ref.current.scrollHeight, behavior: 'smooth' });
  };

  return { ref, atBottom, handleScroll, scrollToBottom };
}

export function ScrollToLatestButton({
  visible,
  onClick,
}: {
  visible: boolean;
  onClick: () => void;
}) {
  if (!visible) return null;
  return (
    <button
      type="button"
      aria-label="Scroll to latest"
      title="Scroll to latest"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-surface text-text-muted shadow-lg transition-colors hover:border-border/80 hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent motion-safe:animate-[hl-modal-in_.18s_cubic-bezier(.22,1,.36,1)]"
    >
      <ChevronDown size={16} />
    </button>
  );
}

/**
 * Usage (MessageList.tsx):
 *
 *   const { ref, atBottom, handleScroll, scrollToBottom } = useScrollAnchor();
 *   <div className="relative flex-1 min-h-0">
 *     <div ref={ref} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto">
 *       ...transcript...
 *     </div>
 *     <ScrollToLatestButton visible={!atBottom} onClick={scrollToBottom} />
 *   </div>
 */
