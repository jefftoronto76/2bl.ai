'use client'

// CollapsibleSummary — generic collapse-to-recall-strip wrapper, extracted
// from app/admin/prompt-studio/blocks/SummarySection.tsx so Inbound Chats
// (and any future screen) can reuse the same hide/show + localStorage +
// recall-strip mechanics without depending on the Blocks screen's own file.

import { useEffect, useState, type ReactNode } from 'react'
import { Button, Group } from '@mantine/core'
import { IconChevronsDown, IconChevronsUp } from '@tabler/icons-react'
import styles from './CollapsibleSummary.module.css'

export interface CollapsibleSummaryProps {
  /** localStorage key persisting the hidden/shown state across reloads. */
  storageKey: string
  /** What's being hidden/shown — composes "Hide {label}" / "Show {label}" copy. */
  label: string
  /** Bold label at the start of the collapsed recall strip (e.g. "Prompt summary"). */
  recallLabel: string
  /**
   * Inline stats content for the collapsed recall strip. A plain ReactNode
   * rather than a fixed {label,value}[] shape — Blocks' recall needs a
   * colored live/draft dot, Inbound Chats needs plain counts, and a rigid
   * shape can't represent both without the caller fighting it.
   */
  recallStats: ReactNode
  /** Optional content rendered after recallStats, before "Show {label}" —
   *  e.g. Blocks' GuardrailMeter. */
  recallExtra?: ReactNode
  children: ReactNode
}

export function CollapsibleSummary({
  storageKey, label, recallLabel, recallStats, recallExtra, children,
}: CollapsibleSummaryProps) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(storageKey)
      if (v !== null) setHidden(v === '1')
    } catch {
      /* localStorage unavailable — stay shown */
    }
  }, [storageKey])

  function toggle() {
    setHidden((prev) => {
      const next = !prev
      try { localStorage.setItem(storageKey, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  return (
    <div className={styles.summarySection}>
      <div
        className={styles.summaryCollapse}
        style={{ maxHeight: hidden ? 0 : 900 }}
        aria-hidden={hidden}
      >
        <Group justify="flex-end" mb="sm">
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconChevronsUp size={14} />}
            onClick={toggle}
            aria-expanded={!hidden}
          >
            Hide {label}
          </Button>
        </Group>

        {children}
      </div>

      {hidden && (
        <button
          type="button"
          className={styles.recall}
          onClick={toggle}
          aria-label={`Show ${label}`}
        >
          <span className={styles.recallLabel}>{recallLabel}</span>
          <span className={styles.recallStats}>{recallStats}</span>
          {recallExtra}
          <span className={styles.recallShow}>
            <IconChevronsDown size={14} />
            Show {label}
          </span>
        </button>
      )}
    </div>
  )
}
