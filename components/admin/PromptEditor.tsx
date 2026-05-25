'use client'

import { useState } from 'react'

type Issue = { description: string; offendingText: string | null }
type CheckResult = { pass: boolean; issues: Issue[] }
type Status = 'idle' | 'checking' | 'saving' | 'saved' | 'error'

export type HistoryEntry = {
  id: string
  version: number
  content: string
  saved_at: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function PromptEditor({
  initialPrompt,
  initialVersion,
  initialHistory,
}: {
  initialPrompt: string
  initialVersion: number
  initialHistory: HistoryEntry[]
}) {
  const [prompt, setPrompt] = useState(initialPrompt)
  const [status, setStatus] = useState<Status>('idle')
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null)
  const [savedVersion, setSavedVersion] = useState(initialVersion)
  const [errorMsg, setErrorMsg] = useState('')
  const [history, setHistory] = useState<HistoryEntry[]>(initialHistory)

  const handleChange = (value: string) => {
    setPrompt(value)
    if (checkResult) setCheckResult(null)
    if (status === 'saved' || status === 'error') setStatus('idle')
  }

  const removeOffendingText = (offendingText: string) => {
    const cleaned = prompt
      .split(offendingText)
      .join('')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    handleChange(cleaned)
  }

  const runCheck = async () => {
    setStatus('checking')
    setCheckResult(null)
    setErrorMsg('')

    try {
      const res = await fetch('/api/admin/prompt/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      const result: CheckResult = await res.json()
      setCheckResult(result)

      if (result.pass) {
        await runSave(result)
      } else {
        setStatus('idle')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Safety check failed. Please try again.')
    }
  }

  const runSave = async (result: CheckResult | null) => {
    setStatus('saving')
    const prevPrompt = initialPrompt // capture before state changes

    try {
      const res = await fetch('/api/admin/prompt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, checkResult: result }),
      })
      const data = await res.json()

      if (data.version) {
        // Optimistically prepend the just-archived version to history
        if (savedVersion > 0) {
          const archivedEntry: HistoryEntry = {
            id: `local-${savedVersion}`,
            version: savedVersion,
            content: prevPrompt,
            saved_at: new Date().toISOString(),
          }
          setHistory((prev) => [archivedEntry, ...prev])
        }
        setSavedVersion(data.version)
        setStatus('saved')
        setCheckResult(null)
      } else {
        throw new Error(data.error || 'Save failed')
      }
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Save failed. Please try again.')
    }
  }

  const busy = status === 'checking' || status === 'saving'
  const showFailResult = checkResult && !checkResult.pass && status === 'idle'

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '32px' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(28px, 3vw, 40px)',
          fontWeight: 400,
          letterSpacing: '-0.02em',
          color: 'var(--color-text-primary)',
          marginBottom: '8px',
        }}>
          System Prompt
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--color-text-muted)' }}>
            The instructions Sage follows in every conversation.
          </p>
          {savedVersion > 0 && (
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: '10px',
              letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--color-text-dim)',
            }}>
              v{savedVersion}
            </span>
          )}
        </div>
      </div>

      <textarea
        value={prompt}
        onChange={(e) => handleChange(e.target.value)}
        disabled={busy}
        style={{
          width: '100%',
          minHeight: '400px',
          fontFamily: 'var(--font-mono)',
          fontSize: '13px',
          lineHeight: 1.7,
          color: 'var(--color-text-primary)',
          background: busy ? '#f5f4f1' : 'white',
          border: '1px solid var(--color-border)',
          borderRadius: '4px',
          padding: '20px',
          resize: 'vertical',
          outline: 'none',
          boxSizing: 'border-box',
          opacity: busy ? 0.7 : 1,
        }}
      />

      {/* Failed check — show issues */}
      {showFailResult && (
        <div style={{
          marginTop: '16px', padding: '16px 20px',
          background: 'white', border: '1px solid var(--color-border)', borderLeft: '3px solid #b45309',
        }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            letterSpacing: '0.18em', textTransform: 'uppercase', color: '#b45309', marginBottom: '10px',
          }}>
            Issues found
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {checkResult.issues.map((issue, i) => {
              const canRemove = !!issue.offendingText && prompt.includes(issue.offendingText)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--color-text-primary)', lineHeight: 1.6, margin: 0 }}>
                    {issue.description}
                  </p>
                  {canRemove && (
                    <button
                      onClick={() => removeOffendingText(issue.offendingText!)}
                      style={{
                        flexShrink: 0, background: 'transparent',
                        border: '1px solid rgba(180,83,9,0.4)', color: '#b45309',
                        fontFamily: 'var(--font-mono)', fontSize: '10px',
                        letterSpacing: '0.15em', textTransform: 'uppercase',
                        padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <p style={{ marginTop: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#b45309' }}>
          {errorMsg}
        </p>
      )}

      {/* Saved confirmation */}
      {status === 'saved' && (
        <p style={{ marginTop: '12px', fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#2d6a4f', letterSpacing: '0.05em' }}>
          ✓ Saved. Version {savedVersion}.
        </p>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: '20px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        <button
          onClick={runCheck}
          disabled={busy || !prompt.trim()}
          style={{
            background: '#2d6a4f', color: 'white', border: 'none',
            fontFamily: 'var(--font-mono)', fontSize: '11px',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '14px 28px',
            cursor: busy || !prompt.trim() ? 'not-allowed' : 'pointer',
            opacity: busy || !prompt.trim() ? 0.5 : 1,
          }}
        >
          {status === 'checking' ? 'Checking...' : status === 'saving' ? 'Saving...' : 'Check & Save'}
        </button>

        {showFailResult && (
          <button
            onClick={() => runSave(checkResult)}
            style={{
              background: 'transparent', color: '#b45309', border: '1px solid #b45309',
              fontFamily: 'var(--font-mono)', fontSize: '11px',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              padding: '14px 28px', cursor: 'pointer',
            }}
          >
            Save Anyway
          </button>
        )}
      </div>

      {/* Version history */}
      {history.length > 0 && (
        <div style={{ marginTop: '64px' }}>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: '10px',
            letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--color-text-dim)', marginBottom: '16px',
          }}>
            Version History
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {history.map((entry) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', background: 'white',
                  border: '1px solid var(--color-border)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: '12px',
                    color: 'var(--color-text-muted)', minWidth: '32px',
                  }}>
                    v{entry.version}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-text-dim)' }}>
                    {formatDate(entry.saved_at)}
                  </span>
                </div>
                <button
                  onClick={() => handleChange(entry.content)}
                  style={{
                    background: 'transparent', border: '1px solid var(--color-border)',
                    fontFamily: 'var(--font-mono)', fontSize: '10px',
                    letterSpacing: '0.15em', textTransform: 'uppercase',
                    color: 'var(--color-text-muted)', padding: '4px 12px', cursor: 'pointer',
                  }}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
