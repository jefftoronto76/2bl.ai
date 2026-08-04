// components/admin/shell/nav-config.ts
//
// Single source of truth for the UNIFIED admin sidebar — the merge of the old
// PlatformSidebarNav (/platform/*) and AdminSidebarNav (/admin/*) into one
// sectioned navigation that wraps both route groups.
//
// See handover.md §2 (Architecture) and §3 (Navigation model).

export type NavItem = { label: string; href: string };

export type NavSection = {
  /** Section heading shown in the sidebar. `tenantName` is resolved at render. */
  label: string;
  /** When true, the shell substitutes the active tenant's name for `label`. */
  isTenant?: boolean;
  items: NavItem[];
};

/**
 * Ordered top-to-bottom as it appears in the sidebar.
 *
 * NOTE on the "Prompt" entries: the Platform section's "Prompt" and the tenant
 * "Prompt Studio → Prompt" both point at /admin/prompt-studio/prompt. That is
 * intentional in the approved design — platform operators get a shortcut to the
 * compiled-prompt preview without entering the tenant section. Confirm whether
 * you want to keep the duplicate or drop the platform-level shortcut.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Platform',
    items: [
      { label: 'Tenants', href: '/platform/admin' },
      { label: 'Members', href: '/platform/members' },
      { label: 'Usage', href: '/platform/usage' },
      { label: 'Prompt', href: '/admin/prompt-studio/prompt' },
    ],
  },
  {
    // Replaced at render time with the active tenant's name (e.g. "Second Brain Labs").
    label: 'Tenant',
    isTenant: true,
    items: [
      { label: 'Inbound Chats', href: '/admin' },
      { label: 'Prompt', href: '/admin/prompt' },
      { label: 'Settings', href: '/admin/settings' },
    ],
  },
  {
    label: 'Prompt Studio',
    items: [
      { label: 'Composer', href: '/admin/prompt-builder' },
      { label: 'Blocks', href: '/admin/prompt-studio/blocks' },
      { label: 'History', href: '/admin/prompt-studio/history' },
      { label: 'Assets', href: '/admin/prompt-studio/assets' },
    ],
  },
];

/**
 * Mobile-header titles, keyed by route. Extend as routes are added — falls back
 * to the active nav item's label if a route is missing here.
 */
export const PAGE_TITLES: Record<string, string> = {
  '/platform/admin': 'Tenants',
  '/platform/products': 'Products',
  '/platform/members': 'Members',
  '/platform/usage': 'Usage',
  '/admin': 'Inbound Chats',
  '/admin/prompt': 'System Prompt',
  '/admin/settings': 'Settings',
  '/admin/members': 'Members',
  '/admin/prompt-builder': 'Composer',
  '/admin/prompt-studio/blocks': 'Blocks',
  '/admin/prompt-studio/history': 'History',
  '/admin/prompt-studio/assets': 'Assets',
  '/admin/prompt-studio/prompt': 'System Prompt',
};

/**
 * Routes that render INSIDE the padded, max-width content column.
 * Everything else is a full-bleed tenant screen that owns its own scroll + header
 * (the `.screen` layout in the prototype). See handover.md §4 (Content layout).
 */
export const PADDED_ROUTES = new Set<string>([
  '/platform/admin',
  '/platform/products',
  '/platform/members',
  '/platform/usage',
  '/admin/members',
]);

/** True when `pathname` should render in the padded column. */
export function isPaddedRoute(pathname: string): boolean {
  return PADDED_ROUTES.has(pathname);
}

/**
 * Active-link test. Exact match for leaf routes; prefix match for the tenant
 * Prompt Studio sub-tree so deep links stay highlighted. Tune to taste.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === pathname) return true;
  // Keep "/admin" (Inbound Chats) from matching every /admin/* route.
  if (href === '/admin') return false;
  return pathname.startsWith(href + '/');
}
