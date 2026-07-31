'use client'

import type { ReactNode } from 'react'

/**
 * Self-contained icon button shared by every per-message action row
 * (MessageActions.tsx, UserMessageActions.tsx) — deliberately not
 * `@/components/shells/membership/ui/IconButton` (Heirloom-only; reusing it
 * here would cross the widget/membership shell isolation boundary). Uses the
 * same semantic tokens (text-text-muted / text-text-primary / accent) both
 * shells already define, so it renders identically on jefflougheed and
 * Heirloom routes.
 */
export function ActionIconButton({
  label,
  onClick,
  disabled,
  active,
  pressed,
  activeClassName,
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  active?: boolean
  /** Sets aria-pressed for toggle buttons (thumbs). Omit for non-toggle actions. */
  pressed?: boolean
  /** Overrides the default active-state text color (e.g. red for thumbs-down). */
  activeClassName?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      onClick={onClick}
      disabled={disabled}
      className={[
        'relative flex items-center justify-center w-6 h-6 rounded-md transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-30 disabled:cursor-not-allowed',
        // Invisible hit-area growth. The row gap was bumped gap-0.5 → gap-1.5
        // (2px → 6px) specifically to buy this room — 3px each on the shared
        // left/right sides is the midpoint of that gap, so adjacent buttons'
        // hit-zones meet exactly without overlapping. Still short of the
        // 44-48px guideline horizontally on its own, but combined with the
        // vertical expansion below it's a real improvement over the prior
        // 24x24-with-1px-sides target. Vertical is asymmetric on purpose: the
        // prose bubble sits ~4px above (mt-1) and may contain markdown links,
        // so top stays tight; the ~24px inter-message gap below is genuinely
        // open, so bottom expands more (24 + 4 + 12 = 40px tall).
        "before:absolute before:content-[''] before:-inset-x-[3px] before:top-[-4px] before:bottom-[-12px]",
        active ? activeClassName ?? 'text-accent' : 'text-text-muted hover:text-text-primary',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
