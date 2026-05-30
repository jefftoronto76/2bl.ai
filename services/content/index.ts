// services/content/ — content / asset / topic business logic (server-only).
//
// Backs the admin content routes (assets/upload, content[/id], topics) as thin
// consumers. Validation + data-access + document text-extraction live here.

export type { AuthScope, ContentResult } from './types'
export {
  ACCEPTED_TYPES,
  MAX_FILE_SIZE,
  extractText,
  createDocumentAsset,
  type CreateDocumentAssetInput,
  type DocumentAsset,
} from './assets'
export { createContent, getContent, type CreateContentInput } from './content'
export { listTopics, createTopic, type CreateTopicInput } from './topics'
