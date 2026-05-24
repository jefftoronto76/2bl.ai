'use client';

import { useMemo, useState } from 'react';
import {
  Table,
  Box,
  Stack,
  Group,
  Badge,
  Button,
  Center,
  ActionIcon,
  Card,
  Text,
} from '@mantine/core';
import { IconChevronRight, IconPlus } from '@tabler/icons-react';
import { NewTenantModal } from './NewTenantModal';

export interface TenantRow {
  id: string;
  parent_id: string | null;
  name: string;
  slug: string | null;
  type: string | null;
  domain: string | null;
}

interface FlatNode {
  tenant: TenantRow;
  depth: number;
  childCount: number;
}

// Defensive map — actual tenant.type values aren't fixed in code yet, so unknown
// types fall back to gray and the raw type string is always shown verbatim.
const TYPE_COLORS: Record<string, string> = {
  platform: 'grape',
  business: 'teal',
  agency: 'indigo',
  client: 'blue',
};

function typeColor(type: string | null): string {
  return (type && TYPE_COLORS[type]) || 'gray';
}

// Flattens the parent/child tree into the rows currently visible given the
// expanded set. Recursive, so it handles any nesting depth and never drops a
// tenant. Roots = tenants with no parent (or whose parent isn't in the set).
// Input order is preserved (the query sorts by name), so siblings stay sorted.
function useVisibleNodes(tenants: TenantRow[], expandedIds: Set<string>): FlatNode[] {
  return useMemo(() => {
    const ids = new Set(tenants.map((t) => t.id));
    const childrenByParent = new Map<string, TenantRow[]>();
    for (const t of tenants) {
      const pid = t.parent_id && ids.has(t.parent_id) ? t.parent_id : null;
      if (pid) {
        const arr = childrenByParent.get(pid) ?? [];
        arr.push(t);
        childrenByParent.set(pid, arr);
      }
    }
    const roots = tenants.filter((t) => !(t.parent_id && ids.has(t.parent_id)));
    const out: FlatNode[] = [];
    const walk = (node: TenantRow, depth: number) => {
      const kids = childrenByParent.get(node.id) ?? [];
      out.push({ tenant: node, depth, childCount: kids.length });
      if (expandedIds.has(node.id)) {
        for (const k of kids) walk(k, depth + 1);
      }
    };
    for (const r of roots) walk(r, 0);
    return out;
  }, [tenants, expandedIds]);
}

function TypeCell({ type }: { type: string | null }) {
  if (!type) {
    return (
      <Text span c="dimmed">
        —
      </Text>
    );
  }
  return (
    <Badge color={typeColor(type)} variant="light" tt="none">
      {type}
    </Badge>
  );
}

export function TenantList({ tenants }: { tenants: TenantRow[] }) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [newOpen, setNewOpen] = useState(false);
  const visible = useVisibleNodes(tenants, expandedIds);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <Group justify="flex-end">
        <Button leftSection={<IconPlus size={16} />} onClick={() => setNewOpen(true)}>
          New tenant
        </Button>
      </Group>

      {tenants.length === 0 ? (
        <Center h={160}>
          <Text c="dimmed">No tenants yet.</Text>
        </Center>
      ) : (
        <>
          {/* Desktop: table */}
          <Box visibleFrom="md">
            <Table striped highlightOnHover verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Name</Table.Th>
                  <Table.Th>Type</Table.Th>
                  <Table.Th>Domain</Table.Th>
                  <Table.Th>Slug</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {visible.map(({ tenant, depth, childCount }) => {
                  const expanded = expandedIds.has(tenant.id);
                  return (
                    <Table.Tr key={tenant.id}>
                      <Table.Td>
                        <Group gap="xs" wrap="nowrap" style={{ paddingLeft: depth * 20 }}>
                          <Box w={28} style={{ display: 'flex', justifyContent: 'center' }}>
                            {childCount > 0 && (
                              <ActionIcon
                                variant="subtle"
                                color="gray"
                                size="sm"
                                onClick={() => toggleExpand(tenant.id)}
                                aria-label={
                                  expanded ? `Collapse ${tenant.name}` : `Expand ${tenant.name}`
                                }
                                aria-expanded={expanded}
                              >
                                <IconChevronRight
                                  size={16}
                                  style={{
                                    transform: expanded ? 'rotate(90deg)' : 'none',
                                    transition: 'transform 150ms ease',
                                  }}
                                />
                              </ActionIcon>
                            )}
                          </Box>
                          <Text span fw={500}>
                            {tenant.name}
                          </Text>
                          {childCount > 0 && (
                            <Text span c="dimmed" fz="xs">
                              ({childCount})
                            </Text>
                          )}
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <TypeCell type={tenant.type} />
                      </Table.Td>
                      <Table.Td>
                        {tenant.domain ? (
                          <Text span>{tenant.domain}</Text>
                        ) : (
                          <Text span c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        {tenant.slug ? (
                          <Text span>{tenant.slug}</Text>
                        ) : (
                          <Text span c="dimmed">
                            —
                          </Text>
                        )}
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>

          {/* Mobile: card stack */}
          <Stack gap="sm" hiddenFrom="md">
            {visible.map(({ tenant, depth, childCount }) => {
              const expanded = expandedIds.has(tenant.id);
              return (
                <Card
                  key={tenant.id}
                  withBorder
                  padding="sm"
                  radius="md"
                  style={{ marginLeft: depth * 16 }}
                >
                  <Group justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={4} style={{ minWidth: 0 }}>
                      <Group gap="xs" wrap="nowrap">
                        <Text fw={600} truncate>
                          {tenant.name}
                        </Text>
                        {tenant.type && (
                          <Badge
                            color={typeColor(tenant.type)}
                            variant="light"
                            tt="none"
                            size="sm"
                          >
                            {tenant.type}
                          </Badge>
                        )}
                      </Group>
                      <Text c="dimmed" fz="sm" truncate>
                        {tenant.domain ?? 'No domain'}
                        {tenant.slug ? ` · ${tenant.slug}` : ''}
                      </Text>
                    </Stack>
                    {childCount > 0 && (
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        onClick={() => toggleExpand(tenant.id)}
                        aria-label={
                          expanded
                            ? `Collapse ${tenant.name}`
                            : `Expand ${tenant.name} (${childCount} sub-tenants)`
                        }
                        aria-expanded={expanded}
                      >
                        <IconChevronRight
                          size={18}
                          style={{
                            transform: expanded ? 'rotate(90deg)' : 'none',
                            transition: 'transform 150ms ease',
                          }}
                        />
                      </ActionIcon>
                    )}
                  </Group>
                </Card>
              );
            })}
          </Stack>
        </>
      )}

      <NewTenantModal
        opened={newOpen}
        onClose={() => setNewOpen(false)}
        tenants={tenants}
      />
    </>
  );
}
