# Core Topology Projection Readiness Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "projection_readiness_contract",
  "dominantReason": "projection_readiness_consumers_need_one_publication_derived_contract",
  "currentState": "Projection/readiness contract implementation and focused proof are complete; the package is ready for focused commit/push and closure before legacy-path deletion starts.",
  "nextAction": "Commit and push the focused projection/readiness contract slice, close this package, then activate the legacy path deletion and proof successor.",
  "proof": [
    "npm run work:context",
    "npm run work:validate",
    "git diff --check"
  ],
  "touchedFiles": [
    "src/control-plane/control-plane-readiness-constants.js",
    "src/control-plane/control-plane-readiness-service-segment-1.js",
    "src/control-plane/control-plane-readiness-service-segment-2.js",
    "src/control-plane/control-plane-readiness-service-segment-3.js",
    "src/control-plane/control-plane-readiness-service-shared.js",
    "src/control-plane/eligibility-snapshot.js",
    "src/control-plane/readiness-transition-state.js",
    "test/control-plane/control-plane-readiness-service.test-part-6.js",
    "work/model-ledger.jsonl",
    "work/packages/active-20260508-core-topology-projection-readiness-contract.md",
    "work/packages/done-20260508-core-topology-publication-projection-boundary.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-publication-projection-boundary.md"
}
-->

## Why

Projection and readiness must become the single consumer contract for topology
visibility instead of allowing diagnostics, admin, harness, and runtime readers
to recombine raw owner evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Define the canonical projection snapshot and revision stream.
2. Define internal, repair, and serve readiness states.
3. Cut diagnostics, admin, harness, and runtime readers over to the shared
   projection/readiness contract.

## Out Of Scope

1. New user-facing topology management concepts.
2. Owner mutation logic outside projection publication.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: projection/readiness snapshots derived
from publication boundary outcomes, node participation, and readiness lanes.
Consumers may observe internal, repair, and serve decisions, but must not
recreate those decisions from raw membership, placement, operation,
publication, cache, transport, or timer evidence.

Allowed consumers: projection/readiness runtime readers, bootstrap readiness,
diagnostics, admin, harness, and tests that verify topology visibility.

Prohibited reinterpretations: projection/readiness paths must not infer
readiness, routability, repair eligibility, serve eligibility, active
membership, or recovery gate closure outside the canonical projection/readiness
contract.

Primary diagnostics / proof surfaces: focused projection/readiness contract
tests, existing canonical readiness consumer tests, file-scoped static
guardrails, work validation, and the successor legacy-path deletion proof
ladder.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Popper
      (`019e08db-f177-77c0-90ba-4e72ed27e65f`) reviewed
      `work/packages/done-20260508-core-topology-publication-projection-boundary.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex
      (`019e08df-e496-78b0-a37b-de87f14b5192`) fixed
      `work/packages/done-20260508-core-topology-publication-projection-boundary.md`.
- [x] Implementation subagent recorded: Agent Faraday
      (`019e08e1-f19c-7320-84a1-f6c419feee8c`) implemented
      `work/packages/active-20260508-core-topology-projection-readiness-contract.md`.

## Static Drift Ledger

Preflight:

- [x] Review the completed publication/projection package before
      implementation starts.
- [x] Run fixes if the review finds them.
- [x] Record the implementation subagent before runtime edits are made for this
      package.

Implementation:

- [x] Runtime edits stay within the projection/readiness boundary.
- [x] Existing unrelated dirty files remain untouched.
- [x] File-scoped literal, decision-boundary, and runtime-grammar guardrails
      pass for touched runtime files.
- [x] LLM-backed file guideline guard is run or recorded as blocked by the
      repository-local API key before closure.

LLM-backed guard status: blocked by local invalid API key. Command attempted:
`npm run guard:guidelines:file -- src/control-plane/control-plane-readiness-constants.js src/control-plane/eligibility-snapshot.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-shared.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-2.js src/control-plane/control-plane-readiness-service-segment-3.js`.
Failure was `LLM API request failed (401)` / `invalid_api_key`.

## Implementation Notes

- Added `PROJECTION_READINESS_CONTRACT_STATE` and a compact snapshot key for
  `projectionReadinessContract`.
- `createEligibilitySnapshot` now derives one canonical
  `projectionReadinessContract` from `publicationBoundaryOutcome`, readiness
  dimensions, and priority recovery state.
- Compact readiness summaries, participation diagnostics, transition history,
  and recovery epoch summaries now carry or consume the canonical contract
  instead of recombining publication/recovery-gate evidence locally.
- Focused tests prove both the readiness snapshot contract and participation
  diagnostics consumer for publication convergence and planning-lane recovery.

## Validation Results

- `npm run work:context` passed.
- Pre-edit guard snapshot:
  `npm run audit:guideline:literals -- src/control-plane/eligibility-snapshot.js src/control-plane/control-plane-readiness-constants.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 new violations.
- Pre-edit guard snapshot:
  `npm run audit:guideline:decision-boundaries -- src/control-plane/eligibility-snapshot.js src/control-plane/control-plane-readiness-constants.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 violations.
- Pre-edit guard snapshot:
  `npm run audit:runtime-grammar:file -- src/control-plane/eligibility-snapshot.js src/control-plane/control-plane-readiness-constants.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 violations.
- `node --test test/control-plane/control-plane-readiness-service.test-part-6.js`
  passed: 46 tests, 14 suites.
- `node --test test/control-plane/control-plane-readiness-service.test-part-2.js`
  passed: 48 tests, 13 suites.
- `node --test test/control-plane/canonical-readiness-consumption.test.js`
  passed: 46 tests, 29 suites.
- Post-edit guard:
  `npm run audit:guideline:literals -- src/control-plane/control-plane-readiness-constants.js src/control-plane/eligibility-snapshot.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-shared.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-2.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 new violations.
- Post-edit guard:
  `npm run audit:guideline:decision-boundaries -- src/control-plane/control-plane-readiness-constants.js src/control-plane/eligibility-snapshot.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-shared.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-2.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 violations.
- Post-edit guard:
  `npm run audit:runtime-grammar:file -- src/control-plane/control-plane-readiness-constants.js src/control-plane/eligibility-snapshot.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-shared.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-2.js src/control-plane/control-plane-readiness-service-segment-3.js`
  passed with 0 violations.
- `npm run guard:guidelines:file -- src/control-plane/control-plane-readiness-constants.js src/control-plane/eligibility-snapshot.js src/control-plane/readiness-transition-state.js src/control-plane/control-plane-readiness-service-shared.js src/control-plane/control-plane-readiness-service-segment-1.js src/control-plane/control-plane-readiness-service-segment-2.js src/control-plane/control-plane-readiness-service-segment-3.js`
  blocked by local invalid API key (`401 invalid_api_key`).
- `npm run work:validate` passed.
- Parent-session `npm run audit:file-size` passed with the inherited ratchet:
  source `140/144` over 800 lines and test `156/159` over 1200 lines.
- `npm run work:model-ledger -- record --package work/packages/active-20260508-core-topology-projection-readiness-contract.md --model gpt-5-codex --reasoning-effort high --task-class distributed-runtime --outcome done --validation-status focused-passing-work-validate-passed-llm-guard-blocked --correction-loops 0 --review-findings 0 --notes "Added projection/readiness contract derived from publication boundary, readiness dimensions, and priority recovery; focused readiness tests and static guards passed; LLM guideline guard blocked by invalid local API key."`
  recorded model experience.
- `git diff --check` passed.
