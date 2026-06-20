'use client';

import { Fragment, Suspense } from 'react';
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

const sectionLabelStyle = {
  letterSpacing: '0.08em',
  textTransform: 'uppercase' as const,
  fontFamily: 'var(--mantine-font-family-monospace)',
  fontSize: '9px',
};

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
    <Stack gap="xs" component="section" aria-label="Admin navigation">
      {NAV_SECTIONS.map((section, i) => {
        const label = section.isTenant ? tenantName : section.label;
        const links = section.items.map(({ label: itemLabel, href }) => {
          const active = isActive(href, pathname);
          return (
            <NavLink
              key={href}
              label={itemLabel}
              active={active}
              onClick={() => go(href)}
              variant="subtle"
              aria-current={active ? 'page' : undefined}
              style={navLinkStyle(active)}
            />
          );
        });

        // Last section (Prompt Studio): nested Stack, matching old AdminSidebarNav exactly
        if (i === NAV_SECTIONS.length - 1) {
          return (
            <Stack key={section.label} gap={2} mt="sm" component="section" aria-label={label}>
              <Text size="xs" c="dimmed" fw={500} mb={2} pl="sm" style={sectionLabelStyle}>
                {label}
              </Text>
              {links}
            </Stack>
          );
        }

        // All other sections (Platform, Tenant): flat Text label + flat NavLinks
        return (
          <Fragment key={section.label}>
            <Text size="xs" c="dimmed" fw={500} mb={2} pl="sm" mt={i === 0 ? 'xs' : 'sm'} style={sectionLabelStyle}>
              {label}
            </Text>
            {links}
          </Fragment>
        );
      })}
    </Stack>
  );
}

export function UnifiedSidebarNav({ tenantName, onNavigate }: Props) {
  return (
    <Suspense>
      <NavBody tenantName={tenantName} onNavigate={onNavigate} />
    </Suspense>
  );
}
