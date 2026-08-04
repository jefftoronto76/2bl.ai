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

Object.assign(window, { TENANT_TYPES, TYPE_COLORS, BADGE_COLORS, typeColor, NAV_ITEMS, TENANTS });

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

Object.assign(window, { PLAN_BADGE, STATUS_BADGE, ROLE_BADGE, ROLE_OPTIONS, PILL_STYLE, avatarColor, initials, USERS });
