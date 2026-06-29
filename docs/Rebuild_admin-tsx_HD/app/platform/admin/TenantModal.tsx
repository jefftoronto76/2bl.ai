'use client'

// New / edit tenant modal — name, type, parent, slug (auto-generated from name on
// create), domain. Edit mode adds an inline cascade-delete confirmation.

import { useState } from 'react'
import { Button, Divider, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core'
import { IconAlertTriangle, IconTrash } from '@tabler/icons-react'
import { TENANT_TYPES } from '@/components/admin/lib/fixtures'
import { slugify } from '@/components/admin/lib/types'
import type { Tenant, TenantType } from '@/components/admin/lib/types'

export interface TenantModalState {
  mode: 'new' | 'edit'
  tenant?: Tenant
}

interface TenantModalProps {
  mode: 'new' | 'edit'
  tenant?: Tenant
  tenants: Tenant[]
  onClose: () => void
  onSave: (t: Tenant) => void
  onDelete: (t: Tenant) => void
}

export function TenantModal({ mode, tenant, tenants, onClose, onSave, onDelete }: TenantModalProps) {
  const [name, setName] = useState(tenant ? tenant.name : '')
  const [type, setType] = useState<string | null>(tenant ? tenant.type : null)
  const [parentId, setParentId] = useState<string | null>(tenant ? tenant.parent_id : null)
  const [slug, setSlug] = useState(tenant ? tenant.slug ?? '' : '')
  const [slugEdited, setSlugEdited] = useState(false)
  const [domain, setDomain] = useState(tenant ? tenant.domain ?? '' : '')
  const [confirming, setConfirming] = useState(false)
  const [err, setErr] = useState<{ name?: string; type?: string; slug?: string }>({})

  const parentOptions = tenants
    .filter((t) => !tenant || t.id !== tenant.id)
    .map((t) => ({ value: t.id, label: t.name }))

  const onName = (v: string) => {
    setName(v)
    if (mode === 'new' && !slugEdited) setSlug(slugify(v))
  }
  const onSlug = (v: string) => {
    setSlugEdited(true)
    setSlug(slugify(v))
  }

  const save = () => {
    const next: typeof err = {}
    if (!name.trim()) next.name = 'Name is required'
    if (!type) next.type = 'Type is required'
    if (!slug.trim()) next.slug = 'Slug is required'
    setErr(next)
    if (Object.keys(next).length) return
    onSave({
      id: tenant ? tenant.id : (slug.trim() || `t-${Date.now()}`),
      parent_id: parentId,
      name: name.trim(),
      type: type as TenantType,
      slug: slug.trim(),
      domain: domain.trim() || null,
    })
  }

  return (
    <Modal opened onClose={onClose} size="md" radius="md" centered title={<Text fw={600}>{mode === 'new' ? 'New tenant' : 'Edit tenant'}</Text>}>
      <Stack gap="md">
        <TextInput label="Name" placeholder="Acme Coaching" required value={name} error={err.name} onChange={(e) => onName(e.currentTarget.value)} data-autofocus />
        <Select label="Type" placeholder="Select a type" required data={TENANT_TYPES} value={type} error={err.type} onChange={setType} />
        <Select
          label="Parent tenant" placeholder="None (top-level)" data={parentOptions} value={parentId} onChange={setParentId}
          searchable clearable nothingFoundMessage="No tenants" description="Optional — leave empty for a top-level tenant."
        />
        <TextInput
          label="Slug" placeholder="acme-coaching" required value={slug} error={err.slug} onChange={(e) => onSlug(e.currentTarget.value)}
          description={mode === 'new' ? 'Auto-generated from the name. Lowercase letters, numbers, and hyphens.' : 'Lowercase letters, numbers, and hyphens.'}
        />
        <TextInput label="Domain" placeholder="acme.com" value={domain} onChange={(e) => setDomain(e.currentTarget.value)} description="Optional — leave blank for a subdomain off 2bl.ai." />

        {mode === 'new' ? (
          <Group justify="flex-end" gap="sm" mt={4}>
            <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
            <Button onClick={save}>Create tenant</Button>
          </Group>
        ) : (
          <Group justify="space-between" mt={4}>
            <Button variant="subtle" color="red" leftSection={<IconTrash size={16} />} onClick={() => setConfirming(true)}>Delete</Button>
            <Group gap="sm">
              <Button variant="subtle" color="gray" onClick={onClose}>Cancel</Button>
              <Button onClick={save}>Save changes</Button>
            </Group>
          </Group>
        )}

        {confirming && tenant && (
          <>
            <Divider />
            <Group gap="sm" wrap="nowrap" align="flex-start" style={{ padding: '12px 14px', borderRadius: 'var(--mantine-radius-sm)', background: 'rgba(245,159,0,0.10)', border: '1px solid rgba(245,159,0,0.28)' }}>
              <IconAlertTriangle size={18} style={{ color: '#b07c0c', flex: '0 0 auto', marginTop: 1 }} />
              <Stack gap={8} style={{ flex: 1 }}>
                <Text fw={600} size="sm">Delete this tenant?</Text>
                <Text size="sm" c="dimmed">This permanently removes <b>{tenant.name}</b> and any sub-tenants. This cannot be undone.</Text>
                <Group justify="flex-end" gap="sm">
                  <Button variant="subtle" color="gray" size="xs" onClick={() => setConfirming(false)}>Cancel</Button>
                  <Button color="red" size="xs" onClick={() => onDelete(tenant)}>Delete tenant</Button>
                </Group>
              </Stack>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  )
}
