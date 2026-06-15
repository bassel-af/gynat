# Product Requirements Document — Public Tree & Collections

**Status**: Design agreed (decisions captured) — not yet planned for implementation
**Audience**: Human developers, AI coding assistants
**Created**: 2026-06-15
**Revised**: 2026-06-15 — folded in decisions from a scenario gap review (§1.3, §1.7, §1.10, §1.11, §2.10); added build sequencing (§5); added implementation-planning decisions from the architect/security/designer team review (§7)

This document captures the **decisions** for two related features — Public Tree and Collections — together with the **reasoning** behind each one, so future work understands not just *what* we chose but *why*. It deliberately stops short of technical implementation (schema, endpoints, components); that comes in planning.

Parent overview: `docs/prd-next-features.md` (§1 Public tree, §2 Collection of trees). Related: `docs/prd-seo.md`, `docs/design-branch-pointers.md`.

---

## 0. The cross-cutting question this resolves

Both features depended on one unresolved question from the parent PRD: *what is the right shareable/ownable unit — workspace, tree, or something new?*

**Decision:** The workspace stays the home and the team that runs everything. We do **not** invent a new top-level ownable entity. Instead, a workspace can now hold **more than one tree**:

- **One fixed main tree** — the family tree, exactly as today.
- **Optional extra trees** — lightweight trees that exist *only* inside collections, available only when the collections feature is turned on.

**Why:** A researcher or teacher documenting many trees should not have to create many workspaces (today there is also a 5-workspace-per-user cap, which would block this outright). Forcing one-workspace-per-tree was the heavy, wrong unit. Letting a single workspace hold a heavy main tree plus many light extra trees gives us the "lightweight tree" we needed without a new ownership concept, without a workspace explosion, and without touching the familiar "one family, one tree" experience for everyone else.

---

## 1. Public Tree

### 1.1 Goal & why
Let a family share its tree with the public via a link, and — if they choose — let it be found on Google. This is the first time this otherwise-private platform faces the open internet, so privacy, consent, and the fact that some exposure can't be undone are first-class concerns, not afterthoughts.

### 1.2 Three levels of visibility
A tree can be:
1. **Private** — members only (today's behavior).
2. **Public by link** — anyone with the link can view; explicitly **not** listed in search.
3. **Public and listed in search** — can appear in Google results.

**Why three, not two:** Making a tree reachable by link and making it show up in Google are different decisions with very different consequences (see §1.6). Collapsing them into one switch would push families into search-indexing without a deliberate choice. "Public by link" is the safe default first step; appearing in search is a separate, conscious opt-in.

### 1.3 The publishing checkpoint
Before a tree goes public, the publisher is shown **all the living people** in the tree in one view, confirms them together (not one person at a time), **and must type a short phrase** (e.g., the public link name) to actually proceed.

**Why show all living people:** Living relatives are the people most at risk from public exposure (identity theft, the classic "mother's maiden name" security question, stalking) and the most likely to have never consented to being on the public internet. The publisher must see exactly who they are exposing.

**Why confirm all at once, not one-by-one:** Reviewing each person individually is too much friction and people would abandon it — we want the safe path to be usable.

**Why require typing a phrase:** Repeated confirmation dialogs cause "warning fatigue" (habituation) — people click past things they've seen before without reading. Forcing the publisher to *type* something breaks that reflex and makes the action deliberate. We already use this "type-to-confirm" pattern for large deletions, so it's consistent.

**Who counts as "living":** a person is treated as living if they are **not** marked deceased **and** are not provably old enough to have died — specifically, anyone whose birth date would make them **130 years or older is presumed deceased** and excluded from the checkpoint. People with neither a birth date nor a deceased mark are treated as living (they appear in the checkpoint). *Why:* the deceased mark alone is unreliable — many real ancestors are never marked — which would otherwise flood the checkpoint with long-dead people and make it meaningless. The 130-year cutoff is a safe, well-understood genealogy rule that clears out the obviously-deceased without risking a living person.

### 1.4 Privacy posture: rules + accountability, not silent hiding
We considered silently auto-hiding living people from public view. **We rejected that.** Instead:

- **Clear platform rules**: publishing living people's private details is not allowed, with explicit exceptions (publicly-known individuals such as public figures; documented consent; other allowed reasons).
- **Respectful warnings**: violating the rules can lead to the tree being taken down or the account suspended — communicated kindly, not threateningly.
- **Accountability through the checkpoint** (§1.3): because the publisher consciously confirmed and typed to proceed, "I didn't know" is not a defense, which makes enforcement fair.

**Why not silent auto-hiding:**
- It would rely on the "deceased" mark, which is user-set and therefore **gameable** — not a real safeguard.
- It **breaks the tree** (e.g., living parents of a deceased child would be blanked, leaving holes).
- It **punishes legitimate use** — a scholar documenting a well-known family is the whole point of public trees, and auto-hiding would defeat it.

**Note on the "known family" exception:** it should apply to publicly-known *individuals*, not blanket whole families — even a royal family's tree contains private, non-famous living people.

### 1.5 Removal / report path
Anyone (including non-users) can request that a public tree exposing them be taken down, and admins can unpublish.

**Why:** A relative may be added to a public tree by someone else without their knowledge. Ethically and legally we need a way for an exposed person to get their data removed, independent of who published it.

### 1.6 Reversibility is asymmetric (this is the key rationale behind §1.2)
- **Private → public** is instant and fully reversible *on our side*.
- **Public → private** stops us serving the tree immediately (and we signal search engines to drop it), **but anything already indexed or cached by Google/Bing/archive.org can linger** until they recrawl, and some web archives may keep a copy indefinitely.

**Why this matters:** Turning off the link is reversible; **being listed in search is effectively a one-way door.** This is exactly why search-listing is a separate, deliberate switch (§1.2), why we default to "by link only," and why the publish dialog must plainly warn that once a tree is public and indexed, it cannot be guaranteed to be fully removed from the internet. (Also: changing the public link name after indexing needs redirects so rankings aren't lost — to be handled in planning.)

### 1.7 Search indexing — staged
- **For now:** if a publisher chooses "listed in search," that's allowed directly.
- **Later stage (after the main next-steps ship and deploy):** a **platform admin must approve** a tree before it can be listed in search.

**Why staged:** Admin approval is a safety valve against abuse and accidental exposure at scale, but it's operational overhead we don't need on day one. We ship the capability first and add the gate once volume justifies it.

**Collections are never search-indexed.** Only public *trees* are ever eligible for search listing (under the staged model above). *Why:* trees are the primary content worth surfacing; collection pages are curation wrappers that don't need their own search presence, and excluding them keeps the indexable surface small and easy to reason about.

**Known requirement for real discoverability:** the interactive, draggable tree view is essentially invisible to search engines (it's rendered by in-browser JavaScript). For a public tree to genuinely appear in and benefit from search, it needs plain, server-rendered readable pages (for example, a readable page per public person, the way large genealogy sites do it). This connects to `docs/prd-seo.md` and must be addressed in planning as part of the indexable surface.

### 1.8 Borrowed branches from other families
We already let a family display a branch borrowed from another family's tree. This creates a leak risk: Family B borrows a private branch from Family A, then B makes B's tree public — exposing A's private people.

**Decision:** A borrowed branch is shown publicly **only if the source family's tree is itself public.** When B publishes, any branch borrowed from a *private* family is automatically **withheld** from the public view (B's own data still publishes fine), and B is told plainly why.

**Why this rule (and not a per-share opt-in toggle):** It's one simple, safe rule that's easy to explain, and it follows the platform-wide principle that *you can never expose someone else's data more broadly than its owner allows.* Every extra opt-in toggle is another chance to expose data by mistake.

**Copied branches:** a family can also *copy* a borrowed branch into its own tree (severing the link), after which the "is the source public" check no longer applies. This is backstopped by the publishing checkpoint (§1.3): copied living people still appear in the show-all-living + type-to-confirm step, so the publisher consciously takes responsibility before they go public.

### 1.9 Who controls it
Only **workspace admins** can change any visibility or indexing setting.

**Why:** Exposure to the public internet is a high-consequence, irreversible-in-part decision; it belongs with admins, not every member.

### 1.10 Public does not automatically mean reusable
Making a tree public makes it **viewable**. It does **not** automatically allow others to pull it into their own collections. The owning family opts in to reuse with a separate setting (a simple "others may include this tree in their collections" checkbox).

**Why:** "Anyone can look at my tree" and "anyone can repackage my family into their own material" are two different permissions. A family might be glad to be viewable but unhappy to be featured — possibly uncredited — inside someone else's course. Keeping the two separate leaves control with the source family.

### 1.11 Going private, copies, and the admin takedown
Three related rules govern what happens to data that has already been shared:

- **Routine "make private" must not break dependents.** When a family turns a previously-public tree private, any **live links** to it from other collections are **automatically converted into frozen copies** at that moment. The tree stops being publicly viewable on its own, but the collections that relied on it keep working.
- **Deliberate copies are permanent snapshots.** When a curator copies a tree, we **warn** that it's a permanent snapshot — it won't track the source's later edits or removals. We don't auto-propagate changes to copies.
- **Genuine privacy problems use the report → admin takedown path.** If data should never have been public (a privacy violation, or a complaint from an exposed person), the affected party reports it and an **admin can remove it everywhere — including from copies.** To make that possible, every copy keeps a hidden record of where it originally came from.

**Why:** This is the "left-pad" lesson from software packages — letting one family silently un-publish and instantly destroy dozens of curators' collections is its own kind of harm, so the routine path preserves dependents instead of breaking them. But personal data still needs a hard escape hatch, so the report → admin global takedown always exists. The two paths reflect two different intents: *"I want to stop sharing going forward"* versus *"this must come down everywhere, now."*

**Tension to keep in mind:** preserving copies over a family's wish to retract is the right call for stability, but it sits uneasily with personal genealogy data. So the "make private" dialog must be honest that copies already sitting in others' collections will remain, and must point clearly to the report path for true removal.

---

## 2. Collections

### 2.1 Goal & why
Let a curator (e.g., a teacher or researcher) group several trees together under one shareable unit — so they can share *one* thing instead of many separate links that get lost over time. The motivating example: a teacher recording public trees for a subject and providing them to students durably.

### 2.2 A collection is a container with a visibility setting
A collection is not inherently public or private — it's a container that carries its **own visibility**, using the **same three-level ladder as trees** (private / by-link / public).

**Why:** The use cases span the full range — a researcher publishing a subject to the world (public), a teacher sharing with their students, a family teaching their household, a parent teaching their children (all private/invite). Treating "public vs private" as a property rather than the nature of collections covers every case with one consistent model, and reuses the visibility concept users already learn from trees.

### 2.3 Items are whole trees or branches — linked or copied
Each item in a collection is **its own tree or branch**, added by sharing a branch (typically by picking the topmost person so everything beneath comes along) and then either **linking it live** (stays in sync with the source) or **copying it** (a frozen, owned copy). Each item carries its own title and description.

**Why (and why *not* "the same tree shown at increasing depth"):** An earlier idea — one tree displayed deeper and deeper across items — was rejected as needless complexity. Separate trees/branches per item is simpler, matches how curators actually think, and reuses the share-a-branch capability (including the existing link-vs-copy choice) we already have. Collections become mostly an *organizing layer* on top of existing capabilities, not a new engine.

### 2.4 Collections can nest (collection of collections)
A collection can contain other collections, forming a hierarchy the curator labels however they like (e.g., region → tribe → family, or course → module → item).

**Why:** Real curation needs grouping at scale; a flat list doesn't organize a large body of material. We don't hard-code level names — they're just collections inside collections. The only guard rail is preventing a collection from being placed inside itself (no loops).

### 2.5 Where the trees come from (multiple trees per workspace)
A collection's trees come from:
- The workspace's **own main tree** (whole, or branches of it).
- **Extra trees** created inside this workspace (these exist *only* inside collections — see §0).
- **Public trees** borrowed from other workspaces (linked live or copied).
- **Branches privately shared** into this workspace by other families.

A collection **points at** these — it does not merge them into the workspace's main family tree. The "one workspace, one main tree" rule still holds.

**Why:** This is what resolves the researcher-with-many-trees problem without creating many workspaces (§0). It also keeps the family's own genealogy separate from borrowed/curated material, which stays side-by-side without mixing.

### 2.6 Extra trees are lightweight
Extra trees are *just trees* — they don't each get their own news, albums, or events. That surrounding content stays at the **workspace level** and belongs to whoever is in the workspace.

**Why:** Keeping extra trees light is the entire point — it's how a workspace can hold many of them without becoming heavy or confusing. It's also what makes them the "lightweight tree" the researcher case needed.

### 2.7 Managed by the workspace's existing team
Collections are managed by the **workspace's existing team** (admins, plus members given responsibility for collections) — there is **no separate collection team**.

**Why:** The team and roles already exist; reusing them means nothing new to build and multi-person management for free. The separation a teacher actually wants (keeping public teaching material away from their private family) is achieved by making a **separate workspace** for teaching — not by a separate team inside one workspace. This also means a workspace is no longer strictly "a family": most are families, some are teaching/research spaces, with the same machinery either way.

### 2.8 Viewing is just membership
People who should *view* a private collection simply become **members** of the workspace. Members can view but not modify; only admins (and members given editing rights) can change things. Public collections need no list at all — anyone can view.

**Why (and why *not* a separate guest list):** We already have admins/members with view-vs-edit built in, so a separate viewer list would be redundant. Students become members and can see without editing. The existing workspace join-code (see §3) makes onboarding a whole class easy. Consequence to keep in mind: membership covers the *whole* workspace, so if a curator needs different groups to see different things, they use separate workspaces — consistent with §2.7.

### 2.9 Off by default
Collections are disabled by default and turned on per-workspace in settings, like other optional features.

**Why:** The vast majority of families never need collections. Keeping it off by default keeps their interface simple and uncluttered; only those who ask for it ever see the extra-trees and collection concepts.

### 2.10 Publishing a collection (and what it includes)
A tree inside a collection can be public **either** on its own (a standalone public tree) **or** as part of the collection. When a collection is published, it shows **only the trees that are public** — any private trees in it are **withheld**. At the moment a curator shares or publishes a collection, we **clearly tell them which of their trees are private and therefore won't appear.**

**Why:** This is the §3 safety principle applied to collections — a public collection can never widen the visibility of a private tree — but the curator needs to *see* what's being withheld so the published result isn't a surprise.

**Scope note:** the private-tree handling and the warning here are **deferred to the last implementation step** of this feature. The core collection experience can ship before this edge case is fully built.

---

## 3. Cross-feature safety principle

One principle ties both features together and cascades through every level of nesting:

> **You can never expose data more broadly than its owner allows.**

Concretely: a public collection can only contain public trees; a borrowed private branch is withheld from any public view unless its source family is public; copied living people still pass the publishing checkpoint; and a collection inherits these limits at every level of its hierarchy.

**Why:** It's a single rule that's easy to reason about and apply everywhere, instead of a patchwork of per-feature exceptions that are easy to get wrong.

---

## 4. Deferred / later (with why)

- **Platform-admin approval for search listing** — later stage (§1.7). *Why later:* operational overhead not justified until volume grows; ship the capability first.
- **Server-rendered readable pages for true search discoverability** — required for indexing to actually work (§1.7); scope to be set in planning. *Why flagged:* the interactive canvas alone won't rank.
- **Published-snapshot / versioning of public trees** — future; v1 serves the live (redacted) tree with caching. *Why later:* the publishing checkpoint and rules make live serving safe enough; snapshots add control we don't yet need.
- **Per-collection granular viewing (separate viewer lists)** — not planned; separate workspaces cover it (§2.8).
- **Collection publishing's private-tree handling + warning** — build last (§2.10). *Why later:* the core collection experience works without it; it's a refinement on the publish step.

**Consciously set aside (for now):**
- **Re-review of living people added *after* a tree is already public (scenario gap 3)** — still open; new living people added post-publish do not currently re-trigger the checkpoint. Security recommends at minimum audit-logging additions to an already-public tree; a lightweight re-confirmation prompt is a candidate refinement.

**Resolved since (see §7):**
- **Ordinary living people (scenario gap 1)** — resolved in §7.2: ordinary living people ARE shown (in the checkpoint and on the public view), with their exact birth date hidden; the publisher is accountable. Not excluded or blanked.

---

## 5. Sequencing & build order

**Decision:** Public Tree and Collections ship **separately and in sequence — Public Tree first, then Collections — on one shared foundation** laid deliberately in the first effort, so Collections slot on without a rebuild.

**Why sequential, not together:**
- **Collections depend on Public Tree.** They pull in public trees from other workspaces, reuse the same private / by-link / public visibility levels (§1.2), consume the "public but not reusable" opt-in (§1.10), and a published collection only shows trees that are already public (§2.10). Collections cannot be finished before Public Tree exists.
- **Public Tree is valuable on its own** — families sharing and being found brings people in, independent of collections.
- **Smaller, safer releases.** Public Tree is the highest-risk piece here (the first time the platform faces the open internet); harden that base before layering curation on top.
- **Collections add surface Public Tree doesn't need** — e.g., multiple trees per workspace exist *only* for collections (§0); Public Tree just publishes the main tree.

**Design-ahead caveats (decide the shape during the first effort, even if built later):**
- The way trees are stored must allow **more than one tree per workspace from the start**, even if Public Tree only ever uses the main one — otherwise adding extra trees later is a painful change.
- The **reuse opt-in** (§1.10) and the **going-private / report-and-takedown machinery** (§1.11) should be shaped early so Collections plug in rather than forcing a redo.

**Rough order:**
1. **Public Tree** — visibility levels, read-only public view, publish checkpoint, borrowed-branch protection, make-private + report. *Within-phase follow-ons:* server-rendered readable pages for real search ranking (§1.7), and platform-admin approval for search (§1.7).
2. **Collections** — turn-on setting, extra trees, nesting, link/copy items, members-as-viewers (plus surfacing the join-code, §6), with "publish only public trees + warn" (§2.10) built last.

---

## 6. Implementation note (dependency status, not design)

- **Workspace join-code:** the back-end capability exists (generate a code, join by code), but there is **no user interface for it yet** — members are currently added by email invitation. Surfacing it (a button to generate a code, a place to enter one) is a small follow-up, relevant to the teacher-and-students flow in §2.8. (Not to be confused with the "create share code" button in a workspace, which shares tree *branches*, a different feature.)

---

## 7. Implementation-planning decisions (team review — 2026-06-15)

A planning team (software architect, security engineer, frontend designer) turned §1 into a concrete v1 plan. The decisions below are now binding for Public Tree v1; they **refine, not replace,** the product decisions above.

### 7.1 The public view is a separate, deny-by-default path
- Public serving is its own route and its own additive composition: it starts from nothing and includes only explicitly-published, safe data. It never reuses the members' serving path or its cross-workspace data merge. *Why:* this is the first anonymous, internet-facing surface; a separate locked-down path (rather than the member view behind a flag) means data can't leak through a mis-set flag or a future edit.
- A **single public redactor** is the one filter for BOTH the public data feed and the readable pages (§7.6), backed by automated "nothing leaks" tests (including a structural test that the public route cannot even import the member merge). *Why:* prevents the two public surfaces from drifting and leaking different things.

### 7.2 What a stranger sees of a living person (resolves §4 gap 1)
- Living people appear (name + how they connect), but their **exact birth date is hidden**.
- Anyone **born more than 130 years ago is treated as deceased** and shown in full.
- **One single rule** decides who is "living," used identically by the publish checkpoint and the public view, so they can never disagree.
- *Why:* the owner chose rules-and-accountability over auto-hiding, but a full birth date is the single most abusable detail, so it's hidden by default while the person otherwise appears.

### 7.3 Life story (سيرة) and notes are shown in full
- A person's biography and notes are shown publicly **in full, for living and deceased alike** (no trimming). *Why:* a biography exists because someone deliberately wrote it to be read — unlike a birth date, its presence signals intent to share. Responsibility sits with the publisher (the rules + the publish checkpoint), consistent with §1.4.

### 7.4 An existing privacy setting must be fixed
- The "hide birth date" workspace option is currently applied only in the browser, so the real date is still sent to the client. Before public launch it must be enforced **server-side**. *Why:* harmless for members, but a real data leak on a public page.

### 7.5 Borrowed branches in v1
- Borrowed branches **do** appear on public trees in v1, but only if the family they came from is **also public**; otherwise they're withheld. The public privacy rules (hidden birth dates for living people, etc.) apply **uniformly** to borrowed people too (compose first, then redact once over the final set). *Why:* borrowing is core to the product (and to Collections later); withholding it would gut the value. The source-must-be-public rule (the owner's own §1.8 decision) keeps private families safe.

### 7.6 Readable pages for search
- Real search ranking needs plain, **server-rendered readable pages** (one per public person, plus a family overview), since the interactive tree can't be read by search engines. They reuse the same public redactor. Link-only trees stay out of search; only "findable in Google" trees enter the sitemap.

### 7.7 Link shape, abuse, and the report path
- **Link-only** trees use a long, **unguessable** link (can't be discovered by guessing); **findable-in-Google** trees use a clean, readable address. The publish **type-to-confirm phrase** should be something the admin recognizes (e.g., the family name / chosen public title), independent of the actual link.
- Public routes get their own traffic throttling (today's limits only cover logged-in users) plus heavy caching to blunt scrapers.
- The **report path** is a public, no-account page reachable from every public tree and the make-private box; reports are rate-limited and an admin reviews before any takedown (no automatic takedown from a report).

### 7.8 Make-private tone
- The "make private" (un-publish) confirmation is **calm and matter-of-fact**, honestly noting that copies already in others' collections remain and that search engines/archives may retain copies, with the "request permanent removal" option clearly visible.

### 7.9 Multi-tree foundation laid now
- The data model will allow **more than one tree per workspace from day one** (even though v1 uses only the main tree), so Collections drop in later without a rebuild — per §5.

### 7.10 Next step before building: static design mockups
- The designer will produce **static, non-functional mockups** of the key screens (public viewer, publish flow + checkpoint, make-private dialog, readable person/family pages) for the owner to review **before any implementation** — so gaps surface early and are cheap to reverse.
