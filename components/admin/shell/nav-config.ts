export type NavItem = { label: string; href: string };

export type NavSection = {
  label: string;
  isTenant?: boolean;
  platformOnly?: boolean;
  items: NavItem[];
};

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
];

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
};

export const PADDED_ROUTES = new Set<string>([
  '/platform/admin',
  '/platform/members',
  '/platform/usage',
  '/admin/members',
]);

export function isPaddedRoute(pathname: string): boolean {
  return PADDED_ROUTES.has(pathname);
}

export function isActive(href: string, pathname: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  if (href === pathname) return true;
  return pathname.startsWith(href + '/');
}
