'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Divider,
  Group,
  Modal,
  Select,
  Stack,
  TextInput,
} from '@mantine/core';
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react';
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

interface EditTenantModalProps {
  tenant: TenantRow;
  tenants: TenantRow[];
  onClose: () => void;
}

export function EditTenantModal({ tenant, tenants, onClose }: EditTenantModalProps) {
  const router = useRouter();
  const [name, setName] = useState(tenant.name);
  const [type, setType] = useState<string | null>(tenant.type);
  const [parentId, setParentId] = useState<string | null>(tenant.parent_id);
  const [slug, setSlug] = useState(tenant.slug ?? '');
  const [domain, setDomain] = useState(tenant.domain ?? '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  const busy = saving || deleting;
  // A tenant can't be its own parent — exclude self from the options.
  const parentOptions = tenants
    .filter((t) => t.id !== tenant.id)
    .map((t) => ({ value: t.id, label: t.name }));

  function handleClose() {
    if (busy) return;
    onClose();
  }

  function validate(): boolean {
    const next: FieldErrors = {};
    if (name.trim().length === 0) next.name = 'Name is required';
    if (!type) next.type = 'Type is required';
    if (slug.trim().length === 0) next.slug = 'Slug is required';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    console.log('[EditTenantModal] save', {
      id: tenant.id,
      slug,
      type,
      has_parent: Boolean(parentId),
      has_domain: domain.trim().length > 0,
    });
    try {
      const res = await fetch(`/api/platform/tenants/${tenant.id}`, {
        method: 'PATCH',
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
        const message = extractError(data, 'Could not save changes.');
        if (res.status === 409) {
          if (/slug/i.test(message)) setErrors((e) => ({ ...e, slug: message }));
          else if (/domain/i.test(message)) setErrors((e) => ({ ...e, domain: message }));
        }
        notifications.show({ color: 'red', title: 'Could not save tenant', message });
        console.error('[EditTenantModal] save failed:', res.status, message);
        return;
      }

      notifications.show({
        color: 'green',
        title: 'Tenant updated',
        message: `${name.trim()} saved.`,
      });
      console.log('[EditTenantModal] saved', data);
      onClose();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      notifications.show({ color: 'red', title: 'Could not save tenant', message });
      console.error('[EditTenantModal] save threw:', message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    console.log('[EditTenantModal] delete', { id: tenant.id });
    try {
      const res = await fetch(`/api/platform/tenants/${tenant.id}`, { method: 'DELETE' });
      const data: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const message = extractError(data, 'Could not delete tenant.');
        notifications.show({ color: 'red', title: 'Could not delete tenant', message });
        console.error('[EditTenantModal] delete failed:', res.status, message);
        setConfirming(false);
        return;
      }

      notifications.show({
        color: 'green',
        title: 'Tenant deleted',
        message: `${tenant.name} was removed.`,
      });
      console.log('[EditTenantModal] deleted', { id: tenant.id });
      onClose();
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Network error';
      notifications.show({ color: 'red', title: 'Could not delete tenant', message });
      console.error('[EditTenantModal] delete threw:', message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Modal opened onClose={handleClose} title="Edit tenant" centered size="md">
      <Stack gap="md">
        <TextInput
          label="Name"
          required
          value={name}
          onChange={(e) => setName(e.currentTarget.value)}
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
          required
          value={slug}
          onChange={(e) => setSlug(slugify(e.currentTarget.value))}
          error={errors.slug}
          description="Lowercase letters, numbers, and hyphens."
        />
        <TextInput
          label="Domain"
          placeholder="acme.com"
          value={domain}
          onChange={(e) => setDomain(e.currentTarget.value)}
          error={errors.domain}
          description="Optional — leave blank for a subdomain off 2bl.ai."
        />

        <Group justify="space-between" mt="xs">
          <Button
            variant="subtle"
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={() => setConfirming(true)}
            disabled={busy}
          >
            Delete
          </Button>
          <Group>
            <Button variant="subtle" color="gray" onClick={handleClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={deleting}>
              Save changes
            </Button>
          </Group>
        </Group>

        {confirming && (
          <>
            <Divider />
            <Alert
              color="red"
              variant="light"
              icon={<IconAlertTriangle size={18} />}
              title="Delete this tenant?"
            >
              <Stack gap="sm">
                <span>
                  This permanently removes <strong>{tenant.name}</strong>. This cannot be undone.
                </span>
                <Group justify="flex-end">
                  <Button
                    variant="subtle"
                    color="gray"
                    onClick={() => setConfirming(false)}
                    disabled={deleting}
                  >
                    Cancel
                  </Button>
                  <Button color="red" onClick={handleDelete} loading={deleting}>
                    Delete tenant
                  </Button>
                </Group>
              </Stack>
            </Alert>
          </>
        )}
      </Stack>
    </Modal>
  );
}
