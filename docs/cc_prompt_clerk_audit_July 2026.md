# Investigation — Clerk usage audit across the codebase

```
git fetch origin && git checkout main && git reset --hard origin/main
```

Read CLAUDE.md before anything else.
**Investigation only — read and report, do not change any files.**

---

## Background

The architectural rule is: Clerk is the doorbell only. `clerk_id` is used exactly once to look up `users.id`; all subsequent logic uses `users.id` or `members.id`. No product code imports from the auth provider directly — all Clerk calls go through the `services/auth` barrel.

We want to know how well this is holding in practice.

---

## What to search for

Run the following searches across the entire codebase (excluding `node_modules`, `.next`, and `services/auth/` itself):

1. **Direct Clerk imports** — any file importing directly from `@clerk/nextjs`, `@clerk/nextjs/server`, `@clerk/clerk-sdk-node`, or any other `@clerk/*` package outside of `services/auth/`
2. **`clerk_id` references outside the auth service** — any file referencing `clerk_id` outside of `services/auth/` and outside of the single expected lookup point
3. **`currentUser()` or `auth()` calls** — Clerk's server-side helpers called directly in routes, components, or services outside of `services/auth/`
4. **`useUser()`, `useAuth()`, `useClerk()` calls** — Clerk's client-side hooks used directly in components outside of `services/auth/`
5. **`clerkClient` references** — direct Clerk admin client usage outside of `services/auth/`

---

## For each hit, report

- File path
- Line number
- What it's importing/calling
- Whether it's going through `services/auth` or bypassing it
- Severity: **Clean** (expected, inside auth service), **Borderline** (could be justified), **Violation** (product code importing Clerk directly)

---

## Output format

Produce a markdown report with:

1. **Summary** — total hits, breakdown by severity
2. **Violations** — full list with file, line, what and why it's a violation
3. **Borderline** — full list with context and recommendation
4. **Clean** — count only, no need to list individually
5. **Recommendation** — what needs to be fixed and suggested order of operations

Save the report to `docs/audits/clerk_usage_audit_july2026.md` and confirm the path.

Do not change any files other than creating this report document.
