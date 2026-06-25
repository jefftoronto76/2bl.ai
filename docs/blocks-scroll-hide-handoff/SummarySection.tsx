'use client'

// SummarySection — NEW. Wraps the Blocks overview (donut + details) in a
// collapsible region with a "Hide summary" affordance. This is the `header`
// control variant from the approved prototype (Combined Admin · Blocks): the
// button sits top-right of the overview card; collapsing swaps the card for a
// compact recall bar that keeps status / active count / tokens in view. The
// hidden/shown state persists in localStorage so it survives navigation.
//
// Presentational + one bit of local state. Drop it around <BlocksOverview> in
// BlocksTable; the parent passes the summary stats for the recall bar. See the
// handover note for the BlocksTable wiring.

import { useEffect, useState, type ReactNode } from 'react'
import { IconChevronsDown, IconChevronsUp } from '@tabler/icons-react'
import styles from './BlocksLayout.module.css'

const STORAGE_KEY = 'blocks.summaryHidden'

export interface SummaryStats {
  status: string | null   // e.g. "Live" / "Draft" — shown raw, like BlocksOverview
  count: number           // active block count
  tokens: number          // summed tokens across active blocks
}

export function SummarySection({
  stats,
  children,
}: {
  stats: SummaryStats
  children: ReactNode
}) {
  // Start shown on the server; hydrate the persisted choice after mount so SSR
  // and first client paint agree (no hydration mismatch).
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
    setHidden(prev => {
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
        style={{ maxHeight: hidden ? 0 : 760 }}
        aria-hidden={hidden}
      >
        <div className={styles.summaryRel}>
          {children}
          <button
            type="button"
            className={styles.hideBtn}
            onClick={toggle}
            aria-expanded={!hidden}
          >
            <IconChevronsUp size={14} />
            Hide summary
          </button>
        </div>
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
          <span className={styles.recallShow}>
            <IconChevronsDown size={14} />
            Show summary
          </span>
        </button>
      )}
    </div>
  )
}
