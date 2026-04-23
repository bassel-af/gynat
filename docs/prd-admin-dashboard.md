# Product Requirements Document — Platform Owner Dashboard

**Status**: Draft (2026-04-23) — scaffold shipped, metrics pending
**Audience**: Human developers, AI coding assistants
**Parent PRD**: `docs/prd.md` (see Roadmap phase link)

---

## 1. Purpose

A single-page, owner-only view that answers three questions at a glance:

1. **Is the platform growing?** — new workspaces and members, invite acceptance.
2. **Are families actually using it?** — weekly active workspaces, edits per week.
3. **Is the platform healthy?** — errors, storage, encryption, DB reachability.

Not a BI tool. Not a place for arbitrary ad-hoc queries. One opinionated page that the owner reads daily and that drives "do I need to do something this week?"

---

## 2. User & Access

- **Single audience**: the platform owner (one person, today). Multiple owners later = `UPDATE users SET is_platform_owner = true ...` — no code change.
- **Access gate**: `User.isPlatformOwner` flag. Enforced in three layers (middleware, server-side layout guard, route handler). Shipped.
- **Not for workspace admins.** Workspace admins see workspace-scoped analytics inside their own workspace (future). This PRD only covers cross-workspace platform metrics.

---

## 3. Core Principles

### 3.1 Metadata only — never content

Reads only plaintext metadata columns: counts, timestamps, `lastModifiedAt`, feature flags, `Workspace.name`, role names, enum values. **Never decrypts any tree/individual/family field.** Aggregate metrics on encrypted content require per-workspace key access, which is an explicit non-goal.

### 3.2 No PII by aggregation

Family membership is a privacy-sensitive fact. Rules:

- **Never join `User.displayName`/`User.email` with `Workspace.name` in a visible row.** E.g. do NOT show "آل سعيد: محمد، أحمد، فاطمة joined this week". Show counts only.
- **k-anonymity: hide any dimension with fewer than 5 entities.** A workspace with 2 members doesn't appear in "smallest workspaces"; a user with 1 workspace doesn't appear in "least-active users".
- Top-N lists use workspace names (already semi-public to members) but not user names.

### 3.3 Every read is logged

Every GET to `/api/admin/*` calls `logAdminAccess({ userId, action, pathname, queryString })` (helper already scaffolded at `src/lib/audit/admin-access.ts`). Response bodies are NOT logged — just the access event.

### 3.4 Cheap by default

Dashboard refreshes on demand (no polling). Queries target existing indexed columns. No materialized views, no cron-built aggregates in v1. If a query takes > 500ms, cache in-memory for 60s keyed by user+query.

---

## 4. V1 Metrics

Three horizontal sections on one page, Arabic labels, RTL:

### 4.1 Growth (النمو)

| Metric | Source | Notes |
|---|---|---|
| Total workspaces | `Workspace` count | |
| Workspaces created this week / month | `Workspace.createdAt` | Absolute counts |
| Total registered users | `User` count | |
| New users this week / month | `User.createdAt` | |
| Pending invitations | `WorkspaceInvitation` where status = pending, not expired | |
| Invite acceptance rate (30d) | accepted / (accepted + expired + pending older than 7d) | Excludes fresh-pending |

### 4.2 Engagement (الاستخدام)

| Metric | Source | Notes |
|---|---|---|
| Weekly active workspaces | `FamilyTree.lastModifiedAt` within last 7d | The north-star metric |
| Total tree edits (7d / 30d) | `TreeEditLog.createdAt` count | Excludes private content |
| Avg edits per active workspace | edits ÷ active workspaces | |
| Workspaces with ≥1 member besides creator | `WorkspaceMembership` groupBy | "Real" family workspaces |
| Top 10 active workspaces (7d) | `TreeEditLog` group by workspaceId | Workspace name + count only; no user info |
| Branch pointer usage | `BranchPointer` count by status | Adoption signal for cross-workspace feature |

### 4.3 Platform Health (الصحة)

| Metric | Source | Notes |
|---|---|---|
| DB reachable | Prisma `$queryRaw` ping | Green/red dot |
| GoTrue reachable | HTTP ping to `/auth/v1/health` | |
| Mail transport | `nodemailer.verify()` result | |
| Encryption master key loaded | `process.env.WORKSPACE_MASTER_KEY` present + valid length | Boolean |
| Workspaces with encryption failures (24h) | future `TreeEditLog` error bucket | Placeholder until error logging exists |
| Total storage used (approx) | sum of media row sizes or disk-usage shell call | Single number, not per-workspace |
| Recent 5xx rate | Out of scope v1 (no central error log yet) | Note as gap |

### 4.4 Non-metrics

The dashboard also shows:

- Last refresh time.
- Link to `AdminAccessLog` (future page — v1 just shows count of reads in last 24h).

---

## 5. Data Sources

All queries read existing tables — **no new migrations in v1**:

- `Workspace`, `WorkspaceMembership`, `WorkspaceInvitation`
- `User`
- `FamilyTree`, `TreeEditLog` (counts, timestamps only — no snapshot content)
- `BranchPointer`, `BranchShareToken` (counts)
- `Place` (for health check: total seeded count)
- `Post`, `Album`, `Event` (row counts for content traction, future)

Aggregation queries live in `src/lib/admin/queries.ts` — a single file so every unscoped cross-workspace read is auditable in one place. Each exported function returns plain JSON, no Prisma objects.

---

## 6. UI Layout

Single page, 3 stacked sections (Growth, Engagement, Health). Each section is a grid of metric cards:

- **Card** = label (Arabic), primary number (large), secondary text (change vs last period or range label).
- **Top-N lists** = compact table, workspace name + count. No user names.
- **Health row** = colored dots + short label.

No charts in v1. Numbers only. Chart-addicted features (time series, sparklines) land in a follow-up once we know what's worth plotting.

Reuses existing design tokens (`src/styles/tokens/`). No new design system.

---

## 7. API Routes

All under `/api/admin/` — each handler calls `requirePlatformOwner(request)` AND `logAdminAccess(...)`.

- `GET /api/admin/metrics/growth` — `{ workspaces, users, invitations }`
- `GET /api/admin/metrics/engagement` — `{ activeWorkspaces, edits, topActive }`
- `GET /api/admin/metrics/health` — `{ db, gotrue, mail, encryption, storage }`

Response shape: flat JSON objects, no nesting beyond one level. Client composes three fetches in parallel.

---

## 8. Prerequisite — Fix cookie/Bearer asymmetry

**Problem identified while writing Playwright gate tests:**

- Middleware gate for `/api/admin/*` reads the session **cookie** (via `updateSession` → `@supabase/ssr`).
- Route handler's `requirePlatformOwner` → `getAuthenticatedUser` requires the **Bearer** header.

For browser clients using `apiFetch()`, both are sent, so this works in practice. But:

- A pure Bearer-only programmatic client (CLI, script, Postman) is blocked at the middleware before its Bearer token is even considered.
- A pure cookie-only navigation (e.g. server-side fetch from another Next route) would pass middleware but fail at the handler.

This is a load-bearing coincidence, not a design. Two options:

**(A) Make `requirePlatformOwner` accept either.** Check Bearer first (current path), fall back to cookie via `createServerClient`. Minimal code, keeps defense-in-depth.

**(B) Make the middleware accept either.** In the `/api/admin/*` branch, accept a Bearer header in addition to the cookie. Verify it via GoTrue like `getAuthenticatedUser` does.

**Recommendation: (A).** Reasons:
- Handler-level dual-auth is symmetric with other codebase patterns (`requireWorkspaceAdmin` currently only accepts Bearer — changing to dual there is an easy follow-up if we ever need it).
- Keeps middleware cheap (it already calls Supabase once via `updateSession`; adding Bearer verification there doubles GoTrue calls).
- Playwright tests simplify: API tests can use Bearer only, no cookie dance required.

**Must happen before Phase 1** below. Blocks: CLI-based metric scripts, simpler e2e tests, any future programmatic admin tooling.

---

## 9. Phases

### Phase 0 — Auth prerequisite (blocker)

- Extend `requirePlatformOwner` to accept either Bearer header or Supabase session cookie.
- Update `src/test/admin-auth.test.ts` to cover both branches.
- Simplify `e2e-browser/admin-gate.spec.ts` API tests — Bearer alone should work.
- Decision: do the same for `requireWorkspaceAdmin` / `requireWorkspaceMember`? Defer until there's a concrete caller; don't expand the scope preemptively.

### Phase 1 — Growth + Engagement + Health cards (v1)

- `src/lib/admin/queries.ts` — all aggregation helpers.
- Three `GET /api/admin/metrics/*` routes with `logAdminAccess` wired.
- `/admin` page renders the 3 sections; client fetches all three in parallel.
- Arabic labels, RTL layout, existing design tokens.
- Unit tests for query helpers (with seeded data), Playwright e2e for owner vs non-owner rendering.

### Phase 2 — Time series & sparklines

- Decide which metrics actually warrant trends after a few weeks of Phase 1 usage.
- Add simple sparklines (SVG, no chart library in v1).
- Persist aggregates only if we hit query performance issues.

### Phase 3 — AdminAccessLog viewer

- Page at `/admin/access-log` — paginated view of every admin read with timestamp, path, actor.
- Primarily for compliance/self-audit ("did I log in last night or was that something else?").

### Phase 4 — Alerts (much later)

- Email when health check fails, when error rate spikes, when storage crosses 80%.
- Not before Phase 1 has been live for 3+ months.

---

## 10. Out of Scope

- **Per-workspace drill-down**: the dashboard shows platform-wide aggregates. Drilling into a specific workspace = visit that workspace as a member. Admin-only cross-workspace workspace inspection (reading private content) is explicitly rejected — it defeats the privacy guarantee in main PRD §1.
- **User-level metrics**: "most active users", "top editors" — rejected. Users aren't the audience; workspaces are.
- **Content metrics**: post counts, album counts per workspace — deferred until content features (§5.6, §5.7 in main PRD) ship.
- **Export/CSV**: copy numbers into a note if needed. No download button in v1.
- **Admin-on-admin**: no UI to promote/demote other owners. SQL only.
- **Ad-hoc SQL**: use Prisma Studio or `psql` directly for one-offs.

---

## 11. Non-Functional Requirements

- **Performance**: dashboard paint in < 1.5s on localhost; each metric query < 500ms.
- **Caching**: per-user in-memory 60s cache per query; stampede protection not required for a single owner.
- **Privacy**: k-anonymity ≥ 5 on any dimension that can identify a family or a user; no displayName/email next to workspace names.
- **Auditability**: every admin read writes one `AdminAccessLog` row.
- **Failure modes**: if a health probe fails, surface the error inline (red dot + short message). Never throw a 500 for a dashboard read.

---

## 12. Links

- Main PRD: `docs/prd.md`
- Encryption & audit-log operator notes: `docs/encryption.md`
- Implementation status (update as phases ship): `docs/implementation.md`
