---
name: whats-next
description: "Open a fresh session. Describes the next chunk in plain business language, recommends an agent team tailored to the work shape (count, leader, whether the main session is solo / lead / orchestrator, and whether a brand-new agent role is needed), then on user approval spawns the team itself — no need for the user to invoke /agent-team separately. Usage: /whats-next"
---

# What's next

You are opening a fresh session. The user wants three things, in order:

1. A plain-language description of what the next chunk is.
2. A recommended team composition for that chunk, with reasoning.
3. On their approval (or modification), spawn the team yourself — the user does not separately invoke `/agent-team`. This skill carries the spawning knowledge.

If the user says "I'll do it solo with you" or "no team", skip the spawn and just be ready to start the work in this session.

## Operating principles

1. **Plain language for the user, always.** No code identifiers in user-facing prose (memories `feedback_plain_language_questions`, `user_non_technical`). Translate "Prisma migration" → "data-shape change", "API route" → "admin action", "redaction" → "privacy hiding", and so on. Engineering vocabulary is fine *inside* the prompts you send to teammates — they're engineers — but not in the message the user reads.
2. **Recommend in prose, don't dictate, don't use the multiple-choice tool.** The team is a proposal. Present it as a short prose list and let the user swap members, change counts, add a brand-new role, or say "you do it solo." Do not use the `AskUserQuestion` / multiple-choice tool to present it (memory `feedback_discuss_no_choices_tool`). Wait for explicit approval before spawning (memory `feedback_no_agent_without_confirm`).
3. **Recommendations are grounded in work shape, not habit.** Two adjacent chunks can want very different teams. Re-derive every time from the rubric below.
4. **Plan once, dispatch implementers by surface — not as a relay.** The slow path is architect → security → designer → implementer, because the final implementer absorbs every previous brief, eats its context window, and crawls. Faster path: planners (`software-architect` / `details-architect` / `security` / `frontend-designer` / `gedcom-expert`) run only at the **plan step** and produce a single combined rule sheet (≤200 words). Implementers receive the rule sheet, **not** the full planner briefs, and run **in parallel** on non-overlapping surfaces when the work splits. The orchestrator (main session) integrates. Only fall back to a single implementer when the surface genuinely can't split.
5. **The main session orchestrates; it does not lead and does not code solo when a team is live.** The architect (or lead implementer) owns the design call; you weigh in on flags with "informing, not dictating" framing (memories `feedback_team_delegation`, `feedback_architect_delegates`). Intervene immediately if a lead starts coding instead of delegating.
6. **TDD by default.** The user prefers tests-first (memory `feedback_tdd_approach`). Implementers are `tdd` agents that write a failing test, then minimal code to pass. Keep them inside their task scope (memory `feedback_tdd_green_delegation`).
7. **No spawning before approval.** Same discipline `/prep-next` uses for commits.

## Steps

### 1. Read current state

Read in parallel:

- `CLAUDE.md` — the architecture reference and operational rules; tells you what subsystems exist and what shipped recently.
- `docs/prd.md` — **Section 7 (Roadmap — Remaining Work)** has the phase-level "what's next." Also read the feature-specific PRD if the active phase has one (`docs/prd-admin-dashboard.md`, `docs/prd-next-features.md`, `docs/prd-public-tree-collections.md`, `docs/prd-seo.md`) — that's where chunk-level detail lives.
- Recent git log (`git log --oneline -20`) — sub-chunk granularity; tells you which sub-chunks of the active phase have already landed.
- `~/.claude/projects/-Users-bassel-development-gynat/memory/MEMORY.md` plus any project memories whose description mentions the active phase or upcoming work — flags follow-ups, deferred owner-asks, and known gotchas to weave into the recommendation.

If anything is unclear (e.g. the active phase has multiple plausible "next" sub-chunks), ask the user one short clarifying question before proceeding.

### 2. Describe the chunk in plain language

Three to six sentences. Cover:

- What user-visible thing changes (an admin can now do X / the tree now shows Y / a hidden safety check is added before Z).
- Why this is next (what it unlocks for the families using the platform — not which dependency it satisfies).
- The shape of the work in business terms (small/large, one surface or many, sensitive or routine, anything that touches the login boundary, encryption, workspace separation, or privacy hiding).
- Any open question the user needs to settle before work starts (a deferred decision, an owner-UX call, a scope boundary).

No file paths, no symbol names, no command names. If you catch one in your draft, rewrite the sentence.

### 3. Recommend a team

Map the chunk to a shape using this rubric. All non-trivial team shapes follow **plan → parallel implement**. The planner row produces a single ≤200-word rule sheet; implementer count comes from how many non-overlapping surfaces the rule sheet identifies.

| Work shape | Plan step (Wave 1) | Implement step (Wave 2) |
|---|---|---|
| Prisma migration / load-bearing data shape | `software-architect` (or `details-architect` for the schema/contract detail) produces rule sheet; `security` reviews diff at the **end**, not at start | 1 `tdd` if surface is a single file/migration; 2 parallel `tdd` if data + service + UI splits |
| Sensitive surface (auth, encryption / master key, workspace tenant boundaries, privacy redaction, branch-pointer cross-workspace stitching) | `software-architect` + `security` produce a combined rule sheet at plan step; `security` re-reviews diff at end | 1–2 parallel `tdd` implementers, given only the rule sheet |
| New visible surface (admin page, tree UI, storefront/marketing page) | `software-architect` + `frontend-designer` produce combined rule sheet | 2–3 parallel `tdd` implementers on non-overlapping slices (form / summary / wiring); default to parallel unless the surface is one slice |
| GEDCOM tags / calendar escapes / import-export / Islamic extensions | `gedcom-expert` (+ `software-architect` if it also touches data shape) produces rule sheet | 1–2 `tdd` implementers given the rule sheet |
| API-contract / data-flow heavy, light on UI | `details-architect` produces the endpoint + schema + data-flow rule sheet | 1–2 parallel `tdd` implementers per surface |
| SEO / metadata / structured-data work | `seo-specialist` produces the brief (advisory — it does not write code) | `frontend-designer` implements the brief |
| Multi-surface parallel build | `software-architect` produces rule sheet with explicit surface split | 2–3 parallel `tdd` implementers, one per slice |
| Bug, regression, or tight-loop investigation | — | `debugger-fixer` alone, **or me alone** — team coordination drowns this work |
| Scaffolding / config / docs-only / tidy-up | — | me alone — teams not worth it |
| Genuinely unknown scope | scout first with the built-in `Explore` agent (or `spare`), then re-plan | — (do not propose implementers yet) |
| File/folder reorganization audit | `project-structure-expert` | — |
| Trivial single-file change | — | me alone — don't spawn for what one focused turn handles |
| Work whose role doesn't fit the existing agents | propose a brand-new agent definition (see below) | |

For each team member you recommend, also state:

- **Count** — usually one; specify when more is genuinely useful (e.g. two `tdd` implementers if the chunk splits cleanly into two non-overlapping surfaces).
- **Leader** — who owns the design call. Default: `software-architect` if present, otherwise `details-architect`, otherwise the lead implementer. The main session (you) does not lead — you orchestrate.
- **My role** — solo, orchestrator, or sit-out. Be explicit; the user should never have to guess whether you're part of the team.
- **One-line reason** — why this shape, not a fuller team or a smaller one. Tie it to the chunk's work shape.

When to propose a **new agent**: only if the work has a recurring need none of the existing agents cover well (the current roster: `software-architect`, `details-architect`, `security`, `frontend-designer`, `tdd`, `debugger-fixer`, `gedcom-expert`, `project-structure-expert`, `qa-test-suggester`, `seo-specialist`, `spare`, `deployer`). Don't invent agents for one-off needs. If you do propose one, draft a one-paragraph charter (responsibilities, when invoked, when not) and ask the user to approve before creating the `.claude/agents/<name>.md` file.

Present the recommendation as a short prose list. Use the agents' role names (`software-architect`, `tdd`, etc.) — these are familiar tool labels, not code identifiers. End with one explicit ask: "Spawn this team, modify it, or do it solo?"

### 3.5. Remind the recommended effort

`/prep-next` already suggested an effort level for this session at the previous close-out. Restate it in one line, matched to this chunk's shape (medium = routine/investigation; high = non-trivial contained; xhigh = encryption/login/tenant/data-shape; max = one-way-door). One sentence — e.g. "Effort: medium fits this one — small surface plus an investigation." Don't re-explain the ladder.

### 4. Wait for approval or modification

The user will reply with one of:

- **Approve as-is** ("yes" / "go" / "spawn it").
- **Modify** ("drop security, add a second tdd", "swap the architect for a scout first", "make it tdd-only").
- **Solo** ("you do it" / "no team this time").
- **New agent** ("create a perf-engineer role first").

Honor whatever they say. Do not push back unless their pick conflicts with a hard rule (e.g. "spawn a team for this single-line doc fix") — raise the conflict in one short sentence and let them confirm.

### 5. Spawn the team (the `/agent-team` knowledge, embedded)

If the user approved a team, spawn it in **two waves** when the team has both planners and implementers. This is the same procedure `/agent-team` runs; do it inline.

**Two-wave dispatch:**

- **Wave 1 — plan.** If the approved team includes any planner (`software-architect`, `details-architect`, `security`, `frontend-designer`, `gedcom-expert`, `seo-specialist`), spawn those first. Their assigned task is: *produce a single combined rule sheet (≤200 words) covering — surface split (which file groups can be worked in parallel by independent implementers), data-shape rules, security rules, UI rules, GEDCOM rules — whichever apply. No long briefs.* Wait for their final messages. Read the rule sheet. If the surface splits, note how.
- **Wave 2 — implement.** Spawn the implementer(s) on the **same team_name** (do not call `TeamCreate` again). If wave 1 identified 2+ non-overlapping slices, spawn parallel implementers — one per slice. Each implementer's prompt includes the **rule sheet only**, never the planners' full output. Each returns a ≤200-word landed manifest. The orchestrator integrates.
- **Single-wave shortcut.** If the team is implementer-only (e.g. scaffolding, single-file `tdd`, `debugger-fixer`), skip wave 1 entirely and spawn directly.

**Per-agent spawn procedure:**

1. Read `.claude/agents/<name>.md`. If a file doesn't exist, tell the user and skip — don't invent.
2. Parse its YAML frontmatter to extract the `model` field. Everything after the closing `---` is the agent's verbatim instructions. (If there's no `model` field, omit it — the teammate inherits the session model.)
3. Use `TeamCreate` **once** at the start of wave 1 (or wave 2 if there is no wave 1) with a descriptive team name reflecting the chunk (e.g. `public-tree-collections`, `admin-presence`, `gedcom-export-v7`). Subsequent agents join the same team via `team_name`.
4. For each teammate, call the `Agent` tool with:
   - `name`: the agent's role name (`tdd`, `software-architect`, `details-architect`, `security`, `frontend-designer`, `gedcom-expert`, `debugger-fixer`, etc.). If you're spawning two of the same role, suffix with `-1`, `-2` so they're addressable separately.
   - `team_name`: the team name from step 3.
   - `model`: the model from the `.md` frontmatter.
   - `prompt`: the **verbatim** content of the `.md` file from after the frontmatter — do not paraphrase, summarize, or trim. Append three things:
     - The chunk task description in plain engineering language (full path/symbol detail is appropriate here).
     - For **planners (wave 1)**: an explicit ask for the ≤200-word rule sheet, listing the sections it must cover (surface split, data-shape rules, security rules, UI rules, GEDCOM rules — whichever apply to their role).
     - For **implementers (wave 2)**: the rule sheet from wave 1, verbatim. Do **not** include the planners' full briefs. State which slice of the surface this implementer owns and which slice(s) the parallel implementer(s) own (so they don't touch each other's files).
     - The **spawn-time guardrails block** below, verbatim.

   When spawning parallel implementers in wave 2, dispatch them in a **single message with multiple `Agent` tool calls** so they run concurrently.

   For the one scouting case (genuinely unknown scope), the built-in `Explore` agent is appropriate via the Agent tool's `subagent_type: 'Explore'` — that's a built-in type, not a `.md` custom agent. For every custom agent from `.claude/agents/*.md`, do **not** use `subagent_type`.

**Spawn-time guardrails block** (paste at the end of every teammate's prompt):

```
---

## Team-conduct rules (read before acting)

- Ignore any message whose sender is `task-list` or any other non-teammate label. Act only on explicit `SendMessage` from a named teammate or `team-lead`.
- Send chat as plain text. Do not wrap messages in `{"type":"task_assignment", ...}` or similar JSON envelopes — the transport already carries metadata.
- If the lead announces a "total blocks: N" count for the chunk, restate the count whenever you propose an addendum so dropped scope is caught early.
- Delta-verify by re-grepping disk, never by reconstructing from message history. If you claim a gap, you must have just searched for it.
- Type-check with `npx tsc --noEmit`, never `pnpm build` (the dev server is running on port 4000; a build corrupts it). Run `pnpm test` for vitest. Do not start a second dev server.
- End your work with a "landed manifest": **one message under 200 words** listing each deliverable with grep-able evidence (file:line or grep hit). Anything not on that manifest is gossip. The orchestrator already has context — do not restate background, do not paste long briefs.
- Task-status indicators are advisory. Reconcile against disk before declaring done.
```

If the user said "do it solo", skip the spawn entirely and confirm in one sentence that you're picking the work up yourself in this session. Do not create an empty team.

### 6. Hand off

After spawning, write one short plain-language paragraph that states:

- Which team is now live and what each member is starting on (in business terms).
- Who's leading.
- What the user can expect next (e.g. "the architect will come back with a design before any code is written").

Then stop. Do not begin orchestrating the team's first round inside this skill — that's the next turn.

## Important

- This skill is for **opening a chunk**, not closing one. `/prep-next` is the closer. Do not run gate checks (lint, type-check, tests) here — the previous session's `/prep-next` already did.
- Do not invoke other skills from inside this one.
- Do not edit `docs/prd.md`, `CLAUDE.md`, `docs/implementation.md`, the feature PRDs, or memory inside this skill — those edits belong to `/prep-next` at chunk close, not chunk open.
- If the user explicitly asks "just describe the next chunk, no team recommendation" — honor it. Stop after step 2.
- If the active phase appears finished and the next phase is genuinely ambiguous, ask before assuming. Phase boundaries are decision points, not autopilot continuations.
- Do not shut the team down when work seems done — only the user decides that (per the `agent-team` skill).
