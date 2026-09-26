# Code Reference (detailed)

Detailed per-file / per-route reference, moved out of CLAUDE.md to keep the always-loaded context small. CLAUDE.md holds the rules and big picture; look things up here (and in `docs/implementation.md`) when working in a specific area.

## Technology Stack

- **Framework**: Next.js 15.x with App Router and Turbopack
- **UI**: React 19.x with TypeScript 5.x
- **ORM**: Prisma 7.x with `@prisma/adapter-pg` driver adapter
- **Auth**: Supabase Auth (GoTrue) via `@supabase/ssr` (cookie-based), self-hosted
- **Validation**: Zod for API request validation
- **Database**: PostgreSQL 15 (via Docker Compose)
- **API Gateway**: Kong 3.9.1 (routes `/auth/v1/*` to GoTrue)
- **Tree Visualization**: @xyflow/react (React Flow) with custom tree layout algorithm
- **Styling**: CSS Modules with design tokens (`src/styles/tokens/`)
- **Testing**: Vitest with @testing-library/react and jsdom (see `docs/testing.md` for browser test mode)

## Code Architecture

### Path Aliases

The project uses `@/` as an alias for the `/src/` directory, configured in `tsconfig.json`.

### State Management

**TreeContext** (`src/context/TreeContext.tsx`) is the central state manager using React Context:
- Stores the parsed GEDCOM data (`GedcomData`)
- Tracks selected root ancestor (`selectedRootId`) and `initialRootId` (for back navigation)
- `ViewMode` (`'single' | 'multi'`) — single-root vs multi-root canvas mode (multi-root DISABLED, code preserved for future)
- `RootFilterStrategy` (`'all' | 'descendants'`) — controls visible subset in multi-root mode (DISABLED)
- Manages search query, focus/selection/highlight person IDs, tree configuration (max depth), loading state, and errors
- Provides `useTree()` hook for consuming components

The app wraps the entire application in `<TreeProvider>` via `src/app/providers.tsx` (client component).

**WorkspaceTreeContext** (`src/context/WorkspaceTreeContext.tsx`) manages workspace-specific tree state:
- `workspaceId`, `canEdit`, `isAdmin`, `refreshTree()`, `pointers` — consumed via `useWorkspaceTree()` hook
- `pointers` contains `PointerMetadata[]` (id, sourceWorkspaceNameAr, relationship, anchorIndividualId) from GET /tree response

**ToastContext** (`src/context/ToastContext.tsx`) provides app-wide toast notifications.

### GEDCOM Parsing

**Parser** (`src/lib/gedcom/parser.ts`):
- `parseGedcom(text: string)` - Parses raw GEDCOM text into structured data
- `getDisplayName(person)` - Formats person names for display

**Display** (`src/lib/gedcom/display.ts`):
- `getDisplayNameWithNasab(person, data, depth?)` - Arabic nasab/patronymic chain using بن/بنت connectors (`DEFAULT_NASAB_DEPTH = 2`). At the top of a known line it crosses a «قفزة نسب» with `JUMP_CONNECTOR` («من وَلَد») only when the ancestor family has a husband; a jump costs `JUMP_GENERATION_COST = 2` depth slots (default-depth cards read plain «عدنان»; depth ≥ 3 / depth 0 spell «عدنان، من وَلَد إسماعيل»), and the surname source freezes at the jump so the ancestor's house never stamps this family; when a jump is crossed the frozen surname is placed right BEFORE «، من وَلَد» («باسل بن محمد سعيد، من وَلَد عدنان»), never after the ancestor. Depth-2 output is locked byte-identical by `nasab-depth2-lock.test.ts`

**Roots** (`src/lib/gedcom/roots.ts`):
- `findRootAncestors(data)` - Identifies individuals with no parents who have families
- `findDefaultRoot(data)` - Picks root ancestor with the most descendants; a «قفزة نسب» descendant is never a true root (checked UNCONDITIONALLY, resolving through the `ancestryJumps` row, not the bare back-reference flag), and descendant counts flow across jumps so the apex ancestor wins

**Relationships** (`src/lib/gedcom/relationships.ts`):
- `getPersonRelationships()` - Returns `{ parents, siblings, paternalUncles, spouses, children }`

**Search** (`src/lib/utils/search.ts`):
- `matchesSearch()` - Multi-word, diacritic-stripping, case-insensitive Arabic/Latin search
- `stripArabicDiacritics()` - Removes Arabic tashkeel; `ARABIC_DIACRITICS_CHARS` constant shared with SQL

**Types** (`src/lib/gedcom/types.ts`):
- `FamilyEvent` - Event record with `date`, `hijriDate`, `place`, `description`, `notes`
- `Individual` - Person record with name, birth/death (with hijri dates, notes, description), sex, family references, `kunya` (الكنية), `isPrivate`/`isDeceased` flags
- `Family` - Family unit with husband, wife, children, plus `marriageContract` (MARC), `marriage` (MARR), `divorce` (DIV) as `FamilyEvent`, and `isDivorced` flag
- `AncestryJump` - «قفزة نسب» relation row: `descendant` (individual id) → `ancestorFamily` (ALWAYS a `Family` id — a single known ancestor is a one-spouse family), nullable `generationsMin`/`generationsMax`, `notes`; back-references `Individual.ancestryJumpAsDescendant` (one per person) and `Family.ancestryJumpsAsAncestor`
- `GedcomData` - Container for individuals and families records (keyed by ID); optional `radaFamilies` and `ancestryJumps`

**Graph utilities** (`src/lib/gedcom/graph.ts`):
- `TraversalOptions.includeJumps` — walk «قفزة نسب» edges as if they were parent→child edges. **DEFAULT `false`, fail-closed**: code that does not know about jumps simply does not see the link (worst case a missing link, never a false parent claim). Accepted by `getAllAncestors`, `getAllDescendants`, `getTreeVisibleIndividuals`, `getConnectedIndividuals`, `getCanvasVisibleIndividuals`, `resolveNavigationRoot`, `buildChildrenGraph`, `findTopmostAncestor`. Opted in by: the canvas (`buildTreeData`), `TreeContext` (visible set + panel scope), the person-page spine, `findDefaultRoot`. `buildJumpIndex(data)` is the shared O(J) lookup. `extractSubtree` / `computeGraftDescriptors` / `calculateDescendantCounts` are unchanged
- `getAllAncestors()` / `getAllDescendants()` - Traverse ancestor/descendant chains
- `getTreeVisibleIndividuals()` - Get individuals visible in the tree (with optional privacy filtering)
- `calculateDescendantCounts()` - Uses Kahn's algorithm (topological sort) for efficient O(V+E) counting
- `extractSubtree()` - Extract a self-contained `GedcomData` subtree rooted at a given person
- `findTopmostAncestor()` - Walk up parent chain to find the root ancestor of any person
- `hasExternalFamily()` - Check if a spouse has family data outside the current root's tree
- `computeGraftDescriptors()` - Build `GraftDescriptor[]` for in-law family expansion (parents + up to `MAX_GRAFT_SIBLINGS` siblings of married-in spouses)

**Calendar helpers** (`src/lib/calendar-helpers.ts`):
- `CalendarPreference` type (`'hijri' | 'gregorian'`)
- `getPreferredDate()`, `getSecondaryDate()`, `getDateSuffix()` — select display date based on user preference

**Person detail helpers** (`src/lib/person-detail-helpers.ts`):
- Form data builders: `buildEditInitialData()`, `buildFamilyEventInitialData()`, `serializeIndividualForm()`, `getSurnamePrefill()` (patrilineal family-name default for create modes; see `docs/implementation.md` §4.4)
- Validation: `validateAddParent()`, `canMoveChild()`, `needsFamilyPickerForAddChild()`, `getAncestryJumpAction(person, data, canEdit, enabled)` (`'create' | 'edit' | null` — «قفزة نسب» is offered only when `canEdit`, not `_pointed`, and the person has no `familyAsChild`; `enabled` = the workspace's `enableAncestryJumps` and hides only `'create'` — an existing jump still returns `'edit'` so it stays fixable/removable)
- Display: `formatDateWithPlace()`, `getDeceasedLabel()`
- Family picker: `getFamiliesForPicker()`, `getAlternativeFamilies()`

**Tree schemas** (`src/lib/tree/schemas.ts`):
- Zod validation schemas for tree API: `createIndividualSchema`, `updateIndividualSchema`, `createFamilySchema`, `updateFamilySchema`
- Shared field schemas: `individualFieldsSchema`, `familyEventFieldsSchema`

### Hooks

- `useCalendarPreference` — manages hijri/gregorian preference with localStorage persistence and server sync
- `usePersonActions` — Phase 3 editing state machine (modes: `edit`, `addChild`, `addSpouse`, `addParent`, `editFamilyEvent`, `ancestryJump`, `editAncestryJump`) with submit/delete handlers and child-move support; uses `withFormAction()` wrapper for consistent loading/error/cleanup cycle. `handleAncestryJumpSubmit` / `Update` / `Delete` — the «شخص جديد» path (create individual → family → jump) pushes ONE composite undo entry. `addParent` with `moveJumpId` routes `handleAddParentSubmit` to `handleMoveJumpToNewFather` (ONE move call, ONE undo entry via `buildMoveJumpToNewFatherInverse`); `moveSubtree` refuses «تعيين والدين موجودين» on a jump-carrying person before any API call. Sources: `IndividualForm` stages source changes and `applySourcePlan` (`source-plan-apply.ts`) persists them right after the person save — ONE undo entry per save (`undoOnly` when files are involved; a new person's `SOURCE_SELF` placeholder becomes the created id); person delete captures the person's source ids and its undo RE-LINKS them (text and files come back; a since-deleted source is skipped)
- `useWorkspaceTreeData` — fetches and manages workspace tree data
- Sources hooks — `usePersonSources` (a person's gated sources + inherited tree-wide source + family hints), `useTreeSourceEntry` (the tree-wide source), `useSourceFileUrls` (authenticated fetch → object URLs for thumbnails, revoked on change/unmount), `useSourceUnlink` («إزالته عن … فقط» + the last-person dialog), `useTreePublishLevel` (the tree's live publish level, admin-only GET, for the visibility picker's status line)
- `usePointerActions` — shared hook for branch pointer break/copy API calls (used by sidebar)
- `useTreeLines` — SVG line drawing for playground mode
- `useTreeColorOverrides` — tree color/display settings
- `usePasswordStrength` — password strength meter logic

### Routing

- **Root URL** (`/`) redirects authenticated users to `/workspaces`, shows landing page otherwise
- **Legacy redirects** (`next.config.ts`): `/saeed`, `/sharbek`, `/al-dalati`, `/al-dabbagh` permanently redirect to `/workspaces/{slug}/tree` — these were old static GEDCOM-based family routes
- **Family config** (`src/config/families.ts`): `FamilyConfig` entries (slug, rootId, displayName, gedcomFile) used for seeding workspaces. The `test` family (small `test-family.ged` fixture) seeds a lightweight workspace at `/workspaces/test/tree` for browser testing

### Data Flow

1. User navigates to `/workspaces/{slug}/tree`
2. `WorkspaceTreeClient` fetches tree data from `GET /api/workspaces/[id]/tree`
3. API returns `GedcomData` from database (private individuals redacted server-side)
4. Data is stored in TreeContext via `setData()`
5. UI components (`FamilyTree`, `Sidebar`, `SearchBar`) consume data via `useTree()`

### Tree Visualization

The `FamilyTree` component (`src/components/tree/FamilyTree/FamilyTree.tsx`) uses @xyflow/react with a **custom tree layout algorithm** (`FamilyTree/layout.ts`):
- **Bottom-up pass**: Calculates subtree widths (post-order traversal)
- **Top-down pass**: Assigns positions keeping siblings together (pre-order traversal)
- **Graft envelopes**: When a married-in spouse has external family, the layout reserves extra width for an inline expansion showing their parents and siblings (controlled by `GraftDescriptor`)
- Supports polygamous families with color-coded edges per spouse
- Privacy filtering: individuals with `isPrivate: true` are excluded from rendering
- **«قفزة نسب» edge**: `buildTreeData` pushes one extra built-in `bezier` edge `jump-<id>` from the ancestor node (husband ?? wife) to the descendant — `className: 'ancestry-jump'`, dashed, label «قفزة نسب» (+ range via `formatAncestryJumpLabel`), styled in `tree-global.css`. `layout.ts` derives the tree from the edges array, so the ancestor lands above the descendant with NO layout change; the ancestor is an ordinary `PersonCard`

**In-law visibility** (see `docs/in-law-visibility.md`):
- **Re-root on spouse's ancestor**: Button on married-in spouse cards navigates tree to that spouse's topmost ancestor; `RootBackChip` provides back navigation
- **Inline spouse family expansion**: In multi-root mode, spouse's parents and siblings render inline as a graft envelope next to the spouse card
- **Multi-root view** (DISABLED): `ViewModeToggle` code preserved but not rendered; multi-root lays out multiple root ancestor trees side-by-side

**Tree editing components** (`src/components/tree/`):
- `IndividualForm` — form for creating/editing individuals (name, sex, birth/death with hijri dates, kunya, notes)
- `FamilyEventForm` — form for marriage contract (MARC), marriage (MARR), divorce (DIV) events with expandable sections
- `FamilyPickerModal` — modal to select which family when adding/moving a child (polygamy support)
- `AncestryJumpForm` — «قفزة نسب» two-path sheet: «شخص جديد» (an `IndividualForm` with a BLANK surname — the ancestor's house is not this family's) or «شخص موجود في الشجرة» (person picker limited to valid targets → `FamilyPickerModal` when that person has several couples, else a one-spouse family minted silently), then the optional «من»/«إلى» range + notes; edit mode changes range + notes only (re-pointing is delete + create)
- `AncestryJumpMoveDialog` — shown before giving parents to a person who carries a «قفزة نسب»: «إضافة والد/والدة» variant offers «نقل القفزة إلى الأب الجديد» / «إلغاء» (text: a mother, or removing the jump, needs a manual delete first); the block variant (no `onMove`) explains only, for «تعيين والدين موجودين»
- `CoupleRow` — displays marriage event information between spouses
- `PersonCard` — individual node card in the tree
- `RootBackChip` — floating chip to navigate back to previous root after re-root
- `ViewModeToggle` — segmented pill to switch between single/multi-root view modes (DISABLED, not rendered)
- `CascadeDeleteModal` — danger-styled warning with affected names chips, count, name-typing confirmation gate (5+ people), stale data auto-refresh
- `EmptyTreeState` — placeholder for workspaces with no tree data
- `AuditLogList` — paginated audit log list with action/entity type filtering
- `AuditLogEntry` — single audit entry card with action/entity badges, user avatar, relative timestamp, expandable diff
- `AuditLogDiff` — before/after field comparison with Arabic labels, color-coded added/removed/changed values

**Sources UI** (`src/components/sources/`, barrel `index.ts`): `SourceEntryForm` (add/edit: «المصدر» text · files · «مصدر لـ:» people line with the LOCKED starting-person chip · `SourceVisibilityPicker` 3-level radio + live publish-status line · level-3 files warning; edit of a shared source shows the «هذا المصدر لـ N أشخاص» banner and «حفظ عند N أشخاص»; typing suggestions offer [ربطه بهذا الشخص] / [نسخ النص فقط] / «عرض»; deferred mode returns a `SourceDraft` for `IndividualForm`), `SourcePeoplePicker` (bottom sheet: quick buttons from `quickGroups` — spouse/children/whole family or parents/siblings — plus same-tree search; rows = nasab + relation · birth; private people never offered, borrowed `_pointed` people shown but not selectable; logic in `src/lib/tree/source-people.ts` + `relation-label.ts`), `SourcePreview` (read-only «معاينة المصدر»), `LastLinkDialog` («هذا آخر شخص لهذا المصدر»: [حذف المصدر وملفاته] / [إبقاؤه في صفحة المصادر]), `PersonSourcesSection` + `SourceRow` (sidebar: «مشترك مع K آخرين» tag, «⋯» menu تعديل / «إزالته عن {name} فقط» / «حذف المصدر من الجميع (N)»), `FamilySourceHints` («مصادر أسرته»), `StagedSourcesList` (IndividualForm staging), `PersonSourcesCard` (member person page, tag but no names), `PublicPersonSourcesCard` (public: text + files only — never names/counts/tag), `SourceFileThumbs` + `SourceLightbox`, `SourcesManager` + `TreeSourceCard` (admin page), `SourceLevelBadge`, `arabicDigits.ts` (`peopleCountLabel` — شخص واحد / شخصين / ٣–١٠ أشخاص / ١١+ شخصًا), `importSkippedSources.ts` (post-import notice). Publish step: `src/components/public-tree/PublishSourcesStep/`

### GEDCOM File

The GEDCOM file (`public/saeed-family.ged`):
- GEDCOM 5.5.1 format (UTF-8 encoding) with Islamic extensions
- Individual records: `0 @ID@ INDI` with `NAME`, `SEX`, `BIRT`, `DEAT`, `FAMS`, `FAMC` tags
- Family records: `0 @ID@ FAM` with `HUSB`, `WIFE`, `CHIL`, `MARC` (marriage contract), `MARR` (marriage), `DIV` (divorce) tags
- Hijri dates via `@#DHIJRI@` calendar escape on DATE lines
- Cross-references use `@ID@` format

**IMPORTANT**: Do not read `.ged` files directly (per project instructions).

### CSS Architecture

- Component styles use **CSS Modules** (`.module.css` files co-located with components)
- Tree-specific global styles in `src/styles/tree-global.css` (targets React Flow classes)
- Design tokens are defined in `src/styles/tokens/`:
  - `colors.css` - Color palette
  - `typography.css` - Font sizes and weights
  - `spacing.css` - Spacing scale
  - `shadows.css` - Box shadows
  - `transitions.css` - Animation timings

### Naming Conventions

- **PascalCase** for component directories and files (e.g., `FamilyTree/FamilyTree.tsx`)
- **camelCase** for hooks and utility files (e.g., `useTree.ts`, `display.ts`)
- **kebab-case** for CSS files (e.g., `tree-global.css`)

### Mobile Patterns

- Sidebar has mobile overlay with FAB (floating action button) toggle. On the canvas the FAB is a SEARCH button (not a menu icon): it always opens the drawer on the search list, even with a person selected — via a Sidebar-local `showListOverDetail` override, NOT by clearing `selectedPersonId` (the card's details FAB only renders while its person is selected). On the person page there are no cards, so the same button is the only way into that person's panel: it opens the details and wears the person icon. Covered by `src/test/sidebar-search-toggle.test.tsx`
- Node cards show details FAB on mobile when a person is selected
- Body scroll is locked when mobile sidebar is open

### Backend Infrastructure

**Docker Compose** (`docker/docker-compose.yml`):
- Start: `cd docker && docker compose up -d`
- Services: `db` (PostgreSQL 15), `gotrue` (Supabase Auth v2.186.0), `kong` (API gateway), `studio` (admin UI), `pg-meta`
- Ports: PostgreSQL 5432, GoTrue 9999, Kong 8000 (public API), Studio 3001
- Kong config at `docker/kong.yml` — routes `/auth/v1/*` to GoTrue with CORS headers and rate limiting (30/min per IP)
- Non-public ports bound to `127.0.0.1` (PostgreSQL, GoTrue, Studio); Kong 8000 is the only externally accessible port
- Secrets in `docker/.env` (gitignored) — all security-sensitive vars use `:?` syntax (Docker fails to start if missing)

**Prisma** (`prisma/schema.prisma`):
- 31 models: User, Workspace, WorkspaceMembership, WorkspaceInvitation, UserTreeLink, FamilyTree, Individual, Family, FamilyChild, RadaFamily, RadaFamilyChild, AncestryJump, SourceEntry, SourceLink, SourceFile, SourceFileData, TreeEditLog, BranchShareToken, BranchPointer, CopyProvenance, Collection, CollectionItem, Post, Album, AlbumMedia, Event, EventRsvp, Notification, Place, PlatformStat, AdminAccessLog
- `AncestryJump` («قفزة نسب», migration `20260922120000_add_ancestry_jumps`) — `descendantId` → `ancestorFamilyId` (ALWAYS a `Family`, never an individual column), nullable `generationsMin`/`generationsMax` (hand-added CHECK: ≥ 1 and ordered — not expressible in `schema.prisma`, a regenerated migration would drop it), encrypted `notes` (`Bytes?`), `createdById`; `@@unique([treeId, descendantId])` = one jump per person (DB backstop, the route pre-checks and maps `P2002` → Arabic 409); FK cascade from both the descendant and the ancestor family
- **Sources** («المصادر», migrations `20260925120000_add_source_entries`, `20260926120000_source_file_staging`, `20260927120000_shared_sources`): `SourceEntry` (table `source_entries`; a "source" in product terms) — `treeId`, `isTreeWide` (the one «مصدر الشجرة»; explicit flag, NEVER inferred from having no links), `visibility` (`SourceVisibility { admins members public }` = levels 1/2/3, plaintext, default `admins`), encrypted `text` (`Bytes?`), `createdById`. `SourceLink` (`@@id([sourceId, individualId])`, + `treeId`) = one person the source is «مصدر لـ»; person or source delete cascades the link, the source SURVIVES its people (zero links = «ليس مصدرًا لأحد», admin-only). `SourceFile` = metadata only (encrypted `fileName`, `mimeType`, `sizeBytes`; `entryId` null while STAGED); `SourceFileData` = the encrypted bytes, one-to-one, so `include: { files: true }` never pulls contents and the tree loader never reads it. Hand-added SQL (not expressible in `schema.prisma`): partial unique `source_entries_one_tree_wide_per_tree ON (tree_id) WHERE is_tree_wide`, CHECKs `size_bytes BETWEEN 1 AND 8388608` and `mime_type IN (jpeg, png, webp, pdf)`, partial index `source_files_staged_created_at ON (created_at) WHERE entry_id IS NULL`. App-enforced (tested): a tree-wide source has no links; a link's person and source share its `treeId`
- `BranchShareToken` — SHA-256 hashed token with root individual, depth limit, target workspace scope, revoke flag
- `BranchPointer` — links source subtree to target workspace anchor; status (`active`/`revoked`/`broken`), relationship type, `linkChildrenToAnchor` flag, `shareTokenId` FK; `isCollectionLink` Boolean discriminator marks an anchor-less collection add-by-link pointer (a cross-workspace source descriptor) — `anchorIndividualId`/`selectedIndividualId`/`relationship` are nullable, and every target-side reader filters `isCollectionLink:false` (fail-closed) to keep it out of the member tree + public serve, while source-side freeze/token-revoke/admin-takedown still see it
- `FamilyTree` has `lastModifiedAt` timestamp (updated on every tree mutation, used for ETag caching)
- `User` has `calendarPreference` field (default: `'hijri'`), `isPlatformOwner` (Boolean, manual SQL flip only — never written from API), and live-presence heartbeat columns `lastActiveAt`, `lastActiveRoute` (VarChar 200, route pattern only — never raw URLs), `lastActiveWorkspaceId` (FK, `ON DELETE SET NULL`); indexed on `lastActiveAt`
- `PlatformStat` is a single-row settings table (`CHECK (id = 1)`) holding `peakConcurrentUsers` + `peakRecordedAt` for live-presence peak record
- `Individual` has `birthHijriDate`, `deathHijriDate`, `birthNotes`, `deathNotes`, `birthDescription`, `deathDescription`, `kunya`
- `Family` has marriage contract (MARC), marriage (MARR), and divorce (DIV) event fields: `{type}Date`, `{type}HijriDate`, `{type}Place`, `{type}Description`, `{type}Notes`, plus `isDivorced`
- `Workspace` has `enableAuditLog`, `enableVersionControl`, `enableCollections`, and `enableAncestryJumps` (all Boolean, default false) toggles (`enableAncestryJumps`, migration `20260923120000_add_enable_ancestry_jumps`, gates only CREATING a «قفزة نسب»); `ContentPermission` enum includes `collection_editor`
- `FamilyTree` has `kind` (`TreeKind { main extra }`; one `main` per workspace via a partial unique index, unlimited `extra` trees that exist only inside Collections)
- **Collections** (`docs/prd-public-tree-collections.md` §2): `Collection` (workspaceId, plaintext `titleAr`/`descriptionAr`, `visibility` reuses `TreeVisibility`, `publicSlug`, `allowReuse`) and `CollectionItem` (kind `tree`|`collection` via `CollectionItemKind`, `linkMode` via `ItemLinkMode { linked copied }`, exactly-one source binding — `treeId` | `branchPointerId` | `childCollectionId` — enforced by a CHECK; `@@unique([collectionId, treeId])` + `@@unique([collectionId, childCollectionId])` block duplicate sources)
- `TreeEditLog` has `snapshotBefore` (Json?), `snapshotAfter` (Json?), `description` (VarChar 500) for full before/after audit snapshots; indexed on `[treeId, entityType, entityId]`
- Prisma v7 uses driver adapters — client instantiation requires `PrismaPg` from `@prisma/adapter-pg`
- **Prisma v7 limitation**: `_count` with `where` filters inside `include` is NOT supported with driver adapters. Use separate `groupBy` queries instead.
- Generated client output: `generated/prisma/` (gitignored)
- Run migrations: see the migrate diff → migrate deploy workflow under Common Commands (`migrate dev` is broken here)
- Config: `prisma.config.ts` loads `DATABASE_URL` from `.env` via `dotenv/config`

**Supabase Client Libraries** (all via `@supabase/ssr`):
- Browser client: `src/lib/supabase/client.ts` — `createBrowserClient` (auto cookie storage)
- Server client: `src/lib/supabase/server.ts` — `createServerClient` with Next.js `cookies()` (async)
- Middleware client: `src/lib/supabase/middleware.ts` — `updateSession()` for token refresh
- Prisma singleton: `src/lib/db.ts` — uses `DATABASE_URL`

**Auth Flow**:
- Signup: `src/app/auth/signup/page.tsx` → GoTrue `/auth/v1/signup` + Google OAuth
- Login: `src/app/auth/login/page.tsx` → GoTrue `/auth/v1/token?grant_type=password` + Google OAuth
- Callback: `src/app/auth/callback/route.ts` — handles OAuth redirects, email confirmations, sets cookies, syncs user to DB
- User sync: `POST /api/auth/sync-user` + shared helper `src/lib/auth/sync-user.ts` — mirrors GoTrue user to `public.users`
- Password reset: `src/app/auth/forgot-password/page.tsx` → Supabase `resetPasswordForEmail()`
- Reset password UI: `src/app/auth/reset-password/page.tsx` — new password form with strength meter (after clicking email link)
- Email confirmation: `src/app/auth/confirm/page.tsx` — two-stage email confirmation page
- Redirect validation: `src/lib/auth/validate-redirect.ts` — validates `?next` parameter to prevent open redirects
- Middleware: `src/middleware.ts` — three code paths: static assets (skip), API routes (session refresh only, no login redirect), page routes (session refresh + login redirect)
- After login/signup, users are redirected to `/workspaces`

**API Utilities**:
- Auth guard: `src/lib/api/auth.ts` — `getAuthenticatedUser(request)` parses Bearer token, verifies via Supabase
- Workspace guards: `src/lib/api/workspace-auth.ts` — `requireWorkspaceMember()`, `requireWorkspaceAdmin()`, `requireTreeEditor()`, `requireCollectionEditor()` (admin or `collection_editor`), `requireCollectionsEnabled()` (deny-by-default 404 when `enableCollections` off; called FIRST, before the auth guard)
- Request helpers: `src/lib/api/route-helpers.ts` — `parseValidatedBody(request, zodSchema)` parses JSON + validates with Zod in one call; `isParseError()` type guard; `parseTreeIdFromBody(request)` / `extractTreeId(body)` pull an optional string `treeId` from a DELETE body (string-only narrowing — a non-string, e.g. a Prisma-operator object, never reaches the scoping query). Used by all mutable API routes to eliminate boilerplate.
- Rate limiting: `src/lib/api/rate-limit.ts` — in-memory `RateLimiter` class with pre-configured instances per endpoint (single-process; needs Redis before horizontal scaling)
- Client fetch: `src/lib/api/client.ts` — `apiFetch(path, options)` auto-attaches Bearer token
- Serialization: `src/lib/api/serialize.ts` — `serializeBigInt()` for JSON responses with BigInt fields
- HTML escaping: `src/lib/utils/html-escape.ts` — `escapeHtml()` for email templates

**Workspace API Routes** (`src/app/api/workspaces/`):
- `POST /api/workspaces` — create workspace (any authenticated user, creator becomes `workspace_admin`)
- `GET /api/workspaces` — list user's workspaces
- `GET /api/workspaces/[id]` — workspace detail (members only)
- `PATCH /api/workspaces/[id]` — update settings (admin only)
- `GET /api/workspaces/by-slug/[slug]` — resolve workspace by slug
- `GET /api/workspaces/[id]/members` — list members
- `POST /api/workspaces/[id]/members` — invite by email (admin only)
- `PATCH /api/workspaces/[id]/members/[userId]` — update role/permissions (admin only)
- `DELETE /api/workspaces/[id]/members/[userId]` — remove member (admin only, last-admin protected)
- `POST /api/workspaces/[id]/invitations/code` — generate join code (admin only)
- `POST /api/workspaces/join` — join via code (atomic transaction, rate limited)
- `POST /api/invitations/[id]/accept` — accept email invitation (atomic transaction)

**Tree API Routes** (`src/app/api/workspaces/[id]/tree/`): all read + mutation routes accept an optional `treeId` (query param for reads, body field for mutations) to target an `extra` tree; absent → the workspace `main` tree (backward-compatible). The target is resolved once via `resolveTargetTreeOr404()` (scoped by `{ id, workspaceId, kind }`, fail-closed 404). Gated by `tree_editor` or admin (same as the main tree; NOT `collection_editor`). Branch-pointer / visibility / publish / import / audit-log routes stay main-only (no `treeId`).
- `GET /api/workspaces/[id]/tree` — full tree as `GedcomData` (private individuals redacted server-side); supports ETag/`If-None-Match` for 304 responses, returns `Cache-Control: private, max-age=30, stale-while-revalidate=300`; branch pointer source trees are fetched in parallel and deduplicated by workspace ID
- `POST /api/workspaces/[id]/tree/individuals` — create individual (`tree_editor` or admin)
- `PATCH /api/workspaces/[id]/tree/individuals/[id]` — update individual
- `DELETE /api/workspaces/[id]/tree/individuals/[id]` — delete individual; supports optional `{ cascade, versionHash, confirmationName }` body for cascade delete (409 on stale data)
- `GET /api/workspaces/[id]/tree/individuals/[id]/delete-impact` — cascade delete preview: affected count, names (capped at 20), pointer/token counts, version hash, name confirmation gate
- `POST /api/workspaces/[id]/tree/families` — create family
- `PATCH /api/workspaces/[id]/tree/families/[id]` — update family
- `DELETE /api/workspaces/[id]/tree/families/[id]` — delete family
- `POST /api/workspaces/[id]/tree/families/[id]/children` — add child to family
- `DELETE /api/workspaces/[id]/tree/families/[id]/children/[individualId]` — remove child from family
- `POST /api/workspaces/[id]/tree/families/[familyId]/children/[individualId]/move` — move child to another family
- `GET /api/workspaces/[id]/tree/export` — GEDCOM export (5.5.1 or 7.0 format via `?version=` query param)
- `POST /api/workspaces/[id]/tree/import` — GEDCOM import (empty trees only, multipart form data); sources are NOT imported — `countSkippedSources` (`parser.ts`) counts dropped `SOUR`/`OBJE` (records, INDI/FAM and event level), the response carries `skippedSources`, and the editor shows an 8 s notice («لم تُستورد المصادر المرفقة بالملف (N)…»)
- `GET /api/workspaces/[id]/tree/audit-log` — audit log (admin-only, `enableAuditLog` toggle gate, paginated max 50/default 20, filterable by action/entityType/entityId/userId, rate-limited 60/min)
- `GET /api/workspaces/[id]/tree/publish-preview` — admin-only Public Tree publish data: living-people checkpoint, withheld borrowed branches, confirmation phrase, current level, slug, reuse opt-in; treeId-aware (optional `?treeId` → that `extra` tree via `resolveTargetTreeOr404`, fail-closed 404; withheld-branches `[]` for extra trees, the tree's own name as the confirm phrase). One treeId-aware `PublishFlowContainer` (`src/components/public-tree/`, shared `PublishIcon`) drives publishing for ALL trees from BOTH the editor top bar (the open tree) and every trees-list row (main + extra) — no separate extra-tree publish modal. The flow asks ONCE about sources (`PublishSourcesStep`: كلها / لا شيء / أختار بنفسي over levels 1–2, default none; «كلها» bulk-raises to level 3; shows how many people already-public sources appear on)
- `PATCH /api/workspaces/[id]/tree/visibility` — admin-only set visibility (`private`/`public_link`/`public_listed`); requires the type-to-confirm phrase on first publish; keeps the slug across private round-trips; accepts an optional `treeId` to publish a single `extra` tree on its own (home-only serve, behind `enableCollections`) — the workspace-scoped going-private freeze runs only for the `main` tree
- `GET /api/workspaces/[id]/tree/person/[individualId]` — member-only Person Page projection for one individual in the workspace MAIN tree. Reuses the tree-GET load → branch-pointer-merge pipeline, then runs `projectPerson` (`MEMBER_PROJECT_OPTIONS`) on the merged un-redacted data; the projection enforces the private gate at the source. ETag/`If-None-Match` keyed on tree mtime + individual id + `PROJECTION_ETAG_VERSION` (currently `v4`; bump the version on any projection shape/logic change, since logic-only changes leave `lastModifiedAt` untouched)

**Ancestry Jump API Routes** (`src/app/api/workspaces/[id]/tree/ancestry-jumps/`, «قفزة نسب»; `tree_editor` or admin, `treeMutateLimiter`, treeId-aware; see `docs/implementation.md` §4.9):
- `POST /api/workspaces/[id]/tree/ancestry-jumps` — create a jump `{ descendantId, ancestorFamilyId, generationsMin?, generationsMax?, notes? }`; gated by the per-workspace `enableAncestryJumps` toggle (off by default; inline check, same shape as the rada'a gate) → 400 «ميزة قفزة النسب غير مفعّلة في هذه المساحة» (after auth + limiter, before body parsing; the undo header does not bypass it); validated by `validateAncestryJump()` (J1–J8: both ends exist in THIS tree, descendant has no parents, one jump per person, family has a spouse, range ordered, not self, no cycle); 201 with a plaintext-`notes` DTO, 409 on a duplicate (pre-check + `P2002` backstop)
- `PATCH /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]` — range + notes only (re-pointing = delete + create); ordering re-checked on the merged values. PATCH and DELETE are NOT gated by `enableAncestryJumps` — existing jumps stay editable/removable with the feature off. Import, deep-copy/collection-copy/going-private/duplicate paths, `pruneEmptyAncestryJumps`, and every read path (canvas, nasab, person page, public tree, JSON-LD, export) ignore the toggle
- `DELETE /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]` — deletes the jump row only (never the ancestor); optional `{ treeId }` body. Path ids are uuid-guarded → 404 (a malformed id never reaches Prisma)
- `POST /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-to-new-father` — `{ treeId?, father }` (male-locked individual body): ONE transaction creates the father F + couple {husband F, children [P]} and re-points the jump IN PLACE to F with the range shrunk by one (`shiftJumpRange`); planned by the pure `planJumpMoveToNewFather` (J-rules on the projected tree); P's row locked `FOR UPDATE`; 3 audit rows; NOT gated by `enableAncestryJumps`. 201 `{ data: { individual: { id }, family: { id }, jump } }`
- `POST /api/workspaces/[id]/tree/ancestry-jumps/[jumpId]/move-back` — the move's undo `{ treeId?, fatherId, familyId, childId, generationsMin, generationsMax }` (pre-move range); guarded by the pure `checkJumpMoveBack` + no active pointer anchored on F, else 409 «تغيّرت الشجرة منذ هذا الإجراء، فلا يمكن التراجع عنه»; order: jump back to P → delete couple → delete F (F last — the jump FK cascades from its descendant)
- **Parent backstop**: a jump-carrying person gains parents ONLY via move-to-new-father — `tree/families` POST (`childrenIds`), `families/[familyId]/children` POST, the child `move` route, and `branch-pointers` POST (`parent`, or `sibling` on an anchor without a parent family) answer 409 `{ error, code: 'child_has_jump' }` via `ancestry-jump-guards.ts` (`hasJumpDescendant` in-transaction, `treeHasJumpDescendant` over the already-loaded tree, `childHasJumpResponse`, `ChildHasJumpError`)

**Sources API Routes** (`src/app/api/workspaces/[id]/tree/`, «المصادر»; see `docs/implementation.md` §4.10). Conventions: treeId-aware via `resolveSourceTreeOr404`, uuid-guarded ids and every "not visible" case → ONE identical 404 «غير موجود», `Cache-Control: private, no-store`, `treeMutateLimiter` on writes, NO `touchTreeTimestamp` (sources are not in the tree payload); non-admins can't set a level other than `admins` or link a private person (generic 400 «تعذّر ربط المصدر بهؤلاء الأشخاص», same as not-found/pointed/foreign):
- `GET individuals/[individualId]/sources` — member; `{ entries: PersonSourceDto[], inherited, familyHints? }` — `people`/`sharedCount` = VISIBLE other people only (≤ 20 names); `inherited` = the tree-wide source when the person has no own visible source; `familyHints` (≤ 2, editors, only when `entries` is empty) = sources linked to the household
- `POST sources` — editor; `{ treeId?, text?, fileIds?, visibility?, personIds: 1..500 }`: one transaction creates source + links + attaches staged files. `GET sources` — admin list, one row per source, `filter: 'shared' | 'unlinked'`, level filter + search, `counts: { all, shared, unlinked }` (tree-wide excluded)
- `GET/PATCH/DELETE sources/[entryId]` — GET = preview (editor, 404 unless `canViewSourceAnywhere`); PATCH = text/fileIds/visibility + `addPersonIds`/`removePersonIds` (source row `FOR UPDATE`); leaving 0 links without `onLastLink` → 409 `{ code: 'last_link' }`, `onLastLink: 'delete' | 'keep'`; link ops on the tree-wide source → 400; a non-admin's remove of a private id is silently ignored (no oracle). DELETE: admin → whole source + files (204); non-admin editor with hidden links left → removes only visible links (200 `{ deleted: false }`)
- `GET sources/suggestions` (editor, ≤ 10 gate-filtered `SourceSummaryDto`), `POST sources/bulk` (admin; level change / delete per source, ≤ 500 ids), `GET sources/publish-summary` (admin; uncapped `pendingIds`, `publicCount`, `publicPeopleCount` — counts only — and the tree-wide entry, for the publish step), `GET/PUT/DELETE sources/tree-entry` (GET member through the gate; PUT/DELETE admin; never creates links)
- `POST sources/uploads` — editor, `sourceUploadLimiter` (30/h/user); ONE file per request, STAGED (unattached) until a create/PATCH/PUT passes it in `fileIds` (own, same tree, < 24 h; max 20 per source). `Content-Length` required and capped before reading, body stream capped too (411/413); magic-byte allow-list (JPEG/PNG/WebP/PDF — never the name or browser MIME); images RE-ENCODED with `sharp` (`.rotate()`, no metadata → EXIF/GPS stripped, `limitInputPixels` ~50 MP); PDFs refused when they carry active content (JS, auto-actions, launch, embedded files — incl. inside Flate streams and `#xx` escapes) or are encrypted; 8 MB cap; workspace `storageQuotaBytes` checked under a workspace row lock (admin storage figure includes source files); each upload best-effort sweeps staged files older than 24 h. Logic in `source-file-processing.ts` / `source-file-helpers.ts`
- `GET/DELETE sources/[entryId]/files/[fileId]` — GET member, gate `canViewSourceAnywhere`; decrypts and serves with `nosniff`, `CSP: sandbox; default-src 'none'`, `CORP: same-origin`, `no-store`, sanitized `Content-Disposition`; a staged/foreign/gated-out file never reads the bytes. DELETE editor (not undoable)
- `GET tree/visibility?treeId=` — admin-only publish level (feeds the picker's status line)

**Rada'a API Routes** (`src/app/api/workspaces/[id]/tree/rada-families/`):
- `POST /api/workspaces/[id]/tree/rada-families` — create rada'a family (milk kinship link)
- `DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId]` — delete rada'a family
- `POST /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children` — add child to rada'a family
- `DELETE /api/workspaces/[id]/tree/rada-families/[radaFamilyId]/children/[individualId]` — remove child from rada'a family

**Public Tree API Routes** (`src/app/api/family/[slug]/`) — anonymous, deny-by-default public surface, separate from the member tree path:
- `GET /api/family/[slug]/tree` — public (redacted) tree data for a published tree (404 if unknown/private)
- `/family/[slug]/person/[individualId]` — public, no-login Person Page (SSR, `force-dynamic`). Resolves the focal person from the SAME redacted public payload the tree serve uses; a private/absent individual is indistinguishable from a nonexistent one (404, no existence oracle). Robots `index` and schema.org Person/genealogy JSON-LD (via `buildPersonJsonLd`) are emitted ONLY when `isPublicPersonPageIndexable` (listed + per-tree opt-in) — the one place that reverses the prior "no Person schema" rule, with privacy gates baked in
- `POST /api/family/[slug]/report` — public, no-account report; rate-limited per IP; records a `public_tree_report` notification for workspace admins AND emails `SITE_CONTACT_EMAIL` (best-effort, never blocks/fails the report) for manual admin review. Never auto-takes-down
- Public sources (anonymous, `publicTreeLimiter` + `clientIpKey`, `private, no-store` + `X-Robots-Tag: noindex`, one 404 body for everything hidden; `src/lib/tree/public-sources.ts`): `GET /api/family/[slug]/person/[individualId]/sources` (level-3 sources of a person present in the SAME redacted public payload with `publicDisplay === 'full'`, HOME tree only; DTO exactly `{ id, text, files }` — never people, counts or «مشترك مع»; plus the inherited tree-wide source), `GET …/person/[individualId]/sources/[entryId]/files/[fileId]` (the file's source must be LINKED to the path person), `GET /api/family/[slug]/sources/tree-entry/files/[fileId]`. Rendered client-side by `PublicPersonSourcesCard` on the public person page and the public tree panel — never SSR, OG, sitemap or JSON-LD
- `GET /api/collections/[slug]/tree` — public (Collections Chunk 4) anonymous serve of a published collection by its `publicSlug`; deny-by-default (unknown/private/`enableCollections`-off → generic 404), `publicTreeLimiter` + `clientIpKey`, always `noindex`. Returns a lightweight card payload (`{ titleAr, descriptionAr, trees: { slug, titleAr, peopleCount }[] }`) — each tree's `slug` links to its own `/family/[slug]`; no tree data inlined. Composition + recursive LIVE withholding in `src/lib/collections/public-serve.ts` (`loadPublicCollectionBySlug` / `getPublicCollectionForRequest` = `cache(...)`, `buildPublicCollectionPayload`, bounded `collectPublicTreeRefs` walk)

**Collections API Routes** (`src/app/api/workspaces/[id]/`) — all gated by `requireCollectionsEnabled` (404 when off) then the auth guard; Chunks 1–4 shipped (own-content, edit-content, add-by-link, public serving):
- `POST/GET /collections`, `GET/PATCH/DELETE /collections/[collectionId]` — collection CRUD; GET detail shapes each item with a derived source label + LIVE effective visibility
- `PATCH /collections/[collectionId]/visibility` — admin-only; set collection visibility (`private`/`public_link`/`public_listed`); mints the public slug on first publish, keeps it across private round-trips. NO type-to-confirm phrase (each tree inside was already confirmed at its own publish). No going-private freeze runs here — a collection going private flips no source tree's visibility, so the `freezeCollectionLinks` call was removed (the real freeze-repoint runs from the tree going-private path). Accepts optional `promoteOwnTreesToListed` (search-discoverability chunk): when publishing at `public_listed`, flips the caller's OWN `public_link` leaf trees to `public_listed` in one transaction (`promoteOwnTreesToListed()` in `queries.ts`, scoped `{ workspaceId, public_link }` — never touches another workspace's tree); if cross-workspace borrowed leaves are still link-only the collection is DOWNGRADED to `public_link` (published by link, not search-listed) and the response returns `{ listedBlocked, blockingBorrowed }` for the modal to surface
- `GET /collections/[collectionId]/publish-preview` — admin-only; the would-be-withheld trees + publishable count. This is the AUTHORITATIVE withholding source — `CollectionVisibilityModal` fetches it and renders `withheldTrees` (the old client-side `items.filter` rule under-reported cross-workspace reuse-off borrows)
- `POST /collections/[collectionId]/items`, `PATCH/DELETE .../items/[itemId]` — add/edit/remove items (own main/extra tree → linked, or copied = deep-copy into a new extra tree; or nested collection with in-transaction cycle guard); duplicate-source adds → 409 (in-tx pre-check + DB unique index P2002 backstop); `linkInput` (add-by-link) resolves a pasted public-tree link (main OR extra tree) or private share code to its identity; a SELF-SOURCE paste (resolved tree in the caller's own workspace) is added directly as an own-tree live link via the shared `addOwnTreeLinked` (no reuse gate); a CROSS-WORKSPACE borrow → `linked` (anchor-less `isCollectionLink` pointer) or `copied` (two-key deep-copy of the SPECIFIC tree via `getTreeByIdWithIncludes` into a new extra tree), gated by the LIVE reuse-gate (in the route, cross-workspace only) + one generic 404 (no oracle) + per-IP limiter (`resolve-link.ts` / `copy-borrowed.ts`)
- `POST/GET /extra-trees`, `PATCH/DELETE /extra-trees/[treeId]`, `POST /extra-trees/[treeId]/duplicate` — extra-tree CRUD (cap 50) + duplicate any tree (main/extra) into a frozen extra-tree snapshot named `«{name} (نسخة)»`, writing `CopyProvenance`

**Places API Route** (`src/app/api/workspaces/[id]/places/`):
- `GET /api/workspaces/[id]/places?q=...` — search places (global seed + workspace custom)
- `POST /api/workspaces/[id]/places` — create custom place for workspace

**User API Routes** (`src/app/api/users/`):
- `GET /api/users/me` — get current user profile
- `PATCH /api/users/me` — update display name / avatar
- `GET /api/users/me/preferences` — get user preferences (calendar preference)
- `PATCH /api/users/me/preferences` — update user preferences

**Branch Pointer API Routes** (`src/app/api/workspaces/[id]/branch-pointers/`):
- `POST /api/workspaces/[id]/branch-pointers` — redeem share token, create pointer (with 4 stitching rules + gender validation + race condition protection)
- `DELETE /api/workspaces/[id]/branch-pointers/[pointerId]` — disconnect pointer (no deep copy, data disappears)
- `POST /api/workspaces/[id]/branch-pointers/[pointerId]/copy` — deep copy pointed subtree as native data, then mark pointer `broken`

**Share Token API Routes** (`src/app/api/workspaces/[id]/share-tokens/`):
- `POST /api/workspaces/[id]/share-tokens` — create share token (admin only)
- `GET /api/workspaces/[id]/share-tokens` — list tokens with root person name, active pointer count, expiry
- `PATCH /api/workspaces/[id]/share-tokens/[tokenId]` — disable/re-enable token (toggles `isRevoked` without touching pointers)
- `DELETE /api/workspaces/[id]/share-tokens/[tokenId]` — revoke token + auto deep-copy all active pointers into target workspaces
- `POST /api/workspaces/[id]/share-tokens/preview` — preview a token's subtree before redeeming

**Admin API Routes** (`src/app/api/admin/`) — platform-owner only, defense-in-depth gated by `isPlatformOwner` flag in middleware + route handler + page layout. Every read writes one `AdminAccessLog` row via `logAdminAccess()`.
- `GET /api/admin/healthcheck` — liveness probe
- `GET /api/admin/metrics/growth` — workspace + user counts, invite acceptance (60s response cache via `withUserCache`)
- `GET /api/admin/metrics/engagement` — weekly active workspaces, edits, top-N (60s cache)
- `GET /api/admin/metrics/health` — DB / GoTrue / mail / encryption / storage probes (60s cache)
- `GET /api/admin/metrics/presence` — live presence: 1m / 5m active users (owners excluded), per-workspace breakdown (k-anonymity gated by membership ≥5), 7×24 UTC heatmap, peak-concurrency record. **5s cache** (presence is "right-now" data). Lazy peak update fires fire-and-forget after the response.

**Admin Library** (`src/lib/admin/`):
- `queries.ts` — growth / engagement / health aggregations; every cross-workspace read goes through this single file
- `cache.ts` — `withUserCache(userId, key, fn, ttlMs)` per-user in-memory response cache for admin reads; HMR-safe via `globalThis`
- `presence.ts` — pure helpers (`normalizeRoutePattern` allow-list, `classifyRoute`) + presence query functions (`getActiveUserCount`, `getActiveWorkspaceBreakdown`, `getQuietWindowHeatmap`, `updatePeakConcurrency`, `getPresenceMetrics`). Normalizer drops UUIDs/slugs/control chars/traversal/queries to `null` — concrete URLs never reach the DB.
- `presence-tracker.ts` — middleware-facing in-memory throttle: LRU 50k cap, 5-min TTL, 60s sweep; `trackPresence({ userId, pathname, method })` is fire-and-forget. Writes only when workspace changes, category changes, or 60s have elapsed. Slug→id memo cache for `/workspaces/[slug]/*` paths.

**Audit utilities** (`src/lib/audit/`):
- `admin-access.ts` — `logAdminAccess({ userId, action, ipAddress, userAgent })` writes to `AdminAccessLog`; never throws (best-effort)

**Live presence integration points**:
- `src/middleware.ts` — calls `trackPresence` after `if (!user) redirect`, skipping `/admin/*` (owner self-exclusion)
- `src/lib/api/auth.ts` — `getAuthenticatedUser` calls `trackPresence` after successful Bearer auth (covers API-only callers that bypass middleware's `updateSession`)
- Both call sites are `void trackPresence(...)` — fire-and-forget, never block the response

**Collections Library** (`src/lib/collections/`):
- `queries.ts` — collection/item/extra-tree CRUD; pure recursion guards (`detectCollectionCycle` + DB wrapper, `MAX_NESTING_DEPTH`, `MAX_ITEMS`); `resolveEffectiveVisibility` (LIVE, deny-by-default), `shapeCollectionItem`, `peopleCountByTree` (shared Prisma-v7 groupBy workaround), `itemExistsInCollection` (in-tx dedupe), `filterTopLevelCollections`
- `schemas.ts` — Zod request schemas; `copy.ts` — `copyTreeIntoNewExtraTree` (atomic deep-copy of an own tree into a new extra tree, re-encrypts under same key + writes `CopyProvenance`); `api.ts` — client `apiFetch` wrappers + DB→UI visibility mapping; `useWorkspaceResolver.ts` — slug→id + `enableCollections` resolver hook; `resolve-link.ts` — `resolveLinkSource()` turns a pasted public-slug / private-share-code into ONE `ResolvedLinkSource | null` with the LIVE reuse-gate (no enumeration oracle); `copy-borrowed.ts` — `copyBorrowedBranchIntoNewExtraTree()` two-key cross-workspace deep-copy (decrypt source key → re-encrypt target key) + `CopyProvenance`
- `public-serve.ts` (Chunk 4 — the PUBLIC collection serve layer, separate from the member path) — `loadPublicCollectionBySlug` + `getPublicCollectionForRequest` (`cache(...)`, deny-by-default + `enableCollections` gate), `buildPublicCollectionPayload` (lightweight card payload: slug/titleAr/peopleCount, no inlined tree data), `collectPublicTreeRefs` (bounded visited-set/depth walk; recomputes LIVE effective visibility per item, recurses into nested collections without widening, cross-workspace borrows re-check live `allowReuse`), `countPublishableTrees` (the authoritative publish-preview withholding count — consumed by `CollectionVisibilityModal` via the publish-preview route). Search-discoverability helpers (2026-06-18): `getCollectionListingReadiness(slug)` = `cache(...)` + the id-keyed `getCollectionListingReadinessById(collectionId)` (admin pre-publish, no slug yet) both delegate to the shared `computeListingReadiness` core → `{ fullyListable, notListedOwnTrees, notListedBorrowedTrees }` (own-workspace vs cross-workspace link-only leaves); `listIndexableCollectionSlugs()` = the sitemap data source (`public_listed` + `enableCollections` + `fullyListable`, computed via the id-keyed core in parallel — no per-slug reload)
- `extra-tree-cap.ts` — shared `MAX_EXTRA_TREES_PER_WORKSPACE` + `ExtraTreeCapError` + `assertExtraTreeCapacity(workspaceId)` (counts `kind:'extra'` against the TARGET workspace); enforced by the extra-trees POST route AND both copy paths (`copy.ts`, `copy-borrowed.ts`) so a copy can't bypass the cap
- Components in `src/components/collections/` (CollectionsResolved, CollectionsPageShell, CollectionsList, CollectionDetail, TreesArea, AddItemFlow, CollectionVisibilityModal, CollectionBadges, EnableCollectionsSetting, JoinCodePanel); modal action buttons use the shared `@/components/ui/Button`. `TreesArea` (an extra tree's title) and `CollectionDetail` (a tree item) link into the editor at `/workspaces/[slug]/tree?treeId=<id>` — no separate "edit content" button; the rename control is a text affordance, not a pen icon

**Tree Library** (`src/lib/tree/`):
- `queries.ts` — database query helpers for tree CRUD; `touchTreeTimestamp(treeId)` updates `FamilyTree.lastModifiedAt` (called by all mutation routes for ETag invalidation); `getOrCreateTargetTree(workspaceId, treeId?)` + `resolveTargetTreeOr404()` resolve the tree a read/mutation targets (main when `treeId` absent, else the `{id, workspaceId, kind:main|extra}`-scoped tree; the guard returns a ready-to-`return` 404 `NextResponse` for a foreign/unknown id, consumed via `isErrorResponse`)
- `mapper.ts` — `dbTreeToGedcomData()` maps DB records to `GedcomData` shape (incl. `ancestryJumps` + both back-references; a dangling jump leaves no back-reference and is inert); `redactPrivateIndividuals()` strips PII from private individuals (jumps pass through unchanged on the member path)
- `seed-helpers.ts` — helpers for seeding tree data from GEDCOM (step 11 persists ancestry jumps; `ancestryJumpCount` in the result)
- `schemas.ts` — Zod validation schemas for tree API requests
- `ancestry-jump-schemas.ts` — `createAncestryJumpSchema` / `updateAncestryJumpSchema` (`MAX_JUMP_GENERATIONS = 200`, notes ≤ 5000, range ordering refine); `ancestry-jump-validators.ts` — pure `validateAncestryJump(data, candidate)` over the resolved tree's `GedcomData` (rules J1–J8, first violation wins; J8 cycle check via `getAllDescendants(..., { includeJumps: true })`), `ANCESTRY_JUMP_ERROR_MESSAGES` / `_STATUS` (incl. `child_has_jump` → `JUMP_BLOCKS_PARENTS_MESSAGE`), plus the move helpers `shiftJumpRange`, `planJumpMoveToNewFather`, `checkJumpMoveBack`; `ancestry-jump-guards.ts` — the parent backstop; `ancestry-jump-route-helpers.ts` — `jumpDto()` (hand-listed plaintext DTO, never the `Bytes` column) + `isDuplicateJumpError()` (`P2002` narrowing)
- `branch-pointer-merge.ts` — `extractPointedSubtree()` (downward-only; never carries `ancestryJumps` and strips the source's jump back-references via `stripJumpBackReferences`), `mergePointedSubtree()`, `detectOrphanedChildren()`, stitching helpers (child/sibling/spouse/parent)
- **Public Tree (`src/lib/tree/`)** — `public-serve.ts` (the one serving layer: `loadPublicTreeBySlug`, `buildPublicTreePayload`, `buildPublicNamesList`, withheld-branches; deny-by-default, structurally barred from the member merge; plus the search-discoverability helpers `isPublicTreeIndexable(record)` — the single `main`+`public_listed` predicate consumed by both `family/[slug]` render passes — and `listIndexableTreeSlugs()`, the sitemap data source mirroring it as SQL), `public-visibility.ts` (`redactForPublic` — the single public redactor; a «قفزة نسب» survives ONLY when the descendant AND every spouse of the ancestor family are public, otherwise it is dropped and its back-references deleted — fail-closed), `public-compose.ts` (compose home + source-public borrowed branches; carries HOME jumps only), `birth-date-privacy.ts` (130-yr living rule, hide living birth dates), `public-slug.ts` (auto-generated unguessable code), `going-private.ts` (unpublish: `freezeDependentPointers` converts live anchored links to frozen copies; `freezeCollectionLinks` (Chunk 4) deep-copies each affected anchor-less collection-link borrow into a new frozen extra tree and re-points its `CollectionItem` — skipping borrows whose source leaf is still public+reusable, the same gate the serve path uses); a published `extra` tree serves home-only (no borrowed branches), always `noindex`, gated by `enableCollections`
- `branch-pointer-deep-copy.ts` — `prepareDeepCopy()` (pure, new UUIDs + ID remapping) and `persistDeepCopy()` (DB writes for individuals, families, familyChildren, stitchFamily, ancestry jumps re-encrypted under the target key); `copyAncestryJumps()` — shared by `prepareDeepCopy`, `prepareTreeSnapshot` and both collection copy paths — copies a jump ONLY when both endpoints landed in the copy (fail-closed; back-references are deleted and regenerated on read); sources travel via `copySources` (see Sources library)
- **Person Page (`src/lib/tree/`)** — `person-projection.ts` (`projectPerson` — ONE pure function over already-loaded, already-redacted `GedcomData`; serves BOTH member + public surfaces, surface behavior injected via `ProjectOptions` — `MEMBER_PROJECT_OPTIONS` drills the female line to `Infinity` and stops at the top of a borrowed branch, public passes depth 1 + a home-tree boundary. Two hard invariants, both tested: (1) every upward walk EMITS a cross-workspace/foreign boundary node as a chip but never climbs past it; (2) private people are OMITTED from every relation group, surfacing ONLY as a non-clickable `«خاص»` `PRIVATE_PLACEHOLDER` in a direct-ancestor nasab position. `PROJECTION_NODE_CEILING` is a sanity bound. A «قفزة نسب» is walked like a father link at the top of a known line — the jump-reached `SpineChip` carries `jump: { generationsMin, generationsMax }` and the climb continues up the ancestor's own chain; `projection.ancestryJump` (`{ father, mother, range }`) is built independently so a female-only ancestor still surfaces), `person-jsonld.ts` (`buildPersonJsonLd` — the security-critical schema.org emitter; returns the Person graph ONLY when `indexable`, per-node gated on `publicDisplay !== 'redacted'`; a jump's ancestor couple is emitted as `relatedTo` ONLY — never `parent`/`children`/`spouse`/`sibling`, and the range/notes never enter the graph), `view-modes.tsx` (the single source for tree↔person nav hrefs)

**Sources library** (`src/lib/tree/source-*.ts`, «المصادر»):
- `source-visibility.ts` — the ONE gate, pure and fail-closed: `canViewSourceEntry(source, person, viewer)` (per (source, person): admin sees every level incl. on PRIVATE people; member sees `members`+`public`, NEVER on a private person; public sees `public` only on a person the public tree shows; `_pointed` people → nobody, served only by the owning workspace), `visibleLinkedPeople` (the ONLY input for names, counts and «مشترك مع»), `canViewSourceAnywhere` (admin always incl. orphans; else tree-wide gate or ≥ 1 visible linked person — member file route, preview, suggestions), `inheritedTreeEntry`. Invariants: sources never enter the tree GET payload, `GedcomData`, SSR, OG, sitemap or JSON-LD (`source-key-strip.ts#stripSourceKeys` is the fail-closed backstop in `redactForPublic`, `redactPrivateIndividuals`, `extractPointedSubtree`; the tree loader never selects `sourceLinks`); every hidden case is an identical 404; public viewers never get a people list or count
- `source-links.ts` (`validateLinkTargets`, `lastLinkOutcome`/`planLinkChange`, `planViewerDelete`, `loadLinkedPeople`, `householdIds`, family hints, `SourceSummaryDto`), `source-entry-route-helpers.ts` (DTOs, selects, `resolveSourceTreeOr404`, `viewerFor`), `source-entry-schemas.ts` (`MAX_SOURCE_TEXT = 2000`, `MAX_FILES_PER_ENTRY = 20`, `MAX_LINKS_PER_SOURCE = 500`, `MAX_BULK_IDS = 500`), `source-file-processing.ts` / `source-file-helpers.ts` / `source-file-types.ts` (upload pipeline, staging + `sweepStagedSourceFiles`), `public-sources.ts` (anonymous path), `public-shown.ts` (`isShownOnPublicTree` = not private, not `_pointed`, not presumed living — parity-tested with `redactForPublic`), `publish-sources.ts` (publish-step choice كلها / لا شيء / أختار بنفسي → bulk level-3), `source-entries-api.ts` (client wrappers), `source-staging.ts` + `source-plan-apply.ts` (IndividualForm staging → plan `creates/links/updates/unlinks/deletes`), `source-entry-undo.ts` (inverses; labels never contain the source text), `source-people.ts` + `relation-label.ts` (picker)
- `source-copy.ts#copySources(tx, { fromTreeId, toTreeId, targetWorkspaceId, idMap, mode, includeTreeWide })` — runs inside EVERY copy transaction right after `persistDeepCopy` (pointer copy, share-token revoke auto-copy, going-private `freezeDependentPointers`/`freezeCollectionLinks`, `copy-borrowed.ts`, own-tree collection copy + extra-tree duplicate via `prepareTreeSnapshot`). `same` (whole-tree, same workspace): every source incl. orphans + tree-wide, ciphertext as-is. `cross`: ONLY level-3 sources, ONLY links to landed people the public tree shows (`source-link-shown.ts`: not private, not presumed living), a source with no such link is dropped, text/names/bytes re-encrypted under the target key, no source-family user ids. Tree-wide travels only with whole-tree copies. Target quota NEVER blocks a copy: files that don't fit are skipped and counted (`skippedSourceFiles`); a file-only source left with nothing is dropped. `SOURCE_COPY_TX_TIMEOUT_MS = 60 s`
- Audit: `entityType: 'source_entry'` («مصدر»), `snapshotSourceEntry` (level, text inside the encrypted snapshot envelope, `fileCount`, `personIds` + `peopleCount` — never text in the description, never bytes); link changes log as `update` with `linksAdded`/`linksRemoved`

**Person Page UI** (`src/components/person/`, barrel `index.ts`): presentational `PersonPage` (Surface 3) consumes the projection shape — `NasabRibbon` (never shows the family name, member or public, with or without a jump; the family name appears only in the «من بيت X» tag), `BloodlineColumn`, `MotherDisclosure`/`MotherRibbon`, `FamilyHighlightProvider`/`RelationChip`, `ChipGroup`, `MarriageGroupCard`, `RadaBlock`, `AncestryJumpBlock` (the «قفزة نسب» card — ancestor father/mother chips, range, notes; the ONE place a female-only jump ancestor appears), `JumpDivider` (shared marker at a jump-reached chip, in place of the «بن» token: the `connector` variant renders «من وَلَد» — no feature name, no range — in the NAME ribbons `NasabRibbon`/`MotherRibbon`; the `chip` variant renders the canvas's dashed «قفزة نسب · range» pill, via `formatAncestryJumpLabel`, only in `BloodlineColumn`), `PersonRecord`, `PersonLink`, `ViewInTreeButton`. The member route (`/workspaces/[slug]/tree/(canvas)/person/[individualId]`) lives INSIDE `(canvas)/layout.tsx` so the sidebar/toolbar/providers persist across the tree↔person toggle (instant, no shell remount); it derives the fetched type from `<PersonPage>`'s own prop via `ComponentProps` (never imports `person-projection` directly). Always `noindex`
- `branch-pointer-schemas.ts` — Zod schemas for redeem token, share token creation
- `branch-pointer-queries.ts` — `getActivePointersForWorkspace()` with source workspace name join
- `branch-pointer-guards.ts` — `isSyntheticFamilyId()` for mutation guards on synthetic families; `isStitchablePointer()` narrows a pointer to a real anchored one (excludes anchor-less collection links from the deep-copy/stitch path)
- `cascade-delete.ts` — `computeDeleteImpact()` (BFS reachability with married-in spouse exclusion + upward traversal guard; deliberately JUMP-BLIND — a «قفزة نسب» ancestor is a claim, not a dependent, locked by comment + regression test), `computeVersionHash()`, `buildImpactResponse()`. `queries.ts#pruneEmptyAncestryJumps(treeId)` runs inside the individual DELETE transaction to drop jumps whose ancestor family lost both spouses
- `family-validators.ts` — centralized gender validation: `validateFamilyGender()` (DB), `validateSpouseGender()` (pure)
- `rada-validators.ts` — validation for rada'a family operations (duplicate checks, workspace feature toggle)
- `branch-share-token.ts` — share token generation and validation utilities
- `seed-place-mapping.ts` — place ID mapping helpers for seeding
- `audit.ts` — snapshot extraction functions (`snapshotIndividual`, `snapshotFamily`, `snapshotRadaFamily`, `snapshotAncestryJump`, `snapshotBranchPointer`) and `buildAuditDescription()` Arabic description builder (`entityType: 'ancestry_jump'` → «قفزة نسب»)
- `audit-log-schemas.ts` — Zod validation for audit log query params (page/limit/action/entityType/entityId/userId)
- `undo-builders.ts` / `undo-label.ts` — inverse builders incl. `buildCreate/Update/DeleteAncestryJumpInverse` and `buildMoveJumpToNewFatherInverse` (undo = move-back, redo = move again); labels «قفزة نسب إلى {name}», «نقل قفزة النسب إلى {father}»

**GEDCOM Export** (`src/lib/gedcom/exporter.ts`):
- `gedcomDataToGedcom(data, version)` — serializes `GedcomData` to GEDCOM 5.5.1 or 7.0 format
- Supports all Islamic extensions: `@#DHIJRI@` calendar escape, MARC/MARR/DIV, `_UMM_WALAD`, `_RADA_*`, `_KUNYA` tags
- «قفزة نسب»: one standard `ASSO` under the descendant pointing at `husband ?? wife` (`2 RELA ancestor` on 5.5.1, `2 ROLE _ANCESTOR` + `3 PHRASE` on 7.0 with `SCHMA` URIs under `https://gynat.com/gedcom/ext/`), the couple in `2 _ANC_FAM @F…@`, `_GAP_MIN`/`_GAP_MAX` when set, and always a `NOTE` whose lead is generated with names («قفزة نسب: {descendant} من وَلَد {ancestor}، والأجيال بينهما مطويّة.»); skipped for `_pointed`/private and when either ancestor spouse is private. Import (`parser.ts`) reads only `RELA ancestor` / `ROLE _ANCESTOR` associations (any other `ASSO` is ignored), resolves the family via `_ANC_FAM` → first `FAMS` → a synthesised one-spouse `FAM`, then runs the same `validateAncestryJump` gate the API uses
- GEDCOM injection sanitization on all user-provided strings (`sanitizeLine` for single-line fields; `emitNote` normalises `\r` and doubles `@` → `@@` for every NOTE, which the parser reverses)

**Profile** (`src/lib/profile/`):
- `validation.ts` — Zod schemas for profile update, email change, password change
- `tree-settings.ts` — tree color/display settings types and defaults

**Email** (`src/lib/email/`):
- `transport.ts` — Nodemailer with Gmail SMTP
- `templates/invite.ts` — Arabic RTL invitation email (HTML-escaped dynamic values, URL-validated links, header-injection-safe subjects)
- `templates/report.ts` — Arabic RTL public-tree report alert (same obsidian/gold branding as invite); sent to `SITE_CONTACT_EMAIL` on a public-tree report, with the complaint, reporter contact, view-tree link, and slug/tree/workspace IDs for manual handling

**Site** (`src/lib/site.ts`):
- `SITE_CONTACT_EMAIL` — single source for the public contact / support address (also where public-tree reports are emailed); used by layout metadata, the landing footer, and the report route

**Workspace utilities** (`src/lib/workspace/`):
- `join-code.ts` — `crypto.randomBytes()` with 8 random characters (A-Z0-9), format: `SLUG_PREFIX-XXXXXXXX`
- `labels.ts` — `roleLabel()` maps workspace roles to Arabic display labels

**Seed** (`src/lib/seed/`):
- `seed-workspaces.ts` — creates workspaces from family configurations for local development
- `seed-places.ts` — seeds Place table from preprocessed GeoNames JSON (`prisma/seed-data/places.json`)
- `geonames-parser.ts` — TSV line parsers for raw GeoNames data (used by `scripts/preprocess-geonames.ts`)

**Places** (`src/lib/places/`):
- `schemas.ts` — Zod schemas for place search and creation API

**Workspace & Profile UI**:
- `/workspaces` — workspace list (مساحات العائلة), create button, logout
- `/workspaces/create` — create workspace form (اسم العائلة, slug, description)
- `/profile` — user profile page with sectioned settings: `ProfileHeader` (display name, avatar), `AccountSettings` (email change), `SecuritySettings` (password change), `TreeDisplaySettings` (calendar preference). Components in `src/components/profile/`
- `/workspaces/[slug]` — workspace detail with members, invite modal, tree link
- `/workspaces/[slug]/tree` — database-backed tree view with edit controls (add/edit individual, add child/spouse/parent, «قفزة نسب» on a person with no parents, move child, edit family events, delete)
- `/workspaces/[slug]/tree/audit` — audit log page (admin-only, requires `enableAuditLog`): browsable edit history with filtering, pagination, expandable before/after diff viewer
- `/workspaces/[slug]/tree/sources` — «المصادر» admin page (admin-only; toolbar link admin-only; `?treeId=` for extra trees): `TreeSourceCard` («مصدر الشجرة») on top, then `SourcesManager` — one row per source, tabs «الكل / مشترك / ليس مصدرًا لأحد», level filter + search, «مصدر لـ» names with × (last one → `LastLinkDialog`) and «＋ إضافة أشخاص» (picker, no locked person), «تحديد الكل» over every match + bulk level change / delete. Admin-page and bulk actions are NOT undoable
- `/workspaces/[slug]/trees` — extra-trees management (requires `enableCollections`): the locked main tree + lightweight extra trees, with create/rename/delete/duplicate (collections feature off by default; toggle + join-code panel live in the `/workspaces/[slug]` settings page). Click an extra tree's title (or a tree inside a collection) to open the full editor on it via `/tree?treeId=<id>`
- `/workspaces/[slug]/collections` + `/workspaces/[slug]/collections/[collectionId]` — collections list + detail (requires `enableCollections`): create collections, add own trees/branches as items, nest collections, add another family's tree/branch via link (public-slug or private share code; linked or copied), publish a single extra tree (make-public ladder), and publish the collection itself (`CollectionVisibilityModal` with the "what's withheld" warning)
- `/collections/[slug]` — public, no-login viewer for a published collection (Collections Chunk 4); deny-by-default (private/unknown/`enableCollections`-off → 404); `noindex` UNLESS the collection is `public_listed` AND fully-listable (every servable leaf tree, recursively, is itself `public_listed` — a link-only leaf blocks listing, fail-closed) — then it carries OG + `CollectionPage`/`BreadcrumbList` JSON-LD and appears in the sitemap (search-discoverability chunk, 2026-06-18); a brand-faithful (`/design-preview` vocabulary) card grid of the collection's public trees, each card opening that tree's own `/family/[slug]` viewer (`PublicCollectionPageClient`)
- `/invite/[id]` — invitation acceptance page
- `/policy` — public policy page (Arabic only)
- `/islamic-gedcom` — public reference page (مرجع GEDCOM الإسلامي): `@#DHIJRI@` calendar escape for Hijri dates, MARC/MARR/DIV Islamic marriage mappings, `_UMM_WALAD` (أم ولد flag on FAM), rada'a extensions (`_RADA_FAM`, `_RADA_WIFE`, `_RADA_HUSB`, `_RADA_CHIL`, `_RADA_FAMC`), «قفزة نسب» (standard `ASSO`/`RELA`/`ROLE`/`NOTE` + custom `_ANCESTOR`, `_ANC_FAM`, `_GAP_MIN`/`_GAP_MAX`; the only scholarly line used is «الأمر عندنا الإمساك عمّا وراء عدنان إلى إسماعيل» — never «كذب النسابون» or «إذا بلغ نسبي عدنان فأمسكوا»), `_KUNYA` (الكنية)
- `/workspaces/[slug]/tree/person/[individualId]` — member Person Page (صفحة الفرد): read-only profile for one person, toggled with the tree canvas inside `(canvas)/layout.tsx`. Respects the same profile color/calendar settings as the tree
- `/family/[slug]` — public, no-login read-only tree viewer for a published tree (Public Tree v1); deny-by-default (private/unknown slug → 404), SSR-crawlable names list, `noindex` unless `public_listed` (a `main` tree only — `extra` trees always `noindex`); when `public_listed` it carries OG + `WebPage`/`BreadcrumbList` JSON-LD (no `Person`/genealogy schema — would leak redacted living PII) and is listed in the sitemap; indexability is the single `isPublicTreeIndexable(record)` predicate; each name in the crawlable list becomes a link to that person's page only when `isPublicPersonPageIndexable` (listed + per-tree opt-in), plain text otherwise; carries a discreet "report this tree" link (`PublicTreeViewer`)
- `/family/[slug]/person/[individualId]` — public, no-login Person Page for one published person; deny-by-default (private/unknown → 404, no existence oracle); `noindex` and no schema.org `Person`/genealogy JSON-LD unless `isPublicPersonPageIndexable` (listed + per-tree opt-in); title is the person's 2-generation nasab plus the family name, built from the already-redacted payload (`PublicPersonView`)
- `/family/[slug]/report` — public, no-account report page (`ReportPageClient` → `ReportForm`); deny-by-default; POSTs to the report endpoint. Linked from the viewer footer + the make-private dialog's "request permanent removal" link
- `/auth/forgot-password` — password reset via Supabase Auth

**Environment Variables** (see `.env.example`):
- `.env` — `DATABASE_URL` (used by Prisma CLI)
- `.env.local` — `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`
- `docker/.env` — Docker Compose secrets (gitignored)

### Testing

- All test files are centralized in `src/test/` (not co-located with source)
- Test fixtures (GEDCOM files) in `src/test/fixtures/`
- Naming: `*.test.ts` / `*.test.tsx`

### Dev Tools

- `?playground` query param renders `Playground.tsx` (SVG-line-based tree layout experiment) instead of the main app

### Security

- **Security headers**: `next.config.ts` sets X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy, HSTS, X-DNS-Prefetch-Control on all routes
- **Rate limiting**: Kong plugin (30/min on auth routes) + in-memory per-user rate limiting on API routes (see `src/lib/api/rate-limit.ts`)
- **Input validation**: All Zod schemas have `.max()` constraints on string fields
- **Privacy enforcement**: `isPrivate` individuals have PII redacted server-side before API response (names → "خاص", dates/places cleared, tree structure preserved)
- **Error handling**: Unknown errors return generic 500 responses — no stack trace leakage
- **Workspace limits**: Max 10 owned workspaces per user; workspace creation rate limited
- **Invitation security**: Generic error messages prevent enumeration; member list returns only `id`/`displayName`/`avatarUrl`

