I feel the current requirements of subworkspaces that depend on parent workspace is not the best, and technically speaking it limits changes in the future and makes workspaces tightly coupled with the main branch and make it dependent on that workspace. What if the owner decides to delete the workspace.

It's important for branches to have private news, meetings, albums, etc. Maybe it's good also from subscription perspective in the future for easy management that a workspace doesn't depend on parent workspace, and also this prevents a branch from misusing storage etc. Perhaps looseless relationship is better and solve the problem. This doesn't mean all branches will have their own workspaces! It just means allowing them to do so.

Perhaps anyone can create workspace is better and relate it to their branch in the original family workspace.

Another problem is that if a branch belongs to  
two families workspaces (families might be intersected as you know), it might be somehow annoying for that branch to write entire branches in family tree again in multiple workspaces, perhaps a feature to copy branch as JSON or a different feature is possible? This might avoid syncing which might cause complixity, data conflict issues in different families, or different admins issues in different families. What about privacy in this case? What if we make a branch just sharabel, meaning, a user can copy its link then go to his another workspace, and add that branch there by that link (not editable, just a pointer that can read). Of course, the admin can control with which workspace he accepts this branch to be shared or can make it totally open. If the otherworkspace guys want to edit, they then have to do hard copy, which will break the link and will completely be separate tree. Of course also the admin can control if a branch can be copied or not. So we have these scenarios:
1- Branch can be shared as pointer (can be copied) -> controlled by workspace admin.
2- Branch can be copied but can't be shared.
3- Branch can be neither copied nor shared.
4- If the owner of the workspace that has a shared branch deleted the shared branch, then whatever branch has that branch pointer will be converted to deep copy which they can control. 

When I say a branch, I do not mean only nuclear family only, I also mean big branches.  

Another problem to avoid.
If we make a person shared in two workspaces by having the same reference, (not as user, I mean as family member in the tree), what if a family admin decided to modify that family member in his workspace, that family member is affected in two     
places. suddenly the admin will see his fanmily tree affected without knowing what happened (remember it's different 
 workspace).                                                                 


Someone said the above, I wanna you look at what they said and judge that. Maybe they are correct, wrong, or correct
and wrong in some points.
Also, look at product-requirements.md, Will these phases todos prevent us from progressing smoothly? I mean, we want business value first and shipping
working valuable product first on each phase, while at the sametime without making nightmare refactoring and
migration later. are the phases correct or needs improvement (perhaps splitting more or less). BTW I will do vibe
coding, not code myself.

---

## Feedback (2026-03-23)

**Every core point above is correct.** Here's the breakdown:

### No nested/dependent workspaces — correct
Tightly coupling a branch workspace to a parent creates cascading deletion problems, permission coupling, and makes it hard to evolve either side. Fully independent workspaces with no parent-child relationship is the right model. If a sub-family wants private content, they create their own workspace.

### Branch pointers (read-only live references) — correct and simple
The pointer model is clean: read live from source, no sync mechanism needed. Source gets edited, pointer sees the update automatically (it's a read, not a copy). Source gets deleted or sharing revoked, pointer converts to deep copy + notification to the target admin that it's now their responsibility. Two states, not a complex sync system.

### Branch boundary = parent + everything below (downward only) — correct
This cleanly solves the boundary problem. A branch goes down from an ancestor, never up. Spouses who married into the branch belong to their own ancestor's branch.

### The 4 admin control scenarios — correct
Shareable as pointer (can be copied), copyable only (no live link), neither, auto-convert on delete. These can be shipped incrementally — start with just "shareable as pointer" and add the other modes later.

### Cross-workspace edit concern (paragraphs 16-19) — correctly identified and solved
Since pointers are read-only, workspace B can never edit workspace A's data. If they want to edit, they hard copy, which breaks the link. No conflict, no surprise mutations.

### In-workspace branches should be removed entirely
The original PRD had branches as private sub-groups inside a workspace with their own content, roles, and permissions. This is unnecessary complexity — branch tables, branch roles, branch-scoped content queries, vacancy resolution logic. All of it goes away. Sub-families that want private content create their own workspace. This eliminates ~6 tables and a large surface area of permission logic.

### Impact on phases
The original 7 phases were simplified to 6, and the PRD (v2.0) has been updated:

1. **Auth & Workspace Foundation** (done)
2. **Editable Family Tree** (starts with cleanup of branch tables from Phase 1)
3. **User-Tree Linking + Branch Pointers** (additive — no changes to Phase 2 code)
4. **GEDCOM Import/Export**
5. **Content** (workspace-scoped only, no branch scope)
6. **Polish & Growth** (audit log, mobile, notifications, etc.)

Each phase delivers a complete, usable capability. No migration nightmares. Fewer phase boundaries means less context switching during vibe coding.
