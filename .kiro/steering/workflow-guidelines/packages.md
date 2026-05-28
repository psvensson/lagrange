---
scope: governance
status: canonical
always_load: false
source_of_truth: self
compiled_pack: .kiro/steering/llm/governance.md
parent_index: ../workflow-guidelines/INDEX.md
last_reviewed: 2026-05-23
---

> **Canonical source.** Package status & closure, residual closure inventory, affected-area deep dive, shared boundary contracts, roadmap truth. Index: [`INDEX.md`](INDEX.md).

# Workflow — Packages & Closure

## Package Status And Closure

Work-tracking closure is filename-first.

Required patterns:

1. Close a completed package by renaming `active-...` to `done-...`.
2. Rename dormant package work to `todo-...`.
3. Rename displaced package work to `superseded-...` and link the superseding
   package from the body.
4. Do not create heading, directory, checkbox, or sidecar status systems that
   contradict the filename.
5. Update in-repo links when closing packages or archiving sprints.
6. Do not archive package files into a second package-status directory.
7. Close active sprints with `npm run work:sprint:advance -- --write`, which
   renames the sprint from `active-...` to `done-...` in `work/sprints/` and
   updates track/release references. Move old sprint files under
   `work/sprints/archived/` only as a separate explicit archival-maintenance
   slice.

Every completed work-package slice MUST end in a focused local close commit and
push before the next slice starts. The default closure path is `npm run
work:close <package>`, which runs closure validation, moves the package to
`done-*`, refreshes tracker handoff, stages only package-owned scope, and
creates the focused local close commit.

For sprint package pushes, use `npm run work:sprint:push -- <git-push-args>`
instead of raw `git push`. The wrapper runs `git push` and then prints
`npm run work:sprint:remaining` after a successful push so the remaining sprint
package queue is visible before the next slice starts.

Commit-and-push ledger for current packages:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

Do not invent historical proof. If an older package is reopened, migrated, or
closed again, current proof rules apply.

`work:close` may populate the focused commit SHA and remote branch target before
the push has happened. The required push remains the next step and should use
`npm run work:sprint:push -- <git-push-args>`. If push is blocked by remote,
credential, or policy state, record the unpushed commit SHA and reason in the
package or sprint handoff instead of inventing pushed proof.

Stop for human direction when package-owned and unrelated changes cannot be
separated safely, when no push target exists, or when credentials/policy prevent
the required push.

Package closure is atomic. Do not leave the repository between package states.
For scenario and causal-escalation packages, closure order is:

1. Decide the result classification from canonical evidence.
2. If the same owner, boundary, and required action remain selected, keep the
   same package active and update its Current Edge Card instead of closing it.
3. If closure is valid, run `npm run work:close <package>` to rename the
   package, update metadata, refresh handoff, stage package-owned files, and
   create the focused local close commit with Commit And Push Ledger data.
4. Create or activate the successor only when canonical evidence changed
   owner, boundary, required action, or the work is intentionally finished.
5. Regenerate `work/sprints/current-blocker.*` after the successor is active,
   or explicitly record that no active package remains.
6. Run validation before committing so `current-blocker` never points at a
   missing `active-...` package.
7. Push the focused close commit before the next slice starts.

`done-...` packages without commit/push proof, missing active successors, or a
`current-blocker` pointing to a non-existent package are closure defects, not
handoff states.

Discovery Gate notes are package-local until explicitly promoted. Do not create
new headings, sidecar files, ledger rows, or current-blocker edits from
discovery thinking unless the selected route changes owner, boundary, required
action, stop condition, successor, or durable theory. Transient lateral
analysis stays in the active package and is closed with that package.

## Affected-Area Deep Dive

Every work package ends with an affected-area review before `done-...`.

Affected area means:

1. every production file in package `writeScope`
2. direct owner collaborators of those files
3. decision, lifecycle, ingress, dissemination, persistence, diagnostic, or
   resource-lifetime boundaries that those files participate in

Review for:

- owner bypasses and shadow state
- duplicate logic or parallel paths
- fallback behavior and bag-of-`if` decision boundaries
- `null` or `undefined` domain-state contracts
- unowned resource lifetime or missing diagnostics
- row-field or lifecycle ownership violations
- changed contracts without tail-consumer proof

If the deep dive finds an in-scope mistake, irregularity, or steering violation,
fix it before closure. If it finds a separate concern outside the affected
area, open a new idea or work package instead of silently widening scope.

## Residual Closure Inventory

Every active package carries an explicit residual-closure inventory.

The inventory names:

1. direct owner paths being changed
2. tail consumers and collaborator owners that must be cut over
3. status, diagnostics, harness, admin, or reporting surfaces that must match
   the new contract
4. superseded paths, fallbacks, aliases, or vocabulary to delete
5. required proof layers before closure

A package may not close with open in-scope residuals. "Known residual" is not a
closure state; either fix it, or split it into a linked follow-on package before
closure.

Do not start a second active package on the same architectural boundary while
the first has unresolved in-scope residuals. Parallel packages in one broad
area require explicitly disjoint file, owner, and proof scope, or one umbrella
package that defines sequencing.

Progress notes distinguish:

- landed hot-path changes
- remaining residual closures
- proof already run
- proof still required

## Shared Boundary Contract Declaration

When a package adds or reshapes a shared runtime boundary, the package declares
the contract explicitly.

Required fields:

1. semantic owner
2. canonical contract shape or vocabulary
3. allowed consumers
4. prohibited reinterpretations
5. primary diagnostics and proof surfaces
6. operational authority, diagnostics-only view, and owner-internal retained
   state when several views exist

Durable boundary changes update `architecture/current-owner-maps.md` or the
relevant architecture record in the same work cycle. Mechanically checkable
boundary rules get a static guardrail or a linked follow-on before closure.

## Roadmap, Release, And Work-Tracker Truth

Roadmap state is not release-gate proof. Representative evidence must not be
reclassified as roadmap truth when it belongs to the release, track, sprint, or
package layer.

Required rules:

1. `../../roadmap.md` constrains AGPL feature scope and broad sequence only.
   It does not activate packages, close sprints, or certify release readiness.
2. If a package fixes a failure under an available roadmap row, keep the live
   blocker and proof in the package, sprint, track, and release documents.
3. Scenario-driven release gates such as failure simulation, topology
   stabilization, and production guarantees require named representative
   evidence, not only roadmap state or unit proof.
4. Before sprint closure, reconcile active packages with release, track, and
   architecture owner truth; touch the roadmap only when feature scope,
   sequencing, or AGPL applicability changed.
5. Roadmap corrections discovered during implementation land with the package
   or sprint closure that discovered them.
