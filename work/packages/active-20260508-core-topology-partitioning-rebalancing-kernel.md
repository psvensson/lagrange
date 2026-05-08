# Core Topology Partitioning Rebalancing Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-08",
  "scenario": "core-topology-control-plane-rewrite",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_control_plane",
  "boundary": "partitioning_rebalancing_kernel",
  "dominantReason": "placement_operation_owner_required_before_partitioning_rebalancing_runtime_extraction",
  "currentState": "Placement and operation owner contracts are implemented. Timeout/cache visibility blocker is fixed: saturated cache-only add budget stays conservative, and reservation cleanup tests isolate storage-reservation reads from operation-owner visibility reads.",
  "nextAction": "Run work validation, commit and push the focused package slice, then activate the publication/projection boundary package.",
  "proof": [
    "node --test test/rebalancer/topology-owner-contracts.test.js",
    "node --test test/rebalancer/move-planner-inflight-cleanup.test.js",
    "node --test test/rebalancer/rebalance-coordinator-operation-ownership.test.js",
    "node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js",
    "node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js",
    "node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js",
    "node --test test/control-plane/membership-lifecycle-controller.test.js test/bootstrap/bootstrap-membership-owner-outcome-consumers.test.js test/bootstrap/message-group-assignment-centralization.test.js",
    "node scripts/check-guideline-literals.js src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js",
    "node scripts/check-guideline-decision-boundaries.js src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js",
    "npm run audit:runtime-grammar:file -- src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js",
    "npm run work:validate",
    "npm run work:context",
    "git diff --check"
  ],
  "touchedFiles": [
    "src/bootstrap/rejoin-hints-constants.js",
    "src/control-plane/membership-lifecycle-controller.js",
    "src/bootstrap/owners/service-leader-readiness-owner.js",
    "src/bootstrap/owners/bootstrap-join-admission-owner.js",
    "test/control-plane/membership-lifecycle-controller.test.js",
    "test/bootstrap/bootstrap-membership-owner-outcome-consumers.test.js",
    "test/bootstrap/message-group-assignment-centralization.test.js",
    "src/rebalancer/topology-owner-constants.js",
    "src/rebalancer/move-planner.js",
    "src/rebalancer/operation-workflow-owner-segment-1.js",
    "src/rebalancer/rebalance-coordinator-segment-5.js",
    "test/rebalancer/topology-owner-contracts.test.js",
    "test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js",
    "work/packages/active-20260508-core-topology-partitioning-rebalancing-kernel.md",
    "work/sprints/active-2026-q2-core-topology-control-plane-rewrite.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "predecessor": "work/packages/done-20260508-core-topology-boot-join-rejoin-kernel.md"
}
-->

## Why

Partitioning and rebalancing need separate placement intent and operation
actuation owners so assignment policy, workflow progress, retry, and terminal
outcomes cannot be inferred from incidental cache or timer evidence.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, with the Core Topology
Control-Plane Rewrite sprint acting as the representative topology workflow,
failure-simulation, and production-guarantee track.

## In Scope

1. Define placement owner inputs, outputs, and policy vocabulary.
2. Define operation owner lifecycle, retry, resume, and terminal vocabulary.
3. Cut split, move, repair, and recovery paths over to the owner contracts.

## Out Of Scope

1. Membership admission decisions except as consumed owner evidence.
2. Projection/readiness consumer cutover.
3. Pro or Enterprise-only behavior, operator flows, or control surfaces.

## Shared Boundary Contract

Semantic owner: `topology_control_plane`.

Canonical contract shape / vocabulary: placement intent owner outcomes and
operation actuation owner outcomes for partition splits, replica movement,
repair, retry, resume, timeout, and terminal workflow decisions.

Allowed consumers: rebalancer planners, operation workflow coordinator,
bootstrap move-replica admission, diagnostics, admin, harness, and later
projection/readiness consumers.

Prohibited reinterpretations: partitioning and rebalancing paths must not infer
placement, retryability, ownership, or terminal operation state from raw cache
visibility, incidental service rows, phase timers, reservation presence, or
workflow timeout text outside the canonical placement and operation owners.

Primary diagnostics / proof surfaces: focused placement/operation owner tests,
rebalancer operation workflow tests, affected bootstrap move-replica admission
tests, file-scoped static guardrails, and the sprint representative proof
ladder after implementation.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent McClintock
      (`019e08a8-b62f-71d3-a46c-0fe521cb9b83`) reviewed
      `work/packages/done-20260508-core-topology-boot-join-rejoin-kernel.md`;
      result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed: Agent Copernicus
      (`019e08ab-196b-73a0-b182-005b187ee5ef`) fixed
      `work/packages/done-20260508-core-topology-boot-join-rejoin-kernel.md`.
- [x] Implementation subagent recorded: Agent Locke
      (`019e08b3-ef89-7930-99e1-2aa62d1b6815`) implemented
      `work/packages/active-20260508-core-topology-partitioning-rebalancing-kernel.md`.
- [x] Validation fix subagent recorded: Agent Newton
      (`019e08c2-3002-75a1-bb72-a675e97f4a45`) fixed the
      `rebalance-coordinator-timeout-cache-visibility` blocker for
      `work/packages/active-20260508-core-topology-partitioning-rebalancing-kernel.md`.

## Review Finding Fixes

1. Invalid membership startup mode now resolves to the canonical blocked
   startup owner outcome instead of throwing from startup-mode rule lookup.
2. Bootstrap service-leader readiness consumes `membershipOwnerOutcome` when
   selecting durable rejoin required leader tables.
3. Bootstrap message-group assignment consumes `membershipOwnerOutcome` when
   allowing durable rejoin reuse of an existing owned group.
4. Saturated cache-visible add budget now stays on the conservative cache-only
   decision unless the caller explicitly requests owner-RPC recheck on
   saturation.
5. Reservation cleanup proof now isolates storage-reservation owner reads from
   operation-owner visibility reads.

## Static Drift Ledger

Preflight:

- [x] McClintock review found fixes required before partitioning/rebalancing
      implementation starts.
- [x] Existing unrelated dirty files were left untouched.
- [x] Preflight file-scoped literals, decision-boundary, and runtime-grammar
      checks were clean for `src/rebalancer/move-planner.js` and
      `src/rebalancer/operation-workflow-owner-segment-1.js`.

Implementation:

- [x] Runtime edits stayed within membership owner normalization and bootstrap
      consumers cited by the review.
- [x] Focused invalid-startup and outcome-vs-startup regressions were added.
- [x] Partitioning/rebalancing implementation subagent proof recorded.
- [x] Added canonical topology placement and operation owner vocabulary in
      `src/rebalancer/topology-owner-constants.js`.
- [x] `MovePlanner` now emits placement owner outcomes for target selection.
- [x] Operation workflow dispatch/transition retry and deferred transition
      resume now consume operation owner retry/resume outcomes.
- [x] Preserved the existing parallel-session change in
      `src/rebalancer/operation-workflow-owner-segment-1.js` that removes
      `!this.isInitialized` from the created-operation handoff retry guard.
- [x] Fixed the timeout/cache visibility validation blocker with a fresh
      validation-fix subagent.
- [x] Post-change file-scoped literals, decision-boundary, and runtime-grammar
      checks are clean for touched bootstrap and rebalancer runtime files.

## Validation

1. `node --test test/rebalancer/topology-owner-contracts.test.js` - passed.
2. `node --test test/rebalancer/move-planner-inflight-cleanup.test.js` -
   passed.
3. `node --test test/rebalancer/rebalance-coordinator-operation-ownership.test.js`
   - passed.
4. `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-test-cases.js`
   - passed as a standalone registration shard.
5. `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility-tail-more-test-cases.js`
   - passed as a standalone registration shard.
6. `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
   - passed.
7. `node --test test/control-plane/membership-lifecycle-controller.test.js test/bootstrap/bootstrap-membership-owner-outcome-consumers.test.js test/bootstrap/message-group-assignment-centralization.test.js`
   - passed.
8. `node scripts/check-guideline-literals.js src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js`
   - passed.
9. `node scripts/check-guideline-decision-boundaries.js src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js`
   - passed.
10. `npm run audit:runtime-grammar:file -- src/bootstrap/rejoin-hints-constants.js src/control-plane/membership-lifecycle-controller.js src/bootstrap/owners/service-leader-readiness-owner.js src/bootstrap/owners/bootstrap-join-admission-owner.js src/rebalancer/topology-owner-constants.js src/rebalancer/move-planner.js src/rebalancer/operation-workflow-owner-segment-1.js src/rebalancer/rebalance-coordinator-segment-5.js`
   - passed.
11. `npm run work:current-blocker` - passed and refreshed
    `work/sprints/current-blocker.json` / `work/sprints/current-blocker.md`.
12. `npm run work:validate` - passed.
13. `npm run work:context` - passed.
14. `git diff --check` - passed.
