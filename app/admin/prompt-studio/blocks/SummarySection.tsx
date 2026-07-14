'use client'

// SummarySection — Blocks-specific wrapper over the shared CollapsibleSummary.
// Owns only what's Blocks-specific: the live/draft status dot and the
// GuardrailMeter. Collapse mechanics, localStorage persistence, and the
// recall-strip shell live in components/admin/lib/CollapsibleSummary.

import type { ReactNode } from 'react'
import { GuardrailMeter } from '@/components/admin/content/GuardrailMeter'
import { CollapsibleSummary } from '@/components/admin/lib/CollapsibleSummary'
import sharedStyles from '@/components/admin/lib/CollapsibleSummary.module.css'
import styles from './BlocksLayout.module.css'

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
  const isLive = (stats.status ?? '').toLowerCase() === 'live'

  return (
    <CollapsibleSummary
      storageKey="blocks.summaryHidden"
      label="summary"
      recallLabel="Prompt summary"
      recallStats={
        <>
          <span className={sharedStyles.recallStat}>
            <span className={`${styles.dot} ${isLive ? styles.live : styles.draft}`} />
            {stats.status ?? '—'}
          </span>
          <span className={sharedStyles.recallStat}>
            <b>{stats.count}</b> active blocks
          </span>
          <span className={sharedStyles.recallStat}>
            <b>{stats.tokens.toLocaleString()}</b> tokens
          </span>
        </>
      }
      recallExtra={<GuardrailMeter count={stats.guardrailCount} showHint={false} />}
    >
      {children}
    </CollapsibleSummary>
  )
}
