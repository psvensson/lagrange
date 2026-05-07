# Title

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
  "predecessor": "work/packages/done-predecessor.md"
}
-->

## Why

Describe the problem being solved.

## Scope Basis

Link the roadmap row, or state the approved existing subsystem / maintenance
scope that makes this work package valid without a roadmap change.

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

Required when adding or reshaping a shared runtime boundary.

- Semantic owner:
- Canonical contract shape / vocabulary:
- Allowed consumers:
- Prohibited reinterpretations:
- Primary diagnostics / proof surfaces:

## Static Drift Ledger

Required for runtime, control-plane, harness, diagnostics, admin, shared test
infrastructure, and broad refactor packages.

Preflight:

- [ ] Relevant guardrails selected by boundary.
- [ ] Inherited repo-wide debt classified.
- [ ] Inherited touched-file debt classified.
- [ ] File-scoped or boundary-scoped baseline recorded.

Closure:

- [ ] Same guardrails rerun after implementation.
- [ ] No relevant guardrail count increased.
- [ ] No new touched-file owner-path, decision-boundary, runtime-grammar, or
      metadata-gateway violation remains.
- [ ] Any out-of-scope inherited violation has a linked follow-on package.
- [ ] Package-owned changes committed as one focused slice.
- [ ] Slice commit pushed, or unpushed commit SHA and reason recorded.

## Subagent Sequencing Ledger

Required before implementation starts for every new or continued package.
Active metadata-bearing packages fail `npm run work:validate` without this
ledger. Do not check these items until real subagent/session values replace the
template placeholders; checked placeholders or pending markers are invalid.

- [ ] Review subagent recorded: `<fresh subagent/session>` reviewed
      `<most recently executed package>` on `<same sprint or owner boundary>`;
      result `<clean|fixes required>`.
- [ ] Fix subagent recorded or explicitly not needed:
      `<fresh separate subagent/session|not-needed>`; fixes `<summary|none>`.
- [ ] Implementation subagent recorded: `<fresh separate subagent/session>`;
      started only after review/fix ledger was clean.

## Failure Migration / Contraction

Required for scenario-driven packages after blocker migration.

- Current dominant blocker:
- Current semantic owner:
- Current boundary:
- Historical migrations that are evidence only:
- Replayable owner-decision fixture or blocker probe:
- Presentation surfaces that must consume the decision contract:

## Detection / Analysis Tasks

- [ ] Build the concern inventory.
- [ ] Build the semantic-question matrix.
- [ ] Detect duplicate ownership.
- [ ] Detect implicit state machines.
- [ ] Detect branch lattices.

## Implementation Tasks

- [ ] Add guardrail tests first.
- [ ] Collapse to one canonical owner path.
- [ ] Remove or wrap parallel paths.
- [ ] Tighten static guardrails.

## Residual Closure Inventory

- [ ] Owner-path cutovers are complete.
- [ ] Tail consumers are cut over.
- [ ] Diagnostics, admin, and reporting surfaces match the new contract.
- [ ] Superseded paths, booleans, or vocabulary are deleted.
- [ ] Required proof layers are complete.

## Validation

1. Targeted unit tests.
2. Targeted integration tests.
3. Distributed harness scenarios.
4. Complexity and dependency checks.

## Done When

1. The canonical owner/path is in place.
2. Parallel implementations are removed or downgraded.
3. Required tests pass.
4. Follow-up work, if any, is split into new idea or package files.
