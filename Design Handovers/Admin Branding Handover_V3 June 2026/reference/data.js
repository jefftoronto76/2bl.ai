// Shared datasets for the Mantine admin screens — ESM port of tenant-admin/data.jsx.
// All values are verbatim from the production-faithful design data.

// Sample data + tokens for the production-faithful Platform admin.
// Mirrors the real Supabase `tenants` query: id, parent_id, name, slug, type, domain.

// Selectable tenant types — verbatim from NewTenantModal / EditTenantModal.
const TENANT_TYPES = [
  { value: 'platform', label: 'Platform' },
  { value: 'product',  label: 'Product' },
  { value: 'business', label: 'Business' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'member',   label: 'Member' },
];

// Verbatim from TenantList.tsx. NOTE the production quirk: only these four type
// strings get a color; product / reseller / member fall through to gray. We keep
// that behaviour faithfully rather than "fixing" it.
const TYPE_COLORS = {
  platform: 'grape',
  business: 'teal',
  agency:   'indigo',
  client:   'blue',
};

// Mantine light-variant badge colours (bg tint + text) for the palette above.
const BADGE_COLORS = {
  grape:  { bg: 'rgba(190,75,219,0.11)',  fg: '#9c36b5' },
  teal:   { bg: 'rgba(18,184,134,0.11)',  fg: '#099268' },
  indigo: { bg: 'rgba(66,99,235,0.11)',   fg: '#3b5bdb' },
  blue:   { bg: 'rgba(34,139,230,0.11)',  fg: '#1c7ed6' },
  gray:   { bg: 'rgba(73,80,87,0.09)',    fg: '#495057' },
};

function typeColor(type) {
  return (type && TYPE_COLORS[type]) || 'gray';
}

// Platform navigation — verbatim from PlatformSidebarNav.tsx.
const NAV_ITEMS = [
  { label: 'Tenants',  href: '/platform/admin' },
  { label: 'Products', href: '/platform/products' },
  { label: 'Members',  href: '/platform/members' },
  { label: 'Usage',    href: '/platform/usage' },
];

// Plausible SBL tenant tree (sorted by name within siblings, like the query).
const TENANTS = [
  { id: 'sbl',       parent_id: null,    name: 'Second Brain Labs', slug: 'second-brain-labs', type: 'platform', domain: '2bl.ai' },
  { id: 'sage',      parent_id: 'sbl',   name: 'Sage',              slug: 'sage',              type: 'product',  domain: 'sage.2bl.ai' },
  { id: 'acme',      parent_id: 'sage',  name: 'Acme Coaching',     slug: 'acme-coaching',     type: 'business', domain: 'acme.com' },
  { id: 'jane',      parent_id: 'acme',  name: 'Jane Doe',          slug: 'jane-doe',          type: 'member',   domain: null },
  { id: 'riverside', parent_id: 'sage',  name: 'Riverside Wellness',slug: 'riverside-wellness',type: 'business', domain: null },
  { id: 'heirloom',  parent_id: 'sbl',   name: 'Heirloom',          slug: 'heirloom',          type: 'product',  domain: 'heirloom.2bl.ai' },
  { id: 'hugs',      parent_id: 'sbl',   name: 'HUGS',              slug: 'hugs',              type: 'product',  domain: null },
  { id: 'ledger',    parent_id: 'sbl',   name: 'Ledger',            slug: 'ledger',            type: 'product',  domain: null },
  { id: 'northwind', parent_id: null,    name: 'Northwind Partners',slug: 'northwind',         type: 'reseller', domain: 'northwind.io' },
  { id: 'summit',    parent_id: 'northwind', name: 'Summit Realty', slug: 'summit-realty',     type: 'business', domain: null },
];



/* ── Prompt sets (per-tenant) ──────────────────────────────────────────
   A tenant owns 0..N prompt sets. Editable here: label, description, status
   (live/draft), and — when live — the usage type (where it's wired in). The
   is_master flag is set by the platform admin elsewhere and shown read-only.
   version is a compile artifact: it auto-increments each time the set is
   compiled, so it is read-only in this editor. id / tenant_id / created_at /
   updated_at are calculated (UUID + session + DB triggers). */

// Where a LIVE set is wired in. Open-ended — the editor can mint new types.
const PROMPT_SET_USAGE_TYPES = [
  { value: 'base',   label: 'base' },
  { value: 'member', label: 'member' },
];
// Light-variant tints per usage type; unknown/custom types fall back to gray.
const USAGE_BADGE = {
  base:   { bg: 'rgba(18,184,134,0.12)', fg: '#099268' },
  member: { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  _custom:{ bg: 'rgba(73,80,87,0.09)',   fg: '#495057' },
};
function usageBadge(type) { return USAGE_BADGE[type] || USAGE_BADGE._custom; }

// status badge tints (live = green, draft = amber) — mirrors the Blocks/Member palette.
const PS_STATUS_BADGE = {
  live:  { label: 'Live',  bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' },
  draft: { label: 'Draft', bg: 'rgba(245,159,0,0.14)', fg: '#e67700' },
};

const PROMPT_SETS = [
  // Second Brain Labs (platform) — holds the platform master.
  { id: '7f3a9c2e-1b44-4e90-9a21-0c6d2f1e8a55', tenant_id: 'sbl', label: 'Platform Master', description: 'The cross-tenant master system prompt compiled into every product Composer.', status: 'live', is_master: true, usage_type: 'base', version: 7, created_at: '2025-11-02T09:14:00', updated_at: '2026-06-14T09:30:00', last_compiled_at: '2026-06-14T09:40:00', compiled_master_version: 7, block_count: 9 },
  // Sage (product) — a base set + a member-facing set + a draft.
  { id: 'b21e7740-3c58-4f12-8d6a-5e9043ab12c7', tenant_id: 'sage', label: 'Sage Base', description: 'Default advisor persona, guardrails, and process for the Sage storefront assistant.', status: 'live', is_master: false, usage_type: 'base', version: 5, created_at: '2025-12-10T11:00:00', updated_at: '2026-06-12T10:00:00', last_compiled_at: '2026-06-13T08:30:00', compiled_master_version: 7, block_count: 7 },
  { id: 'c9d18a36-77b2-4a01-bf3e-2a7c6048e991', tenant_id: 'sage', label: 'Member Onboarding', description: 'Warmer, logged-in tone used for the first three member sessions.', status: 'live', is_master: false, usage_type: 'member', version: 3, created_at: '2026-01-22T15:40:00', updated_at: '2026-05-30T08:22:00', last_compiled_at: '2026-05-30T09:15:00', compiled_master_version: 6, block_count: 5 },
  { id: 'd4470f19-8e6c-43aa-9f10-71b5c2d3e004', tenant_id: 'sage', label: 'Tone experiment', description: 'Testing a more concise opening. Not yet promoted.', status: 'draft', is_master: false, usage_type: null, version: 1, created_at: '2026-06-09T13:05:00', updated_at: '2026-06-18T16:48:00', last_compiled_at: '2026-06-10T11:00:00', compiled_master_version: 6, block_count: 4 },
  // Acme Coaching (business) — a live base + a promo draft.
  { id: 'e8a2b561-09f4-4c77-8b3d-6042af19c7e2', tenant_id: 'acme', label: 'Acme Base', description: 'Coaching-specific persona and booking flow for Acme.', status: 'live', is_master: false, usage_type: 'base', version: 4, created_at: '2026-02-03T10:20:00', updated_at: '2026-06-11T11:10:00', last_compiled_at: '2026-06-09T10:00:00', compiled_master_version: 6, block_count: 6 },
  { id: 'f1c33d28-6a90-4e15-a7b8-92103c5e8d41', tenant_id: 'acme', label: 'Spring promo', description: 'Seasonal offer messaging — staged for review.', status: 'draft', is_master: false, usage_type: null, version: 2, created_at: '2026-05-18T09:00:00', updated_at: '2026-06-02T14:30:00', last_compiled_at: null, compiled_master_version: null, block_count: 3 },
  // Heirloom (product) — single base set.
  { id: 'a6b9e012-4d77-4831-9c0a-3e15b7402f88', tenant_id: 'heirloom', label: 'Heirloom Base', description: 'Storefront assistant for the Heirloom product line.', status: 'live', is_master: false, usage_type: 'base', version: 2, created_at: '2026-03-14T08:45:00', updated_at: '2026-06-05T12:12:00', last_compiled_at: '2026-06-05T13:30:00', compiled_master_version: 7, block_count: 4 },
  // Riverside, HUGS, Ledger, Northwind, Summit, Jane: none yet — exercise the empty/create flow.
];

// A set is stale when its content changed after it was last compiled.
function psIsStale(set) { return !!(set && set.last_compiled_at && set.updated_at && set.updated_at > set.last_compiled_at); }



/* ── Members ──────────────────────────────────────────────────────────
   Platform-wide member directory. Each member belongs to a tenant, holds a
   plan, and has a lifecycle status (active / invited / suspended / deleted). */

const PLAN_BADGE = {
  free: { label: 'Free', ...{ bg: 'rgba(73,80,87,0.09)',  fg: '#495057' } },
  pro:  { label: 'Pro',  ...{ bg: 'rgba(66,99,235,0.11)', fg: '#3b5bdb' } },
  team: { label: 'Team', ...{ bg: 'rgba(190,75,219,0.11)',fg: '#9c36b5' } },
};

const STATUS_BADGE = {
  active:    { label: 'Active',    bg: 'rgba(45,106,79,0.12)',  fg: '#2d6a4f' },
  invited:   { label: 'Invited',   bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  suspended: { label: 'Suspended', bg: 'rgba(232,89,12,0.12)',  fg: '#d9480f' },
  deleted:   { label: 'Deleted',   bg: 'rgba(73,80,87,0.10)',   fg: '#868e96' },
};

// Role is the member's permission level within a tenant — distinct from plan, and set
// per membership (a user can be Owner on one tenant and Viewer on another).
const ROLE_BADGE = {
  owner:  { label: 'Owner',  bg: 'rgba(217,119,6,0.13)',  fg: '#b45309' },
  admin:  { label: 'Admin',  bg: 'rgba(18,184,134,0.12)', fg: '#099268' },
  member: { label: 'Member', bg: 'rgba(73,80,87,0.09)',   fg: '#495057' },
  viewer: { label: 'Viewer', bg: 'rgba(104,112,118,0.10)',fg: '#5c636e' },
};
const ROLE_OPTIONS = [
  { value: 'owner',  label: 'Owner' },
  { value: 'admin',  label: 'Admin' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
];

// Neutral chip for tenant membership pills in the list view.
const PILL_STYLE = { bg: 'var(--gray-1)', fg: 'var(--gray-7)' };

const AVATAR_COLORS = [
  { bg: 'rgba(45,106,79,0.14)',  fg: '#2d6a4f' },
  { bg: 'rgba(34,139,230,0.14)', fg: '#1c7ed6' },
  { bg: 'rgba(190,75,219,0.14)', fg: '#9c36b5' },
  { bg: 'rgba(18,184,134,0.16)', fg: '#099268' },
  { bg: 'rgba(232,89,12,0.13)',  fg: '#d9480f' },
  { bg: 'rgba(66,99,235,0.14)',  fg: '#3b5bdb' },
];

function avatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
function initials(name) {
  const p = name.trim().split(/\s+/);
  return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase();
}

// One row per USER. A user holds one or more tenant memberships; role/plan/status/joined
// /lastActive are per membership. memberships[0] is treated as the primary for list columns.
const USERS = [
  { id: 'u01', name: 'Dana Whitfield', email: 'dana@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'owner', plan: 'team', status: 'active', joined: 'Jan 2025', lastActive: '12m ago' },
    { tenant: 'Heirloom',      role: 'admin', plan: 'free', status: 'active', joined: 'Mar 2025', lastActive: '2d ago' },
  ] },
  { id: 'u02', name: 'Marcus Lee', email: 'marcus@acme.com', memberships: [
    { tenant: 'Acme Coaching', role: 'member', plan: 'pro', status: 'active', joined: 'Jan 2025', lastActive: '2h ago' },
  ] },
  { id: 'u03', name: 'Priya Nair', email: 'priya@riverside.health', memberships: [
    { tenant: 'Riverside Wellness', role: 'admin',  plan: 'pro',  status: 'active', joined: 'Feb 2025', lastActive: '1d ago' },
    { tenant: 'Summit Realty',      role: 'member', plan: 'free', status: 'active', joined: 'Apr 2025', lastActive: '6h ago' },
  ] },
  { id: 'u04', name: 'Tom Alvarez', email: 'tom@riverside.health', memberships: [
    { tenant: 'Riverside Wellness', role: 'member', plan: 'free', status: 'invited', joined: '—', lastActive: '—' },
  ] },
  { id: 'u05', name: 'Sarah Chen', email: 'sarah.chen@summit.re', memberships: [
    { tenant: 'Summit Realty', role: 'owner',  plan: 'team', status: 'active', joined: 'Nov 2024', lastActive: '34m ago' },
    { tenant: 'Acme Coaching', role: 'member', plan: 'pro',  status: 'active', joined: 'Jan 2025', lastActive: '5d ago' },
    { tenant: 'Heirloom',      role: 'viewer', plan: 'free', status: 'active', joined: 'Feb 2025', lastActive: '12d ago' },
    { tenant: 'Ledger',        role: 'member', plan: 'free', status: 'active', joined: 'Mar 2025', lastActive: '20d ago' },
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
    { tenant: 'Sage',   role: 'admin', plan: 'pro',  status: 'active', joined: 'Dec 2024', lastActive: '4h ago' },
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
];



/* ════════════════════════════════════════════════════════════════════════
   TENANT ADMIN (jefflougheed.ca/admin) — datasets, verbatim-faithful to the
   Next.js source under app/admin/* and components/admin/*.
   ════════════════════════════════════════════════════════════════════════ */

// Wordmark — AdminShell renders the host-derived tenant name + "Admin" kicker.
const TENANT_NAME = 'Natural Resource';

// AdminSidebarNav.tsx — top group + Prompt Studio group.
const ADMIN_NAV = [
  { label: 'Inbound Chats', href: '/admin' },
  { label: 'Prompt',        href: '/admin/prompt' },
  { label: 'Settings',      href: '/admin/settings' },
  { label: 'Members',       href: '/admin/members' },
];
const PROMPT_STUDIO_ITEMS = [
  { label: 'Composer', href: '/admin/prompt-builder' },
  { label: 'Blocks',   href: '/admin/prompt-studio/blocks' },
  { label: 'History',  href: '/admin/prompt-studio/history' },
  { label: 'Assets',   href: '/admin/prompt-studio/assets' },
  { label: 'Prompt',   href: '/admin/prompt-studio/prompt' },
];

// Page titles for the mobile header.
const ADMIN_PAGE_TITLES = {
  '/admin': 'Inbound Chats',
  '/admin/prompt': 'System Prompt',
  '/admin/settings': 'Settings',
  '/admin/members': 'Members',
  '/admin/prompt-builder': 'Composer',
  '/admin/prompt-studio/blocks': 'Blocks',
  '/admin/prompt-studio/history': 'History',
  '/admin/prompt-studio/assets': 'Assets',
  '/admin/prompt-studio/prompt': 'Prompt',
};

// ── Token helper — services/prompt/tokenize.ts: ceil(chars / 4) ──
function tokensFor(text) { return Math.ceil((text || '').length / 4); }

// ── Inbound Chats — Sage sessions (app/admin/InboundChatsTable.tsx) ──
// derived_status ∈ in_progress | active | abandoned. Status badge colours
// from STATUS_COLORS: in_progress=green, active=yellow, abandoned=gray.
const SESSION_STATUS_BADGE = {
  in_progress: { label: 'in_progress', bg: 'rgba(45,106,79,0.12)',  fg: '#2d6a4f' },
  active:      { label: 'active',      bg: 'rgba(245,159,0,0.14)',  fg: '#e67700' },
  abandoned:   { label: 'abandoned',   bg: 'rgba(73,80,87,0.10)',   fg: '#868e96' },
};
const INBOUND_CHATS = [
  { id: 's01', visitor_name: 'Marina Vasquez', email: 'marina.v@gmail.com',  msgs: 14, input_tokens: 8420,  output_tokens: 3310, status: 'in_progress', updated_at: '2026-06-18T14:32:00' },
  { id: 's02', visitor_name: 'Derek Holloway',  email: 'dholloway@northpine.co', msgs: 9, input_tokens: 5120, output_tokens: 2180, status: 'in_progress', updated_at: '2026-06-18T13:05:00' },
  { id: 's03', visitor_name: null,              email: null,                  msgs: 3,  input_tokens: 1240,  output_tokens: 460,  status: 'active',      updated_at: '2026-06-18T11:48:00' },
  { id: 's04', visitor_name: 'Aileen Brooks',   email: 'aileen@brooksrealty.ca', msgs: 21, input_tokens: 13900, output_tokens: 5870, status: 'active',     updated_at: '2026-06-17T18:20:00' },
  { id: 's05', visitor_name: 'Sam Okafor',      email: 'sam.okafor@gmail.com', msgs: 6,  input_tokens: 3050,  output_tokens: 1190, status: 'abandoned',   updated_at: '2026-06-17T09:14:00' },
  { id: 's06', visitor_name: null,              email: null,                  msgs: 2,  input_tokens: 720,   output_tokens: 240,  status: 'abandoned',   updated_at: '2026-06-16T22:03:00' },
  { id: 's07', visitor_name: 'Priya Raman',     email: 'priya.raman@meridian.io', msgs: 11, input_tokens: 6680, output_tokens: 2940, status: 'in_progress', updated_at: '2026-06-16T16:41:00' },
  { id: 's08', visitor_name: 'Jordan Mtetwa',   email: 'jordan.m@gmail.com',  msgs: 8,  input_tokens: 4310,  output_tokens: 1760, status: 'active',      updated_at: '2026-06-16T10:27:00' },
  { id: 's09', visitor_name: 'Lena Fischer',    email: 'lena@fischer-co.de',  msgs: 17, input_tokens: 10240, output_tokens: 4520, status: 'abandoned',   updated_at: '2026-06-15T15:52:00' },
  { id: 's10', visitor_name: 'Tobias Reyna',    email: 'treyna@gmail.com',    msgs: 5,  input_tokens: 2480,  output_tokens: 980,  status: 'in_progress', updated_at: '2026-06-15T08:36:00' },
];

// ── Block types — services/prompt/block-types.ts (verbatim) ──
const BLOCK_TYPES = ['identity', 'knowledge', 'guardrail', 'process', 'escalation'];
const BLOCK_TYPE_COLORS = { identity: 'violet', knowledge: 'blue', guardrail: 'red', process: 'orange', escalation: 'yellow' };
const BLOCK_TYPE_LABELS = { identity: 'Identity', knowledge: 'Knowledge', guardrail: 'Guardrail', process: 'Process', escalation: 'Escalation' };
const BLOCK_TYPE_COMPILE_ORDER = { guardrail: 1, identity: 2, process: 3, knowledge: 4, escalation: 5 };
const ORDINAL_SUFFIX = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th' };
function formatTypeBadgeLabel(type) { return `${BLOCK_TYPE_LABELS[type].toUpperCase()} (${ORDINAL_SUFFIX[BLOCK_TYPE_COMPILE_ORDER[type]]})`; }
const ORDERED_BLOCK_TYPES = [...BLOCK_TYPES].sort((a, b) => BLOCK_TYPE_COMPILE_ORDER[a] - BLOCK_TYPE_COMPILE_ORDER[b]);

// Mantine light-variant badge tints for block-type colours.
const BLOCK_BADGE = {
  violet: { bg: 'rgba(121,80,242,0.11)', fg: '#6741d9', solid: '#7950f2' },
  blue:   { bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6', solid: '#228be6' },
  red:    { bg: 'rgba(250,82,82,0.12)',  fg: '#e03131', solid: '#fa5252' },
  orange: { bg: 'rgba(253,126,20,0.13)', fg: '#e8590c', solid: '#fd7e14' },
  yellow: { bg: 'rgba(245,159,0,0.15)',  fg: '#e67700', solid: '#f59f00' },
  green:  { bg: 'rgba(45,106,79,0.12)',  fg: '#2d6a4f', solid: '#2d6a4f' },
  gray:   { bg: 'rgba(73,80,87,0.09)',   fg: '#495057', solid: '#adb5bd' },
};

// ── Blocks (app/admin/prompt-studio/blocks) ──
const BLOCKS = [
  { id: 'b1', title: 'Sage persona & voice', type: 'identity', status: 'active', order: 1, updated_at: '2026-06-12T10:00:00', author: 'Jeff Lougheed',
    body: 'You are Sage, the AI advisor for Natural Resource. You speak with warmth, candor, and brevity. You are a trusted thinking partner — never salesy, never robotic. Default to plain language. When a visitor is exploring, ask one good question rather than listing ten options.' },
  { id: 'b2', title: 'Never give financial or legal advice', type: 'guardrail', status: 'active', order: 1, updated_at: '2026-06-14T09:30:00', author: 'Jeff Lougheed',
    body: 'Do not provide specific financial, legal, tax, or medical advice. If asked, acknowledge the question, explain that Sage cannot advise on regulated matters, and offer to connect the visitor with Jeff for a proper conversation. Never speculate about returns, valuations, or guarantees.' },
  { id: 'b3', title: 'Company background', type: 'knowledge', status: 'active', order: 1, updated_at: '2026-06-10T14:20:00', author: 'Jeff Lougheed',
    body: 'Natural Resource is an independent advisory practice founded by Jeff Lougheed. We help founders and operators in resource-adjacent industries make clearer decisions about capital, partnerships, and growth. We are based in Toronto and work with a small number of clients at a time.' },
  { id: 'b4', title: 'Engagement model & pricing', type: 'knowledge', status: 'active', order: 2, updated_at: '2026-06-11T11:10:00', author: 'Jeff Lougheed',
    body: 'Engagements begin with a paid discovery sprint (2 weeks). Ongoing advisory is monthly retainer. We do not take equity-only deals. Exact pricing is shared on a call once scope is clear — never quote a number; route pricing questions to booking a discovery call.' },
  { id: 'b5', title: 'Qualify then book a call', type: 'process', status: 'active', order: 1, updated_at: '2026-06-13T16:45:00', author: 'Jeff Lougheed',
    body: 'When a visitor shows buying intent, ask two qualifying questions (what they are working on, and their timeline). If it is a fit, offer the booking link. If unclear, keep helping. Never push the booking link more than once per conversation.' },
  { id: 'b6', title: 'Escalate to a human', type: 'escalation', status: 'active', order: 1, updated_at: '2026-06-09T08:05:00', author: 'Jeff Lougheed',
    body: 'If a visitor is frustrated, asks to speak with a person, or raises something sensitive (a dispute, a complaint, press), stop advising and offer to pass the conversation to Jeff directly. Collect their name, email, and a one-line summary.' },
  { id: 'b7', title: 'Off-limit topics', type: 'guardrail', status: 'active', order: 2, updated_at: '2026-06-08T12:00:00', author: 'Jeff Lougheed',
    body: 'Do not discuss other clients by name, internal pricing logic, partner commercial terms, or anything covered by an NDA. Politely decline and redirect.' },
  { id: 'b8', title: 'Sample case studies', type: 'knowledge', status: 'disabled', order: 3, updated_at: '2026-05-28T17:30:00', author: 'Jeff Lougheed',
    body: 'Draft summaries of three anonymized engagements. Currently disabled pending client sign-off on what can be shared publicly.' },
  { id: 'b9', title: 'Tone in difficult moments', type: 'identity', status: 'disabled', order: 2, updated_at: '2026-05-20T10:15:00', author: 'Jeff Lougheed',
    body: 'When a visitor is anxious or under pressure, slow down. Reflect back what you heard before responding. Brevity still wins, but warmth comes first.' },
];

// ── Composer history (app/admin/prompt-studio/history) ──
const HISTORY_STATUS_BADGE = {
  completed: { label: 'completed', bg: 'rgba(45,106,79,0.12)', fg: '#2d6a4f' },
  active:    { label: 'active',    bg: 'rgba(34,139,230,0.11)', fg: '#1c7ed6' },
  flagged:   { label: 'flagged',   bg: 'rgba(245,159,0,0.14)', fg: '#e67700' },
};
const COMPOSER_HISTORY = [
  { id: 'h1', block: 'Sage persona & voice',      created_at: '2026-06-12T10:00:00', exchanges: 6, status: 'completed' },
  { id: 'h2', block: 'Engagement model & pricing', created_at: '2026-06-11T11:10:00', exchanges: 4, status: 'completed' },
  { id: 'h3', block: 'Qualify then book a call',   created_at: '2026-06-13T16:45:00', exchanges: 8, status: 'completed' },
  { id: 'h4', block: 'Off-limit topics',           created_at: '2026-06-08T12:00:00', exchanges: 3, status: 'flagged' },
  { id: 'h5', block: 'Untitled draft',             created_at: '2026-06-18T09:22:00', exchanges: 2, status: 'active' },
  { id: 'h6', block: 'Company background',          created_at: '2026-06-10T14:20:00', exchanges: 5, status: 'completed' },
];

// ── Assets (app/admin/prompt-studio/assets) ──
const ASSETS = [
  { id: 'a1', name: 'Discovery sprint overview.pdf', raw_len: 8400, storage_path: 'assets/discovery.pdf', created_at: '2026-06-10T09:00:00' },
  { id: 'a2', name: 'Pricing & engagement FAQ.docx', raw_len: 5200, storage_path: 'assets/pricing-faq.docx', created_at: '2026-06-09T15:30:00' },
  { id: 'a3', name: 'Bio & background.txt',          raw_len: 1800, storage_path: null,                     created_at: '2026-06-08T11:20:00' },
  { id: 'a4', name: 'Case study notes.pdf',          raw_len: 12600, storage_path: 'assets/cases.pdf',     created_at: '2026-05-28T17:00:00' },
  { id: 'a5', name: 'Off-limits checklist.txt',      raw_len: 640,  storage_path: null,                    created_at: '2026-05-20T10:10:00' },
];

// ── Sage Parameters (app/admin/settings/SageParameters.tsx) ──
const SAGE_PARAMETERS = [
  { id: 'p1', key: 'booking_link', label: 'Discovery call booking', description: 'Where Sage sends qualified visitors to book.', cta_label: 'Book a call', url: 'https://cal.com/jefflougheed/discovery', open_as: 'new_tab', embed_code: null },
  { id: 'p2', key: 'newsletter',   label: 'Newsletter signup',      description: 'Link offered when a visitor is not yet ready.', cta_label: 'Subscribe', url: 'https://naturalresource.co/notes', open_as: 'new_tab', embed_code: null },
  { id: 'p3', key: 'inline_booking', label: 'Inline scheduler',     description: 'Embedded scheduler shown inside the chat.', cta_label: 'Pick a time', url: 'https://cal.com/jefflougheed', open_as: 'popup', embed_code: '<!-- Cal inline embed snippet -->' },
];
const OPEN_AS_OPTIONS = [ { value: 'new_tab', label: 'New Tab' }, { value: 'popup', label: 'Inline' } ];

// Chat thresholds defaults (app/admin/settings/ChatThresholds.tsx).
const CHAT_THRESHOLDS = { in_progress: 300, active: 86400 };
const INVITE_GATE_ENABLED = true;

// ── Website theme tokens (app/admin/settings/Appearance.tsx) ──
// Live values bound to the public chat site's Tailwind theme.
const THEME_TOKENS = {
  background: '#f9f8f5',
  paper_effect: true,     // when on, surfaces/borders derive a warm "paper" depth from background; off = flat
  accent: '#2d6a4f',
  accent_buttons: true,   // when on, the accent paints primary buttons
  lede: '#6b6a64',
  heading: '#1a1917',
  body: '#3a3935',
  font_primary: 'Playfair Display',
  font_secondary: 'DM Sans',
};
const THEME_FONT_OPTIONS = [
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'DM Mono', label: 'DM Mono' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Inter', label: 'Inter' },
  { value: 'Libre Franklin', label: 'Libre Franklin' },
  { value: 'IBM Plex Serif', label: 'IBM Plex Serif' },
  { value: 'Space Grotesk', label: 'Space Grotesk' },
];

// ── Appearance change log (app/admin/settings/Appearance.tsx — audit trail) ──
// Each entry is a single field change: who, when, and the before/after value.
// kind drives how the diff renders: 'color' → swatches, 'font'/'toggle' → text.
const APPEARANCE_HISTORY = [
  { id: 'a0', actor: 'Jeff Lougheed',  email: 'jeff@naturalresource.co', field: 'Paper effect',             kind: 'toggle', from: 'Off',               to: 'On',               at: '2026-06-19T10:04:00' },
  { id: 'a1', actor: 'Jeff Lougheed',  email: 'jeff@naturalresource.co', field: 'Accent',                  kind: 'color',  from: '#1c7ed6',           to: '#2d6a4f',          at: '2026-06-18T14:22:00' },
  { id: 'a2', actor: 'Jeff Lougheed',  email: 'jeff@naturalresource.co', field: 'Apply accent to buttons', kind: 'toggle', from: 'Off',               to: 'On',               at: '2026-06-18T14:21:00' },
  { id: 'a3', actor: 'Mara Coombs',    email: 'mara@naturalresource.co', field: 'Primary font',             kind: 'font',   from: 'Inter',             to: 'Playfair Display', at: '2026-06-15T09:48:00' },
  { id: 'a4', actor: 'Mara Coombs',    email: 'mara@naturalresource.co', field: 'Heading (H1)',             kind: 'color',  from: '#2b2a28',           to: '#1a1917',          at: '2026-06-15T09:45:00' },
  { id: 'a5', actor: 'Jeff Lougheed',  email: 'jeff@naturalresource.co', field: 'Background',                kind: 'color',  from: '#ffffff',           to: '#f9f8f5',          at: '2026-06-09T16:30:00' },
  { id: 'a6', actor: 'Jeff Lougheed',  email: 'jeff@naturalresource.co', field: 'Secondary font',           kind: 'font',   from: 'Georgia',           to: 'DM Sans',          at: '2026-06-02T11:05:00' },
];

// ── Admin console branding (app/admin/settings/Appearance.tsx — "Admin" target) ──
// Purpose-built admin token set — labels/fields map to real admin chrome (sidebar,
// nav, content), NOT the storefront's. Seeded from the SBL base palette (terracotta
// accent, cream canvas, dark rail, Newsreader/Manrope/DM Mono). Each field drives a
// Mantine theme token / CSS variable on the admin console (see ADMIN_THEME_SPEC.md).
const ADMIN_THEME_TOKENS = {
  accent: '#C8542E',          // active nav, primary buttons, links, ADMIN kicker → brand scale
  accent_hover: '#A03D1E',    // hover on nav items + accented buttons
  accent_buttons: true,       // when on, the accent paints primary buttons (else ink)
  sidebar_bg: '#17130E',      // the dark navigation rail behind the menu
  sidebar_text: '#CFC9BF',    // inactive nav item labels
  background: '#FAF6EE',       // main content canvas behind every admin page
  heading: '#1F1A14',          // page titles + section headers
  body: '#1F1A14',             // paragraph + table text
  muted: '#6B6256',            // subtitles, helper text, timestamps
  font_primary: 'Newsreader',  // heading font
  font_secondary: 'Manrope',   // body font
  font_mono: 'DM Mono',        // kicker, section labels, code
};
// Fonts offered in the Admin editor — limited to families the admin console loads,
// so a pick always renders (no silent fallback).
const ADMIN_FONT_OPTIONS = [
  { value: 'Newsreader', label: 'Newsreader' },
  { value: 'Playfair Display', label: 'Playfair Display' },
  { value: 'Georgia', label: 'Georgia' },
  { value: 'Manrope', label: 'Manrope' },
  { value: 'DM Sans', label: 'DM Sans' },
  { value: 'DM Mono', label: 'DM Mono' },
];
const ADMIN_APPEARANCE_HISTORY = [
  { id: 'b0', actor: 'Mara Coombs',   email: 'mara@naturalresource.co', field: 'Accent',        kind: 'color', from: '#1c7ed6', to: '#2d6a4f', at: '2026-06-17T13:10:00' },
  { id: 'b1', actor: 'Jeff Lougheed', email: 'jeff@naturalresource.co', field: 'Primary font',  kind: 'font',  from: 'Inter',   to: 'DM Sans',  at: '2026-06-11T08:20:00' },
];

// ── Branding sync status (read-only; written by the nightly defaults sync job) ──
// defaults_synced_at: ISO of the last successful push to the live theme, or null.
// branding_warnings:  tokens the sync flagged (contrast, licensing, collisions), or null.
const STOREFRONT_SYNC = {
  defaults_synced_at: '2026-06-23T21:47:00',
  branding_warnings: [
    { token: 'accent',       message: 'Contrast 3.1:1 on the background — below the 4.5:1 AA minimum.' },
    { token: 'font_primary', message: '“Playfair Display” has no web license on file; fell back to a system serif.' },
    { token: 'heading',      message: 'Resolves to the same value as Body copy — no visible hierarchy.' },
  ],
};
const ADMIN_SYNC = {
  defaults_synced_at: null,
  branding_warnings: null,
};

// ── Active compiled prompt (prompt-studio/prompt PromptPreview) ──
const MASTER_PROMPT_VERSION = 7;
const MASTER_PROMPT_UPDATED_AT = '2026-06-14T09:30:00';
const MASTER_PROMPT_CONTENT = `# Guardrails

Do not provide specific financial, legal, tax, or medical advice. If asked, acknowledge the question, explain that Sage cannot advise on regulated matters, and offer to connect the visitor with Jeff for a proper conversation.

Do not discuss other clients by name, internal pricing logic, partner commercial terms, or anything covered by an NDA.

# Identity

You are Sage, the AI advisor for Natural Resource. You speak with warmth, candor, and brevity. You are a trusted thinking partner — never salesy, never robotic.

# Process

When a visitor shows buying intent, ask two qualifying questions (what they are working on, and their timeline). If it is a fit, offer the booking link.

# Knowledge

Natural Resource is an independent advisory practice founded by Jeff Lougheed. Engagements begin with a paid discovery sprint (2 weeks). Ongoing advisory is monthly retainer.

# Escalation

If a visitor is frustrated or asks to speak with a person, stop advising and offer to pass the conversation to Jeff directly.`;

// ── System Prompt editor (app/admin/prompt — PromptEditor.tsx) ──
const SYSTEM_PROMPT_VERSION = 7;
const SYSTEM_PROMPT_CONTENT = MASTER_PROMPT_CONTENT;
const SYSTEM_PROMPT_HISTORY = [
  { id: 'v6', version: 6, saved_at: '2026-06-11T11:10:00', content: MASTER_PROMPT_CONTENT },
  { id: 'v5', version: 5, saved_at: '2026-06-09T08:05:00', content: MASTER_PROMPT_CONTENT },
  { id: 'v4', version: 4, saved_at: '2026-05-28T17:30:00', content: MASTER_PROMPT_CONTENT },
  { id: 'v3', version: 3, saved_at: '2026-05-20T10:15:00', content: MASTER_PROMPT_CONTENT },
];

// Existing blocks the Composer references in its opening choices.
const COMPOSER_EXISTING = BLOCKS.filter(b => b.status === 'active').map(b => ({ title: b.title, type: b.type, body: b.body }));

export {
  TENANT_TYPES,
  TYPE_COLORS,
  BADGE_COLORS,
  typeColor,
  NAV_ITEMS,
  TENANTS,
  PROMPT_SET_USAGE_TYPES,
  USAGE_BADGE,
  usageBadge,
  PS_STATUS_BADGE,
  PROMPT_SETS,
  psIsStale,
  PLAN_BADGE,
  STATUS_BADGE,
  ROLE_BADGE,
  ROLE_OPTIONS,
  PILL_STYLE,
  avatarColor,
  initials,
  USERS,
  TENANT_NAME,
  ADMIN_NAV,
  PROMPT_STUDIO_ITEMS,
  ADMIN_PAGE_TITLES,
  tokensFor,
  SESSION_STATUS_BADGE,
  INBOUND_CHATS,
  BLOCK_TYPES,
  BLOCK_TYPE_COLORS,
  BLOCK_TYPE_LABELS,
  BLOCK_TYPE_COMPILE_ORDER,
  formatTypeBadgeLabel,
  ORDERED_BLOCK_TYPES,
  BLOCK_BADGE,
  BLOCKS,
  HISTORY_STATUS_BADGE,
  COMPOSER_HISTORY,
  ASSETS,
  SAGE_PARAMETERS,
  OPEN_AS_OPTIONS,
  CHAT_THRESHOLDS,
  INVITE_GATE_ENABLED,
  THEME_TOKENS,
  THEME_FONT_OPTIONS,
  APPEARANCE_HISTORY,
  ADMIN_THEME_TOKENS,
  ADMIN_FONT_OPTIONS,
  ADMIN_APPEARANCE_HISTORY,
  STOREFRONT_SYNC,
  ADMIN_SYNC,
  MASTER_PROMPT_VERSION,
  MASTER_PROMPT_UPDATED_AT,
  MASTER_PROMPT_CONTENT,
  SYSTEM_PROMPT_VERSION,
  SYSTEM_PROMPT_CONTENT,
  SYSTEM_PROMPT_HISTORY,
  COMPOSER_EXISTING
};
