# Work Tracking

`docs/` is reserved for end-user or operator-facing documentation.

Internal execution planning, work packages, and sprint tracking live under
`work/`.

## Directory Layout

- `work/ideas/`
  - Human ideas before they are approved for implementation work.
- `work/packages/`
  - Actionable work packages that can be executed end to end.
- `work/sprints/`
  - Optional grouping documents that collect several active work packages into
    one focused push.
- `work/templates/`
  - Templates for ideas and work packages.

## Recommended Workflow

Use one simple path:

1. Capture the human idea.
2. Triage it.
3. Either sharpen `roadmap.md` first or create a direct work package.
4. Work the package until done.
5. Rename the file to mark completion.

Use the tracker utility for current sprint/package mechanics:

1. `npm run work:current-blocker` regenerates the compact current-blocker
   handoff files from the active package metadata.
2. `npm run work:context` prints a compact human and LLM handoff with the
   current blocker, first-read files, proof ladder, useful commands, and dirty
   worktree summary.
3. `npm run work:dirty-scope` prints only the dirty worktree scope report,
   grouped into package-owned, tracker-generated, and unrelated entries. Add
   `-- --package work/packages/active-...md` to scope the report to a package
   other than the generated current blocker.
4. `npm run work:model-ledger -- summary` prints recent model, reasoning
   effort, task class, package class, intended minimum model, scope shape,
   escalation, bailout, outcome, validation, correction-loop, and
    review-finding signals with a simple advisory recommendation to escalate,
    de-escalate, or hold effort.
5. `npm run work:package:doctor -- work/packages/active-...md` prints a compact
   package summary plus the same validation findings used by the tracker. It is
   a local diagnostic aid only; it does not replace real subagent sequencing.
6. `npm run work:evidence-summary -- <artifact>` prints a compact deterministic
   topology plus causal-model summary for LLM handoff before reading raw logs or
   large harness segment files.
7. `npm run work:validate` checks active and metadata-bearing packages for
    filename/header drift, stale open checklist items, and required Subagent
    Sequencing Ledgers on active metadata-bearing packages.
8. `npm run work:package:close -- --write work/packages/active-...md` renames a
    package to `done-...` only after open checklist items are closed.
9. `npm run work:package:migrate -- --write work/packages/active-...md`
    `work/packages/active-successor.md` performs the same closure gate while
    recording a successor handoff.
10. `npm run work:package:move -- --write work/packages/todo-...md --to active`
    performs non-terminal state moves.
11. `npm run work:package:evidence-block -- <artifact>` generates a Markdown
    owner/evidence block from topology-convergence analyzer output for package
    migration or contraction notes.
12. After each completed package slice, create one focused git commit containing
    only that slice's package-owned changes and push the current branch before
    starting the next slice.
13. If the slice cannot be pushed because the remote or credentials are
    unavailable, record the unpushed commit SHA and reason in the package or
   sprint handoff. If package-owned and unrelated dirty changes cannot be
   separated safely, stop for human direction instead of committing a mixed
   slice.

Use `npm run work:model-ledger -- record` to append explicit package experience
to `work/model-ledger.jsonl` when a package adds useful model-fit evidence:

```bash
npm run work:model-ledger -- record \
  --package work/packages/active-YYYYMMDD-slug.md \
  --model gpt-5-codex \
  --reasoning-effort medium \
  --task-class workflow-tooling \
  --package-class bounded-implementation \
  --intended-minimum-model gpt-5.3-codex-spark \
  --scope-shape leaf-slice \
  --escalated false \
  --bailout-reason none \
  --outcome success \
  --validation-status passed \
  --correction-loops 0 \
  --review-findings 0 \
  --notes "short package-specific note"
```

The ledger is advisory. It helps future agents choose a model and reasoning
effort, but it never replaces `npm run work:validate`, review/fix/implementation
subagent sequencing, focused validation, package closure, or commit discipline.

## Mandatory Subagent Sequencing

Every new or continued work package must make the implementation handoff
sequential with real subagents by default. Record the sequence in the package
file before runtime, test, harness, documentation, or tracker implementation
starts.

Subagents are orchestrated by Codex sessions and proven by package ledger
entries. Do not add npm scripts that pretend to spawn or replace the review,
fix, or implementation subagent roles.

Required sequence:

1. Fresh review subagent: review the most recently executed package on the same
   sprint or owner boundary. For the first work package in a new sprint, record
   review as `not-needed` with reason `first-package-in-sprint` instead.
2. Fresh fix subagent, when needed: if the review finds fixes, a separate
   subagent performs those fixes before implementation starts.
3. Fresh implementation subagent: after review/fixes are clean, a separate
   subagent implements the new/current package.
4. Focused commit and push: after the package closes, commit only the
   package-owned slice and push it before the next slice starts.

The package must record:

1. Review: `Agent <name> (<agent-id>) reviewed <package>; result <clean|fixes-required>`,
   or `not-needed (first-package-in-sprint)` only for the first package in a
   new sprint.
2. Fix: `Agent <name> (<agent-id>) fixed <package>` when review found fixes,
   or `not-needed` only when the review result was `clean`.
3. Implementation: `Agent <name> (<agent-id>) implemented <package>` after the
   review/fix proof is recorded.

Do not use parallel subagents for these roles unless a human explicitly changes
the package sequencing contract. The default is review, then fixes if needed,
then implementation.

Parent-session notes, local/manual session labels, and arbitrary text without a
real agent id do not satisfy the required roles unless the user explicitly
disables subagents for the task.

`npm run work:validate` requires this ledger for active metadata-bearing
packages. Historical `done-...` packages without the ledger remain valid unless
they add a ledger with open or incomplete required entries. Checked required
entries must contain real agent identities; template placeholders such as
`<...>`, pending markers such as `pending-before-implementation-resumes`, and
non-real identities such as `current-session`, `parent Codex`, `manual`,
`local`, or `session` are validation failures for packages under the current
policy. Historical closed-package proof is not backfilled by invention; if a
package is reopened, migrated, or closed again, the current proof rules apply.

## Commit And Push Ledger

Packages closed under the current tracker workflow must prove the focused
package slice was committed and pushed. The package file must include:

1. `Focused package commit: <sha>`
2. `Pushed to: <remote>/<branch>`
3. `Commit contains only package-owned files/package-status/allowed sprint handoff: yes`

`npm run work:validate` rejects closed metadata-bearing packages marked by the
tracker as requiring this proof when the ledger is missing, leaves
placeholders, omits the push target, or does not affirm that the commit
contains only package-owned files plus package-status or allowed sprint handoff
updates. Historical closed packages without truthful commit/push proof are not
backfilled by invention; if they are reopened, migrated, or closed again, the
proof is required.

## Triage Rule

An idea must become a `roadmap.md` item first when it does any of these:

1. Adds a new feature area.
2. Changes product scope or user-facing direction.
3. Commits the repository to a new multi-step implementation track.
4. Is too broad to execute safely as one bounded package.

An idea may become a direct work package when it is already within approved
scope and is one of:

1. Bug fixing.
2. Refactoring or simplification.
3. Reliability or performance work.
4. Test harness stabilization.
5. Architecture cleanup within an already-approved roadmap area.

Direct work packages must still cite the roadmap row or existing subsystem they
belong to.

## Filename State Model

Keep the filename state model intentionally small:

1. `idea-YYYYMMDD-slug.md`
2. `todo-YYYYMMDD-slug.md`
3. `active-YYYYMMDD-slug.md`
4. `done-YYYYMMDD-slug.md`
5. `superseded-YYYYMMDD-slug.md`

Use rename, not copy, when state changes.

Examples:

- `idea-20260409-control-plane-simplification.md`
- `todo-20260409-control-plane-simplification.md`
- `active-20260409-control-plane-simplification.md`
- `done-20260409-control-plane-simplification.md`
- `superseded-20260409-control-plane-simplification.md`

Do not create parallel status systems in both directory names and filenames.
The filename is the status.

## Package Rules

Every active package should start with a machine-readable metadata comment:

```md
<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "scenario": "scenario-or-none",
  "artifact": "path/to/latest.report.json",
  "playback": "path/to/playback-or-none",
  "owner": "canonical owner",
  "boundary": "current boundary",
  "dominantReason": "current dominant reason",
  "currentState": "one-line current state",
  "nextAction": "next proof or implementation action",
  "proof": [
    "Focused owner test",
    "Representative scenario rerun"
  ],
  "touchedFiles": [
    "src/example.js",
    "test/example.test.js"
  ],
  "modelFit": {
    "packageClass": "bounded-implementation",
    "intendedMinimumModel": "gpt-5.3-codex-spark",
    "scopeShape": "leaf-slice",
    "escalationTriggers": [
      "owned files expand beyond this package"
    ]
  },
  "causalGovernance": {
    "hypothesis": "predicted causal edge change",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- path/to/latest.report.json",
    "expectedCausalModelChange": "edge disappears, reduces, migrates, or contradicts the hypothesis",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "residual causal debt tracked outside local closure",
    "crossBoundaryReview": "due/not-due/required-before-next-runtime-package"
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "named scenario or focused blocker probe",
    "phaseChain": [
      "phase one",
      "phase two"
    ],
    "currentFirstFrontier": "current owner / boundary / reason",
    "knownDownstreamBlockers": [
      "blocked downstream owner or phase"
    ],
    "missingCausalEdge": "unproven handoff, wake, retry, or visibility edge",
    "missingCausalEdgeProbe": "npm test -- path/to/focused-probe.test.js",
    "boundedProgressProof": "focused proof of wake/retry/timeout/reconcile/drain progress",
    "boundedProgressProofArtifact": "path/to/focused-probe.test.js",
    "expectedObservableTransition": "before state -> after state or named classification",
    "maxProgressBound": "maximum retry/timer/dispatch bound before fallback",
    "sameFrontierFallback": "named same-frontier action if the probe does not move",
    "expectedNextFrontier": "expected next owner boundary after this package",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  },
  "predecessor": "work/packages/done-predecessor.md"
}
-->
```

The header exists to make handoff and automation reliable. The prose package
body remains the source for reasoning, context, and the checklist.

Every work package should answer:

1. Why this work exists.
2. Which roadmap row or approved scope it belongs to.
3. What is in scope.
4. What is out of scope.
5. What invariants must not regress.
6. What files or subsystems are expected hotspots.
7. What tests and validation are required.
8. What counts as done.
9. If it adds or reshapes a shared runtime boundary:
   - who owns the boundary
   - what the canonical contract shape or vocabulary is
   - which consumers may use it
   - which reinterpretations are forbidden
10. What residual closure remains after the hot-path fix:
   - owner-path cutovers
   - tail consumers
   - diagnostics, admin, or report surfaces
   - superseded paths or vocabulary to delete
11. If the package is driven by a failing scenario:
   - what the current dominant blocker is
   - what probe or scenario will confirm the next-order blocker after each fix
   - where blocker migration will be recorded if the failure moves
   - how the current blocker fits the whole scenario phase chain
   - which downstream blockers are known but not first frontier
   - which missing causal edge still needs a focused probe
   - which probe command and artifact path prove the missing causal edge
   - what observable transition, maximum progress bound, and same-frontier
     fallback govern retryable or backpressure states
12. If the package touches lifecycle, readiness, admission, recovery, or
    convergence behavior:
   - what the shared progress grammar is
   - what blocked, deferred, retryable, terminal, and ready mean
   - which surfaces are allowed to expose that grammar directly
13. If the package touches runtime, control-plane, harness, diagnostics, admin,
    shared test infrastructure, or broad refactor boundaries:
   - which static guardrails apply
   - what the preflight baseline is
   - what inherited touched-file debt is in or out of scope
   - what after-state proves no drift increased
14. If the package has accumulated repeated blocker migrations:
    - which single current blocker remains active
    - which historical migrations are evidence only
    - whether the next step is a contraction package instead of another broad
      patch
    - what replayable owner-decision fixture or blocker probe represents the
      current blocker
15. If the representative scenario remains red after repeated local fixes or
     classification-only reductions:
    - whether the next package must be causal-analysis infrastructure instead
      of another tactical runtime patch
    - what end-to-end phase model the scenario follows
    - which cross-entity waits and causal edges explain the current blocker
    - which budgets, retry windows, and deadlines bound each phase
    - which invariants and failure classes are canonical
    - what stop conditions decide local fix, owner-boundary migration, broader
      architecture work, or human escalation

## Causal Governance Gate

Scenario-driven active packages must keep systemic reasoning in front of local
bugfixing. `npm run work:validate` requires metadata `causalGovernance` for
active packages with a real scenario.

Required fields:

1. `hypothesis`: the causal hypothesis for this owner-boundary package.
2. `stopConditionCheck`: the causal-model command or artifact check, citing
   `npm run analyze:causal-model`.
3. `expectedCausalModelChange`: the predicted edge/class change that makes the
   runtime patch meaningful.
4. `representativeOutcome`: exactly one of `pending-before-rerun`,
   `representative-green`, `reduced`, `same-frontier`, `migrated`,
   `classification-only`, `architecture-gap`, or `contradictory`. Closed
   packages must not leave it pending.
5. `causalDebt`: residual causal work tracked separately from local closure.
6. `crossBoundaryReview`: whether a periodic cross-boundary review is due now,
   not due, or required before the next runtime package.

The closure rule is: no runtime patch lands merely because it improves a local
symptom. The package must prove the causal model changed in the predicted way,
or classify the result as same-frontier or contradictory and stop broadening.

Use cross-boundary reviews after every two to three scenario-driven packages, or
immediately when a blocker crosses owner boundaries such as active-gate,
publication ACK convergence, operation workflow, and rebalancer ownership.

## Scenario Causal Closure Gate

Scenario-driven active packages must also carry metadata
`scenarioCausalClosure`. First-frontier migration is not enough: the package
must preserve whole-scenario causal understanding so successor work does not
forget the phase chain or known downstream blockers.

Required fields:

1. `referenceScenarioOrProbe`: the named scenario or focused blocker probe.
2. `phaseChain`: a non-empty ordered array of scenario phases already known.
3. `currentFirstFrontier`: the current owner, boundary, and reason at the first
   frontier.
4. `knownDownstreamBlockers`: a non-empty array of blockers known to be
   downstream rather than first frontier.
5. `missingCausalEdge`: the unproven causal edge that prevents closure.
6. `missingCausalEdgeProbe`: the focused command that proves or disproves the
   missing edge.
7. `boundedProgressProof`: the focused proof for retryable or backpressure
   states. It must name a concrete mechanism such as wake, retry, timeout,
   reconcile, drain, dispatch, delivery, timer, advance, or bounded progress.
8. `boundedProgressProofArtifact`: the path to the proof artifact, focused
   test, report, or diagnostic output that carries the bounded-progress proof.
9. `expectedObservableTransition`: the before/after transition expected in the
   focused probe or report.
10. `maxProgressBound`: the maximum retry, timeout, dispatch, timer, or
    owner-cycle bound before the package must stop and classify the result.
11. `sameFrontierFallback`: the explicit same-frontier action when the probe
    does not reduce or migrate the boundary.
12. `expectedNextFrontier`: the owner boundary expected after this package
   reduces, classifies, or migrates the current edge.
13. `resultClassification`: one of `pending-before-probe`,
   `representative-green`, `reduced`, `same-frontier`, `migrated`,
   `classification-only`, `architecture-gap`, or `contradictory`.
14. `stopCondition`: one of `continue-local-fix`, `bounded-non-frontier`,
   `migrate-owner-boundary`, `classification-only-stop`,
   `architecture-gap-stop`, `representative-green`, or `human-escalation`.

Representative reruns can confirm a causal edge, but they do not replace the
focused probe for a missing wake, retry, timeout, reconcile, drain, dispatch,
delivery, timer, advance, or bounded-progress mechanism.
Retryable or backpressure first frontiers cannot be classified as bounded or
non-frontier with prose alone: the package must name the probe command, proof
artifact path, observable transition, maximum progress bound, and
same-frontier fallback.

## Model Fit

Active metadata-bearing packages must include a `## Model Fit` section. The
section records the minimum model the package is designed for and the exact
conditions that require escalation before scope expands silently.

Required fields for every active metadata-bearing package:

1. `Package class`
2. `Intended minimum model`
3. `Scope shape`

Packages whose intended minimum model is `gpt-5.3-codex-spark` are linted as
bounded leaf slices. They must also name:

1. `Owned files`
2. `Forbidden files`
3. `Frozen decisions`
4. `Escalation triggers`
5. `Focused proof`

Packages intended for `gpt-5.3-codex-spark` must use
`Scope shape: leaf-slice` and must not contain open-ended frontier language. If
a package must chase a new owner boundary, broaden touched files, or reopen
frozen decisions, mark it as escalated in the model ledger instead.

Package closure also requires one final deep dive across the affected area:

1. read the touched files and their direct owner collaborators as one boundary
2. look for mistakes, irregularities, and doctrine/system-guideline violations
3. fix any discovered issue that falls inside the affected area before renaming
   the package to `done-...`
4. if the package was driven by a failing scenario, rerun the reference
   scenario or blocker probe and record any blocker migration before closure
5. rerun the same static guardrails recorded in the package preflight and
   confirm no relevant count increased

If the work package cannot answer those clearly, it is still an idea, not a
package.

When a scenario-driven package crosses two material blocker migrations, prefer
splitting a new contraction package over continuing to edit the historical
package. The contraction package should carry only the current owner,
boundary, fixture or probe, touched files, and proof ladder. The older package
may stay queued as history or later re-entry work.

Use the topology convergence analyzer to keep that handoff mechanical:

1. `npm run analyze:topology-convergence -- <artifact>` prints the frontier and
   dominant witness.
2. `npm run analyze:owner-explain -- <artifact> <edge-or-alias>` explains the
   evidence snapshot to owner decision outcome.
3. `npm run analyze:owner-decisions` prints the explicit owner decision
   table/state-machine index.
4. `npm run analyze:owner-glossary` prints the canonical owner, boundary,
   reason, and semantic-state glossary.
5. `npm run work:package:evidence-block -- <artifact>` prints a package-ready
   evidence block using the same analyzer output.

Shared-boundary work is not done when only the implementation changes land.
The package should update the relevant architecture record and any bounded
static guardrail in the same work cycle when the boundary contract is durable.

## Package Commit And Push

A completed package slice is not closed until its package-owned changes are in
a focused git commit and that commit has been pushed.

Required workflow:

1. Finish validation, static guardrails, residual closure, and the deep-dive
   review first.
2. Rename or migrate the work package with the tracker command.
3. Review the dirty worktree and separate unrelated changes.
4. Commit only the package-owned files, package-status updates, and sprint
   handoff updates for the slice.
5. Push the current branch before starting the next package slice.
6. If push is blocked by remote or credential state, record the unpushed commit
   SHA and reason in the package or sprint handoff.
7. If unrelated dirty changes cannot be safely separated from package-owned
   files, stop and ask for human direction before committing.

## Sprint Use

`work/sprints/` is optional.

Use a sprint file only when several active work packages must be coordinated.
The sprint file should link packages; it should not replace them.

Scenario-driven active sprints should keep their newest compact handoff in:

1. `work/sprints/current-blocker.json`
2. `work/sprints/current-blocker.md`

These files are generated from the active package metadata by
`npm run work:current-blocker`. Keep long migration narratives in package
history or archived sprint notes; the current-blocker files are the starting
point for humans and LLM agents.

Recommended naming:

- `active-2026-q2-control-plane-stability.md`
- `done-2026-q2-control-plane-stability.md`

## Simplicity Rule

Do not let the work-tracking system become complicated.

Prefer:

1. One idea file per idea.
2. One work package per executable concern.
3. One filename status.
4. One sprint file only when grouping adds real value.

Avoid:

1. Multiple backlog systems.
2. Separate status fields and filename states that can drift.
3. Large umbrella packages spanning unrelated concerns.
4. Sprint docs that contain detailed execution steps better owned by packages.

## Size Ratchet

Implementation speed depends on keeping owner files small enough to inspect.

Use `npm run audit:file-size` to keep the current inherited large-file count
from increasing. The ratchet uses these thresholds:

1. production JavaScript files over `800` lines
2. test JavaScript files over `1200` lines

Use `npm run audit:file-size:strict` when a package explicitly owns file-size
cleanup and should fail on any remaining oversized file.

Use `npm run audit:owner-boundary-segments -- <files...>` when an oversized
segment file blocks LLM review. The command emits extraction guidance for
segment-shaped files without refactoring runtime behavior by itself.

## Scoped Static Ratchets

Use scoped ratchets during focused work when the repo-wide complexity output is
too large to be useful:

1. `npm run test:complexity:scoped -- <files...>` reports cyclomatic
   complexity only for the named files or directories.
2. `npm run test:complexity:cognitive:scoped -- <files...>` reports cognitive
   complexity only for the named files or directories.
3. `npm run test:metrics:scoped -- <files...>` runs both scoped complexity
   ratchets and writes compact reports under `test-output/analysis/`.
4. Add `:strict` to fail on any scoped violation, for example
   `npm run test:metrics:scoped:strict -- <files...>`.

The default scoped commands do not fail on inherited local debt; use them to
record before/after counts in the package static drift ledger. Strict scoped
commands are for cleanup packages or touched boundaries expected to be clean.

Repository validation must stay deterministic and local. Use the local
guideline audits (`audit:guideline:literals`,
`audit:guideline:decision-boundaries`,
`audit:guideline:boundary-mode-contracts`,
`guard:guideline:constant-names:file`, and
`audit:runtime-grammar:file`) plus the mandatory Subagent Sequencing Ledger for
review proof; do not depend on network-backed LLM API checks.
