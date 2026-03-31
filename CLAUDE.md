# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository ("solalah") is a **private family collaboration platform** evolving from a read-only genealogy viewer. Built with Next.js 15 (App Router) + React 19 + TypeScript, backed by PostgreSQL (Prisma ORM) and Supabase Auth (self-hosted via Docker Compose). The app is RTL (right-to-left) with Arabic as the primary language. See `docs/product-requirements.md` for the full PRD and `docs/auth-provider-decisions.md` for auth architecture decisions.

**Current state**: Phases 1–5 are complete, Phase 6a in progress. Phase 1 (Auth & Workspace Foundation): email/password + Google OAuth, workspace CRUD, membership/invitations, dashboard UI, policy page. Phase 2 (Editable Family Tree): database-backed tree with full CRUD. Phase 3 (Family-Aware Relationship Editing): add child/spouse/parent, move child between families, marriage events (MARC/MARR/DIV), Hijri date support, calendar preference. Phase 4 (In-Law Visibility & Multi-Root View): re-root on spouse's ancestor, view mode toggle (single/multi), multi-root side-by-side layout, inline spouse family graft expansion. Phase 5 (Branch Pointers): cross-workspace branch linking with live sync, deep copy, stitching rules, pointer management in canvas sidebar. Phase 6a (Islamic Tags): `_UMM_WALAD` flag on families, rada'a (milk kinship) with `RadaFamily`/`RadaFamilyChild` models, 6 API endpoints, sidebar integration, `IndividualPicker` component, workspace feature toggles. The tree visualization reads from the database via `GET /api/workspaces/[id]/tree`; static GEDCOM files in `/public/` are preserved for the legacy `/{familySlug}` routes and seeding.

## Package Management

This project uses **pnpm** as the package manager (version 10.28.0).

## Common Commands

- `pnpm install` - Install dependencies
- `pnpm dev` - Start development server (Next.js with Turbopack)
- `pnpm build` - Build for production
- `pnpm start` - Run production build
- `pnpm lint` - Run ESLint
- `pnpm test` - Run tests once
- `pnpm test src/test/display.test.ts` - Run a single test file
- `pnpm test:watch` - Run tests in watch mode
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
- `Individual` - Person record with name, birth/death (with hijri dates, notes, description), sex, family references, `isPrivate`/`isDeceased` flags
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
- `useGedcomData` — fetches GEDCOM file from `/public/` for legacy routes
- `useTreeLines` — SVG line drawing for playground mode

### Multi-Family Routing

The app uses dynamic routing (`src/app/[familySlug]/page.tsx`) with a family configuration system:
- **Config** (`src/config/families.ts`): Defines `FamilyConfig` entries (slug, rootId, displayName, gedcomFile) in a `FAMILIES` record
- The `test` family config uses `test-family.ged` (small fixture) — used by the `/test` browser test route
- **Root URL** (`/`) redirects authenticated users to `/dashboard`, shows landing page otherwise
- Each family route is statically generated via `generateStaticParams()`
- `FamilyTreeClient` wraps the tree in `<TreeProvider>` with a `forcedRootId` from the family config

### Data Flow

1. User navigates to `/{familySlug}` (e.g., `/saeed`)
2. `[familySlug]/page.tsx` resolves the `FamilyConfig` via `getFamilyBySlug()`
3. `FamilyTreeClient` renders `<TreeProvider>` with the family's `forcedRootId`
4. `useGedcomData` hook fetches the GEDCOM file from `/public/` and calls `parseGedcom()`
5. Parsed data is stored in TreeContext via `setData()`
6. UI components (`FamilyTree`, `Sidebar`, `SearchBar`, `Stats`) consume data via `useTree()`

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
- `IndividualForm` — form for creating/editing individuals (name, sex, birth/death with hijri dates, notes)
- `FamilyEventForm` — form for marriage contract (MARC), marriage (MARR), divorce (DIV) events with expandable sections
- `FamilyPickerModal` — modal to select which family when adding/moving a child (polygamy support)
- `CoupleRow` — displays marriage event information between spouses
- `PersonCard` — individual node card in the tree
- `RootBackChip` — floating chip to navigate back to previous root after re-root
- `ViewModeToggle` — segmented pill to switch between single/multi-root view modes (DISABLED, not rendered)
- `EmptyTreeState` — placeholder for workspaces with no tree data

### GEDCOM File

The GEDCOM file (`public/saeed-family.ged`):
- GEDCOM 5.5.1 format (UTF-8 encoding) with Islamic extensions
- Individual records: `0 @ID@ INDI` with `NAME`, `SEX`, `BIRT`, `DEAT`, `FAMS`, `FAMC` tags
- Family records: `0 @ID@ FAM` with `HUSB`, `WIFE`, `CHIL`, `MARC` (marriage contract), `MARR` (marriage), `DIV` (divorce) tags
- Hijri dates via `@#DHIJRI@` calendar escape on DATE lines (legacy `_HIJR` subtag also supported)
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
- 19 models: User, Workspace, WorkspaceMembership, WorkspaceInvitation, UserTreeLink, FamilyTree, Individual, Family, FamilyChild, TreeEditLog, BranchShareToken, BranchPointer, Post, Album, AlbumMedia, Event, EventRsvp, Notification, Place
- `BranchShareToken` — SHA-256 hashed token with root individual, depth limit, target workspace scope, revoke flag
- `BranchPointer` — links source subtree to target workspace anchor; status (`active`/`revoked`/`broken`), relationship type, `linkChildrenToAnchor` flag, `shareTokenId` FK
- `FamilyTree` has `lastModifiedAt` timestamp (updated on every tree mutation, used for ETag caching)
- `User` has `calendarPreference` field (default: `'hijri'`)
- `Individual` has `birthHijriDate`, `deathHijriDate`, `birthNotes`, `deathNotes`, `birthDescription`, `deathDescription`
- `Family` has marriage contract (MARC), marriage (MARR), and divorce (DIV) event fields: `{type}Date`, `{type}HijriDate`, `{type}Place`, `{type}Description`, `{type}Notes`, plus `isDivorced`
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
- Redirect validation: `src/lib/auth/validate-redirect.ts` — validates `?next` parameter to prevent open redirects
- Middleware: `src/middleware.ts` — three code paths: static assets (skip), API routes (session refresh only, no login redirect), page routes (session refresh + login redirect)
- After login/signup, users are redirected to `/dashboard`

**API Utilities**:
- Auth guard: `src/lib/api/auth.ts` — `getAuthenticatedUser(request)` parses Bearer token, verifies via Supabase
- Workspace guards: `src/lib/api/workspace-auth.ts` — `requireWorkspaceMember()`, `requireWorkspaceAdmin()`, `requireTreeEditor()`
- Request helpers: `src/lib/api/route-helpers.ts` — `parseValidatedBody(request, zodSchema)` parses JSON + validates with Zod in one call; `isParseError()` type guard. Used by all mutable API routes to eliminate boilerplate.
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

**Tree API Routes** (`src/app/api/workspaces/[id]/tree/`):
- `GET /api/workspaces/[id]/tree` — full tree as `GedcomData` (private individuals redacted server-side); supports ETag/`If-None-Match` for 304 responses, returns `Cache-Control: private, max-age=30, stale-while-revalidate=300`; branch pointer source trees are fetched in parallel and deduplicated by workspace ID
- `POST /api/workspaces/[id]/tree/individuals` — create individual (`tree_editor` or admin)
- `PATCH /api/workspaces/[id]/tree/individuals/[id]` — update individual
- `DELETE /api/workspaces/[id]/tree/individuals/[id]` — delete individual
- `POST /api/workspaces/[id]/tree/families` — create family
- `PATCH /api/workspaces/[id]/tree/families/[id]` — update family
- `DELETE /api/workspaces/[id]/tree/families/[id]` — delete family
- `POST /api/workspaces/[id]/tree/families/[id]/children` — add child to family
- `DELETE /api/workspaces/[id]/tree/families/[id]/children/[individualId]` — remove child from family
- `POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move` — move child to another family

**Places API Route** (`src/app/api/workspaces/[id]/places/`):
- `GET /api/workspaces/[id]/places?q=...` — search places (global seed + workspace custom)
- `POST /api/workspaces/[id]/places` — create custom place for workspace

**User API Routes** (`src/app/api/users/`):
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

**Tree Library** (`src/lib/tree/`):
- `queries.ts` — database query helpers for tree CRUD; `touchTreeTimestamp(treeId)` updates `FamilyTree.lastModifiedAt` (called by all mutation routes for ETag invalidation)
- `mapper.ts` — `dbTreeToGedcomData()` maps DB records to `GedcomData` shape; `redactPrivateIndividuals()` strips PII from private individuals
- `seed-helpers.ts` — helpers for seeding tree data from GEDCOM
- `schemas.ts` — Zod validation schemas for tree API requests
- `branch-pointer-merge.ts` — `extractPointedSubtree()`, `mergePointedSubtree()`, `detectOrphanedChildren()`, stitching helpers (child/sibling/spouse/parent)
- `branch-pointer-deep-copy.ts` — `prepareDeepCopy()` (pure, new UUIDs + ID remapping) and `persistDeepCopy()` (DB writes for individuals, families, familyChildren, stitchFamily)
- `branch-pointer-schemas.ts` — Zod schemas for redeem token, share token creation
- `branch-pointer-queries.ts` — `getActivePointersForWorkspace()` with source workspace name join
- `branch-pointer-guards.ts` — `isSyntheticFamilyId()` for mutation guards on synthetic families
- `family-validators.ts` — centralized gender validation: `validateFamilyGender()` (DB), `validateSpouseGender()` (pure)

**Email** (`src/lib/email/`):
- `transport.ts` — Nodemailer with Gmail SMTP
- `templates/invite.ts` — Arabic RTL invitation email (HTML-escaped dynamic values, URL-validated links, header-injection-safe subjects)

**Workspace utilities** (`src/lib/workspace/`):
- `join-code.ts` — `crypto.randomBytes()` with 8 random characters (A-Z0-9), format: `SLUG_PREFIX-XXXXXXXX`
- `labels.ts` — `roleLabel()` maps workspace roles to Arabic display labels

**Seed** (`src/lib/seed/`):
- `seed-workspaces.ts` — creates workspaces from family configurations for local development
- `seed-places.ts` — seeds Place table from preprocessed GeoNames JSON (`prisma/seed-data/places.json`)
- `geonames-parser.ts` — TSV line parsers for raw GeoNames data (used by `scripts/preprocess-geonames.ts`)

**Places** (`src/lib/places/`):
- `schemas.ts` — Zod schemas for place search and creation API

**Dashboard & Workspace UI**:
- `/dashboard` — workspace list (مساحات العائلة), create button, logout
- `/dashboard/create` — create workspace form (اسم العائلة, slug, description)
- `/workspaces/[slug]` — workspace detail with members, invite modal, tree link
- `/workspaces/[slug]/tree` — database-backed tree view with edit controls (add/edit individual, add child/spouse/parent, move child, edit family events, delete)
- `/invite/[id]` — invitation acceptance page
- `/policy` — public policy page (Arabic + English)
- `/islamic-gedcom` — public reference page (مرجع GEDCOM الإسلامي): `@#DHIJRI@` calendar escape for Hijri dates (legacy `_HIJR` also supported), MARC/MARR/DIV Islamic marriage mappings, `_UMM_WALAD` (أم ولد flag on FAM), rada'a extensions (`_RADA_FAM`, `_RADA_WIFE`, `_RADA_HUSB`, `_RADA_CHIL`, `_RADA_FAMC`)
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

## After editing files
Do not run pnpm commands unless I ask to. pnpm dev will be already running by me in the terminal.

Run `pnpm test` after logic changes (skip for trivial changes like print statements or comments).

Check the browser when you have done work related to the frontend. It's better to use the default browser. Do not specify a browser.

**IMPORTANT: For browser/Playwright testing, ALWAYS use the test route: `http://localhost:3000/test?only=canvas`. See `docs/testing.md` for all query parameters.**