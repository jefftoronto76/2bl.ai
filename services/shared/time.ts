const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const WEEK = 7 * DAY
const MONTH = 28 * DAY
const YEAR = 365 * DAY

/**
 * Short-form relative timestamp ("Updated 2d ago", "Updated just now").
 * Caller composes the "Updated " prefix; this function returns only the
 * relative portion.
 *
 * Brackets:
 *   < 60s         → "just now"  (also covers future-dated input)
 *   < 60m         → "Nm ago"
 *   < 24h         → "Nh ago"
 *   < 7d          → "Nd ago"
 *   < 28d (~4w)   → "Nw ago"
 *   < 365d        → "Nmo ago"  (months treated as 28d for integer math)
 *   ≥ 365d        → "Ny ago"   (years treated as 365d, drift is one day)
 *
 * Empty / invalid input returns "" — caller decides whether to render
 * anything. Pure render-time computation; consumers do not interval-tick.
 *
 * Time zone: input is parsed as UTC (ISO 8601 with Z or explicit offset)
 * or a Date instance. Subtracting from `Date.now()` gives a timezone-
 * agnostic delta in ms.
 */
export function formatRelativeTime(input: string | Date | null | undefined): string {
  if (input === null || input === undefined || input === '') return ''
  const date = typeof input === 'string' ? new Date(input) : input
  const ms = date.getTime()
  if (Number.isNaN(ms)) return ''

  const delta = Date.now() - ms
  if (delta < MINUTE) return 'just now'
  if (delta < HOUR) return `${Math.floor(delta / MINUTE)}m ago`
  if (delta < DAY) return `${Math.floor(delta / HOUR)}h ago`
  if (delta < WEEK) return `${Math.floor(delta / DAY)}d ago`
  if (delta < MONTH) return `${Math.floor(delta / WEEK)}w ago`
  if (delta < YEAR) return `${Math.floor(delta / MONTH)}mo ago`
  return `${Math.floor(delta / YEAR)}y ago`
}
