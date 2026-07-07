// Shared types & constants for the Composer (Prompt Builder) screen.
// Lifted from the current app/admin/prompt-builder/page.tsx so the page and the
// extracted presentational components agree on shapes. Nothing here is new except
// the `Conversation` type (§3 of the handover) which the history drawer needs.

export type BlockType =
  | 'identity'
  | 'knowledge'
  | 'guardrail'
  | 'process'
  | 'output_format'

export interface Topic {
  id: string
  name: string
  type: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface DraftBlock {
  title: string
  content: string
  suggestedType?: BlockType
  suggestedTopic?: string
  warning?: string
}

export interface ExistingBlock {
  id: string
  title: string
  type: string
  body: string
  is_default: boolean
}

export interface DraftCardMeta {
  blockName: string
  type: BlockType | ''
  topicName: string
  isDefault: boolean
  saveError: string | null
  isSaving: boolean
  isChecking: boolean
  issues: CheckIssue[]
  warning: string | null
}

export interface CheckIssue {
  description: string
  offendingText: string | null
}

export interface CheckResult {
  ok: boolean
  issues: CheckIssue[]
}

// ── NEW (history drawer) ──────────────────────────────────────────────────────
// One row per saved conversation. The sidebar lists with {id,title,preview,
// updatedAt}; `messages` hydrate on open. See handover §3 for the persistence plan.
export interface Conversation {
  id: string
  title: string
  preview: string
  updatedAt: number
  draft?: boolean        // a fresh, unsent conversation — never persisted
  messages?: ChatMessage[]
}

// ── NEW (prompt-set picker) ───────────────────────────────────────────────────
// A prompt set is the collection of blocks that compiles into one deployed prompt.
// The Composer top bar lets you choose which set a saved block lands in (and make
// a new one). See handover §4.
export interface PromptSet {
  id: string
  label: string
  version: number
  // DB check-constraint is lowercase ('live' | 'draft').
  status: 'live' | 'draft'
}

export const TYPES: { value: BlockType; label: string }[] = [
  { value: 'identity', label: 'Identity & Voice' },
  { value: 'knowledge', label: 'Knowledge' },
  { value: 'guardrail', label: 'Guardrail' },
  { value: 'process', label: 'Process' },
  { value: 'output_format', label: 'Output Format' },
]

export const VALID_TYPES = new Set<string>(TYPES.map(t => t.value))

export const MAX_EXCHANGES = 10
export const WARN_THRESHOLD = 8

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Relative "40m / 5h / 2d" stamp for the conversation list.
const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000
export function relTime(ts: number, now = Date.now()): string {
  const d = now - ts
  if (d < HOUR) return Math.max(1, Math.round(d / MIN)) + 'm'
  if (d < DAY) return Math.round(d / HOUR) + 'h'
  return Math.round(d / DAY) + 'd'
}

// Bucket a conversation by recency for the drawer's grouped list.
export type ConversationGroup = 'Today' | 'This week' | 'Earlier'
export const CONVERSATION_GROUPS: ConversationGroup[] = ['Today', 'This week', 'Earlier']
export function groupFor(ts: number, now = Date.now()): ConversationGroup {
  const d = now - ts
  if (d < DAY) return 'Today'
  if (d < 7 * DAY) return 'This week'
  return 'Earlier'
}
