# «قفزة نسب» (Ancestry Jump) — implementation spec

> **Status:** ready for TDD implementation. One design, no options.
> Date: 2026-09-22. Author: details-architect.
> Upstream research + owner rulings: `docs/ancestor-gap-research-notes.md`
> (read §C1 OWNER DECISION, §C2, §C3, §(d) before this file).
>
> Everything below was written against code read on 2026-09-22; every line
> reference is real. Where a file/function is named, it exists today.

---

## 0. The feature in one paragraph

A person who has **no parents recorded** can be linked to a **distant ancestor
couple** across an unknown (or simply uninteresting) number of generations.
The canonical case is عدنان ⋯ إسماعيل. The link is a **first-class relation
row**, never a fake parent edge and never fabricated filler people. The link
target is an existing **`Family`** — exactly how an ordinary "who are this
person's parents" question is answered everywhere else in this codebase.

**Name everywhere** (feature, button, canvas chip, audit strings, GEDCOM NOTE
prose): **«قفزة نسب»**. The label never claims the intermediate names are
unknown — a user may jump over people he simply does not want in his tree.

---

## 1. Data model

### 1.1 Why the target is always a `Family` (and never `ancestorIndividualId`)

This is the load-bearing design decision. **The jump points at a `Family` row.
There is no `ancestorIndividualId` column, no XOR, no CHECK discriminator.**

Justification, from the code:

1. **A single known parent is *already* a `Family` with one spouse.**
   `usePersonActions.handleAddParentSubmit` (`src/hooks/usePersonActions.ts:506-546`)
   is the app's "add a parent" flow. When the child has no `familyAsChild` it
   creates a **new `Family`** with only `husbandId` **or** only `wifeId` set
   (`:530-542`). When the child already has a family it patches the empty slot
   (`:520-529`). So "one known parent" has exactly one representation in this
   codebase, and it is a one-spouse `Family`. A jump target must mirror it.

2. **`Individual.familyAsChild` is the single upward edge the whole app reads.**
   `getFather` in `display.ts:29-37` and `person-projection.ts:222-227`,
   `getAllAncestors` (`graph.ts:8-35`), `findTopmostAncestor` (`graph.ts:494`),
   `computeDeleteImpact` (`cascade-delete.ts:103`) all resolve parents as
   `individuals[x].familyAsChild → families[...] → husband/wife`. A jump modelled
   as "`familyAsChild`, but across a gap" reuses every one of those shapes with a
   one-line change; an `ancestorIndividualId` variant would fork each of them.

3. **The female-only rule falls out for free.** The owner's rule — «من وَلَد»
   only when the *male* ancestor exists, otherwise the name chain stops but she
   still appears everywhere else — is literally `family.husband ?? null`. With a
   single-individual column it would be a second branch in every consumer.

4. **The canvas gets the couple for free.** The tree already renders a parent
   couple (person + spouse cards) from one `Family`. A jump ancestor couple is
   the same node shape, no new node kind.

5. **Empty-family hygiene already covers us.** The deferred empty-family prune
   (memory `project_empty_family_cleanup`) is specified to **KEEP any family that
   has a spouse**. A minted one-spouse ancestor family is therefore never swept.

**Consequence to implement (do not skip):** because `Family.husbandId` /
`wifeId` are optional FKs (Prisma default `SetNull`), deleting the *ancestor
individual* leaves the family row behind with both slots null and the jump
pointing at an empty couple. See §5.4 `pruneEmptyAncestryJumps`.

### 1.2 Prisma model

Add to `prisma/schema.prisma` immediately after `RadaFamilyChild`
(`prisma/schema.prisma:425-434`), before the Tree Edit Log section:

```prisma
// =============================================================================
// Ancestry jump («قفزة نسب») — a certain descent across an unrecorded (or
// deliberately skipped) number of generations. NOT a parent edge: no traversal
// crosses it unless it explicitly opts in (`includeJumps`), so code that does
// not know about jumps simply does not see the link — fail-closed.
// =============================================================================

model AncestryJump {
  id               String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  treeId           String   @map("tree_id") @db.Uuid
  gedcomId         String?  @map("gedcom_id")
  /// The nearer person — must have NO familyAsChild (§4.3 rule J1).
  descendantId     String   @map("descendant_id") @db.Uuid
  /// The distant ancestor COUPLE. Always a Family; a single known ancestor is a
  /// one-spouse Family, exactly as `handleAddParentSubmit` already builds.
  ancestorFamilyId String   @map("ancestor_family_id") @db.Uuid
  generationsMin   Int?     @map("generations_min")
  generationsMax   Int?     @map("generations_max")
  /// Phase 10b: AES-256-GCM ciphertext under the workspace data key.
  notes            Bytes?
  createdById      String?  @map("created_by") @db.Uuid
  createdAt        DateTime @default(now()) @map("created_at")
  updatedAt        DateTime @updatedAt @map("updated_at")

  tree           FamilyTree @relation(fields: [treeId], references: [id], onDelete: Cascade)
  descendant     Individual @relation("AncestryJumpDescendant", fields: [descendantId], references: [id], onDelete: Cascade)
  ancestorFamily Family     @relation("AncestryJumpAncestorFamily", fields: [ancestorFamilyId], references: [id], onDelete: Cascade)
  createdBy      User?      @relation("AncestryJumpCreator", fields: [createdById], references: [id])

  /// v1: at most ONE jump per descendant.
  @@unique([treeId, descendantId])
  @@unique([treeId, gedcomId])
  @@index([ancestorFamilyId])
  @@map("ancestry_jumps")
}
```

Back-relations to add:

| Model | Line today | Add |
|---|---|---|
| `FamilyTree` | `schema.prisma:262` (`radaFamilies RadaFamily[]`) | `ancestryJumps  AncestryJump[]` |
| `Individual` | `schema.prisma:335` (`radaFamilyChildren`) | `ancestryJumpAsDescendant AncestryJump[] @relation("AncestryJumpDescendant")` |
| `Family` | end of relation block | `ancestryJumpsAsAncestor  AncestryJump[] @relation("AncestryJumpAncestorFamily")` |
| `User` | near `"IndividualCreator"` | `ancestryJumpsCreated AncestryJump[] @relation("AncestryJumpCreator")` |

### 1.3 Migration

`prisma migrate dev` is **broken in this repo** (the `add_live_presence`
migration's `RAISE EXCEPTION` guard kills the shadow DB). Use the documented
path:

```bash
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel prisma/schema.prisma \
  --script > prisma/migrations/20260922120000_add_ancestry_jumps/migration.sql
# hand-add the CHECK constraint (Prisma cannot express it in-schema)
npx prisma migrate deploy
npx prisma generate
# then restart pnpm dev — a running dev server keeps a stale Prisma client and 500s
```

`prisma/migrations/20260922120000_add_ancestry_jumps/migration.sql` — final content:

```sql
-- CreateTable
CREATE TABLE "ancestry_jumps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tree_id" UUID NOT NULL,
    "gedcom_id" TEXT,
    "descendant_id" UUID NOT NULL,
    "ancestor_family_id" UUID NOT NULL,
    "generations_min" INTEGER,
    "generations_max" INTEGER,
    "notes" BYTEA,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ancestry_jumps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ancestry_jumps_tree_id_descendant_id_key" ON "ancestry_jumps"("tree_id", "descendant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ancestry_jumps_tree_id_gedcom_id_key" ON "ancestry_jumps"("tree_id", "gedcom_id");

-- CreateIndex
CREATE INDEX "ancestry_jumps_ancestor_family_id_idx" ON "ancestry_jumps"("ancestor_family_id");

-- A stated generation range must be positive and ordered. Both columns stay
-- independently nullable ("we don't know" is the honest default).
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_generations_range_check" CHECK (
    ("generations_min" IS NULL OR "generations_min" >= 1)
    AND ("generations_max" IS NULL OR "generations_max" >= 1)
    AND ("generations_min" IS NULL OR "generations_max" IS NULL OR "generations_min" <= "generations_max")
);

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_tree_id_fkey" FOREIGN KEY ("tree_id") REFERENCES "family_trees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_descendant_id_fkey" FOREIGN KEY ("descendant_id") REFERENCES "individuals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_ancestor_family_id_fkey" FOREIGN KEY ("ancestor_family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ancestry_jumps" ADD CONSTRAINT "ancestry_jumps_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

> The unique index `(tree_id, descendant_id)` is the **DB backstop** for rule J2
> (one jump per person). The route also pre-checks, so the user gets an Arabic
> 409 rather than a P2002 500 — both must exist (same belt-and-braces pattern as
> `CollectionItem`'s duplicate-source guard).

### 1.4 Encryption

`notes` is free text ⇒ **`Bytes?`, AES-256-GCM under the workspace data key**,
exactly like `RadaFamily.notes` (`schema.prisma:413`).

Add to `src/lib/tree/encryption.ts`, next to `RADA_FAMILY_ENCRYPTED_FIELDS`
(`encryption.ts:77-79`):

```ts
export const ANCESTRY_JUMP_ENCRYPTED_FIELDS = ['notes'] as const;

export type AncestryJumpEncryptedField = (typeof ANCESTRY_JUMP_ENCRYPTED_FIELDS)[number];

export function encryptAncestryJumpInput<T extends Record<string, unknown>>(
  input: T,
  key: Buffer,
): EncryptedOut<T, AncestryJumpEncryptedField> {
  return encryptFieldsOf(input, ANCESTRY_JUMP_ENCRYPTED_FIELDS, key) as EncryptedOut<T, AncestryJumpEncryptedField>;
}

export function decryptAncestryJumpRow<T extends object>(row: T, key: Buffer): T {
  return decryptFieldsOf(row as unknown as Record<string, unknown>, ANCESTRY_JUMP_ENCRYPTED_FIELDS, key) as unknown as T;
}
```

Also add `'ancestryJump'` handling to `scripts/encrypt-existing-data.ts` **only
if** the script enumerates models explicitly; new rows are born encrypted, so a
back-fill pass is not required. (Check the script; if it is table-driven, add the
table, otherwise no change.)

---

## 2. `GedcomData` shape (`src/lib/gedcom/types.ts`)

Add after the `RadaFamily` interface (`types.ts:87-94`):

```ts
export interface AncestryJump {
  id: string;
  type: '_ANC_JUMP';
  /** Individual ID of the nearer person (has no familyAsChild). */
  descendant: string;
  /** Family ID of the distant ancestor couple (husband and/or wife). */
  ancestorFamily: string;
  /** Inclusive lower bound on generations skipped; null = unstated. */
  generationsMin: number | null;
  /** Inclusive upper bound; null = unstated. */
  generationsMax: number | null;
  notes: string;
}
```

Extend `GedcomData` (`types.ts:96-100`):

```ts
export interface GedcomData {
  individuals: Record<string, Individual>;
  families: Record<string, Family>;
  radaFamilies?: Record<string, RadaFamily>;
  ancestryJumps?: Record<string, AncestryJump>;
}
```

Back-references on `Individual` (`types.ts:35`, mirroring `radaFamiliesAsChild`):

```ts
  radaFamiliesAsChild?: string[];
  /** The ONE «قفزة نسب» whose descendant is this person (id into `ancestryJumps`). */
  ancestryJumpAsDescendant?: string;
```

and on `Family` (`types.ts:68-85`):

```ts
  /** «قفزة نسب» rows that name THIS family as the distant ancestor couple. */
  ancestryJumpsAsAncestor?: string[];
```

> `INTERNAL_INDIVIDUAL_KEYS` (`types.ts:59-66`) is **unchanged** — neither new
> field is internal-only; both are part of the public payload when the jump
> survives redaction (§6).

### 2.1 Shared index helper (new, `src/lib/gedcom/graph.ts`)

Every consumer needs the same two lookups. Define once:

```ts
export interface JumpIndex {
  /** descendant individual id -> the jump */
  byDescendant: Map<string, AncestryJump>;
  /** ancestor family id -> jumps hanging off it */
  byAncestorFamily: Map<string, AncestryJump[]>;
}

export function buildJumpIndex(data: GedcomData): JumpIndex;
```

Pure, O(J). Callers that traverse in a loop build it once.

---

## 3. Mapper (`src/lib/tree/mapper.ts`)

### 3.1 New DB shapes

Add next to `DbRadaFamily` (`mapper.ts:188-209`):

```ts
export interface DbAncestryJump {
  id: string
  treeId: string
  gedcomId: string | null
  descendantId: string
  ancestorFamilyId: string
  generationsMin: number | null
  generationsMax: number | null
  notes: Enc
  createdAt: Date
}

/** Plaintext shape after `decryptAncestryJumpRow`. Exported for test fixtures. */
export interface DecryptedAncestryJump {
  id: string
  treeId: string
  gedcomId: string | null
  descendantId: string
  ancestorFamilyId: string
  generationsMin: number | null
  generationsMax: number | null
  notes: string | null
  createdAt: Date
}
```

Extend `DbTree` (`mapper.ts:211-217`) with `ancestryJumps?: DbAncestryJump[]`.

### 3.2 `mapAncestryJump`

```ts
export function mapAncestryJump(row: DecryptedAncestryJump): AncestryJump {
  return {
    id: row.id,
    type: '_ANC_JUMP',
    descendant: row.descendantId,
    ancestorFamily: row.ancestorFamilyId,
    generationsMin: row.generationsMin,
    generationsMax: row.generationsMax,
    notes: row.notes ?? '',
  }
}
```

### 3.3 `dbTreeToGedcomData` (`mapper.ts:246-315`)

Insert a block after the rada block, **before** the two `return` statements.
Refactor the tail so there is ONE return (today `mapper.ts:311` and `:314`
duplicate it — collapse into a single `const result: GedcomData = { individuals,
families }` then conditional assignment, mirroring `redactPrivateIndividuals`
at `mapper.ts:437-439`).

```ts
  if (dbTree.ancestryJumps && dbTree.ancestryJumps.length > 0) {
    const ancestryJumps: Record<string, AncestryJump> = {}
    for (const dbJump of dbTree.ancestryJumps) {
      const decrypted = decryptAncestryJumpRow(dbJump, workspaceKey) as unknown as DecryptedAncestryJump
      const jump = mapAncestryJump(decrypted)
      ancestryJumps[jump.id] = jump
      // Back-references (mirrors radaFamiliesAsChild, mapper.ts:304-309)
      if (individuals[jump.descendant]) {
        individuals[jump.descendant].ancestryJumpAsDescendant = jump.id
      }
      if (families[jump.ancestorFamily]) {
        const list = families[jump.ancestorFamily].ancestryJumpsAsAncestor ?? []
        list.push(jump.id)
        families[jump.ancestorFamily].ancestryJumpsAsAncestor = list
      }
    }
    result.ancestryJumps = ancestryJumps
  }
```

> **Dangling-reference rule:** a jump whose `descendant` or `ancestorFamily` is
> absent from the mapped payload (possible on a borrowed/extracted subtree) is
> still emitted into `ancestryJumps` but leaves no back-reference. Every consumer
> resolves through the back-references, so a dangling jump is inert. Tests must
> cover it.

### 3.4 `TREE_INCLUDES` (`src/lib/tree/queries.ts:34-54`)

```ts
  ancestryJumps: true,
```

(No nested include needed — `AncestryJump` has no child table.)

### 3.5 Member redaction (`redactPrivateIndividuals`, `mapper.ts:424-440`)

**Pass `ancestryJumps` through unchanged**, exactly like `radaFamilies`
(`mapper.ts:438`):

```ts
  if (data.radaFamilies) result.radaFamilies = data.radaFamilies
  if (data.ancestryJumps) result.ancestryJumps = data.ancestryJumps
```

Rationale: the member redactor only blanks an individual's PII and keeps
*structure* (`mapper.ts:420-423`). `Family.marriageNotes` are likewise not
blanked when a spouse is private. Members are inside the workspace; the jump and
its notes stay. Public is a different story — §6.

---

## 4. API

### 4.1 Routes

All three mirror the rada'a routes
(`src/app/api/workspaces/[id]/tree/rada-families/route.ts` and
`.../[radaFamilyId]/route.ts`) **minus the feature-toggle block** — the owner
ruled **no workspace toggle** (rada'a has one; jumps do not).

| Method | Path | Guard | Limiter |
|---|---|---|---|
| `POST` | `/api/workspaces/[id]/tree/ancestry-jumps` | `requireTreeEditor` | `treeMutateLimiter.check(user.id)` |
| `PATCH` | `/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]` | `requireTreeEditor` | same |
| `DELETE` | `/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]` | `requireTreeEditor` | same |

Files:
- `src/app/api/workspaces/[id]/tree/ancestry-jumps/route.ts` (POST)
- `src/app/api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/route.ts` (PATCH + DELETE)

Fixed handler order (copy from `rada-families/route.ts:16-59`):

1. `const { id: workspaceId } = await params`
2. `const result = await requireTreeEditor(request, workspaceId); if (isErrorResponse(result)) return result;`
3. rate limit → `rateLimitResponse(retryAfterSeconds)`
4. `parseValidatedBody(request, <schema>)` / `parseTreeIdFromBody(request)` for DELETE
5. `const tree = await resolveTargetTreeOr404(workspaceId, treeId); if (isErrorResponse(tree)) return tree;`
6. validate (§4.3) against the mapped `GedcomData` for **that tree**
7. `const workspaceKey = await getWorkspaceKey(workspaceId)`
8. Prisma write
9. `await Promise.all([ prisma.treeEditLog.create({...}), touchTreeTimestamp(tree.id) ])`
10. respond

> `treeId` is **stripped from `parsed.data` before it reaches Prisma** — see the
> rada PATCH precedent at `rada-families/[radaFamilyId]/route.ts:50-51`.

### 4.2 Zod schemas — new file `src/lib/tree/ancestry-jump-schemas.ts`

A separate file (not `schemas.ts`) because the validators, the error-code map and
the schemas belong together and `schemas.ts` is already the shared
individual/family surface.

```ts
import { z } from 'zod';
import { targetTreeIdSchema } from '@/lib/tree/schemas';

/** Hard ceiling on a stated generation gap. 200 is a sanity bound, not a claim. */
export const MAX_JUMP_GENERATIONS = 200;

const generationsSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_JUMP_GENERATIONS)
  .nullable()
  .optional();

const rangeOrdered = (d: { generationsMin?: number | null; generationsMax?: number | null }) =>
  d.generationsMin == null || d.generationsMax == null || d.generationsMin <= d.generationsMax;

const RANGE_MESSAGE = 'أقل عدد للأجيال يجب ألا يتجاوز أكثر عدد';

export const createAncestryJumpSchema = z
  .object({
    treeId: targetTreeIdSchema,
    descendantId: z.string().uuid(),
    ancestorFamilyId: z.string().uuid(),
    generationsMin: generationsSchema,
    generationsMax: generationsSchema,
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(rangeOrdered, { message: RANGE_MESSAGE, path: ['generationsMax'] });

/** PATCH: range + notes only. The two endpoints are immutable — delete + recreate. */
export const updateAncestryJumpSchema = z
  .object({
    treeId: targetTreeIdSchema,
    generationsMin: generationsSchema,
    generationsMax: generationsSchema,
    notes: z.string().max(5000).nullable().optional(),
  })
  .refine(rangeOrdered, { message: RANGE_MESSAGE, path: ['generationsMax'] });

export type CreateAncestryJumpInput = z.infer<typeof createAncestryJumpSchema>;
export type UpdateAncestryJumpInput = z.infer<typeof updateAncestryJumpSchema>;
```

> **PATCH does not move either endpoint.** Re-pointing a jump is delete +
> create, which keeps the cycle/one-per-person invariants trivially checkable and
> keeps undo as two single-row ops. Write this down in the file header.
>
> **PATCH partial-range semantics:** `undefined` = leave unchanged; explicit
> `null` = clear. The route must therefore re-run the ordering check against the
> **merged** (existing ⊕ patch) values, not just the patch — Zod's `.refine` only
> sees the patch. See §4.3 rule J6.

### 4.3 Validators — new file `src/lib/tree/ancestry-jump-validators.ts`

Pure function over `GedcomData` + a thin message map. No DB access (the route
already holds the mapped tree).

```ts
import type { GedcomData } from '@/lib/gedcom/types';
import { getAllDescendants, buildJumpIndex } from '@/lib/gedcom/graph';

export type AncestryJumpError =
  | 'descendant_not_found'
  | 'ancestor_family_not_found'
  | 'descendant_has_parents'
  | 'descendant_already_has_jump'
  | 'ancestor_family_empty'
  | 'self_reference'
  | 'cycle'
  | 'invalid_range';

export const ANCESTRY_JUMP_ERROR_MESSAGES: Record<AncestryJumpError, string> = {
  descendant_not_found:        'الشخص غير موجود في هذه الشجرة',
  ancestor_family_not_found:   'الجدّ المختار غير موجود في هذه الشجرة',
  descendant_has_parents:      'لا يمكن إضافة قفزة نسب لشخص له أب أو أم في الشجرة',
  descendant_already_has_jump: 'لهذا الشخص قفزة نسب بالفعل',
  ancestor_family_empty:       'لا بدّ من تحديد الجدّ أو الجدّة',
  self_reference:              'لا يمكن ربط الشخص بنفسه',
  cycle:                       'لا يمكن الربط بجدّ هو من ذرّية هذا الشخص',
  invalid_range:               'أقل عدد للأجيال يجب ألا يتجاوز أكثر عدد',
};

/** HTTP status per error code. */
export const ANCESTRY_JUMP_ERROR_STATUS: Record<AncestryJumpError, number> = {
  descendant_not_found:        404,
  ancestor_family_not_found:   404,
  descendant_has_parents:      400,
  descendant_already_has_jump: 409,
  ancestor_family_empty:       400,
  self_reference:              400,
  cycle:                       400,
  invalid_range:               400,
};

export interface AncestryJumpCandidate {
  descendantId: string;
  ancestorFamilyId: string;
  generationsMin?: number | null;
  generationsMax?: number | null;
}

/**
 * Rules, in evaluation order. Returns the FIRST violated code, or null.
 *
 *  J1  descendant exists in this tree
 *  J2  ancestor family exists in this tree
 *  J3  descendant has NO familyAsChild (a jump belongs at the TOP of a known line)
 *  J4  descendant has no existing jump (one per person) — `ignoreJumpId` skips self
 *  J5  ancestor family has at least one spouse
 *  J6  range is ordered (re-checked here on MERGED values for PATCH)
 *  J7  descendant is not himself a spouse of the ancestor family (self reference)
 *  J8  NO CYCLE: no spouse of the ancestor family is reachable DOWNWARD from the
 *      descendant through family-child edges AND existing jump edges.
 */
export function validateAncestryJump(
  data: GedcomData,
  candidate: AncestryJumpCandidate,
  opts: { ignoreJumpId?: string } = {},
): AncestryJumpError | null;
```

Reference implementation of J8 (the one that must not be got wrong —
`calculateDescendantCounts` uses Kahn's algorithm (`graph.ts:345-399`) and would
**silently drop a cyclic component** rather than error):

```ts
const reach = getAllDescendants(data, candidate.descendantId, { includeJumps: true });
const fam = data.families[candidate.ancestorFamilyId];
for (const spouseId of [fam.husband, fam.wife]) {
  if (!spouseId) continue;
  if (spouseId === candidate.descendantId) return 'self_reference';
  if (reach.has(spouseId)) return 'cycle';
}
```

`getAllDescendants(..., { includeJumps: true })` must itself be cycle-safe (it
already guards with a `descendants` visited set, `graph.ts:42,55`).

### 4.4 POST contract

**Request** `POST /api/workspaces/{workspaceId}/tree/ancestry-jumps`

```jsonc
{
  "treeId": "uuid",            // optional; absent ⇒ workspace main tree
  "descendantId": "uuid",      // required
  "ancestorFamilyId": "uuid",  // required
  "generationsMin": 4,         // optional, int 1..200, nullable
  "generationsMax": 40,        // optional, int 1..200, nullable
  "notes": "…"                 // optional, ≤5000 chars, nullable
}
```

**201** — note the response carries **plaintext** `notes`, never the `Bytes`
column (the rada POST returns the raw row; do NOT copy that wart):

```jsonc
{
  "data": {
    "id": "uuid",
    "treeId": "uuid",
    "descendantId": "uuid",
    "ancestorFamilyId": "uuid",
    "generationsMin": 4,
    "generationsMax": 40,
    "notes": "عدنان من وَلَد إسماعيل…"   // echo of the request, or null
  }
}
```

Errors: `400` (Zod / J3,J5,J6,J7,J8), `401`, `403`, `404` (tree, J1, J2),
`409` (J4), `429`. Body is always `{ "error": "<Arabic>" }`.

> **409 also on the DB backstop:** catch Prisma `P2002` on
> `ancestry_jumps_tree_id_descendant_id_key` and return the J4 message — a race
> between two editors must not surface as a 500.

### 4.5 PATCH contract

`PATCH .../ancestry-jumps/{jumpId}` — body is `updateAncestryJumpSchema`.
`200 { data: {…same DTO…} }`. `404` when the jump does not belong to the resolved
tree (scope by `{ id: jumpId, treeId: tree.id }`, **never** a bare `findUnique`).

### 4.6 DELETE contract

`DELETE .../ancestry-jumps/{jumpId}` — optional JSON body `{ "treeId": "uuid" }`
read via `parseTreeIdFromBody(request)` (`route-helpers.ts:49`). `204` on
success, `404` on foreign/unknown id. **Deleting a jump deletes the jump row
only** — never the ancestor family, never the ancestor individuals.

### 4.7 Tree GET (`src/app/api/workspaces/[id]/tree/route.ts`)

No handler change beyond `TREE_INCLUDES` (§3.4) — `dbTreeToGedcomData` now emits
`ancestryJumps` and the ETag is already `lastModifiedAt`-derived
(`route.ts:14-19`), which every jump mutation touches via `touchTreeTimestamp`.

**Branch-pointer merge:** `mergePointedSubtree` composes a borrowed subtree into
the home payload. A borrowed subtree is produced by `extractPointedSubtree`,
which is downward-only, so **borrowed jumps are dropped** (fail-closed, correct
for v1 — a jump is same-tree only). Add an explicit comment there and a test that
a pointed subtree never contributes `ancestryJumps`.

---

## 5. Graph, roots, display

### 5.1 `src/lib/gedcom/graph.ts` — exact signature changes

Every traversal takes an explicit option object **defaulting to `false`**. All
existing call sites keep today's behavior with **zero edits**.

```ts
export interface TraversalOptions {
  /**
   * Walk «قفزة نسب» edges as if they were parent→child edges.
   * DEFAULT false — fail-closed. Only three surfaces opt in:
   *   1. the tree canvas (FamilyTree node/edge build)
   *   2. the Person Page nasab spine (person-projection)
   *   3. root finding (findDefaultRoot / findTopmostAncestor from the canvas)
   */
  includeJumps?: boolean;
}
```

| Function | Today | New signature |
|---|---|---|
| `getAllAncestors` | `graph.ts:8` | `(data, personId, opts: TraversalOptions = {})` |
| `getAllDescendants` | `graph.ts:41` | `(data, rootId, opts: TraversalOptions = {})` |
| `getTreeVisibleIndividuals` | `graph.ts:72` | `(data, rootId, excludePrivate = false, opts: TraversalOptions = {})` |
| `getConnectedIndividuals` | `graph.ts:137` | `(data, rootId, opts: TraversalOptions = {})` |
| `getCanvasVisibleIndividuals` | `graph.ts:178` | `(data, rootId, opts: TraversalOptions = {})` |
| `buildChildrenGraph` | `graph.ts:311` | `(data, opts: TraversalOptions = {})` |
| `calculateDescendantCounts` | `graph.ts:345` | **unchanged** — jumps enter via `buildChildrenGraph` |
| `findTopmostAncestor` | `graph.ts:494` | `(data, personId, opts: TraversalOptions = {})` |
| `extractSubtree` | `graph.ts:412` | **unchanged** — downward-only; see note |
| `computeGraftDescriptors` | `graph.ts:637` | **unchanged** — married-in spouse grafts only |
| `resolveNavigationRoot` | `graph.ts:249` | `(data, clickedId, currentRootId, opts: TraversalOptions = {})`; passes `opts` to its three inner calls (`:264,:268,:271,:278`) |

Semantics per function:

- **`getAllAncestors`** — at `graph.ts:18` where it returns on `!familyId`,
  instead consult the jump index: if `person.ancestryJumpAsDescendant` resolves,
  add **both spouses** of the ancestor family and recurse into each. The jump
  ancestors *are* ancestors.
- **`getAllDescendants`** — after the `familiesAsSpouse` loop (`graph.ts:50-60`),
  for each family the person is a spouse in, add every
  `jumpIndex.byAncestorFamily.get(familyId)` → `jump.descendant` and recurse.
  This is what makes إسماعيل's descendant set contain عدنان's whole line.
- **`getTreeVisibleIndividuals`** — passes `opts` straight to `getAllDescendants`
  (`graph.ts:90`). No other change; spouse expansion (`:95-110`) already covers
  the jump descendant's spouses once he is in `visible`.
- **`getConnectedIndividuals`** — add to the `familyIds` list (`graph.ts:151-152`)
  the jump's `ancestorFamily` when the person is a jump descendant, and, for each
  family the person belongs to, the descendants of jumps hanging off it. This
  keeps the sidebar people-list and stat counts consistent with the canvas.
- **`buildChildrenGraph`** — after the family loop (`graph.ts:321-336`), for each
  jump push `jump.descendant` into `childrenOf` of **both** spouses of the
  ancestor family (deduped, same `includes` guard as `:330`).
- **`findTopmostAncestor`** — at the three "no parent found" exits
  (`graph.ts:513-515`, `:519-521`, `:526-528`), before returning, try the jump:
  resolve the ancestor family and continue from `family.husband ?? family.wife`.
  The existing `visited` set + `MAX_DEPTH = 100` guard (`graph.ts:502-506`) covers
  jump cycles too. Also: the early return at `graph.ts:500`
  (`if (!person.familyAsChild) return null`) must become
  `if (!person.familyAsChild && !hasJump) return null` when `includeJumps`.

### 5.2 `src/lib/gedcom/roots.ts`

**`findDefaultRoot` (`roots.ts:21-60`) is the one place that MUST change**
regardless of options — a jump descendant is no longer a "true root":

```ts
  // graph.ts:494 documents the same rule: a person with a «قفزة نسب» has someone
  // above them, so they are not the top of the tree.
  const trueRoots: Individual[] = [];
  for (const id in individuals) {
    const person = individuals[id];
    if (!person.familyAsChild && !person.ancestryJumpAsDescendant && !person.isPrivate) {
      trueRoots.push(person);
    }
  }
```

and the descendant count must flow across jumps so the apex ancestor wins:

```ts
  const childrenOf = buildChildrenGraph(data, { includeJumps: true });   // roots.ts:44
```

`findRootAncestors` (`roots.ts:5-19`) returns everyone — **no change**.

> Regression risk to test: a tree with NO jumps must pick exactly the same
> default root as today. `buildChildrenGraph(data, { includeJumps: true })` on
> jump-free data is byte-identical to `buildChildrenGraph(data)`.

### 5.3 `src/lib/gedcom/display.ts` — nasab

`getDisplayNameWithNasab` (`display.ts:52-99`). Two changes, one of which is a
**real bug waiting to happen**.

Add the connector constant:

```ts
/** The classical partitive that marks a «قفزة نسب» in a name chain. */
export const JUMP_CONNECTOR = 'من وَلَد';
```

Add a resolver next to `getFather` (`display.ts:29-37`):

```ts
/**
 * The MALE distant ancestor of a person's «قفزة نسب», or null.
 * Returns null when the person has no jump, when the jump's family has no
 * husband (a female-only ancestor is NOT in the نسب chain — owner ruling), or
 * when the reference dangles.
 */
function getJumpFather(data: GedcomData, person: Individual): Individual | null {
  const jumpId = person.ancestryJumpAsDescendant;
  if (!jumpId) return null;
  const jump = data.ancestryJumps?.[jumpId];
  if (!jump) return null;
  const family = data.families[jump.ancestorFamily];
  if (!family?.husband) return null;
  return data.individuals[family.husband] ?? null;
}
```

Rewrite the walk loop (`display.ts:75-90`):

```ts
  let currentPerson: Individual | null = person;
  let surnameSource: Individual = person;   // WAS `lastPersonInChain`
  let crossedJump = false;
  let generationsAdded = 1;
  const maxGenerations = depth === 0 ? Infinity : depth;

  while (generationsAdded < maxGenerations) {
    const father = getFather(data, currentPerson);

    if (father) {
      if (visited.has(father.id)) break;
      visited.add(father.id);
      nameParts.push(currentPerson.sex === 'F' ? 'بنت' : 'بن');
      nameParts.push(father.givenName || father.name || 'Unknown');
      // ⚠️ SURNAME PITFALL (display.ts:93): the surname is taken from the LAST
      // person in the chain. Once we have crossed a jump, the ancestor's house
      // is NOT this family's house — عدنان's family must never be stamped with
      // إسماعيل's surname. So the surname source freezes at the jump.
      if (!crossedJump) surnameSource = father;
      currentPerson = father;
      generationsAdded++;
      continue;
    }

    const jumpFather = getJumpFather(data, currentPerson);
    if (!jumpFather || visited.has(jumpFather.id)) break;
    visited.add(jumpFather.id);
    // «... بن عدنان، من وَلَد إسماعيل». The comma binds to the PRECEDING token,
    // so it is appended rather than pushed (join(' ') would give «عدنان ، من»).
    nameParts[nameParts.length - 1] += '،';
    nameParts.push(JUMP_CONNECTOR);
    nameParts.push(jumpFather.givenName || jumpFather.name || 'Unknown');
    crossedJump = true;
    currentPerson = jumpFather;
    generationsAdded++;
  }

  const surname = surnameSource.surname || person.surname;   // display.ts:93
```

Behaviour table (all must be tests):

| Case | `depth` | Output |
|---|---|---|
| عدنان ⇢ (إسماعيل × هاجر), إسماعيل بن إبراهيم | `0` | `عدنان، من وَلَد إسماعيل بن إبراهيم <surname-of-عدنان's-line>` |
| same | `2` (default) | `عدنان <surname>` — the jump is beyond depth, never reached |
| same | `3` | `عدنان، من وَلَد إسماعيل <surname>` |
| female descendant فاطمة ⇢ (إسماعيل × هاجر) | `0` | `فاطمة، من وَلَد إسماعيل …` — the connector does **not** become «بنت» |
| ancestor family has **wife only** | `0` | `عدنان <surname>` — chain stops, no token emitted |
| jump ancestor has a surname | `0` | descendant's own surname wins (`crossedJump` freeze) |

> `DEFAULT_NASAB_DEPTH = 2` (`display.ts:3`) means the overwhelming majority of
> call sites (cards, sidebar, pickers) never reach a jump. Only the Person Page
> ribbon and `depth: 0` callers do.

### 5.4 Deleting an end — `pruneEmptyAncestryJumps`

New export in `src/lib/tree/queries.ts`:

```ts
/**
 * Delete every AncestryJump in `treeId` whose ancestor family has lost BOTH
 * spouses. `Family.husbandId`/`wifeId` are optional FKs (Prisma SetNull), so
 * deleting the last ancestor INDIVIDUAL leaves the family row behind with an
 * empty couple and the jump pointing at nothing. Called from the individual
 * DELETE route AFTER the delete, inside the same Promise.all as
 * `touchTreeTimestamp`. Returns the number of rows removed (0 in the normal case).
 */
export async function pruneEmptyAncestryJumps(treeId: string): Promise<number>
```

Implementation: `prisma.ancestryJump.deleteMany({ where: { treeId, ancestorFamily: { husbandId: null, wifeId: null } } })`.

Wire into `src/app/api/workspaces/[id]/tree/individuals/[id]/route.ts` DELETE
(both the single-delete and cascade-delete paths).

---

## 6. Public tree safety

### 6.1 `redactForPublic` (`src/lib/tree/public-visibility.ts:165-198`)

Add, after the individuals loop and before the return:

```ts
  const result: GedcomData = { individuals, families: data.families }
  if (data.radaFamilies) result.radaFamilies = data.radaFamilies

  // «قفزة نسب» — FAIL-CLOSED. A jump is suppressed entirely when the descendant
  // is redacted OR when ANY spouse of the ancestor family is redacted. A private
  // person must never be inferable as the end of a published lineage claim, and
  // a half-drawn couple is a structural oracle. Rather than half-publish, drop.
  if (data.ancestryJumps) {
    const kept: Record<string, AncestryJump> = {}
    for (const [id, jump] of Object.entries(data.ancestryJumps)) {
      const descendant = individuals[jump.descendant]
      if (!descendant || descendant.publicDisplay === 'redacted') continue
      const family = data.families[jump.ancestorFamily]
      if (!family) continue
      const spouses = [family.husband, family.wife].filter(Boolean) as string[]
      if (spouses.length === 0) continue
      if (spouses.some((sid) => !individuals[sid] || individuals[sid].publicDisplay === 'redacted')) continue
      kept[id] = jump
    }
    if (Object.keys(kept).length > 0) result.ancestryJumps = kept
  }
```

Consequences that must be tested:
- a private **descendant** ⇒ jump gone;
- a private **husband** ⇒ jump gone;
- a private **wife**, public husband ⇒ jump gone (fail-closed; a surviving
  «من وَلَد» would publish that the hidden person is his wife);
- all public ⇒ jump kept, `notes` kept (the scholarly explanation is the point of
  publishing it).

> Because the jump is dropped from the payload, the `Individual.ancestryJumpAsDescendant`
> back-reference on the surviving descendant **must also be cleared** — otherwise
> a consumer dereferences a missing id. Do it in the same block:
> `delete individuals[jump.descendant].ancestryJumpAsDescendant` for every dropped jump.

### 6.2 JSON-LD (`src/lib/tree/person-jsonld.ts`)

**Owner ruling: emit schema.org `relatedTo`, never `parent`/`children`.**
schema.org has no "ancestor" property; `relatedTo` is "the most generic familial
relation" and makes no generational claim. Publishing a `parent` edge across a
jump is exactly the FamilySearch-عدنان false-precision failure this feature
exists to prevent.

Changes:

1. `FOCAL_KEYS` (`person-jsonld.ts:54-65`) gains `'relatedTo'`. **`RELATION_KEYS`
   (`:67`) is unchanged** — jump nodes are name+gender only, dateless, like every
   other relation node.
2. `collectRelations` (`:101-153`) gains a fifth bucket:

```ts
  // «قفزة نسب» — the distant ancestor couple. Emitted as schema.org `relatedTo`
  // ONLY. NEVER `parent`: the generations between are not recorded, so a parent
  // edge would publish a false claim into the knowledge graph (see
  // docs/ancestor-gap-research-notes.md §A4). Gated per-node on isPublicNode as
  // defense in depth even though redactForPublic already dropped mixed jumps.
  const relatedTo: Individual[] = []
  const jumpId = focal.ancestryJumpAsDescendant
  const jump = jumpId ? data.ancestryJumps?.[jumpId] : undefined
  if (jump) {
    const fam = families[jump.ancestorFamily]
    if (fam) {
      for (const sid of [fam.husband, fam.wife]) {
        const ind = sid ? individuals[sid] : undefined
        if (isPublicNode(ind)) relatedTo.push(ind)
      }
    }
  }
```

3. In `buildPersonJsonLd` (`:170-201`), after the four existing relation lines:

```ts
  if (relatedTo.length > 0) person.relatedTo = relatedTo.map(relationNode)
```

**Locked rules** (write them into the file header, they are the kind of thing
someone "helpfully" changes later):
- the jump NEVER appears under `parent`, `children`, `spouse` or `sibling`;
- `generationsMin`/`generationsMax`/`notes` are NEVER emitted into JSON-LD;
- the emission gate (`indexable`, `:173`) is unchanged — a by-link/extra/member
  page still emits nothing at all.

### 6.3 Public serve

`src/lib/tree/public-serve.ts` composes home + borrowed branches then redacts
once. Jump rows travel with the home `GedcomData`, and borrowed branches carry
none (§4.7). `buildPublicNamesList` (crawlable names) needs **no change** — a
jump ancestor is an ordinary `Individual` already in the payload.

---

## 7. Person Page projection

### 7.1 `src/lib/tree/person-projection.ts`

Type additions:

```ts
/** Range of generations a «قفزة نسب» spans; both bounds independently optional. */
export interface JumpRange {
  generationsMin: number | null;
  generationsMax: number | null;
}

export interface SpineChip extends PersonChip {
  mother?: MotherLine;
  /**
   * Set when THIS spine node was reached from the node below it by a
   * «قفزة نسب» rather than a father link. The UI renders a «قفزة نسب» divider
   * (plus the range when stated) instead of a «بن» token at this position.
   */
  jump?: JumpRange;
}

export interface AncestryJumpProjection extends JumpRange {
  /** The male ancestor — also the `jump`-marked head of `paternalChain`. */
  father: PersonChip | null;
  /** The female ancestor, if known. NEVER in the nasab chain (owner ruling). */
  mother: PersonChip | null;
}
```

on `PersonProjection` (`person-projection.ts:193-207`):

```ts
  /**
   * The subject's own «قفزة نسب», if any. Present even when the ancestor is
   * FEMALE-ONLY (she does not join the نasab chain but must appear everywhere
   * else). Absent when the subject has no jump or it is fully suppressed.
   */
  ancestryJump?: AncestryJumpProjection;
```

### 7.2 `buildPaternalSpine` (`person-projection.ts:329-362`)

Replace the `if (!father || !guard.enter(father.id)) break;` line (`:341`) with a
father-or-jump resolution. The jump-emitted node carries `jump: { … }` and the
walk **continues** from the ancestor (his own «بن» chain is climbed normally).

```ts
  let current: Individual | null = start;
  let pendingJump: JumpRange | null = null;   // set when the next node is reached by a jump

  while (current) {
    let next = getFather(data, current);
    let reachedByJump: JumpRange | null = null;

    if (!next) {
      const resolved = resolveJumpFather(data, current);   // new helper, §7.4
      if (!resolved) break;
      next = resolved.father;
      reachedByJump = { generationsMin: resolved.jump.generationsMin, generationsMax: resolved.jump.generationsMax };
    }
    if (!guard.enter(next.id)) break;

    if (isPrivate(next)) {
      const ph = toChip(next, true);                        // «خاص» placeholder
      if (reachedByJump) (ph as SpineChip).jump = reachedByJump;
      nearestToOldest.push(ph);
      if (opts.climbBoundary(next, data) || !opts.continueThroughPrivateAncestor) break;
      current = next;
      continue;
    }

    const node: SpineChip = toChip(next);
    if (reachedByJump) node.jump = reachedByJump;
    if (!opts.isBoundary(next, data)) attachMother(data, next, node, opts);
    nearestToOldest.push(node);

    if (opts.climbBoundary(next, data)) break;
    current = next;
  }
```

Invariants preserved, each a test:

- **Boundary invariant (§1 of the file header, `person-projection.ts:21-27`):** a
  jump is walked exactly like a father link, so a boundary ancestor is **emitted
  as a chip and never climbed past** (`opts.climbBoundary` check is after the
  push, unchanged).
- **Private gate (§2, `:29-35`):** a private jump ancestor becomes the
  non-clickable «خاص» `PRIVATE_PLACEHOLDER` **carrying no `id`** (`toChip(ind,
  true)`, `:255-274`) — it is a direct-ancestor nasab position, which is the one
  place a private person may surface. `continueThroughPrivateAncestor` applies
  identically.
- `buildFathersChain` (`:439-465`) — a woman's fathers-only chain — gets the
  **same** father-or-jump resolution, so a woman with a jump also renders it.
- `buildMaternalSpine` (`:371-392`) needs **no jump-specific code**: it delegates
  to `buildPaternalSpine`/`buildFathersChain` for the climb.

### 7.3 The `ancestryJump` field on the projection

Built in `projectPerson` (`:653-706`), independent of the spine so the
**female-only** case is still surfaced:

```ts
  const jumpOut = buildAncestryJump(data, subject);
  …
  return { subject: subjectOut, …, ancestryJump: jumpOut ?? undefined, … };
```

`buildAncestryJump` rules:
- no jump / dangling / family missing ⇒ `undefined`;
- each spouse is resolved with `visible(data, id)` (`:294-299`) — **a private
  spouse yields `null` in that slot, not a placeholder** (this is a relation
  group, not a nasab position; §2 of the file header);
- both slots null ⇒ `undefined` (nothing to show);
- the `father` chip is the SAME person as the `jump`-marked head of
  `paternalChain` — the UI must not render him twice.

### 7.4 New helper

```ts
/** The male jump-ancestor of `ind` plus the jump itself, or null. */
function resolveJumpFather(
  data: GedcomData,
  ind: Individual,
): { father: Individual; jump: AncestryJump } | null
```

Returns null when: no `ancestryJumpAsDescendant`; the id dangles; the ancestor
family has no `husband`; the husband is absent from `data.individuals`.

### 7.5 ETag

`src/app/api/workspaces/[id]/tree/person/[individualId]/route.ts:24`

```ts
const PROJECTION_ETAG_VERSION = 'v4';   // was 'v3' — jump spine + ancestryJump field
```

Mandatory: a logic-only projection change leaves `lastModifiedAt` untouched, so
without the bump every cached person page serves the pre-jump shape.

### 7.6 UI (`src/components/person/`) — spec only, chunk 2

- `NasabRibbon` — at a `jump`-marked chip render a **«قفزة نسب»** divider
  (a «⋯» rule + the label) in place of the «بن» token, plus
  «بين ٤ و٤٠ جيلاً» / «لا يقل عن ٤ أجيال» / «لا يزيد على ٤٠ جيلاً» when the
  matching bound is set, and nothing when both are null. Arabic-Indic digits are
  **not** used — match the rest of the app (plain Western digits).
- A new `AncestryJumpBlock` (sibling of `RadaBlock`) renders
  `projection.ancestryJump` as a small card: «قفزة نسب» heading, the two ancestor
  chips (father, mother) as `RelationChip`s, the range line, and `notes` as body
  text. This is the **only** place a female-only ancestor appears.
- Both respect the profile colour/calendar settings like the rest of the page.

---

## 8. GEDCOM

### 8.1 Representation, and why

The **relationship** rides the standard `ASSO` mechanism; only the **structured
metadata** is custom. On `/islamic-gedcom` this must be documented under
**standard** badges for `ASSO`/`RELA`/`ROLE`/`NOTE` and **custom** badges for
`_GAP_MIN`/`_GAP_MAX`/`_ANC_FAM`/`_ANCESTOR` — the same split the page already
uses (`src/app/islamic-gedcom/page.tsx:115` standard vs `:155` custom).

**The couple problem and its answer.** `ASSO` points at an `INDI` **only** — in
5.5.1 (the `RELA`→`SUBM` example on p.39 is the spec's own known defect) and in
7.0 (`g7:ASSO` payload is `@<XREF:INDI>@`). A `FAM` cannot be the ASSO target.
So:

> **Emit exactly ONE `ASSO` per jump, pointing at `family.husband ?? family.wife`,
> and carry the couple in a custom `2 _ANC_FAM @F…@` pointer beside it.**

This is lossless (the `FAM` record is exported anyway and holds both spouses),
unambiguous on import (no "which two ASSOs are the same couple?" re-assembly),
and degrades correctly: software that drops `_ANC_FAM` (Gramps drops all unknown
`_` tags) still sees a truthful `ancestor` association to the male ancestor, and
**nothing anywhere renders a false parent-child link** — the property we are
buying.

`RELA` must be **truncated to 25 characters** — `sanitizeLine`
(`exporter.ts:108-110`) strips `@` and newlines but does **not** truncate. Add:

```ts
/** GEDCOM 5.5.1 caps RELA at 25 characters. sanitizeLine does not truncate. */
const RELA_MAX_LENGTH = 25;
function sanitizeRela(value: string): string {
  return sanitizeLine(value).slice(0, RELA_MAX_LENGTH);
}
```

`ancestor` is 8 characters, lowercase (webtrees requires lowercase for its
translation lookup), so the guard never fires today — it exists so a future
editable `RELA` cannot produce an invalid file.

### 8.2 5.5.1 export

Emitted inside `emitIndividual` (`exporter.ts:225-335`), **after** the `FAMC`
line (`:325-327`) and before `_RADA_FAMC` (`:330-334`).

Single ancestor (only إسماعيل known):

```
0 @6f1c…-adnan@ INDI
1 NAME عدنان /قريش/
2 GIVN عدنان
2 SURN قريش
1 SEX M
1 FAMS @fam-adnan@
1 ASSO @a1b2…-ishmael@
2 RELA ancestor
2 _ANC_FAM @fam-ishmael@
2 _GAP_MIN 4
2 _GAP_MAX 40
2 NOTE قفزة نسب: عدنان من وَلَد إسماعيل بن إبراهيم عليهما السلام.
3 CONT عدد الأجيال بينهما: بين 4 و40.
3 CONT قيل سبعة، وقيل ثلاثون، وقيل أربعون.
```

Couple (إسماعيل × هاجر): **identical**, because the `FAM` record already carries
the wife and `_ANC_FAM` points at it:

```
0 @fam-ishmael@ FAM
1 HUSB @a1b2…-ishmael@
1 WIFE @c3d4…-hajar@
```

Female-only ancestor (only هاجر known): the single `ASSO` points at **her**,
everything else identical. `RELA ancestor` is sex-neutral, so no second value is
needed.

`0 TRLR` is unchanged. Emission rules:

- Omit `_GAP_MIN` / `_GAP_MAX` when null.
- The `NOTE` is emitted **always** (7.0 §1.5.3 requires the standard equivalent
  alongside an extension, and `NOTE` is the only thing that survives everywhere).
  First line is the fixed prose lead; a range line is appended when either bound
  is set; the user's own `notes` follow as further `CONT` lines. Use the existing
  `emitNote(lines, 2, text)` helper (`exporter.ts:116-122`) with `\n`-joined text.
- Skip the whole block when `ind._pointed` (borrowed), matching `:451`.
- Skip when `ind.isPrivate` — the private branch returns early at `:231-241`.
- **Also skip when either resolved spouse is private** (mirror of §6.1's
  fail-closed rule; the export is a data-out surface too).

### 8.3 7.0 export

`SCHMA` (built by `collectCustomTags`, `exporter.ts:183-219`, emitted at
`:438-447`). Add to `EXT_URIS` (`exporter.ts:19-27`):

```ts
  '_ANCESTOR': 'https://gynat.com/gedcom/ext/_ANCESTOR',
  '_GAP_MIN':  'https://gynat.com/gedcom/ext/_GAP_MIN',
  '_GAP_MAX':  'https://gynat.com/gedcom/ext/_GAP_MAX',
  '_ANC_FAM':  'https://gynat.com/gedcom/ext/_ANC_FAM',
```

and to `collectCustomTags`:

```ts
  if (data.ancestryJumps && Object.keys(data.ancestryJumps).length > 0) {
    tags.add('_ANCESTOR')
    tags.add('_ANC_FAM')
    for (const j of Object.values(data.ancestryJumps)) {
      if (j.generationsMin != null) tags.add('_GAP_MIN')
      if (j.generationsMax != null) tags.add('_GAP_MAX')
    }
  }
```

> `ROLE _ANCESTOR` is **spec-legal**, not a hack: 7.0 §1.5 permits extensions to
> "extend existing enumeration-type payloads with new permitted values", and §2.3
> says extension-tag payload values in an enumeration are always permitted with
> their URI defined by the schema. The `_ANCESTOR` doc page should state the
> correspondence to GEDCOM X's `http://gedcomx.org/AncestorDescendant`.

Output:

```
0 HEAD
1 GEDC
2 VERS 7.0
1 SOUR Gynat
2 VERS 1.0
2 NAME Gynat
1 DATE 22 SEP 2026
1 SCHMA
2 TAG _ANCESTOR https://gynat.com/gedcom/ext/_ANCESTOR
2 TAG _ANC_FAM https://gynat.com/gedcom/ext/_ANC_FAM
2 TAG _GAP_MIN https://gynat.com/gedcom/ext/_GAP_MIN
2 TAG _GAP_MAX https://gynat.com/gedcom/ext/_GAP_MAX
…
0 @6f1c…-adnan@ INDI
1 NAME عدنان /قريش/
1 SEX M
1 ASSO @a1b2…-ishmael@
2 ROLE _ANCESTOR
3 PHRASE قفزة نسب — عدد الأجيال بينهما غير محدد
2 _ANC_FAM @fam-ishmael@
2 _GAP_MIN 4
2 _GAP_MAX 40
2 NOTE قفزة نسب: عدنان من وَلَد إسماعيل بن إبراهيم عليهما السلام.
3 CONT عدد الأجيال بينهما: بين 4 و40.
```

`3 PHRASE` text: when a range is stated use
`قفزة نسب — بين {min} و{max} جيلاً`; when only one bound,
`قفزة نسب — لا تقل عن {min} أجيال` / `قفزة نسب — لا تزيد على {max} جيلاً`;
when neither, `قفزة نسب — عدد الأجيال بينهما غير محدد`. Run through
`sanitizeLine`.

### 8.4 Parser (`src/lib/gedcom/parser.ts`)

The parser's level-2 dispatch is keyed on `currentSubRecord` (set at
`parser.ts:164`), which makes `ASSO` slot in cleanly. Four additions:

**1. Level 1 on `INDI` (`parser.ts:167-213`)** — start a pending association:

```ts
} else if (tag === 'ASSO' && value) {
  pendingAsso = {
    target: value,             // '@id@'
    rela: null, role: null,
    ancFam: null, gapMin: null, gapMax: null, notes: '',
    ownerId: indi.id,
  };
}
```

`pendingAsso` is a module-scope-of-parse local (like `currentStandaloneNoteId`,
`parser.ts:69`). Starting a NEW level-1 tag, or a new level-0 record, **flushes**
the pending association (see 4).

**2. Level 2 when `currentSubRecord === 'ASSO'`:**

| tag | action |
|---|---|
| `RELA` | `pendingAsso.rela = (value ?? '').trim().toLowerCase()` |
| `ROLE` | `pendingAsso.role = (value ?? '').trim()` |
| `_ANC_FAM` | `pendingAsso.ancFam = value ?? null` |
| `_GAP_MIN` | `pendingAsso.gapMin = parsePositiveInt(value)` |
| `_GAP_MAX` | `pendingAsso.gapMax = parsePositiveInt(value)` |
| `NOTE` | `pendingAsso.notes = value ?? ''; currentLevel2Tag = 'NOTE'` |
| anything else | `currentLevel2Tag = tag` (ignored) |

**3. Level 3 `CONT`/`CONC` under `currentSubRecord === 'ASSO' && currentLevel2Tag === 'NOTE'`**
— append to `pendingAsso.notes`, mirroring `parser.ts:341-356`.

**4. Flush (`flushPendingAsso()`)** — called when the record/tag changes and at
end of file. **This is where unknown associations are ignored, not misread:**

```ts
const isJump =
  pendingAsso.rela === 'ancestor' ||           // 5.5.1
  pendingAsso.role === '_ANCESTOR';            // 7.0
if (!isJump) return;                           // ordinary ASSO — dropped silently
```

Then resolve the ancestor **family**, in this order:

1. `pendingAsso.ancFam` if present and it names a `FAM` in the file → use it;
2. else the first `FAMS` family of the ASSO'd individual → use it;
3. else `null` → **synthesize** a one-spouse `FAM` record in `families` whose
   husband (or wife, by the target's `SEX`) is the ASSO'd individual, and give
   the target a `FAMS` back-reference. This is the same shape
   `handleAddParentSubmit` mints (`usePersonActions.ts:530-542`), so nothing
   downstream can tell the difference.

Emit into `ancestryJumps` keyed by a synthetic id `@_ANCJ<n>@`:

```ts
const jump: AncestryJump = {
  id: jumpId, type: '_ANC_JUMP',
  descendant: pendingAsso.ownerId,
  ancestorFamily: resolvedFamilyId,
  generationsMin: pendingAsso.gapMin,
  generationsMax: pendingAsso.gapMax,
  notes: pendingAsso.notes,
};
```

and set `individuals[ownerId].ancestryJumpAsDescendant = jumpId` +
`families[resolvedFamilyId].ancestryJumpsAsAncestor` (push).

**Drop rules (silently, no throw):** owner already has a jump (first wins);
target individual not in the file; owner has a `FAMC` (rule J3 — an imported file
that contradicts the invariant loses the jump, never the parents).

Finally, extend the `GedcomData` assembly (`parser.ts:406-410`):

```ts
  if (Object.keys(ancestryJumps).length > 0) result.ancestryJumps = ancestryJumps;
```

Round-trip guarantee to test: `parseGedcom(gedcomDataToGedcom(d, v))` reproduces
`d.ancestryJumps` (modulo ids) for both versions, for single-ancestor and couple.

### 8.5 GEDCOM import route

`POST /api/workspaces/[id]/tree/import` delegates to
`seedTreeFromGedcomData` (`src/lib/tree/seed-helpers.ts:50`), which already
handles rada'a at steps 9–10 (`seed-helpers.ts:228-268`). Add **step 11**,
inside the same transaction, after families and rada'a exist:

```ts
    // 11. Ancestry jumps («قفزة نسب»)
    const jumpEntries = Object.values(gedcomData.ancestryJumps ?? {})
    if (jumpEntries.length > 0) {
      await tx.ancestryJump.createMany({
        data: jumpEntries
          .map((j) => ({
            id: randomUUID(),
            treeId,
            gedcomId: j.id,
            descendantId: individualGedcomToDbId[j.descendant],
            ancestorFamilyId: familyGedcomToDbId[j.ancestorFamily],
            generationsMin: j.generationsMin,
            generationsMax: j.generationsMax,
            notes: encryptFieldNullable(j.notes || null, workspaceKey),
          }))
          // drop any whose endpoints did not survive the id remap
          .filter((r) => r.descendantId && r.ancestorFamilyId),
      })
    }
```

Extend `SeedTreeResult` (`seed-helpers.ts:15-20`) with `ancestryJumpCount:
number` and surface it in the import response (`import/route.ts:109,122`) beside
`radaFamilyCount`.

### 8.6 `/islamic-gedcom` reference page

New `<section id="ancestry-jump">` in `src/app/islamic-gedcom/page.tsx`, placed
**after** `id="radaa"` (`page.tsx:291`) and before `_KUNYA` (`:420`).

- Title: **«قفزة نسب»**. Subtitle explains: a certain descent where the
  generations between are not recorded — **or simply not of interest**. Do not
  say "unknown names".
- Badges: `ASSO`, `RELA`, `ROLE`, `NOTE` → `styles.tagBadgeStandard`;
  `_ANCESTOR`, `_ANC_FAM`, `_GAP_MIN`, `_GAP_MAX` → `styles.tagBadgeCustom`.
- Content: the عدنان→إسماعيل worked example; both 5.5.1 and 7.0 snippets from
  §8.2/§8.3; the `SCHMA` block; the 25-char `RELA` limit; the "one ASSO +
  `_ANC_FAM` for the couple" rule and why `ASSO` cannot point at a `FAM`; what
  other software shows; the constraint that a jump requires no recorded parents.
- Scholarly framing: use **only** the sourced line
  **«الأمر عندنا الإمساك عمّا وراء عدنان إلى إسماعيل»**.
  **Do not use** «كذب النسابون» (graded موضوع), «إذا بلغ نسبي عدنان فأمسكوا»
  (unsourceable) or «لا ترفعوني فوق عدنان» (لا أصل له).
- Add the section to the page nav list and to the `/compatibility` section.

---

## 9. Audit, undo, cascade delete, deep copy, version hash

### 9.1 Audit (`src/lib/tree/audit.ts`)

```ts
export interface AncestryJumpSnapshot extends JsonObject {
  id: string;
  descendantId: string;
  ancestorFamilyId: string;
  generationsMin: number | null;
  generationsMax: number | null;
  notes: string | null;
}

export function snapshotAncestryJump(record: {
  id: string;
  descendantId: string;
  ancestorFamilyId: string;
  generationsMin?: number | null;
  generationsMax?: number | null;
  notes?: string | null;
}): AncestryJumpSnapshot {
  return {
    id: record.id,
    descendantId: record.descendantId,
    ancestorFamilyId: record.ancestorFamilyId,
    generationsMin: record.generationsMin ?? null,
    generationsMax: record.generationsMax ?? null,
    notes: record.notes ?? null,
  };
}
```

`AuditEntityType` (`audit.ts:260`) gains `'ancestry_jump'`;
`ENTITY_LABELS` (`audit.ts:262-271`) gains `ancestry_jump: 'قفزة نسب'`.
`buildAuditDescription` needs **no new `action` case** — `create`/`update`/`delete`
already produce «إضافة قفزة نسب» / «تعديل قفزة نسب» / «حذف قفزة نسب», and the
undo prefix «تراجع عن: » (`audit.ts:320`) composes correctly.

Also update, in lockstep:

| File | Line | Change |
|---|---|---|
| `src/lib/tree/audit-log-schemas.ts` | `AUDIT_ENTITY_TYPES` | add `'ancestry_jump'` |
| `src/components/tree/AuditLog/AuditLogEntry.tsx` | `ENTITY_LABELS:49-58` | add `ancestry_jump: 'قفزة نسب'` |
| `src/components/tree/AuditLog/AuditLogDiff.tsx` | `FIELD_LABELS:5` | `descendantId: 'الشخص'`, `ancestorFamilyId: 'الجدّ'`, `generationsMin: 'أقل عدد للأجيال'`, `generationsMax: 'أكثر عدد للأجيال'` |
| `src/components/tree/AuditLog/AuditLogDiff.tsx` | `ID_FIELDS:55-62` | add `'descendantId'`, `'ancestorFamilyId'` (raw UUIDs are not shown) |

Write sites: every route writes one `TreeEditLog` row inside the same
`Promise.all` as `touchTreeTimestamp`, with `encryptSnapshot(...)` envelopes and
`encryptAuditDescription('create'|'update'|'delete', 'ancestry_jump', null,
workspaceKey, { isUndo: isUndoRequest(request) })` — copy
`rada-families/route.ts:127-151` and `[radaFamilyId]/route.ts:114-130,177-191`
verbatim.

### 9.2 Undo (`src/lib/tree/undo-builders.ts`)

Two new builders, mirroring the rada'a trio (`undo-builders.ts:298-366`):

```ts
export interface CreateAncestryJumpInverseParams {
  workspaceId: string;
  createdId: string;
  createPayload: Record<string, unknown>;
  treeId?: string;
}
export function buildCreateAncestryJumpInverse(p): Inverse;   // undo: DELETE, redo: POST

export interface DeleteAncestryJumpInverseParams {
  workspaceId: string;
  deletedId: string;
  snapshot: Record<string, unknown>;
  treeId?: string;
}
export function buildDeleteAncestryJumpInverse(p): Inverse;   // undo: POST, redo: DELETE

export interface UpdateAncestryJumpInverseParams {
  workspaceId: string; jumpId: string;
  before: Record<string, unknown>; after: Record<string, unknown>;
  treeId?: string;
}
export function buildUpdateAncestryJumpInverse(p): Inverse;   // PATCH ⇄ PATCH
```

Base path `/api/workspaces/${workspaceId}/tree/ancestry-jumps`. Reuse the
existing `postJson`/`patchJson`/`del` helpers (`:37-72`) so `withTreeId`
(`:32-35`) and the `isUndo: true` header are applied automatically.

**The «شخص جديد» composite.** Creating a jump to a brand-new person is three
calls (create individual → create family → create jump). Push **one** undo entry
with a hand-rolled inverse, exactly as `handleAddParentSubmit` already does
(`usePersonActions.ts:547-620`): undo reverses jump → family → individual; redo
replays individual → family → jump, re-capturing the new ids. The «شخص موجود»
path is a single `buildCreateAncestryJumpInverse`.

Undo labels: add to the `UndoAction` union in `src/lib/tree/undo-label.ts`
(`buildUndoLabel` at `:44`) a `{ kind: 'addAncestryJump'; name: string }` case
producing «قفزة نسب إلى {name}».

### 9.3 Cascade delete

**No code change to `computeDeleteImpact` (`src/lib/tree/cascade-delete.ts:70-218`).**
Its BFS walks only `familiesAsSpouse` (`:148`) and `familyAsChild` (`:172`); it
has no jump awareness, which is exactly the required behavior — **a jump ancestor
is a claim, not a dependent**, and traversing would sweep an entire apex lineage
into a delete. The seed step (`:108-110`) treats a jump descendant as a root
candidate because `familyAsChild` is still null — also correct.

This must be **locked by a regression test**, plus a comment at `:91` recording
the rule, because the natural instinct of a future reader is "jumps are ancestry,
add them here".

`computeVersionHash(lastModifiedAt)` (`cascade-delete.ts:229-231`) is derived
from `FamilyTree.lastModifiedAt`, and every jump mutation calls
`touchTreeTimestamp` — **jumps are already inside the version hash, no change
needed**. Add a test asserting that creating a jump changes the version hash
returned by `GET .../delete-impact`.

### 9.4 Deep copy (`src/lib/tree/branch-pointer-deep-copy.ts`)

`DeepCopyResult` (`:35-47`) gains:

```ts
  /** Copied jumps keyed by new UUID. Copied ONLY when BOTH endpoints survive. */
  ancestryJumps: Record<string, AncestryJump>;
```

In `prepareDeepCopy` (`:81`), after individuals and families are remapped:

```ts
  // A jump is copied ONLY when its descendant AND its ancestor family both
  // landed in the copied set. Dangling jumps are dropped — a half-copied jump
  // would point at a family that does not exist in the target workspace.
  for (const jump of Object.values(source.ancestryJumps ?? {})) {
    const newDescendant = idMap.get(jump.descendant);
    const newFamily = idMap.get(jump.ancestorFamily);
    if (!newDescendant || !newFamily) continue;
    const newId = crypto.randomUUID();
    ancestryJumps[newId] = { ...jump, id: newId, descendant: newDescendant, ancestorFamily: newFamily };
  }
```

`persistDeepCopy` (`:277`) writes them with `tx.ancestryJump.createMany`,
re-encrypting `notes` under the **target** workspace key (same treatment the
individual/family fields get).

In practice `extractSubtree` (`graph.ts:412-485`) is downward-only, so a jump
ancestor sitting **above** the copied root is never in the set and the jump is
dropped — fail-closed, and a test must assert exactly that.

**⚠️ Stale back-reference bug — both copiers.** `prepareDeepCopy` and
`prepareTreeSnapshot` (`src/lib/collections/copy.ts:28-68`) build the copy by
spreading the source record (`copy.ts:37`, `:55`) and then deleting the fields
that must not travel (`copy.ts:44-47`, `:63-64`). The new
`ancestryJumpAsDescendant` / `ancestryJumpsAsAncestor` back-references would be
spread through **carrying the OLD jump ids**. Both functions must either remap
them to the new jump ids or `delete` them — **delete** is correct, because
`dbTreeToGedcomData` regenerates back-references from the persisted rows on the
next read. Add to both:

```ts
  delete copied.ancestryJumpAsDescendant;   // individuals
  delete copied.ancestryJumpsAsAncestor;    // families
```

**Collections copy paths.** `copyTreeIntoNewExtraTree` (`copy.ts:80-121`) copies
a WHOLE tree via `prepareTreeSnapshot`, so both endpoints always survive and
jumps must be copied; `copyBorrowedBranchIntoNewExtraTree`
(`copy-borrowed.ts:75`) copies a branch, so the both-endpoints rule applies and a
jump above the branch root is dropped. `prepareTreeSnapshot` currently returns
`{ individuals, families, idMap, stitchFamily: null, reuseStitch: null }`
(`copy.ts:68`) and does **not** copy `radaFamilies` — that is a **pre-existing
gap, out of scope here**; do not fix it in this work, but do add
`ancestryJumps` to the returned `DeepCopyResult` so the new feature does not
inherit the same hole.

---

## 10. Canvas (design sketch — chunk 4)

### 10.1 The key simplification

`getLayoutedElements` (`src/components/tree/FamilyTree/layout.ts:49-…`) derives
its parent→children map **from the `edges` array** (`layout.ts:85-102`), not from
`Family` records, and finds the root as "the node with no incoming edge"
(`layout.ts:105`). Therefore:

> **Adding one extra edge from the ancestor node to the jump descendant makes the
> contour-packing layout position the jump ancestor above the descendant with
> zero changes to `layout.ts`.**

That is the whole canvas story. The ancestor renders as an **ordinary person
card** (with his spouse in the usual spouse row, from the same `Family`), and his
real children render as ordinary siblings of the jump descendant — which is
genealogically correct: they are the descendant's distant uncles.

### 10.2 What changes

1. **Root resolution.** `FamilyTree` resolves the canvas root with
   `findTopmostAncestor(data, rootId, { includeJumps: true })` so opening the
   tree on عدنان shows إسماعيل above him.
2. **Visible set.** `getTreeVisibleIndividuals` / `getCanvasVisibleIndividuals`
   are called with `{ includeJumps: true }` on the canvas (and only there).
3. **Edge build.** For every jump in `data.ancestryJumps` where both the
   ancestor-family node and the descendant node are on screen, push:

```ts
{
  id: `jump-${jump.id}`,
  source: ancestorPersonNodeId,          // family.husband ?? family.wife
  target: jump.descendant,
  type: 'ancestryJump',
  data: { generationsMin: jump.generationsMin, generationsMax: jump.generationsMax },
}
```

4. **Edge styling — no custom edge component.** `FamilyTree.tsx` registers
   `nodeTypes` (`:398,:791`) but **no `edgeTypes`**: every edge in `buildTreeData`
   is a built-in React Flow type carrying `style` + `className`
   (`buildTreeData.ts:632-643` for parent edges, `:127-134` for occurrence
   links). Follow that convention:

```ts
{
  id: `jump-${jump.id}`,
  source: ancestorPersonNodeId,
  target: jump.descendant,
  type: 'bezier',
  className: 'ancestry-jump',
  label: jumpLabel(jump),            // «قفزة نسب» / «قفزة نسب · بين 4 و40 جيلاً»
  style: { stroke: edgeColor, strokeWidth: 1.6, opacity: 0.6, strokeDasharray: '7 6' },
  selectable: false,
  focusable: false,
  pathOptions: { borderRadius: 8 },
}
```

   with the chip look (pill background, border, RTL font) defined in
   `src/styles/tree-global.css`, which already targets React Flow classes —
   `.react-flow__edge.ancestry-jump .react-flow__edge-textbg` /
   `-text`. Plain Western digits in the label («بين 4 و40 جيلاً»), matching the
   rest of the app. No range stated ⇒ the label is just «قفزة نسب».
   The dashed convention is free to take: elsewhere in the industry dashed means
   adoptive/foster parentage, and gynat has no adoption feature.
5. **Colour** — reuse the same `edgeColor` the sibling parent edges already
   compute in `buildTreeData`, so the jump edge follows the user's tree colour
   settings for free. No new token.

### 10.3 What does NOT change

`layout.ts` (no algorithm change), `computeGraftDescriptors`, `PersonCard`,
`CoupleRow`. The jump ancestor's card is an ordinary `PersonCard`; the only new
visual is the dashed edge + chip.

### 10.4 UI entry point (chunk 4)

On a person with **no parents**, the person action menu gains **«قفزة نسب»**
(alongside «إضافة أب/أم»). It opens a two-path sheet:

- **«شخص جديد»** → the existing `IndividualForm` (surname prefilled per
  `getSurnamePrefill`), then behind the scenes: create individual → create family
  → create jump; one composite undo entry (§9.2).
- **«شخص موجود في الشجرة»** → a person picker restricted to individuals in the
  same tree that pass `validateAncestryJump` (no cycle, not self). On pick: if
  the chosen person already has families, show the existing `FamilyPickerModal`
  (`getFamiliesForPicker`) to choose which couple; if they have none, mint a
  one-spouse family silently.
- Both paths then show the optional range inputs («من» / «إلى», both optional)
  and a notes field, and a preview line of the resulting nasab
  («… بن عدنان، من وَلَد إسماعيل»).

Action is hidden when `!canEdit`, when the person is `_pointed` (borrowed), and
when the person already has a jump (replaced by «تعديل قفزة النسب» / «حذف»).

---

## 11. Build plan — 6 TDD chunks

Each chunk is red-first. `pnpm test` after every chunk; `npx tsc --noEmit` to
type-check (never `pnpm build` while `pnpm dev` runs). Restart `pnpm dev` after
chunk 1's migration (stale Prisma client).

### Chunk 1 — model + API + validators + audit + undo builders

Scope: §1, §2 (types + `buildJumpIndex`), §3 (mapper, `TREE_INCLUDES`, member
redaction), §4 (schemas, validators, three routes), §5.4 (`pruneEmptyAncestryJumps`),
§9.1 (audit), §9.2 (undo builders only — no UI).

New tests:
- `src/test/ancestry-jump-validators.test.ts` — J1…J8, `ignoreJumpId`, a
  three-hop cycle through an existing jump, female-only ancestor family is valid,
  empty family rejected, range ordering.
- `src/test/ancestry-jump-api.test.ts` — POST/PATCH/DELETE happy paths;
  `treeId`-scoping 404 for a foreign tree id; 409 on second jump for the same
  person (both the pre-check and a simulated `P2002`); 400 on a cycle; auth 403
  for a viewer; rate-limit 429; `touchTreeTimestamp` called; one `TreeEditLog`
  row written with `entityType: 'ancestry_jump'`; POST response carries plaintext
  `notes`, never bytes. (Model on `src/test/rada-family-api.test.ts`.)
- `src/test/ancestry-jump-mapper.test.ts` — `dbTreeToGedcomData` emits
  `ancestryJumps` + both back-references; a dangling jump leaves no
  back-reference and breaks nothing; `notes` round-trips through encryption;
  `redactPrivateIndividuals` passes jumps through untouched.
- `src/test/ancestry-jump-audit.test.ts` — snapshot shape; Arabic descriptions
  for create/update/delete; undo prefix.
- `src/test/ancestry-jump-undo.test.ts` — builder URLs/methods/bodies, `treeId`
  propagation. (Model on `src/test/use-undoable-action.test.ts`.)

Existing tests that must still pass unchanged: everything.

### Chunk 2 — graph, roots, nasab, person page

Scope: §5.1, §5.2, §5.3, §7.

New tests:
- `src/test/ancestry-jump-graph.test.ts` — **every helper with `includeJumps`
  defaulted OFF returns exactly today's result on jump-bearing data** (the
  fail-closed guarantee), and the opted-in variant crosses the jump;
  `calculateDescendantCounts` unchanged when off; `findTopmostAncestor` climbs a
  jump only when on.
- `src/test/ancestry-jump-nasab.test.ts` — the §5.3 behaviour table, including
  **the surname pitfall**: عدنان's line must NOT inherit إسماعيل's surname.
- `src/test/ancestry-jump-roots.test.ts` — a jump descendant is not a
  `findDefaultRoot` true root; the apex ancestor wins on descendant count; a
  jump-free tree picks the same root as before.
- `src/test/person-projection-ancestry-jump.test.ts` — the spine emits a
  `jump`-marked chip and continues up the ancestor's own chain; a **private**
  jump ancestor becomes an id-less «خاص» placeholder; a **boundary** jump
  ancestor is emitted but never climbed past; the female-only case yields an
  empty spine token but a populated `projection.ancestryJump.mother`;
  `PROJECTION_ETAG_VERSION` is `'v4'`.
- `src/test/person-page-ancestry-jump.test.tsx` — `NasabRibbon` renders the
  divider and the range; `AncestryJumpBlock` renders both ancestors.

Existing tests to re-run explicitly: `display.test.ts`,
`person-projection*.test.ts`, anything calling `graph.ts`.

### Chunk 3 — GEDCOM export / import / reference page

Scope: §8.

New tests:
- `src/test/ancestry-jump-exporter.test.ts` — 5.5.1 single-ancestor and couple;
  7.0 with `SCHMA`; `_GAP_MIN`/`_GAP_MAX` omitted when null; the `NOTE` always
  present; `RELA` truncation at 25 chars; `_pointed` and private individuals emit
  nothing; a jump whose ancestor spouse is private emits nothing.
- `src/test/ancestry-jump-parser.test.ts` — import both versions; `_ANC_FAM`
  binding; the `FAMS` fallback; the synthesized one-spouse family fallback; an
  `ASSO` with an **unrecognised** `RELA` is ignored (not misread as a jump); a
  second jump for the same person is dropped; a jump on a person who also has
  `FAMC` is dropped.
- `src/test/ancestry-jump-roundtrip.test.ts` —
  `parseGedcom(gedcomDataToGedcom(d, '5.5.1'))` and `'7.0'` both reproduce the
  jumps.
- `src/test/ancestry-jump-import-api.test.ts` — `seedTreeFromGedcomData` persists
  jumps with remapped ids and returns `ancestryJumpCount`.
- Fixture: `src/test/fixtures/ancestry-jump.ged` (a small عدنان ⇢ إسماعيل tree).

Existing: `gedcom-exporter.test.ts`, `parser.test.ts`,
`parser-islamic-extensions.test.ts`, `tree-export-*.test.ts` must all still pass.

### Chunk 4 — canvas

Scope: §10.

New tests:
- `src/test/ancestry-jump-canvas.test.tsx` — a jump produces exactly one edge
  with `id: 'jump-<jumpId>'`, `className: 'ancestry-jump'` and the right
  source/target; `getLayoutedElements` places the ancestor one `VERTICAL_GAP`
  above the descendant with **no change to `layout.ts`**; the ancestor's own
  children render as siblings of the jump descendant; the label shows the range
  when set and only «قفزة نسب» when not.
- `src/test/ancestry-jump-actions.test.tsx` — the action is hidden for a viewer,
  for a `_pointed` person and for a person with parents; the «شخص جديد» path
  pushes exactly ONE undo entry; the «شخص موجود» path shows the family picker
  only when the chosen person has ≥1 family.

### Chunk 5 — public-tree safety

Scope: §6.

New tests:
- `src/test/ancestry-jump-public-redaction.test.ts` — the four §6.1 cases; the
  dropped-jump back-reference is cleared; `notes` survive on a fully public jump.
- `src/test/ancestry-jump-jsonld.test.ts` — a jump emits `relatedTo` **and never**
  `parent`/`children`/`spouse`/`sibling`; nodes are name+gender only (no dates,
  no range, no notes); nothing is emitted when `indexable` is false; nothing when
  a spouse is redacted.
- `src/test/ancestry-jump-cascade-delete.test.ts` — the BFS does **not** sweep a
  jump ancestor or his lineage; deleting the descendant removes only the jump
  row; deleting the last ancestor individual triggers `pruneEmptyAncestryJumps`;
  creating a jump changes the `delete-impact` version hash.
- `src/test/ancestry-jump-deep-copy.test.ts` — both-endpoints rule; a jump above
  an `extractSubtree` root is dropped; `copyTreeIntoNewExtraTree` carries jumps;
  `copyBorrowedBranchIntoNewExtraTree` drops a dangling one.

### Chunk 6 — end-to-end against real infrastructure

Per CLAUDE.md, mocked unit tests are **not sufficient**. Use the `e2e-test`
skill: throwaway user + workspace + fixture via the real API (GoTrue/Kong/
Postgres), headless Playwright against `http://localhost:4000`, then tear down.

Must prove, in the real app:
1. add a jump via «شخص جديد» → the dashed edge + «قفزة نسب» chip appear on the
   canvas after a refresh (DB round-trip, not optimistic state);
2. the nasab on the person page reads «… عدنان، من وَلَد إسماعيل …» and the
   family's surname is **unchanged**;
3. Ctrl+Z removes the jump *and* the created person/family; Ctrl+Y restores;
4. GEDCOM export (5.5.1 and 7.0) downloads and contains the `ASSO`/`RELA`/
   `_ANC_FAM` block; re-importing it into an empty workspace reproduces the jump;
5. publishing the tree public and fetching `/family/{slug}` + the public person
   page shows the jump; marking the ancestor private and re-fetching shows it
   **gone**, with no `relatedTo` in the JSON-LD;
6. the audit log page shows «إضافة قفزة نسب» with a readable diff.

---

## 12. Decisions summary (for the record)

| # | Decision | Why |
|---|---|---|
| 1 | Target is **always a `Family`** (`ancestorFamilyId`, NOT NULL), never an individual column | `handleAddParentSubmit` already represents "one known parent" as a one-spouse Family; mirrors `familyAsChild`; the female-only rule falls out as `family.husband ?? null` |
| 2 | One jump per descendant (`@@unique([treeId, descendantId])`) + route pre-check + `P2002` backstop | owner rule; a race must not 500 |
| 3 | PATCH changes **range + notes only**; re-pointing is delete + create | keeps cycle/one-per-person invariants trivially checkable and undo single-row |
| 4 | `includeJumps` defaults **false** everywhere | fail-closed: code that forgets simply doesn't see the edge; worst case is a missing link, never a false parent claim |
| 5 | `findDefaultRoot` excludes jump descendants **unconditionally** | otherwise عدنان stays a "true root" with إسماعيل drawn above him |
| 6 | Surname source **freezes at the jump** in `getDisplayNameWithNasab` | `display.ts:93` takes the surname from the last person in the chain — naively this stamps the whole family with the apex ancestor's surname |
| 7 | GEDCOM: **one `ASSO`** → `husband ?? wife`, couple carried by `2 _ANC_FAM @F…@` | `ASSO` may point at an `INDI` only in BOTH 5.5.1 and 7.0; the `FAM` record already carries the couple, so this is lossless and needs no import-time re-assembly |
| 8 | Parser ignores any `ASSO` whose `RELA`/`ROLE` is not `ancestor`/`_ANCESTOR` | never misread a foreign association as a lineage claim |
| 9 | Public: jump dropped when the descendant **or ANY ancestor spouse** is redacted | fail-closed; a half-drawn couple is a structural oracle |
| 10 | JSON-LD emits `relatedTo` only — never `parent`/`children` | owner ruling; schema.org has no "ancestor", and a `parent` edge would publish false precision into the knowledge graph |
| 11 | `computeDeleteImpact` is **unchanged**; locked by a regression test | a jump ancestor is a claim, not a dependent |
| 12 | `computeVersionHash` needs **no change** | it is `lastModifiedAt`-derived and every jump mutation calls `touchTreeTimestamp` |
| 13 | Canvas needs **no `layout.ts` change** | `getLayoutedElements` derives its tree from the `edges` array, so one extra dashed edge positions the ancestor for free |
| 14 | **No workspace feature toggle** | owner ruling; unrequested scope |
