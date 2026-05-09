# Spec-Led Runtime Modularization Publication Convergence Frontier

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-09",
  "scenario": "spec-led-runtime-modularization",
  "artifact": "test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json",
  "playback": "test-output/reports/.playback/rolling-restart-spec-led-runtime-modularization-publication-convergence/rolling-restart/",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "pending_acks_present",
  "currentState": "Nash's implementation closed the concrete publication ACK residual. The representative report now shows publication_ack_convergence satisfied with publicationStatus PUBLISHED, pendingAckCount 0, pendingAckNodeIds [], missingPublishedCount 0. The representative still fails, but the first frontier migrated to operation_workflow_owner / rebalancer_handoff on priority_recovery_partition_progress.",
  "nextAction": "Open or continue the successor package on operation_workflow_owner / rebalancer_handoff priority recovery progress; only return to publication ACK convergence if the representative regresses.",
  "proof": [
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain publication_ack_convergence",
    "Focused topology_publication_owner publication_convergence fixture from the fresh representative report",
    "Focused publication owner/recovery tests selected by pending_acks_present",
    "Touched-file static guardrails selected by topology_publication_owner",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose"
  ],
  "touchedFiles": [
    "src/control-plane/publication-owner*.js",
    "src/control-plane/publication-recovery*.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/bootstrap/shared/node-state-publication-owner.js",
    "test/control-plane/publication*.test.js",
    "test/control-plane/membership-publication-coordinator-tail-more-test-cases.js",
    "test/scripts/analyze-topology-convergence.test.js",
    "test/diagnostics/topology-convergence-graph.test.js",
    "src/diagnostics/topology-convergence-graph.js",
    "scripts/analyze-topology-convergence.js",
    "work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md"
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
  "predecessor": "work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md",
  "currentBlocker": {
    "report": "test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json",
    "frontierEdge": "priority_recovery_partition_progress",
    "owner": "operation_workflow_owner",
    "boundary": "rebalancer_handoff",
    "dominantReason": "priority_recovery_progress_blocked",
    "residual": "publication ACK convergence satisfied; representative migrated to priority recovery operation workflow progress",
    "publicationAckConvergence": {
      "state": "satisfied",
      "publicationStatus": "PUBLISHED",
      "pendingAckNodeIds": [],
      "pendingAckCount": 0,
      "missingPublishedCount": 0
    },
    "migratedFrontier": {
      "edgeId": "priority_recovery_partition_progress",
      "owner": "operation_workflow_owner",
      "boundary": "rebalancer_handoff",
      "dominantReason": "priority_recovery_progress_blocked"
    }
  },
  "closed": "2026-05-09",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/todo-20260509-spec-led-runtime-modularization-operation-workflow-rebalancer-handoff-frontier.md"
}
-->

## Why

The operation-workflow package removed the stale dispatch-pending timeout
frontier. Pascal's fresh representative rerun selected publication convergence
as the first frontier: `topology_publication_owner /
publication_convergence`. Nash's continuation closed that concrete ACK
residual; the latest representative now migrates the first frontier to
`operation_workflow_owner / rebalancer_handoff`.

## Scope Basis

Successor split from
`work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md`
after the representative report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json`.
Pascal's representative rerun stayed on the same owner and boundary, so this
package remains active with the fresh report
`test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`.
This remains Phase `0.1` internal-coherence work in the AGPL repository.

Nash's continuation rerun materially reduced the blocker: publication ACK
convergence is now satisfied in the representative report, and the first
frontier migrated to `operation_workflow_owner / rebalancer_handoff`.

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

- Source artifact: `test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`
- Scenario: `rolling-restart`
- Publication ACK edge: `publication_ack_convergence`
- Publication ACK owner: `topology_publication_owner`
- Publication ACK boundary: `publication_convergence`
- Publication ACK state: `satisfied`
- Publication ACK reason: `publication_published`
- Publication ACK evidence path: `report.scenarios[0].publicationConvergence`
- Publication ACK proof: `publicationStatus: PUBLISHED`,
  `pendingAckCount: 0`, `pendingAckNodeIds: []`,
  `missingPublishedCount: 0`.
- Migrated frontier edge: `priority_recovery_partition_progress`
- Migrated owner: `operation_workflow_owner`
- Migrated boundary: `rebalancer_handoff`
- Migrated dominant reason: `priority_recovery_progress_blocked`
- Next explain command: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain publication_ack_convergence`

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      Agent Meitner (`019e0cd1-89f1-7682-97c8-0eac038c2518`) reviewed `work/packages/done-20260509-spec-led-runtime-modularization-operation-workflow-timeout-frontier.md`; result `clean`.
- [x] Fix subagent recorded or explicitly not needed:
      not-needed.
- [x] Implementation subagent recorded:
      Agent Pascal (`019e0cd5-236c-7141-bcc8-68a1bad8dc93`) implemented `work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`.
- [x] Post-implementation review recorded:
      Agent Tesla (`019e0ce0-6032-7ba3-80b7-5eb2aa5b5cd9`) reviewed Pascal's implementation slice for `work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`; result `fixes-required`.
- [x] Review-finding fix recorded:
      Agent Cicero (`019e0ce3-4d8e-7a81-9a94-d49007843601`) fixed the package bookkeeping findings for `work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`.
- [x] Continuation implementation subagent recorded:
      Agent Nash (`019e0ce6-5d6b-7140-9cd5-aa3fd4b223a5`) implemented the concrete ACK-node residual closure for `work/packages/done-20260509-spec-led-runtime-modularization-publication-convergence-frontier.md`.

## Detection / Analysis Tasks

- [x] Review the operation workflow timeout package before implementation
      starts.
- [x] Extract the smallest publication convergence fixture from the
      representative report.
- [x] Trace the topology publication owner ACK path for `ACK_PENDING`.
- [x] Identify any count/node-id/diagnostics branch that can mask pending ACK
      evidence.

## Implementation Tasks

- [x] Add or update the focused publication convergence fixture.
- [x] Rewrite the owner logic so pending ACK debt has one canonical decision
      path.
- [x] Delete or guard superseded publication fallback branches.
- [x] Update diagnostics/harness consumers only where owner vocabulary changes.
- [x] Rerun representative rolling-restart and record the migrated
      owner-boundary residual.
- [x] Trace and close the concrete ACK-node residual for
      `11601fe0-72d6-5853-8590-ec2881853e72`.

## Implementation Notes

- Added a focused count-only publication ACK fixture under
  `test/scripts/__fixtures__/topology-convergence/` that freezes the
  representative mismatch: `pendingAckCount: 1` and empty
  `pendingAckNodeIds`.
- Updated the publication owner pending-publication state model so
  `ACK_PENDING` status is owner-pending evidence even when ACK list evidence is
  unavailable. Required ACK lists that explicitly close ACK debt still resolve
  through the existing `NOT_REQUIRED` / `ACKNOWLEDGED` owner path.
- Added focused owner and recovery-gate tests proving count-only ACK debt keeps
  `ACK_LAG` ahead of missing published-node and priority-spread evidence.
- Nash traced the concrete pending ACK node to a split between canonical owner
  planning and durable ACK persistence. `deriveMembershipPublicationCandidate`
  computed the owner-derived ACK closure for unchanged publications, but the
  `reconcileClusterMembership` metadata-refresh branch only persisted priority
  metadata drift and dropped `candidate.acknowledgedNodeIds`.
- Updated the metadata-refresh row builder to carry normalized
  `acknowledgedNodeIds` through the existing ACK-complete closure state
  machine, and updated unchanged-publication reconciliation to persist when the
  candidate ACK set or publication status differs from the durable row.
- Added a focused membership publication coordinator test proving an unchanged
  publication can persist owner-derived ACK closure without unrelated metadata
  drift.
- The active ACK path no longer depends on the superseded count-only or
  diagnostics-derived fallback shape. Remaining external report-schema alias
  deletion is tracked separately in
  `work/packages/todo-20260509-spec-led-runtime-modularization-active-gate-report-schema-alias-deletion.md`.

## Proof Notes

- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-operation-workflow-timeout.report.json --explain publication_ack_convergence` passed and preserved the original witness:
  `publicationEpoch: 4`, `publicationStatus: ACK_PENDING`,
  `pendingAckCount: 1`, empty `pendingAckNodeIds`,
  `missingPublishedCount: 3`, dominant reason `pending_acks_present`.
- `npx tap test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js` passed: `225/225`.
- `node --test test/diagnostics/topology-convergence-graph.test.js test/scripts/analyze-topology-convergence.test.js` passed: `19/19`.
- Static guardrails passed with shell-expanded file paths:
  - `node scripts/check-guideline-literals.js src/control-plane/publication-owner*.js src/control-plane/publication-recovery*.js src/bootstrap/shared/node-state-publication-owner.js src/diagnostics/topology-convergence-graph.js`
  - `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner*.js src/control-plane/publication-recovery*.js src/bootstrap/shared/node-state-publication-owner.js src/diagnostics/topology-convergence-graph.js`
  - `npm run audit:runtime-grammar:file -- src/control-plane/publication-owner*.js src/control-plane/publication-recovery*.js src/bootstrap/shared/node-state-publication-owner.js src/diagnostics/topology-convergence-graph.js`
- The quoted-glob forms from the handoff failed before expansion because the
  guardrail scripts received literal `publication-owner*.js` paths.

## Pascal Fresh Frontier Evidence

- Representative rerun command:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose`
- Result: failed after `133.1s`; report written to
  `test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`.
- Superseded analyzer result remained the same owner and boundary:
  `publication_ack_convergence`, owner `topology_publication_owner`, boundary
  `publication_convergence`, dominant reason `pending_acks_present`.
- Superseded evidence changed from count-only debt to concrete ACK debt:
  `publicationEpoch: 4`, `publicationStatus: ACK_PENDING`,
  `pendingAckNodeIds: [11601fe0-72d6-5853-8590-ec2881853e72]`,
  `pendingAckCount: 1`, `missingPublishedCount: 3`,
  `publicationPending: true`, `recoveryProtocolState: publication_pending`,
  `prioritySpreadPending: true`.
- Superseded residual: publication ACK convergence did not close; Nash's
  continuation below traces and closes that concrete ACK-node residual.
- Tesla's review found that this package must remain active because the
  representative stayed on `topology_publication_owner /
  publication_convergence`; this bookkeeping fix updates the active metadata,
  proof surface, and task state to the fresh report and concrete ACK-node
  residual.

## Nash Continuation Proof

- Root cause: ACK ownership for this residual lived in
  `MembershipPublicationCoordinator` durable publication persistence, not in a
  diagnostics fallback. The canonical planning snapshot already identified the
  pending node as publishable/recovery-active, but unchanged-publication
  metadata refresh did not persist the owner-derived ACK set.
- `npx tap test/control-plane/membership-publication-coordinator.test.js --grep "owner-derived ACK closure|ack-complete open rows"` passed.
- `npx tap test/control-plane/membership-publication-coordinator.test.js`
  passed: `244/244`.
- `npx tap test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`
  passed: `225/225`.
- Static guardrails passed for touched publication, recovery, membership ACK,
  node-state publication, and topology diagnostics files:
  `git diff --check`, `node scripts/check-guideline-literals.js`,
  `node scripts/check-guideline-decision-boundaries.js`, and
  `npm run audit:runtime-grammar:file`.
- Representative command:
  `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose`
  failed after `132.5s`, but publication ACK convergence is no longer the
  blocker.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain publication_ack_convergence`
  passed with `state: satisfied`, `publicationStatus: PUBLISHED`,
  `pendingAckCount: 0`, `pendingAckNodeIds: []`, `missingPublishedCount: 0`,
  and reason `publication_published`.
- `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json`
  reports first frontier `priority_recovery_partition_progress`, owner
  `operation_workflow_owner`, boundary `rebalancer_handoff`, dominant reason
  `priority_recovery_progress_blocked`.
- Current migration state: representative migrated to a new owner-boundary;
  it is not green and it is not a same-boundary publication ACK residual.

## Validation

1. `npm run work:validate`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --explain publication_ack_convergence`
3. Focused publication owner/recovery tests selected by
   `topology_publication_owner`.
4. Touched-file literal, decision-boundary, and runtime-grammar guardrails.
5. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-spec-led-runtime-modularization-publication-convergence.report.json --fast-local --verbose`

## Commit And Push Ledger

1. Focused package commit: `050da7e0`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes

## Done When

1. Publication convergence has one owner-bound decision path.
2. Focused publication owner and diagnostics tests pass.
3. Static guardrails pass for touched production files.
4. Representative rolling-restart is green or this active package records the
   same owner-boundary residual or migrated owner-boundary residual with
   canonical evidence.
