# Startup Workflow Kernel Extraction And Join Cutover

## Status

Done on 2026-04-20.

This package depended on
`done-20260420-join-startup-durable-session-contract.md`.

The shared startup workflow kernel now owns checkpoint progression, failure
recording, resume semantics, and terminal advancement through
`src/bootstrap/pipeline/startup-pipeline-runner.js`, with join cut over to
named checkpoint segments.

Focused proof is green:

1. `test/bootstrap/join-coordinator.test.js`
2. `test/bootstrap/pipeline/startup-pipeline-runner.test.js`
3. `test/bootstrap/pipeline/join-startup-plan-segment-contract.test.js`
4. `test/bootstrap/join-startup-owner-routing.test.js`
5. `test/bootstrap/join-lifecycle-sub-phase-parity-characterization.test.js`
6. `test/integration/debug-join-flow.test.js`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`.

## Why

The repo already has the beginnings of a durable startup workflow model in the
join path. The current `StartupPipelineRunner` is a thin serial phase loop and
does not own retryability, terminal outcomes, resume rules, or checkpoint
finalization.

This package extracts a reusable startup workflow kernel from the real join
workflow instead of generalizing the thinner seed runner first.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Extract one reusable startup workflow kernel from the proven join path.
2. Move join startup to that kernel without changing its externally visible
   workflow semantics.
3. Make checkpoint progression, retry policy, and terminal result shaping
   explicit kernel-owned behavior.
4. Preserve join plan segment naming and observability through the cutover.

## Out Of Scope

1. Seed bootstrap cutover.
2. Startup authority consumer unification.
3. Runtime handoff and cleanup redesign outside join workflow execution.

## Scenario Targets

1. `node-join-under-load`
2. `rolling-restart`

## Invariants

1. The extracted kernel must preserve the durable join-session contract from
   the previous package.
2. Retryability, deferral, and terminal failure must be kernel-owned concepts
   rather than caller-local branch piles.
3. Join plan segments remain explicit, named checkpoints rather than implicit
   loops over anonymous phase functions.
4. The old `StartupPipelineRunner` serial loop must not become a second
   competing workflow substrate.

## Shared Boundary Contract

- Semantic owner: extracted startup workflow kernel plus join plan contract
- Canonical contract shape / vocabulary: one workflow execution contract with
  checkpoint identity, step outcome, retryability, terminal result, resume
  rule, and observability metadata
- Allowed consumers: join startup orchestration, seed cutover in the next
  package, diagnostics, focused tests
- Prohibited reinterpretations: local orchestration code owning retryability
  or resume semantics outside the workflow kernel
- Primary diagnostics / proof surfaces: join workflow tests, pipeline segment
  tests, characterization of checkpoint progression

## Hotspots

1. `src/bootstrap/join-coordinator.js`
2. `src/bootstrap/pipeline/join-startup-plan.js`
3. `src/bootstrap/pipeline/startup-pipeline-runner.js`
4. `src/bootstrap/node-joining-service-segment-2.js`
5. `src/bootstrap/node-joining-service.js`
6. `test/bootstrap/join-coordinator.test.js`
7. `test/bootstrap/pipeline/join-startup-plan-segment-contract.test.js`
8. `test/bootstrap/pipeline/startup-pipeline-runner.test.js`
9. `test/bootstrap/join-startup-owner-routing.test.js`
10. `test/bootstrap/join-lifecycle-sub-phase-parity-characterization.test.js`

## Detection / Analysis Tasks

- [ ] Inventory which startup semantics currently live in `JoinCoordinator`
      versus local join orchestration.
- [ ] Identify what should become generic kernel behavior and what must remain
      plan-specific join logic.
- [ ] Mark the `StartupPipelineRunner` responsibilities that become obsolete
      once the kernel owns checkpoint execution.

## Implementation Tasks

- [ ] Extract the reusable startup workflow kernel with explicit outcome and
      resume contracts.
- [ ] Move join workflow execution onto the new kernel.
- [ ] Keep join segment names and diagnostics stable across the cutover.
- [ ] Delete or narrow superseded serial-runner behavior that overlaps the new
      kernel semantics.
- [ ] Add focused proof for retry, resume, and terminal outcome shaping.

## Residual Closure Inventory

- [ ] Join startup uses the extracted workflow kernel rather than a
      coordinator-plus-runner hybrid.
- [ ] Retryability and terminal outcome shaping are kernel-owned.
- [ ] The old serial phase runner no longer acts as a shadow workflow model.
- [ ] Join plan segment diagnostics remain canonical and stable.

## Validation

1. `test/bootstrap/join-coordinator.test.js`
2. `test/bootstrap/pipeline/join-startup-plan-segment-contract.test.js`
3. `test/bootstrap/pipeline/startup-pipeline-runner.test.js`
4. `test/bootstrap/join-startup-owner-routing.test.js`
5. `test/bootstrap/join-lifecycle-sub-phase-parity-characterization.test.js`
6. `test/integration/debug-join-flow.test.js`
7. `npm run test:metrics`

## Done When

1. Join runs on one explicit startup workflow kernel with durable checkpoint
   semantics.
2. The kernel, not caller-local orchestration, owns retryability, resume, and
   terminal result shaping.
3. `StartupPipelineRunner` no longer represents a competing startup model for
   the join boundary.
