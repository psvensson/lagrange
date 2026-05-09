# Spec-Led Runtime Modularization Workflow Owner Adapter Cutover

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
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
    "test/rebalancer/operation-workflow-owner-adapter.test.js",
    "test/rebalancer/operation-workflow-owner*.test.js",
    "test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js",
    "test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md"
  ],
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md",
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true
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

- [x] List all side effects currently embedded in operation branch paths.
- [x] Map each side effect to a kernel command.
- [x] Find direct writes or dispatches that bypass the owner contract.
- [x] Identify old helper functions that become dead code after cutover.

### Detection Notes

Side-effect paths mapped to canonical commands:

- coordinator-created local owner dispatch -> `dispatch_local_owner_command`
- coordinator-created remote owner wake -> `wake_remote_owner_command`
- observed stale-progress timeout reconcile -> `reconcile_stale_progress_command`
- existing non-dispatch transition advancement -> `advance_existing_operation_command`
- terminal success publication acknowledgement -> `record_terminal_success_command`
- terminal failure publication acknowledgement -> `record_terminal_failure_command`
- serial dependency wait / already observed owner progress -> `no_operation_effect`

Direct branch paths quarantined by this slice:

- `OperationWorkflowOwner.armCoordinatorCreatedOperation` now enters the adapter
  after the existing public preflight and single-flight guard.
- `OperationWorkflowOwner.reconcileObservedProgressOperation` now enters the
  adapter in observed-progress mode so dispatch is treated as already observed.
- `OperationWorkflowOwner.reconcileOperationProgress` now enters the adapter for
  owner reconcile advancement and stale-progress reconcile.
- dispatch-pending priority recovery snapshots are normalized from the adapter
  decision outcome when the snapshot is for operation workflow owner progress
  and not already in dispatched-waiting-progress state.

## Implementation Tasks

- [x] Add operation ports and adapter module.
- [x] Route existing workflow-owner entrypoints through evidence normalization,
      decision, and command execution.
- [x] Feed command results back as next-pass evidence.
- [x] Preserve public entrypoint shape while removing internal duplicate paths.
- [x] Delete superseded branches and update focused tests.

### Implementation Notes

Added `src/rebalancer/operation-workflow-owner-ports.js` and
`src/rebalancer/operation-workflow-owner-adapter.js`. The adapter builds
operation workflow evidence, calls the decision kernel, builds one canonical
effect command, and executes that command through ports.

The public operation owner entrypoint shapes are preserved. The cutover is
limited to the operation owner surface and does not rewrite placement,
publication, readiness, or direct control-plane consumers.

The direct dispatch-pending priority-recovery builder assertion now supplies
the operation-owner outcome explicitly, matching the new consumer contract
instead of expecting the control-plane builder to rediscover owner workflow
intent from stale progress evidence.

## Validation

1. Focused operation workflow adapter tests.
2. Focused coordinator-created remote handoff test.
3. Focused stale-progress reconcile test.
4. Touched-file decision-boundary and literal guardrails.
5. Representative rolling-restart rerun if this package is the active gate
   closure slice.

### Validation Notes

- PASS: `node --test test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js`
  - 189 tests, 5 suites.
- PASS: `node --test test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
  - 62 tests, 13 suites.
- PASS: `node --test test/rebalancer/rebalance-coordinator-timeout-cache-visibility.test.js`
  - 168 tests, 47 suites.
- PASS: `node --test test/rebalancer/priority-recovery-dispatch-pending-timeout-reentry.test.js`
  - 51 tests, 6 suites.
- PASS: `node --test test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js`
  - 251 tests, 18 suites.
- PASS: `node scripts/check-guideline-literals.js ...expanded touched runtime files...`
- PASS: `node scripts/check-guideline-decision-boundaries.js ...expanded touched runtime files...`
- PASS: `npm run audit:runtime-grammar:file -- ...expanded touched runtime files...`
- PASS: `git diff --check -- ...touched package files...`

### Post-Closure Review Fix Notes

The mandatory review finding reported before placement implementation is fixed.
Coordinator-created local `PENDING` operations still route through
`DISPATCH_LOCAL_OWNER_COMMAND`, but the command executor now preserves the
previous local-prime semantics: ordinary local creations claim only to
`SENDING`, while critical local creations dispatch from the claimed `SENDING`
snapshot. This keeps the kernel/adapter command contract intact without
collapsing the coordinator-created entrypoint into direct dispatch.

Additional repair validation:

- PASS: `node --test test/rebalancer/coordinator-created-operation-progress.test.js`
  - 31 tests, 7 suites.
- PASS: `node --test test/rebalancer/operation-workflow-owner-decision.test.js test/rebalancer/operation-workflow-owner-adapter.test.js test/rebalancer/coordinator-created-operation-progress-remote-handoff.test.js test/rebalancer/coordinator-created-operation-progress.test.js`
  - 282 tests, 25 suites.
- PASS: `node scripts/check-guideline-literals.js src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `node scripts/check-guideline-decision-boundaries.js src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `npm run audit:runtime-grammar:file -- src/rebalancer/operation-workflow-owner-ports.js`
- PASS: `git diff --check -- src/rebalancer/operation-workflow-owner-ports.js work/packages/active-20260509-spec-led-runtime-modularization-placement-owner-kernel.md work/sprints/active-2026-q2-spec-led-runtime-modularization.md`

Repair commit: `f027239f`, pushed to
`origin/codex/pending-ack-eligibility-filter`.

## Done When

1. Runtime operation progress flows through the kernel.
2. All operation effects are canonical commands.
3. Old operation effect branches are removed or unreachable with proof.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Lovelace (`019e0b9d-46a1-7972-82bc-6e96b2411d3e`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md`; result `fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      Agent Hume (`019e0b9f-a641-7d91-8e02-be446b4b09b0`) fixed `work/packages/done-20260509-spec-led-runtime-modularization-priority-recovery-observation-contract.md`.
- [x] Implementation subagent recorded:
      Agent Nietzsche (`019e0ba5-18a8-76d3-a4ef-3653a2d95aab`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-workflow-owner-adapter-cutover.md`.

## Commit And Push Ledger

- Focused package commit: `47a9a36d`
- Pushed to: `origin/codex/pending-ack-eligibility-filter`
- Commit contains only package-owned files/package-status/allowed sprint handoff: `yes`
