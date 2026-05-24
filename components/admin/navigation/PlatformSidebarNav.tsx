'use client';

import { NavLink, Stack } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Tenants', href: '/platform/admin' },
  { label: 'Products', href: '/platform/products' },
  { label: 'Members', href: '/platform/members' },
  { label: 'Usage', href: '/platform/usage' },
] as const;

const navLinkStyle = (isActive: boolean) => ({
  borderRadius: 'var(--mantine-radius-sm)',
  color: isActive
    ? 'var(--mantine-color-white)'
    : 'var(--mantine-color-gray-4)',
  '--nl-color': 'var(--mantine-color-white)',
  '--nl-bg': 'var(--mantine-color-green-filled)',
  '--nl-hover': 'var(--mantine-color-green-filled-hover)',
} as React.CSSProperties);

export function PlatformSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Stack gap="xs" component="section" aria-label="Platform navigation">
      {NAV_ITEMS.map(({ label, href }) => (
        <NavLink
          key={href}
          label={label}
          active={pathname === href}
          onClick={() => router.push(href)}
          variant="subtle"
          aria-current={pathname === href ? 'page' : undefined}
          style={navLinkStyle(pathname === href)}
        />
      ))}
    </Stack>
  );
}
