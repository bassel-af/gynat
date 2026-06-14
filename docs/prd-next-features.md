# Product Requirements Document — Next Features

**Status**: Draft — scope captured, not yet planned
**Audience**: Human developers, AI coding assistants
**Created**: 2026-06-14

This document captures the **what** and **why** of the next batch of features. It intentionally does **not** prescribe **how** — architecture, data model, API, and UI decisions will be made during planning. Each feature lists open questions that planning must resolve.

For the overall product vision and core concepts, see `docs/prd.md`. For how subsystems work today, see `docs/implementation.md`.

---

## Priority Order

The agreed priority, highest first:

1. **Public tree** — share trees publicly via link, optionally indexable
2. **Collection of trees** — group multiple (public) trees under one shareable unit
3. **Deep citation** — per-field citation sources for a person's information
4. **Flexible tree** — let users drag nodes freely, overriding the layout algorithm
5. **Another ways for presenting** — alternative tree presentation modes

---

## 1. Public Tree

### Summary
Allow users to share a tree with the public through a link. If the owner decides, that public tree can also become **indexable** (discoverable by search engines).

### Why
- Families want to share their tree beyond workspace members.
- Public discoverability can bring in relatives and grow the platform.
- Currently the platform is private by design; this is the first deliberate public surface beyond the marketing pages.

### Scope notes from the owner
- Sharing is **opt-in** via a link.
- Indexability is a **separate, explicit decision** by the owner — a public link does not automatically mean search-engine indexable.

### Open questions for planning
- What is the unit of public sharing — a whole workspace, a single tree, or a subtree/branch? This needs to be decided by reasoning about the current model, the public tree concept, the collection-of-trees feature, and likely future features.
- How does public sharing interact with privacy enforcement (`isPrivate` individuals, redaction)?
- How does it relate to existing branch pointers and share tokens?
- What does an unauthenticated public viewer experience look like (read-only, which fields, which controls)?
- Indexability: what gets indexed, and how does this interact with the existing SEO surface (`docs/prd-seo.md`)?

---

## 2. Collection of Trees

### Summary
A way to group multiple trees together under a single shareable unit — so that someone curating several public trees on a subject can share **one** thing instead of many separate links.

### Why
- The owner's example: a teacher or researcher recording public trees for a specific subject wants to provide them to others. Sending multiple individual links is fragile — links get lost over time.
- A collection gives curators a durable, single entry point to a set of trees.

### Open questions for planning
- Relationship to "Public tree" — does a collection only hold public trees, or also private/workspace trees?
- Who can create and curate a collection (any user, researchers, a special role)?
- Is a collection owned by a workspace, by a user, or is it a standalone entity? (Tie to the same modeling decision raised under Public Tree.)
- Can the same tree appear in multiple collections?
- Is a collection itself public/indexable, and how does that compose with each tree's own public/indexable setting?

---

## 3. Deep Citation

### Summary
Every piece of a person's information can have an **optional citation** to a source. Users can either pick from existing citation sources they've created, or write a new one.

### Why
- Genealogy credibility depends on sourcing. Letting users attribute where each fact came from raises trust and rigor.

### Scope notes from the owner
- Citation is **per-field and optional**: e.g., the person's name can have a citation, their birth date can have a citation, etc.
- Users can **create a citation source once and reuse it** (select from existing sources) or write a new one inline.
- There should also be an **optional shortcut to cite all of a person's information from a single source** (e.g., name, birth date, and everything else all come from one source).

### Open questions for planning
- Which fields are citable, and is the set fixed or extensible?
- What does a "citation source" contain (free text, structured fields, links, documents)?
- Are citation sources scoped to a workspace, a user, or shared more broadly?
- How are citations displayed in the tree / person detail, and are they exported (e.g., GEDCOM `SOUR`)?
- How do citations interact with privacy, public trees, and audit logging?

---

## 4. Flexible Tree

### Summary
Let users override the automatic layout by **dragging nodes themselves**, because the layout algorithm sometimes positions nodes poorly (e.g., nodes displayed far away). This is **optional** and based on user preference per tree.

### Why
- The custom tree layout algorithm cannot satisfy every family structure; manual adjustment gives users control when the automatic result looks bad.

### Scope notes from the owner
- Optional, driven by **user preference** on the tree.
- Possibly **disable the married-in family display (عائلة الزوج)** when free dragging is enabled, since users can arrange nodes freely anyway.
- Consider granularity: should free positioning apply to **some levels** of the tree, **all levels**, or be otherwise scoped?

### Open questions for planning
- Is manual positioning per-user or shared across all workspace members?
- How is a manual layout persisted, and what happens when the underlying tree data changes (added/removed people)?
- How does free dragging coexist with (or replace) the automatic layout and the graft/married-in-family envelopes?
- What is the granularity model (per-level, per-node, whole-tree)?
- How does this interact with public tree presentation?

---

## 5. Another Ways for Presenting

### Summary
Provide alternative ways to present a tree beyond the current canvas layout.

### Why
- Different audiences and use cases may benefit from different presentations of the same family data.

### Open questions for planning
- What presentation modes are wanted (this is currently open-ended and needs definition)?
- Which presentations are for editing vs. read-only/public viewing?
- How do alternative presentations interact with public trees and collections?

---

## Cross-Cutting Decision

Several features (Public tree, Collection of trees, and to a degree Deep citation and presentation) depend on a shared modeling question:

> **What is the right shareable/ownable unit going forward — workspace, tree, subtree, or a new entity?**

The owner explicitly asked that we resolve this by considering the current situation, the public tree concept, the collection concept, and likely future features **together** before concluding. Planning should settle this first, as it shapes the other features.
