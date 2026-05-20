# DB Changelog

## 2026-05-20

### Add `key` column to `master_prompt`
**Type:** Schema change  
**Executed by:** Jeff in Supabase Studio

**SQL run:**

```sql
ALTER TABLE public.master_prompt
ADD COLUMN key text NULL;

ALTER TABLE public.master_prompt
ADD CONSTRAINT master_prompt_tenant_key_unique UNIQUE (tenant_id, key);
```


**Purpose:** Supports multiple prompt engines per tenant. A tenant can now have multiple master prompts differentiated by `key` (e.g. 'base', 'editor', 'onboarding'). Existing rows with `key: null` are unaffected — jefflougheed.ca prompt resolution unchanged.

---

## 2026-05-20

### Insert Second Brain Labs tenant
**Type:** Data insert  
**Executed by:** Jeff in Supabase Studio

**Record inserted:** `tenants` table  
- `id: 6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb`
- `name: Second Brain Labs`
- `slug: second-brain-labs`
- `type: platform`
- `domain: 2bl.ai`
