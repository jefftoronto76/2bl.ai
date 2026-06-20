'use client';

import { Suspense } from 'react';
import { NavLink, Stack, Text } from '@mantine/core';
import { usePathname, useRouter } from 'next/navigation';
import { NAV_SECTIONS, isActive } from './nav-config';

const navLinkStyle = (active: boolean) =>
  ({
    borderRadius: 'var(--mantine-radius-sm)',
    color: active ? 'var(--mantine-color-white)' : 'var(--mantine-color-gray-4)',
    '--nl-color': 'var(--mantine-color-white)',
    '--nl-bg': 'var(--mantine-color-green-filled)',
    '--nl-hover': 'var(--mantine-color-green-filled-hover)',
  }) as React.CSSProperties;

interface Props {
  tenantName: string;
  onNavigate?: () => void;
}

function NavBody({ tenantName, onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  function go(href: string) {
    router.push(href);
    onNavigate?.();
  }

  return (
    <>
      {NAV_SECTIONS.map((section, i) => (
        <Stack
          key={section.label}
          gap={2}
          mt={i === 0 ? 'xs' : 'sm'}
          component="section"
          aria-label={section.isTenant ? tenantName : section.label}
        >
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
            {section.isTenant ? tenantName : section.label}
          </Text>
          {section.items.map(({ label, href }) => {
            const active = isActive(href, pathname);
            return (
              <NavLink
                key={href}
                label={label}
                active={active}
                onClick={() => go(href)}
                variant="subtle"
                aria-current={active ? 'page' : undefined}
                style={navLinkStyle(active)}
              />
            );
          })}
        </Stack>
      ))}
    </>
  );
}

export function UnifiedSidebarNav({ tenantName, onNavigate }: Props) {
  return (
    <Suspense>
      <NavBody tenantName={tenantName} onNavigate={onNavigate} />
    </Suspense>
  );
}
