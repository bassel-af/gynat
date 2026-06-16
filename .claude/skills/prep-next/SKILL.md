---
name: prep-next
description: "Close out a finished chunk and prepare for a clean next session. Verifies the gate checks are green, updates docs/prd.md / CLAUDE.md / docs/implementation.md / memory as needed, then commits and pushes. Usage: /prep-next [optional one-line summary of what was just shipped]"
---

# Prepare for next session

You are closing out a chunk that the user just finished and setting up so the next clean session can pick up cleanly. This skill is invoked **after** the implementation work is already done — you are not implementing anything new, only reconciling docs and memory with what shipped, then committing.

## Operating principles

1. **Verify before declaring done.** A chunk is not finished until lint, type-check, and the relevant tests pass. If any are red, halt and surface the failure — do not paper over it with a doc update.
2. **Doc updates only reflect what actually shipped.** Do not promise future work in past-tense. Do not invent context.
3. **Memory captures lessons, not narrative.** Only write a memory if it answers "what would a future session need to know that isn't obvious from the code or git log?" Reversals, corrections, validated non-obvious approaches, gotchas. Not chunk summaries — those live in git.
4. **Translate to plain language for the user.** The user is the solo non-technical owner (memory `user_non_technical`). The final summary uses business framing, not code identifiers (memory `feedback_plain_language_questions`). The commit message is the only place engineering language is appropriate.
5. **Never commit without explicit user confirmation of the commit message.** Show the planned message; wait for "yes" before pushing (memory `feedback_no_agent_without_confirm` extends to commits).

## Steps

### 1. Confirm scope

If the user passed a one-line summary as args, use it as your starting hypothesis of what shipped. Otherwise look at `git diff` and `git log` since the last commit to understand the chunk.

State in one short sentence what you understand was shipped, and ask the user to confirm or correct before proceeding.

### 1.5. Confirm the tidy-before-commit pass ran

A `/simplify` pass before commit is worthwhile for any non-trivial chunk — prune over-engineering while the code is proven but still cheap to change. It's easy to forget at close-out time. (For deeper bug-hunting the user may instead have run `/code-review` — either counts as the tidy pass.)

If `/simplify` (or `/code-review`) already ran this session on the current diff, note that and proceed. Otherwise ask the user: "Did the tidy-before-commit pass run on this chunk? (or is this trivial enough to skip — typo fix, copy tweak, one-line config.)"

- If "yes" or "trivial, skip" → proceed to gate checks.
- If "no, do it now" → halt this skill. The user re-invokes `/prep-next` after the simplify pass lands. Do not run gate checks until the pass is done; running them now would lock in code that the tidy pass might still touch.

Do not perform the simplify pass inside `/prep-next` — it's a deliberate user-initiated step, not a step buried in the close-out flow.

### 2. Run the gate checks

**Skip any gate already green since the last code change.** If a gate was run and passed earlier in this same session and **no file has been edited since** (the close-out itself only edits docs/memory, which the gates don't cover), re-running it is wasted work — the result cannot have changed. Reuse the earlier pass and say so ("already green this session — skipping"). Only run a gate now if it has never run against the current code, or if any file changed after its last run. When in doubt about whether code changed since a gate ran, run it.

Run the still-needed checks in parallel where possible, foreground (need the results):

- `pnpm lint`
- `npx tsc --noEmit` — type-check. **Do NOT use `pnpm build`** for this: `pnpm dev` is always running on port 4000, and a build corrupts `.next/` and breaks the dev server (memories `feedback_type_check_locally`, `feedback_no_build_while_dev_running`).
- `pnpm test` (vitest)
- `pnpm test:e2e` (vitest e2e config) — if the chunk touched anything those e2e tests cover.

For chunks that touched the **frontend / tree canvas**, also do a real browser check against the running dev server, using the test route `http://localhost:4000/test?only=canvas` (see `docs/testing.md`). Use the headless-Playwright screenshot flow from memory `reference_headless_browser_screenshots` (project-root `.mjs` → `/tmp` → Read the PNG) — do not open the user's browser. `pnpm test:e2e:browser` (Playwright) runs against the already-running dev server when a fuller pass is warranted.

For chunks that touched **auth, encryption, Kong/GoTrue, SMTP, or any infra-dependent flow**, a real end-to-end test against the running services is **mandatory**, not optional — mocked unit tests pass while the real flow is broken (memory `feedback_e2e_testing_required`; CLAUDE.md "After editing files"). Exercise the full path through Kong + Next.js, verify the result in the DB, and clean up any test user/data afterward.

If any check fails, halt. Report the failure in plain language and stop. Do not proceed to doc updates or commit.

### 3. Update `docs/prd.md`

Open `docs/prd.md` and update only what the chunk changed:

- **Section 7 (Roadmap — Remaining Work)**: if the chunk closed a phase, change that phase's heading to "✅ Done" and replace its body with a one-paragraph "Shipped: …" summary of the must-have surface (match the style of phases already closed). If the chunk was a sub-chunk that did not close a phase, leave Section 7 alone — sub-chunk progress is tracked via git, not the PRD.
- **Section 5 (Feature Requirements)**: update the relevant `5.x` sub-section if the chunk changed what that feature does or now supports.

If the chunk belongs to a **feature-specific PRD** (`docs/prd-admin-dashboard.md`, `docs/prd-next-features.md`, `docs/prd-public-tree-collections.md`, `docs/prd-seo.md`), update the matching status/section there too — that's where chunk-level detail for those features lives.

Do not edit other sections unless the chunk genuinely changed scope (rare).

### 4. Update `CLAUDE.md`

`CLAUDE.md` is the architecture reference. If the chunk added or changed routes, components, hooks, lib helpers, Prisma models, or env vars, add/adjust the matching bullet in the relevant section (e.g. a new API route under the route lists, a new component under the component lists, a new model in the Prisma section). Keep the existing terse bullet style. Do not touch the operational rules near the top/bottom.

If `CLAUDE.md` has grown unwieldy, mention this to the user as a refinement opportunity — but do not restructure it inside this skill.

### 5. Update `docs/implementation.md` (if the subsystem's behavior changed)

`docs/implementation.md` describes how each subsystem works today. If the chunk changed how a subsystem behaves (not just added a file), update its section so the description still matches reality. If the chunk only added a self-contained file with no behavior change to existing subsystems, skip.

For a genuinely new design decision or a reversed/deferred one, capture the **why** either in the relevant `docs/design-*.md` for that feature (gynat's pattern is one design doc per feature) or as a `project`-type memory. There is no central `decisions.md` in this repo — don't create one.

Do not hand-edit `docs/project-structure.md`; that file is maintained by the `project-structure-expert` agent. If the chunk meaningfully reorganized the file/folder layout, note it for the user to run that agent separately.

### 6. Reconcile memory

Read `~/.claude/projects/-Users-bassel-development-gynat/memory/MEMORY.md`.

Three things to check, in order:

**a. Stale entries.** Any memory whose one-line description references the chunk just shipped (e.g. "next chunk is X" when X is now done, or "Phase N deferred" when Phase N just landed) is stale. Either update the entry's content or — if it's fully superseded — delete the file and its index line. Ask the user before deleting.

**b. New lessons worth saving.** Did the user correct an approach, validate a non-obvious choice, or surface a gotcha during the chunk? If yes, write a new memory file (frontmatter + body, structured per CLAUDE.md's Memory section) and add a one-line pointer to `MEMORY.md`. If nothing genuinely new came up, skip.

**c. Duplicates.** If a new memory candidate already exists, update the existing one rather than creating a parallel file.

### 7. Show the commit plan

Print, for the user to confirm:

- The list of files staged (just the file paths).
- The commit message you propose. Format:
  ```
  <type>(<scope>): <short summary>

  <2–4 line body explaining what shipped and why, plain-language>
  ```
  Use `feat`, `fix`, `docs`, `chore`, `refactor`. The scope is the phase or surface (e.g. `public-tree`, `admin`, `tree`, `prd`) — match the style of recent commits in `git log`.
- A plain-language summary of what's about to land, in the user's words.

Then ask: "Ready to commit and push?"

### 8. Commit and push

On user confirmation:

```
git add <specific files> && git commit -m "<message>" && git push
```

Use specific file paths, not `git add .` (never blanket-stage). Do **not** use `--no-verify`. Never add `Co-Authored-By` to the commit message.

If a pre-commit hook fails, fix the underlying issue, re-stage, and create a NEW commit. Do not amend.

If you are on `main`, branch first per the harness git rules — unless the user explicitly wants the commit on `main` (this repo's recent history commits directly to `main`, so confirm with the user which they want).

### 9. Final summary

After the push lands, give the user a 3–5 line plain-language wrap:

- What shipped.
- What was updated in docs/memory.
- What the next chunk is (per the updated `docs/prd.md` Section 7).
- **A suggested effort level for the next session** (see below).
- Any flags (CLAUDE.md size, stale-looking memory you didn't touch, anything worth their attention).

End by inviting the user to start the next session whenever they're ready. Do not start the next chunk inside this skill — that's a separate session (memory `feedback_no_agent_without_confirm`).

### 9.5. Suggest the effort level for the next session

The next session opens fresh, and the reasoning-effort setting should be chosen at that boundary based on the shape of the next chunk — not left on a fixed default and not switched mid-session (switching mid-session forces a cold re-read of the whole conversation). Closing one chunk and opening the next is the natural, free place to set it.

Look at what the next chunk is (the "Next" phase in `docs/prd.md` Section 7) and recommend one rung of the effort ladder (low → medium → high → xhigh → max):

- **Medium** — the default for routine work: small admin/UI controls, tree-canvas tweaks, copy and layout, investigations and tight debugging loops, scaffolding, routine wiring. Also right for mixed light sessions.
- **High** — non-trivial logic that's contained and not security-/encryption-/tenant-bearing: a multi-step feature with real branching, a moderately involved tree-editing flow, a refactor of meaningful surface area.
- **Xhigh** — the sharp-edged chunks where a subtle mistake is expensive and hard to catch by eye: changes to how data is shaped or stored (Prisma migrations), the encryption / `WORKSPACE_MASTER_KEY` path, the auth/account boundary, workspace tenant-separation and privacy redaction, branch-pointer cross-workspace stitching, or anything security-sensitive.
- **Max** — reserve for genuinely one-way-door chunks: a load-bearing data shape or contract that's very costly to change later, a foundational security/multi-tenant or encryption decision. Don't spend it routinely.

Give the recommendation in one plain-language sentence with the reason — match the effort to the work. Example: "For the next session I'd suggest medium effort — it's a small control plus an investigation, and fast turns help more than deep deliberation there."

If the next chunk spans both a sharp-edged piece and routine pieces, recommend the higher rung and note that the routine parts ride along.

## Important

- This skill is for **closing a chunk**, not for starting one. If the user invokes it before the gates are green, halt.
- Do not invoke other skills, do not spawn subagents, do not run an agent team.
- Do not run `pnpm build` at any point — it corrupts the running dev server (memory `feedback_no_build_while_dev_running`).
- If the user explicitly skips a step ("don't bother updating memory this time"), honor it — but note the skip in the final summary.
- **After the push, this conversation window is stale.** If the user asks anything state-shaped later in this same window ("what's next?", "did X ship?", "have you prepared next?") — possibly days later, after newer sessions have landed more chunks — re-verify against `git log` and `docs/prd.md` / `CLAUDE.md` on disk BEFORE answering. Never answer from this conversation's own close-out summary; it reflects the state at close-out time, not now.
