'use client'

// Platform Settings — NEW route at app/platform/settings/page.tsx.
//
// One screen, one field for now: Master Prompt — a cross-tenant picker that marks
// one prompt set as the platform-wide master system prompt (the prompt that powers
// every tenant's Composer when Sage drafts blocks). The page is a thin settings
// shell built to grow as more platform settings land.
//
// This page is the ONLY stateful piece (handover §2):
//   - fetches every prompt set the platform admin can see, across tenants
//   - fetches the current master pointer
//   - holds the PENDING selection (defaults to the current master on load)
//   - owns the Save call — nothing auto-saves; `pending !== saved` drives Save
// MasterPromptPicker is presentational; see §3/§6.
//
// Backend touches (§6) — confirm exact endpoints at integration:
//   GET  /api/platform/prompt-sets            → MasterPromptOption[]   (cross-tenant superset)
//   GET  /api/platform/settings/master-prompt → MasterPromptSetting
//   PUT  /api/platform/settings/master-prompt { promptSetId } → MasterPromptSetting

import { useEffect, useMemo, useState } from 'react'
import { MasterPromptPicker } from '@/components/admin/platform-settings/MasterPromptPicker'
import { formatSetAt, type MasterPromptOption, type MasterPromptSetting } from '@/components/admin/platform-settings/types'
import styles from '@/components/admin/platform-settings/PlatformSettings.module.css'

export default function PlatformSettingsPage() {
  const [options, setOptions] = useState<MasterPromptOption[]>([])
  const [master, setMaster] = useState<MasterPromptSetting>({ promptSetId: null })
  const [pending, setPending] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ── Load: every prompt set across tenants + the current master pointer ─────────
  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [optsRes, masterRes] = await Promise.all([
          fetch('/api/platform/prompt-sets'),
          fetch('/api/platform/settings/master-prompt'),
        ])
        if (cancelled) return
        if (optsRes.ok) setOptions(await optsRes.json())
        if (masterRes.ok) {
          const m: MasterPromptSetting = await masterRes.json()
          setMaster(m)
          setPending(m.promptSetId)   // default the pending pick to the live master
        }
      } catch (err) {
        console.error('[PlatformSettings] load failed:', err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const isEmpty = !loading && options.length === 0
  const dirty = pending !== master.promptSetId
  const current = options.find(o => o.id === master.promptSetId) ?? null

  const stamp = useMemo(
    () => (master.setByName ? `Set by ${master.setByName}${master.setAt ? ` · ${formatSetAt(master.setAt)}` : ''}` : null),
    [master.setByName, master.setAt],
  )

  // ── Save — the only write on the page (§6). Confirm, not auto-save. ─────────────
  async function save() {
    if (!dirty || pending == null || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/platform/settings/master-prompt', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promptSetId: pending }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'Could not save. Try again.')
        return
      }
      const saved: MasterPromptSetting = await res.json()
      setMaster(saved)
      setPending(saved.promptSetId)
    } catch (err) {
      console.error('[PlatformSettings] save failed:', err)
      setError('Network error — could not reach the server.')
    } finally {
      setSaving(false)
    }
  }

  function cancel() { setPending(master.promptSetId); setError(null) }

  return (
    <div className={styles.page} data-screen-label="Platform · Settings">
      <header className={styles.header}>
        <h1 className={styles.title}>Settings</h1>
        <p className={styles.sub}>Platform-wide configuration.</p>
      </header>

      <section className={styles.card}>
        <div className={styles.fieldHead}>
          <h2 className={styles.fieldLabel}>Master Prompt</h2>
          <p className={styles.fieldHelp}>
            The system prompt that powers every tenant&rsquo;s Composer when building blocks.
            The set you mark here is compiled and sent as the master system prompt platform-wide.
          </p>
        </div>

        {isEmpty ? (
          // §7 — no prompt set exists on any tenant yet: no picker, no current line, no Save.
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No prompt sets yet.</p>
            <p className={styles.emptyBody}>
              Create a prompt set in any tenant&rsquo;s Composer, then return here to mark it as the platform master.
            </p>
          </div>
        ) : (
          <>
            <div className={styles.current}>
              {current ? (
                <>
                  <span className={styles.currentDot} aria-hidden />
                  <span className={styles.currentText}>
                    <span className={styles.currentMuted}>Current master</span>
                    <span className={styles.currentSep} aria-hidden>·</span>
                    <strong>{current.label}</strong>
                    <span className={styles.currentSep} aria-hidden>·</span>
                    <span className={styles.currentTenant}>{current.tenantName}</span>
                    <span className={`${styles.badge} ${current.status === 'Live' ? styles.live : styles.draft}`}>{current.status}</span>
                  </span>
                  {stamp && <span className={styles.currentStamp}>{stamp}</span>}
                </>
              ) : (
                <span className={styles.noMaster}>No master set yet</span>
              )}
            </div>

            <MasterPromptPicker
              options={options}
              selectedId={pending}
              masterId={master.promptSetId}
              onSelect={setPending}
              disabled={saving}
            />

            <div className={styles.saveRow}>
              <button type="button" className={styles.save} disabled={!dirty || pending == null || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </button>
              {dirty && !saving && <button type="button" className={styles.cancel} onClick={cancel}>Cancel</button>}
              {dirty && !saving && !error && <span className={styles.dirty}>Unsaved change</span>}
              {error && <span className={styles.error}>{error}</span>}
            </div>
          </>
        )}
      </section>
    </div>
  )
}
