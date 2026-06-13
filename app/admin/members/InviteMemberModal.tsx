'use client';
// app/admin/members/InviteMemberModal.tsx

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, CopyButton, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconCheck, IconCopy, IconUserPlus } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import type { TenantOption } from './types';

/**
 * "Invite member" button + its modal.
 *
 * Form: optional invited_name + required tenant. No email field — the invite token
 * is the gate; the invitee supplies their email when signing up.
 *
 * After a successful POST the modal switches to a success view showing the invite URL
 * with a copy button. The admin copies the link and shares it manually.
 */
export function InviteMemberModal({ tenants }: { tenants: TenantOption[] }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [invitedName, setInvitedName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ tenant?: string }>({});
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  function reset() {
    setInvitedName('');
    setEmail('');
    setPhone('');
    setTenantId(null);
    setErrors({});
    setInviteUrl(null);
  }

  function close() {
    if (submitting) return;
    reset();
    setOpened(false);
  }

  function validate() {
    const next: typeof errors = {};
    if (!tenantId) next.tenant = 'Select a tenant';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: Record<string, string> = { tenant_id: tenantId! };
      const name = invitedName.trim();
      if (name) payload.invited_name = name;
      const emailTrimmed = email.trim();
      if (emailTrimmed) payload.email = emailTrimmed;
      const phoneTrimmed = phone.trim();
      if (phoneTrimmed) payload.phone = phoneTrimmed;

      const res = await fetch('/api/platform/members/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? 'Could not create invite.');
      }
      const data = (await res.json()) as { token: string; member_id: string; invite_url: string | null };
      // Use the server-constructed invite_url (built from tenant domain) when available;
      // fall back to the current origin only when the tenant has no domain configured.
      const url = data.invite_url ?? `${window.location.origin}?invite=${data.token}`;
      setInviteUrl(url);
      router.refresh();
    } catch (err) {
      notifications.show({
        color: 'red',
        title: 'Could not create invite',
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
        {inviteUrl ? (
          /* Success — show the generated invite URL */
          <Stack gap="md">
            <Text size="sm" c="dimmed">
              Invite link created. Copy it and share it with your member — it grants access on sign-up.
            </Text>
            <TextInput
              readOnly
              label="Invite link"
              value={inviteUrl}
              styles={{ input: { fontFamily: 'var(--mantine-font-family-monospace)', fontSize: 11 } }}
            />
            <Group justify="flex-end" mt="xs">
              <CopyButton value={inviteUrl} timeout={2000}>
                {({ copied, copy }) => (
                  <Button
                    leftSection={copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                    color={copied ? 'green' : undefined}
                    onClick={copy}
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </Button>
                )}
              </CopyButton>
              <Button variant="subtle" color="gray" onClick={close}>
                Done
              </Button>
            </Group>
          </Stack>
        ) : (
          /* Form */
          <Stack gap="md">
            <TextInput
              label="Name (optional)"
              description="For your records — shown in the member list before they sign up."
              placeholder="First Last"
              value={invitedName}
              onChange={(e) => setInvitedName(e.currentTarget.value)}
              data-autofocus
            />
            <TextInput
              label="Email (optional)"
              description="Locks this invite to a specific email address."
              placeholder="member@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            <TextInput
              label="Phone (optional)"
              description="Locks this invite to a specific phone number."
              placeholder="+1 555 000 0000"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.currentTarget.value)}
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
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" color="gray" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} loading={submitting}>
                Create invite
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
