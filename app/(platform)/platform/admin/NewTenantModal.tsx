'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, Select, Stack, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import type { TenantRow } from './TenantList';

const TENANT_TYPES = [
  { value: 'platform', label: 'Platform' },
  { value: 'product', label: 'Product' },
  { value: 'business', label: 'Business' },
  { value: 'reseller', label: 'Reseller' },
  { value: 'member', label: 'Member' },
];

// Mirror the server SLUG_RE: lowercase, digits, single hyphens, no edges.
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractError(body: unknown, fallback: string): string {
  if (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as { error: unknown }).error === 'string'
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

interface FieldErrors {
  name?: string;
  type?: string;
  slug?: string;
  domain?: string;
}

interface NewTenantModalProps {
  opened: boolean;
  onClose: () => void;
  tenants: TenantRow[];
}

export function NewTenantModal({ opened, onClose, tenants }: NewTenantModalProps) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [type, setType] = useState<string | null>(null);
  const [parentId, setParentId] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [slugEdited, setSlugEdited] = useState(false);
  const [domain, setDomain] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const parentOptions = tenants.map((t) => ({ value: t.id, label: t.name }));

  function reset() {
    setName('');
    setType(null);
    setParentId(null);
    setSlug('');
    setSlugEdited(false);
    setDomain('');
    setErrors({});
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  // Slug tracks the name until the admin edits it directly.
  function handleNameChange(value: string) {
    setName(value);
    if (!slugEdited) setSlug(slugify(value));
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(slugify(value));
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (name.trim().length === 0) next.name = 'Name is required';
    if (!type) next.type = 'Type is required';
    if (slug.trim().length === 0) next.slug = 'Slug is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSubmitting(true);
    console.log('[NewTenantModal] submit', {
      slug,
      type,
      has_parent: Boolean(parentId),
      has_domain: domain.trim().length > 0,
    });
    try {
      const res = await fetch('/api/platform/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          type,
          parent_id: parentId,
          slug: slug.trim(),
          domain: domain.trim() || null,
        }),
      });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message = extractError(data, 'Could not create tenant.');
        // Surface 409 conflicts inline on the offending field.
        if (res.status === 409) {
          if (/slug/i.test(message)) setErrors((e) => ({ ...e, slug: message }));
          else if (/domain/i.test(message)) setErrors((e) => ({ ...e, domain: message }));
        }
        notifications.show({ color: 'red', title: 'Could not create tenant', message });
        console.error('[NewTenantModal] create failed:', res.status, message);
        return;
      }

      notifications.show({
        color: 'green',
        title: 'Tenant created',
        message: `${name.trim()} is ready.`,
      });
      console.log('[NewTenantModal] created', data);
      reset();
      onClose();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      notifications.show({ color: 'red', title: 'Could not create tenant', message });
      console.error('[NewTenantModal] submit threw:', message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal opened={opened} onClose={handleClose} title="New tenant" centered size="md">
      <Stack gap="md">
        <TextInput
          label="Name"
          placeholder="Acme Coaching"
          required
          value={name}
          onChange={(e) => handleNameChange(e.currentTarget.value)}
          error={errors.name}
          data-autofocus
        />
        <Select
          label="Type"
          placeholder="Select a type"
          required
          data={TENANT_TYPES}
          value={type}
          onChange={setType}
          error={errors.type}
          allowDeselect={false}
        />
        <Select
          label="Parent tenant"
          placeholder="None (top-level)"
          description="Optional — leave empty for a top-level tenant."
          data={parentOptions}
          value={parentId}
          onChange={setParentId}
          searchable
          clearable
          nothingFoundMessage="No tenants"
        />
        <TextInput
          label="Slug"
          placeholder="acme-coaching"
          required
          value={slug}
          onChange={(e) => handleSlugChange(e.currentTarget.value)}
          error={errors.slug}
          description="Auto-generated from the name. Lowercase letters, numbers, and hyphens."
        />
        <TextInput
          label="Domain"
          placeholder="acme.com"
          value={domain}
          onChange={(e) => setDomain(e.currentTarget.value)}
          error={errors.domain}
          description="Optional — leave blank for a subdomain off 2bl.ai."
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="subtle" color="gray" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} loading={submitting}>
            Create tenant
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
