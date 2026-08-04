# Content Service

### Content service (`services/content/`)

Content / asset / topic business logic (server-only). Backs the admin
content-family routes as thin consumers (auth + parsing + required-field
validation + response mapping). Functions return a discriminated
`ContentResult<T>` (`{ ok: true; data } | { ok: false; status; error }`).

| File | Exports | Purpose |
|------|---------|---------|
| `assets.ts` | `extractText`, `createDocumentAsset`, `ACCEPTED_TYPES`, `MAX_FILE_SIZE` (+ `CreateDocumentAssetInput`, `DocumentAsset`) | Document ingestion. `extractText(buffer, mimeType)` extracts raw text (PDF via the Anthropic `/v1/messages` document API, DOCX via mammoth, TXT via Buffer; throws on failure). `createDocumentAsset` inserts the `content` row (`type: 'document'`), uploads the original binary to the Storage `assets` bucket at `{tenant_id}/{content_id}/{filename}`, and stamps `storage_path` — the storage steps are non-fatal (logged, not failed). Backs `POST /api/admin/assets/upload` (route owns multipart parse + size/type validation). |
| `content.ts` | `createContent`, `getContent` (+ `CreateContentInput`) | `content`-row structured create + single-row tenant-scoped read. Back `POST /api/admin/content` and `GET /api/admin/content/[id]` (404 on miss). |
| `topics.ts` | `listTopics`, `createTopic` (+ `CreateTopicInput`) | `topics`-row list (ordered by name) + create, tenant-scoped. Back `GET`/`POST /api/admin/topics`. |
| `types.ts` | `AuthScope`, `ContentResult` | Shared contracts for the service. |
| `index.ts` | barrel | Re-exports the public surface above. |
