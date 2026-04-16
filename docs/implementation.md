# Implementation Reference — Solalah

Present-tense description of how each subsystem works today. For the product definition (vision, features, data model, roadmap), see `docs/prd.md`. For the codebase map (file paths, routes, commands), see `CLAUDE.md`.

This document is rewritten as the system evolves — it is not a history.

---

## 1. Stack

- **Framework**: Next.js 15 (App Router) + React 19 + TypeScript, dev server on port 4000 with Turbopack
- **Package manager**: pnpm (10.28.0)
- **Database**: PostgreSQL 15 via Prisma v7 with the `@prisma/adapter-pg` driver adapter
- **Auth**: self-hosted Supabase Auth (GoTrue v2.186.0) fronted by Kong 3.9.1, integrated via `@supabase/ssr`
- **Validation**: Zod on all request bodies and query params
- **Tree visualization**: `@xyflow/react` (React Flow) with a custom layout algorithm
- **Styling**: CSS Modules + design tokens in `src/styles/tokens/`
- **Testing**: Vitest with `@testing-library/react` and jsdom
- **Deployment**: Docker Compose (self-hosted)

Path alias `@/` points at `/src/`.

---

## 2. Auth & Sessions

GoTrue owns the `auth` schema. `public.users` mirrors it by UUID — the app never queries `auth.*` directly. On sign-up, `POST /api/auth/sync-user` (or the callback helper `src/lib/auth/sync-user.ts`) inserts the `public.users` row.

**Supported sign-in methods**: email + password, Google OAuth, magic link (passwordless email). Phone OTP is configured in GoTrue but inactive until an SMS gateway is attached.

**Middleware** (`src/middleware.ts`) has three code paths:
- Static assets: skip
- `/api/*`: refresh the session token, never redirect
- Pages: refresh the session, redirect unauthenticated users to `/auth/login`

The `?next` parameter is validated by `validateRedirectPath()` — absolute URLs, protocol-relative URLs, and `javascript:` are rejected to prevent open redirects.

**API guards**:
- `getAuthenticatedUser(request)` parses the Bearer token and verifies via Supabase
- `requireWorkspaceMember`, `requireWorkspaceAdmin`, `requireTreeEditor` compose on top for workspace-scoped routes

Rate limiting lives in `src/lib/api/rate-limit.ts` — an in-memory per-user limiter with pre-configured instances per endpoint. Kong adds a second layer on `/auth/v1/*` (30/min/IP). The in-memory limiter is single-process; it needs Redis before horizontal scaling.

---

## 3. Workspaces

A workspace is the single organizational unit. Any authenticated user can create one (capped at 5 owned workspaces per user); the creator becomes the first `workspace_admin`. Creation is atomic — workspace + membership + fresh wrapped encryption key in one `$transaction`.

**Roles**: `workspace_admin` and `workspace_member`. Content permissions (`tree_editor`, `news_editor`, `album_editor`, `event_editor`) are an array on the membership row; admins implicitly have all of them.

**Invitations**:
- Email invites (`POST /api/workspaces/[id]/members`) send a Nodemailer message via Gmail SMTP. Acceptance (`POST /api/invitations/[id]/accept`) validates status, expiry, email match, and is wrapped in `$transaction` for race safety.
- Join codes (`POST /api/workspaces/[id]/invitations/code`) — format `SLUG-XXXXXXXX`, generated via `crypto.randomBytes()` with 8 characters of alphabet `A-Z0-9` (~2.8 trillion possibilities). `POST /api/workspaces/join` redeems them; also transactional to prevent exceeding `maxUses`.

The workspace detail page lives at `/workspaces/[slug]`. Settings (audit log toggle, version control toggle, umm walad toggle, rada'a toggle, kunya toggle, branch sharing policy, privacy settings like hide-birth-dates) are admin-only.

---

## 4. Family Tree

### 4.1 Storage

Tree data lives in Prisma (`FamilyTree` + `Individual` + `Family` + `FamilyChild`). GEDCOM is only a transport format for import/export. Each workspace has exactly one tree; `FamilyTree.lastModifiedAt` bumps on every mutation for ETag invalidation.

Types mirror `GedcomData`:
- `Individual`: name, sex, birth/death (date + hijri + place + description + notes), kunya, `isPrivate`, `isDeceased`
- `Family`: husband, wife, children, marriage contract (MARC), marriage (MARR), divorce (DIV) events, `isDivorced`, `isUmmWalad`
- `RadaFamily` + `RadaFamilyChild`: milk kinship, completely separate from lineage

### 4.2 Read path

`GET /api/workspaces/[id]/tree`:
1. Loads the tree with its unwrapped workspace key
2. In parallel, fetches every unique source workspace for active branch pointers
3. Decrypts all fields via `dbTreeToGedcomData(tree, workspaceKey)`
4. Merges pointed subtrees at the anchor points (see §5)
5. Runs `redactPrivateIndividuals()` to strip PII from `isPrivate` rows (names → "خاص", dates/places cleared, structure preserved)
6. Responds with `GedcomData`, `Cache-Control: private, max-age=30, stale-while-revalidate=300`, and an ETag. `If-None-Match` short-circuits to 304.

Search runs client-side via `matchesSearch()` (multi-word, diacritic-stripping, case-insensitive Arabic/Latin).

### 4.3 Mutations

All 19 mutation routes:
- Parse and validate the body via `parseValidatedBody(request, zodSchema)` with `.max()` bounds on every string field
- Guard against mutating pointed (`_pointed: true`) individuals and synthetic family IDs (from merged subtrees)
- Encrypt PII fields on write using the workspace key
- Capture snapshot-based audit entries (see §8)
- Call `touchTreeTimestamp()` to bump the ETag
- Return a generic 500 on unknown errors — no stack trace leakage

Key endpoints:
- Individuals: POST / PATCH / DELETE
- Families: POST / PATCH / DELETE — gender validated by `validateFamilyGender()` (rejects known-same-sex spouse pairs, allows unknown); duplicate families rejected (`(h,w)` and `(w,h)`); self-marriage (`husbandId === wifeId`) rejected
- Family children: POST (add) / DELETE (remove) / POST move
- Rada'a families + children under `/tree/rada-families/`
- Export: `GET /tree/export?version=5.5.1|7.0`
- Import: `POST /tree/import` (empty tree only, 7 MB file limit, 10K record cap, 409 on non-empty)
- Audit log: `GET /tree/audit-log` (admin-only, feature-flag gated, paginated, rate-limited 60/min)

### 4.4 Editing flows

`usePersonActions` is the state machine powering the PersonDetail sidebar. Modes: `edit`, `addChild`, `addSpouse`, `addParent`, `addSibling`, `editFamilyEvent`, `moveSubtree`, `linkSpouse`, `unlinkSpouse`.

- **Add child**: `FamilyPickerModal` appears when the target has multiple `familiesAsSpouse` (polygamy). Single family → direct.
- **Add parent**: button hidden when both parents exist; sex locked to the missing parent when one exists. Server enforces parent-slot uniqueness (409).
- **Add sibling**: only shown when `familyAsChild` exists (no picker needed — a person has exactly one birth family).
- **Add spouse**: sex auto-locked to opposite of the selected person; auto-opens `FamilyEventForm` after creation.
- **Link existing spouse**: `IndividualPicker` with opposite-sex filter + exclude set (self + existing spouses + pointed individuals).
- **Unlink spouse**: if the family has no children, DELETE the family; otherwise PATCH to null the spouse slot.
- **Move subtree**: replaces the old single-child-between-families move. Updates the person's `FamilyChild` row; descendants follow through their own family chains. Cycle detection runs as a bounded BFS inside the transaction — if the target family's parents are in the moving subtree, reject.

### 4.5 Cascade delete

`computeDeleteImpact()` in `src/lib/tree/cascade-delete.ts` does a BFS reachability analysis from the lineage roots:
- Married-in spouses (whose every spouse has a `familyAsChild`) are excluded from BFS seeds
- Upward traversal is guarded: we do not walk up through families where the target is a parent (prevents cross-married children from "rescuing" affected branches)
- `computeVersionHash()` guards against stale data between preview and confirmation

`GET /tree/individuals/[id]/delete-impact` returns affected count, up to 20 names, pointer/token counts, a version hash, and whether the confirmation name gate applies (5+ affected). A dedicated `cascadePreviewLimiter` allows 10 req/min.

`DELETE /tree/individuals/[id]` with `{ cascade, versionHash, confirmationName }`:
- 409 on stale hash (client auto-refreshes impact)
- Server-side name check when 5+ affected
- Atomic transaction: delete FamilyChild/RadaFamilyChild, null spouse refs, break active branch pointers, revoke share tokens, delete UserTreeLinks, clear WorkspaceInvitation refs, delete individuals, clean up emptied families, write a single `cascade_delete` audit entry

`CascadeDeleteModal` shows names as chips, a scrollable list, and the name-typing gate.

### 4.6 Layout & visualization

The custom layout (`FamilyTree/layout.ts`) runs two passes: bottom-up for subtree widths (post-order), top-down for sibling-adjacent placement (pre-order). Polygamous families get color-coded edges per spouse.

**Graft envelopes**: when a married-in spouse has external family (`hasExternalFamily()`), the layout reserves width for inline rendering of their parents and up to `MAX_GRAFT_SIBLINGS = 4` siblings. Built from `computeGraftDescriptors()`. Graft nodes use the `graft-{parent|sibling}-{personId}` ID prefix; click handlers strip the prefix.

**Re-root on spouse's ancestor**: a badge on married-in spouse cards re-roots the tree to the spouse's topmost ancestor (`findTopmostAncestor()` walks up `familyAsChild` chains). `RootBackChip` (inside the `CanvasToolbar`) returns to the original root. Viewport pan/zoom is saved and restored across these transitions via `initialRootId` in `TreeContext`.

Multi-root view is disabled — the `ViewMode` type and code paths are preserved for future re-enablement.

### 4.7 Islamic extensions

- `_UMM_WALAD` flag on Family, gated by workspace `enableUmmWalad`. Toggling on clears MARC/MARR fields server-side. Sidebar renders "أمهات الأولاد" for men, "السيّد" label for women.
- Rada'a (milk kinship), gated by `enableRadaa`. `RadaFamily` + `RadaFamilyChild` are separate from lineage. `IndividualPicker` powers parent/child selection. Excluded from branch pointer merge, extract, and deep copy (workspace-specific metadata).
- `_KUNYA` (الكنية) on Individual, gated by `enableKunya`.
- `@#DHIJRI@` calendar escape recognized on every DATE line (BIRT/DEAT/MARC/MARR/DIV). Hijri month codes (MUHAR, SAFAR, …) convert to numeric before storage.
- Calendar preference (`hijri` | `gregorian`) lives on `public.users` and is mirrored to localStorage via `useCalendarPreference`. `getPreferredDate` / `getSecondaryDate` / `getDateSuffix` drive display.

### 4.8 Places

The `Place` table is a two-tier lookup: ~20K global seed entries from GeoNames (hierarchical via `parentId`: city → region → country, bilingual names) plus workspace-custom entries (workspaceId set). `PlaceComboBox` runs debounced searches against `GET /api/workspaces/[id]/places?q=…`, with diacritics-insensitive matching and an inline "create new place" flow. `POST /api/workspaces/[id]/places` requires `tree_editor`.

Place names are intentionally plaintext — global seed places are publicly known geography, and the privacy value of encrypting them is marginal.

---

## 5. Branch Pointers

A branch pointer is a read-only reference from workspace B (target) to a subtree rooted at an individual in workspace A (source). The source edits propagate live to the target at read time; the target cannot edit the pointed rows.

### 5.1 Share tokens

`BranchShareToken` holds a SHA-256 hash (never the plaintext) of a 256-bit token generated via `crypto.randomBytes(32)` with `brsh_` prefix. Scope: either a specific target workspace UUID (not slug — immune to re-registration) or public. Includes depth limit, include-grafts flag, expiry, and max uses.

Error messages for all rejection paths (revoked, expired, wrong scope, invalid) are deliberately generic — no info leakage.

### 5.2 Redemption

`POST /api/workspaces/[id]/branch-pointers`:
- Re-checks token revocation inside the transaction (race protection)
- Runs the four stitching rules:
  1. **Child/sibling**: reject if the selected person has parents in the source subtree (would conflict with the anchor's parents or family position)
  2. **Parent**: reject if the anchor already has a parent of the selected person's gender
  3. **Spouse**: if the selected person has children without a parent matching the anchor's gender, ask the admin "is the anchor their father/mother?" and store on `BranchPointer.linkChildrenToAnchor`
  4. **One pointer per anchor** — duplicates rejected
- Validates gender via `validateFamilyGender()`
- Creates the pointer, binds it to the share token

### 5.3 Live merge

At read time, the target's tree fetcher pulls the source subtree in parallel (deduplicated by source workspace ID), decrypts with the source workspace's key, and merges into the target tree at the anchor:
- `extractPointedSubtree()` pulls only what's reachable within the depth limit
- `mergePointedSubtree()` stitches via a synthetic family at the anchor, applying Rule 3's `linkChildrenToAnchor`
- Pointed rows are marked `_pointed: true` with `_sourceWorkspaceId` and `_pointerId`
- Pointed edges get teal dashed styling; pointed cards get a teal badge and dashed border

Branch pointer logic (`branch-pointer-merge.ts`) operates only on plaintext `GedcomData` — decryption happens upstream. Ciphertext never crosses workspace boundaries; a test asserts that a row encrypted with key B throws when decrypted with key A.

### 5.4 Mutations

Target mutations against pointed individuals return 403; against synthetic family IDs they return 400. All 9 PII-bearing mutation routes honor this.

### 5.5 Lifecycle

From the sidebar, admins can:
- **فصل (disconnect)**: mark the pointer `broken`. Data disappears from the target. No deep copy.
- **نسخ (copy)**: `prepareDeepCopy()` remaps all IDs and nulls workspace-specific placeIds; `persistDeepCopy()` writes rows and re-encrypts with the target workspace's key. Pointer flips to `broken`.

From the source settings:
- **تعطيل (disable)**: toggles `isRevoked` without touching existing pointers — reversible.
- **إلغاء الربط (revoke)**: auto deep-copies all active pointers into their target workspaces, then marks them `revoked`.

GEDCOM export fetches source workspace keys in parallel and decrypts each merged subtree before serializing.

---

## 6. Encryption

Two layers, defense in depth.

### 6.1 Layer 1 — disk

A LUKS2-encrypted Hetzner volume at `/mnt/encrypted`, unlocked at boot via a random 512-byte keyfile at `/root/.jeenat-luks.key` (mode 600). The app, PostgreSQL data directory, pm2 state, and backups all live on it. See `docs/deployment/layer-1-encryption.md`.

This protects against stolen disks, leaked backups, orphaned volume reassignment, and physical theft. It does **not** protect against live SSH / running-application access — the keyfile is on the root FS at this stage. Phase 10c (Tang + Clevis) closes that gap.

### 6.2 Layer 2 — per-workspace application encryption

Every workspace has an AES-256-GCM data key generated on create and stored wrapped in `Workspace.encryptedKey` (bytes). The wrapping key (`WORKSPACE_MASTER_KEY`, base64-encoded 32 bytes) is loaded at module load in `src/lib/db.ts` — missing, empty, or malformed keys halt server boot, not the first request.

**Primitives** (`src/lib/crypto/workspace-encryption.ts`):
- `generateWorkspaceKey`, `wrapKey`, `unwrapKey`
- `encryptField(plaintext, key)`, `decryptField(ciphertext, key)` — AES-256-GCM, fresh 12-byte random nonce per call, packed format `iv(12) || authTag(16) || ciphertext(N)`
- Decrypt failures always throw. There is no silent fallback.
- `getMasterKey()` in `src/lib/crypto/master-key.ts` is memoized; error messages never leak key material.

**Domain adapter** (`src/lib/tree/encryption.ts`) — field-list-driven:
- Individual (15 fields): `givenName`, `surname`, `fullName`, `kunya`, `notes`, plus birth/death `date`, `hijriDate`, `place`, `description`, `notes`
- Family (15 fields): for each of MARC / MARR / DIV: `date`, `hijriDate`, `place`, `description`, `notes`
- RadaFamily: `notes`
- TreeEditLog: `description` and `payload` are `Bytes?` and encrypted as raw AES-256-GCM blobs. `snapshotBefore` / `snapshotAfter` stay `Json?` but wrapped in `{ _encrypted: true, data: "<base64>" }` envelopes. Top-level indexable columns (`action`, `entityType`, `entityId`, `userId`, `timestamp`) stay plaintext so queries work.

Legacy plaintext rows coexist via a sentinel pass-through on `decryptSnapshot` — older audit rows keep rendering while new ones are encrypted.

**Intentionally plaintext** (needed for queries, layout, integrity):
- IDs, foreign keys, `placeId` references
- Flags: `isPrivate`, `isDeceased`, `sex`, `isUmmWalad`, `isDivorced`
- Timestamps
- Junction tables: `FamilyChild`, `RadaFamilyChild`
- Place names (see §4.8)

**Read path**: `dbTreeToGedcomData(tree, workspaceKey)` decrypts all rows inline; the audit log read path parallel-decrypts snapshot envelopes; GEDCOM export parallel-decrypts the main tree and every unique pointer source workspace.

**Write path**: all 9 PII-bearing mutation routes encrypt before insert/update. Junction-table routes (FK-only) correctly skip encryption.

**Branch pointer deep copy** takes a 4th `targetWorkspaceKey` arg and re-encrypts every row with the target key. Ciphertext isolation across workspaces is covered by a round-trip test.

**Operational**:
- Operator runbook at `docs/encryption.md` — key generation, backup, recovery, rotation, incident response
- `AdminAccessLog` model + `logAdminAccess()` helper are scaffolded for future admin-only route wiring; audit-immortal across user deletion; field-length capped; PII-free error logs
- Swallowed audit write errors use `logSwallowedAuditError()` — logs class name + stable entity ref only, never `err.message`
- Migration script `scripts/encrypt-existing-data.ts` (`pnpm encrypt:existing`) is idempotent, with a UTF-8 guard (`isLikelyPlaintextUtf8()`) that rejects binary control bytes before attempting to re-encrypt legacy plaintext. Companion: `scripts/verify-encryption.ts`

---

## 7. Session Undo (Ctrl+Z)

`UndoStackProvider` is mounted inside `WorkspaceTreeProvider` and auto-clears on workspace switch via remount keyed on `workspaceId`. Per-tab, in-memory, size 100, FIFO eviction. Redo stack is cleared on any new push.

`useKeyboardUndoRedo` listens on `document` and drops:
- `event.repeat`
- `event.isComposing`
- `event.defaultPrevented`
- Focus inside INPUT / TEXTAREA / contenteditable

`usePersonActions` wires 14 handler variants through `useUndoableAction`. Entries are only pushed after both the action API call and the subsequent `refreshTree` succeed. On undo/redo, the inverse API call runs and `refreshTree` awaits — if refresh fails, both stacks drop and `ConflictDialog` surfaces. Any non-2xx on the inverse drops stacks; 401/403 shows an auth-specific dialog variant.

**Inverse builders** (`src/lib/tree/undo-builders.ts`) cover 12 operations: individual create/update/delete, family create/update/delete, family children add/remove/move, rada'a family create/update/delete. Labels come from `buildUndoLabel()` (gendered variants, 40-char truncation).

**Server side**: `apiFetch({ isUndo: true })` sends `X-Solalah-Undo: true`. `isUndoRequest()` is read in 11 mutation routes and passed to `buildAuditDescription(..., { isUndo })`, which prefixes audit entries with "تراجع عن: ". No new action enum values, no schema changes — `restoreSnapshot` and `undoOfLogId` are deferred to Phase 15b.

**Deliberately NOT undoable** (scoped to Phase 15b/15c or never): cascade delete, branch pointer ops, deep copy, GEDCOM import.

UI: `UndoRedoButtons` in `CanvasToolbar` (icon-only, platform-aware tooltips with Cmd on Mac / Ctrl elsewhere, disabled states, in-flight spinner). `ConflictDialog` built on the existing `Modal` — info-blue, no ESC/overlay close. Toasts carry `role="status" aria-live="polite" aria-atomic="true"`.

---

## 8. Audit Log

Snapshot-based. Every mutation captures `snapshotBefore` and `snapshotAfter` as JSON via the `snapshotIndividual` / `snapshotFamily` / `snapshotRadaFamily` / `snapshotBranchPointer` extractors. `buildAuditDescription()` produces an Arabic human-readable one-liner.

Gated by two workspace toggles:
- `enableAuditLog` — gates the `/tree/audit` page and the `GET /tree/audit-log` endpoint (403 when off). Snapshots are captured regardless, so switching the toggle on retroactively exposes history.
- `enableVersionControl` — depends on `enableAuditLog` (auto-disables when audit is off). UI placeholder for future restore.

Read path: admin-only, paginated (max 50/page, default 20), filterable by action / entityType / entityId / userId, rate-limited 60/min. `description` and `payload` are decrypted on read; snapshot envelopes are decrypted in parallel with the Prisma query.

UI: `AuditLogList` on `/workspaces/[slug]/tree/audit` with filtering, pagination, and expandable diffs. `AuditLogEntry` shows color-coded action badges (green=create, blue=update, red=delete, amber=move), entity type badges, user avatar, and relative timestamps. `AuditLogDiff` renders Arabic field labels, color-coded added/removed/changed values, and hides internal ID fields. Sidebar per-person history (collapsible, last 5 entries, admin-only) hits the same endpoint filtered by entityId.

Legacy pre-snapshot entries render with "لا تتوفر تفاصيل التغييرات".

---

## 9. GEDCOM Import / Export

### 9.1 Parser (`src/lib/gedcom/parser.ts`)

Handles 5.5.1 with all Islamic extensions:
- `@#DHIJRI@` calendar escape on DATE lines (under BIRT / DEAT / MARC / MARR / DIV) routes to `hijriDate` fields; Hijri month codes normalize to numeric
- MARC / MARR / DIV under FAM with sub-tags `DATE`, `PLAC`, `NOTE`
- Inline event descriptors captured (e.g. `1 DEAT توفيت بالسرطان`)
- Level 2 `NOTE` under `BIRT`/`DEAT` with level 3 `CONT`/`CONC`
- Standalone NOTE records (`0 @ID@ NOTE` + `1 CONT`) resolved via `1 NOTE @ID@` references
- `_UMM_WALAD`, `_RADA_FAM` / `_RADA_WIFE` / `_RADA_HUSB` / `_RADA_CHIL`, `_RADA_FAMC`, `_KUNYA`
- BOM stripping

### 9.2 Export (`src/lib/gedcom/exporter.ts`)

`GET /tree/export?version=5.5.1|7.0` — any member can export. Output includes all Islamic extensions, GIVN / SURN sub-tags. Privacy redaction runs first; pointed data is excluded; every user string passes through GEDCOM-injection sanitization. Rate-limited.

### 9.3 Import

`POST /tree/import` — tree_editor only, empty tree only (409 otherwise), multipart form, 7 MB file limit, 10K record cap. Seed helpers are reused for RadaFamily / RadaFamilyChild creation. Import is intentionally not Ctrl+Z-undoable.

---

## 10. Security Posture

- **Headers** (`next.config.ts`): X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS, X-DNS-Prefetch-Control on all routes; `X-Robots-Tag: noindex` on `/api/*`
- **Rate limiting**: Kong (30/min on auth) + in-memory per-user limiters per endpoint
- **Input validation**: all Zod schemas have `.max()` bounds (slug ≤ 64, names ≤ 200, description ≤ 2000, dates ≤ 50, places ≤ 500, email ≤ 254, notes ≤ 5000)
- **Privacy enforcement**: `redactPrivateIndividuals()` runs server-side before every tree response
- **Error handling**: unknown errors return generic 500 — no stack traces in responses
- **Email templates**: `escapeHtml()` on every dynamic value; `inviteUrl` must be `https://` to be inlined in `href`; subject lines stripped of `\r\n` to prevent header injection
- **Docker secrets** use `:?` required syntax — Docker Compose refuses to start without them
- **Port binding**: PostgreSQL, GoTrue, Studio bound to `127.0.0.1`; Kong 8000 is the only externally accessible port
- **CORS**: Kong origins restricted (no wildcard)
- **Email verification**: `GOTRUE_MAILER_AUTOCONFIRM` is off — signup requires confirmation
- **Member list** returns only `id`, `displayName`, `avatarUrl` (no email/phone)
- **Invitation errors** are consolidated into a generic message to prevent enumeration
- **Workspace creation**: capped at 5 owned per user; rate-limited
- **Search engine indexing**: `robots.txt` disallow-all + explicit allow-list for 6 public pages; `sitemap.xml` lists only public URLs; `?next=` is disallowed so slugs can't leak

---

## 11. Profile & Preferences

`/profile` is sectioned:
- `ProfileHeader` — 96px avatar + display name + email
- `AccountSettings` — email change via Supabase `updateUser()` with confirmation flow (`/auth/confirm` page, PKCE callback, GoTrue→`public.users` sync, success toast via `?email_changed=true`)
- `SecuritySettings` — password change via Supabase `updateUser()`
- `TreeDisplaySettings` — tree color theme + calendar preference, persisted per-user via `GET/PATCH /api/users/me/preferences`
- Danger-zone logout (separate from the `UserNav` logout for contextual clarity)

`UserNav` is shared across `/workspaces`, `/profile`, `/workspaces/[slug]`; `CanvasToolbar` wraps it plus the back-to-workspace link and `RootBackChip` inside a single floating pill.

---

## 12. Dev & Ops

- `pnpm dev` — port 4000 with Turbopack (must stay running during work; never run `pnpm build` against a live dev server — it corrupts `.next/`)
- `cd docker && docker compose up -d` — full Supabase stack
- `npx prisma migrate dev`, `npx prisma generate`, `npx prisma studio`
- `pnpm seed` / `pnpm seed:places`
- `pnpm clean:links` — delete all branch pointers + share tokens
- `pnpm reseed:tree` / `pnpm reseed:places` / `pnpm reseed:all`
- `pnpm start:fresh` — full clean + reseed
- `pnpm preprocess-geonames` — rebuild `prisma/seed-data/places.json`
- `pnpm encrypt:existing` — idempotent re-encryption of legacy plaintext rows
- `pnpm smoke` — hits key endpoints on the running dev server to catch runtime errors that mocked unit tests miss
- `pnpm test` / `pnpm test:watch`

Test layout:
- All test files centralized in `src/test/` (not co-located)
- Fixtures in `src/test/fixtures/`
- `*.test.ts` / `*.test.tsx`
- Browser test route: `http://localhost:4000/test?only=canvas` (see `docs/testing.md`)

Production server: Hetzner, SSH-restricted, MFA on admin accounts. Deployment is git-pull + build via the deployer agent; `docs/deployment/layer-1-encryption.md` covers disk-encryption recovery.
