# Project Structure

Last updated: 2026-03-30

## Overview

This is a Next.js 15 + React 19 + TypeScript private family collaboration platform (evolving from a read-only genealogy viewer). The project uses the App Router with Turbopack, Prisma ORM with PostgreSQL, and Supabase Auth (self-hosted). It follows modern React conventions with a component-based architecture, Context API for state management, custom hooks for data fetching and UI logic, and CSS Modules for styling. The primary language is Arabic (RTL layout).

The project is at Phase 5 (Branch Pointers) with Phases 1-5 complete.

## Directory Structure

### Root Level

**Configuration Files:**
- `next.config.ts` - Next.js configuration with security headers
- `vitest.config.ts` - Vitest test runner configuration
- `tsconfig.json` - TypeScript compiler configuration with path aliases (`@/` -> `/src/`)
- `package.json` - Dependencies and scripts (uses pnpm 10.28.0)
- `pnpm-lock.yaml` - Lock file for pnpm package manager
- `.npmrc` - pnpm configuration
- `.gitignore` - Git ignore rules
- `.gitattributes` - Git attributes
- `prisma.config.ts` - Prisma configuration (loads `DATABASE_URL` via dotenv)

**Documentation:**
- `README.md` - Project readme
- `CLAUDE.md` - Instructions for Claude Code AI assistant
- `todo.txt` - Development task tracking (tracked in git)

**Build Output (gitignored):**
- `.next/` - Next.js build output
- `generated/prisma/` - Prisma generated client
- `tsconfig.tsbuildinfo` - TypeScript incremental compilation info
- `next-env.d.ts` - Next.js TypeScript declarations (auto-generated)

**Tool Directories:**
- `.claude/` - Claude Code configuration (agents, commands, skills, design system, settings)
- `.playwright-mcp/` - Playwright MCP configuration (gitignored)
- `skills/` - Claude Code skill definitions (e.g., `explain-code/SKILL.md`)
- `test-results/` - Test run results (`.last-run.json`, gitignored)

### `/docs/`

**Role:** Project documentation

**Contents:**
- `project-structure.md` - This file
- `product-requirements.md` - Full PRD (Phases 1-5+)
- `auth-provider-decisions.md` - Auth architecture decision record
- `setup.md` - Development setup guide
- `testing.md` - Testing guide and test mode query parameters
- `workspaces-problem.md` - Design document for workspace architecture
- `in-law-visibility.md` - In-law visibility feature design (Phase 4)
- `design-reroot-on-spouse-ancestor.md` - Re-root on spouse's ancestor design (Phase 4)
- `design-multi-root-view.md` - Multi-root view design (Phase 4, DISABLED)
- `design-branch-pointers.md` - Branch pointers design (Phase 5)
- `gedcom-marriage-explainer.html` - Standalone HTML explainer for GEDCOM marriage concepts
- `screenshots/` - Mobile UI screenshots (`mobile-fab-test.png`, `mobile-sidebar-open.png`)

### `/docker/`

**Role:** Docker Compose configuration for self-hosted Supabase stack

**Contents:**
- `docker-compose.yml` - Service definitions (PostgreSQL 15, GoTrue, Kong, Studio, pg-meta)
- `kong.yml` - Kong API gateway configuration
- `.env` - Docker secrets (gitignored)
- `init-scripts/01-auth-schema.sh` - Database initialization script

### `/prisma/`

**Role:** Prisma ORM configuration, schema, migrations, and seed data

**Contents:**
- `schema.prisma` - Database schema (19 models: User, Workspace, WorkspaceMembership, WorkspaceInvitation, UserTreeLink, FamilyTree, Individual, Family, FamilyChild, TreeEditLog, BranchShareToken, BranchPointer, Post, Album, AlbumMedia, Event, EventRsvp, Notification, Place)
- `seed.ts` - Main seed script (workspaces + tree data from GEDCOM + places)
- `migrations/` - Prisma migrations (15 migrations from init through umm_walad)
- `seed-data/places.json` - Pre-processed GeoNames place data (~5MB, countries/regions/cities with Arabic names)

### `/scripts/`

**Role:** Standalone build/preprocessing/maintenance scripts

**Contents:**
- `preprocess-geonames.ts` - Processes raw GeoNames data into `prisma/seed-data/places.json`
- `clean-links.ts` - Delete all branch pointers + share tokens
- `reseed-tree.ts` - Clean tree data + re-seed from GEDCOM files
- `reseed-places.ts` - Clean places + re-seed from places.json
- `reseed-all.ts` - Clean everything + re-seed places + tree
- `start-fresh.ts` - Clean links + clean tree + clean places + re-seed all
- `geonames-data/` - Raw GeoNames download files (~971MB, gitignored)

### `/public/`

**Role:** Static assets served as-is by Next.js

**Contents:**
- `saeed-family.ged` - Primary GEDCOM genealogy data file (legacy routes + seeding)
- `test-family.ged` - Small test GEDCOM file for browser E2E testing

### `/src/`

**Role:** All application source code

#### `/src/app/`

**Role:** Next.js App Router pages, layouts, and API routes

**Contents:**
- `layout.tsx` - Root layout with HTML structure, fonts, RTL direction, metadata
- `page.tsx` - Home/landing page (redirects authenticated users to `/dashboard`)
- `page.module.css` - Landing page styles
- `not-found.tsx` / `not-found.module.css` - 404 page
- `globals.css` - Global CSS imports (tokens, base, tree-global)
- `providers.tsx` - Client component wrapping legacy routes in `TreeProvider` + `CalendarPreferenceContext`
- `global-providers.tsx` - Client component wrapping entire app in `ToastProvider`
- `robots.ts` - Robots.txt generation
- `sitemap.ts` - Sitemap generation

**Route directories:**
- `[familySlug]/` - Legacy family routes (`page.tsx`, `FamilyTreeClient.tsx`)
- `auth/` - Authentication pages (login, signup, forgot-password, callback)
  - `auth.module.css` - Shared auth page styles
- `dashboard/` - Dashboard and workspace creation pages
- `workspaces/[slug]/` - Workspace detail and tree view
  - `tree/` - Database-backed tree view (`WorkspaceTreeClient.tsx`)
- `invite/[id]/` - Invitation acceptance page (`InviteAcceptClient.tsx`)
- `policy/` - Public policy page
- `islamic-gedcom/` - Public GEDCOM standard documentation page

**API routes (`/src/app/api/`):**
- `auth/sync-user/route.ts` - User sync endpoint
- `invitations/[id]/accept/route.ts` - Invitation acceptance
- `users/me/preferences/route.ts` - User preferences (calendar)
- `workspaces/` - Full workspace CRUD, members, invitations
  - `[id]/places/route.ts` - Place search and creation (workspace-scoped)
  - `[id]/tree/` - Tree CRUD (individuals, families, children, move)
  - `[id]/branch-pointers/` - Branch pointer CRUD (redeem, disconnect, deep copy)
  - `[id]/share-tokens/` - Share token CRUD (create, list, disable, revoke, preview)
- `workspaces/by-slug/[slug]/route.ts` - Workspace lookup by slug
- `workspaces/join/route.ts` - Join workspace via code

#### `/src/components/`

**Role:** React components organized by domain

##### `/src/components/tree/`
**Purpose:** Family tree visualization and editing components
- `FamilyTree/` - Main tree renderer using @xyflow/react (custom layout algorithm in `layout.ts`; no CSS Module -- uses tree-global.css)
- `PersonCard/` - Individual node card in the tree
- `CoupleRow/` - Marriage event display between spouses
- `IndividualForm/` - Form for creating/editing individuals
- `FamilyEventForm/` - Form for marriage/divorce events
- `FamilyPickerModal/` - Modal for selecting family (polygamy support)
- `EmptyTreeState/` - Placeholder for workspaces with no tree data
- `RootBackChip/` - Floating chip to navigate back to previous root after re-root (no index.ts)
- `ViewModeToggle/` - Segmented pill for view mode switching, DISABLED (no index.ts)
- `index.ts` - Barrel export (exports FamilyTree, PersonCard, CoupleRow, EmptyTreeState, IndividualForm, FamilyPickerModal, FamilyEventForm)

##### `/src/components/ui/`
**Purpose:** Reusable UI components
- `Alert/` - Alert/notification component
- `Button/` - Button component
- `CenteredCardLayout/` - Centered card page layout
- `Input/` - Form input component
- `Modal/` - Modal dialog component
- `PlaceComboBox/` - Place search combobox with autocomplete
- `Sidebar/` - Sidebar with person detail panel (`PersonDetail.tsx`, `PersonDetail.module.css`)
- `Spinner/` - Loading spinner
- `SpouseFamilySidebar/` - Spouse family detail panel (no index.ts)
- `Toast/` - Toast notification component
- `RootSelector.tsx` - Dropdown to select root ancestor (standalone file, no directory)
- `SearchBar.tsx` - Search functionality component (standalone file, no directory)
- `Stats.tsx` - Tree statistics display (standalone file, no directory)
- `index.ts` - Barrel export (all components including PlaceComboBox and Toast)

##### `/src/components/workspace/`
**Purpose:** Workspace management components (Phase 5 branch pointers)
- `IncomingPointerList/` - Lists incoming branch pointers for a workspace (no index.ts)
- `ShareBranchModal/` - Modal for creating share tokens (no index.ts)
- `ShareTokenList/` - Lists share tokens with management actions (no index.ts)
- No `index.ts` barrel export for this domain group

##### `/src/components/dev/`
**Purpose:** Development and experimental components
- `Playground.tsx` - Experimental SVG tree layout
- `index.ts` - Barrel export

#### `/src/config/`

**Role:** Application configuration

**Contents:**
- `families.ts` - Family configuration entries (slug, rootId, displayName, gedcomFile)

#### `/src/context/`

**Role:** React Context providers for global state management

**Contents:**
- `TreeContext.tsx` - Central tree state (GEDCOM data, selected root, search, config, view mode)
- `WorkspaceTreeContext.tsx` - Workspace-specific tree state (workspaceId, canEdit, refresh, pointers)
- `ToastContext.tsx` - App-wide toast notifications

Note: `CalendarPreferenceContext` is defined inside `src/hooks/useCalendarPreference.ts` rather than in this directory.

#### `/src/hooks/`

**Role:** Custom React hooks

**Contents:**
- `useCalendarPreference.ts` - Hijri/Gregorian preference with localStorage + server sync (also exports `CalendarPreferenceContext`)
- `useGedcomData.ts` - Fetches GEDCOM files for legacy routes
- `usePersonActions.ts` - Phase 3 editing state machine (add/edit/delete individuals, families, events)
- `usePointerActions.ts` - Shared hook for branch pointer break/copy API calls
- `useTreeLines.ts` - SVG line drawing for playground mode
- `useWorkspaceTreeData.ts` - Fetches and manages workspace tree data

#### `/src/lib/`

**Role:** Business logic, utilities, and domain-specific libraries

##### `/src/lib/api/`
**Purpose:** API utilities for both server and client
- `auth.ts` - Server-side auth guard (`getAuthenticatedUser`)
- `client.ts` - Client-side `apiFetch` with Bearer token
- `rate-limit.ts` - In-memory rate limiter
- `serialize.ts` - BigInt JSON serialization
- `workspace-auth.ts` - Workspace membership/permission guards

##### `/src/lib/auth/`
**Purpose:** Authentication helpers
- `sync-user.ts` - GoTrue-to-DB user sync
- `validate-redirect.ts` - Redirect URL validation (anti-open-redirect)

##### `/src/lib/email/`
**Purpose:** Email sending infrastructure
- `transport.ts` - Nodemailer/Gmail SMTP transport
- `templates/invite.ts` - Arabic RTL invitation email template

##### `/src/lib/gedcom/`
**Purpose:** GEDCOM file parsing and data manipulation
- `types.ts` - Core types (`Individual`, `Family`, `FamilyEvent`, `GedcomData`)
- `parser.ts` - GEDCOM text parser
- `display.ts` - Name display formatting (nasab/patronymic chains)
- `roots.ts` - Root ancestor identification
- `graph.ts` - Graph traversal, subtree extraction, descendant counting, privacy filtering, graft descriptors
- `relationships.ts` - Person relationship computation
- `index.ts` - Barrel export

##### `/src/lib/places/`
**Purpose:** Place-related validation schemas
- `schemas.ts` - Zod schemas for place search and creation

##### `/src/lib/seed/`
**Purpose:** Database seeding utilities
- `seed-workspaces.ts` - Seed workspaces from family configs
- `seed-places.ts` - Seed Place table from preprocessed GeoNames data
- `run-seed-places.ts` - Standalone script entry point for `pnpm seed:places`
- `geonames-parser.ts` - Pure GeoNames TSV line parsers

##### `/src/lib/tree/`
**Purpose:** Database-backed tree operations and branch pointer logic
- `queries.ts` - Database query helpers for tree CRUD
- `mapper.ts` - DB-to-GedcomData mapping + privacy redaction
- `schemas.ts` - Zod validation schemas for tree API
- `seed-helpers.ts` - Helpers for seeding tree data from GEDCOM
- `seed-place-mapping.ts` - GEDCOM place string to Arabic name + Place ID resolution
- `family-validators.ts` - Centralized gender validation for families
- `branch-pointer-merge.ts` - Subtree extraction and merge for branch pointers
- `branch-pointer-deep-copy.ts` - Deep copy logic (new UUIDs + ID remapping + DB persistence)
- `branch-pointer-schemas.ts` - Zod schemas for redeem token, share token creation
- `branch-pointer-queries.ts` - Active pointer queries with source workspace join
- `branch-pointer-guards.ts` - Synthetic family ID mutation guards
- `branch-share-token.ts` - Share token hashing and validation

##### `/src/lib/supabase/`
**Purpose:** Supabase client wrappers
- `client.ts` - Browser client
- `server.ts` - Server client (Next.js cookies)
- `middleware.ts` - Session refresh middleware

##### `/src/lib/utils/`
**Purpose:** Generic utility functions
- `html-escape.ts` - HTML escaping for email templates
- `search.ts` - Arabic diacritics stripping and multi-word search matching

##### `/src/lib/workspace/`
**Purpose:** Workspace-specific utilities
- `join-code.ts` - Join code generation
- `labels.ts` - Role label localization (Arabic)

**Standalone files in `/src/lib/`:**
- `db.ts` - Prisma singleton client
- `calendar-helpers.ts` - Calendar preference display helpers
- `person-detail-helpers.ts` - Person detail form data builders, validation, display

#### `/src/styles/`

**Role:** Global CSS and design tokens

**Contents:**
- `tree-global.css` - React Flow class overrides
- `form-elements.module.css` - Shared form element styles (CSS Module)
- `scrollbar.module.css` - Reusable scrollbar styles (CSS Module)
- `base/` - Base stylesheets
  - `index.css` - Base style imports
  - `reset.css` - CSS reset
  - `layout.css` - Global layout styles
- `tokens/` - Design tokens
  - `index.css` - Token imports
  - `colors.css`, `typography.css`, `spacing.css`, `shadows.css`, `transitions.css`

#### `/src/test/`

**Role:** All test files (centralized, not co-located with source)

**Contents:** 90+ test files covering:
- GEDCOM parsing, display, search, relationships, graph operations
- API routes (workspaces, tree CRUD, places, auth, invitations, members)
- Branch pointer operations (redeem, stitching rules, deep copy, merge, schemas, mutation guards)
- Share token operations (create, list, disable, revoke, preview, auto deep copy)
- Components (IndividualForm, FamilyEventForm, FamilyPickerModal, PlaceComboBox, PersonDetail)
- Hooks (usePersonActions, useCalendarPreference)
- Utilities (rate-limit, html-escape, validate-redirect, calendar-helpers)
- Security (headers, input validation)
- Seeding (tree seed, place seed, geonames parser, place mapping)
- SEO (robots.ts, sitemap.ts)

**Subdirectory:**
- `fixtures/` - Test data files (`saeed-family.ged`, `test-family.ged`)
- `setup.ts` - Test setup configuration

#### `/src/types/`

**Role:** Global TypeScript type declarations

**Contents:**
- `iconify.d.ts` - JSX type augmentation for `<iconify-icon>` web component

#### `/src/middleware.ts`

**Role:** Next.js middleware for session refresh and auth redirects

## Conventions

### File Naming
- React components: **PascalCase** directories and files (e.g., `FamilyTree/FamilyTree.tsx`)
- Hooks: **camelCase** with `use` prefix (e.g., `useGedcomData.ts`)
- Utilities/libraries: **camelCase** (e.g., `display.ts`, `calendar-helpers.ts`)
- CSS Modules: **PascalCase** matching component name (e.g., `FamilyTree.module.css`) or **kebab-case** for shared styles (e.g., `form-elements.module.css`)
- Global CSS: **kebab-case** (e.g., `tree-global.css`)
- Type definitions: **camelCase** (e.g., `types.ts`)

### Path Aliases
- `@/` resolves to `/src/` directory (configured in tsconfig.json)

### Component Organization
- Components grouped by domain: `/tree/` for visualization, `/ui/` for reusable controls, `/workspace/` for workspace management, `/dev/` for experiments
- Most components use the directory pattern: `ComponentName/ComponentName.tsx` + `ComponentName.module.css` + `index.ts`
- Three legacy UI components remain as standalone files: `RootSelector.tsx`, `SearchBar.tsx`, `Stats.tsx`
- Domain-level barrel exports at `/src/components/tree/index.ts` and `/src/components/ui/index.ts`

### Testing
- All test files centralized in `/src/test/`
- Test fixtures in `/src/test/fixtures/`
- Naming pattern: `*.test.ts` or `*.test.tsx`
- Tests use Vitest with jsdom and @testing-library/react

### API Routes
- Follow Next.js App Router conventions with `route.ts` files
- Resource nesting mirrors REST structure (e.g., `/workspaces/[id]/tree/individuals/[individualId]`)

## Technology Stack

- **Package Manager:** pnpm 10.28.0
- **Framework:** Next.js 15.x with App Router and Turbopack
- **UI:** React 19.x with TypeScript 5.x
- **ORM:** Prisma 7.x with `@prisma/adapter-pg` driver adapter
- **Auth:** Supabase Auth (GoTrue) via `@supabase/ssr`, self-hosted
- **Validation:** Zod
- **Tree Visualization:** @xyflow/react with custom layout algorithm
- **Styling:** CSS Modules with design tokens
- **Testing:** Vitest with jsdom and @testing-library/react
- **Email:** Nodemailer with Gmail SMTP
