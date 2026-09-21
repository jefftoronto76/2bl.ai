# Heirloom Public Security Review

**Application:** https://heirloom.2bl.ai  
**Review type:** Limited, non-destructive inspection of the public application surface  
**Date:** September 2, 2026

## Executive summary

No immediate catastrophic exposure or publicly shipped private credential was identified. The application has a meaningful attack surface because it handles private stories, media, invitations, collaboration and AI processing. The highest-priority question is whether every backend route enforces record-level authorization consistently.

**Preliminary assessment:** Medium attack surface; backend verification required before the application should hold sensitive family material.

## Observed architecture

- Next.js application deployed on Vercel.
- Clerk authentication.
- HTTPS with HTTP Strict Transport Security enabled.
- Public client code exposes API routes for stories, sessions, media, uploads, transcription, invitations and collaborators.
- No obvious private API keys, cloud credentials or signing secrets were found in the public JavaScript inspected.
- Anonymous requests to media and story-invitation endpoints were rejected with `401 Unauthorized`.
- Anonymous requests to session and story collection endpoints returned valid empty responses. This may be intentional guest functionality.

## Priority checks for the dev agent

### P0 — Record-level authorization

Verify that every route loads data only after checking both identity and access to the specific record. Authentication alone is insufficient.

Routes requiring particular attention:

- `/api/sessions` and `/api/sessions/*`
- `/api/stories` and `/api/stories/*`
- `/api/media` and `/api/media/*`
- `/api/media/upload-url`
- `/api/heirloom/story-invites*`
- `/api/heirloom/invites/accept`
- `/api/heirloom/members/*`
- `/api/transcribe`
- `/api/sage`

Use a centralized server-side authorization helper such as `requireStoryAccess`, `requireSessionAccess`, `requireMediaAccess` or a shared policy layer. Never trust a client-provided `user_id`, `member_id`, role, story ID or session ID without independently resolving access on the server.

### P0 — Cross-user isolation tests

Create automated integration tests using User A, User B and an anonymous visitor. For every read, update and delete route, substitute another user's story, session, media and invitation identifiers. Expected result: `403` or `404`, with no metadata leakage.

Include indirect relationships: a media item belonging to another session, a memory belonging to another story, and an invitation issued by another owner.

### P0 — Guest-session isolation

Confirm that anonymous stories and sessions:

- use cryptographically random, non-sequential identifiers;
- cannot be retrieved using an identifier alone unless that identifier is intentionally a bearer secret;
- have clear expiry and deletion rules;
- are isolated from authenticated accounts until explicitly claimed;
- cannot be claimed by a different user through identifier substitution or race conditions;
- do not expose content through server-rendered pages, logs, analytics or cache keys.

### P1 — Invitation security

Confirm that invitation tokens are high-entropy, expire, can be revoked, and are scoped to one story and intended permission. Acceptance must require the correct authenticated identity when the invite is identity-bound.

Review whether token fragments are written to browser or server logs. The client currently logs the first eight token characters during invitation handling; remove this unless it has a specific diagnostic purpose.

### P1 — Upload and media security

Confirm that upload URLs are short-lived and scoped to one authenticated user, object path, content type and maximum size. Store files privately and authorize every download independently.

Validate file content rather than trusting the extension or browser MIME type. Apply size limits, malware scanning where appropriate, safe image/document processing, and protection against malicious filenames and metadata.

### P1 — Administrative authorization

The client derives an administrator indicator from Clerk public metadata. Confirm that every administrative backend action independently validates the user's server-side role. Client-side role checks should control presentation only.

### P1 — Abuse controls

Apply rate limits and usage quotas to authentication logging, magic links, invitations, uploads, transcription and AI/chat routes. Add controls against OTP enumeration, invitation-token guessing, automated storage consumption and unbounded AI spend.

### P2 — Browser security headers

Review and add an appropriate Content Security Policy. Also confirm explicit configuration for:

- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- clickjacking protection through CSP `frame-ancestors`

HSTS is already present.

### P2 — Privacy and operational controls

- Ensure story text, transcripts, prompts, filenames, tokens and contact details are excluded or redacted from application logs.
- Encrypt production data and backups; document retention and deletion behaviour.
- Separate production from development/test credentials and Clerk environments.
- Rotate secrets and restrict service accounts to minimum required permissions.
- Add dependency scanning, secret scanning and alerting for unusual bulk reads or downloads.
- Verify that AI providers do not retain or train on user story content contrary to Heirloom's stated policy.

## Recommended acceptance criteria

Before inviting external users to store sensitive material:

1. Every API route is mapped to an explicit authentication and authorization policy.
2. Automated User A/User B/anonymous isolation tests pass for every resource and mutation.
3. Guest ownership and account-claiming behaviour has adversarial test coverage.
4. Upload and download access is private, scoped and time-limited.
5. Invitation tokens are expiring, revocable and non-reusable where appropriate.
6. Admin authorization is enforced exclusively on the server.
7. Rate limits and spending limits protect high-cost and high-abuse routes.
8. CSP and the remaining security headers are deployed and tested.
9. Production logging has been reviewed for private content and tokens.
10. A dependency and secrets scan reports no unresolved high-severity findings.

## Limits of this review

This was not a penetration test. It did not use authenticated accounts, attempt exploitation, enumerate user identifiers, submit malicious payloads or inspect the source repository, database policies, cloud configuration or server-side code. Findings are therefore verification priorities, not proof that the corresponding vulnerabilities exist.
