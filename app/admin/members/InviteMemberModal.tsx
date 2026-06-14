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
 * Form: required first name + required email OR phone (mutually exclusive) + required tenant.
 * Email and phone are mutually exclusive — typing in one clears and disables the other.
 *
 * After a successful POST the modal switches to a success view showing the invite URL
 * with a copy button. The admin copies the link and shares it manually.
 */
export function InviteMemberModal({ tenants, currentTenantId }: { tenants: TenantOption[]; currentTenantId?: string }) {
  const router = useRouter();
  const [opened, setOpened] = useState(false);
  const [invitedName, setInvitedName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(currentTenantId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ tenant?: string; name?: string; emailOrPhone?: string }>({});
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  function reset() {
    setInvitedName('');
    setEmail('');
    setPhone('');
    setTenantId(currentTenantId ?? null);
    setErrors({});
    setInviteUrl(null);
  }

  function close() {
    if (submitting) return;
    reset();
    setOpened(false);
  }

  function handleEmailChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.currentTarget.value;
    setEmail(val);
    if (val.trim()) setPhone('');
  }

  function handlePhoneChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.currentTarget.value;
    setPhone(val);
    if (val.trim()) setEmail('');
  }

  function validate() {
    const next: typeof errors = {};
    if (!invitedName.trim()) next.name = 'First name is required';
    if (!email.trim() && !phone.trim()) next.emailOrPhone = 'Enter an email or phone number';
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
              label="First name"
              required
              description="For your records — shown in the member list before they sign up."
              placeholder="First name"
              value={invitedName}
              onChange={(e) => setInvitedName(e.currentTarget.value)}
              error={errors.name}
              data-autofocus
            />
            <TextInput
              label="Email"
              description="Enter email or phone — not both."
              placeholder="member@example.com"
              type="email"
              value={email}
              onChange={handleEmailChange}
              disabled={!!phone.trim() || submitting}
              error={errors.emailOrPhone}
            />
            <TextInput
              label="Phone"
              placeholder="+1 555 000 0000"
              type="tel"
              value={phone}
              onChange={handlePhoneChange}
              disabled={!!email.trim() || submitting}
            />
            {currentTenantId ? (
              <div>
                <Text size="sm" fw={500} mb={4}>Tenant</Text>
                <Text size="sm" c="dimmed">
                  {tenants.find((t) => t.id === currentTenantId)?.name ?? currentTenantId}
                </Text>
              </div>
            ) : (
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
            )}
            <Group justify="flex-end" mt="xs">
              <Button variant="subtle" color="gray" onClick={close} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                loading={submitting}
                disabled={submitting || !invitedName.trim() || (!email.trim() && !phone.trim())}
              >
                Create invite
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>
    </>
  );
}
