'use client';

/**
 * ScrollToLatestButton — not memory-specific, shipped in the same pass.
 *
 * Drop `useScrollAnchor` into whatever component owns the transcript's
 * scroll container; render the button as a sibling positioned over it.
 * `threshold` matches the prototype's 48px "close enough to bottom" band.
 */

import { useEffect, useRef, useState } from 'react';
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

  // Keep pinned to bottom on new content while already at the bottom — do NOT
  // force-scroll if the visitor has scrolled up to read history.
  useEffect(() => {
    if (atBottom) scrollToBottom();
  });

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
      aria-label="Scroll to latest"
      title="Scroll to latest"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-full border border-border bg-surface text-text-secondary shadow-lg transition-colors hover:border-border-strong hover:text-text-primary motion-safe:animate-[hl-modal-in_.18s_cubic-bezier(.22,1,.36,1)]"
    >
      <ChevronDown size={16} />
    </button>
  );
}

/**
 * Usage:
 *
 *   const { ref, atBottom, handleScroll, scrollToBottom } = useScrollAnchor();
 *   <div className="relative flex-1 min-h-0">
 *     <div ref={ref} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto">
 *       ...transcript...
 *     </div>
 *     <ScrollToLatestButton visible={!atBottom} onClick={scrollToBottom} />
 *   </div>
 */
