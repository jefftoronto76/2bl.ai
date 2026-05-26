// services/chat/ui/v1/registry.ts
//
// Concrete marker registry — the generalized successor to
// src/components/sage/parseBookingCards. The AI emits structured markers
// (e.g. [BOOKING: ...]) at the end of an assistant message; the registry
// detects every registered marker, extracts its fields, and strips it from
// the prose. Runtime, server-safe (no React, no DOM) so it can run in the
// admin transcript renderer as well as the visitor chat.
//
// parse() preserves the exact behavior of the legacy parseBookingCards for a
// single registered BOOKING marker: extract complete markers, strip a trailing
// incomplete fragment still streaming, collapse 3+ blank lines, trim.

import type {
  MarkerDefinition,
  MarkerParseResult,
  MarkerRegistry,
  ParsedMarker,
} from './types'

/** The BOOKING marker — `[BOOKING: label | description | cta_label | url]`. */
export const BOOKING_MARKER: MarkerDefinition = {
  type: 'BOOKING',
  pattern: /\[BOOKING:\s*([^|\]]*)\|\s*([^|\]]*)\|\s*([^|\]]*)\|\s*([^\]]*)\]/g,
  fieldCount: 4,
  dispatch: 'client',
}

export function createMarkerRegistry(): MarkerRegistry {
  const definitions: MarkerDefinition[] = []

  return {
    register(def: MarkerDefinition): void {
      // Last registration for a given type wins (idempotent re-registration).
      const idx = definitions.findIndex(d => d.type === def.type)
      if (idx >= 0) definitions[idx] = def
      else definitions.push(def)
    },

    parse(content: string): MarkerParseResult {
      const markers: ParsedMarker[] = []
      let prose = content

      // Extract every complete marker for each registered definition.
      for (const def of definitions) {
        // Always run with the global flag so replace covers every match,
        // and work off a fresh instance so a shared pattern's lastIndex
        // can't leak between calls.
        const flags = def.pattern.flags.includes('g')
          ? def.pattern.flags
          : def.pattern.flags + 'g'
        const re = new RegExp(def.pattern.source, flags)

        prose = prose.replace(re, (match: string, ...rest: unknown[]): string => {
          const fields: string[] = []
          for (let i = 0; i < def.fieldCount; i++) {
            const group = rest[i]
            fields.push(typeof group === 'string' ? group.trim() : '')
          }
          markers.push({ type: def.type, fields, raw: match })
          return ''
        })
      }

      // Strip a trailing incomplete fragment (a marker still streaming at the
      // end of the message) so a half-open `[TYPE: ...` never flashes as prose.
      for (const def of definitions) {
        const incomplete = new RegExp(`\\[${def.type}:[^\\]]*$`)
        prose = prose.replace(incomplete, '')
      }

      prose = prose.replace(/\n{3,}/g, '\n\n').trim()
      return { prose, markers }
    },

    getDefinitions(): MarkerDefinition[] {
      return [...definitions]
    },
  }
}
