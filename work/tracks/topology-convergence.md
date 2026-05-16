# Track: Topology Convergence

## Document Role

This track owns the long-lived concern for control-plane truth, publication
projection, active-gate readiness, and bounded topology convergence.

It can contain development, bugfix, stabilization, maintenance, and release-gate
sprints.

It does not supersede the current active sprint or active package.

## Track Type

`runtime-invariant`

## Release Consumers

- `work/releases/0.1-stabilization.md`

## Proven Pattern

Mature distributed systems separate durable metadata authority from projections
and require explicit generation or epoch convergence before a readiness gate
passes.

Controllers also need bounded progress contracts: attempt count, next attempt,
deadline, retry/wake path, terminal classification, and last blocking reason.

## Comparative Guidance

These systems are design references, not scope commitments. This track extracts
stable distributed-systems patterns and maps them to local owner contracts.

| System | Stable pattern | Local analogue | Constraint for this track | Not copying |
| --- | --- | --- | --- | --- |
| etcd | Learners catch up before promotion. | Restarting or joining nodes before active admission. | Active-gate success requires durable freshness and coverage evidence before a node is admitted as ready. | etcd membership or quorum model. |
| TiKV / PD | Scheduling operators carry step witnesses and are followed by heartbeat evidence. | Publication, recovery, and repair operations. | In-flight topology work exposes step, witness, timeout, and legal next action instead of timeout-only failure. | PD scheduling architecture. |
| CockroachDB | System ranges receive stronger availability expectations than ordinary data. | Control-plane partitions, publications, and active-gate cohorts. | Control-plane convergence uses stricter proof than ordinary partition convergence. | Feature parity or user-facing SQL behavior. |
| FoundationDB | Deterministic simulation and status are core correctness tools. | Boundary fixtures, causal extractors, and topology convergence reports. | Repeated full reruns must be preceded by replayable handoff fixtures or missing-edge probes. | FoundationDB architecture or simulation stack. |

These references constrain validation vocabulary and owner-boundary proof only.
Packages still require AGPL roadmap or edition scope and local evidence.

## Local Divergence

Current representative evidence has repeatedly oscillated between publication
convergence and active-gate snapshot coverage. The stopped residual-closure
sprint proved that local single-owner patches reduce symptoms without reducing
the boundary. The systems-pattern hardening sprint turned successful
distributed-systems patterns into local owner contracts, and the completion
closure proved the live TiKV witness path, broad Cockroach admin tail proof, and
stale active-reference validation before the paused topology sprint resumes.

Latest current handoff state:

- artifact:
  `test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`
- first frontier: `publication_ack_convergence`
- owner boundary: `topology_publication_owner / publication_convergence`
- dominant reason: `publication_ack_blocked` / `pending_acks_present`
- active-gate owner reconcile reduced: the representative handoff no longer
  reports `owner_reconcile_service_unavailable`, and the active-gate handoff
  contract now has `pendingReconcileCount=0`
- next action from handoff evidence is `wait_owner_recovery`; the remaining red
  evidence is publication ACK convergence with `pendingAck=1`,
  `pendingAckNodeIds=[]`, `publishedActiveNodeIds` seed-only,
  `missingPublishedCount=4`, `publicationOwnerAckState=waiting_for_ack`,
  `freshnessFence=ack_lag`, `recoveryOutcome=waiting_for_ack`,
  `streamOutcome=waiting_for_ack`, active nodes `5/5`, and snapshot coverage
  `2/5`
- causal-model outcome is `accept_classified_backpressure`, while the dominant
  failure class remains `publication_ack_blocked`; priority recovery
  backpressure is subordinate to publication ACK convergence
- priority recovery remains subordinate with two
  `operation_workflow_owner / workflow_progress` witnesses and split required
  `false`; reopen that boundary only if a later canonical residual extractor
  promotes it ahead of publication convergence
- the fresh representative artifact after systems-pattern completion closure
  reselected the same publication frontier; the continuation package is
  `work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md`

## Target Invariant

Active-gate readiness is derived from one owner-truth snapshot, one bounded
projection contract, and one producer-consumer handoff edge.

A gate may pass only when durable publication truth, active node projection,
snapshot coverage, and expected node cohort are compatible by one
publication-to-active-gate freshness, revision, or ACK edge, or the owner emits
a narrower canonical blocker.

## Gate Or Acceptance Proof

`rolling-restart` reaches:

```text
snapshotCoverage=5/5
missingPublished=0
active-gate bounded progress satisfied
```

or produces a narrower owner-boundary blocker selected by canonical evidence.

## Current Evidence

- Continuation sprint context:
  `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`
- Next continuation package:
  `work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md`
- Artifact:
  `test-output/reports/rolling-restart-post-systems-pattern-checkpoint-20260516.report.json`
- Checkpoint package:
  `work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md`
- Representative owner boundary:
  `topology_publication_owner / publication_convergence`
- Extractor summary:
  The post-systems-pattern checkpoint is red. `work:evidence-summary` and
  `causal-model` select `publication_ack_convergence` with owner
  `topology_publication_owner / publication_convergence`; active-gate handoff
  `pendingReconcileCount=0` and next action `wait_owner_recovery` mean the
  drained owner-reconcile path should not be treated as the active blocker.
  All five nodes reached `ACTIVE`, but the active gate timed out at
  `snapshotCoverage=2/5`. The producer is waiting for ACK with
  `pendingAck=1`, `pendingAckNodeIds=[]`, seed-only `publishedActiveNodeIds`,
  `missingPublishedCount=4`, `publicationOwnerAckState=waiting_for_ack`,
  `freshnessFence=ack_lag`, `recoveryOutcome=waiting_for_ack`, and
  `streamOutcome=waiting_for_ack`. The successor should use the fresh
  checkpoint artifact rather than the stale pre-detour artifact.
- Priority recovery residuals:
  the completed TiKV/PD topology-operator witness live path added the proof
  surface, and the fresh artifact reports two workflow-progress witnesses.
  `analyze:priority-recovery-residuals` reports split required `false`.
  Keep this evidence subordinate unless fresh canonical extraction promotes it
  ahead of `publication_ack_convergence`.

## Codebase Analysis Notes

The implementation is broader than the initial file list. The current handoff
spans the runtime publication owner, the staged membership publication
coordinator modules, active-gate snapshot coverage, control-plane/admin
snapshot projection, and distributed harness evidence replay.

Diagnostics are also part of the track surface. The current artifact is
classified through topology convergence graph, causal model, failure-bundle, and
publication-evidence replay code rather than by the runtime owner alone.

## Sprint Membership

| Sprint | Sprint kind | Status | Notes |
| --- | --- | --- | --- |
| `work/sprints/done-2026-q2-topology-convergence-residual-closure.md` | `bugfix` / `stabilization` | stopped | Stopped on 2026-05-15 by human direction. Retained as residual context only. |
| `work/sprints/done-2026-q2-topology-convergence-complexity-reduction.md` | `stabilization` / `complexity-reduction` | done reduced | Canonical publication-to-active-gate handoff contract implemented end to end; representative run remains red at startup active-gate snapshot coverage. |
| `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md` | `stabilization` / `green-gate` | active resumed | Resumed after systems-pattern closure to run the post-detour rolling-restart checkpoint. |
| `work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md` | `stabilization` / `systems-pattern-hardening` | done | Added handoff hygiene, publication-convergence causal selection, deterministic replay, active-gate catch-up fencing, topology operator witnesses, critical control-plane convergence, and owner-boundary file-size reduction contracts. |
| `work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md` | `stabilization` / `systems-pattern-completion` | done | Closed the live TiKV operator witness summary path, broad Cockroach admin tail proof, and stale active-reference tracker guard before the paused topology sprint resumes. |

## Owner Boundaries

- `startup_active_gate_owner / snapshot_coverage_budget`
- `startup_active_gate_owner / snapshot_coverage`
- `topology_publication_owner / publication_convergence`
- `topology_publication_owner / publication_truth_projection_gate`
- `topology_publication_owner / remote_handoff_ack_closure_gate`
- `topology_publication_owner / publication_projection_cohort`
- `startup_readiness_owner / startup_support_evidence`
- `diagnostics_owner / causal_analysis_framework`
- `operation_workflow_owner / workflow_progress` as subordinate evidence only
  when canonical extractors keep it off the first frontier.

## Likely Files

These are context candidates, not write authorization:

- `src/diagnostics/budget-timeout-accounting.js`
- `src/bootstrap/bootstrap-api-runtime-methods.js`
- `src/bootstrap/bootstrap-service-runtime-methods.js`
- `src/control-plane/owners/membership-publication-runtime-owner.js`
- `src/control-plane/membership-publication-coordinator.js`
- `src/control-plane/membership-publication-coordinator-class-stage-1.js`
- `src/control-plane/membership-publication-coordinator-class-stage-2.js`
- `src/control-plane/membership-publication-coordinator-class-stage-3.js`
- `src/control-plane/membership-publication-coordinator-stage-1.js`
- `src/control-plane/membership-publication-coordinator-stage-2.js`
- `src/control-plane/membership-publication-coordinator-stage-3.js`
- `src/control-plane/membership-publication-coordinator-stage-4.js`
- `src/control-plane/membership-publication-planning.js`
- `src/control-plane/active-node-projection.js`
- `src/admin/admin-control-snapshot-class-part-1.js`
- `src/admin/admin-control-snapshot-class-part-2.js`
- `src/admin/admin-control-snapshot-class-part-3.js`
- `src/admin/admin-control-snapshot-class-part-4.js`
- `src/admin/admin-control-snapshot-class-part-5.js`
- `src/admin/admin-control-snapshot-class-part-6.js`
- `src/admin/admin-control-snapshot-class-part-7.js`
- `src/admin/admin-control-snapshot-local-diagnostics-methods.js`
- `src/admin/admin-control-snapshot-readiness-diagnostics-methods.js`
- `src/diagnostics/topology-convergence-graph.js`
- `src/diagnostics/causal-analysis-schema.js`
- `test/distributed/harness/publication-evidence-contract.js`
- `test/distributed/harness/publication-evidence-replay.js`
- `test/distributed/harness/active-gate-contract.js`
- `test/distributed/harness/priority-recovery-summary-normalization.js`
- `test/diagnostics/budget-timeout-accounting.test.js`
- `test/diagnostics/topology-convergence-graph.test.js`
- `test/admin/admin-control-snapshot.test.js`

## Entry Condition

When the rolling-restart gate is resumed, activate
`work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md`
and regenerate current-blocker before runtime implementation. Runtime edits are
not in scope until the fresh checkpoint selects an owner boundary.

## Exit Condition

This track can close when the representative release gate is green, or when all
remaining topology residuals are explicitly migrated to narrower tracks with
canonical owner-boundary evidence.

## Next Package

Next continuation package:

```text
work/packages/done-20260516-rolling-restart-post-systems-pattern-checkpoint.md
```
