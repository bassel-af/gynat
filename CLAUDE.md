# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This repository ("solalah") is a **private family collaboration platform** evolving from a read-only genealogy viewer. Built with Next.js 15 (App Router) + React 19 + TypeScript, backed by PostgreSQL (Prisma ORM) and Supabase Auth (self-hosted via Docker Compose). The app is RTL (right-to-left) with Arabic as the primary language. See `docs/product-requirements.md` for the full PRD and `docs/auth-provider-decisions.md` for auth architecture decisions.

**Current state**: Phase 1 (Auth & Workspace Foundation) and Phase 2 (Editable Family Tree) are complete, including security hardening. Auth (email/password + Google OAuth), workspace CRUD, membership/invitations, dashboard UI, policy page, and database-backed editable family tree are all working. Phase 3 (Family-Aware Relationship Editing) is next. The tree visualization reads from the database via `GET /api/workspaces/[id]/tree`; static GEDCOM files in `/public/` are preserved for the legacy `/{familySlug}` routes and seeding.

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
- Tracks selected root ancestor (`selectedRootId`)
- Manages search query, tree configuration (max depth), loading state, and errors
- Provides `useTree()` hook for consuming components

The app wraps the entire application in `<TreeProvider>` via `src/app/providers.tsx` (client component).

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

**Search** (`src/lib/gedcom/search.ts`):
- `matchesSearch()` - Multi-word, diacritic-stripping, case-insensitive Arabic/Latin search

**Types** (`src/lib/gedcom/types.ts`):
- `Individual` - Person record with name, birth/death dates, sex, family references, `isPrivate` flag
- `Family` - Family unit with husband, wife, and children references
- `GedcomData` - Container for individuals and families records (keyed by ID)

**Graph utilities** (`src/lib/gedcom/graph.ts`):
- `getAllDescendants()` - Get all descendants of a person
- `getTreeVisibleIndividuals()` - Get individuals visible in the tree (with optional privacy filtering)
- `calculateDescendantCounts()` - Uses Kahn's algorithm (topological sort) for efficient O(V+E) counting

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

The `FamilyTree` component (`src/components/tree/FamilyTree/FamilyTree.tsx`) uses @xyflow/react with a **custom tree layout algorithm**:
- **Bottom-up pass**: Calculates subtree widths (post-order traversal)
- **Top-down pass**: Assigns positions keeping siblings together (pre-order traversal)
- Supports polygamous families with color-coded edges per spouse
- Privacy filtering: individuals with `isPrivate: true` are excluded from rendering

### GEDCOM File

The GEDCOM file (`public/saeed-family.ged`):
- GEDCOM 5.5.1 format (UTF-8 encoding)
- Individual records: `0 @ID@ INDI` with `NAME`, `SEX`, `BIRT`, `DEAT`, `FAMS`, `FAMC` tags
- Family records: `0 @ID@ FAM` with `HUSB`, `WIFE`, `CHIL` tags
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
- 16 tables: users, workspaces, workspace_memberships, workspace_invitations, user_tree_links, family_trees, individuals, families, family_children, tree_edit_logs, posts, albums, album_media, events, event_rsvps, notifications (branch tables removed in Phase 2)
- Prisma v7 uses driver adapters — client instantiation requires `PrismaPg` from `@prisma/adapter-pg`
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
- Redirect validation: `src/lib/auth/validate-redirect.ts` — validates `?next` parameter to prevent open redirects
- Middleware: `src/middleware.ts` — three code paths: static assets (skip), API routes (session refresh only, no login redirect), page routes (session refresh + login redirect)
- After login/signup, users are redirected to `/dashboard`

**API Utilities**:
- Auth guard: `src/lib/api/auth.ts` — `getAuthenticatedUser(request)` parses Bearer token, verifies via Supabase
- Workspace guards: `src/lib/api/workspace-auth.ts` — `requireWorkspaceMember()`, `requireWorkspaceAdmin()`, `requireTreeEditor()`
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
- `GET /api/workspaces/[id]/tree` — full tree as `GedcomData` (private individuals redacted server-side)
- `POST /api/workspaces/[id]/tree/individuals` — create individual (`tree_editor` or admin)
- `PATCH /api/workspaces/[id]/tree/individuals/[id]` — update individual
- `DELETE /api/workspaces/[id]/tree/individuals/[id]` — delete individual
- `POST /api/workspaces/[id]/tree/families` — create family
- `PATCH /api/workspaces/[id]/tree/families/[id]` — update family
- `DELETE /api/workspaces/[id]/tree/families/[id]` — delete family
- `POST /api/workspaces/[id]/tree/families/[id]/children` — add child to family
- `DELETE /api/workspaces/[id]/tree/families/[id]/children/[individualId]` — remove child from family

**Tree Library** (`src/lib/tree/`):
- `queries.ts` — database query helpers for tree CRUD
- `mapper.ts` — `dbTreeToGedcomData()` maps DB records to `GedcomData` shape; `redactPrivateIndividuals()` strips PII from private individuals
- `seed-helpers.ts` — helpers for seeding tree data from GEDCOM

**Email** (`src/lib/email/`):
- `transport.ts` — Nodemailer with Gmail SMTP
- `templates/invite.ts` — Arabic RTL invitation email (HTML-escaped dynamic values, URL-validated links, header-injection-safe subjects)

**Join Code Generation** (`src/lib/workspace/join-code.ts`):
- Uses `crypto.randomBytes()` with 8 random characters (A-Z0-9), format: `SLUG_PREFIX-XXXXXXXX`

**Dashboard & Workspace UI**:
- `/dashboard` — workspace list (مساحات العائلة), create button, logout
- `/dashboard/create` — create workspace form (اسم العائلة, slug, description)
- `/workspaces/[slug]` — workspace detail with members, invite modal, tree link
- `/workspaces/[slug]/tree` — database-backed tree view with edit controls (add/edit individual, add child/spouse/parent, delete)
- `/invite/[id]` — invitation acceptance page
- `/policy` — public policy page (Arabic + English)

**Environment Variables** (see `.env.example`):
- `.env` — `DATABASE_URL` (used by Prisma CLI)
- `.env.local` — `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `docker/.env` — Docker Compose secrets (gitignored)

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