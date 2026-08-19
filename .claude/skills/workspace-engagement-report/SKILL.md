---
name: workspace-engagement-report
description: Analyze how family-tree workspaces are being used — size, activity, returning behavior, feature adoption — via read-only production DB queries, with no user/space-identifying info exposed. Use when asked how workspaces/users are doing, for engagement/activation/retention checks, or "what should we improve" style product questions.
---

# Workspace engagement report

Produces a concise, anonymized engagement report from production data: workspace size, activity/recency, returning-user behavior, and feature adoption. See `query-prod-db` skill first for connection basics, table names, and encrypted-field rules.

## Hard constraint: no identifying info

Never select or report: `name_ar`, `slug`, `display_name`, `email`, `avatar_url`, or any decrypted `Individual`/`Family` field. Only use: `id`s (for joins/counts only, never printed to the user), counts, booleans, enums, and timestamps. The report must stay usable even if every workspace/user name were redacted — because it is.

## Queries to run

All via `ssh hz 'docker exec -i docker-db-1 psql -U postgres -d gynat <<SQL ... SQL'`, batched into as few round trips as possible.

**1. Per-workspace summary** — created date, member count, individuals/families/extra-tree counts, total edits, distinct editors, distinct edit days, first/last edit timestamp, feature toggles (`enable_collections`, `enable_audit_log`, `enable_version_control`, `enable_radaa`):

```sql
SELECT
  w.id AS workspace_id,
  w.created_at::date AS created,
  (SELECT COUNT(*) FROM workspace_memberships m WHERE m.workspace_id = w.id) AS members,
  (SELECT COUNT(*) FROM individuals i JOIN family_trees ft ON i.tree_id = ft.id WHERE ft.workspace_id = w.id) AS individuals,
  (SELECT COUNT(*) FROM families f JOIN family_trees ft ON f.tree_id = ft.id WHERE ft.workspace_id = w.id) AS families,
  (SELECT COUNT(*) FROM family_trees ft WHERE ft.workspace_id = w.id AND ft.kind = 'extra') AS extra_trees,
  (SELECT COUNT(*) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS total_edits,
  (SELECT COUNT(DISTINCT l.user_id) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS distinct_editors,
  (SELECT COUNT(DISTINCT l.timestamp::date) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS distinct_edit_days,
  (SELECT MIN(l.timestamp) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS first_edit,
  (SELECT MAX(l.timestamp) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS last_edit,
  w.enable_collections, w.enable_audit_log, w.enable_version_control, w.enable_radaa
FROM workspaces w
ORDER BY w.created_at;
```

**2. Action/entity breakdown** (what people actually do):

```sql
SELECT action, entity_type, COUNT(*) AS cnt
FROM tree_edit_logs
GROUP BY action, entity_type
ORDER BY cnt DESC;
```

**3. Current route snapshot** (already anonymized pattern, no raw URLs/IDs — see `normalizeRoutePattern` in `src/lib/admin/presence.ts`):

```sql
SELECT last_active_route, COUNT(*) AS cnt
FROM users
WHERE last_active_route IS NOT NULL
GROUP BY last_active_route
ORDER BY cnt DESC;
```

**4. Recency buckets** (dormancy check):

```sql
SELECT
  CASE
    WHEN last_edit IS NULL THEN 'never edited'
    WHEN last_edit > now() - interval '7 days' THEN 'active <7d'
    WHEN last_edit > now() - interval '30 days' THEN '7-30d ago'
    ELSE '30d+ ago'
  END AS bucket,
  COUNT(*) AS workspaces
FROM (
  SELECT w.id, (SELECT MAX(l.timestamp) FROM tree_edit_logs l JOIN family_trees ft ON l.tree_id = ft.id WHERE ft.workspace_id = w.id) AS last_edit
  FROM workspaces w
) sub
GROUP BY bucket;
```

**5. Feature adoption counts**:

```sql
SELECT
  (SELECT COUNT(*) FROM branch_pointers) AS branch_pointers,
  (SELECT COUNT(*) FROM branch_pointers WHERE status = 'active') AS active_pointers,
  (SELECT COUNT(*) FROM branch_share_tokens) AS share_tokens,
  (SELECT COUNT(*) FROM collections) AS collections,
  (SELECT COUNT(*) FROM rada_families) AS rada_families,
  (SELECT COUNT(*) FROM family_trees WHERE visibility != 'private') AS published_trees,
  (SELECT COUNT(DISTINCT workspace_id) FROM workspace_invitations) AS workspaces_that_invited,
  (SELECT COUNT(*) FROM users) AS total_users,
  (SELECT COUNT(*) FROM workspaces) AS total_workspaces;
```

**6. Returning-editor behavior** (distinct edit-days per user, as a proxy for "did they come back"):

```sql
SELECT distinct_days, COUNT(*) AS num_users
FROM (
  SELECT user_id, COUNT(DISTINCT timestamp::date) AS distinct_days
  FROM tree_edit_logs
  GROUP BY user_id
) sub
GROUP BY distinct_days
ORDER BY distinct_days;
```

## Interpreting results — things worth flagging

- **% of workspaces with 0 individuals** = created but never touched (activation drop-off). This is usually the single biggest lever.
- **Member count distribution** — mostly-1-member workspaces vs. multi-member ones; cross-reference with edit activity (invited workspaces tend to be stickier).
- **distinct_edit_days = 1 vs 2+** — how many users ever came back for a second editing session, vs. one-and-done.
- **Recency buckets** — how much of the base has gone dormant (30d+ since last edit) vs. active.
- **Large `individuals` count with almost no `tree_edit_logs` rows** — signals a GEDCOM import (bulk, not organic manual building), not necessarily deep engagement.
- **Feature adoption counts near zero** (collections, branch pointers, rada'a, publish) vs. toggle-enabled counts — tells you whether a shipped feature is discovered/used at all, independent of whether it's "on."

## Caveats to state in the report

- Sample sizes are small (check `total_users`/`total_workspaces` from query 5) — call out that findings are directional, not statistically confirmed, when the base is this small.
- `last_active_route`/`last_active_workspace_id` on `users` is a **single current snapshot**, not a visit history — it shows where someone was last seen, not a timeline of pages visited.
- `tree_edit_logs` only captures *write* actions (create/update/delete/import/publish/etc.), not reads/views — there's no log of pure browsing beyond the one route snapshot above.

## Output format

Give a concise plain-language report (no jargon — the audience is a non-technical product owner): a short "big picture" line, then numbered findings with the concrete numbers, then a short "where I'd focus first" list of suggestions. Offer to write the suggestions to a file in `docs/` if asked.
