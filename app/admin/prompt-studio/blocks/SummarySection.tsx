'use client'

// SummarySection — collapsible summary wrapper.
//
// LAYOUT PARITY FIX: "Hide summary" now sits on its own right-aligned row ABOVE the
// summary card (design position), NOT absolutely pinned inside the card. The old
// `.hideBtn`/`.summaryRel` absolute treatment is gone; this uses a plain Group + Button
// matching the design source (Combined Admin · Blocks).

import { useEffect, useState, type ReactNode } from 'react'
import { Button, Group } from '@mantine/core'
import { IconChevronsDown, IconChevronsUp } from '@tabler/icons-react'
import { GuardrailMeter } from '@/components/admin/content/GuardrailMeter'
import styles from './BlocksLayout.module.css'

const STORAGE_KEY = 'blocks.summaryHidden'

export interface SummaryStats {
  status: string | null
  count: number
  tokens: number
  guardrailCount: number
}

export function SummarySection({
  stats,
  children,
}: {
  stats: SummaryStats
  children: ReactNode
}) {
  const [hidden, setHidden] = useState(false)
  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY)
      if (v !== null) setHidden(v === '1')
    } catch {
      /* localStorage unavailable — stay shown */
    }
  }, [])

  function toggle() {
    setHidden((prev) => {
      const next = !prev
      try { localStorage.setItem(STORAGE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  const isLive = (stats.status ?? '').toLowerCase() === 'live'

  return (
    <div className={styles.summarySection}>
      <div
        className={styles.summaryCollapse}
        style={{ maxHeight: hidden ? 0 : 900 }}
        aria-hidden={hidden}
      >
        {/* Hide summary — right-aligned, ABOVE the card (design position). */}
        <Group justify="flex-end" mb="sm">
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<IconChevronsUp size={14} />}
            onClick={toggle}
            aria-expanded={!hidden}
          >
            Hide summary
          </Button>
        </Group>

        {children}
      </div>

      {hidden && (
        <button
          type="button"
          className={styles.recall}
          onClick={toggle}
          aria-label="Show summary"
        >
          <span className={styles.recallLabel}>Prompt summary</span>
          <span className={styles.recallStats}>
            <span className={styles.recallStat}>
              <span className={`${styles.dot} ${isLive ? styles.live : styles.draft}`} />
              {stats.status ?? '—'}
            </span>
            <span className={styles.recallStat}>
              <b>{stats.count}</b> active blocks
            </span>
            <span className={styles.recallStat}>
              <b>{stats.tokens.toLocaleString()}</b> tokens
            </span>
          </span>
          <GuardrailMeter count={stats.guardrailCount} showHint={false} />
          <span className={styles.recallShow}>
            <IconChevronsDown size={14} />
            Show summary
          </span>
        </button>
      )}
    </div>
  )
}
