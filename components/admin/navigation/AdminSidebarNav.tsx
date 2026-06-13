'use client';

import { NavLink, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Inbound Chats', href: '/admin' },
  { label: 'Prompt',   href: '/admin/prompt' },
  { label: 'Settings', href: '/admin/settings' },
  { label: 'Invites',  href: '/admin/invites' },
  { label: 'Members',  href: '/admin/members' },
] as const;

const PROMPT_STUDIO_ITEMS = [
  { label: 'Composer', href: '/admin/prompt-builder' },
  { label: 'Blocks',   href: '/admin/prompt-studio/blocks' },
  { label: 'History',  href: '/admin/prompt-studio/history' },
  { label: 'Assets',   href: '/admin/prompt-studio/assets' },
  { label: 'Prompt',   href: '/admin/prompt-studio/prompt' },
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

export function AdminSidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <Stack gap="xs" component="section" aria-label="Admin navigation">
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

      {/* Prompt Studio section */}
      <Stack gap={2} mt="sm" component="section" aria-label="Prompt Studio">
        <Text
          size="xs"
          c="dimmed"
          fw={500}
          mb={2}
          pl="sm"
          style={{
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontFamily: 'var(--mantine-font-family-monospace)',
            fontSize: '9px',
          }}
        >
          Prompt Studio
        </Text>
        {PROMPT_STUDIO_ITEMS.map(({ label, href }) => (
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
    </Stack>
  );
}
