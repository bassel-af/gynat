# Goal: ship v1 of «المصادر» (Sources) — shared-source model

Temporary working doc and the **single source of truth** for Sources v1. Delete it once v1 has shipped and CLAUDE.md, docs/implementation.md and docs/prd.md are updated.

Every person can carry evidence: a text reference and/or files (scan, photo, PDF). One document (a Syrian دفتر العائلة, an إخراج قيد) often backs many people, so **one source can be attached to many people**. Build tests-first, per CLAUDE.md.

- Decisions are **LOCKED** (memory `project_sources_decisions.md`, Update 5 onward; approved UI copy = the 2026-09-25 design page «دفتر واحد لكل العائلة»). Don't reopen them.
- `docs/sources-shared-design.md` holds the three designs and the review. `docs/sources-design-notes.md` holds the security threat model (its rules still apply; its library/types/«الموضع» model does not). **This doc wins on any conflict.**
- Steps 1–7 of the old per-person model are built and committed (`35dad95..5b8d88a`). This doc specifies the **rework** of that code plus step 8.

---

## 1. The model

- A **source** = free text + files + ONE visibility level, attached to **many people** through the line «مصدر لـ:».
- The one-person case feels exactly as before: a passport never touches the «مصدر لـ» line.
- Links are **explicit**: quick buttons materialise a list of people at pick time. Coverage is never computed later (a child added in 2030 is not silently "proven" by a 1974 دفتر).
- A book cited at different pages per person = **one source per person** (no page field). Text suggestions make re-typing fast.
- A source with **zero people** can exist (kept after removing its last person). It is not tree-wide: tree-wide is an explicit flag (`isTreeWide`), never inferred from zero links.
- The **tree-wide source** («مصدر الشجرة») is unchanged: one per tree, no people, shown as «من مصدر الشجرة» on anyone with no own visible source.

---

## 2. What the user gets (exact Arabic copy)

### 2.1 Add / edit form (`SourceEntryForm`)
Fields top to bottom: «المصدر» (text) · «ملفات» · **«مصدر لـ:»** (new) · «من يرى هذا المصدر؟» · «حفظ» / «إلغاء».

«مصدر لـ:» line:
- The starting person (the one whose page opened the form) is a locked chip: «{الاسم} · أضفته من صفحته». No ×, never removable — in the form, in the picker, and by quick buttons.
- In the new-person form (add child/spouse/parent) the locked chip reads «هذا الشخص (جديد)».
- Other people: chips with ×. More than 4 chips collapse to «و{N} آخرون ▾» (expands inline).
- Link: «＋ أشخاص آخرون» opens the picker.

Edit mode, source with more than one person (counts are viewer-visible people, §4):
- Banner at the top: «هذا المصدر لـ {N} أشخاص. أي تعديل هنا يظهر عندهم جميعًا.»
- When text, files or level changed: the save button reads «حفظ عند {N} أشخاص». Changing only the people keeps «حفظ».
- Number wording everywhere comes from one helper `peopleCountLabel(n)`: 1 «شخص واحد», 2 «شخصين», 3–10 «{n} أشخاص», 11+ «{n} شخصًا» (e.g. «حفظ عند شخصين», «هذا المصدر لـ ١١ شخصًا»).

Level-3 files warning (level 3 selected and the source has files):
- One person: unchanged — «تأكد أن الملفات لا تحوي بيانات شخصية لأحياء (رقم هوية، صورة، عنوان)».
- More than one person: «هذا المصدر لـ {N} أشخاص، ويظهر على الأشخاص الظاهرين في الشجرة المنشورة ({S} من {N}). تأكد أن الملفات لا تحوي بيانات شخصية لأحياء.» — S = linked people passing `isShownOnPublicTree` (§5.3). *(The design gave this sentence with a leading «…»; the opening clause above fills it — confirm with the owner at review.)*

### 2.2 People picker (`SourcePeoplePicker`, bottom sheet at 390px, title «اختيار الأشخاص»)
- **Quick buttons** (only groups that exist, from `getPersonRelationships` on the starting person; toggles, `aria-pressed` when every member is selected; pressing again unselects all but the locked person):
  - From a man: «الزوجة: {الاسم}» (one per wife) · «الأبناء ({N})» · «الأسرة كلها ({N})». Polygamy: one «الزوجة: …» per wife; «الأبناء» and «الأسرة كلها» cover all couples.
  - From a woman: «الزوج: {الاسم}» · «الأبناء ({N})» · «الأسرة كلها ({N})».
  - From a child (no spouse/children): «الوالدان» · «الإخوة ({N})» · «الأسرة كلها ({N})».
  - «الأبناء والأحفاد» is NOT in v1 (not in the approved design).
- **Search** «ابحث باسم أو نسب…»: anyone in the SAME tree (client-side over the loaded `GedcomData`, `matchesSearch`).
- **Row**: line 1 = name + 2-generation nasab + family name (`getDisplayNameWithNasab(p, data, 2)` + surname). Line 2 (muted) = «{صلة القرابة} · مواليد {هجري}هـ ({ميلادي}م)». Only one calendar known → only it; no birth date → no birth part; no relation → no relation part; both missing → no line 2.
- Relation label: new pure `relationLabel(fromId, toId, data)` returning one of الأب/الأم/الزوج/الزوجة/ابن/ابنة/الأخ/الأخت/الجد/الجدة/حفيد/حفيدة/العم/العمة/الخال/الخالة/ابن العم/ابنة العم/ابن الأخ/ابنة الأخ, else `null`.
- The locked row: checked + disabled, with «أضفت المصدر من صفحته».
- Borrowed-branch people (`_pointed`): shown in search, not selectable: «من فرع مربوط من مساحة أخرى · لا يمكن إضافته».
- **Private people are not offered** (search or quick buttons) to anyone: the tree payload shows them as «خاص» even to admins, so they can't be told apart. Quick-button counts exclude them. An admin attaches a source to a private person from that person's own panel (where they are the locked person). *(Decision — see Report.)*
- Footer: count («شخص واحد محدد» / «شخصان محددان» / «{N} أشخاص محددين» (3–10) / «{N} شخصًا محددًا» (11+)) and «تم». «تم» only fills the form's line; **nothing is saved until the form's «حفظ»**.

### 2.3 Reuse (no re-upload)
- **Typing suggestions** under «المصدر» list existing sources of this tree:
  - Shared or with files: «📎 {النص} · مصدر لـ {N} أشخاص · {M} ملفات» (or «· نص فقط»), actions [ربطه بهذا الشخص] [نسخ النص فقط] and «عرض».
  - One-person text source (the book case): «{اسم الشخص}: {النص}», picking it = «نسخ النص فقط».
- **Family hint** on a person with no sources whose household (parents, spouses, siblings, children) shares a source: «مصادر أسرته:» / «مصادر أسرتها:» then up to 2 rows «{النص} · مصدر لـ {N} أشخاص» with «عرض» and «إضافة». «إضافة» stages a link (the sidebar hint saves immediately as its own action — it is not inside a form with a save button).
- **Preview** («عرض»), title «معاينة المصدر», tag «للقراءة فقط»: full text; thumbnails (click → `SourceLightbox`, hint «اضغط على أي صورة لفتحها في العارض بملء الشاشة.»); «من يرى هذا المصدر: {level}»; «مصدر لـ: {names}» (privacy-filtered, §4); buttons [ربطه بهذا الشخص] [رجوع]. A text-only source shows the text only. The preview is optional; direct buttons work without it.

### 2.4 On each person (sidebar `PersonSourcesSection`, member `PersonSourcesCard`)
- Row as today (text, 32px thumbs, level badge «للمشرفين» on level 1), plus a green tag «مشترك مع {K} آخرين» when K ≥ 1 visible other people (K=1 «مشترك مع شخص آخر», K=2 «مشترك مع شخصين آخرين»).
- Row menu «⋯» (editors): «تعديل» · «إزالته عن {الاسم} فقط» · «حذف المصدر من الجميع ({N})» (N = 1 → «حذف المصدر»).
  - Delete-from-all confirm: «سيُحذف المصدر وملفاته من {N} أشخاص.» [نعم، احذف] [إلغاء]. One person: the existing confirm.
- Member person page card: same tag, no names list. Public pages: **never** the tag, names or counts.

### 2.5 Removing the last person
Triggered by «إزالته عن … فقط» or × on the admin page when it is the source's last person (never by the form: the locked person stays). Dialog:
> **هذا آخر شخص لهذا المصدر**
> ماذا تريد أن تفعل بالمصدر وملفاته؟
> [حذف المصدر وملفاته] [إبقاؤه في صفحة المصادر]

✕ / Escape = cancel (nothing changes). Kept sources appear on the admin page under «ليس مصدرًا لأحد».

### 2.6 Deleting a person (decided here)
- **The person's sources are kept, never deleted with them.** Links cascade; a source whose last person was deleted becomes «ليس مصدرًا لأحد».
- The delete confirm line «ملفات مصادره لا تعود عند التراجع عن الحذف.» is replaced (admins, when ≥1 of the person's sources has no other person) by: «المصادر التي ليست لغيره تبقى في صفحة «المصادر» تحت «ليس مصدرًا لأحد».»
- Undo of the person delete re-links every source that still exists — **text and files come back** (the old model lost files).
- Cascade delete: same (kept, not undoable, no dialog change).
- Why: files are never undoable, so silent deletion loses scans for good; asking inside the delete dialog needs a new impact query for cascade. Keeping is the simpler, lossless option.

### 2.7 Admin «المصادر» page (`/workspaces/[slug]/tree/sources`)
- **One row per source.** Tabs: «الكل ({N})» · «مشترك ({N})» (≥ 2 people) · «ليس مصدرًا لأحد ({N})». Level filter and text search as today.
- Columns: «المصدر» · «مصدر لـ» · «ملفات» · «من يراه».
- «مصدر لـ»: «{أ}، {ب} و{N} آخرون ▾» → expands to every name, each with × (last one → dialog §2.5), plus «＋ إضافة أشخاص» (picker, search only, no locked person).
- Orphan rows show «ليس مصدرًا لأحد» with [ربط بأشخاص] [حذف].
- Bulk «تحديد الكل» / change level / delete work **per source** (delete confirm counts sources). Admin-page actions are not undoable (as built).
- Tree-wide source card (`TreeSourceCard`): unchanged.

### 2.8 Publish flow step
- Unchanged question (كلها / لا شيء / أختار بنفسي) over sources at levels 1–2.
- The already-public line gains the people count: «و{٣ مصادر} (تظهر على {٤٢ شخصًا}) يظهر لهم أصلًا». People = distinct linked people passing `isShownOnPublicTree`.

### 2.9 Unchanged from v1
Files (JPEG/PNG/WebP/PDF, 8 MB, 20 per source, magic bytes, sharp re-encode, PDF active-content reject, encrypted bytes table, `no-store`/`nosniff`/`CSP: sandbox`/`CORP` headers, quota, upload limiter, staged-upload sweep); the 3 levels + live status line; mobile sheet rules; GEDCOM import skip report; IndividualForm staging (nothing saved before «حفظ»).

---

## 3. Data model

### 3.1 Prisma (`prisma/schema.prisma`)
Keep the model/table names `SourceEntry` / `source_entries` (a "source" in product terms) — renaming buys nothing and would touch ~40 files. *(Decision — see Report.)*

```prisma
model SourceEntry {
  id          String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  treeId      String           @map("tree_id") @db.Uuid
  /// «مصدر الشجرة». Never inferred from having no links.
  isTreeWide  Boolean          @default(false) @map("is_tree_wide")
  visibility  SourceVisibility @default(admins)
  text        Bytes?
  createdById String?          @map("created_by") @db.Uuid
  createdAt   DateTime         @default(now()) @map("created_at")
  updatedAt   DateTime         @updatedAt @map("updated_at")
  tree      FamilyTree   @relation(fields: [treeId], references: [id], onDelete: Cascade)
  createdBy User?        @relation("SourceEntryCreator", fields: [createdById], references: [id])
  files     SourceFile[]
  links     SourceLink[]
  @@index([treeId])
  @@map("source_entries")
}

/// One person a source is «مصدر لـ». Same tree as the source (app-enforced).
model SourceLink {
  sourceId     String   @map("source_id") @db.Uuid
  individualId String   @map("individual_id") @db.Uuid
  treeId       String   @map("tree_id") @db.Uuid
  createdById  String?  @map("created_by") @db.Uuid
  createdAt    DateTime @default(now()) @map("created_at")
  source     SourceEntry @relation(fields: [sourceId], references: [id], onDelete: Cascade)
  individual Individual  @relation(fields: [individualId], references: [id], onDelete: Cascade)
  tree       FamilyTree  @relation(fields: [treeId], references: [id], onDelete: Cascade)
  createdBy  User?       @relation("SourceLinkCreator", fields: [createdById], references: [id], onDelete: SetNull)
  @@id([sourceId, individualId])
  @@index([individualId])
  @@index([treeId])
  @@map("source_links")
}
```
`SourceFile` (`entryId` = source id) and `SourceFileData`: unchanged. Back-relations: `Individual.sourceLinks`, `FamilyTree.sourceLinks`, `User.sourceLinksCreated`; remove `Individual.sourceEntries`.

Hand-added (document in schema comments, as today):
- `CREATE UNIQUE INDEX source_entries_one_tree_wide_per_tree ON source_entries(tree_id) WHERE is_tree_wide;`
- App-enforced (tested): a tree-wide source has no links; every link's person and source are in the link's `tree_id`.

### 3.2 Migration — NEW migration, don't amend
`prisma/migrations/20260927120000_shared_sources/migration.sql` (generate with `migrate diff`, then **hand-edit** so data is preserved; apply with `migrate deploy`):
1. `ALTER TABLE source_entries ADD COLUMN is_tree_wide boolean NOT NULL DEFAULT false;` then `UPDATE … SET is_tree_wide = true WHERE individual_id IS NULL;`
2. `CREATE TABLE source_links` (+ PK, indexes, 4 FKs as above).
3. Backfill: `INSERT INTO source_links (source_id, individual_id, tree_id, created_by, created_at) SELECT id, individual_id, tree_id, created_by, created_at FROM source_entries WHERE individual_id IS NOT NULL;` (1 entry → 1 source + 1 link).
4. Drop `source_entries_one_tree_wide_per_tree`, `source_entries_tree_id_individual_id_idx`, the `individual_id` FK and column; create `source_entries_tree_id_idx` and the new partial unique index.

Why new, not amended: the local dev DB has both source migrations applied with test data. Amending changes checksums (`migrate deploy` refuses) and forces a manual drop that loses the data. Prod has no source tables, so it runs all three in order in one deploy. Test: a DB-level check (script or e2e) that row counts match before/after on the local DB.

---

## 4. Visibility gate — per (source, person)

`src/lib/tree/source-visibility.ts` stays the ONE gate. Pure, fail-closed.

| Function | Rule |
|---|---|
| `canViewSourceEntry(source, person, viewer)` | unchanged truth table; `person` = one linked person's context, or `null` only when `source.isTreeWide` |
| `visibleLinkedPeople(source, people[], viewer)` **new** | the linked people on whom this viewer may see this source. The ONLY input for names, counts and «مشترك مع» |
| `canViewSourceAnywhere(source, people[], viewer)` **new** | admin: always (incl. orphans). Others: tree-wide gate, or `visibleLinkedPeople` non-empty. Used by the member file route, preview, suggestions |
| `inheritedTreeEntry(...)` | unchanged |

Who sees what:
| Viewer | Sources | Names / counts of other people |
|---|---|---|
| Admin | every source, incl. on private people and orphans | all linked people (real names, as the admin page today) |
| Member (incl. non-admin editor) | level 2+, never on a private person | only non-private linked people; a count never includes a hidden person |
| Public visitor | level 3, only on people the public tree shows | **never** — no names, count or «مشترك مع» |

Private people: never offered in the picker; the server refuses linking a private person for non-admins (same generic 400 as "not found").

---

## 5. API changes

Same conventions as built: `requireTreeEditor` / `requireWorkspaceAdmin` / `requireWorkspaceMember`, `treeMutateLimiter` on writes, reads unlimited (member) / `publicTreeLimiter` (public), `resolveSourceTreeOr404`, uuid-guarded ids → one 404 «غير موجود», `private, no-store`, no `touchTreeTimestamp`, optional `treeId`. Path segment `[entryId]` stays (it names a source).

### 5.1 Member routes
| Route | Change | Detail |
|---|---|---|
| `GET individuals/[individualId]/sources` | **change** | `{ entries: PersonSourceDto[], inherited, familyHints? }`. `PersonSourceDto = SourceEntryDto & { people: {id,name}[] /* visible OTHERS, ≤ 20 */, sharedCount: number /* visible others */ }`. `familyHints` (≤ 2 `SourceSummaryDto`): editors only, only when `entries` is empty; sources linked to a household member (parents, spouses, siblings, children), gate-filtered, most-linked first |
| `POST individuals/[individualId]/sources` | **remove** | replaced by `POST sources` |
| `POST sources` | **add** | `{ treeId?, text?, fileIds?, visibility?, personIds: uuid[] 1..500 }`. All people must be native to this tree (not pointed); non-admins can't link private people or set level ≠ admins. One transaction: source + links + staged files. 201 `SourceEntryDto & { people, sharedCount }` |
| `GET sources` (admin list) | **change** | one row per source; query adds `filter: 'shared' \| 'unlinked'`; row = `SourceEntryDto & { people: {id,name}[] /* first 20 */, peopleCount, fileCount }` (drops `personName`); response adds `counts: { all, shared, unlinked }`. Tree-wide excluded as today |
| `GET sources/[entryId]` | **add** | preview. Tree editors. `SourceEntryDto & { people /* visible, ≤ 500 */, peopleCount }`; 404 unless `canViewSourceAnywhere` |
| `PATCH sources/[entryId]` | **change** | adds `addPersonIds?`, `removePersonIds?` (uuid[] ≤ 500, disjoint), `onLastLink?: 'delete' \| 'keep'`. Row-locks the source `FOR UPDATE`. If the op leaves 0 links on a non-tree-wide source that had ≥ 1: missing `onLastLink` → 409 `{ error: 'هذا آخر شخص لهذا المصدر', code: 'last_link' }`; `delete` → deletes source + files (`{ data: null, deleted: true }`); `keep` → orphan. Link ops on a tree-wide source → 400. Non-admins may remove only people they can see. Refine: at least one of text/fileIds/visibility/add/remove |
| `DELETE sources/[entryId]` | **change** | admin: deletes the source, its links and files. Non-admin editor: as built ("can see it, or wrote it"); if hidden links remain, removes only the visible links and the source stays |
| `GET sources/suggestions` | **change** | returns `SourceSummaryDto[]` (≤ 10): `{ id, text, visibility, fileCount, peopleCount /* visible */, firstPersonName /* when peopleCount = 1 */ }`, gate-filtered (admins also get orphans) |
| `POST sources/bulk` | keep | ids = source ids; delete removes whole sources |
| `GET sources/publish-summary` | **change** | adds `publicPeopleCount` (distinct linked people passing `isShownOnPublicTree`, over level-3 sources) |
| `GET/PUT/DELETE sources/tree-entry` | keep | query by `isTreeWide`; PUT never creates links |
| `POST sources/uploads` | keep | — |
| `GET sources/[entryId]/files/[fileId]` | **change** | gate = `canViewSourceAnywhere` (admin; tree-wide gate; or ≥ 1 visible linked person) |
| `DELETE sources/[entryId]/files/[fileId]` | keep | — |

### 5.2 Public routes (`/api/family/[slug]/…`)
| Route | Change |
|---|---|
| `GET person/[individualId]/sources` | query via `links: { some: { individualId } }`; DTO unchanged (`id, text, files`) — no people/count ever |
| `GET person/[individualId]/sources/[entryId]/files/[fileId]` | the file's source must be LINKED to the path person (a file of a source linked only to another shown person → 404) |
| `GET sources/tree-entry/files/[fileId]` | query by `isTreeWide` |

### 5.3 Libraries
- `src/lib/tree/source-links.ts` **new**: `validateLinkTargets(tx, treeId, ids, viewer)`, `lastLinkOutcome(...)`, `loadLinkedPeople(...)`, `householdIds(data|db, personId)`.
- `src/lib/tree/public-shown.ts` **new**: pure `isShownOnPublicTree(ind, now)` = `!isPrivate && !_pointed && !isPresumedLiving(ind, now)`. Parity test: agrees with `redactForPublic(...).publicDisplay === 'full'` on fixtures. Used by the server (publish summary) and the form warning (client, over the loaded tree).
- `src/lib/tree/relation-label.ts` **new**: `relationLabel` (§2.2).
- `source-entry-schemas.ts`: `createSourceSchema` (personIds), PATCH additions, list `filter`, `MAX_LINKS_PER_SOURCE = 500`.
- `audit.ts`: `snapshotSourceEntry` adds `personIds` (ids only) + `peopleCount`; link changes log as `update` with `linksAdded`/`linksRemoved` ids. Entity type stays `source_entry` («مصدر»). `AuditLogDiff` label `peopleCount: 'عدد الأشخاص'`. Never text-in-description, never bytes.

---

## 6. Undo
| Action | Undo entry |
|---|---|
| Form «حفظ» (source + links, incl. reuse links, in IndividualForm or the standalone form) | ONE entry. Label: «إضافة مصدر» / «إضافة مصدر لـ {peopleCountLabel}» / «تعديل مصدر لـ {peopleCountLabel}». Inverse of links = PATCH add/remove. Files involved → `undoOnly` (existing rule) |
| «إزالته عن {الاسم} فقط» | ONE entry «إزالة مصدر عن {الاسم}»: undo = PATCH `addPersonIds`. If it deleted the source (last link, `delete`): undoable only when text-only (re-create + re-link), else not undoable |
| Shared edit | ONE entry (one PATCH carries content + link deltas) |
| Delete from everyone | text-only → undoable (re-create with the same people); with files → not undoable (existing rule) |
| Person delete | undo re-links each captured source id to the re-created person (404 on a since-deleted source is skipped) |
| File upload/remove, admin-page actions, bulk | not undoable (unchanged) |

Labels never contain the source text (PII).

---

## 7. UI changes per component (`src/components/sources/` unless noted)
| Component | Change |
|---|---|
| `SourceEntryForm` | «مصدر لـ» line + locked chip, picker launch, edit banner, «حفظ عند N أشخاص», extended warning, reuse suggestions (source rows + [ربطه بهذا الشخص]/[نسخ النص فقط]/«عرض»); deferred mode returns `personIds` / `linkSourceId` in its draft |
| `SourcePeoplePicker` **new** | §2.2 |
| `SourcePreview` **new** | §2.3 preview (uses `SourceLightbox`, `SourceFileThumbs`) |
| `LastLinkDialog` **new** | §2.5 |
| `peopleCountLabel` (in `arabicDigits.ts` or new `peopleCount.ts`) | §2.1 wording |
| `PersonSourcesSection`, `SourceRow` | tag, «⋯» menu (§2.4), family hint, last-link dialog |
| `PersonSourcesCard` | tag only |
| `StagedSourcesList` + `src/lib/tree/source-staging.ts` + `source-plan-apply.ts` | staged rows carry people; plan ops: `creates` (personIds incl. SELF placeholder for new persons), `links` (reuse), `updates` (content + deltas), `unlinks` (self, `onLastLink`), `deletes` |
| `src/components/tree/IndividualForm/IndividualForm.tsx` | passes the starting person (or «هذا الشخص (جديد)») + tree data to the form; last-link dialog at stage time |
| `src/hooks/usePersonActions.ts` | `applySourcePlan` with new ops; SELF → new id after create; person-delete captures source ids and re-links on undo |
| `src/components/ui/Sidebar/PersonDetail.tsx` | delete-confirm note (§2.6) |
| `SourcesManager`, `SourcesAdmin.module.css`, `src/app/workspaces/[slug]/tree/sources/page.tsx` | §2.7 |
| `src/components/public-tree/PublishSourcesStep`, `src/lib/tree/publish-sources.ts` | §2.8 |
| `PublicPersonSourcesCard`, `TreeSourceCard`, `SourceVisibilityPicker`, `SourceLightbox` | unchanged |

---

## 8. Privacy / leak tests to add
1. Member GET person sources, source linked to A (shown), P (private), C: on A → `people` = [C], `sharedCount` = 1; P's id/name absent from the whole JSON.
2. Member GET on P → same 404/empty as today; admin on A → `sharedCount` = 2.
3. Suggestions, family hints, preview for a non-admin editor: a source visible only via P is absent; names/counts exclude P.
4. Member file route: source linked only to P → 404; orphan → 404; admin → 200.
5. Public person sources: DTO keys exactly `id, text, files` (denylist `people`, `sharedCount`, `peopleCount`, `personIds`, `links`).
6. Public file route: file of a source linked to shown A requested under shown B (not linked) → 404; under a living/private linked person → 404.
7. Linking: person from another tree / pointed / nonexistent → same 400; private for non-admin → same 400.
8. Tree GET payload, `GedcomData`, `redactForPublic`, `redactPrivateIndividuals`, `extractPointedSubtree`, person projection, JSON-LD: no `sourceLinks` (extend `src/test/helpers/source-leak.ts` denylist + `stripSourceKeys`); tree loader never selects `sourceLinks`.
9. Tree-wide: link add → 400; publish summary and `inheritedTreeEntry` never treat an orphan as tree-wide.
10. `isShownOnPublicTree` parity with `redactForPublic`.
11. Last link: 409 without `onLastLink`; `keep` leaves an orphan visible only to admins (list `filter=unlinked`); `delete` removes files + `SourceFileData`.
12. Cross-workspace copy (step 8): only level-3 sources, only links to landed non-private people; a source with no landed link is not copied.

---

## 9. Rework build order (tests first in every chunk)

| # | Chunk | Files touched | Runs |
|---|---|---|---|
| R1 | **Model + gate + mechanical port.** Schema, new migration (+ backfill check on local DB), `prisma generate`, gate functions, `public-shown.ts`, `relation-label.ts`, `source-links.ts`; port every server query from `individualId` to `links`/`isTreeWide` keeping today's one-person behavior so `tsc` and existing tests stay green; restart dev server (stale Prisma client) | `prisma/schema.prisma`, new migration, `source-visibility.ts`, new libs, `source-entry-route-helpers.ts`, `public-sources.ts`, every `route.ts` under `tree/sources/**`, `individuals/[individualId]/sources`, `family/[slug]/**/sources/**`, `audit.ts`, `src/test/helpers/source-leak.ts`, `source-key-strip.ts`, related tests | serial, first |
| R2 | **Member write/read API for sharing.** `POST sources`, PATCH deltas + last link, DELETE partial, preview GET, person GET shape + family hints, suggestions, admin list shape/filters/counts, bulk per source, audit snapshots, client wrappers | `tree/sources/route.ts`, `tree/sources/[entryId]/route.ts`, `individuals/[individualId]/sources/route.ts`, `sources/suggestions`, `sources/bulk`, `source-entry-schemas.ts`, `source-links.ts`, `audit.ts`, `AuditLogDiff.tsx`, `source-entries-api.ts`, tests | after R1 ∥ R3 |
| R3 | **Public, files, publish summary, leak tests.** Public linkage rule, member file gate, `publicPeopleCount`, tests §8 items 4–6, 8–10 | `public-sources.ts`, `family/[slug]/**/sources/**`, `tree/sources/[entryId]/files/[fileId]/route.ts`, `sources/publish-summary/route.ts`, leak tests | after R1 ∥ R2 |
| R4 | **Form, picker, preview, dialog.** Components + `peopleCountLabel`; defines the new `SourceDraft` contract in `source-staging.ts` (types only) | `SourceEntryForm.tsx/.css`, new `SourcePeoplePicker`, `SourcePreview`, `LastLinkDialog`, `arabicDigits.ts`, `source-staging.ts` (types), `index.ts`, tests | after R2 |
| R5 | **Person surfaces + staging + undo.** Sidebar section, card, staged list, IndividualForm, plan apply, undo builders/labels, person-delete re-link, delete note | `PersonSourcesSection`, `SourceRow`, `PersonSourcesCard`, `StagedSourcesList`, `source-staging.ts`, `source-plan-apply.ts`, `source-entry-undo.ts`, `undo-builders.ts`, `undo-label.ts`, `usePersonActions.ts`, `usePersonSources.ts`, `IndividualForm.tsx`, `PersonDetail.tsx`, tests | after R4 ∥ R6 |
| R6 | **Admin page + publish step.** | `SourcesManager.tsx`, `SourcesAdmin.module.css`, `tree/sources/page.tsx`, `PublishSourcesStep/*`, `publish-sources.ts`, `PublishFlowContainer.tsx`, tests | after R4 (uses picker + dialog) ∥ R5 |
| R7 | **E2E of the shared flow** (e2e-test skill, real infra): دفتر for a family of 10 in one save; tag on each; edit banner + «حفظ عند …»; detach one; last-person keep → orphan tab → re-attach; reuse link + preview; member vs admin vs public views incl. a private linked person; publish count; person delete + undo re-link | no product files | after R5 + R6 |
| 8 | **Copies + import** (§10) | copy files below | after R7 |

R2 ∥ R3 and R5 ∥ R6 share no files.

---

## 10. Step 8 — copies and import
Rules (a source travels only with a person or tree that travels):
- **Same-workspace whole-tree copies** (`extra-trees/[treeId]/duplicate` and own-tree collection copy, both via `prepareTreeSnapshot` in `src/lib/collections/copy.ts`): every source incl. orphans and the tree-wide source; links re-pointed to the new ids; files copied (same key, ciphertext copied as-is).
- **Cross-workspace copies** (`persistDeepCopy` for pointer copy, share-token revoke auto-copy, going-private `freezeDependentPointers` / `freezeCollectionLinks`, `copy-borrowed.ts`): only level-3 sources; only links whose person landed AND is not private; a source with no such link is not copied (no orphans in another family); text, file names and bytes re-encrypted under the target key.
- **Tree-wide source**: travels only with whole-tree copies (cross-workspace: only if level 3), becoming the new tree's tree-wide source; branch copies never carry it.
- **Quota never blocks a copy.** Several copies are automatic (going-private `freezeDependentPointers` / `freezeCollectionLinks`, share-token revoke auto-copy), so sources must never fail them. Copied files count against the TARGET workspace quota, checked inside the transaction. When a source's files would exceed it, copy the source's text + links and **skip its files**: the copy shows its text, and the files that didn't fit are simply absent. A file-only source whose files are all skipped is not copied (a source is never left with neither text nor files). Record `skippedSourceFiles` (count) wherever the path already returns metadata (copy result / audit payload / API response). Tests: over-quota copy succeeds, text + links present, no `SourceFile`/`SourceFileData` rows for skipped files, count reported.
- Shared helper `copySources(tx, { fromTreeId, toTreeId, idMap, mode: 'same' | 'cross', sourceKey, targetKey })` beside `copyAncestryJumps`.
- **GEDCOM import**: unchanged — counts skipped `SOUR`/`OBJE` and reports it.

Files: `src/lib/tree/branch-pointer-deep-copy.ts`, `src/lib/collections/copy.ts` (`prepareTreeSnapshot`), `src/lib/collections/copy-borrowed.ts`, `src/lib/tree/going-private.ts`, `src/app/api/workspaces/[id]/share-tokens/[tokenId]/route.ts` (DELETE), import route + `parser.ts` skip count, tests.

---

## 11. Done when
- R1–R7 and step 8 are merged locally.
- `pnpm test` and `npx tsc --noEmit` are green.
- Real end-to-end against the running services passes: upload; view as admin, member and public visitor; bulk change; publish; copy — **plus the shared flow (R7)**.
- CLAUDE.md, docs/implementation.md and docs/prd.md are updated; this doc and `docs/sources-shared-design.md` are deleted.
- **Deploy prerequisites**: prod nginx `client_max_body_size 9m;` on the gynat.com vhost; smoke a sharp re-encode on hz.
- **Do NOT deploy** until the owner has tested it.

**v2 (not now):** sources on marriages and individual facts, GEDCOM export/import of sources, `/islamic-gedcom` docs, «الأبناء والأحفاد» quick button, page field.

---

## Status notes (lead)
- **2026-09-25: model changed** from "every entry stands alone" to shared sources (owner approval, Update 5 in memory). Steps 1–7 of the old model are committed and are reworked by R1–R6 above; nothing is deployed.
- **Step 8 is still NOT started.** It was stopped before touching any file (no partial copy-path or import changes exist). It restarts against §10 only after R7.
- **2026-09-27, R1 done:** migration `20260927120000_shared_sources`. **Carry-over for R5:** undoing a person delete currently RE-CREATES the person's text sources as new entries. Sources now survive a person delete (§2.6), so this duplicates them. R5 must change it to re-link the existing sources, in `usePersonActions.ts`. Also for R2: the DTO still carries `individualId` (the person asked about, else the first link) for backward compatibility, and the audit snapshot still has no `personIds`/`peopleCount`.
- **2026-09-27, R2 + R3 done.** Carry-overs:
  - **R5:** `undo-builders.ts` (around lines 160, 543 and 592) still posts to the REMOVED per-person create route. Switch it to `POST sources` with `personIds`. Until then, undo re-create fails with 404 in the running app. (This comes on top of R1's "re-link, don't duplicate" item.)
  - **R4:** the form must pass `treeId` to suggestions. Suggestions are now per tree, so extra trees get main-tree suggestions today.
  - **R6:** drop the compatibility field `personName` from the admin list, and move `SourcesManager` to the per-source rows. Remove the legacy wrappers (`createSourceEntry` / `updateSourceEntry` / `fetchSourceSuggestions`) once R4 and R5 no longer use them. No dead code may remain.
  - **API behaviour** (decided in R2):
    - For a non-admin, private people count as hidden. A private id in their remove list is silently ignored, which avoids revealing whether that person is linked.
    - A partial DELETE returns 200 `{deleted:false}`; a full DELETE returns 204.
    - A person who can't be linked gets one generic 400.
- **2026-09-27, R4 done.** Carry-overs:
  - **R5 undo:** linking an existing source and changing people push no undo entry yet, and the create undo's redo re-creates for one person only. Fix both, together with the R1/R2 undo items above.
  - **R5 IndividualForm:** it must pass `individualId` / `newPerson`, and `buildSourcePlan` must use the new `SourceDraft` fields.
  - **R5 sidebar:** the «⋯» menu must use `useSourceUnlink`.
  - **R5 mobile:** the form's «حفظ»/«إلغاء» buttons are only 35px tall at 390px; make them 44px. At ≤600px the PEOPLE PICKER sheet (SourcePeoplePicker) has a see-through background and the form shows behind it; make it opaque.
  - **R6:** use `SourcePeoplePicker` with no locked person, plus `useSourceUnlink` and `namesSummary`.
  - **Copy R4 introduced (flag it to the owner at the end):** «إلغاء الربط»; «الأب: X» / «الأم: X» when only one parent is known; «ليس مصدرًا لأحد» on suggestions.
- **2026-09-27, R5 + R6 done.** The legacy wrappers (`createSourceEntry`, `updateSourceEntry`, `fetchSourceSuggestions`, `restorableSourceEntries`) are removed. **Copy added by R5/R6, to show the owner at the end:** «سيُزال عن هذا الشخص», «إزالة المصدر عن هذا الشخص», «تراجع عن إزالة المصدر», «تعذّر إزالة المصدر», «تعذّر إضافة المصدر»; the publish line «…ومصدر واحد (تظهر على شخص واحد) يظهر لهم أصلًا»; the admin tabs «الكل / مشترك / ليس مصدرًا لأحد»; ▾ on one-person rows as well.
