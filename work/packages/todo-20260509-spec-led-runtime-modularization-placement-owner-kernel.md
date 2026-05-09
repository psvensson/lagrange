# Spec-Led Runtime Modularization Placement Owner Policy Kernel

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
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
    "src/rebalancer/move-planner*.js",
    "src/rebalancer/unified-rebalancer*.js",
    "src/rebalancer/storage-admission-service.js",
    "src/rebalancer/placement-owner-*.js",
    "test/rebalancer/move-planner*.test.js",
    "test/rebalancer/storage-admission*.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-placement-owner-kernel.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md"
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

- [ ] Inventory current placement inputs and side effects.
- [ ] Classify each branch as filter, score, reserve, intent, adapter, or
      deletion.
- [ ] Identify duplicate admission decisions.
- [ ] Identify all direct operation creation paths owned by placement today.

## Implementation Tasks

- [ ] Add placement constants, evidence, state, and decision modules.
- [ ] Implement filter and score tables.
- [ ] Implement reservation and placement intent output.
- [ ] Update move planner tests to assert policy outputs.
- [ ] Leave operation execution to the operation owner adapter.

## Validation

1. Focused move planner tests.
2. Focused storage admission tests.
3. Placement decision table fixture.
4. Touched-file decision-boundary and literal guardrails.

## Done When

1. Placement emits explicit intents or no-op reasons.
2. Operation creation is not hidden in placement policy.
3. Old placement branch piles are deleted or assigned to later adapter cleanup.
