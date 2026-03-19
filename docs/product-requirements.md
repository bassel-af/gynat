# Product Requirements Document — Solalah Platform

**Version**: 1.0
**Date**: 2026-03-19
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
- GEDCOM parser lives at `src/lib/gedcom/parser.ts` — this must be preserved and reused as the import engine in Phase 4
- No authentication, no database, no backend — everything is client-side today
- The root URL (`/`) returns 404; all content is under `/{familySlug}`

**What Phase 1 changes:**
- Introduces a database (PostgreSQL via Supabase), an auth layer (Supabase Auth / GoTrue), and Next.js API routes as the backend
- The existing `/{familySlug}` routing evolves: slugs become workspace slugs stored in the database rather than static config
- Existing family configs in `src/config/families.ts` must be seeded as workspace records in the database during Phase 1 setup
- The existing tree visualization continues to read from static GEDCOM files until Phase 4 (no tree data migration in Phase 1)

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

Solalah is evolving from a read-only genealogy viewer into a **private family collaboration platform**. Each family gets a shared digital space (workspace) with a family tree, news, albums, and events. Families can organize into smaller private sub-groups (branches) without losing membership in the larger family. A single user account works across multiple family workspaces simultaneously.

The platform is Arabic-first, RTL, and designed for families — not for general social networking. Privacy is a core value: private content must stay private, even from platform administrators.

---

## 2. Core Concepts

### 2.1 Workspace

A workspace represents an extended family (e.g., "آل سعيد"). It is the top-level organizational unit.

- Any registered user can create a workspace (self-service)
- Has exactly one family tree shared by all members
- Has workspace-wide content visible to all members (news, events, albums)
- Has one or more admins and zero or more members
- Has zero or more branches (sub-groups)
- Members join by invitation only — no self-registration into a workspace
- A workspace can optionally be linked to another workspace through a shared individual (cross-workspace identity). The data model supports this; the UI for it is deferred.
- Storage quota: **5 GB per workspace** (media across all content types counts toward this limit). Quota is tracked and visible to admins but **not enforced in v1** — the platform is free during the growth phase. Enforcement and billing will be introduced in a future version. A policy page must exist from launch that can be updated when this changes.

### 2.2 Branch

A branch is a private sub-group inside a workspace (e.g., a nuclear family within the extended family).

- Belongs to exactly one workspace
- Only a `workspace_admin` can create a branch
- Has its own private content (news, events, albums) — not visible to workspace members unless they are branch members
- Members of a branch can see the list of other branch members
- Does **not** have its own family tree — branches share the workspace tree
- Architecture must remain expandable to support branch-scoped tree views in the future
- A branch can have multiple admins

### 2.3 User

A user is a single account that can participate in multiple workspaces and multiple branches.

- One account links a person's presence across all their workspaces
- Has independent roles in each workspace (e.g., admin in one, member in another)
- Can be a member of multiple branches within the same workspace
- Can optionally be linked to an individual in each workspace's family tree (see Section 2.5)
- A user's entry in a workspace's family tree is independent of their entry in another workspace's tree (the trees are separate; cross-tree identity linking is deferred but the architecture must not prevent it)

### 2.4 Roles

**Workspace roles** (per workspace):

| Role | Description |
|---|---|
| `workspace_admin` | Manages workspace settings, members, branches, and grants content roles. Can see branch usage metrics but not branch content. Cannot access branch content unless they are a member of that branch. |
| `workspace_member` | Base role. Can view workspace-wide content. Additional capabilities are granted via content roles below. |

**Content roles** (granted per workspace member by `workspace_admin`):

| Role | Description |
|---|---|
| `tree_editor` | Can add, edit, and delete individuals and relationships in the workspace tree |
| `news_editor` | Can create and edit workspace-level news posts |
| `album_editor` | Can create albums and upload media at the workspace level |
| `event_editor` | Can create and edit workspace-level events |

A `workspace_admin` implicitly has all content roles.

**Branch roles** (per branch):

| Role | Description |
|---|---|
| `branch_admin` | Manages branch members and settings. Can invite workspace members to the branch. Multiple branch admins are allowed. |
| `branch_member` | Can view and create content within the branch. |

**Rule**: A `workspace_admin` who is not a member of a specific branch **cannot** join it, self-invite to it, or access its content. They can only see: member count, storage used, creation date, and last activity timestamp for that branch.

**Rule**: A `workspace_admin` who creates a branch is automatically a `branch_admin` of that branch. If they leave, they lose that status and cannot re-enter unless re-invited by a current branch member.

**Rule**: If a branch has no remaining `branch_admin`, the `workspace_admin` can promote any existing branch member to `branch_admin` without gaining content access themselves. Alternatively, the system automatically promotes a random branch member to `branch_admin` (similar to WhatsApp group behavior). Both mechanisms are supported.

### 2.5 User–Tree Linking

A user account can be linked to an individual record in a workspace's family tree. This is optional — a user can be a workspace member without being linked to any individual, and an individual in the tree can exist without a linked user account.

**Linking flows:**

- **Flow A (invite-with-link)**: When a `workspace_admin` invites a user to the workspace, they may optionally specify which individual in the tree this user corresponds to. The invitee must confirm the link when accepting the invitation. The link becomes active only after confirmation.
- **Flow B (member requests link)**: An existing workspace member can search the tree and request to be linked to a specific individual. The request is sent to the `workspace_admin` as a notification. The admin approves or rejects. The link becomes active only after admin approval. A member cannot self-link without admin approval.

**Rules:**
- One individual ↔ at most one linked user account per workspace
- A user can be unlinked by themselves or by a `workspace_admin`
- Linking a user to an individual does not change any privacy or content access rules — it is a profile association only (used for personalization, birthday notifications, tree highlights, and future cross-workspace identity features)

---

## 3. Content Model

Content objects (news posts, albums, events) belong to exactly one **scope**:

- `workspace` — visible to all workspace members
- `branch:<branch_id>` — visible only to members of that branch

No content is public to the internet unless explicitly shared via a public link (a future feature, out of scope for now).

### 3.1 Content Types

| Type | Description |
|---|---|
| News post | Rich text announcement or update, optional media attachments |
| Album | Collection of photos/videos, linked to a scope |
| Event | Calendar entry with date, time, location, description, optional RSVP |

All content types exist at both workspace scope and branch scope.

### 3.2 Media Limits

All uploaded media (images, videos) in news posts, albums, and events counts toward the workspace's **5 GB storage quota**. Branch storage is tracked separately within that quota and visible to `workspace_admin` and `branch_admin` as a metric (not the content itself).

### 3.3 Family Tree

The family tree belongs to the workspace and is shared by all workspace members. It is editable by users with the `tree_editor` role. Branches do not have separate trees, but future versions may support branch-scoped views (filtered subsets of the workspace tree).

---

## 4. Permission Model (Summary)

| Action | Who can do it |
|---|---|
| Create a workspace | Any registered user (self-service) |
| Invite members to workspace | `workspace_admin` |
| Remove members from workspace | `workspace_admin` |
| Grant content roles | `workspace_admin` |
| Create a branch | `workspace_admin` only |
| Invite members to a branch | `branch_admin` of that branch |
| See branch content | Branch members only |
| See branch usage metrics | `workspace_admin` and `branch_admin` |
| See branch member list | All branch members |
| Promote branch member to branch_admin | `workspace_admin` (without gaining content access) |
| Edit the family tree | Users with `tree_editor` role (or `workspace_admin`) |
| Link a user to a tree individual | `workspace_admin` approves; user confirms |
| Request self-linking to a tree individual | Any `workspace_member` (pending admin approval) |
| Create workspace-level news/albums/events | Users with the corresponding editor role (or `workspace_admin`) |
| Create branch-level content | Branch members |
| View RSVP responses for an event | Configurable by the event creator or `workspace_admin` (options: all members see full list, counts only, or admin-only) |

---

## 5. Feature Requirements

### 5.1 Authentication

- Handled by **Supabase Auth** (self-hosted via Docker Compose, see `docs/auth-provider-decisions.md`)
- JWT-based sessions with full refresh token control
- Workspace and branch memberships are managed in the application layer, not in Supabase Auth
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
- Workspace admin can: invite members, remove members, view all branch usage metrics, grant/revoke content roles, manage workspace settings
- Workspace admin cannot: access branch content they were not invited into
- Storage usage dashboard visible to `workspace_admin`: total used, per-branch breakdown (size only, not content)

**Invite methods** (both supported):

- **Email invite**: admin enters a member's email → invite link sent → recipient clicks, signs in or registers, joins workspace
- **Workspace join code**: admin generates a short alphanumeric code (e.g., `SAEED-4X7K`). Admin shares it anywhere (WhatsApp group, SMS, verbally). Any signed-in user who enters a valid code joins the workspace. Codes can have an optional expiry date and an optional max-use count set by the admin. Admin can revoke a code at any time.

### 5.3 Branch Management

- Only `workspace_admin` can create a branch
- Branch creation requires: name, optional description
- The creating admin becomes a `branch_admin` automatically
- Multiple `branch_admin`s are allowed per branch
- `branch_admin` can invite workspace members into the branch
- Branch invite: notification sent to invitee, they must accept
- `workspace_admin` sees per-branch: member count, storage used (MB), creation date, last activity timestamp
- `workspace_admin` does not see: post content, album contents, event details of branches they are not in
- If all `branch_admin`s leave: `workspace_admin` can promote an existing member, or the system auto-promotes a random member

### 5.4 Editable Family Tree

- Tree data stored in the database (not as static GEDCOM files at runtime)
- GEDCOM is the import/export format, not the storage format
- The existing GEDCOM parser (`src/lib/gedcom/parser.ts`) is preserved and reused as the import engine
- **Import**: workspace admin or `tree_editor` can upload a `.ged` file to populate or update the tree
- **Export**: any workspace member can export the full tree as a `.ged` file at any time
- Operations: add individual, edit individual, add relationship, remove relationship, delete individual
- All tree edits are logged with author and timestamp (audit log, permanent)
- Privacy flag on individuals (`isPrivate`) is preserved and enforced in the UI

### 5.5 Policy Page

- A `/policy` page must exist from launch containing: terms of service, privacy policy, and storage/billing policy
- Written in Arabic (primary) and English
- Must clearly state: the platform is currently free, but terms including storage limits and billing may change with notice
- The page is publicly accessible (no login required)
- Content is managed as a static document and updated manually when policies change

### 5.6 News

- Rich text posts with optional media attachments (counts toward storage quota)
- Scoped to workspace or branch
- Members can react and comment (basic interactions, details TBD)
- Admin can pin posts

### 5.7 Albums

- Collections of photos and videos
- Scoped to workspace or branch
- Photos can be tagged to individuals in the family tree
- Storage usage counted per branch/workspace for admin visibility

### 5.8 Events / Calendar

- Events have: title, date/time, location (text), description, optional RSVP
- Scoped to workspace or branch
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

public.users  ← mirror of auth.users, created on user sign-up
  id           (same UUID as auth.users.id)
  email
  display_name
  avatar_url
  phone        (nullable)
  created_at

Workspace
  id, slug, name_ar, name_en, logo_url, description, created_by (user_id),
  storage_quota_bytes, created_at

WorkspaceMembership
  user_id, workspace_id, role (workspace_admin | workspace_member),
  permissions (tree_editor | news_editor | album_editor | event_editor — array),
  joined_at

WorkspaceInvitation
  id, workspace_id, type (email | code),
  email (nullable — set for email type),
  code (nullable — set for code type, e.g. "SAEED-4X7K"),
  individual_id (nullable — for invite-with-tree-link, Flow A),
  invited_by (user_id), expires_at (nullable), max_uses (nullable),
  use_count, status (pending | accepted | revoked), created_at

Branch
  id, workspace_id, name, description, created_by (user_id), created_at

BranchMembership
  user_id, branch_id, role (branch_admin | branch_member), joined_at

BranchInvitation
  id, branch_id, invited_user_id, invited_by (user_id),
  status (pending | accepted | declined), created_at

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

TreeEditLog
  id, tree_id, user_id, action, entity_type, entity_id, payload (JSON), timestamp

Post (news)
  id, workspace_id, branch_id (nullable), author_id, content,
  media_size_bytes, is_pinned, created_at

Album
  id, workspace_id, branch_id (nullable), name, created_by, created_at

AlbumMedia
  id, album_id, file_url, file_size_bytes, tagged_individual_ids (array), uploaded_at

Event
  id, workspace_id, branch_id (nullable), title, start_at, end_at,
  location, description, is_generated, rsvp_visibility (all | counts | admin), created_by

EventRsvp
  user_id, event_id, status (attending | not_attending | maybe), updated_at

Notification
  id, user_id, type, payload (JSON), is_read, created_at
  (types include: workspace_invite, branch_invite, tree_link_request, tree_link_approved, branch_admin_vacancy)
```

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

**✅ Policy page:**
- Policy page — `/policy` (publicly accessible, Arabic primary + English, covers terms/privacy/billing)
- Clearly states platform is currently free; terms may change with notice

### Phase 2 — Branch Infrastructure
- Branch creation (workspace_admin only)
- Branch membership (invite-only, accept flow)
- Multiple branch admins; vacancy resolution (promote or auto-assign)
- Permission enforcement: content scoped to workspace vs branch
- Admin usage metrics view (no content access)

### Phase 3 — User–Tree Linking
- Flow A: invite-with-link (admin specifies individual at invite time, user confirms)
- Flow B: member requests link, admin approves/rejects with notification
- Link status displayed on member profiles within workspace

### Phase 4 — Editable Family Tree
- GEDCOM import: upload `.ged` file → parse with existing parser → persist to database
- GEDCOM export: database → generate `.ged` file → download
- CRUD for individuals and relationships (tree_editor role)
- Audit log for all tree edits
- Keep existing read/visualization UI working against the database instead of static files

### Phase 5 — Workspace Content
- News posts (workspace-scoped)
- Events (workspace-scoped, with auto-generated birthdays from tree)
- Albums (workspace-scoped)
- Storage tracking and quota enforcement

### Phase 6 — Branch Content
- All Phase 5 content types, now also available at branch scope
- Per-branch storage metrics visible to workspace_admin and branch_admin

### Phase 7 — Polish & Growth
- Mobile (Expo / React Native) — tracked separately
- Phone OTP sign-in activated (SMS gateway configured)
- Notifications (in-app + email)
- Public sharing links for specific content (opt-in)
- Cross-tree identity linking (same person in multiple workspaces) — design TBD

---

## 8. Out of Scope (for now)

- **Cross-tree identity linking**: recognizing that an individual in workspace A and an individual in workspace B are the same real person. The user account and `UserTreeLink` table already serve as the practical link. Full cross-tree data sharing is deferred to Phase 7+. The data model must not prevent it.
- **Public workspace discovery**: workspaces are private and not discoverable
- **Branch-scoped tree views**: branches share the workspace tree without filtering. Expandability is required but the feature is not built in v1.
- **Real-time collaboration** (e.g., live cursors in tree editing)
- **Native mobile app**: tracked in a separate document

---

## 9. Non-Functional Requirements

- **RTL-first**: all UI is Arabic-first with RTL layout
- **Privacy by default**: no content is accessible beyond its declared scope, ever
- **Audit trail**: all tree edits are logged permanently
- **Self-hosted**: no user data leaves the server to third-party services (excluding Umami analytics which is already in use)
- **Expandable architecture**: data model and API design must not block features listed as "out of scope for now"
- **Storage accountability**: every media upload is attributed to a workspace and optionally a branch; quota is tracked from day one
- **Docker-based deployment**: the entire stack runs in Docker Compose on our own server. Phase 1 services: Next.js app, PostgreSQL, GoTrue (Supabase Auth). Storage API added in Phase 5. No managed cloud dependencies for core infrastructure.
