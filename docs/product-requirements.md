# Product Requirements Document — Solalah Platform

**Version**: 2.0
**Date**: 2026-03-23
**Status**: Draft
**Audience**: Human developers, AI coding assistants

---

## 0. Existing Codebase Context

This PRD describes the evolution of an **already-running** Next.js application. A fresh AI or developer must understand the current state before making changes.

**Current state of the app:**
- Next.js 15 (App Router) + React 19 + TypeScript, using `pnpm`
- Multi-family routing already exists: `/{familySlug}` (e.g., `/saeed`, `/al-dabbagh`)
- Family configs are statically defined in `src/config/families.ts` as a `FAMILIES` record with slugs, root IDs, and GEDCOM file paths
- GEDCOM files live in `/public/` and are fetched and parsed entirely in the browser
- GEDCOM parser lives at `src/lib/gedcom/parser.ts` — this must be preserved and reused as the import engine in Phase 3
- No authentication, no database, no backend — everything is client-side today
- The root URL (`/`) returns 404; all content is under `/{familySlug}`

**What Phase 1 changed:**
- Introduced a database (PostgreSQL via Supabase), an auth layer (Supabase Auth / GoTrue), and Next.js API routes as the backend
- The existing `/{familySlug}` routing evolved: slugs become workspace slugs stored in the database rather than static config
- Existing family configs in `src/config/families.ts` were seeded as workspace records in the database
- The existing tree visualization continues to read from static GEDCOM files until Phase 2 (no tree data migration in Phase 1)

**⚠️ Phase 1 cleanup required in Phase 2:**
Phase 1 created a Prisma schema with 20 tables, including branch-related tables (`branches`, `branch_memberships`, `branch_invitations`) and `branch_id` foreign keys on content tables (`posts`, `albums`, `events`). These must be **removed via a Prisma migration** at the start of Phase 2, as the branch model has been eliminated from the architecture (see Section 2.2). The notification types `branch_invite` and `branch_admin_vacancy` should also be removed.

**Tech stack:**
- Framework: Next.js 15 App Router
- Language: TypeScript (strict mode)
- Package manager: pnpm
- ORM: Prisma (manages `public.*` schema migrations against the Supabase PostgreSQL instance)
- API: Next.js API routes (`src/app/api/`)
- Auth: Supabase Auth (GoTrue), integrated via `@supabase/supabase-js`
- Database: PostgreSQL (provided by self-hosted Supabase)
- Deployment: Docker Compose (see §9)
- UI: CSS Modules + design tokens, RTL

---

## 1. Vision

Solalah is evolving from a read-only genealogy viewer into a **private family collaboration platform**. Each family gets a shared digital space (workspace) with a family tree, news, albums, and events. A single user account works across multiple family workspaces simultaneously.

Sub-families that want their own private content (news, albums, events, meetings) simply create their own independent workspace. Workspaces are never nested or dependent on each other. The only cross-workspace connection is at the **tree level**: a workspace can display a read-only pointer to a branch (subtree) from another workspace's family tree.

The platform is Arabic-first, RTL, and designed for families — not for general social networking. Privacy is a core value: private content must stay private, even from platform administrators.

---

## 2. Core Concepts

### 2.1 Workspace

A workspace represents a family (e.g., "آل سعيد" for an extended family, or "عائلة أحمد" for a nuclear family). It is the **only** organizational unit in the platform — there are no sub-groups, branches, or nested structures within a workspace.

- Any registered user can create a workspace (self-service)
- Has exactly one family tree shared by all members
- Has workspace-wide content visible to all members (news, events, albums)
- Has one or more admins and zero or more members
- Members join by invitation only — no self-registration into a workspace
- Workspaces are fully independent — no workspace owns, nests under, or depends on another workspace
- Storage quota: **5 GB per workspace** (media across all content types counts toward this limit). Quota is tracked and visible to admins but **not enforced in v1** — the platform is free during the growth phase. Enforcement and billing will be introduced in a future version. A policy page must exist from launch that can be updated when this changes.

### 2.2 No In-Workspace Branches

Earlier versions of this PRD defined "branches" as private sub-groups inside a workspace with their own content scope, roles, and permissions. **This model has been removed entirely.** The reasons:

- It created tight coupling between branch and parent workspace (deletion cascades, permission complexity)
- It required branch-specific roles, vacancy resolution logic, and scoped content queries — all unnecessary complexity
- The same goal (private space for a sub-family) is achieved more simply: the sub-family creates their own independent workspace

**What was removed:** `Branch`, `BranchMembership`, `BranchInvitation` tables; branch roles (`branch_admin`, `branch_member`); `branch_id` on content tables; branch-scoped content and permission checks; branch admin vacancy resolution logic.

**What replaces it:** Nothing at the workspace level. Sub-families that want private content create their own workspace. The only cross-workspace feature is branch pointers in the family tree (see Section 2.6).

### 2.3 User

A user is a single account that can participate in multiple workspaces.

- One account links a person's presence across all their workspaces
- Has independent roles in each workspace (e.g., admin in one, member in another)
- Can optionally be linked to an individual in each workspace's family tree (see Section 2.5)
- A user's entry in a workspace's family tree is independent of their entry in another workspace's tree (the trees are separate; cross-tree identity linking is deferred but the architecture must not prevent it)

### 2.4 Roles

**Workspace roles** (per workspace):

| Role | Description |
|---|---|
| `workspace_admin` | Manages workspace settings, members, and grants content roles. |
| `workspace_member` | Base role. Can view workspace-wide content. Additional capabilities are granted via content roles below. |

**Content roles** (granted per workspace member by `workspace_admin`):

| Role | Description |
|---|---|
| `tree_editor` | Can add, edit, and delete individuals and relationships in the workspace tree |
| `news_editor` | Can create and edit news posts |
| `album_editor` | Can create albums and upload media |
| `event_editor` | Can create and edit events |

A `workspace_admin` implicitly has all content roles.

### 2.5 User-Tree Linking

A user account can be linked to an individual record in a workspace's family tree. This is optional — a user can be a workspace member without being linked to any individual, and an individual in the tree can exist without a linked user account.

**Linking flows:**

- **Flow A (invite-with-link)**: When a `workspace_admin` invites a user to the workspace, they may optionally specify which individual in the tree this user corresponds to. The invitee must confirm the link when accepting the invitation. The link becomes active only after confirmation.
- **Flow B (member requests link)**: An existing workspace member can search the tree and request to be linked to a specific individual. The request is sent to the `workspace_admin` as a notification. The admin approves or rejects. The link becomes active only after admin approval. A member cannot self-link without admin approval.

**Rules:**
- One individual <-> at most one linked user account per workspace
- A user can be unlinked by themselves or by a `workspace_admin`
- Linking a user to an individual does not change any privacy or content access rules — it is a profile association only (used for personalization, birthday notifications, tree highlights, and future cross-workspace identity features)

### 2.6 Branch Pointers (Cross-Workspace Tree Sharing)

A branch pointer allows a workspace to display a **read-only reference** to a subtree (branch) from another workspace's family tree. This is the only cross-workspace mechanism in the platform — workspaces themselves have no knowledge of each other.

**How it works:**
- A "branch" in tree terms = an ancestor individual + all their descendants (goes downward only, never upward)
- The admin of workspace A (source) provides a shareable link for a branch in their tree
- A user in workspace B (target) adds that branch to their tree via the link — it appears as a read-only pointer
- The pointer reads live from the source: if workspace A edits an individual in the branch, workspace B sees the update automatically
- The pointer is read-only in workspace B — they cannot edit individuals that belong to workspace A's tree

**Admin controls on the source workspace:**
- **Shareable**: branches can be shared as pointers and can also be hard-copied by the target workspace
- **Copyable only**: branches cannot be shared as live pointers, but can be hard-copied (one-time import, no live link)
- **None**: branches cannot be shared or copied

**Lifecycle events:**
- If the source workspace **revokes sharing** for a branch, all pointers to that branch are automatically converted to deep copies in each target workspace. The target workspace admin receives a notification: "This branch is no longer maintained by the original workspace. It is now your own copy."
- If the source workspace **deletes the branch ancestor** (or the workspace itself is deleted), the same deep-copy conversion + notification occurs.
- If the target workspace wants to **edit** a pointed branch, they must first do a hard copy, which breaks the live link and creates an independent copy they fully own.

---

## 3. Content Model

Content objects (news posts, albums, events) belong to a **workspace** and are visible to all workspace members.

No content is public to the internet unless explicitly shared via a public link (a future feature, out of scope for now).

### 3.1 Content Types

| Type | Description |
|---|---|
| News post | Rich text announcement or update, optional media attachments |
| Album | Collection of photos/videos |
| Event | Calendar entry with date, time, location, description, optional RSVP |

### 3.2 Media Limits

All uploaded media (images, videos) in news posts, albums, and events counts toward the workspace's **5 GB storage quota**.

### 3.3 Family Tree

The family tree belongs to the workspace and is shared by all workspace members. It is editable by users with the `tree_editor` role.

---

## 4. Permission Model (Summary)

| Action | Who can do it |
|---|---|
| Create a workspace | Any registered user (self-service) |
| Invite members to workspace | `workspace_admin` |
| Remove members from workspace | `workspace_admin` |
| Grant content roles | `workspace_admin` |
| Edit the family tree | Users with `tree_editor` role (or `workspace_admin`) |
| Link a user to a tree individual | `workspace_admin` approves; user confirms |
| Request self-linking to a tree individual | Any `workspace_member` (pending admin approval) |
| Create news/albums/events | Users with the corresponding editor role (or `workspace_admin`) |
| Share a branch pointer to another workspace | `workspace_admin` of source workspace (if sharing policy allows) |
| View RSVP responses for an event | Configurable by the event creator or `workspace_admin` (options: all members see full list, counts only, or admin-only) |

---

## 5. Feature Requirements

### 5.1 Authentication

- Handled by **Supabase Auth** (self-hosted via Docker Compose, see `docs/auth-provider-decisions.md`)
- JWT-based sessions with full refresh token control
- Workspace memberships are managed in the application layer, not in Supabase Auth
- Supabase Auth handles: login, registration, password recovery, email verification, session management, token revocation
- **Supported sign-in methods:**
  - Email + password
  - Google SSO (OAuth)
  - Phone number OTP via SMS (requires SMS gateway — deferred to a later phase, infrastructure is ready from day one)
- **2FA**: TOTP-based (authenticator app) supported natively
- All auth infrastructure runs in Docker on our own server — no user data leaves to third-party services

### 5.2 Workspace Management

- Workspace has: name (Arabic + Latin), slug (URL identifier), logo/avatar, description
- Any registered user can create a workspace; the creator becomes the first `workspace_admin`
- Workspace admin can: invite members, remove members, grant/revoke content roles, manage workspace settings, configure branch sharing policy
- Storage usage dashboard visible to `workspace_admin`

**Invite methods** (both supported):

- **Email invite**: admin enters a member's email -> invite link sent -> recipient clicks, signs in or registers, joins workspace
- **Workspace join code**: admin generates a short alphanumeric code (e.g., `SAEED-4X7K`). Admin shares it anywhere (WhatsApp group, SMS, verbally). Any signed-in user who enters a valid code joins the workspace. Codes can have an optional expiry date and an optional max-use count set by the admin. Admin can revoke a code at any time.

### 5.3 Editable Family Tree

- Tree data stored in the database (not as static GEDCOM files at runtime)
- GEDCOM is the import/export format, not the storage format
- The existing GEDCOM parser (`src/lib/gedcom/parser.ts`) is preserved and reused as the import engine
- Operations: add individual, edit individual, add relationship, remove relationship, delete individual
- Privacy flag on individuals (`isPrivate`) is preserved and enforced in the UI
- **Each workspace owns its own tree data** — no shared mutable references across workspaces
- Branch pointers (Section 2.6) allow read-only cross-workspace subtree references

### 5.4 GEDCOM Import/Export

- **Import**: workspace admin or `tree_editor` can upload a `.ged` file to populate or update the tree (reuses existing parser)
- **Export**: any workspace member can export the full tree as a `.ged` file at any time

### 5.5 Policy Page

- A `/policy` page must exist from launch containing: terms of service, privacy policy, and storage/billing policy
- Written in Arabic (primary) and English
- Must clearly state: the platform is currently free, but terms including storage limits and billing may change with notice
- The page is publicly accessible (no login required)
- Content is managed as a static document and updated manually when policies change

### 5.6 News

- Rich text posts with optional media attachments (counts toward storage quota)
- Workspace-scoped (visible to all workspace members)
- Members can react and comment (basic interactions, details TBD)
- Admin can pin posts

### 5.7 Albums

- Collections of photos and videos
- Workspace-scoped
- Photos can be tagged to individuals in the family tree
- Storage usage counted for admin visibility

### 5.8 Events / Calendar

- Events have: title, date/time, location (text), description, optional RSVP
- Workspace-scoped
- Birthdays and anniversaries from the family tree are auto-populated as workspace-level events (read-only, generated)
- Members can RSVP: attending / not attending / maybe
- RSVP visibility is configurable per event: full list / counts only / admin-only

---

## 6. Data Model (High-Level Entities)

### Schema ownership

All tables below live in the `public` schema and are managed by **Prisma** migrations. GoTrue manages the `auth` schema independently. Application code never queries `auth.*` directly.

When a user is created in GoTrue, a corresponding row is inserted into `public.users` (via a GoTrue webhook or database trigger) with the same UUID. All foreign key relationships in the application reference `public.users.id`, never `auth.users.id`. This keeps the application decoupled from the auth provider — switching auth providers means updating `public.users`, nothing else.

```
-- auth.users is owned by GoTrue (not shown here)
-- public.users mirrors it and is the only user table the app touches

public.users  <- mirror of auth.users, created on user sign-up
  id           (same UUID as auth.users.id)
  email
  display_name
  avatar_url
  phone        (nullable)
  created_at

Workspace
  id, slug, name_ar, name_en, logo_url, description, created_by (user_id),
  storage_quota_bytes, branch_sharing_policy (shareable | copyable_only | none),
  created_at

WorkspaceMembership
  user_id, workspace_id, role (workspace_admin | workspace_member),
  permissions (tree_editor | news_editor | album_editor | event_editor -- array),
  joined_at

WorkspaceInvitation
  id, workspace_id, type (email | code),
  email (nullable -- set for email type),
  code (nullable -- set for code type, e.g. "SAEED-4X7K"),
  individual_id (nullable -- for invite-with-tree-link, Flow A),
  invited_by (user_id), expires_at (nullable), max_uses (nullable),
  use_count, status (pending | accepted | revoked), created_at

UserTreeLink
  id, user_id, individual_id, workspace_id,
  status (pending | confirmed), requested_by (user_id), confirmed_at

FamilyTree
  id, workspace_id
  (one tree per workspace)

Individual
  id, tree_id, [all GEDCOM fields], is_private, created_by, updated_at

Family (relationship unit)
  id, tree_id, husband_id, wife_id, [children via FamilyChild]

FamilyChild
  family_id, individual_id

BranchPointer
  id, source_workspace_id, source_individual_id (root ancestor of shared subtree),
  target_workspace_id, target_tree_id,
  status (active | deep_copied), created_at, converted_at (nullable)

TreeEditLog
  id, tree_id, user_id, action, entity_type, entity_id, payload (JSON), timestamp

Post (news)
  id, workspace_id, author_id, content,
  media_size_bytes, is_pinned, created_at

Album
  id, workspace_id, name, created_by, created_at

AlbumMedia
  id, album_id, file_url, file_size_bytes, tagged_individual_ids (array), uploaded_at

Event
  id, workspace_id, title, start_at, end_at,
  location, description, is_generated, rsvp_visibility (all | counts | admin), created_by

EventRsvp
  user_id, event_id, status (attending | not_attending | maybe), updated_at

Notification
  id, user_id, type, payload (JSON), is_read, created_at
  (types include: workspace_invite, tree_link_request, tree_link_approved,
   branch_pointer_revoked)
```

**Tables removed from Phase 1 schema** (must be dropped via Prisma migration at start of Phase 2):
- `branches`
- `branch_memberships`
- `branch_invitations`
- `branch_id` column on `posts`, `albums`, `events`
- Notification types `branch_invite` and `branch_admin_vacancy`

---

## 7. Build Phases

### Phase 1 — Auth & Workspace Foundation ✅ COMPLETE

**✅ Infrastructure:**
- Supabase Auth self-hosted (Docker Compose): PostgreSQL + GoTrue v2.186.0 + Kong 3.9.1 + Studio + pg-meta — `docker/docker-compose.yml`
- Prisma ORM with full data model (20 tables) — `prisma/schema.prisma`, migration applied
- Prisma v7 with `@prisma/adapter-pg` driver adapter — `src/lib/db.ts`
- Supabase client libraries via `@supabase/ssr` — `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts` (server), `src/lib/supabase/middleware.ts` (middleware)
- Environment config — `.env.local` (Next.js), `docker/.env` (Docker Compose), `.env` (Prisma)
- Phone OTP infrastructure ready in GoTrue config but activation deferred (SMS gateway not configured)

**✅ Auth pages & middleware:**
- Auth pages — `/auth/signup`, `/auth/login` with email/password + Google OAuth button (Arabic RTL UI)
- Auth callback route — `/auth/callback` for OAuth/email confirmation redirects, sets auth cookies via `@supabase/ssr`
- User sync — `POST /api/auth/sync-user` mirrors GoTrue user to `public.users`, wired into login/signup/callback flows
- Shared sync helper — `src/lib/auth/sync-user.ts` (used by both API route and callback)
- Route protection middleware — `src/middleware.ts` uses `@supabase/ssr` to verify/refresh sessions, redirects unauthenticated users to `/auth/login`
- Auth utilities — `src/lib/api/auth.ts` (server-side `getAuthenticatedUser`), `src/lib/api/client.ts` (client-side `apiFetch` with auto Bearer token)
- Tests — middleware, sync-user API, sync-user helper, callback, auth helper, API client (23 tests)

**✅ Workspace features:**
- Workspace CRUD API — `POST /api/workspaces` (create), `GET /api/workspaces` (list), `GET /api/workspaces/[id]` (detail), `PATCH /api/workspaces/[id]` (update), `GET /api/workspaces/by-slug/[slug]` (slug resolution)
- Self-service workspace creation; creator becomes first `workspace_admin` (atomic via `$transaction`)
- Workspace membership API — `GET /api/workspaces/[id]/members` (list), `POST /api/workspaces/[id]/members` (invite by email with optional tree-link), `PATCH /api/workspaces/[id]/members/[userId]` (update role/permissions), `DELETE /api/workspaces/[id]/members/[userId]` (remove, last-admin protected)
- Join code API — `POST /api/workspaces/[id]/invitations/code` (generate code, e.g. `SAEED-4X7K`), `POST /api/workspaces/join` (join via code, validates expiry/max uses)
- Content roles: admin can grant `tree_editor`, `news_editor`, `album_editor`, `event_editor` via membership update
- Workspace auth guards — `src/lib/api/workspace-auth.ts` (`requireWorkspaceMember`, `requireWorkspaceAdmin`)
- Request validation via `zod`; BigInt serialization via `src/lib/api/serialize.ts`
- Dashboard UI — `/dashboard` (workspace list with "عائلة" prefix), `/dashboard/create` (create workspace form)
- Workspace detail page — `/workspaces/[slug]` (members list, invite modal, tree link if family config exists)
- Login/signup/callback redirect to `/dashboard`; root `/` redirects authenticated users to `/dashboard`
- Seed script — `prisma/seed.ts` migrates existing family configs to workspace records (excludes `test`)
- Storage quota tracked in schema (5 GB default) but not enforced
- Tests — workspaces, workspace detail, workspace members, workspace invitations, workspace by-slug (38 tests)

**✅ Email invites & Google OAuth:**
- Email invite sending — Nodemailer transport (`src/lib/email/transport.ts`) with Gmail SMTP, Arabic RTL email template (`src/lib/email/templates/invite.ts`)
- Invite acceptance flow — `/invite/[id]` server+client page, `POST /api/invitations/[id]/accept` with full validation (status, expiry, email match, already-member, race condition handling)
- Invitations set `expiresAt` (7 days) and `maxUses: 1`; acceptance is atomic via `$transaction`
- Google OAuth — configured in GoTrue (`docker/.env`), redirect URI via Kong, `?next` param forwarded through OAuth+signup flows
- Auth pages fixed — `useSearchParams` for SSR-safe `?next` param handling in login/signup
- Tests — invite email template (9 tests), invite acceptance API (12 tests)

**✅ Policy page:**
- Policy page — `/policy` (publicly accessible, Arabic primary + English, covers terms/privacy/billing)
- Clearly states platform is currently free; terms may change with notice

### Phase 2 — Editable Family Tree ✅ COMPLETE

**✅ Cleanup:**
- Removed branch-related tables from Prisma schema (`branches`, `branch_memberships`, `branch_invitations`) via migration
- Removed `branch_id` column from `posts`, `albums`, `events` tables
- Removed branch-related enums (`BranchRole`, `BranchInvitationStatus`) and all branch relations from User/Workspace models

**✅ Editable family tree:**
- Tree data stored in the database (individuals, families, family_children tables)
- CRUD API for individuals and relationships (`tree_editor` role or `workspace_admin`) — 8 endpoints: POST/PATCH/DELETE individuals, POST/PATCH/DELETE families, POST/DELETE family children
- `requireTreeEditor` auth guard enforces `tree_editor` permission or `workspace_admin` role
- Tree visualization reads from database via `GET /api/workspaces/[id]/tree` — DB records mapped to `GedcomData` shape so all existing visualization components work unchanged
- Privacy flag on individuals (`isPrivate`) preserved and enforced in the UI
- Each workspace owns its own tree data — no shared mutable references across workspaces
- `isDeceased` column added to preserve GEDCOM `DEAT` tag (deceased without date)
- All mutations logged to `TreeEditLog` for future audit trail (Phase 6)
- Workspace tree page at `/workspaces/[slug]/tree` with empty tree state, individual add/edit form, and edit controls in PersonDetail sidebar (edit, add child, add spouse, add parent, delete)
- Seed script extended to populate tree data from existing GEDCOM files
- 94 new tests (264 total before security hardening)

**✅ Security hardening:**
- Open redirect fix: `validateRedirectPath()` validates `?next` parameter in login/signup/callback — rejects absolute URLs, protocol-relative URLs, `javascript:` schemes
- Middleware auth bypass fix: removed `/api` from static asset bypass — API routes now get session token refresh via middleware
- Join code hardening: replaced `Math.random()` with `crypto.randomBytes()`, increased code length from 4→8 random characters (~2.8T possibilities)
- Race condition fix: join code acceptance wrapped in `prisma.$transaction()` to prevent exceeding `maxUses`
- Rate limiting (two layers): Kong `rate-limiting` plugin (30/min on auth routes) + in-memory `RateLimiter` class on 10 API route handlers (per-user, configurable windows)
- Server-side privacy enforcement: `redactPrivateIndividuals()` strips PII from `isPrivate` individuals before API response (names → "خاص", dates/places cleared, tree structure preserved)
- Security headers: X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS, X-DNS-Prefetch-Control added in `next.config.ts`
- CORS: restricted Kong CORS origins from wildcard `*` to `http://localhost:3000`
- Docker secrets: replaced placeholder defaults with `:?` required syntax — Docker Compose fails to start if secrets are missing
- Input validation: added `.max()` constraints to all Zod string fields across 6 route files (slug≤64, names≤200, description≤2000, dates≤50, places≤500, email≤254)
- Error handling: replaced `throw err` with generic 500 responses — no stack trace leakage
- HTML injection: `escapeHtml()` applied to `inviterName`/`workspaceName` in email templates; `inviteUrl` validated as `https://` before use in `href`; subject line stripped of `\r\n`
- Port binding: PostgreSQL, GoTrue, Studio bound to `127.0.0.1` (Kong remains public)
- Email verification: disabled `GOTRUE_MAILER_AUTOCONFIRM` — signup now requires email confirmation
- Workspace creation limit: capped at 5 owned workspaces per user (counts `workspace_admin` roles only)
- Invitation enumeration: consolidated all invalid-invitation error responses into a single generic message
- Member data exposure: member list API restricted to `id`, `displayName`, `avatarUrl` (no email/phone)
- 59 new security tests (323 total)

**📝 Notes for future phases:**
- In-memory rate limiter is single-process — replace with Redis/Upstash before horizontal scaling

### Phase 3 — Family-Aware Relationship Editing ✅ COMPLETE

**✅ Family picker for add-child:**
- `FamilyPickerModal` component shows when a person has multiple `familiesAsSpouse`
- Displays spouse name per family (e.g., "أبناء من سارة") or "عائلة بدون زوج/زوجة" for single-parent families
- If only one family, proceeds directly (no picker)

**✅ Family picker for add-parent:**
- When both parents exist: "إضافة والد/والدة" button is hidden entirely
- When one parent exists: form opens with sex locked (radio disabled) to the missing parent role
- When no `familyAsChild`: form opens normally, creates new family
- Server-side parent-slot validation: PATCH family returns 409 if slot already occupied

**✅ Move child between families:**
- New atomic endpoint: `POST .../families/[familyId]/children/[individualId]/move` with `{ targetFamilyId }`
- Wrapped in `prisma.$transaction()` for atomicity (delete from source + create in target + audit log)
- Full validation: UUID params, cross-tree prevention, duplicate check, source/target equality check
- Amber-colored "نقل إلى عائلة أخرى" button in action bar, visible only when alternative families exist

**✅ Mark deceased without dates:**
- `isDeceased` checkbox ("متوفى/متوفية") in edit form, death date/place fields hidden until checked
- Display: shows "متوفى"/"متوفية" (sex-aware) in PersonDetail when no death date exists
- `isDeceased` added to update API schema (was already in create schema)

**✅ Birth/death places in UI:**
- `birthPlace` and `deathPlace` added to `Individual` type, GEDCOM parser (`PLAC` tag), mapper, and seed helpers
- PersonDetail hero shows "الميلاد: 1950 — عمّان، الأردن" format (city + country); relationship rows show dates only (compact mode)
- Edit form pre-fills places; privacy redaction clears them for private individuals

**✅ Place autocomplete:**
- `Place` model with hierarchy via `parentId` (city → region → country), seeded with ~20K places from GeoNames (countries, regions, cities with Arabic names)
- `PlaceComboBox` component: debounced search, diacritics-aware matching (داريا finds داريّا), inline parent picker for creating new places
- `birthPlaceId`/`deathPlaceId` FK columns on Individual; `marriageContractPlaceId`/`marriagePlaceId`/`divorcePlaceId` on Family
- Seed mapping translates English GEDCOM places to Arabic and resolves placeIds from global places table
- Custom towns (الضمير, الدريج, سقبا, برزة) added to seed data under محافظة ريف دمشق

**✅ Notes field on individuals:**
- `notes` DB column (`TEXT`), API schemas (`.max(5000)`), textarea in form ("ملاحظات"), display section in PersonDetail
- GEDCOM `NOTE` tag parsed at level 1 with `CONT`/`CONC` multi-line continuation
- Standalone NOTE records (`0 @ID@ NOTE` with `1 CONT`) collected and resolved when referenced by individuals (`1 NOTE @ID@`)
- Resolution covers `notes`, `birthNotes`, and `deathNotes` fields

**✅ Birth/death notes (event-level):**
- `birthNotes` and `deathNotes` DB columns (`TEXT`), API schemas (`.max(5000)`)
- GEDCOM level 2 `NOTE` under `BIRT`/`DEAT` parsed with level 3 `CONT`/`CONC` support (new `currentLevel2Tag` tracker)
- Textareas in form: "ملاحظات الميلاد" (always visible), "ملاحظات الوفاة" (inside isDeceased conditional)
- Display: italic muted text under birth/death dates in hero section

**✅ Birth/death description (cause):**
- `birthDescription` and `deathDescription` DB columns (`VARCHAR(500)`), API schemas (`.max(500)`)
- GEDCOM `CAUS` tag at level 2 under `BIRT`/`DEAT` parsed
- Inline event descriptors on `BIRT`/`DEAT` lines also captured (e.g., `1 DEAT توفيت بالسرطان`)
- Single-line inputs in form: "وصف الميلاد", "سبب الوفاة"
- Display: non-italic `alpha-white-50` in hero; death prefixed with "سبب الوفاة:"

**✅ Subtree-per-workspace seeding:**
- `extractSubtree()` in `graph.ts` filters `GedcomData` to root + descendants + their spouses
- Seed script calls `extractSubtree(gedcomData, config.rootId)` per workspace before seeding
- Each workspace gets only its family subtree (177, 97, 104, 138 individuals instead of 551 each)

**✅ Security fixes (existing code):**
- DELETE child: `findUnique` check before delete — returns 404 instead of unhandled P2025 error
- Individual DELETE: wrapped in `prisma.$transaction()` for atomicity
- Parent-slot validation: PATCH family returns 409 when setting husband/wife if slot already occupied
- UUID path param validation on move endpoint
- All new fields (`notes`, `birthNotes`, `deathNotes`, `birthDescription`, `deathDescription`, `birthPlace`, `deathPlace`) redacted for private individuals

**✅ Marriage events (MARC/MARR/DIV) on families:**
- 16 new DB columns on `Family` model: date, hijriDate, place, description, notes for each of MARC (عقد القران), MARR (الزفاف), DIV (الانفصال), plus `isDivorced` boolean
- GEDCOM parser: `MARC`, `MARR`, `DIV` tags under FAM with sub-tags `DATE`, `PLAC`, `NOTE`, `_HIJR`; inline values (e.g., `1 MARC 12/2/1443`) stored as description; NOTE references resolved
- `FamilyEvent` type groups date/hijriDate/place/description/notes per event; `Family` type gains `marriageContract`, `marriage`, `divorce` objects + `isDivorced`
- Mapper, seed helpers, and all family API routes (create/update) extended with event fields
- `FamilyEventForm` modal with 3 collapsible sections (عقد القران / الزفاف / الانفصال), auto-expand when data exists, divorce fields behind `isDivorced` checkbox
- PersonDetail sidebar: marriage info section per family showing عقد القران, الزفاف, الانفصال with dates/places/description/notes; hidden for private spouses
- Add-spouse flow auto-opens FamilyEventForm after creating spouse+family (single-flow UX)

**✅ Hijri dates (`_HIJR` custom tag):**
- `birthHijriDate` and `deathHijriDate` columns on `Individual` model; Hijri date columns on each family event
- GEDCOM parser: `_HIJR` tag at level 2 under `BIRT`/`DEAT`/`MARC`/`MARR`/`DIV`
- Hijri date text inputs in `IndividualForm` (birth/death) and `FamilyEventForm` with `.hijriFieldAccented` styling
- Privacy redaction clears Hijri dates on private individuals

**✅ Calendar preference:**
- `calendarPreference` column on `User` model (default: `'hijri'`)
- `GET/PATCH /api/users/me/preferences` with rate limiting
- `CalendarPreferenceContext` + `useCalendarPreference` hook: localStorage + server sync on mount
- `getPreferredDate()` / `getSecondaryDate()` / `getDateSuffix()` helpers in `calendar-helpers.ts`
- Calendar toggle (هجري/ميلادي) in PersonDetail hero — only shown when both dates exist for the current person
- Single-date display: هـ suffix for Hijri-only, م suffix for Gregorian-only; suffix placed after date, before place
- Dual-date display: preferred calendar primary, other calendar secondary (smaller/dimmer)

**✅ Add-spouse UX:**
- Button text auto-determined by person's sex: "إضافة زوجة" for males, "إضافة زوج" for females
- Sex field auto-locked in the form (opposite of selected person's sex)

**✅ Islamic GEDCOM standard page:**
- Public page at `/islamic-gedcom` documenting custom `_HIJR` tag and standard GEDCOM tag mappings to Islamic marriage concepts
- Covers GEDCOM 5.5.1 and 7.0 compatibility
- Arabic-first RTL layout with LTR code examples on separate lines

**✅ Architecture improvements:**
- Shared Zod schemas extracted to `src/lib/tree/schemas.ts` — individual and family field schemas reused across create/update routes
- `usePersonActions` hook extracted from PersonDetail (379 lines) — all API calls, form state, delete state encapsulated
- `serializeIndividualForm()` helper deduplicates form-to-API payload mapping; sends `null` for empty fields (enables field clearing via PATCH)
- Shared form CSS extracted to `src/styles/form-elements.module.css` (checkbox, textarea, error, hijri accent, label, fieldGroup)
- Shared thin scrollbar CSS module at `src/styles/scrollbar.module.css` — composed into Modal, Sidebar, PersonDetail
- `FamilyEventForm.onSubmit` properly async/awaited
- Family event PATCH sends flat fields matching API schema (not nested objects)

**✅ UI polish:**
- Modal scrollable: `max-height: 85vh` + `overflow-y: auto` on content with shared thin scrollbar
- Deceased person visibility: removed aggressive `opacity: 0.5`, using direct color values (names 55%, dates 40%)
- Disabled input styling: `opacity: 0.35`, `cursor: not-allowed`
- Marriage section inside scrollable area (not sticky)
- Tree edge routing: increased vertical gap (120px) and horizontal gap (40px) to prevent edge overlap; `pathOptions` applied correctly on edges
- 759 tests total, 0 regressions

**✅ Search engine indexing:**
- `robots.txt`: disallow-all default with explicit allow-list for 6 public pages; blocks `?next=` slug leaks
- `sitemap.xml`: 5 public URLs (landing, policy, islamic-gedcom, login, signup)
- `X-Robots-Tag: noindex` header on all `/api/*` routes
- `/islamic-gedcom` added to middleware PUBLIC_PATHS

**✅ Security hardening:**
- Family DELETE wrapped in `$transaction` for atomicity (was sequential)
- POST /places requires `tree_editor` permission (was `workspace_member`)

### Phase 4 — User-Tree Linking + Branch Pointers

**User-tree linking:**
- Flow A: invite-with-link (admin specifies individual at invite time, user confirms)
- Flow B: member requests link, admin approves/rejects with notification
- Link status displayed on member profiles within workspace

**Branch pointers:**
- Add `branch_sharing_policy` column to `workspaces` table
- Add `BranchPointer` table
- Admin configures workspace sharing policy (shareable / copyable_only / none)
- Admin can generate a shareable link for any branch (ancestor + all descendants downward)
- Target workspace adds the branch as a read-only pointer
- Pointer reads live from source — edits in source are visible automatically
- Revoke or source deletion triggers deep-copy conversion + notification to target admin
- Hard copy option: target can break the live link and get an independent editable copy

### Phase 5 — GEDCOM Import/Export

- **Import**: workspace admin or `tree_editor` can upload a `.ged` file to populate or update the tree
- Reuses the existing GEDCOM parser (`src/lib/gedcom/parser.ts`) as the import engine
- **Export**: any workspace member can export the full tree as a `.ged` file at any time
- Database -> generate `.ged` file -> download

### Phase 6 — Content

- News posts (workspace-scoped): rich text, media attachments, reactions, comments, pinning
- Albums (workspace-scoped): photo/video collections, tagging to individuals in the tree
- Events (workspace-scoped): calendar entries with RSVP, auto-generated birthdays/anniversaries from tree data
- Storage tracking and quota enforcement

### Phase 7 — Polish & Growth

- Audit log for all tree edits (TreeEditLog)
- Mobile app (Expo / React Native) — tracked separately
- Phone OTP sign-in activated (SMS gateway configured)
- Notifications (in-app + email)
- Public sharing links for specific content (opt-in)
- Cross-workspace identity linking: a lightweight link recognizing the same real person across workspaces — each workspace retains its own copy of the individual (no shared data, no sync). The link is informational only.

---

## 8. Out of Scope (for now)

- **Cross-workspace identity linking**: recognizing that an individual in workspace A and an individual in workspace B are the same real person. Each workspace owns its own copy of the individual — the link is informational only, no shared data or sync. The user account and `UserTreeLink` table already serve as the practical link. Full linking UI is deferred to Phase 6+. The data model must not prevent it.
- **Public workspace discovery**: workspaces are private and not discoverable
- **Real-time collaboration** (e.g., live cursors in tree editing)
- **Native mobile app**: tracked in a separate document

---

## 9. Non-Functional Requirements

- **RTL-first**: all UI is Arabic-first with RTL layout
- **Privacy by default**: no content is accessible beyond its declared scope, ever
- **Audit trail**: all tree edits are logged permanently (Phase 6)
- **Self-hosted**: no user data leaves the server to third-party services (excluding Umami analytics which is already in use)
- **Expandable architecture**: data model and API design must not block features listed as "out of scope for now"
- **Storage accountability**: every media upload is attributed to a workspace; quota is tracked from day one
- **Docker-based deployment**: the entire stack runs in Docker Compose on our own server. Phase 1 services: Next.js app, PostgreSQL, GoTrue (Supabase Auth). Storage API added in Phase 5. No managed cloud dependencies for core infrastructure.
