'use client';
// app/admin/members/InviteMemberModal.tsx

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, CopyButton, Group, Modal, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
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
  const [autoOpen, setAutoOpen] = useState(false);
  const [primer, setPrimer] = useState('');
  const [tenantId, setTenantId] = useState<string | null>(currentTenantId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ tenant?: string; name?: string; emailOrPhone?: string }>({});
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  // Pre-populate primer from tenant's default_primer when modal opens or tenant changes.
  useEffect(() => {
    if (!opened || !tenantId) return;
    void fetch(`/api/admin/tenant-settings`)
      .then((r) => r.ok ? r.json() : null)
      .then((data: { default_primer?: string | null } | null) => {
        if (data?.default_primer) {
          setPrimer((prev) => prev || data.default_primer!);
        }
      })
      .catch(() => {/* non-fatal */});
  }, [opened, tenantId]);

  function reset() {
    setInvitedName('');
    setEmail('');
    setPhone('');
    setAutoOpen(false);
    setPrimer('');
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
      const payload: Record<string, unknown> = { tenant_id: tenantId! };
      const name = invitedName.trim();
      if (name) payload.invited_name = name;
      const emailTrimmed = email.trim();
      if (emailTrimmed) payload.email = emailTrimmed;
      const phoneTrimmed = phone.trim();
      if (phoneTrimmed) payload.phone = phoneTrimmed;
      if (autoOpen) payload.auto_open = true;
      const primerTrimmed = primer.trim();
      if (primerTrimmed) payload.primer = primerTrimmed;

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
            <Checkbox
              label="Auto-open chat on arrival"
              description="The chat panel will open automatically when this person lands on the invite link."
              checked={autoOpen}
              onChange={(e) => setAutoOpen(e.currentTarget.checked)}
              disabled={submitting}
            />
            <Textarea
              label="Custom Greeting"
              description="Optional. Personalizes the AI's opening approach for this member — injected once into their first chat session."
              placeholder="e.g. This member wants to preserve their grandmother's wartime letters. Focus on narrative structure and emotional detail."
              value={primer}
              onChange={(e) => setPrimer(e.currentTarget.value.slice(0, 500))}
              disabled={submitting}
              autosize
              minRows={3}
              maxRows={6}
              rightSectionWidth={60}
              rightSection={
                <Text size="xs" c={primer.length >= 480 ? 'red' : 'dimmed'} style={{ paddingRight: 8 }}>
                  {primer.length}/500
                </Text>
              }
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
