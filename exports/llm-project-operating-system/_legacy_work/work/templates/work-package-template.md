# Title

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "YYYY-MM-DD",
  "scenario": "scenario-or-none",
  "artifact": "path/to/latest-artifact-or-none",
  "playback": "path/to/replay-or-none",
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
  "predecessor": "work/packages/done-predecessor.md"
}
-->

## Why

Describe the problem being solved.

## Scope Basis

Link the roadmap row, or state the approved existing subsystem or maintenance
scope that makes this package valid without a roadmap change.

## In Scope

1. Item
2. Item
3. Item

## Out Of Scope

1. Item
2. Item
3. Item

## Invariants

1. Correctness rule that must not regress.
2. Ownership or architecture rule that must not regress.
3. Validation rule that must not regress.

## Hotspots

1. File or subsystem
2. File or subsystem
3. File or subsystem

## Shared Boundary Contract

Required when adding or reshaping a shared boundary.

- Semantic owner:
- Canonical contract shape / vocabulary:
- Evidence inputs:
- Allowed consumers:
- Prohibited reinterpretations:
- Primary diagnostics / proof surfaces:

## Static Drift Ledger

Required for runtime, infrastructure, harness, diagnostics, shared test
infrastructure, and broad refactor packages.

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] Inherited repo-wide debt classified.
- [ ] Inherited touched-file debt classified.
- [ ] File-scoped or boundary-scoped baseline recorded.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path or decision-boundary violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.
- [ ] Package-owned changes committed as one focused slice.
- [ ] Slice commit pushed to the recorded remote/branch.

## Subagent Sequencing Ledger

Required when real subagents are available. If unavailable or human-disabled,
record the explicit exception before implementation starts.

- [ ] Review subagent recorded:
      Agent <name> (<agent-id>) reviewed <package>;
      result `<clean|fixes-required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      Agent <name> (<agent-id>) fixed <package>, or `not-needed` only
      when review result is `clean`.
- [ ] Implementation subagent recorded:
      Agent <name> (<agent-id>) implemented <this package> after
      review/fix proof was recorded.

## Commit And Push Ledger

Required before a metadata-bearing package remains closed as `done-...` or
`superseded-...`.

- Focused package commit: `<sha>`
- Pushed to: `<remote>/<branch>`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `<yes>`

## Model Ledger

Optional advisory record for future model and reasoning-effort choice. This
does not replace validation, review, sequencing, or closure proof.

- [ ] If this package produced useful model-fit evidence, record it with:
      `npm run work:model-ledger -- record --package <this package> --model <model> --reasoning-effort <effort> --task-class <class> --outcome <outcome> --validation-status <status> --correction-loops <count> --review-findings <count> --notes <note>`.
- [ ] If no record is useful, state why.

## Failure Migration / Contraction

Required for scenario-driven or incident-driven packages after blocker
migration.

- Current dominant blocker:
- Current semantic owner:
- Current boundary:
- Source artifact:
- Normalized evidence:
- Historical migrations that are evidence only:
- Replayable owner-decision fixture or blocker probe:
- Presentation surfaces that must consume the decision contract:

## Detection / Analysis Tasks

- [ ] Build the concern inventory.
- [ ] Build the semantic-question matrix.
- [ ] Detect duplicate ownership.
- [ ] Detect implicit state machines.
- [ ] Detect branch lattices.
- [ ] If dirty worktree scope matters, run `npm run work:dirty-scope`.
- [ ] If oversized segment files block review, run
      `npm run audit:owner-boundary-segments -- <files...>`.

## Implementation Tasks

- [ ] Add guardrail tests first.
- [ ] Collapse to one canonical owner path.
- [ ] Remove or wrap parallel paths.
- [ ] Tighten static guardrails.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete.
- [ ] Tail consumers are cut over.
- [ ] Diagnostics and reporting surfaces match the new contract.
- [ ] Superseded paths, booleans, or vocabulary are deleted.
- [ ] Required proof layers are complete.

## Validation

1. Targeted unit tests.
2. Targeted integration tests.
3. Scenario or replay proof when applicable.
4. Static guardrails selected by boundary.

## Done When

1. The canonical owner/path is in place.
2. Parallel implementations are removed or downgraded.
3. Required tests pass.
4. Follow-up work, if any, is split into new idea or package files.
