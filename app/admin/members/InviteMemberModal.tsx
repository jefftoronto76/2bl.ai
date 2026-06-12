// app/admin/members/InviteMemberModal.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { IconUserPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { Role, TenantOption } from './types';
import { ROLE_OPTIONS } from './constants';

/**
 * "Invite member" button (top-right of the list) + its modal.
 *
 * NOTE: the invite flow itself was not part of the approved design. Fields below are a
 * reasonable default (email + tenant + role); confirm with product before shipping.
 * See handover §Open decisions.
 */
export function InviteMemberModal({ tenants }: { tenants: TenantOption[] }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [email, setEmail] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [role, setRole] = useState<Role>('member');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; tenant?: string }>({});

  function reset() {
    setEmail('');
    setTenantId(null);
    setRole('member');
    setErrors({});
  }

  function close() {
    if (submitting) return;
    reset();
    setOpened(false);
  }

  function validate() {
    const next: typeof errors = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = 'Enter a valid email';
    if (!tenantId) next.tenant = 'Select a tenant';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/platform/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), tenant_id: tenantId, role }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? 'Could not send invite.');
      }
      notifications.show({ color: 'green', title: 'Invite sent', message: `Invitation sent to ${email.trim()}.` });
      reset();
      setOpened(false);
      router.refresh();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not send invite',
        message: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <Button leftSection={<IconUserPlus size={16} />} onClick={() => setOpened(true)}>
        Invite member
      </Button>

      <Modal opened={opened} onClose={close} title="Invite member" centered size="md">
        <Stack gap="md">
          <TextInput
            label="Email"
            placeholder="person@company.com"
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.currentTarget.value)}
            error={errors.email}
            data-autofocus
          />
          <Select
            label="Tenant"
            placeholder="Select a tenant"
            required
            data={tenants.map((t) => ({ value: t.id, label: t.name }))}
            value={tenantId}
            onChange={setTenantId}
            error={errors.tenant}
            searchable
            nothingFoundMessage="No tenants"
          />
          <Select
            label="Role"
            data={ROLE_OPTIONS}
            value={role}
            onChange={(v) => v && setRole(v as Role)}
            allowDeselect={false}
          />
          <Group justify="flex-end" mt="xs">
            <Button variant="subtle" color="gray" onClick={close} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} loading={submitting}>
              Send invite
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
