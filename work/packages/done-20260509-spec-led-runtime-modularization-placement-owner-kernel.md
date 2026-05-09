# Spec-Led Runtime Modularization Placement Owner Policy Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "none",
  "playback": "none",
  "owner": "placement_owner",
  "boundary": "placement_policy_kernel",
  "dominantReason": "placement_policy_interleaves_filter_score_and_runtime_effects",
  "currentState": "Placement and move planning logic can still interleave eligibility filtering, scoring, admission, operation creation, and runtime effects in ways that are hard to audit after topology rewrites.",
  "nextAction": "Rewrite placement as a pure policy kernel with filter, score, reserve, and intent phases before touching operation execution.",
  "proof": [
    "Focused move planner policy tests",
    "Focused storage admission tests",
    "Placement decision table fixture",
    "Touched-file decision-boundary and literal guardrails"
  ],
  "touchedFiles": [
    "src/rebalancer/move-planner.js",
    "src/rebalancer/placement-owner-constants.js",
    "src/rebalancer/placement-owner-decision.js",
    "src/rebalancer/placement-owner-evidence.js",
    "test/rebalancer/move-planner-placement-owner-kernel.test.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Placement is a natural next rewrite after operation progress because it decides
what work should exist. The old risk is that placement, admission, and operation
creation become one branch lattice. This package creates a placement policy
kernel whose output is a placement intent, not a runtime side effect.

## Scope Basis

Spec-led runtime modularization design and Phase `0.1` topology workflow
stabilization scope.

## In Scope

1. Split placement into candidate evidence, filters, scores, reservation
   reasons, and placement intents.
2. Make storage admission an input to placement evidence or a separate
   admission decision, not a hidden branch inside operation creation.
3. Add decision fixtures for under-replicated, over-replicated, constrained,
   overloaded, stale-node, and no-op cases.
4. Emit placement intents for operation owner consumption.
5. Mark old direct operation creation paths for deletion or adapter ownership.

## Out Of Scope

1. Operation workflow execution.
2. Publication stream rewrites.
3. Rebalancing heuristic redesign beyond preserving current documented policy.
4. Pro or Enterprise placement features.

## Invariants

1. Placement decides desired movement; operation owner executes workflow
   progress.
2. Filter, score, reserve, and intent phases are explicit and independently
   testable.
3. Placement cannot read diagnostics or harness presentation state.
4. Placement absence and no-op states use named variants.

## Tactical Inspiration

1. Kubernetes Scheduler: separate filter, score, reserve, permit, and bind
   phases so policy can be tested without side effects.
2. CockroachDB allocator: make replica movement decisions from explicit
   constraint, diversity, load, and leaseholder evidence.
3. Borg/Omega-style scheduling: keep optimistic policy separate from the
   committing owner.

## Hotspots

1. `src/rebalancer/move-planner*.js`
2. `src/rebalancer/unified-rebalancer*.js`
3. `src/rebalancer/storage-admission-service.js`
4. `src/rebalancer/rebalance-coordinator*.js`
5. `test/rebalancer/move-planner*.test.js`
6. `test/rebalancer/storage-admission*.test.js`

## Shared Boundary Contract

Semantic owner: `placement_owner`.

Canonical contract shape / vocabulary: placement evidence, candidate set,
filter result, score vector, reservation result, placement intent, and no-op
reason.

Allowed consumers: operation owner adapter, rebalancer entrypoints, placement
tests, and diagnostics after consumer rewrite.

Prohibited reinterpretations: operation owner and diagnostics cannot recreate
placement eligibility from raw node state once placement emits an intent or
no-op reason.

Primary diagnostics / proof surfaces: move planner policy tests, admission
fixtures, decision table proof, static guardrails.

## Detection / Analysis Tasks

- [x] Inventory current placement inputs and side effects.
- [x] Classify each branch as filter, score, reserve, intent, adapter, or
      deletion.
- [x] Identify duplicate admission decisions.
- [x] Identify all direct operation creation paths owned by placement today.

## Implementation Tasks

- [x] Add placement constants, evidence, state, and decision modules.
- [x] Implement filter and score tables.
- [x] Implement reservation and placement intent output.
- [x] Update move planner tests to assert policy outputs.
- [x] Leave operation execution to the operation owner adapter.

## Implementation Notes

Placement target selection now runs through the placement owner kernel:

- `placement-owner-evidence.js` normalizes candidate nodes, current replicas,
  policy constraints, capacity diagnostics, and transition reservations or
  deferrals once.
- `placement-owner-decision.js` emits explicit `filterResult`, `scoreResult`,
  `reservationResult`, and `intent` phases, plus the legacy
  `placementOwnerOutcome` shape for existing consumers.
- `MovePlanner.calculateTargetState`, partition placement, message-group
  placement, `sortNodesByLoad`, and `sortNodesBySuitability` consume the kernel
  for target selection. Move calculation and operation workflow execution remain
  outside placement.
- Superseded local topology scoring and placement-target helper branches were
  deleted from `MovePlanner`; the placement owner kernel is now the single
  target-selection and scoring path.
- Existing partial placement owner vocabulary in `topology-owner-constants.js`
  remains the public compatibility surface; new placement owner modules import
  and reuse that vocabulary instead of introducing duplicate policy names.

## Validation

1. Focused move planner tests.
2. Focused storage admission tests.
3. Placement decision table fixture.
4. Touched-file decision-boundary and literal guardrails.

### Validation Notes

- FIXED: Ramanujan review finding that placement kernel objects emitted the
  broader topology owner. `PLACEMENT_OWNER` is now the canonical owner constant
  for placement evidence, filter, score, reserve, intent, and decision objects;
  the legacy `placementOwnerOutcome.owner` compatibility output still emits
  `TOPOLOGY_CONTROL_PLANE_OWNER`.
- PASS: `node --test test/rebalancer/move-planner-placement-owner-kernel.test.js`
  - 36 tests, 7 suites.
- PASS: `node scripts/check-guideline-literals.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 new literal-guideline violations.
- PASS: `node scripts/check-guideline-decision-boundaries.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 decision-boundary guideline violations.
- PASS: `npm run audit:runtime-grammar:file -- src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 runtime-grammar-contract violations.
- PASS: `git diff --check -- src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js test/rebalancer/move-planner-placement-owner-kernel.test.js work/sprints/active-2026-q2-spec-led-runtime-modularization.md work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`

- PASS: `node --test test/rebalancer/move-planner-placement-owner-kernel.test.js`
  - 22 tests, 7 suites.
- PASS: `node --test test/rebalancer/topology-owner-contracts.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-admission-service.test.js`
  - 151 tests, 54 suites.
- PASS: `node --test test/rebalancer/move-planner*.test.js test/rebalancer/placement-wrapping-duplicate-adds.test.js test/rebalancer/planner-single-path-enforcement.test.js`
  - 111 tests, 54 suites.
- PASS: `node scripts/check-guideline-literals.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js src/rebalancer/storage-admission-service.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 new literal-guideline violations.
- PASS: `node scripts/check-guideline-decision-boundaries.js src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js src/rebalancer/storage-admission-service.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 decision-boundary guideline violations.
- PASS: `npm run audit:runtime-grammar:file -- src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js src/rebalancer/storage-admission-service.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js`
  - 0 runtime-grammar-contract violations.
- PASS: `git diff --check -- src/rebalancer/move-planner.js src/rebalancer/move-planner-state-methods.js src/rebalancer/storage-admission-service.js src/rebalancer/placement-owner-constants.js src/rebalancer/placement-owner-evidence.js src/rebalancer/placement-owner-decision.js test/rebalancer/move-planner-placement-owner-kernel.test.js test/rebalancer/move-planner-capacity-gating.test.js test/rebalancer/storage-admission-service.test.js work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`
- PASS: `npm run work:validate`
  - Work tracker validation OK for 23 file(s).
- PASS: `npm run work:dirty-scope -- --package work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`
  - Package-owned dirty entries: 6; unrelated dirty entries: 6.

### Workflow Adapter Review Fix Notes

The mandatory predecessor review finding is fixed before placement
implementation starts. The adapter still emits
`DISPATCH_LOCAL_OWNER_COMMAND`, but the coordinator-created `PENDING` local
owner executor now restores the previous claim-and-prime semantics through the
owner transition lane. Ordinary local coordinator-created operations stop after
the claim to `SENDING`; critical local coordinator-created operations dispatch
from the claimed `SENDING` snapshot.

Validation for the repair:

- PASS: `node --test test/rebalancer/coordinator-created-operation-progress.test.js`
  - 31 tests, 7 suites.
- PASS: `node --test test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/coordinator-created-operation-progress.test.js`
  - 282 tests, 25 suites.
- PASS: `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `git diff --check -- src/rebalancer/operation-workflow-owner-ports.js work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md`

## Done When

1. Placement emits explicit intents or no-op reasons.
2. Operation creation is not hidden in placement policy.
3. Old placement branch piles are deleted or assigned to later adapter cleanup.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Bohr (`019e0bba-863b-7c43-9e0a-3862c9ff01b4`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Mendel (`019e0bbe-6a4b-7a12-8a4e-20a959222684`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md`.
- [x] Implementation subagent recorded:
      Agent Gibbs (`019e0bc7-14e3-76e0-b61f-d52bd9c50257`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-placement-owner-kernel.md`.

## Commit And Push Ledger

- Focused package commit: `5c0bd802`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
