'use client'

// Composer — NEW. The "Heirloom" composer card that replaces the current
// bordered Textarea box. Presentational only: input value, send, upload, loading,
// and the suggestion pills are all driven by page.tsx (which still owns the
// streaming/upload logic). See handover §5.
//
// Layout, top → bottom:
//   • Suggestion pills (fresh conversation only) — collapsible to a "✦ Suggestions"
//   • Input row — [+] upload menu · auto-grow textarea · send
//   • Upload row — Processing / Saved / error (states passed in from the page)
//   • Status meta footer — READY / DRAFTING… + keyboard hint

import { useRef, useState, useEffect, type ReactNode } from 'react'
import { Menu, ActionIcon } from '@mantine/core'
import {
  IconFile,
  IconBrandGoogleDrive,
  IconBrandDropbox,
  IconBox,
  IconScreenshot,
  IconCheck,
} from '@tabler/icons-react'
import styles from './Composer.module.css'

export interface ComposerPill {
  label: string
  disabled?: boolean
  onClick: () => void
}

interface ComposerProps {
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  onPickFile: () => void          // opens the hidden <input type=file> in the page
  loading: boolean
  atLimit: boolean
  /** null/empty hides the pill row (i.e. once the conversation is engaged) */
  pills?: ComposerPill[] | null
  /** upload status surface — pass the node the page already builds, or use flags */
  uploadStatus?: ReactNode
}

export function Composer({
  input,
  onInputChange,
  onSend,
  onPickFile,
  loading,
  atLimit,
  pills,
  uploadStatus,
}: ComposerProps) {
  const [focused, setFocused] = useState(false)
  const [pillsOpen, setPillsOpen] = useState(true)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const hasPills = !!pills && pills.length > 0

  // Auto-grow the textarea up to a cap.
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [input])

  return (
    <div className={`${styles.hc} ${focused ? styles.focus : ''}`}>
      {hasPills &&
        (pillsOpen ? (
          <div className={styles.chips}>
            {pills!.map(p => (
              <button
                key={p.label}
                type="button"
                className={styles.chip}
                disabled={p.disabled || atLimit}
                onClick={p.onClick}
                title={p.disabled ? 'Add some blocks first' : undefined}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              className={styles.chipsX}
              aria-label="Hide suggestions"
              title="Hide suggestions"
              onClick={() => setPillsOpen(false)}
            >
              <XIcon size={13} />
            </button>
          </div>
        ) : (
          <div className={`${styles.chips} ${styles.collapsed}`}>
            <button type="button" className={styles.suggest} onClick={() => setPillsOpen(true)}>
              <span className={styles.spark} aria-hidden>✦</span>
              Suggestions
              <span className={styles.count}>{pills!.length}</span>
            </button>
          </div>
        ))}

      <div className={styles.inputRow}>
        <Menu position="top-start" withinPortal shadow="md">
          <Menu.Target>
            <ActionIcon
              className={styles.tool}
              variant="subtle"
              color="gray"
              aria-label="Add content"
              disabled={atLimit}
            >
              <PlusIcon />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<IconFile size={16} />} onClick={onPickFile}>
              Add files
            </Menu.Item>
            <Menu.Item leftSection={<IconBrandGoogleDrive size={16} />} disabled>Google Drive</Menu.Item>
            <Menu.Item leftSection={<IconBrandDropbox size={16} />} disabled>Dropbox</Menu.Item>
            <Menu.Item leftSection={<IconBox size={16} />} disabled>Box</Menu.Item>
            <Menu.Item leftSection={<IconScreenshot size={16} />} disabled>Take a screenshot</Menu.Item>
          </Menu.Dropdown>
        </Menu>

        <textarea
          ref={taRef}
          className={styles.input}
          value={input}
          rows={1}
          placeholder={atLimit ? 'Exchange limit reached' : 'Type or paste content for a block…'}
          disabled={atLimit}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onChange={e => onInputChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
        />

        <button
          type="button"
          className={styles.send}
          aria-label="Send message"
          disabled={atLimit || loading || !input.trim()}
          onClick={onSend}
        >
          <SendIcon />
        </button>
      </div>

      {/* Upload status — Processing / Saved / error. The page passes the node so the
          existing upload state machine stays in one place. */}
      {uploadStatus}

      <div className={styles.foot}>
        <span className={`${styles.status} ${loading ? styles.thinking : ''}`}>
          <span className={styles.dot} aria-hidden />
          {loading ? 'Drafting…' : 'Ready'}
        </span>
        <span className={styles.kbd}>
          <kbd>↵</kbd> to send · <kbd>⇧↵</kbd> new line
        </span>
      </div>
    </div>
  )
}

// Convenience: the default "Saved to assets." confirmation row, if the page
// prefers to pass it in rather than build its own.
export function UploadSavedRow({ name, onClear }: { name: string; onClear: () => void }) {
  return (
    <div className={styles.upload}>
      <span className={styles.uploadOk}>
        <IconCheck size={12} /> Saved to assets.{name ? ` (${name})` : ''}
      </span>
      <button type="button" className={styles.uploadX} onClick={onClear} aria-label="Remove file">
        <XIcon size={12} />
      </button>
    </div>
  )
}

// ── Inline icons ──────────────────────────────────────────────────────────────
function PlusIcon() {
  return (
    <svg viewBox="0 0 16 16" width={18} height={18} fill="none" stroke="currentColor">
      <path d="M8 3v10M3 8h10" strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  )
}
function SendIcon() {
  return (
    <svg viewBox="0 0 16 16" width={17} height={17} fill="none" stroke="currentColor">
      <path d="M3 8h10M9 4l4 4-4 4" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
function XIcon({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}
