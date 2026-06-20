// components/admin/shell/nav-config.ts
//
// Single source of truth for the unified admin sidebar — merges the old
// PlatformSidebarNav (/platform/*) and AdminSidebarNav (/admin/*) into one
// sectioned navigation wrapping both route groups.

export type NavItem = { label: string; href: string }

export type NavSection = {
  label: string
  /** When true, the shell substitutes the active tenant's name for label. */
  isTenant?: boolean
  /** When true, the section is only rendered for platform admins. */
  platformOnly?: boolean
  items: NavItem[]
}

/**
 * Ordered top-to-bottom as rendered in the sidebar.
 *
 * The Platform section's "Prompt" entry and the Prompt Studio "Prompt" page
 * both link to /admin/prompt-studio/prompt. This is intentional — platform
 * operators get a shortcut to the compiled-prompt preview without entering
 * the tenant section.
 */
export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Platform',
    platformOnly: true,
    items: [
      { label: 'Tenants', href: '/platform/admin' },
      { label: 'Members', href: '/platform/members' },
      { label: 'Usage', href: '/platform/usage' },
      { label: 'Prompt', href: '/admin/prompt-studio/prompt' },
    ],
  },
  {
    label: 'Tenant',
    isTenant: true,
    items: [
      { label: 'Inbound Chats', href: '/admin' },
      { label: 'Prompt', href: '/admin/prompt' },
      { label: 'Settings', href: '/admin/settings' },
      { label: 'Members', href: '/admin/members' },
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
]

/** Mobile-header title per route. Falls back to the active item's label. */
export const PAGE_TITLES: Record<string, string> = {
  '/platform/admin': 'Tenants',
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
}

/**
 * Routes that render inside the padded max-width content column.
 * Everything else is full-bleed and manages its own scroll + header.
 */
export const PADDED_ROUTES = new Set<string>([
  '/platform/admin',
  '/platform/members',
  '/platform/usage',
  '/admin/members',
])

export function isPaddedRoute(pathname: string): boolean {
  return PADDED_ROUTES.has(pathname)
}

/**
 * Active-link test. Exact match for leaf routes; prefix match for sub-trees
 * so /admin/prompt-studio/blocks/123 keeps "Blocks" lit. /admin (Inbound
 * Chats) is special-cased so it doesn't match every /admin/* route.
 */
export function isActive(href: string, pathname: string): boolean {
  if (href === pathname) return true
  if (href === '/admin') return false
  return pathname.startsWith(href + '/')
}
