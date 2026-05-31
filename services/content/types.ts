// services/content/types.ts
//
// Shared contracts for the content service (assets, content rows, topics).

export interface AuthScope {
  owner_id: string
  tenant_id: string
}

// Success carries the payload to return; failure carries the HTTP status and
// message the route should surface, preserving the routes' exact responses.
export type ContentResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string }
