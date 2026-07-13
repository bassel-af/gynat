---
name: e2e-test
description: Run a REAL-infrastructure browser end-to-end test for a feature or fix in this app — create an isolated throwaway user + workspace + fixture via the real API (GoTrue/Kong/Postgres), drive the real app UI in headless Playwright, assert the behavior, then tear everything down. Use when asked to e2e-test / verify / prove a change works against real infra (not mocks), especially auth/tree/person-page/collections flows. NOT the same as `pnpm test:e2e` (that only covers email flows).
argument-hint: [what to verify, e.g. "adding a son updates the person page"]
---

# Real-infrastructure browser e2e

`$ARGUMENTS` describes the behavior to verify end to end.

The point of this skill: exercise the FULL stack (GoTrue → Kong → Next.js → Postgres)
through the real browser UI, the way a user does — because mocked unit tests pass
while the real flow is broken. `pnpm test:e2e` here only covers email/Mailpit
flows; it does NOT cover UI feature flows. This skill fills that gap.

## Hard rules (read first)

- **The local DB holds REAL family data** (production-like: real workspaces, real
  user emails). NEVER add test people into an existing family tree. ALWAYS create
  an isolated throwaway user + workspace, and ALWAYS tear it down at the end
  (even on failure — use try/finally).
- The dev server is already running on **port 4000** (do not start it). GoTrue/Kong
  are on **8000**. Confirm infra is up before starting (`docker ps`, curl the app).
- Put the runner script at the **project root** (e.g. `./e2e-run.mjs`), NOT in the
  scratchpad — ESM resolves `node_modules` relative to the script's location.
  **Delete the script when done** so the git tree stays clean.
- Import Playwright from **`@playwright/test`** (the bare `playwright` package is
  not installed). Chromium binary IS installed.

## Recipe

1. **Confirm infra**: `docker ps` shows `docker-{db,gotrue,kong}-1` up; app responds
   on `http://localhost:4000`.
2. **Copy the harness template** `scripts/e2e-harness-template.mjs` (next to this
   file) to the project root and adapt the `browserFlow()` middle section to the
   feature under test. The setup (throwaway user/workspace/fixture) and teardown
   are reusable as-is.
3. **Run** it from the project root: `node e2e-run.mjs <uniqueStamp>` (pass a short
   unique stamp so parallel/re-runs don't collide on slug/email).
4. **Prove the assertion crisply.** For "updates without reload", count
   `page.on('load')` events and assert **0 extra full loads** between the action
   and the UI change. For "data persisted", re-query via the API or DB.
5. **Verify cleanup**: 0 leftover `e2e-%` workspaces in the DB; `git status` clean.
6. Report PASS/FAIL with the decisive log line (not just "it passed").

## Known selectors & endpoints (verified working)

- Auth: `POST http://localhost:8000/auth/v1/admin/users` (service-role key,
  `{email,password,email_confirm:true}`) → `POST .../token?grant_type=password`
  (anon key) for the Bearer token.
- **Must call `POST /api/auth/sync-user`** (Bearer) BEFORE creating a workspace —
  the login callback normally syncs `public.users`, and workspace creation FKs to it.
- Create workspace: `POST /api/workspaces` `{slug, nameAr, description}`.
- Create individual: `POST /api/workspaces/{id}/tree/individuals`
  `{givenName|fullName, sex:'M'|'F'}` → returns `{data:{id}}`.
- Create family: `POST /api/workspaces/{id}/tree/families` `{husbandId}`.
- Login UI: `input[type="email"]`, `input[type="password"]`, `button[type="submit"]`.
- Person page: `/workspaces/{slug}/tree/person/{individualId}`.
- Add-child button (sidebar): role `button` name `إضافة ابن/ابنة`. Sex radios:
  `input[name="sex"][value="M"|"F"]`. First-name field placeholder `مثال: أحمد`.
  The form's **submit button is in the modal footer** (linked via `form=` attr,
  so it is NOT a descendant of the `<form>`) and stays **disabled until required
  fields (name + sex) are set**; click it by exact label `إضافة` (create) / `حفظ` (edit).
- Env from `.env.local`: `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
  `DATABASE_URL`.

## Teardown

`DELETE FROM workspaces WHERE id=$1` (FK cascades clear trees/individuals/families),
then `DELETE http://localhost:8000/auth/v1/admin/users/{userId}` (service-role key).

## Gotchas learned

- `pnpm test:e2e` ≠ this. Don't claim a UI flow is e2e-verified by running it.
- Modal submit buttons are footer-hosted via `form=` — don't select with
  `form button[type=submit]`; select by label and set required fields first.
- Table names are snake_case plural (`workspaces`, `individuals`, `family_trees`).
