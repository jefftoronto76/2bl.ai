// Sample data for the admin screens — typed port of the production-faithful design data.
//
// ⚠️ TODO: replace each export with the real query/server data. Every screen imports
// from here so it compiles and runs standalone; swap these for your Supabase/route
// reads and the shapes line up one-to-one (see types.ts).

import type {
  Asset, Block, ComposerHistoryEntry, PromptSet, SageParameter, SelectOption,
  Session, SyncStatus, Tenant, ThemeTokens, AppearanceChange, User,
} from './types'

/* ── selectable option lists ──────────────────────────────────────────────── */
export const TENANT_TYPES: SelectOption[] = [
  { value: 'platform', label: 'Platform' },
  { value: 'product', label: 'Product' },
  { value: 'business', label: 'Business' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'member', label: 'Member' },
]
export const PROMPT_SET_USAGE_TYPES: SelectOption[] = [
  { value: 'base', label: 'base' },
  { value: 'member', label: 'member' },
]
export const ROLE_OPTIONS: SelectOption[] = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
]
export const OPEN_AS_OPTIONS: SelectOption[] = [
  { value: 'new_tab', label: 'New Tab' },
  { value: 'popup', label: 'Inline' },
]
export const THEME_FONT_OPTIONS: SelectOption[] = [
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'DM Mono', label: 'DM Mono' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Libre Franklin', label: 'Libre Franklin' },
  { value: 'IBM Plex Serif', label: 'IBM Plex Serif' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
]

/* ── tenants (mirrors the Supabase `tenants` query) ───────────────────────── */
export const TENANTS: Tenant[] = [
  { id: 'sbl', parent_id: null, name: 'Second Brain Labs', slug: 'second-brain-labs', type: 'platform', domain: '2bl.ai' },
  { id: 'sage', parent_id: 'sbl', name: 'Sage', slug: 'sage', type: 'product', domain: 'sage.2bl.ai' },
  { id: 'acme', parent_id: 'sage', name: 'Acme Coaching', slug: 'acme-coaching', type: 'business', domain: 'acme.com' },
  { id: 'jane', parent_id: 'acme', name: 'Jane Doe', slug: 'jane-doe', type: 'member', domain: null },
  { id: 'riverside', parent_id: 'sage', name: 'Riverside Wellness', slug: 'riverside-wellness', type: 'business', domain: null },
  { id: 'heirloom', parent_id: 'sbl', name: 'Heirloom', slug: 'heirloom', type: 'product', domain: 'heirloom.2bl.ai' },
  { id: 'hugs', parent_id: 'sbl', name: 'HUGS', slug: 'hugs', type: 'product', domain: null },
  { id: 'ledger', parent_id: 'sbl', name: 'Ledger', slug: 'ledger', type: 'product', domain: null },
  { id: 'northwind', parent_id: null, name: 'Northwind Partners', slug: 'northwind', type: 'reseller', domain: 'northwind.io' },
  { id: 'summit', parent_id: 'northwind', name: 'Summit Realty', slug: 'summit-realty', type: 'business', domain: null },
]

/* ── prompt sets (per tenant) ─────────────────────────────────────────────── */
export const PROMPT_SETS: PromptSet[] = [
  { id: '7f3a9c2e-1b44-4e90-9a21-0c6d2f1e8a55', tenant_id: 'sbl', label: 'Platform Master', description: 'The cross-tenant master system prompt compiled into every product Composer.', status: 'live', is_master: true, usage_type: 'base', version: 7, created_at: '2025-11-02T09:14:00', updated_at: '2026-06-14T09:30:00', last_compiled_at: '2026-06-14T09:40:00', compiled_master_version: 7, block_count: 9 },
  { id: 'b21e7740-3c58-4f12-8d6a-5e9043ab12c7', tenant_id: 'sage', label: 'Sage Base', description: 'Default advisor persona, guardrails, and process for the Sage storefront assistant.', status: 'live', is_master: false, usage_type: 'base', version: 5, created_at: '2025-12-10T11:00:00', updated_at: '2026-06-12T10:00:00', last_compiled_at: '2026-06-13T08:30:00', compiled_master_version: 7, block_count: 7 },
  { id: 'c9d18a36-77b2-4a01-bf3e-2a7c6048e991', tenant_id: 'sage', label: 'Member Onboarding', description: 'Warmer, logged-in tone used for the first three member sessions.', status: 'live', is_master: false, usage_type: 'member', version: 3, created_at: '2026-01-22T15:40:00', updated_at: '2026-05-30T08:22:00', last_compiled_at: '2026-05-30T09:15:00', compiled_master_version: 6, block_count: 5 },
  { id: 'd4470f19-8e6c-43aa-9f10-71b5c2d3e004', tenant_id: 'sage', label: 'Tone experiment', description: 'Testing a more concise opening. Not yet promoted.', status: 'draft', is_master: false, usage_type: null, version: 1, created_at: '2026-06-09T13:05:00', updated_at: '2026-06-18T16:48:00', last_compiled_at: '2026-06-10T11:00:00', compiled_master_version: 6, block_count: 4 },
  { id: 'e8a2b561-09f4-4c77-8b3d-6042af19c7e2', tenant_id: 'acme', label: 'Acme Base', description: 'Coaching-specific persona and booking flow for Acme.', status: 'live', is_master: false, usage_type: 'base', version: 4, created_at: '2026-02-03T10:20:00', updated_at: '2026-06-11T11:10:00', last_compiled_at: '2026-06-09T10:00:00', compiled_master_version: 6, block_count: 6 },
  { id: 'f1c33d28-6a90-4e15-a7b8-92103c5e8d41', tenant_id: 'acme', label: 'Spring promo', description: 'Seasonal offer messaging — staged for review.', status: 'draft', is_master: false, usage_type: null, version: 2, created_at: '2026-05-18T09:00:00', updated_at: '2026-06-02T14:30:00', last_compiled_at: null, compiled_master_version: null, block_count: 3 },
  { id: 'a6b9e012-4d77-4831-9c0a-3e15b7402f88', tenant_id: 'heirloom', label: 'Heirloom Base', description: 'Storefront assistant for the Heirloom product line.', status: 'live', is_master: false, usage_type: 'base', version: 2, created_at: '2026-03-14T08:45:00', updated_at: '2026-06-05T12:12:00', last_compiled_at: '2026-06-05T13:30:00', compiled_master_version: 7, block_count: 4 },
]

/* ── members — one row per user, role/plan/status per membership ───────────── */
export const USERS: User[] = [
  { id: 'u01', name: 'Dana Whitfield', email: 'dana@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'owner', plan: 'team', status: 'active', joined: 'Jan 2025', lastActive: '12m ago' },
    { tenant: 'Heirloom', role: 'admin', plan: 'free', status: 'active', joined: 'Mar 2025', lastActive: '2d ago' },
  ] },
  { id: 'u02', name: 'Marcus Lee', email: 'marcus@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'member', plan: 'pro', status: 'active', joined: 'Jan 2025', lastActive: '2h ago' },
  ] },
  { id: 'u03', name: 'Priya Nair', email: 'priya@riverside.health', memberships: [
    { tenant: 'Riverside Wellness', role: 'admin', plan: 'pro', status: 'active', joined: 'Feb 2025', lastActive: '1d ago' },
    { tenant: 'Summit Realty', role: 'member', plan: 'free', status: 'active', joined: 'Apr 2025', lastActive: '6h ago' },
  ] },
  { id: 'u04', name: 'Tom Alvarez', email: 'tom@riverside.health', memberships: [
    { tenant: 'Riverside Wellness', role: 'member', plan: 'free', status: 'invited', joined: '—', lastActive: '—' },
  ] },
  { id: 'u05', name: 'Sarah Chen', email: 'sarah.chen@summit.re', memberships: [
    { tenant: 'Summit Realty', role: 'owner', plan: 'team', status: 'active', joined: 'Nov 2024', lastActive: '34m ago' },
    { tenant: 'Acme Coaching', role: 'member', plan: 'pro', status: 'active', joined: 'Jan 2025', lastActive: '5d ago' },
    { tenant: 'Heirloom', role: 'viewer', plan: 'free', status: 'active', joined: 'Feb 2025', lastActive: '12d ago' },
    { tenant: 'Ledger', role: 'member', plan: 'free', status: 'active', joined: 'Mar 2025', lastActive: '20d ago' },
  ] },
  { id: 'u06', name: 'Devon Brooks', email: 'devon@summit.re', memberships: [
    { tenant: 'Summit Realty', role: 'member', plan: 'pro', status: 'suspended', joined: 'Dec 2024', lastActive: '9d ago' },
  ] },
  { id: 'u07', name: 'Elena Rossi', email: 'elena@heirloom.app', memberships: [
    { tenant: 'Heirloom', role: 'admin', plan: 'free', status: 'active', joined: 'Mar 2025', lastActive: '5h ago' },
  ] },
  { id: 'u08', name: 'Jordan Park', email: 'jordan@hugs.community', memberships: [
    { tenant: 'HUGS', role: 'member', plan: 'free', status: 'invited', joined: '—', lastActive: '—' },
  ] },
  { id: 'u09', name: 'Aisha Khan', email: 'aisha@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'member', plan: 'pro', status: 'active', joined: 'Feb 2025', lastActive: '3d ago' },
  ] },
  { id: 'u10', name: 'Henry Osei', email: 'henry@ledger.fi', memberships: [
    { tenant: 'Ledger', role: 'owner', plan: 'team', status: 'active', joined: 'Oct 2024', lastActive: '1h ago' },
    { tenant: 'Sage', role: 'admin', plan: 'pro', status: 'active', joined: 'Dec 2024', lastActive: '4h ago' },
  ] },
  { id: 'u11', name: 'Bianca Moretti', email: 'bianca@summit.re', memberships: [
    { tenant: 'Summit Realty', role: 'member', plan: 'free', status: 'deleted', joined: 'Sep 2024', lastActive: '41d ago' },
  ] },
  { id: 'u12', name: 'Caleb Wright', email: 'caleb@riverside.health', memberships: [
    { tenant: 'Riverside Wellness', role: 'admin', plan: 'pro', status: 'active', joined: 'Apr 2025', lastActive: '22m ago' },
  ] },
  { id: 'u13', name: 'Naomi Feld', email: 'naomi@heirloom.app', memberships: [
    { tenant: 'Heirloom', role: 'member', plan: 'free', status: 'suspended', joined: 'Jan 2025', lastActive: '15d ago' },
  ] },
  { id: 'u14', name: 'Owen Drake', email: 'owen@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'admin', plan: 'team', status: 'deleted', joined: 'Aug 2024', lastActive: '63d ago' },
  ] },
]

/* ── inbound chats — Sage sessions ────────────────────────────────────────── */
export const INBOUND_CHATS: Session[] = [
  { id: 's01', visitor_name: 'Marina Vasquez', email: 'marina.v@gmail.com', msgs: 14, input_tokens: 8420, output_tokens: 3310, status: 'in_progress', updated_at: '2026-06-18T14:32:00' },
  { id: 's02', visitor_name: 'Derek Holloway', email: 'dholloway@northpine.co', msgs: 9, input_tokens: 5120, output_tokens: 2180, status: 'in_progress', updated_at: '2026-06-18T13:05:00' },
  { id: 's03', visitor_name: null, email: null, msgs: 3, input_tokens: 1240, output_tokens: 460, status: 'active', updated_at: '2026-06-18T11:48:00' },
  { id: 's04', visitor_name: 'Aileen Brooks', email: 'aileen@brooksrealty.ca', msgs: 21, input_tokens: 13900, output_tokens: 5870, status: 'active', updated_at: '2026-06-17T18:20:00' },
  { id: 's05', visitor_name: 'Sam Okafor', email: 'sam.okafor@gmail.com', msgs: 6, input_tokens: 3050, output_tokens: 1190, status: 'abandoned', updated_at: '2026-06-17T09:14:00' },
  { id: 's06', visitor_name: null, email: null, msgs: 2, input_tokens: 720, output_tokens: 240, status: 'abandoned', updated_at: '2026-06-16T22:03:00' },
  { id: 's07', visitor_name: 'Priya Raman', email: 'priya.raman@meridian.io', msgs: 11, input_tokens: 6680, output_tokens: 2940, status: 'in_progress', updated_at: '2026-06-16T16:41:00' },
  { id: 's08', visitor_name: 'Jordan Mtetwa', email: 'jordan.m@gmail.com', msgs: 8, input_tokens: 4310, output_tokens: 1760, status: 'active', updated_at: '2026-06-16T10:27:00' },
  { id: 's09', visitor_name: 'Lena Fischer', email: 'lena@fischer-co.de', msgs: 17, input_tokens: 10240, output_tokens: 4520, status: 'abandoned', updated_at: '2026-06-15T15:52:00' },
  { id: 's10', visitor_name: 'Tobias Reyna', email: 'treyna@gmail.com', msgs: 5, input_tokens: 2480, output_tokens: 980, status: 'in_progress', updated_at: '2026-06-15T08:36:00' },
]

/* ── blocks ───────────────────────────────────────────────────────────────── */
export const BLOCKS: Block[] = [
  { id: 'b1', title: 'Sage persona & voice', type: 'identity', status: 'active', order: 1, updated_at: '2026-06-12T10:00:00', author: 'Jeff Lougheed', body: 'You are Sage, the AI advisor for Natural Resource. You speak with warmth, candor, and brevity. You are a trusted thinking partner — never salesy, never robotic. Default to plain language. When a visitor is exploring, ask one good question rather than listing ten options.' },
  { id: 'b2', title: 'Never give financial or legal advice', type: 'guardrail', status: 'active', order: 1, updated_at: '2026-06-14T09:30:00', author: 'Jeff Lougheed', body: 'Do not provide specific financial, legal, tax, or medical advice. If asked, acknowledge the question, explain that Sage cannot advise on regulated matters, and offer to connect the visitor with Jeff for a proper conversation. Never speculate about returns, valuations, or guarantees.' },
  { id: 'b3', title: 'Company background', type: 'knowledge', status: 'active', order: 1, updated_at: '2026-06-10T14:20:00', author: 'Jeff Lougheed', body: 'Natural Resource is an independent advisory practice founded by Jeff Lougheed. We help founders and operators in resource-adjacent industries make clearer decisions about capital, partnerships, and growth. We are based in Toronto and work with a small number of clients at a time.' },
  { id: 'b4', title: 'Engagement model & pricing', type: 'knowledge', status: 'active', order: 2, updated_at: '2026-06-11T11:10:00', author: 'Jeff Lougheed', body: 'Engagements begin with a paid discovery sprint (2 weeks). Ongoing advisory is monthly retainer. We do not take equity-only deals. Exact pricing is shared on a call once scope is clear — never quote a number; route pricing questions to booking a discovery call.' },
  { id: 'b5', title: 'Qualify then book a call', type: 'process', status: 'active', order: 1, updated_at: '2026-06-13T16:45:00', author: 'Jeff Lougheed', body: 'When a visitor shows buying intent, ask two qualifying questions (what they are working on, and their timeline). If it is a fit, offer the booking link. If unclear, keep helping. Never push the booking link more than once per conversation.' },
  { id: 'b6', title: 'Escalate to a human', type: 'guardrail', status: 'active', order: 1, updated_at: '2026-06-09T08:05:00', author: 'Jeff Lougheed', body: 'If a visitor is frustrated, asks to speak with a person, or raises something sensitive (a dispute, a complaint, press), stop advising and offer to pass the conversation to Jeff directly. Collect their name, email, and a one-line summary.' },
  { id: 'b7', title: 'Off-limit topics', type: 'guardrail', status: 'active', order: 2, updated_at: '2026-06-08T12:00:00', author: 'Jeff Lougheed', body: 'Do not discuss other clients by name, internal pricing logic, partner commercial terms, or anything covered by an NDA. Politely decline and redirect.' },
  { id: 'b8', title: 'Sample case studies', type: 'knowledge', status: 'disabled', order: 3, updated_at: '2026-05-28T17:30:00', author: 'Jeff Lougheed', body: 'Draft summaries of three anonymized engagements. Currently disabled pending client sign-off on what can be shared publicly.' },
  { id: 'b9', title: 'Tone in difficult moments', type: 'identity', status: 'disabled', order: 2, updated_at: '2026-05-20T10:15:00', author: 'Jeff Lougheed', body: 'When a visitor is anxious or under pressure, slow down. Reflect back what you heard before responding. Brevity still wins, but warmth comes first.' },
]

/* ── composer history ─────────────────────────────────────────────────────── */
export const COMPOSER_HISTORY: ComposerHistoryEntry[] = [
  { id: 'h1', block: 'Sage persona & voice', created_at: '2026-06-12T10:00:00', exchanges: 6, status: 'completed' },
  { id: 'h2', block: 'Engagement model & pricing', created_at: '2026-06-11T11:10:00', exchanges: 4, status: 'completed' },
  { id: 'h3', block: 'Qualify then book a call', created_at: '2026-06-13T16:45:00', exchanges: 8, status: 'completed' },
  { id: 'h4', block: 'Off-limit topics', created_at: '2026-06-08T12:00:00', exchanges: 3, status: 'flagged' },
  { id: 'h5', block: 'Untitled draft', created_at: '2026-06-18T09:22:00', exchanges: 2, status: 'active' },
  { id: 'h6', block: 'Company background', created_at: '2026-06-10T14:20:00', exchanges: 5, status: 'completed' },
]

/* ── assets ───────────────────────────────────────────────────────────────── */
export const ASSETS: Asset[] = [
  { id: 'a1', name: 'Discovery sprint overview.pdf', raw_len: 8400, storage_path: 'assets/discovery.pdf', created_at: '2026-06-10T09:00:00' },
  { id: 'a2', name: 'Pricing & engagement FAQ.docx', raw_len: 5200, storage_path: 'assets/pricing-faq.docx', created_at: '2026-06-09T15:30:00' },
  { id: 'a3', name: 'Bio & background.txt', raw_len: 1800, storage_path: null, created_at: '2026-06-08T11:20:00' },
  { id: 'a4', name: 'Case study notes.pdf', raw_len: 12600, storage_path: 'assets/cases.pdf', created_at: '2026-05-28T17:00:00' },
  { id: 'a5', name: 'Off-limits checklist.txt', raw_len: 640, storage_path: null, created_at: '2026-05-20T10:10:00' },
]

/* ── sage parameters ──────────────────────────────────────────────────────── */
export const SAGE_PARAMETERS: SageParameter[] = [
  { id: 'p1', key: 'booking_link', label: 'Discovery call booking', description: 'Where Sage sends qualified visitors to book.', cta_label: 'Book a call', url: 'https://cal.com/jefflougheed/discovery', open_as: 'new_tab', embed_code: null },
  { id: 'p2', key: 'newsletter', label: 'Newsletter signup', description: 'Link offered when a visitor is not yet ready.', cta_label: 'Subscribe', url: 'https://naturalresource.co/notes', open_as: 'new_tab', embed_code: null },
  { id: 'p3', key: 'inline_booking', label: 'Inline scheduler', description: 'Embedded scheduler shown inside the chat.', cta_label: 'Pick a time', url: 'https://cal.com/jefflougheed', open_as: 'popup', embed_code: '<!-- Cal inline embed snippet -->' },
]

export const CHAT_THRESHOLDS = { in_progress: 300, active: 86400 }
export const INVITE_GATE_ENABLED = true

/* ── appearance / theme tokens ────────────────────────────────────────────── */
export const THEME_TOKENS: ThemeTokens = {
  background: '#f9f8f5', paper_effect: true, accent: '#2d6a4f', accent_buttons: true,
  lede: '#6b6a64', heading: '#1a1917', body: '#3a3935', font_primary: 'Playfair Display', font_secondary: 'DM Sans',
}
export const ADMIN_THEME_TOKENS: ThemeTokens = {
  background: '#ffffff', paper_effect: false, accent: '#2d6a4f', accent_buttons: true,
  lede: '#6b6a64', heading: '#1a1917', body: '#3a3935', font_primary: 'DM Sans', font_secondary: 'DM Sans',
}
export const APPEARANCE_HISTORY: AppearanceChange[] = [
  { id: 'a0', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Paper effect', kind: 'toggle', from: 'Off', to: 'On', at: '2026-06-19T10:04:00' },
  { id: 'a1', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Accent', kind: 'color', from: '#1c7ed6', to: '#2d6a4f', at: '2026-06-18T14:22:00' },
  { id: 'a2', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Apply accent to buttons', kind: 'toggle', from: 'Off', to: 'On', at: '2026-06-18T14:21:00' },
  { id: 'a3', actor: 'Mara Coombs', email: 'mara@naturalresource.co', field: 'Primary font', kind: 'font', from: 'Inter', to: 'Playfair Display', at: '2026-06-15T09:48:00' },
  { id: 'a4', actor: 'Mara Coombs', email: 'mara@naturalresource.co', field: 'Heading (H1)', kind: 'color', from: '#2b2a28', to: '#1a1917', at: '2026-06-15T09:45:00' },
  { id: 'a5', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Background', kind: 'color', from: '#ffffff', to: '#f9f8f5', at: '2026-06-09T16:30:00' },
  { id: 'a6', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Secondary font', kind: 'font', from: 'Georgia', to: 'DM Sans', at: '2026-06-02T11:05:00' },
]
export const ADMIN_APPEARANCE_HISTORY: AppearanceChange[] = [
  { id: 'b0', actor: 'Mara Coombs', email: 'mara@naturalresource.co', field: 'Accent', kind: 'color', from: '#1c7ed6', to: '#2d6a4f', at: '2026-06-17T13:10:00' },
  { id: 'b1', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Primary font', kind: 'font', from: 'Inter', to: 'DM Sans', at: '2026-06-11T08:20:00' },
]
export const STOREFRONT_SYNC: SyncStatus = {
  defaults_synced_at: '2026-06-23T21:47:00',
  branding_warnings: [
    { token: 'accent', message: 'Contrast 3.1:1 on the background — below the 4.5:1 AA minimum.' },
    { token: 'font_primary', message: '“Playfair Display” has no web license on file; fell back to a system serif.' },
    { token: 'heading', message: 'Resolves to the same value as Body copy — no visible hierarchy.' },
  ],
}
export const ADMIN_SYNC: SyncStatus = { defaults_synced_at: null, branding_warnings: null }

/* ── master/system prompt ─────────────────────────────────────────────────── */
export const MASTER_PROMPT_VERSION = 7
export const MASTER_PROMPT_UPDATED_AT = '2026-06-14T09:30:00'
export const MASTER_PROMPT_CONTENT = `# Guardrails

Do not provide specific financial, legal, tax, or medical advice. If asked, acknowledge the question, explain that Sage cannot advise on regulated matters, and offer to connect the visitor with Jeff for a proper conversation.

Do not discuss other clients by name, internal pricing logic, partner commercial terms, or anything covered by an NDA.

# Identity

You are Sage, the AI advisor for Natural Resource. You speak with warmth, candor, and brevity. You are a trusted thinking partner — never salesy, never robotic.

# Process

When a visitor shows buying intent, ask two qualifying questions (what they are working on, and their timeline). If it is a fit, offer the booking link.

# Knowledge

Natural Resource is an independent advisory practice founded by Jeff Lougheed. Engagements begin with a paid discovery sprint (2 weeks). Ongoing advisory is monthly retainer.

# Escalation

If a visitor is frustrated or asks to speak with a person, stop advising and offer to pass the conversation to Jeff directly.`

/* Existing active blocks the Composer references in its opening choices. */
export const COMPOSER_EXISTING = BLOCKS.filter((b) => b.status === 'active').map((b) => ({ title: b.title, type: b.type, body: b.body }))

/** Prompt sets the Blocks/Composer pickers offer (UI shape, separate from PromptSet rows). */
export interface ComposerPromptSet { value: string; label: string; version: number; status: 'Live' | 'Draft'; usage_type?: string | null; description?: string }
export const COMPOSER_PROMPT_SETS: ComposerPromptSet[] = [
  { value: 'sage-prod', label: 'Sage — Production', version: 7, status: 'Live' },
  { value: 'sage-staging', label: 'Sage — Staging', version: 8, status: 'Draft' },
  { value: 'discovery', label: 'Discovery Bot', version: 3, status: 'Live' },
]
