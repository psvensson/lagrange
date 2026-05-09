# Spec-Led Runtime Modularization Workflow Owner Adapter Cutover

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-current-release-gate-after-workflow-timeout-stale-progress-fix.report.json",
  "playback": "none",
  "owner": "operation_workflow_owner",
  "boundary": "workflow_effects_adapter",
  "dominantReason": "operation_owner_kernel_not_yet_driving_effects",
  "currentState": "After the operation decision kernel exists, existing workflow-owner adapters still need to execute canonical effect commands and retire old effectful branch paths.",
  "nextAction": "Route operation workflow adapters through the decision kernel and execute only canonical effect commands.",
  "proof": [
    "Focused operation workflow adapter tests",
    "Focused coordinator-created remote handoff test",
    "Focused stale-progress reconcile test",
    "Representative rolling-restart rerun if operation progress remains the active blocker"
  ],
  "touchedFiles": [
    "src/rebalancer/operation-workflow-owner.js",
    "src/rebalancer/operation-workflow-owner-effects.js",
    "src/rebalancer/operation-workflow-owner-ports.js",
    "src/rebalancer/operation-workflow-owner-adapter.js",
    "src/rebalancer/rebalance-coordinator*.js",
    "src/rebalancer/replica-operation-repository*.js",
    "test/rebalancer/operation-workflow-owner*.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md"
  ],
  "predecessor": "work/packages/todo-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md"
}
-->

## Why

A pure decision kernel is only useful once the runtime executes its commands.
This package cuts the operation workflow owner over to the new contract while
keeping side effects idempotent, ordered, and observable. It is the package that
turns operation modularization from analysis into live behavior.

## Scope Basis

Operation owner decision kernel and priority recovery observation contract
packages.

## In Scope

1. Build adapter ports for durable operation reads, owner lease reads, workflow
   history reads, dispatch enqueue, remote-owner wake, stale-progress reconcile,
   serial dependency wait, and status publication.
2. Execute only effect commands emitted by the operation owner kernel.
3. Preserve idempotency across retries, owner handoff, and process restart.
4. Delete or downgrade direct branch paths that bypass the decision kernel.
5. Prove remote handoff, persisted-not-dispatched, stale-progress reconcile,
   and serial wait behavior.

## Out Of Scope

1. Changing operation outcome vocabulary except for defects discovered during
   adapter proof.
2. Placement, publication, and readiness owner rewrites.
3. Diagnostics consumer rewrite, except where old consumers must be kept
   compiling against adapter changes.

## Invariants

1. Adapters execute commands; they do not decide operation state.
2. Every effect is idempotent and anchored to operation id, owner term or
   durable workflow revision, and target partition.
3. A failed effect returns to the owner kernel as evidence for the next
   reconcile pass.
4. Runtime code does not introduce hidden default states.

## Tactical Inspiration

1. Temporal/Cadence command execution: deterministic workflow decisions emit
   commands that workers execute idempotently.
2. Kubernetes reconcile loops: adapters write desired changes, observe the next
   state, and re-enter instead of assuming immediate convergence.
3. Raft/KRaft controller discipline: ownership and revision evidence gates all
   externally visible progress.

## Hotspots

1. `src/rebalancer/operation-workflow-owner.js`
2. `src/rebalancer/operation-workflow-owner-effects.js`
3. `src/rebalancer/rebalance-coordinator*.js`
4. `src/rebalancer/replica-operation-repository*.js`
5. `src/rebalancer/storage-admission-service.js`
6. `test/rebalancer/operation-workflow-owner*.test.js`
7. `test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`

## Shared Boundary Contract

Semantic owner: `operation_workflow_owner`.

Canonical contract shape / vocabulary: adapter input evidence, decision
outcome, ordered commands, command result evidence, and owner status update.

Allowed consumers: operation runtime, priority recovery observer, diagnostics
after consumer rewrite, and focused operation tests.

Prohibited reinterpretations: adapter code cannot add decision branches around
readiness, admission, retryability, phase, or lifecycle outside the decision
kernel.

Primary diagnostics / proof surfaces: focused adapter tests, stale-progress
regression, remote handoff regression, representative rolling restart when
active.

## Detection / Analysis Tasks

- [ ] List all side effects currently embedded in operation branch paths.
- [ ] Map each side effect to a kernel command.
- [ ] Find direct writes or dispatches that bypass the owner contract.
- [ ] Identify old helper functions that become dead code after cutover.

## Implementation Tasks

- [ ] Add operation ports and adapter module.
- [ ] Route existing workflow-owner entrypoints through evidence normalization,
      decision, and command execution.
- [ ] Feed command results back as next-pass evidence.
- [ ] Preserve public entrypoint shape while removing internal duplicate paths.
- [ ] Delete superseded branches and update focused tests.

## Validation

1. Focused operation workflow adapter tests.
2. Focused coordinator-created remote handoff test.
3. Focused stale-progress reconcile test.
4. Touched-file decision-boundary and literal guardrails.
5. Representative rolling-restart rerun if this package is the active gate
   closure slice.

## Done When

1. Runtime operation progress flows through the kernel.
2. All operation effects are canonical commands.
3. Old operation effect branches are removed or unreachable with proof.
