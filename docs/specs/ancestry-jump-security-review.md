# Security review — «قفزة نسب» (ancestry jump)

> Read-only review, 2026-09-22. Scope: the uncommitted working-tree surface of the
> ancestry-jump feature (spec: `docs/specs/ancestry-jump-spec.md` §1, §3, §4, §6,
> §8, §9). Canvas (§10), `src/components/tree/**` and `src/hooks/usePersonActions.ts`
> were out of scope. Every line reference was traced in the code, not inferred.

**Verdict: no Critical, no High.** Authorization, cross-tree IDOR, public-surface
privacy oracles, encryption, API-side cycle/DoS, cascade-delete and audit are all
**confirmed clean**. Six findings, all Medium and below, concentrated in the two
paths that sit *outside* the validated API: **GEDCOM export** and **GEDCOM import**.

---

## Clean categories

1. **Authorization** — CLEAN. All three handlers run `requireTreeEditor` →
   `treeMutateLimiter.check(user.id)` → parse → `resolveTargetTreeOr404`, in that
   fixed order (`src/app/api/workspaces/[id]/tree/ancestry-jumps/route.ts:28-41`,
   `.../[jumpId]/route.ts:41-55`, `:124-134`). PATCH/DELETE read via
   `getTreeAncestryJumpDecrypted` → `findFirst({ id, treeId })`
   (`src/lib/tree/queries.ts:207-209`), never a bare `findUnique`; a foreign jump
   id returns `null` → 404 with no existence leak. PATCH strips `treeId` before
   Prisma (`.../[jumpId]/route.ts:52`); DELETE uses `parseTreeIdFromBody`
   (string-narrowed). Tests cover 401/403/429 and the "limiter is not consulted
   before the permission gate" ordering.

2. **Cross-tree / cross-workspace IDOR** — CLEAN. `resolveTargetTreeOr404` returns
   the tree *with* `TREE_INCLUDES` (`src/lib/tree/queries.ts:120-131`), so
   `dbTreeToGedcomData(tree, key)` at `ancestry-jumps/route.ts:46` contains **only
   that tree's** rows. J1/J2 (`src/lib/tree/ancestry-jump-validators.ts:76-81`)
   therefore check membership of the resolved tree server-side against the DB, not
   against the client payload. A `descendantId`/`ancestorFamilyId` belonging to
   another tree or another workspace 404s.

3. **Public-surface privacy oracles** — CLEAN. `redactForPublic`
   (`src/lib/tree/public-visibility.ts:198-245`) is genuinely fail-closed on all
   three endpoints (descendant + both spouses) and, crucially, **also deletes the
   orphaned back-references** on individuals and copy-on-writes the affected
   families — so there is no dangling id to dereference and no structural residue.
   `composePublicGedcom:51-59` carries home jumps only; `extractSubtree` /
   `extractPointedSubtree` return `{individuals, families}` with no `ancestryJumps`
   key, so borrowed jumps are structurally impossible. `relatedTo` is the only
   schema.org relation emitted, gated on `indexable`
   (`src/lib/tree/person-jsonld.ts:202`) *and* per-node on `isPublicNode` (`:174`),
   then pruned by the `FOCAL_KEYS` allowlist (`:231`); range and notes never enter
   the graph. Person-page ETag correctly bumped `v3 → v4`.

4. **Encryption** — CLEAN. `notes` is `Bytes?` under the workspace key; the response
   DTO is built from a hand-listed field set that deliberately never reads
   `row.notes` (`src/lib/tree/ancestry-jump-route-helpers.ts:21-41`).
   Cross-workspace copy decrypts under the source key then re-encrypts under the
   target key via `persistDeepCopy`'s `enc()`
   (`src/lib/tree/branch-pointer-deep-copy.ts:443-459`). Audit snapshots/payloads
   go through `encryptSnapshot` / `encryptAuditPayload`. **Zero** `console.*` in the
   entire jump surface.

5. **API-side cycle / DoS** — CLEAN. J8 uses
   `getAllDescendants(..., { includeJumps: true })`, whose `descendants` visited-set
   is checked *before* recursion (`src/lib/gedcom/graph.ts:116-131`);
   `getAllAncestors` guards on the `ancestors` set (`:81`); `findTopmostAncestor`
   keeps its `visited` + `MAX_DEPTH` (`:640`); `buildJumpIndex` is built once per
   call, never per node. `findDefaultRoot` degrades to an alphabetical fallback when
   a cycle empties `trueRoots` (`src/lib/gedcom/roots.ts:41-45`) — no hang.

6. **Cascade delete** — CLEAN. `computeDeleteImpact` is jump-blind and now says so
   in a locked comment (`src/lib/tree/cascade-delete.ts:91-98`); a jump ancestor
   cannot be swept. `pruneEmptyAncestryJumps` is `treeId`-scoped
   (`src/lib/tree/queries.ts:229-236`) and runs inside the delete transaction
   (`src/app/api/workspaces/[id]/tree/individuals/[individualId]/route.ts:277`)
   against a workspace-scoped `tree.id`.

7. **Audit** — CLEAN and complete. One row per mutation, `entityType:
   'ancestry_jump'`, before/after snapshots, `isUndo` honoured, and the four
   lockstep updates (`src/lib/tree/audit.ts`, `audit-log-schemas.ts`,
   `AuditLogEntry.tsx`, `AuditLogDiff.tsx` including `ID_FIELDS` so raw UUIDs render
   as labels) are all present. No over-collection.

---

## Findings

### M1 — GEDCOM record injection via unsanitized note text — Medium — CONFIRMED

**`src/lib/gedcom/exporter.ts:135-141` (`emitNote`), reached for jumps at `:248` and `:302`.**

`jumpNoteText` pushes `jump.notes` **raw** (`exporter.ts:248` — only `jumpNoteLead`
is sanitized), and `emitNote` performs *no* sanitization on any part: it splits on
`'\n'` only, and the file is assembled with `lines.join('\n')` (`:611`).

Two escapes survive:

- **A bare `\r`** (0x0D, no `\n`) is never split and never stripped. This repo's own
  parser splits on `/\r\n|\r|\n/` (`src/lib/gedcom/parser.ts:92`), as does most
  genealogy software. So `notes = "x\r0 @FAKE@ INDI\r1 NAME مزوّر"` exports as one
  `2 NOTE` line that **re-parses as three GEDCOM lines**, forging a top-level `INDI`
  record.
- **`@` is not stripped or doubled**, so a note beginning `@N1@` is read back as a
  cross-reference pointer rather than as text by 5.5.1-conformant parsers.

`sanitizeLine` (`:120-122`) handles both for single-line fields; `emitNote` was
simply never given the same treatment.

**Attack:** a `tree_editor` in workspace A plants the payload in a jump note, exports
GEDCOM (`GET .../tree/export`), and hands the file to another family — a routine act
in this product. On import into workspace B (or into third-party software) the forged
records appear as real people. The import route is empty-trees-only, so the blast
radius is a *new* tree, not an existing one.

**This is a pre-existing class**, not created by this feature — `ind.notes` (`:455`),
`ind.birthNotes` (`:424`), `ind.deathNotes` (`:446`), `event.notes` (`:194`) and
`rf.notes` (`:531`) all reach the same unsanitized `emitNote`. The jump feature adds
a sixth instance.

**Minimal fix (one function, fixes all six):**

```ts
function emitNote(lines: string[], level: number, text: string): void {
  const parts = text.replace(/\r\n?/g, '\n').split('\n').map((p) => p.replace(/@/g, '@@'))
  lines.push(`${level} NOTE ${parts[0]}`)
  for (let i = 1; i < parts.length; i++) lines.push(`${level + 1} CONT ${parts[i]}`)
}
```

(`@@` is the GEDCOM escape for a literal `@`; strip instead if you prefer parity with
`sanitizeLine`.) Add an exporter test with `\r` and `@` inside `jump.notes` — the
current suite tests a newline in the *name* (`src/test/ancestry-jump-exporter.test.ts:232`)
but never in the notes.

---

### M2 — The import path bypasses every jump rule the API enforces — Medium — CONFIRMED

**`src/lib/gedcom/parser.ts:466-520` + `src/lib/tree/seed-helpers.ts:271-290`.**

The parser's drop rules are only three (`parser.ts:475-482`): owner exists, owner has
no `FAMC` (J3), owner has no jump yet (J4), target exists. `seedTreeFromGedcomData`
then `createMany`s the result with **no validation at all**. So a crafted GEDCOM
writes DB state the POST route rejects with a 400:

- **J8 (cycle) bypassed.** Two parentless individuals A and B, each with `ASSO` →
  the other plus `_ANC_FAM` naming the other's `FAMS`, both pass every drop rule. A
  jump loop lands in the database.
- **J7 (self-reference) bypassed.** An `ASSO` pointing at the owner himself resolves
  to his own `FAMS` family — a person becomes his own distant ancestor.
- **J5 (empty ancestor couple) bypassed.** `familyId = asso.ancFam` is accepted on
  mere existence (`parser.ts:485-487`) with **no spouse check** and **no check that
  the ASSO target is even a spouse of that family** — so `_ANC_FAM` can name an
  unrelated or spouse-less `FAM`, and the UI then renders «من وَلَد ‹someone else›».
- **The 5000-char `notes` cap is bypassed.** Level-3 `CONT` accumulation
  (`parser.ts:418-421`) is unbounded; only the 7 MB file cap applies.

**Impact is data integrity, not disclosure** — the importer only corrupts their own
workspace, and every traversal checked is visited-set-safe, so nothing hangs or
crashes. But the API's invariants are advertised as invariants and are relied on by
the projection and nasab code; they should hold for every write path.

**Minimal fix:** run `validateAncestryJump` over the parsed `GedcomData` before
step 11 and drop violators (same silent-drop posture as the existing rules), plus a
`.slice(0, 5000)` on `asso.notes` at flush. Add parser tests for the A↔B loop and the
self-`ASSO`.

---

### L1 — Stale jump back-references cross the branch-pointer boundary — Low — CONFIRMED

**`src/lib/tree/branch-pointer-merge.ts:220-221` and `:394`; consumed at
`src/lib/gedcom/roots.ts:30-31`.**

`extractPointedSubtree` spreads `...person` / `...family` wholesale, so a borrowed
individual carries the **source workspace's** `ancestryJumpAsDescendant` UUID (and
families carry `ancestryJumpsAsAncestor`) into the target workspace's merged member
payload — while `target.ancestryJumps` has no such row. Exactly the shape that
survives: a jump descendant has no parents, so he is precisely the kind of person who
sits at a borrowed branch's root.

Two consequences:

- **Minor id leak:** members of workspace B see an opaque `AncestryJump` row UUID
  belonging to workspace A. Not actionable (every jump route is `{ id, treeId }`-scoped),
  but it is source-workspace state crossing a tenancy boundary. The *public* path is
  unaffected — `redactForPublic` deletes back-refs absent from `kept`, and a borrowed
  jump id is never in `kept`.
- **Correctness:** `findDefaultRoot`'s `hasJump` trusts the bare back-reference
  *before* resolving the row (`roots.ts:30-31`), so a borrowed branch root is wrongly
  disqualified from `trueRoots` and the canvas may crown a different default root.

**Minimal fix:** `delete copied.ancestryJumpAsDescendant` / `ancestryJumpsAsAncestor`
in `extractPointedSubtree` (mirroring what `prepareDeepCopy` and `prepareTreeSnapshot`
already do correctly), and make `hasJump` resolve through `data.ancestryJumps` rather
than trusting the flag alone.

---

### L2 — Jump `notes` reach the anonymous, CDN-cached public feed with no separate gate — Low — CONFIRMED (spec-sanctioned)

**`redactForPublic` keeps `notes` verbatim
(`src/lib/tree/public-visibility.ts:216`) → `buildPublicTreePayload` →
`src/app/api/family/[slug]/tree/route.ts:41-55`, served with
`Cache-Control: public, s-maxage=60, stale-while-revalidate=300`.**

A new ≤5000-char free-text field, authored inside a private workspace, becomes fully
public and shared-cache-replicated the moment the tree is published — with no
per-field publish control and no redaction pass. Scholarly notes are the point of the
feature, so this is intended, and it matches how `Individual.notes` behave for living
people. The exposure is that *text* naming a private cousin is not covered by any of
the structural gates that protect that same person's record.

Also applies on the member surface: `redactPrivateIndividuals` passes jumps through
unchanged (`src/lib/tree/mapper.ts:511`), so a note naming a private individual is
readable by every member even though that individual's own record shows «خاص». The
spec cites `Family.marriageNotes` as precedent and the treatment is consistent —
recorded here so the decision is on the record, not as a request to change it.

---

### L3 — Malformed UUID in a path param / DELETE body → unhandled 500 — Low — CONFIRMED (pre-existing class)

`jumpId` reaches `findFirst({ where: { id: jumpId, treeId } })`
(`src/lib/tree/queries.ts:207`) as a raw path string, and `parseTreeIdFromBody`
narrows to `string` but not to UUID (`src/lib/api/route-helpers.ts`). Against a
`@db.Uuid` column, a non-UUID raises Prisma **P2023** → unhandled throw → 500 instead
of 404. Identical in the rada'a, individuals and families routes, so it is a
pre-existing class rather than a jump regression.

**Minimal fix:** a shared `z.string().uuid()` guard on path ids, or catch P2023 → 404.

---

## Info

- **`ignoreJumpId` is dead code.** No route passes it (`validateAncestryJump` is
  called from exactly one site, `ancestry-jumps/route.ts:47`); PATCH cannot move
  endpoints so it re-checks only the merged range. Correct today, but J4's escape
  hatch is exercised only by unit tests — worth a comment so a future "PATCH should
  re-validate" change does not assume it is wired.
- **An empty PATCH body `{}`** passes the schema and still writes an audit row and
  touches the tree timestamp. Limiter-bounded audit noise only.
- **Deleting the ancestor `Family`** cascades its jumps away via the FK with no audit
  row of their own (the family's own row is logged). Matches existing rada'a
  behaviour.
- **Public tree ETag** is `sha1(lastModifiedAt | visibility)` and does not version the
  redaction logic, so a future *fix* to `redactForPublic` is served stale from shared
  caches for up to 60 s + 300 s SWR. The person page handles this correctly with
  `PROJECTION_ETAG_VERSION`; consider the same constant in `computePublicETag`.
- **No DB-level tenancy constraint** ties `descendant_id` / `ancestor_family_id` to
  `tree_id` (`prisma/migrations/20260922120000_add_ancestry_jumps/migration.sql`) —
  Postgres cannot express it without a composite FK. The application check is correct
  and sufficient; noted so nobody assumes the DB is the backstop. The
  `generations_range_check` CHECK *is* present and correct, and it is not expressible
  in `schema.prisma`, so a future `migrate diff` regenerating the table would silently
  drop it — worth a line in the migration runbook.

---

## Test-coverage observations

The suite is strong on the security-critical paths: `ancestry-jump-public-redaction.test.ts`
covers all three fail-closed endpoints plus back-reference pruning and
input-non-mutation; `ancestry-jump-jsonld.test.ts` locks `relatedTo`-only emission,
the `indexable` gate, and "never emits the range or the notes";
`ancestry-jump-api.test.ts` covers 401/403/429, gate ordering, tree scoping, the
P2002 race backstop and the merged-range PATCH rule.

Gaps worth closing, all tied to the findings above:

- no exporter test for `\r` or `@` inside `jump.notes` (M1);
- no parser test for a jump cycle (A↔B) or a self-`ASSO` on import (M2);
- no parser test for an `_ANC_FAM` naming a spouse-less or unrelated family (M2);
- no test that a borrowed subtree does not carry a stale `ancestryJumpAsDescendant`
  into the target payload (L1).
