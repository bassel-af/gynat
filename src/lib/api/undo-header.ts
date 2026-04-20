/**
 * Session Undo (Phase 15a) — server-side helper for reading the
 * `X-Gynat-Undo` header. Only tags the audit description; does NOT
 * introduce new `action` enum values (deferred to 15b).
 */
export function isUndoRequest(request: Request): boolean {
  return request.headers.get('X-Gynat-Undo') === 'true';
}
