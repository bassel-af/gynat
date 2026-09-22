import '@testing-library/jest-dom'
import { randomBytes } from 'node:crypto'

// Phase 10b: ensure tests that import code paths which call getMasterKey()
// have a deterministic fake key available. vitest does not load .env.local.
// Tests that exercise the "missing key" branch should use vi.stubEnv + the
// exported resetMasterKeyCache() helper to override this.
if (!process.env.WORKSPACE_MASTER_KEY) {
  process.env.WORKSPACE_MASTER_KEY = randomBytes(32).toString('base64')
}

// Node 26 ships its own `localStorage` / `sessionStorage` / `Storage` globals, but
// the storage itself is inert unless node is started with `--localstorage-file`.
// Vitest's jsdom environment only copies a window key onto the global when that key
// is NOT already on the node global, so jsdom's working web storage is skipped and
// `localStorage` reads back as undefined. The environment does expose the real
// window as `globalThis.jsdom`, so point the three globals back at jsdom's
// implementations. `Storage` is included so `Storage.prototype` stays the prototype
// the storage instances actually inherit from (tests spy on it).
const jsdomWindow = (globalThis as { jsdom?: { window: Record<string, unknown> } }).jsdom?.window
if (jsdomWindow) {
  for (const key of ['Storage', 'localStorage', 'sessionStorage']) {
    Object.defineProperty(globalThis, key, {
      value: jsdomWindow[key],
      configurable: true,
      writable: true,
    })
  }
}
