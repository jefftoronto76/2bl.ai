'use client'

/**
 * UploadRunningCard — the `running` state for an in-flight upload (photo,
 * video, audio, document — NOT `conversation`, which keeps using the
 * existing MemoryRunningPill/text flow unchanged).
 *
 * Same card chrome as MemoryCard's draft state (border-border, bg-surface,
 * rounded-2xl, matching shadow) so the running -> ready swap reads as one
 * card settling in place rather than a layout jump — that's the whole
 * design intent, don't let the two cards' widths/radii drift apart.
 *
 * KNOWN UNKNOWN: the "glow"/"hum"/"shimmer" animations below reference
 * Tailwind animate-* utility classes (animate-upload-glow, animate-upload-hum,
 * animate-upload-shimmer) that do NOT exist in tailwind.config.js yet — they
 * need their keyframes added there (breathing scale+opacity+blur for glow,
 * a tighter in-place pulse for hum, a background-position sweep for
 * shimmer). See the prototype's up-glow/up-hum/up-shimmer-bar CSS
 * (chat-widget-canvas.jsx) for exact timing/easing to port. Until those
 * keyframes exist this will render static (no animation), not crash.
 *
 * KNOWN UNKNOWN: ticker/progress are time-based (UPLOAD_TICKER, capped at
 * 92%) — there is no real upload-progress or analysis-complete event wired
 * in yet. Swap the interval below for a real progress subscription when
 * one exists; the component's job (render whatever step index it's given)
 * doesn't change.
 */

import { useEffect, useState } from 'react'
import { Feather, Image as ImageIcon, Video, Mic, FileText } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MemorySourceKind } from '@/services/chat/ui/v1/useMemories'
import { memoryKindOf } from './memoryKinds'
import { UPLOAD_TICKER } from './uploadCopy'

const KIND_ICONS: Record<string, LucideIcon> = {
  feather: Feather,
  image: ImageIcon,
  video: Video,
  mic: Mic,
  'file-text': FileText,
}

const RAIL = 'w-8 shrink-0'
const EYEBROW = 'font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted'

export interface UploadRunningCardProps {
  sourceKind: MemorySourceKind
}

export function UploadRunningCard({ sourceKind }: UploadRunningCardProps) {
  const kind = memoryKindOf(sourceKind)
  const Icon = KIND_ICONS[kind.icon] ?? Feather
  const steps = UPLOAD_TICKER[sourceKind] ?? UPLOAD_TICKER.conversation
  const [i, setI] = useState(0)

  useEffect(() => {
    setI(0)
    const id = setInterval(() => setI(v => (v < steps.length - 1 ? v + 1 : v)), 1300)
    return () => clearInterval(id)
  }, [steps])

  const progress = Math.round(((i + 1) / steps.length) * 92)
  const isFullMedia = kind.media === 'still' || kind.media === 'video'
  const isCompactMedia = kind.media === 'audio' || kind.media === 'page'

  return (
    <div className="flex gap-3">
      <span className={RAIL} />
      <div className="min-w-0 max-w-[520px] flex-1 overflow-hidden rounded-2xl border border-border bg-surface shadow-[0_18px_44px_-26px_rgba(0,0,0,0.45)]">
        <div className="flex items-center gap-2 border-b border-border px-4 py-[11px]">
          <Icon size={12} className="text-accent" aria-hidden />
          <span className={EYEBROW}>{kind.eyebrow}</span>
        </div>

        {isFullMedia && (
          <div
            className="relative flex items-center justify-center overflow-hidden border-b border-border bg-surface-2"
            style={{ aspectRatio: kind.media === 'video' ? '16 / 9' : '16 / 10' }}
          >
            <span aria-hidden className="motion-reduce:hidden absolute size-[130px] rounded-full bg-accent animate-upload-glow" />
            <span className="relative text-accent motion-reduce:animate-none animate-upload-hum">
              <Icon size={26} aria-hidden />
            </span>
          </div>
        )}

        {isCompactMedia && (
          <div className="flex items-center gap-3 border-b border-border bg-surface-2 px-[18px] py-[13px]">
            <span className="relative shrink-0 size-[34px]">
              <span aria-hidden className="motion-reduce:hidden absolute -inset-[9px] rounded-full bg-accent animate-upload-glow" />
              <span className="relative grid size-[34px] place-items-center rounded-full bg-accent-soft text-accent motion-reduce:animate-none animate-upload-hum">
                <Icon size={16} aria-hidden />
              </span>
            </span>
            <span className="flex-1 h-2.5 rounded-full bg-surface motion-reduce:animate-none animate-upload-shimmer" aria-hidden />
          </div>
        )}

        <div className="px-[18px] py-[15px] pb-4">
          <div className="relative h-[18px] overflow-hidden">
            <span key={i} className="absolute inset-0 font-body text-[13.5px] text-text-muted motion-reduce:animate-none animate-upload-ticker">
              {steps[i]}…
            </span>
          </div>
          <div className="mt-[11px] h-[3px] overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-[1150ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
