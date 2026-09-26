# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository ("gynat") is a **family collaboration platform** evolving from a read-only genealogy viewer. Built with Next.js 15 (App Router, Turbopack) + React 19 + TypeScript, backed by PostgreSQL 15 (Prisma 7 with the `@prisma/adapter-pg` driver adapter) and self-hosted Supabase Auth (GoTrue behind Kong, via Docker Compose). The app is RTL with Arabic as the primary language. Styling is CSS Modules + design tokens (`src/styles/tokens/`); the tree canvas is @xyflow/react with a custom layout; validation is Zod; tests are Vitest + @testing-library/react + jsdom.

The tree reads from the database via `GET /api/workspaces/[id]/tree`; static GEDCOM files in `/public/` are preserved for seeding only. Workspace data at rest is double-encrypted: LUKS2 disk volume underneath per-workspace AES-256-GCM application encryption gated by `WORKSPACE_MASTER_KEY`. Tree edits are Ctrl+Z-undoable in-session via a per-tab stack; cascade delete, branch pointer ops, GEDCOM import, and sources admin-page/bulk actions are intentionally NOT undoable.

## Where to look first

- **Detailed per-file / per-route reference** (every lib function, hook, API route, component): `docs/code-reference.md`
- **How each subsystem works today**: `docs/implementation.md` (§4.9 «قفزة نسب», §4.10 Sources, §5 Branch pointers, §5b Public tree, §6 Encryption, §7 Undo)
- **Product definition** (vision, features, roadmap): `docs/prd.md`; Collections/public tree: `docs/prd-public-tree-collections.md`; admin dashboard: `docs/prd-admin-dashboard.md`
- **Auth architecture decisions**: `docs/auth-provider-decisions.md`
- **Encryption operator runbook**: `docs/encryption.md`
- **Production runbook** (deploy/restore/troubleshooting): `docs/deployment/runbook.md`
- **Testing modes & query params**: `docs/testing.md`
- **Local setup**: `docs/setup.md`
- **File/folder layout reference**: `docs/project-structure.md`

## Common Commands

Package manager is **pnpm** (10.28.0). Dev server runs on **port 4000**.

- `pnpm dev` - Dev server (Turbopack, port 4000). Never run `pnpm build` while dev is running — it corrupts `.next/`
- `pnpm typecheck` - `tsc --noEmit` (also gated in CI, `.github/workflows/typecheck.yml`). No lint script exists — typecheck + tests are the gates
- `pnpm test` - Run all unit tests once; `pnpm test src/test/display.test.ts` for a single file; `pnpm test:watch`
- `pnpm test:e2e` - Vitest e2e (`vitest.e2e.config.ts`; email flows only)
- `pnpm test:e2e:browser` - Playwright specs in `e2e-browser/`
- `pnpm smoke` - Smoke tests (`scripts/smoke-test.ts`)
- `cd docker && docker compose up -d` / `down` - Supabase stack (PostgreSQL 5432, GoTrue 9999, Kong 8000, Studio 3001; only Kong is externally bound; secrets in `docker/.env`)
- `npx prisma generate` - Regenerate client (also on `postinstall`); output in `generated/prisma/` (gitignored). `npx prisma studio` to browse
- **Migrations — do NOT use `npx prisma migrate dev`**: it fails on the shadow DB (the `20260425043800_add_live_presence` migration has a `RAISE EXCEPTION` guard). Instead: `npx prisma migrate diff` (live DB → schema) to generate SQL, hand-add anything `schema.prisma` can't express (see "Hand-added SQL" below), save as `prisma/migrations/<timestamp>_<name>/migration.sql`, apply with `npx prisma migrate deploy`, then `npx prisma generate`. Restart `pnpm dev` afterwards — the running server keeps a stale Prisma client and 500s
- Seeding: `pnpm seed` (workspaces + tree + places; needs an admin user first, see `docs/setup.md`), `pnpm seed:places`, `pnpm clean:links`, `pnpm reseed:tree`, `pnpm reseed:places`, `pnpm reseed:all`, `pnpm start:fresh`, `pnpm preprocess-geonames`
- `pnpm encrypt:existing` - Migrate plaintext rows to ciphertext (idempotent; loads `.env.local`)
- `pnpm seo:ping` - Notify search engines of sitemap changes (`scripts/seo-ping.ts`)

## Architecture (big picture)

Path alias: `@/` → `src/`. All tests live in `src/test/` (fixtures in `src/test/fixtures/`), named `*.test.ts(x)`.

### Data model & request flow

- Tree data is stored relationally (`Individual`, `Family`, `FamilyChild`, `RadaFamily`, `AncestryJump`, …) scoped by `FamilyTree`. A `Workspace` has one `main` tree plus unlimited `extra` trees (`TreeKind`), which exist only inside Collections.
- `src/lib/tree/mapper.ts#dbTreeToGedcomData()` turns DB rows into the client's `GedcomData` shape (`src/lib/gedcom/types.ts`) — the same shape the GEDCOM parser produces, so all graph/display code works on one model.
- Read flow: `/workspaces/{slug}/tree` → `WorkspaceTreeClient` → `GET /api/workspaces/[id]/tree` (private people redacted server-side, branch-pointer subtrees merged in, ETag keyed on `FamilyTree.lastModifiedAt`) → `TreeContext.setData()` → `FamilyTree`/`Sidebar`/`SearchBar` via `useTree()`. `WorkspaceTreeContext` (`useWorkspaceTree()`) carries `workspaceId`, `canEdit`, `isAdmin`, `refreshTree()`, `pointers`.
- **Every tree mutation route must call `touchTreeTimestamp(treeId)`** (ETag invalidation) — except sources routes, since sources are not in the tree payload.
- **Multi-tree targeting**: tree read/mutation routes accept an optional `treeId` (query param for reads, body field for mutations); absent → the `main` tree. Resolve it once with `resolveTargetTreeOr404()` (scoped `{ id, workspaceId, kind }`, fail-closed 404). Branch-pointer / visibility-toggle-freeze / import / audit-log routes stay main-only.
- Route boilerplate: `parseValidatedBody(request, zodSchema)` + `isParseError()` (`src/lib/api/route-helpers.ts`); guards in `src/lib/api/workspace-auth.ts` (`requireWorkspaceMember/Admin`, `requireTreeEditor`, `requireCollectionEditor`, and `requireCollectionsEnabled` — called FIRST, before auth, returns 404 when off); per-user in-memory rate limiters in `src/lib/api/rate-limit.ts` (single-process); client calls go through `apiFetch()` (`src/lib/api/client.ts`, attaches Bearer token).
- Auth: `@supabase/ssr` cookie sessions; `src/middleware.ts` has three paths (static skip / API session-refresh only / pages refresh + login redirect). Server-side token verification uses one ssr-client factory pinned to the public host's cookie name — never build a Supabase server client elsewhere.

### Graph & display layer (`src/lib/gedcom/`)

- `graph.ts` traversals take `TraversalOptions.includeJumps` — **default `false`, fail-closed** (code unaware of «قفزة نسب» never invents a parent). Opted in only by the canvas (`buildTreeData`), `TreeContext`, the person-page spine, and `findDefaultRoot`.
- `display.ts#getDisplayNameWithNasab` builds the Arabic nasab chain (بن/بنت); depth-2 output is locked byte-identical by `nasab-depth2-lock.test.ts`.
- Canvas layout (`src/components/tree/FamilyTree/layout.ts`): bottom-up subtree widths, top-down placement, graft envelopes for married-in spouses' families. The layout derives structure from the edges array, so a «قفزة نسب» is just an extra dashed `jump-<id>` edge.

### Surfaces and their privacy boundaries

There are three separate read surfaces; keep them separate:
1. **Member tree** — `GET /tree`, `redactPrivateIndividuals()` (mapper).
2. **Public tree** (`/family/[slug]`, `/api/family/[slug]/*`) — deny-by-default; ONE serve layer `src/lib/tree/public-serve.ts`, structurally barred from the member merge; ONE redactor `public-visibility.ts#redactForPublic`; living-birth-date rule in `birth-date-privacy.ts`. Unknown / private / hidden → identical 404 (no existence oracle). Indexability: `isPublicTreeIndexable` (main + `public_listed`) and `isPublicPersonPageIndexable` (listed + per-tree opt-in) are the single predicates; extra trees are always `noindex`.
3. **Person Page** — `src/lib/tree/person-projection.ts#projectPerson`, ONE pure function for both member and public (behavior injected via `ProjectOptions`). Invariants (tested): upward walks emit a cross-workspace boundary chip but never climb past it; private people are omitted everywhere except as a non-clickable «خاص» placeholder in a direct-ancestor nasab slot. Bump `PROJECTION_ETAG_VERSION` on any projection logic change. `person-jsonld.ts` emits schema.org only when indexable.

Collections have their own public layer (`src/lib/collections/public-serve.ts`, live effective-visibility recomputed per item, cross-workspace borrows re-check `allowReuse`).

### Branch pointers & copies

`BranchPointer` live-links a subtree from another workspace into an anchor (`branch-pointer-merge.ts`, downward-only). `isCollectionLink: true` pointers are anchor-less collection borrows — every target-side reader must filter `isCollectionLink: false` (fail-closed). Deep copy (`branch-pointer-deep-copy.ts`: pure `prepareDeepCopy` + `persistDeepCopy`) is shared by pointer copy, token revoke, going-private freeze, collection copies and extra-tree duplicate; inside every copy transaction `copyAncestryJumps` (only if both ends landed) and `source-copy.ts#copySources` also run. Borrowed people carry `_pointed` and are read-only/served only by their owner.

### «قفزة نسب» (ancestry jump) — `docs/implementation.md` §4.9

A claim "descendant P is من وَلَد ancestor family F" with collapsed generations. Always points at a `Family` (a lone ancestor is a one-spouse family); one per person (`@@unique([treeId, descendantId])`). Creating is gated by the workspace's `enableAncestryJumps` toggle (off by default); edit/delete/import/copies/reads ignore the toggle. **Parent backstop**: a jump-carrying person may gain parents ONLY via `…/ancestry-jumps/[jumpId]/move-to-new-father`; every other parent-adding route returns 409 `code: 'child_has_jump'` (`ancestry-jump-guards.ts`). `computeDeleteImpact` is deliberately jump-blind. Public redaction keeps a jump only when the descendant and every ancestor spouse are public. JSON-LD emits the ancestor only as `relatedTo`.

### Sources («المصادر») — `docs/implementation.md` §4.10

`SourceEntry` (encrypted text, 3 levels `admins`/`members`/`public`) linked to many people via `SourceLink`; files split into `SourceFile` (metadata) + `SourceFileData` (bytes) so `include: { files: true }` never loads contents. Rules:
- ONE gate: `src/lib/tree/source-visibility.ts` (`canViewSourceEntry`, `visibleLinkedPeople` — the only input for names/counts, `canViewSourceAnywhere`). Every hidden case → identical 404 «غير موجود».
- Sources NEVER enter the tree payload, `GedcomData`, SSR, OG, sitemap or JSON-LD; `stripSourceKeys` is the backstop in all redactors. Public viewers never get people lists or counts.
- Uploads are staged then attached; magic-byte allow-list, images re-encoded with `sharp` (metadata stripped), active/encrypted PDFs refused, 8 MB cap, workspace quota under row lock.
- Cross-workspace copies carry only level-3 sources linked to publicly-shown people, re-encrypted under the target key.

### Encryption

Per-workspace keys wrap encrypted `Bytes` columns (names/notes/text/files). DTOs must hand-list plaintext fields — never return a raw `Bytes` column (see `jumpDto()` pattern). Cross-workspace copies decrypt with the source key and re-encrypt with the target key. Audit snapshots put sensitive text inside the encrypted envelope, never in `description`.

### Admin dashboard (`/admin`, `src/lib/admin/`)

Platform-owner only (`User.isPlatformOwner`, flipped by manual SQL only — never from the API), checked in middleware + route + layout. Every admin read writes an `AdminAccessLog` row via `logAdminAccess()` (never throws). All cross-workspace reads go through `src/lib/admin/queries.ts`; responses cached per user via `withUserCache` (60 s; presence 5 s). Live presence: `trackPresence()` (fire-and-forget, throttled, LRU) is called from middleware (skipping `/admin/*`) and `getAuthenticatedUser`; `normalizeRoutePattern` stores route patterns only — never raw URLs, UUIDs or slugs. Per-workspace breakdowns are k-anonymity gated (membership ≥ 5).

### Prisma notes

- `_count` with `where` inside `include` is NOT supported with driver adapters — use separate `groupBy` queries (`peopleCountByTree` pattern).
- **Hand-added SQL** in migrations (would be dropped by a regenerated migration — preserve it): one `main` tree per workspace (partial unique), `AncestryJump` generation-range CHECK, `source_entries_one_tree_wide_per_tree` partial unique, `SourceFile` size/mime CHECKs, staged-files partial index, `PlatformStat` `CHECK (id = 1)`, `CollectionItem` exactly-one-source CHECK.

### UI conventions

- Components: PascalCase dirs/files with co-located `.module.css`; hooks/utils camelCase; global CSS kebab-case (`src/styles/tree-global.css` targets React Flow classes).
- Mobile: the canvas FAB is a SEARCH button that opens the drawer on the list via a Sidebar-local `showListOverDetail` override — NOT by clearing `selectedPersonId` (covered by `sidebar-search-toggle.test.tsx`). On the person page the same button opens that person's panel.
- The family name never appears in `NasabRibbon`; only in the «من بيت X» tag.
- GEDCOM Islamic extensions (`@#DHIJRI@`, MARC/MARR/DIV, `_UMM_WALAD`, `_RADA_*`, `_KUNYA`, jump `ASSO`/`_ANC_FAM`/`_GAP_MIN`/`_GAP_MAX`) are documented publicly at `/islamic-gedcom`; exporter must sanitize every user string (`sanitizeLine`, `emitNote`).

**IMPORTANT**: Do not read `.ged` files directly.

## TypeScript Configuration

Strict mode with `noUnusedLocals` and `noUnusedParameters`; module resolution `bundler`.

## Git commits
Never add `Co-Authored-By` to commit messages.

## After editing files
Do not run pnpm commands unless I ask to. pnpm dev is already running — do not start it.

**Never ask the user to run commands. Execute them yourself.** This includes Docker Compose restarts, migrations, builds, tests, and any other shell commands. Just do it.

Run `pnpm test` after logic changes (skip for trivial changes like print statements or comments).

Check the browser when you have done work related to the frontend. It's better to use the default browser. Do not specify a browser.

**IMPORTANT: For browser/Playwright testing, the tree is database-backed — test the real tree at `http://localhost:4000/workspaces/<slug>/tree` with a logged-in session (seeding creates a small `test` family at `/workspaces/test/tree`). For no-auth visual checks, use the prod-guarded preview routes (e.g. `/design-preview`). The old `/test?only=canvas` route and the `?only=canvas`/`?no-sidebar`/`?no-minimap`/`?no-controls` params were removed when the tree moved to the database. See `docs/testing.md`.**

**IMPORTANT: After implementing a new feature, you MUST perform a complete end-to-end test using real infrastructure (GoTrue, Kong, PostgreSQL, SMTP).** Unit tests with mocks are not sufficient — they can pass while the actual flow is broken (e.g., misconfigured GoTrue URL paths, Kong routing issues, missing DB sync). For auth-related features, this means: create a real test user via the GoTrue admin API, exercise the full flow through Kong and the Next.js app, verify the result in the database, and clean up the test user afterward. For features involving email (email change, password reset, invitations), send a real email and verify the link works. Do not assume a feature is fixed without e2e verification against the running services.

When user ask to create agent team, use agent-team skill.
