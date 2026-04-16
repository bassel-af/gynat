/**
 * Session Undo (Phase 15a) — type definitions.
 *
 * TRUST BOUNDARY:
 *   Snapshots captured inside undo entries are UI convenience only, not a
 *   security boundary. Any user with DevTools can tamper with them before
 *   redo. Server routes MUST re-validate (Zod + authz) every inverse call.
 *
 * PERSISTENCE:
 *   The undo stack is strictly in-memory, per-tab, for the lifetime of the
 *   mounted tree page. It MUST NOT be persisted to localStorage,
 *   sessionStorage, IndexedDB, cookies, BroadcastChannel, or serialized via
 *   postMessage/structuredClone. Page reload and workspace switch clear it
 *   by design.
 *
 * PII:
 *   Labels may contain decrypted person names. Labels are safe in JSX text
 *   nodes (React auto-escapes). They MUST NOT be interpolated into
 *   Error.message, console.*, analytics events, or any telemetry payload.
 */

export interface UndoEntry {
  /** Arabic UI label; may contain decrypted names. UI-layer only, never log. */
  label: string;
  /** Workspace scope; checked at dispatch to guard against stale workspace context. */
  workspaceId: string;
  /** Inverse action (revert the original mutation). */
  undo: () => Promise<void>;
  /** Re-apply the original mutation. */
  redo: () => Promise<void>;
}

export interface UndoStackState {
  past: UndoEntry[];
  future: UndoEntry[];
}
