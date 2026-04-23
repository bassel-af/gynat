# Product Requirements Document — Gynat Platform

**Status**: Living document (updated as requirements evolve)
**Audience**: Human developers, AI coding assistants

For present-tense descriptions of how each subsystem currently works, see `docs/implementation.md`.

---

## 1. Vision

Gynat is a **family collaboration platform**. Anyone can sign up, create a family workspace, and invite their relatives. Each family gets a shared digital space (workspace) with a family tree, news, albums, and events. A single user account works across multiple family workspaces simultaneously.

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

Earlier drafts defined "branches" as private sub-groups inside a workspace with their own content scope, roles, and permissions. **This model has been removed entirely.** The reasons:

- It created tight coupling between branch and parent workspace (deletion cascades, permission complexity)
- It required branch-specific roles, vacancy resolution logic, and scoped content queries — all unnecessary complexity
- The same goal (private space for a sub-family) is achieved more simply: the sub-family creates their own independent workspace

Sub-families that want private content create their own workspace. The only cross-workspace feature is branch pointers in the family tree (see §2.6).

### 2.3 User

A user is a single account that can participate in multiple workspaces.

- One account links a person's presence across all their workspaces
- Has independent roles in each workspace (e.g., admin in one, member in another)
- Can optionally be linked to an individual in each workspace's family tree (see §2.5)
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
- One individual ↔ at most one linked user account per workspace
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
  - Magic link (passwordless email)
  - Phone number OTP via SMS (requires SMS gateway — deferred to a later phase, infrastructure is ready from day one)
- **2FA**: TOTP-based (authenticator app) supported natively
- All auth infrastructure runs in Docker on our own server — no user data leaves to third-party services

### 5.2 Workspace Management

- Workspace has: name (Arabic + Latin), slug (URL identifier), logo/avatar, description
- Any registered user can create a workspace; the creator becomes the first `workspace_admin`
- Workspace admin can: invite members, remove members, grant/revoke content roles, manage workspace settings, configure branch sharing policy
- Storage usage dashboard visible to `workspace_admin`

**Invite methods** (both supported):

- **Email invite**: admin enters a member's email → invite link sent → recipient clicks, signs in or registers, joins workspace
- **Workspace join code**: admin generates a short alphanumeric code (e.g., `SAEED-4X7K`). Admin shares it anywhere (WhatsApp group, SMS, verbally). Any signed-in user who enters a valid code joins the workspace. Codes can have an optional expiry date and an optional max-use count set by the admin. Admin can revoke a code at any time.

### 5.3 Editable Family Tree

- Tree data stored in the database (not as static GEDCOM files at runtime)
- GEDCOM is the import/export format, not the storage format
- Operations: add individual, edit individual, add relationship, remove relationship, delete individual
- Privacy flag on individuals (`isPrivate`) enforced in the UI and server-side (PII redacted before the API response for private individuals)
- Each workspace owns its own tree data — no shared mutable references across workspaces
- Branch pointers (§2.6) allow read-only cross-workspace subtree references

### 5.4 GEDCOM Import/Export

- **Import**: workspace admin or `tree_editor` can upload a `.ged` file to populate the tree (empty-tree only in v1)
- **Export**: any workspace member can export the full tree as a `.ged` file at any time (GEDCOM 5.5.1 and 7.0)
- Islamic extensions supported on both sides: `@#DHIJRI@` calendar escape, MARC/MARR/DIV, `_UMM_WALAD`, `_RADA_*`, `_KUNYA`

### 5.5 Policy Page

- A `/policy` page must exist from launch containing: terms of service, privacy policy, storage/billing policy, and the encryption statement
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

### 5.9 Audit Log

- Snapshot-based edit history (before/after for every mutation)
- Admin-only, gated by per-workspace `enableAuditLog` toggle
- Filterable by action, entity type, entity, and user
- Per-person audit strip visible in the sidebar for admins

### 5.10 Undo / Version Control

- **Session undo** (Ctrl+Z / Ctrl+Shift+Z): in-memory, per-tab, covers simple mutations. Cascade delete, branch pointer ops, deep copy, and GEDCOM import are explicitly out of scope for session undo.
- **Persistent version control** (future): admin-driven single-entity restore from `TreeEditLog` snapshots, gated by `enableVersionControl` workspace toggle. Handles cross-session and cross-user recovery.

### 5.11 Data Encryption

- **Layer 1 (disk)**: LUKS2-encrypted volume for the app, database, and backups. Protects against stolen disks, leaked backups, physical theft.
- **Layer 2 (application)**: per-workspace AES-256-GCM data keys wrapped by a master key held in `WORKSPACE_MASTER_KEY`. Sensitive Individual, Family, RadaFamily, and TreeEditLog fields are stored encrypted. Ciphertext never crosses workspace boundaries — branch pointer deep copies re-encrypt with the target workspace's key.
- **Not end-to-end**: platform admins with live server access can still read data. This is explicit — see §1 of this PRD and the encryption runbook (`docs/encryption.md`).

---

## 6. Data Model (High-Level Entities)

All application tables live in the `public` schema and are managed by **Prisma** migrations. GoTrue manages the `auth` schema independently. Application code never queries `auth.*` directly — `public.users` mirrors `auth.users` by UUID and is the only user table the app touches.

```
-- auth.users is owned by GoTrue
-- public.users mirrors it, created on user sign-up

public.users  -- mirror of auth.users
  id, email, display_name, avatar_url, phone, calendar_preference, created_at

Workspace
  id, slug, name_ar, name_en, logo_url, description, created_by,
  storage_quota_bytes, branch_sharing_policy, encrypted_key (wrapped AES-256 key),
  enable_audit_log, enable_version_control, enable_umm_walad, enable_radaa,
  enable_kunya, created_at

WorkspaceMembership
  user_id, workspace_id, role, permissions[], joined_at

WorkspaceInvitation
  id, workspace_id, type (email | code), email?, code?, individual_id?,
  invited_by, expires_at?, max_uses?, use_count, status, created_at

UserTreeLink
  id, user_id, individual_id, workspace_id, status, requested_by, confirmed_at

FamilyTree
  id, workspace_id, last_modified_at

Individual
  id, tree_id, sex, is_private, is_deceased,
  (encrypted) given_name, surname, full_name, kunya, notes,
  (encrypted) birth_date, birth_hijri_date, birth_place, birth_description, birth_notes,
  (encrypted) death_date, death_hijri_date, death_place, death_description, death_notes,
  birth_place_id?, death_place_id?, created_by, updated_at

Family
  id, tree_id, husband_id?, wife_id?, is_umm_walad, is_divorced,
  (encrypted) marc_date, marc_hijri_date, marc_place, marc_description, marc_notes,
  (encrypted) marr_*, div_*  -- same shape as marc_*
  marriage_contract_place_id?, marriage_place_id?, divorce_place_id?

FamilyChild
  family_id, individual_id

RadaFamily
  id, tree_id, foster_father_id?, foster_mother_id?, (encrypted) notes

RadaFamilyChild
  rada_family_id, individual_id

BranchShareToken
  id, source_workspace_id, hashed_token (SHA-256), root_individual_id,
  depth_limit?, include_grafts, target_workspace_id?, expires_at?,
  max_uses?, use_count, is_revoked, created_at

BranchPointer
  id, source_workspace_id, source_root_individual_id, selected_individual_id,
  target_workspace_id, target_anchor_individual_id, relationship, status,
  link_children_to_anchor, share_token_id?, created_at

TreeEditLog
  id, tree_id, user_id?, action, entity_type, entity_id, timestamp,
  (encrypted) description, (encrypted) payload,
  (encrypted envelope) snapshot_before, snapshot_after

AdminAccessLog
  id, admin_id?, action, entity_type?, entity_id?, reason,
  ip_address, user_agent, timestamp

Post (news)
  id, workspace_id, author_id, content, media_size_bytes, is_pinned, created_at

Album
  id, workspace_id, name, created_by, created_at

AlbumMedia
  id, album_id, file_url, file_size_bytes, tagged_individual_ids[], uploaded_at

Event
  id, workspace_id, title, start_at, end_at, location, description,
  is_generated, rsvp_visibility, created_by

EventRsvp
  user_id, event_id, status, updated_at

Notification
  id, user_id, type, payload, is_read, created_at

Place
  id, name_ar, name_en, parent_id?, workspace_id?  -- null workspace_id = global seed
```

See `prisma/schema.prisma` for exact column types and indexes.

---

## 7. Roadmap (Remaining Work)

Topical sections below describe only work **not yet shipped**. For how the current system works, see `docs/implementation.md`.

### Phase 10c — Tang-bound LUKS unlock

- Run Tang (Network-Bound Disk Encryption) on a separate host — a second cheap VPS or a home Raspberry Pi
- Use Clevis on the production server to add a new LUKS key slot bound to Tang, verify unlock works, then remove the keyfile-based slot
- Live migration via LUKS key slots: zero downtime, no data migration, no reboot
- Only after Phase 10c completes may Layer 1 claims appear in public privacy policy copy

### Phase 11 — Content

- News posts (workspace-scoped): rich text, media attachments, reactions, comments, pinning
- Events (workspace-scoped): calendar entries with RSVP, auto-generated birthdays/anniversaries from tree data

### Phase 12 — Polish & Growth

- Mobile app (Expo / React Native) — tracked separately
- Phone OTP sign-in activated (SMS gateway configured)
- Public sharing links for specific content (opt-in)

### Phase 13 — Albums & Notifications

- Albums (workspace-scoped): photo/video collections, tagging to individuals in the tree
- Storage tracking and quota enforcement
- Notifications (in-app + email)

### Phase 14 — User-Tree Linking & Cross-Workspace Identity

- User-tree linking: Flow A (invite-with-link), Flow B (member requests link with admin approval), link status on member profiles
- Cross-workspace identity linking: a lightweight link recognizing the same real person across workspaces — each workspace retains its own copy of the individual (no shared data, no sync). The link is informational only.

### Phase 15b — Cascade Delete Undo

- `DELETE /individuals/[id]?cascade=true` response extended with a `restoreSnapshot` payload (all deleted individuals, families, family-child links)
- New endpoint `POST /api/workspaces/[id]/tree/restore-cascade` — admin/tree-editor only, atomic transaction that re-creates individuals, families, family-child links, and writes a single `restore_cascade` audit entry
- Undo stack inverse for cascade delete calls this endpoint; toast warns that broken branch pointers and revoked share tokens are **not** re-created
- Conflict detection: if any entity in the restore snapshot now collides with a post-delete create/import, server returns 409 and the client shows a conflict dialog; stack is dropped

### Phase 15c — Branch Pointer Undo

- Pointer redeem → undo: delete the pointer
- Pointer break (disconnect) → undo: recreate pointer via original share token (only possible if token is still active; otherwise undo entry is disabled with an explanatory tooltip)
- Deep copy and GEDCOM import: **not** Ctrl+Z-undoable (too much data, too many side effects); users are directed to persistent version control / manual cleanup

### Layer 2 — Persistent Version Control

Admin-driven single-entity restore from `TreeEditLog` snapshots, gated by the existing `enableVersionControl` workspace toggle. Handles the "closed my laptop yesterday" and "other admin made a mistake" cases that session undo cannot. Detailed design deferred until session undo (Phase 15a) patterns are validated in production.

### Phase 16 — Platform Owner Dashboard

Cross-workspace, owner-only view of growth / engagement / platform health. Gating scaffold shipped (`/admin` route, `User.isPlatformOwner` flag, middleware + layout + route-handler defense in depth). Metrics, queries, and UI are designed in a dedicated PRD: **`docs/prd-admin-dashboard.md`**. That doc also captures a Phase-0 auth prerequisite: reconcile the cookie/Bearer asymmetry between the middleware gate and the route-handler gate before the first real admin API route ships.

---

## 8. Out of Scope (for now)

- **User-tree linking + cross-workspace identity**: deferred to Phase 14. The `UserTreeLink` table exists in the schema but is not active. Full linking UI is deferred. The data model must not prevent it.
- **Public workspace discovery**: workspaces are private and not discoverable
- **Real-time collaboration** (e.g., live cursors in tree editing)
- **End-to-end encryption**: evaluated and rejected (see §5.11 and `docs/encryption.md`)
- **Hardware Security Module / external KMS**: deferred until scaling beyond self-hosted
- **Searchable encryption** (deterministic / ORE): not needed; search runs client-side on decrypted data
- **Native mobile app**: tracked in a separate document

---

## 9. Non-Functional Requirements

- **RTL-first**: all UI is Arabic-first with RTL layout
- **Privacy by default**: no content is accessible beyond its declared scope, ever
- **Audit trail**: all tree edits are logged permanently with before/after snapshots
- **Self-hosted**: no user data leaves the server to third-party services (excluding Umami analytics which is already in use)
- **Expandable architecture**: data model and API design must not block features listed as "out of scope for now"
- **Storage accountability**: every media upload is attributed to a workspace; quota is tracked from day one
- **Docker-based deployment**: the entire stack runs in Docker Compose on our own server. No managed cloud dependencies for core infrastructure.
- **Fail-fast startup**: missing or malformed encryption keys / critical env vars halt server boot rather than failing at first request
