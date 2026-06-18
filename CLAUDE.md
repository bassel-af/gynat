# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository ("gynat") is a **family collaboration platform** evolving from a read-only genealogy viewer. Built with Next.js 15 (App Router) + React 19 + TypeScript, backed by PostgreSQL (Prisma ORM) and Supabase Auth (self-hosted via Docker Compose). The app is RTL (right-to-left) with Arabic as the primary language.

The tree reads from the database via `GET /api/workspaces/[id]/tree`; static GEDCOM files in `/public/` are preserved for seeding only. Workspace data at rest is double-encrypted: LUKS2 disk volume underneath per-workspace AES-256-GCM application encryption gated by `WORKSPACE_MASTER_KEY`. Tree edits are Ctrl+Z-undoable in-session via a per-tab stack; cascade delete, branch pointer ops, and GEDCOM import are intentionally NOT undoable.

## Where to look first

- **Product definition** (vision, features, roadmap): `docs/prd.md`
- **How each subsystem works today**: `docs/implementation.md`
- **Auth architecture decisions**: `docs/auth-provider-decisions.md`
- **Encryption operator runbook**: `docs/encryption.md`
- **Production runbook** (deploy/restore/troubleshooting): `docs/deployment/runbook.md`
- **Testing modes & query params**: `docs/testing.md`
- **Local setup**: `docs/setup.md`
- **File/folder layout reference**: `docs/project-structure.md`

## Package Management

This project uses **pnpm** as the package manager (version 10.28.0).

## Common Commands

- `pnpm install` - Install dependencies
- `pnpm dev` - Start development server (Next.js with Turbopack, port 4000)
- `pnpm build` - Build for production
- `pnpm start` - Run production build
- `pnpm typecheck` - Type-check the whole project (`tsc --noEmit`); also gated in CI (`.github/workflows/typecheck.yml`)
- `pnpm test` - Run tests once
- `pnpm test src/test/display.test.ts` - Run a single test file
- `pnpm test:watch` - Run tests in watch mode
- `pnpm test:e2e` - Run end-to-end tests (separate Vitest config: `vitest.e2e.config.ts`)
- `cd docker && docker compose up -d` - Start Supabase stack (PostgreSQL, GoTrue, Kong, Studio)
- `cd docker && docker compose down` - Stop Supabase stack
- `npx prisma migrate dev` - Run Prisma migrations
- `npx prisma generate` - Regenerate Prisma client
- `npx prisma studio` - Open Prisma Studio (database browser)
- `pnpm seed` - Seed workspaces + tree data + places for local dev (requires admin user in DB first; see `docs/setup.md`)
- `pnpm seed:places` - Seed Place table from preprocessed GeoNames data only
- `pnpm clean:links` - Delete all branch pointers + share tokens
- `pnpm reseed:tree` - Clean tree data + re-seed from GEDCOM files
- `pnpm reseed:places` - Clean places + re-seed from places.json
- `pnpm reseed:all` - Clean everything + re-seed places + tree
- `pnpm start:fresh` - Clean links + clean tree + clean places + re-seed all
- `pnpm preprocess-geonames` - Preprocess raw GeoNames TSV data into `prisma/seed-data/places.json`
- `pnpm smoke` - Run smoke tests (`scripts/smoke-test.ts`)
- `pnpm encrypt:existing` - Migrate existing plaintext rows to AES-256-GCM ciphertext (idempotent; loads `.env.local`)

## Technology Stack

- **Framework**: Next.js 15.x with App Router and Turbopack
- **UI**: React 19.x with TypeScript 5.x
- **ORM**: Prisma 7.x with `@prisma/adapter-pg` driver adapter
- **Auth**: Supabase Auth (GoTrue) via `@supabase/ssr` (cookie-based), self-hosted
- **Validation**: Zod for API request validation
- **Database**: PostgreSQL 15 (via Docker Compose)
- **API Gateway**: Kong 3.9.1 (routes `/auth/v1/*` to GoTrue)
- **Tree Visualization**: @xyflow/react (React Flow) with custom tree layout algorithm
- **Styling**: CSS Modules with design tokens (`src/styles/tokens/`)
- **Testing**: Vitest with @testing-library/react and jsdom (see `docs/testing.md` for browser test mode)

## Code Architecture

### Path Aliases

The project uses `@/` as an alias for the `/src/` directory, configured in `tsconfig.json`.

### State Management

**TreeContext** (`src/context/TreeContext.tsx`) is the central state manager using React Context:
- Stores the parsed GEDCOM data (`GedcomData`)
- Tracks selected root ancestor (`selectedRootId`) and `initialRootId` (for back navigation)
- `ViewMode` (`'single' | 'multi'`) — single-root vs multi-root canvas mode (multi-root DISABLED, code preserved for future)
- `RootFilterStrategy` (`'all' | 'descendants'`) — controls visible subset in multi-root mode (DISABLED)
- Manages search query, focus/selection/highlight person IDs, tree configuration (max depth), loading state, and errors
- Provides `useTree()` hook for consuming components

The app wraps the entire application in `<TreeProvider>` via `src/app/providers.tsx` (client component).

**WorkspaceTreeContext** (`src/context/WorkspaceTreeContext.tsx`) manages workspace-specific tree state:
- `workspaceId`, `canEdit`, `isAdmin`, `refreshTree()`, `pointers` — consumed via `useWorkspaceTree()` hook
- `pointers` contains `PointerMetadata[]` (id, sourceWorkspaceNameAr, relationship, anchorIndividualId) from GET /tree response

**ToastContext** (`src/context/ToastContext.tsx`) provides app-wide toast notifications.

### GEDCOM Parsing

**Parser** (`src/lib/gedcom/parser.ts`):
- `parseGedcom(text: string)` - Parses raw GEDCOM text into structured data
- `getDisplayName(person)` - Formats person names for display

**Display** (`src/lib/gedcom/display.ts`):
- `getDisplayNameWithNasab(person, data, depth?)` - Arabic nasab/patronymic chain using بن/بنت connectors (`DEFAULT_NASAB_DEPTH = 2`)

**Roots** (`src/lib/gedcom/roots.ts`):
- `findRootAncestors(data)` - Identifies individuals with no parents who have families
- `findDefaultRoot(data)` - Picks root ancestor with the most descendants

**Relationships** (`src/lib/gedcom/relationships.ts`):
- `getPersonRelationships()` - Returns `{ parents, siblings, paternalUncles, spouses, children }`

**Search** (`src/lib/utils/search.ts`):
- `matchesSearch()` - Multi-word, diacritic-stripping, case-insensitive Arabic/Latin search
- `stripArabicDiacritics()` - Removes Arabic tashkeel; `ARABIC_DIACRITICS_CHARS` constant shared with SQL

**Types** (`src/lib/gedcom/types.ts`):
- `FamilyEvent` - Event record with `date`, `hijriDate`, `place`, `description`, `notes`
- `Individual` - Person record with name, birth/death (with hijri dates, notes, description), sex, family references, `kunya` (الكنية), `isPrivate`/`isDeceased` flags
- `Family` - Family unit with husband, wife, children, plus `marriageContract` (MARC), `marriage` (MARR), `divorce` (DIV) as `FamilyEvent`, and `isDivorced` flag
- `GedcomData` - Container for individuals and families records (keyed by ID)

**Graph utilities** (`src/lib/gedcom/graph.ts`):
- `getAllAncestors()` / `getAllDescendants()` - Traverse ancestor/descendant chains
- `getTreeVisibleIndividuals()` - Get individuals visible in the tree (with optional privacy filtering)
- `calculateDescendantCounts()` - Uses Kahn's algorithm (topological sort) for efficient O(V+E) counting
- `extractSubtree()` - Extract a self-contained `GedcomData` subtree rooted at a given person
- `findTopmostAncestor()` - Walk up parent chain to find the root ancestor of any person
- `hasExternalFamily()` - Check if a spouse has family data outside the current root's tree
- `computeGraftDescriptors()` - Build `GraftDescriptor[]` for in-law family expansion (parents + up to `MAX_GRAFT_SIBLINGS` siblings of married-in spouses)

**Calendar helpers** (`src/lib/calendar-helpers.ts`):
- `CalendarPreference` type (`'hijri' | 'gregorian'`)
- `getPreferredDate()`, `getSecondaryDate()`, `getDateSuffix()` — select display date based on user preference

**Person detail helpers** (`src/lib/person-detail-helpers.ts`):
- Form data builders: `buildEditInitialData()`, `buildFamilyEventInitialData()`, `serializeIndividualForm()`
- Validation: `validateAddParent()`, `canMoveChild()`, `needsFamilyPickerForAddChild()`
- Display: `formatDateWithPlace()`, `getDeceasedLabel()`
- Family picker: `getFamiliesForPicker()`, `getAlternativeFamilies()`

**Tree schemas** (`src/lib/tree/schemas.ts`):
- Zod validation schemas for tree API: `createIndividualSchema`, `updateIndividualSchema`, `createFamilySchema`, `updateFamilySchema`
- Shared field schemas: `individualFieldsSchema`, `familyEventFieldsSchema`

### Hooks

- `useCalendarPreference` — manages hijri/gregorian preference with localStorage persistence and server sync
- `usePersonActions` — Phase 3 editing state machine (modes: `edit`, `addChild`, `addSpouse`, `addParent`, `editFamilyEvent`) with submit/delete handlers and child-move support; uses `withFormAction()` wrapper for consistent loading/error/cleanup cycle
- `useWorkspaceTreeData` — fetches and manages workspace tree data
- `usePointerActions` — shared hook for branch pointer break/copy API calls (used by sidebar)
- `useTreeLines` — SVG line drawing for playground mode
- `useTreeColorOverrides` — tree color/display settings
- `usePasswordStrength` — password strength meter logic

### Routing

- **Root URL** (`/`) redirects authenticated users to `/workspaces`, shows landing page otherwise
- **Legacy redirects** (`next.config.ts`): `/saeed`, `/sharbek`, `/al-dalati`, `/al-dabbagh` permanently redirect to `/workspaces/{slug}/tree` — these were old static GEDCOM-based family routes
- **Family config** (`src/config/families.ts`): `FamilyConfig` entries (slug, rootId, displayName, gedcomFile) used for seeding workspaces. The `test` family (small `test-family.ged` fixture) seeds a lightweight workspace at `/workspaces/test/tree` for browser testing

### Data Flow

1. User navigates to `/workspaces/{slug}/tree`
2. `WorkspaceTreeClient` fetches tree data from `GET /api/workspaces/[id]/tree`
3. API returns `GedcomData` from database (private individuals redacted server-side)
4. Data is stored in TreeContext via `setData()`
5. UI components (`FamilyTree`, `Sidebar`, `SearchBar`) consume data via `useTree()`

### Tree Visualization

The `FamilyTree` component (`src/components/tree/FamilyTree/FamilyTree.tsx`) uses @xyflow/react with a **custom tree layout algorithm** (`FamilyTree/layout.ts`):
- **Bottom-up pass**: Calculates subtree widths (post-order traversal)
- **Top-down pass**: Assigns positions keeping siblings together (pre-order traversal)
- **Graft envelopes**: When a married-in spouse has external family, the layout reserves extra width for an inline expansion showing their parents and siblings (controlled by `GraftDescriptor`)
- Supports polygamous families with color-coded edges per spouse
- Privacy filtering: individuals with `isPrivate: true` are excluded from rendering

**In-law visibility** (see `docs/in-law-visibility.md`):
- **Re-root on spouse's ancestor**: Button on married-in spouse cards navigates tree to that spouse's topmost ancestor; `RootBackChip` provides back navigation
- **Inline spouse family expansion**: In multi-root mode, spouse's parents and siblings render inline as a graft envelope next to the spouse card
- **Multi-root view** (DISABLED): `ViewModeToggle` code preserved but not rendered; multi-root lays out multiple root ancestor trees side-by-side

**Tree editing components** (`src/components/tree/`):
- `IndividualForm` — form for creating/editing individuals (name, sex, birth/death with hijri dates, kunya, notes)
- `FamilyEventForm` — form for marriage contract (MARC), marriage (MARR), divorce (DIV) events with expandable sections
- `FamilyPickerModal` — modal to select which family when adding/moving a child (polygamy support)
- `CoupleRow` — displays marriage event information between spouses
- `PersonCard` — individual node card in the tree
- `RootBackChip` — floating chip to navigate back to previous root after re-root
- `ViewModeToggle` — segmented pill to switch between single/multi-root view modes (DISABLED, not rendered)
- `CascadeDeleteModal` — danger-styled warning with affected names chips, count, name-typing confirmation gate (5+ people), stale data auto-refresh
- `EmptyTreeState` — placeholder for workspaces with no tree data
- `AuditLogList` — paginated audit log list with action/entity type filtering
- `AuditLogEntry` — single audit entry card with action/entity badges, user avatar, relative timestamp, expandable diff
- `AuditLogDiff` — before/after field comparison with Arabic labels, color-coded added/removed/changed values

### GEDCOM File

The GEDCOM file (`public/saeed-family.ged`):
- GEDCOM 5.5.1 format (UTF-8 encoding) with Islamic extensions
- Individual records: `0 @ID@ INDI` with `NAME`, `SEX`, `BIRT`, `DEAT`, `FAMS`, `FAMC` tags
- Family records: `0 @ID@ FAM` with `HUSB`, `WIFE`, `CHIL`, `MARC` (marriage contract), `MARR` (marriage), `DIV` (divorce) tags
- Hijri dates via `@#DHIJRI@` calendar escape on DATE lines
- Cross-references use `@ID@` format

**IMPORTANT**: Do not read `.ged` files directly (per project instructions).

### CSS Architecture

- Component styles use **CSS Modules** (`.module.css` files co-located with components)
- Tree-specific global styles in `src/styles/tree-global.css` (targets React Flow classes)
- Design tokens are defined in `src/styles/tokens/`:
  - `colors.css` - Color palette
  - `typography.css` - Font sizes and weights
  - `spacing.css` - Spacing scale
  - `shadows.css` - Box shadows
  - `transitions.css` - Animation timings

### Naming Conventions

- **PascalCase** for component directories and files (e.g., `FamilyTree/FamilyTree.tsx`)
- **camelCase** for hooks and utility files (e.g., `useTree.ts`, `display.ts`)
- **kebab-case** for CSS files (e.g., `tree-global.css`)

### Mobile Patterns

- Sidebar has mobile overlay with FAB (floating action button) toggle
- Node cards show details FAB on mobile when a person is selected
- Body scroll is locked when mobile sidebar is open

### Backend Infrastructure

**Docker Compose** (`docker/docker-compose.yml`):
- Start: `cd docker && docker compose up -d`
- Services: `db` (PostgreSQL 15), `gotrue` (Supabase Auth v2.186.0), `kong` (API gateway), `studio` (admin UI), `pg-meta`
- Ports: PostgreSQL 5432, GoTrue 9999, Kong 8000 (public API), Studio 3001
- Kong config at `docker/kong.yml` — routes `/auth/v1/*` to GoTrue with CORS headers and rate limiting (30/min per IP)
- Non-public ports bound to `127.0.0.1` (PostgreSQL, GoTrue, Studio); Kong 8000 is the only externally accessible port
- Secrets in `docker/.env` (gitignored) — all security-sensitive vars use `:?` syntax (Docker fails to start if missing)

**Prisma** (`prisma/schema.prisma`):
- 26 models: User, Workspace, WorkspaceMembership, WorkspaceInvitation, UserTreeLink, FamilyTree, Individual, Family, FamilyChild, RadaFamily, RadaFamilyChild, TreeEditLog, BranchShareToken, BranchPointer, CopyProvenance, Collection, CollectionItem, Post, Album, AlbumMedia, Event, EventRsvp, Notification, Place, PlatformStat, AdminAccessLog
- `BranchShareToken` — SHA-256 hashed token with root individual, depth limit, target workspace scope, revoke flag
- `BranchPointer` — links source subtree to target workspace anchor; status (`active`/`revoked`/`broken`), relationship type, `linkChildrenToAnchor` flag, `shareTokenId` FK; `isCollectionLink` Boolean discriminator marks an anchor-less collection add-by-link pointer (a cross-workspace source descriptor) — `anchorIndividualId`/`selectedIndividualId`/`relationship` are nullable, and every target-side reader filters `isCollectionLink:false` (fail-closed) to keep it out of the member tree + public serve, while source-side freeze/token-revoke/admin-takedown still see it
- `FamilyTree` has `lastModifiedAt` timestamp (updated on every tree mutation, used for ETag caching)
- `User` has `calendarPreference` field (default: `'hijri'`), `isPlatformOwner` (Boolean, manual SQL flip only — never written from API), and live-presence heartbeat columns `lastActiveAt`, `lastActiveRoute` (VarChar 200, route pattern only — never raw URLs), `lastActiveWorkspaceId` (FK, `ON DELETE SET NULL`); indexed on `lastActiveAt`
- `PlatformStat` is a single-row settings table (`CHECK (id = 1)`) holding `peakConcurrentUsers` + `peakRecordedAt` for live-presence peak record
- `Individual` has `birthHijriDate`, `deathHijriDate`, `birthNotes`, `deathNotes`, `birthDescription`, `deathDescription`, `kunya`
- `Family` has marriage contract (MARC), marriage (MARR), and divorce (DIV) event fields: `{type}Date`, `{type}HijriDate`, `{type}Place`, `{type}Description`, `{type}Notes`, plus `isDivorced`
- `Workspace` has `enableAuditLog`, `enableVersionControl`, and `enableCollections` (all Boolean, default false) toggles; `ContentPermission` enum includes `collection_editor`
- `FamilyTree` has `kind` (`TreeKind { main extra }`; one `main` per workspace via a partial unique index, unlimited `extra` trees that exist only inside Collections)
- **Collections** (`docs/prd-public-tree-collections.md` §2): `Collection` (workspaceId, plaintext `titleAr`/`descriptionAr`, `visibility` reuses `TreeVisibility`, `publicSlug`, `allowReuse`) and `CollectionItem` (kind `tree`|`collection` via `CollectionItemKind`, `linkMode` via `ItemLinkMode { linked copied }`, exactly-one source binding — `treeId` | `branchPointerId` | `childCollectionId` — enforced by a CHECK; `@@unique([collectionId, treeId])` + `@@unique([collectionId, childCollectionId])` block duplicate sources)
- `TreeEditLog` has `snapshotBefore` (Json?), `snapshotAfter` (Json?), `description` (VarChar 500) for full before/after audit snapshots; indexed on `[treeId, entityType, entityId]`
- Prisma v7 uses driver adapters — client instantiation requires `PrismaPg` from `@prisma/adapter-pg`
- **Prisma v7 limitation**: `_count` with `where` filters inside `include` is NOT supported with driver adapters. Use separate `groupBy` queries instead.
- Generated client output: `generated/prisma/` (gitignored)
- Run migrations: `npx prisma migrate dev`
- Config: `prisma.config.ts` loads `DATABASE_URL` from `.env` via `dotenv/config`

**Supabase Client Libraries** (all via `@supabase/ssr`):
- Browser client: `src/lib/supabase/client.ts` — `createBrowserClient` (auto cookie storage)
- Server client: `src/lib/supabase/server.ts` — `createServerClient` with Next.js `cookies()` (async)
- Middleware client: `src/lib/supabase/middleware.ts` — `updateSession()` for token refresh
- Prisma singleton: `src/lib/db.ts` — uses `DATABASE_URL`

**Auth Flow**:
- Signup: `src/app/auth/signup/page.tsx` → GoTrue `/auth/v1/signup` + Google OAuth
- Login: `src/app/auth/login/page.tsx` → GoTrue `/auth/v1/token?grant_type=password` + Google OAuth
- Callback: `src/app/auth/callback/route.ts` — handles OAuth redirects, email confirmations, sets cookies, syncs user to DB
- User sync: `POST /api/auth/sync-user` + shared helper `src/lib/auth/sync-user.ts` — mirrors GoTrue user to `public.users`
- Password reset: `src/app/auth/forgot-password/page.tsx` → Supabase `resetPasswordForEmail()`
- Reset password UI: `src/app/auth/reset-password/page.tsx` — new password form with strength meter (after clicking email link)
- Email confirmation: `src/app/auth/confirm/page.tsx` — two-stage email confirmation page
- Redirect validation: `src/lib/auth/validate-redirect.ts` — validates `?next` parameter to prevent open redirects
- Middleware: `src/middleware.ts` — three code paths: static assets (skip), API routes (session refresh only, no login redirect), page routes (session refresh + login redirect)
- After login/signup, users are redirected to `/workspaces`

**API Utilities**:
- Auth guard: `src/lib/api/auth.ts` — `getAuthenticatedUser(request)` parses Bearer token, verifies via Supabase
- Workspace guards: `src/lib/api/workspace-auth.ts` — `requireWorkspaceMember()`, `requireWorkspaceAdmin()`, `requireTreeEditor()`, `requireCollectionEditor()` (admin or `collection_editor`), `requireCollectionsEnabled()` (deny-by-default 404 when `enableCollections` off; called FIRST, before the auth guard)
- Request helpers: `src/lib/api/route-helpers.ts` — `parseValidatedBody(request, zodSchema)` parses JSON + validates with Zod in one call; `isParseError()` type guard; `parseTreeIdFromBody(request)` / `extractTreeId(body)` pull an optional string `treeId` from a DELETE body (string-only narrowing — a non-string, e.g. a Prisma-operator object, never reaches the scoping query). Used by all mutable API routes to eliminate boilerplate.
- Rate limiting: `src/lib/api/rate-limit.ts` — in-memory `RateLimiter` class with pre-configured instances per endpoint (single-process; needs Redis before horizontal scaling)
- Client fetch: `src/lib/api/client.ts` — `apiFetch(path, options)` auto-attaches Bearer token
- Serialization: `src/lib/api/serialize.ts` — `serializeBigInt()` for JSON responses with BigInt fields
- HTML escaping: `src/lib/utils/html-escape.ts` — `escapeHtml()` for email templates

**Workspace API Routes** (`src/app/api/workspaces/`):
- `POST /api/workspaces` — create workspace (any authenticated user, creator becomes `workspace_admin`)
- `GET /api/workspaces` — list user's workspaces
- `GET /api/workspaces/[id]` — workspace detail (members only)
- `PATCH /api/workspaces/[id]` — update settings (admin only)
- `GET /api/workspaces/by-slug/[slug]` — resolve workspace by slug
- `GET /api/workspaces/[id]/members` — list members
- `POST /api/workspaces/[id]/members` — invite by email (admin only)
- `PATCH /api/workspaces/[id]/members/[userId]` — update role/permissions (admin only)
- `DELETE /api/workspaces/[id]/members/[userId]` — remove member (admin only, last-admin protected)
- `POST /api/workspaces/[id]/invitations/code` — generate join code (admin only)
- `POST /api/workspaces/join` — join via code (atomic transaction, rate limited)
- `POST /api/invitations/[id]/accept` — accept email invitation (atomic transaction)

**Tree API Routes** (`src/app/api/workspaces/[id]/tree/`): all read + mutation routes accept an optional `treeId` (query param for reads, body field for mutations) to target an `extra` tree; absent → the workspace `main` tree (backward-compatible). The target is resolved once via `resolveTargetTreeOr404()` (scoped by `{ id, workspaceId, kind }`, fail-closed 404). Gated by `tree_editor` or admin (same as the main tree; NOT `collection_editor`). Branch-pointer / visibility / publish / import / audit-log routes stay main-only (no `treeId`).
- `GET /api/workspaces/[id]/tree` — full tree as `GedcomData` (private individuals redacted server-side); supports ETag/`If-None-Match` for 304 responses, returns `Cache-Control: private, max-age=30, stale-while-revalidate=300`; branch pointer source trees are fetched in parallel and deduplicated by workspace ID
- `POST /api/workspaces/[id]/tree/individuals` — create individual (`tree_editor` or admin)
- `PATCH /api/workspaces/[id]/tree/individuals/[id]` — update individual
- `DELETE /api/workspaces/[id]/tree/individuals/[id]` — delete individual; supports optional `{ cascade, versionHash, confirmationName }` body for cascade delete (409 on stale data)
- `GET /api/workspaces/[id]/tree/individuals/[id]/delete-impact` — cascade delete preview: affected count, names (capped at 20), pointer/token counts, version hash, name confirmation gate
- `POST /api/workspaces/[id]/tree/families` — create family
- `PATCH /api/workspaces/[id]/tree/families/[id]` — update family
- `DELETE /api/workspaces/[id]/tree/families/[id]` — delete family
- `POST /api/workspaces/[id]/tree/families/[id]/children` — add child to family
- `DELETE /api/workspaces/[id]/tree/families/[id]/children/[individualId]` — remove child from family
- `POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move` — move child to another family
- `GET /api/workspaces/[id]/tree/export` — GEDCOM export (5.5.1 or 7.0 format via `?version=` query param)
- `POST /api/workspaces/[id]/tree/import` — GEDCOM import (empty trees only, multipart form data)
- `GET /api/workspaces/[id]/tree/audit-log` — audit log (admin-only, `enableAuditLog` toggle gate, paginated max 50/default 20, filterable by action/entityType/entityId/userId, rate-limited 60/min)
- `GET /api/workspaces/[id]/tree/publish-preview` — admin-only Public Tree publish data: living-people checkpoint, withheld borrowed branches, confirmation phrase, current level, slug, reuse opt-in; treeId-aware (optional `?treeId` → that `extra` tree via `resolveTargetTreeOr404`, fail-closed 404; withheld-branches `[]` for extra trees, the tree's own name as the confirm phrase). One treeId-aware `PublishFlowContainer` (`src/components/public-tree/`, shared `PublishIcon`) drives publishing for ALL trees from BOTH the editor top bar (the open tree) and every trees-list row (main + extra) — no separate extra-tree publish modal
- `PATCH /api/workspaces/[id]/tree/visibility` — admin-only set visibility (`private`/`public_link`/`public_listed`); requires the type-to-confirm phrase on first publish; keeps the slug across private round-trips; accepts an optional `treeId` to publish a single `extra` tree on its own (home-only serve, behind `enableCollections`) — the workspace-scoped going-private freeze runs only for the `main` tree

**Rada'a API Routes** (`src/app/api/workspaces/[id]/tree/rada-families/`):
- `POST /api/workspaces/[id]/tree/rada-families` — create rada'a family (milk kinship link)
- `DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId]` — delete rada'a family
- `POST /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children` — add child to rada'a family
- `DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children/[individualId]` — remove child from rada'a family

**Public Tree API Routes** (`src/app/api/family/[slug]/`) — anonymous, deny-by-default public surface, separate from the member tree path:
- `GET /api/family/[slug]/tree` — public (redacted) tree data for a published tree (404 if unknown/private)
- `POST /api/family/[slug]/report` — public, no-account report; rate-limited per IP; records a `public_tree_report` notification for workspace admins AND emails `SITE_CONTACT_EMAIL` (best-effort, never blocks/fails the report) for manual admin review. Never auto-takes-down
- `GET /api/collections/[slug]/tree` — public (Collections Chunk 4) anonymous serve of a published collection by its `publicSlug`; deny-by-default (unknown/private/`enableCollections`-off → generic 404), `publicTreeLimiter` + `clientIpKey`, always `noindex`. Returns a lightweight card payload (`{ titleAr, descriptionAr, trees: { slug, titleAr, peopleCount }[] }`) — each tree's `slug` links to its own `/family/[slug]`; no tree data inlined. Composition + recursive LIVE withholding in `src/lib/collections/public-serve.ts` (`loadPublicCollectionBySlug` / `getPublicCollectionForRequest` = `cache(...)`, `buildPublicCollectionPayload`, bounded `collectPublicTreeRefs` walk)

**Collections API Routes** (`src/app/api/workspaces/[id]/`) — all gated by `requireCollectionsEnabled` (404 when off) then the auth guard; Chunks 1–4 shipped (own-content, edit-content, add-by-link, public serving):
- `POST/GET /collections`, `GET/PATCH/DELETE /collections/[collectionId]` — collection CRUD; GET detail shapes each item with a derived source label + LIVE effective visibility
- `PATCH /collections/[collectionId]/visibility` — admin-only; set collection visibility (`private`/`public_link`/`public_listed`); mints the public slug on first publish, keeps it across private round-trips. NO type-to-confirm phrase (each tree inside was already confirmed at its own publish). No going-private freeze runs here — a collection going private flips no source tree's visibility, so the `freezeCollectionLinks` call was removed (the real freeze-repoint runs from the tree going-private path). Accepts optional `promoteOwnTreesToListed` (search-discoverability chunk): when publishing at `public_listed`, flips the caller's OWN `public_link` leaf trees to `public_listed` in one transaction (`promoteOwnTreesToListed()` in `queries.ts`, scoped `{ workspaceId, public_link }` — never touches another workspace's tree); if cross-workspace borrowed leaves are still link-only the collection is DOWNGRADED to `public_link` (published by link, not search-listed) and the response returns `{ listedBlocked, blockingBorrowed }` for the modal to surface
- `GET /collections/[collectionId]/publish-preview` — admin-only; the would-be-withheld trees + publishable count. This is the AUTHORITATIVE withholding source — `CollectionVisibilityModal` fetches it and renders `withheldTrees` (the old client-side `items.filter` rule under-reported cross-workspace reuse-off borrows)
- `POST /collections/[collectionId]/items`, `PATCH/DELETE .../items/[itemId]` — add/edit/remove items (own main/extra tree → linked, or copied = deep-copy into a new extra tree; or nested collection with in-transaction cycle guard); duplicate-source adds → 409 (in-tx pre-check + DB unique index P2002 backstop); `linkInput` (add-by-link) resolves a pasted public-tree link (main OR extra tree) or private share code to its identity; a SELF-SOURCE paste (resolved tree in the caller's own workspace) is added directly as an own-tree live link via the shared `addOwnTreeLinked` (no reuse gate); a CROSS-WORKSPACE borrow → `linked` (anchor-less `isCollectionLink` pointer) or `copied` (two-key deep-copy of the SPECIFIC tree via `getTreeByIdWithIncludes` into a new extra tree), gated by the LIVE reuse-gate (in the route, cross-workspace only) + one generic 404 (no oracle) + per-IP limiter (`resolve-link.ts` / `copy-borrowed.ts`)
- `POST/GET /extra-trees`, `PATCH/DELETE /extra-trees/[treeId]`, `POST /extra-trees/[treeId]/duplicate` — extra-tree CRUD (cap 50) + duplicate any tree (main/extra) into a frozen extra-tree snapshot named `«{name} (نسخة)»`, writing `CopyProvenance`

**Places API Route** (`src/app/api/workspaces/[id]/places/`):
- `GET /api/workspaces/[id]/places?q=...` — search places (global seed + workspace custom)
- `POST /api/workspaces/[id]/places` — create custom place for workspace

**User API Routes** (`src/app/api/users/`):
- `GET /api/users/me` — get current user profile
- `PATCH /api/users/me` — update display name / avatar
- `GET /api/users/me/preferences` — get user preferences (calendar preference)
- `PATCH /api/users/me/preferences` — update user preferences

**Branch Pointer API Routes** (`src/app/api/workspaces/[id]/branch-pointers/`):
- `POST /api/workspaces/[id]/branch-pointers` — redeem share token, create pointer (with 4 stitching rules + gender validation + race condition protection)
- `DELETE /api/workspaces/[id]/branch-pointers/[pointerId]` — disconnect pointer (no deep copy, data disappears)
- `POST /api/workspaces/[id]/branch-pointers/[pointerId]/copy` — deep copy pointed subtree as native data, then mark pointer `broken`

**Share Token API Routes** (`src/app/api/workspaces/[id]/share-tokens/`):
- `POST /api/workspaces/[id]/share-tokens` — create share token (admin only)
- `GET /api/workspaces/[id]/share-tokens` — list tokens with root person name, active pointer count, expiry
- `PATCH /api/workspaces/[id]/share-tokens/[tokenId]` — disable/re-enable token (toggles `isRevoked` without touching pointers)
- `DELETE /api/workspaces/[id]/share-tokens/[tokenId]` — revoke token + auto deep-copy all active pointers into target workspaces
- `POST /api/workspaces/[id]/share-tokens/preview` — preview a token's subtree before redeeming

**Admin API Routes** (`src/app/api/admin/`) — platform-owner only, defense-in-depth gated by `isPlatformOwner` flag in middleware + route handler + page layout. Every read writes one `AdminAccessLog` row via `logAdminAccess()`.
- `GET /api/admin/healthcheck` — liveness probe
- `GET /api/admin/metrics/growth` — workspace + user counts, invite acceptance (60s response cache via `withUserCache`)
- `GET /api/admin/metrics/engagement` — weekly active workspaces, edits, top-N (60s cache)
- `GET /api/admin/metrics/health` — DB / GoTrue / mail / encryption / storage probes (60s cache)
- `GET /api/admin/metrics/presence` — live presence: 1m / 5m active users (owners excluded), per-workspace breakdown (k-anonymity gated by membership ≥5), 7×24 UTC heatmap, peak-concurrency record. **5s cache** (presence is "right-now" data). Lazy peak update fires fire-and-forget after the response.

**Admin Library** (`src/lib/admin/`):
- `queries.ts` — growth / engagement / health aggregations; every cross-workspace read goes through this single file
- `cache.ts` — `withUserCache(userId, key, fn, ttlMs)` per-user in-memory response cache for admin reads; HMR-safe via `globalThis`
- `presence.ts` — pure helpers (`normalizeRoutePattern` allow-list, `classifyRoute`) + presence query functions (`getActiveUserCount`, `getActiveWorkspaceBreakdown`, `getQuietWindowHeatmap`, `updatePeakConcurrency`, `getPresenceMetrics`). Normalizer drops UUIDs/slugs/control chars/traversal/queries to `null` — concrete URLs never reach the DB.
- `presence-tracker.ts` — middleware-facing in-memory throttle: LRU 50k cap, 5-min TTL, 60s sweep; `trackPresence({ userId, pathname, method })` is fire-and-forget. Writes only when workspace changes, category changes, or 60s have elapsed. Slug→id memo cache for `/workspaces/[slug]/*` paths.

**Audit utilities** (`src/lib/audit/`):
- `admin-access.ts` — `logAdminAccess({ userId, action, ipAddress, userAgent })` writes to `AdminAccessLog`; never throws (best-effort)

**Live presence integration points**:
- `src/middleware.ts` — calls `trackPresence` after `if (!user) redirect`, skipping `/admin/*` (owner self-exclusion)
- `src/lib/api/auth.ts` — `getAuthenticatedUser` calls `trackPresence` after successful Bearer auth (covers API-only callers that bypass middleware's `updateSession`)
- Both call sites are `void trackPresence(...)` — fire-and-forget, never block the response

**Collections Library** (`src/lib/collections/`):
- `queries.ts` — collection/item/extra-tree CRUD; pure recursion guards (`detectCollectionCycle` + DB wrapper, `MAX_NESTING_DEPTH`, `MAX_ITEMS`); `resolveEffectiveVisibility` (LIVE, deny-by-default), `shapeCollectionItem`, `peopleCountByTree` (shared Prisma-v7 groupBy workaround), `itemExistsInCollection` (in-tx dedupe), `filterTopLevelCollections`
- `schemas.ts` — Zod request schemas; `copy.ts` — `copyTreeIntoNewExtraTree` (atomic deep-copy of an own tree into a new extra tree, re-encrypts under same key + writes `CopyProvenance`); `api.ts` — client `apiFetch` wrappers + DB→UI visibility mapping; `useWorkspaceResolver.ts` — slug→id + `enableCollections` resolver hook; `resolve-link.ts` — `resolveLinkSource()` turns a pasted public-slug / private-share-code into ONE `ResolvedLinkSource | null` with the LIVE reuse-gate (no enumeration oracle); `copy-borrowed.ts` — `copyBorrowedBranchIntoNewExtraTree()` two-key cross-workspace deep-copy (decrypt source key → re-encrypt target key) + `CopyProvenance`
- `public-serve.ts` (Chunk 4 — the PUBLIC collection serve layer, separate from the member path) — `loadPublicCollectionBySlug` + `getPublicCollectionForRequest` (`cache(...)`, deny-by-default + `enableCollections` gate), `buildPublicCollectionPayload` (lightweight card payload: slug/titleAr/peopleCount, no inlined tree data), `collectPublicTreeRefs` (bounded visited-set/depth walk; recomputes LIVE effective visibility per item, recurses into nested collections without widening, cross-workspace borrows re-check live `allowReuse`), `countPublishableTrees` (the authoritative publish-preview withholding count — consumed by `CollectionVisibilityModal` via the publish-preview route). Search-discoverability helpers (2026-06-18): `getCollectionListingReadiness(slug)` = `cache(...)` + the id-keyed `getCollectionListingReadinessById(collectionId)` (admin pre-publish, no slug yet) both delegate to the shared `computeListingReadiness` core → `{ fullyListable, notListedOwnTrees, notListedBorrowedTrees }` (own-workspace vs cross-workspace link-only leaves); `listIndexableCollectionSlugs()` = the sitemap data source (`public_listed` + `enableCollections` + `fullyListable`, computed via the id-keyed core in parallel — no per-slug reload)
- `extra-tree-cap.ts` — shared `MAX_EXTRA_TREES_PER_WORKSPACE` + `ExtraTreeCapError` + `assertExtraTreeCapacity(workspaceId)` (counts `kind:'extra'` against the TARGET workspace); enforced by the extra-trees POST route AND both copy paths (`copy.ts`, `copy-borrowed.ts`) so a copy can't bypass the cap
- Components in `src/components/collections/` (CollectionsResolved, CollectionsPageShell, CollectionsList, CollectionDetail, TreesArea, AddItemFlow, CollectionVisibilityModal, CollectionBadges, EnableCollectionsSetting, JoinCodePanel); modal action buttons use the shared `@/components/ui/Button`. `TreesArea` (an extra tree's title) and `CollectionDetail` (a tree item) link into the editor at `/workspaces/[slug]/tree?treeId=<id>` — no separate "edit content" button; the rename control is a text affordance, not a pen icon

**Tree Library** (`src/lib/tree/`):
- `queries.ts` — database query helpers for tree CRUD; `touchTreeTimestamp(treeId)` updates `FamilyTree.lastModifiedAt` (called by all mutation routes for ETag invalidation); `getOrCreateTargetTree(workspaceId, treeId?)` + `resolveTargetTreeOr404()` resolve the tree a read/mutation targets (main when `treeId` absent, else the `{id, workspaceId, kind:main|extra}`-scoped tree; the guard returns a ready-to-`return` 404 `NextResponse` for a foreign/unknown id, consumed via `isErrorResponse`)
- `mapper.ts` — `dbTreeToGedcomData()` maps DB records to `GedcomData` shape; `redactPrivateIndividuals()` strips PII from private individuals
- `seed-helpers.ts` — helpers for seeding tree data from GEDCOM
- `schemas.ts` — Zod validation schemas for tree API requests
- `branch-pointer-merge.ts` — `extractPointedSubtree()`, `mergePointedSubtree()`, `detectOrphanedChildren()`, stitching helpers (child/sibling/spouse/parent)
- **Public Tree (`src/lib/tree/`)** — `public-serve.ts` (the one serving layer: `loadPublicTreeBySlug`, `buildPublicTreePayload`, `buildPublicNamesList`, withheld-branches; deny-by-default, structurally barred from the member merge; plus the search-discoverability helpers `isPublicTreeIndexable(record)` — the single `main`+`public_listed` predicate consumed by both `family/[slug]` render passes — and `listIndexableTreeSlugs()`, the sitemap data source mirroring it as SQL), `public-visibility.ts` (`redactForPublic` — the single public redactor), `public-compose.ts` (compose home + source-public borrowed branches), `birth-date-privacy.ts` (130-yr living rule, hide living birth dates), `public-slug.ts` (auto-generated unguessable code), `going-private.ts` (unpublish: `freezeDependentPointers` converts live anchored links to frozen copies; `freezeCollectionLinks` (Chunk 4) deep-copies each affected anchor-less collection-link borrow into a new frozen extra tree and re-points its `CollectionItem` — skipping borrows whose source leaf is still public+reusable, the same gate the serve path uses); a published `extra` tree serves home-only (no borrowed branches), always `noindex`, gated by `enableCollections`
- `branch-pointer-deep-copy.ts` — `prepareDeepCopy()` (pure, new UUIDs + ID remapping) and `persistDeepCopy()` (DB writes for individuals, families, familyChildren, stitchFamily)
- `branch-pointer-schemas.ts` — Zod schemas for redeem token, share token creation
- `branch-pointer-queries.ts` — `getActivePointersForWorkspace()` with source workspace name join
- `branch-pointer-guards.ts` — `isSyntheticFamilyId()` for mutation guards on synthetic families; `isStitchablePointer()` narrows a pointer to a real anchored one (excludes anchor-less collection links from the deep-copy/stitch path)
- `cascade-delete.ts` — `computeDeleteImpact()` (BFS reachability with married-in spouse exclusion + upward traversal guard), `computeVersionHash()`, `buildImpactResponse()`
- `family-validators.ts` — centralized gender validation: `validateFamilyGender()` (DB), `validateSpouseGender()` (pure)
- `rada-validators.ts` — validation for rada'a family operations (duplicate checks, workspace feature toggle)
- `branch-share-token.ts` — share token generation and validation utilities
- `seed-place-mapping.ts` — place ID mapping helpers for seeding
- `audit.ts` — snapshot extraction functions (`snapshotIndividual`, `snapshotFamily`, `snapshotRadaFamily`, `snapshotBranchPointer`) and `buildAuditDescription()` Arabic description builder
- `audit-log-schemas.ts` — Zod validation for audit log query params (page/limit/action/entityType/entityId/userId)

**GEDCOM Export** (`src/lib/gedcom/exporter.ts`):
- `exportGedcom(data, options)` — serializes `GedcomData` to GEDCOM 5.5.1 or 7.0 format
- Supports all Islamic extensions: `@#DHIJRI@` calendar escape, MARC/MARR/DIV, `_UMM_WALAD`, `_RADA_*`, `_KUNYA` tags
- GEDCOM injection sanitization on all user-provided strings

**Profile** (`src/lib/profile/`):
- `validation.ts` — Zod schemas for profile update, email change, password change
- `tree-settings.ts` — tree color/display settings types and defaults

**Email** (`src/lib/email/`):
- `transport.ts` — Nodemailer with Gmail SMTP
- `templates/invite.ts` — Arabic RTL invitation email (HTML-escaped dynamic values, URL-validated links, header-injection-safe subjects)
- `templates/report.ts` — Arabic RTL public-tree report alert (same obsidian/gold branding as invite); sent to `SITE_CONTACT_EMAIL` on a public-tree report, with the complaint, reporter contact, view-tree link, and slug/tree/workspace IDs for manual handling

**Site** (`src/lib/site.ts`):
- `SITE_CONTACT_EMAIL` — single source for the public contact / support address (also where public-tree reports are emailed); used by layout metadata, the landing footer, and the report route

**Workspace utilities** (`src/lib/workspace/`):
- `join-code.ts` — `crypto.randomBytes()` with 8 random characters (A-Z0-9), format: `SLUG_PREFIX-XXXXXXXX`
- `labels.ts` — `roleLabel()` maps workspace roles to Arabic display labels

**Seed** (`src/lib/seed/`):
- `seed-workspaces.ts` — creates workspaces from family configurations for local development
- `seed-places.ts` — seeds Place table from preprocessed GeoNames JSON (`prisma/seed-data/places.json`)
- `geonames-parser.ts` — TSV line parsers for raw GeoNames data (used by `scripts/preprocess-geonames.ts`)

**Places** (`src/lib/places/`):
- `schemas.ts` — Zod schemas for place search and creation API

**Workspace & Profile UI**:
- `/workspaces` — workspace list (مساحات العائلة), create button, logout
- `/workspaces/create` — create workspace form (اسم العائلة, slug, description)
- `/profile` — user profile page with sectioned settings: `ProfileHeader` (display name, avatar), `AccountSettings` (email change), `SecuritySettings` (password change), `TreeDisplaySettings` (calendar preference). Components in `src/components/profile/`
- `/workspaces/[slug]` — workspace detail with members, invite modal, tree link
- `/workspaces/[slug]/tree` — database-backed tree view with edit controls (add/edit individual, add child/spouse/parent, move child, edit family events, delete)
- `/workspaces/[slug]/tree/audit` — audit log page (admin-only, requires `enableAuditLog`): browsable edit history with filtering, pagination, expandable before/after diff viewer
- `/workspaces/[slug]/trees` — extra-trees management (requires `enableCollections`): the locked main tree + lightweight extra trees, with create/rename/delete/duplicate (collections feature off by default; toggle + join-code panel live in the `/workspaces/[slug]` settings page). Click an extra tree's title (or a tree inside a collection) to open the full editor on it via `/tree?treeId=<id>`
- `/workspaces/[slug]/collections` + `/workspaces/[slug]/collections/[collectionId]` — collections list + detail (requires `enableCollections`): create collections, add own trees/branches as items, nest collections, add another family's tree/branch via link (public-slug or private share code; linked or copied), publish a single extra tree (make-public ladder), and publish the collection itself (`CollectionVisibilityModal` with the "what's withheld" warning)
- `/collections/[slug]` — public, no-login viewer for a published collection (Collections Chunk 4); deny-by-default (private/unknown/`enableCollections`-off → 404); `noindex` UNLESS the collection is `public_listed` AND fully-listable (every servable leaf tree, recursively, is itself `public_listed` — a link-only leaf blocks listing, fail-closed) — then it carries OG + `CollectionPage`/`BreadcrumbList` JSON-LD and appears in the sitemap (search-discoverability chunk, 2026-06-18); a brand-faithful (`/design-preview` vocabulary) card grid of the collection's public trees, each card opening that tree's own `/family/[slug]` viewer (`PublicCollectionPageClient`)
- `/invite/[id]` — invitation acceptance page
- `/policy` — public policy page (Arabic only)
- `/islamic-gedcom` — public reference page (مرجع GEDCOM الإسلامي): `@#DHIJRI@` calendar escape for Hijri dates, MARC/MARR/DIV Islamic marriage mappings, `_UMM_WALAD` (أم ولد flag on FAM), rada'a extensions (`_RADA_FAM`, `_RADA_WIFE`, `_RADA_HUSB`, `_RADA_CHIL`, `_RADA_FAMC`), `_KUNYA` (الكنية)
- `/family/[slug]` — public, no-login read-only tree viewer for a published tree (Public Tree v1); deny-by-default (private/unknown slug → 404), SSR-crawlable names list, `noindex` unless `public_listed` (a `main` tree only — `extra` trees always `noindex`); when `public_listed` it carries OG + `WebPage`/`BreadcrumbList` JSON-LD (no `Person`/genealogy schema — would leak redacted living PII) and is listed in the sitemap; indexability is the single `isPublicTreeIndexable(record)` predicate; carries a discreet "report this tree" link (`PublicTreeViewer`)
- `/family/[slug]/report` — public, no-account report page (`ReportPageClient` → `ReportForm`); deny-by-default; POSTs to the report endpoint. Linked from the viewer footer + the make-private dialog's "request permanent removal" link
- `/auth/forgot-password` — password reset via Supabase Auth

**Environment Variables** (see `.env.example`):
- `.env` — `DATABASE_URL` (used by Prisma CLI)
- `.env.local` — `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `docker/.env` — Docker Compose secrets (gitignored)

### Testing

- All test files are centralized in `src/test/` (not co-located with source)
- Test fixtures (GEDCOM files) in `src/test/fixtures/`
- Naming: `*.test.ts` / `*.test.tsx`

### Dev Tools

- `?playground` query param renders `Playground.tsx` (SVG-line-based tree layout experiment) instead of the main app

### Security

- **Security headers**: `next.config.ts` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS, X-DNS-Prefetch-Control on all routes
- **Rate limiting**: Kong plugin (30/min on auth routes) + in-memory per-user rate limiting on API routes (see `src/lib/api/rate-limit.ts`)
- **Input validation**: All Zod schemas have `.max()` constraints on string fields
- **Privacy enforcement**: `isPrivate` individuals have PII redacted server-side before API response (names → "خاص", dates/places cleared, tree structure preserved)
- **Error handling**: Unknown errors return generic 500 responses — no stack trace leakage
- **Workspace limits**: Max 5 owned workspaces per user; workspace creation rate limited
- **Invitation security**: Generic error messages prevent enumeration; member list returns only `id`/`displayName`/`avatarUrl`

## TypeScript Configuration

- Strict mode enabled with `noUnusedLocals` and `noUnusedParameters`
- Target: ES2020
- JSX: `preserve` (Next.js handles transformation)
- Module resolution: `bundler` mode
- Next.js plugin enabled for enhanced type checking

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