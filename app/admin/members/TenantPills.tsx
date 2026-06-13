// app/admin/members/TenantPills.tsx
'use client';

import { Badge, Group, Tooltip } from '@mantine/core';
import type { Membership } from './types';

/**
 * Renders a user's tenant memberships as pills — up to `max` named tenants, then a
 * "+N more" pill whose tooltip lists the remainder. Never collapses to just "Multiple".
 */
export function TenantPills({ memberships, max = 3 }: { memberships: Membership[]; max?: number }) {
  if (memberships.length === 0) {
    return (
      <Badge variant="default" tt="none" radius="sm" c="dimmed">
        No tenants
      </Badge>
    );
  }

  const shown = memberships.slice(0, max);
  const extra = memberships.slice(max);

  return (
    <Group gap={6} wrap="wrap">
      {shown.map((m) => (
        <Badge key={m.tenantId} variant="light" color="gray" tt="none" radius="sm" fw={500}>
          {m.tenantName}
        </Badge>
      ))}

      {extra.length > 0 && (
        <Tooltip label={extra.map((m) => m.tenantName).join(', ')} withArrow position="top">
          <Badge variant="default" tt="none" radius="sm" fw={500} c="dimmed" style={{ cursor: 'default' }}>
            +{extra.length} more
          </Badge>
        </Tooltip>
      )}
    </Group>
  );
}
