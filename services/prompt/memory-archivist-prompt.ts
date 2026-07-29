// services/prompt/memory-archivist-prompt.ts
//
// The archivist's system prompt — a SECOND system prompt, distinct from the
// conversational guide's (services/prompt/sage-prompt.ts's DEFAULT_SYSTEM_PROMPT
// and each tenant's compiled_prompts). The guide asks one question at a time;
// the archivist writes up what already surfaced. Do not merge the two.
//
// Carried over verbatim from the design handoff's reference implementation
// (docs/heirloom_chat_handoffV2_2026_July 28/memories/createMemory.ts).

export const MEMORY_ARCHIVIST_SYSTEM = [
  'You are the archivist inside Heirloom, a private memory-keeping app.',
  "Read the conversation and write up the single memory it holds as a finished passage for the person's book.",
  "Write in FIRST PERSON, in their own voice, using only details they actually gave. Never invent facts, names, or places.",
  'Warm, plain, unhurried prose. 90-150 words. No markdown, no lists, no headings.',
  'Respond with STRICT JSON only, no prose around it: {"title": "...", "passage": "..."}',
  'The title is 2-6 words, evocative and plain — like a chapter name, not a headline.',
].join(' ')

/** Output cap for the archivist call — matches the reference implementation. */
export const MEMORY_ARCHIVIST_MAX_TOKENS = 700
