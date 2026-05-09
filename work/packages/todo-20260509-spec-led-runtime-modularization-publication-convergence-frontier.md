# Spec-Led Runtime Modularization Publication Convergence Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "The operation workflow timeout package moved the first frontier off operation_workflow_owner / workflow_timeout. The representative rerun now selects topology_publication_owner / publication_convergence with ACK_PENDING publication evidence, pendingAckCount 1, empty pendingAckNodeIds, and three missing published nodes.",
  "nextAction": "Freeze the publication convergence witness from the operation-workflow rerun, trace the publication owner ACK path, and rewrite the owner logic so pending ACK evidence has one canonical outcome and reason source.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --explain publication_ack_convergence",
    "Focused topology_publication_owner publication_convergence fixture from the representative report",
    "Focused publication owner/recovery tests selected by pending_acks_present",
    "Touched-file static guardrails selected by topology_publication_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/control-plane/publication-owner*.js",
    "src/control-plane/publication-recovery*.js",
    "src/bootstrap/shared/node-state-publication-owner.js",
    "test/control-plane/publication*.test.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/todo-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction",
    "escalationTriggers": [
      "pending ACK evidence requires changes outside topology_publication_owner",
      "focused fixture exposes operation workflow timeout as first frontier again",
      "representative proof still fails on publication_convergence after owner fix"
    ]
  },
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md"
}
-->

## Why

The operation-workflow package removed the stale dispatch-pending timeout
frontier. The fresh representative rerun still fails, but the analyzer now
selects publication convergence as the first frontier:
`topology_publication_owner / publication_convergence`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

## In Scope

1. Freeze the smallest publication convergence fixture from the representative
   report.
2. Trace the topology publication owner ACK path for `ACK_PENDING` evidence.
3. Rewrite the owner logic so pending ACK evidence has one canonical owner
   outcome, count source, node-id source, and reason set.
4. Keep diagnostics and harness consumers read-only and owner-bound.
5. Rerun representative rolling-restart and either close the frontier or
   migrate the next canonical owner-boundary blocker.

## Out Of Scope

1. Operation workflow timeout reentry; that is predecessor proof.
2. Active-gate report schema alias deletion.
3. Harness timeout increases, report relabeling, or fallback publication
   classification.
4. Pro or Enterprise work.

## Invariants

1. `publication_ack_convergence` is owned by
   `topology_publication_owner / publication_convergence`.
2. `pending_acks_present` must come from the publication owner contract, not
   from diagnostics reconstructing ACK debt from raw missing-node evidence.
3. `pendingAckCount` and `pendingAckNodeIds` must not disagree silently.
4. Priority recovery and active-gate evidence must not mask publication
   convergence debt.

## Tactical Inspiration

1. Raft and KRaft controller logs: publication ACK state is owned by one
   ordered metadata publication stream.
2. Kubernetes status conditions: pending ACK reasons must be stable and
   observed through the owning controller.
3. etcd watches: revisioned publication evidence must not be inferred from
   cache presence alone.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction`
- Escalation triggers: pending ACK evidence requires changes outside
  `topology_publication_owner`; focused fixture exposes operation workflow
  timeout as first frontier again; representative proof still fails on
  `publication_convergence` after owner fix.

## Shared Boundary Contract

Semantic owner: `topology_publication_owner`.

Canonical contract shape / vocabulary: publication status, publication epoch,
pending ACK count, pending ACK node ids, blocked publication node count,
missing published node ids, publication convergence boundary, and owner
reasons `publication_pending` and `pending_acks_present`.

Allowed consumers: topology convergence analyzer, failure bundle, publication
recovery diagnostics, publication owner tests, and sprint/package handoff
notes.

Prohibited reinterpretations: do not treat publication ACK convergence as
priority recovery progress, active-gate snapshot coverage, generic readiness
failure, or a harness timeout. Do not add fallback publication classification
outside the topology publication owner.

Primary diagnostics / proof surfaces: publication-convergence fixture,
topology convergence explain output, focused publication owner tests, static
guardrails, and representative rolling-restart.

## Generated Owner Evidence Block

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json`
- Scenario: `rolling-restart`
- Frontier edge: `publication_ack_convergence`
- Current semantic owner: `topology_publication_owner`
- Current boundary: `publication_convergence`
- Frontier state: `blocked`
- Dominant reason: `pending_acks_present`
- Evidence path: `report.scenarios[0].publicationConvergence`
- Reasons: `publication_pending, pending_acks_present`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --explain publication_ack_convergence`

## Detection / Analysis Tasks

- [ ] Review the operation workflow timeout package before implementation
      starts.
- [ ] Extract the smallest publication convergence fixture from the
      representative report.
- [ ] Trace the topology publication owner ACK path for `ACK_PENDING`.
- [ ] Identify any count/node-id/diagnostics branch that can mask pending ACK
      evidence.

## Implementation Tasks

- [ ] Add or update the focused publication convergence fixture.
- [ ] Rewrite the owner logic so pending ACK debt has one canonical decision
      path.
- [ ] Delete or guard superseded publication fallback branches.
- [ ] Update diagnostics/harness consumers only where owner vocabulary changes.
- [ ] Rerun representative rolling-restart and migrate any fresh frontier.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --explain publication_ack_convergence`
3. Focused publication owner/recovery tests selected by
   `topology_publication_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose`

## Done When

1. Publication convergence has one owner-bound decision path.
2. Focused publication owner and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or migrated to a fresh
   owner-boundary package with canonical evidence.
