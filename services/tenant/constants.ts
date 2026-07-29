// services/tenant/constants.ts
//
// Well-known tenant ids referenced from more than one place. Kept here
// rather than duplicated locally so every consumer stays in sync.

// The Second Brain Labs / platform tenant (2bl.ai). Owns the four platform
// default prompt_types (base/sales/onboarding/editor) and, as of the July
// 2026 composer-family work, every is_composer_prompt=true prompt_set.
export const SBL_TENANT_ID = '6720ee2f-d7e3-4788-b8c7-f63cf70eb2bb'
