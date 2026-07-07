// Shared types + token maps + helpers for the admin screens.
//
// These mirror the production query shapes (Supabase rows, services/prompt/* outputs).
// If you already have equivalents, import yours and delete the duplicates here.

/* ── badge tint ─────────────────────────────────────────────────────────── */
export interface BadgeTint {
  bg: string
  fg: string
  /** solid swatch colour, used by block-type donut segments + filter dots */
  solid?: string
}

/* ── tenants ────────────────────────────────────────────────────────────── */
export type TenantType = 'platform' | 'product' | 'business' | 'reseller' | 'member'

export interface Tenant {
  id: string
  parent_id: string | null
  name: string
  slug: string | null
  type: TenantType | null
  domain: string | null
}

/* ── prompt sets ────────────────────────────────────────────────────────── */
export type PromptSetStatus = 'live' | 'draft'

export interface PromptSet {
  id: string
  tenant_id: string
  label: string
  description: string
  status: PromptSetStatus
  is_master: boolean
  usage_type: string | null
  version: number
  created_at: string
  updated_at: string
  last_compiled_at: string | null
  compiled_master_version: number | null
  block_count: number
}

/** Flattened option used by the System Prompt picker. */
export interface MasterPromptOption {
  id: string
  label: string
  tenantName: string
  status: string
  version: number
}

/* ── members ────────────────────────────────────────────────────────────── */
export type MemberStatus = 'active' | 'invited' | 'suspended' | 'deleted'
export type MemberPlan = 'free' | 'pro' | 'team'
export type MemberRole = 'owner' | 'admin' | 'member' | 'viewer'

export interface Membership {
  tenant: string
  role: MemberRole
  plan: MemberPlan
  status: MemberStatus
  joined: string
  lastActive: string
}

export interface User {
  id: string
  name: string
  email: string
  memberships: Membership[]
}

/* ── inbound chat sessions ──────────────────────────────────────────────── */
export type SessionStatus = 'in_progress' | 'active' | 'abandoned'

export interface Session {
  id: string
  visitor_name: string | null
  email: string | null
  msgs: number
  input_tokens: number
  output_tokens: number
  status: SessionStatus
  updated_at: string
}

/* ── prompt blocks ──────────────────────────────────────────────────────── */
export type BlockType = 'identity' | 'knowledge' | 'guardrail' | 'process' | 'output_format'
export type BlockStatus = 'active' | 'disabled'

export interface Block {
  id: string
  title: string
  type: BlockType
  status: BlockStatus
  order: number
  updated_at: string
  author: string
  body: string
}

/* ── composer history ───────────────────────────────────────────────────── */
export type HistoryStatus = 'completed' | 'active' | 'flagged'

export interface ComposerHistoryEntry {
  id: string
  block: string
  created_at: string
  exchanges: number
  status: HistoryStatus
}

/* ── assets ─────────────────────────────────────────────────────────────── */
export interface Asset {
  id: string
  name: string
  raw_len: number
  storage_path: string | null
  created_at: string
}

/* ── sage parameters ────────────────────────────────────────────────────── */
export type OpenAs = 'new_tab' | 'popup'

export interface SageParameter {
  id: string
  key: string
  label: string
  description: string
  cta_label: string
  url: string
  open_as: OpenAs
  embed_code: string | null
}

/* ── appearance / theme tokens ──────────────────────────────────────────── */
export interface ThemeTokens {
  background: string
  paper_effect: boolean
  accent: string
  accent_buttons: boolean
  lede: string
  heading: string
  body: string
  font_primary: string
  font_secondary: string
}

export type AppearanceChangeKind = 'color' | 'font' | 'toggle'

export interface AppearanceChange {
  id: string
  actor: string
  email: string
  field: string
  kind: AppearanceChangeKind
  from: string
  to: string
  at: string
}

export interface BrandingWarning {
  token: string
  message: string
}

export interface SyncStatus {
  defaults_synced_at: string | null
  branding_warnings: BrandingWarning[] | null
}

/* ── selectable option lists ────────────────────────────────────────────── */
export interface SelectOption {
  value: string
  label: string
}

/* ══════════════════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════════════════ */

/** services/prompt/tokenize.ts — ceil(chars / 4). */
export const tokensFor = (text: string): number => Math.ceil((text || '').length / 4)

export const statusLabel = (status: string): string =>
  status.toLowerCase() === 'live' ? 'Live' : 'Draft'

export const initials = (name: string): string => {
  const p = name.trim().split(/\s+/)
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase()
}

export const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

/** A prompt set is stale when its content changed after it was last compiled. */
export const psIsStale = (set: PromptSet): boolean =>
  !!(set && set.last_compiled_at && set.updated_at && set.updated_at > set.last_compiled_at)

/* ── date formatting ────────────────────────────────────────────────────── */
export const fmtDate = (iso?: string | null): string =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

export const fmtDateTime = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
