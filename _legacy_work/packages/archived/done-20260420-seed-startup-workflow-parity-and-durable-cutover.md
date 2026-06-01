# Seed Startup Workflow Parity And Durable Cutover

## Status

Done on 2026-04-20.

This package depended on
`done-20260420-startup-workflow-kernel-extraction-and-join-cutover.md`.

Seed startup now uses the same durable workflow substrate as join, including
explicit checkpointed control-plane-ready, runtime-ready, and finalized steps
through `src/bootstrap/bootstrap-service.js`,
`src/bootstrap/seed-startup-session-store.js`, and the shared runner.

Focused proof is green:

1. `test/bootstrap/bootstrap-sequence.test.js`
2. `test/bootstrap/bootstrap-phase-state-machine-integration.test.js`
3. `test/bootstrap/seed-infrastructure-phase.test.js`
4. `test/bootstrap/seed-registration-phase.test.js`
5. `test/bootstrap/bootstrap-failure-cleanup.test.js`
6. `test/bootstrap/startup-convergence-gate.test.js`
7. `test/integration/seed-node-bootstrap.integration.test.js`

Shared metrics handoff:
`todo-20260420-duplication-ratchet-classification-and-boundary-reduction.md`.

## Why

`seed` startup still uses a serial phase plan plus meaningful orchestration in
`BootstrapService` after the formal pipeline finishes. That means seed
finalization, retryability, and restart semantics are not described by the
same durable workflow model as join.

This package removes that asymmetry and moves seed startup onto the same
explicit checkpoint substrate.

## Scope Basis

Roadmap Phase `0.1 — Internal Coherence` maintenance/refactoring scope.

## In Scope

1. Represent seed startup as the same style of durable workflow contract used
   by join.
2. Move post-pipeline seed cutover and finalization work into explicit
   workflow checkpoints.
3. Give seed restart and failure cleanup one canonical workflow state story.
4. Preserve seed-specific phase meaning while aligning on shared workflow
   semantics.

## Out Of Scope

1. Startup authority consumer unification.
2. Broad readiness redesign.
3. Transport redesign outside direct startup collaborators.

## Scenario Targets

1. `seed-restart-under-load`
2. `rolling-restart`
3. `node-join-under-load`

## Invariants

1. Seed finalization must not live as hidden orchestration after the formal
   workflow is considered complete.
2. Seed and join must share the same semantic meaning for checkpoint,
   retryability, terminal outcome, and resume.
3. Seed cleanup on failure must be derivable from workflow state rather than
   only from local phase fields.
4. The cutover must fail closed; no package closure with old seed runner and
   new seed workflow both active for the same path.

## Shared Boundary Contract

- Semantic owner: startup workflow kernel instantiated for seed startup
- Canonical contract shape / vocabulary: one seed workflow state carrying
  checkpoint identity, workflow status, retryability, failure details,
  finalization status, and timestamps
- Allowed consumers: `BootstrapService`, cleanup owners, diagnostics, restart
  proof, focused tests
- Prohibited reinterpretations: treating seed phase completion as success while
  finalization and runtime handoff still occur outside the workflow contract
- Primary diagnostics / proof surfaces: seed sequence tests, phase tests,
  restart/recovery integration proof

## Hotspots

1. `src/bootstrap/bootstrap-service.js`
2. `src/bootstrap/pipeline/seed-startup-plan.js`
3. `src/bootstrap/pipeline/startup-pipeline-runner.js`
4. `src/bootstrap/owners/seed-phase-owners.js`
5. `src/bootstrap/phases/seed-infrastructure-phase.js`
6. `src/bootstrap/phases/seed-cleanup-handler.js`
7. `test/bootstrap/bootstrap-sequence.test.js`
8. `test/bootstrap/bootstrap-phase-state-machine-integration.test.js`
9. `test/bootstrap/seed-infrastructure-phase.test.js`
10. `test/bootstrap/seed-registration-phase.test.js`
11. `test/bootstrap/bootstrap-failure-cleanup.test.js`
12. `test/integration/seed-node-bootstrap.integration.test.js`

## Detection / Analysis Tasks

- [ ] Inventory every seed-side action that still runs after the formal phase
      pipeline completes.
- [ ] Define the seed checkpoint model needed to make finalization and cleanup
      explicit.
- [ ] Identify restart and cleanup callers that currently infer seed progress
      from local service state instead of workflow state.

## Implementation Tasks

- [ ] Add the seed durable workflow state and checkpoint contract.
- [ ] Move seed post-pipeline orchestration into explicit workflow checkpoints.
- [ ] Route seed restart and failure handling through the workflow record.
- [ ] Align seed cleanup triggers with workflow terminal state.
- [ ] Delete superseded seed-only orchestration branches once the new workflow
      path is proven.

## Residual Closure Inventory

- [ ] Seed startup uses the shared startup workflow kernel.
- [ ] Seed finalization is checkpointed instead of hidden after the phase list.
- [ ] Seed restart and cleanup consume workflow state rather than local
      reconstruction.
- [ ] The old seed serial orchestration path is deleted or reduced to thin
      wiring only.

## Validation

1. `test/bootstrap/bootstrap-sequence.test.js`
2. `test/bootstrap/bootstrap-phase-state-machine-integration.test.js`
3. `test/bootstrap/seed-infrastructure-phase.test.js`
4. `test/bootstrap/seed-registration-phase.test.js`
5. `test/bootstrap/bootstrap-failure-cleanup.test.js`
6. `test/bootstrap/startup-convergence-gate.test.js`
7. `test/integration/seed-node-bootstrap.integration.test.js`
8. `npm run test:metrics`

## Done When

1. Seed startup has the same durable workflow semantics as join.
2. Seed finalization and restart behavior are part of the formal workflow
   contract rather than hidden tail logic.
3. Focused seed restart and failure cleanup proof stay green without the old
   orchestration path.
