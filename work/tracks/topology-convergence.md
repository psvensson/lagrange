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
convergence, operation progress, and active-gate snapshot coverage. The stopped
residual-closure sprint proved that local single-owner patches reduce symptoms
without reducing the boundary. The systems-pattern hardening sprint turned
successful distributed-systems patterns into local owner contracts, and the
completion closure proved the live TiKV witness path, broad Cockroach admin tail
proof, and stale active-reference validation before the paused topology sprint
resumes. The next topology pass is a theory ladder: each sprint registers a
theory, runs the smallest discriminator, records the result, and creates a
successor from the observed evidence rather than opening another broad bugfix
loop.

Latest current handoff state:

- route-selection package:
  `work/packages/done-20260525-topology-load-stabilization-route-selection.md`
- active sprint:
  `work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md`
- active package:
  `work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`
- rolling-restart artifact:
  `test-output/reports/rolling-restart-rerun-4.report.json`
- first frontier: `priority_recovery_partition_progress`
- owner boundary: `operation_workflow_owner / workflow_progress`
- dominant reason: `priority_recovery_event_driven_wait`
- causal outcome: `accept_classified_backpressure`
- priority recovery residuals split across six witnesses:
  four under `operation_workflow_owner / rebalancer_handoff` and two under
  `operation_workflow_owner / workflow_progress`
- heavy-load artifact:
  `test-output/reports/topology-load-baseline.report.json`
- heavy-load route: no topology frontier; causal taxonomy migrates the deferred
  load-readiness concern to
  `startup_readiness_owner / startup_support_evidence` with selected snapshot
  timeout evidence
- prior load-readiness support artifact:
  `test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
  still shows `startup_active_gate_owner / snapshot_coverage` as the producer
  prerequisite for readiness support

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

- Current route-selection package:
  `work/packages/done-20260525-topology-load-stabilization-route-selection.md`
- Active residual sprint:
  `work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md`
- Active residual package:
  `work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`
- Selected immediate successor route:
  `operation_workflow_owner / workflow_progress` from
  `test-output/reports/rolling-restart-rerun-4.report.json`.
- Required successor discriminator:
  `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-rerun-4.report.json --markdown`.
- Residual split:
  six witnesses, with four `rebalancer_handoff` witnesses and two
  `workflow_progress` witnesses, all in `recovering_in_flight` state.
- Deferred load route:
  `startup_readiness_owner / startup_support_evidence` from
  `test-output/reports/topology-load-baseline.report.json`, held until
  operation-workflow backpressure clears or a fresh rerun promotes startup
  readiness to first frontier.
- Historical support:
  `test-output/reports/rolling-restart-load-readiness-force-repair-20260522T183247Z.report.json`
  preserves the active-gate snapshot coverage prerequisite for startup
  readiness support.

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
| `work/sprints/done-2026-q2-topology-rolling-restart-green-gate-closure.md` | `stabilization` / `green-gate` | done/superseded | Closed on 2026-05-20 when the repeated rolling-restart symptom selected operation_progress architecture reset instead of another local symptom patch. |
| `work/sprints/done-2026-q2-operation-progress-resource-and-deterministic-gates.md` | `architecture` / `green-gate` | done | Owns operation_progress as the single lifecycle resource with invariant, deterministic simulator, and multi-scenario gate proof. |
| `work/sprints/done-2026-q2-topology-convergence-systems-pattern-hardening.md` | `stabilization` / `systems-pattern-hardening` | done | Added handoff hygiene, publication-convergence causal selection, deterministic replay, active-gate catch-up fencing, topology operator witnesses, critical control-plane convergence, and owner-boundary file-size reduction contracts. |
| `work/sprints/done-2026-q2-topology-systems-pattern-completion-closure.md` | `stabilization` / `systems-pattern-completion` | done | Closed the live TiKV operator witness summary path, broad Cockroach admin tail proof, and stale active-reference tracker guard before the paused topology sprint resumes. |
| `work/sprints/done-2026-q2-topology-convergence-theory-ladder.md` | `experiment` / `theory-ladder` | done | Starts from one fresh rolling-restart baseline probe, then creates successor theory sprints from observed evidence. |
| `work/sprints/superseded-2026-q2-topology-publication-reconcile-system-theory.md` | `experiment` / `theory-ladder` | superseded | Superseded on May 23, 2026. |
| `work/sprints/superseded-2026-q2-workflow-steering-core-logic-hardening.md` | `stabilization` / `ceremony-hardening` | superseded | Superseded on May 23, 2026. |
| `work/sprints/done-2026-q2-rolling-restart-stability-hardening-final.md` | `stabilization` / `rolling-restart` | done | Focused push to make the system stable under 5-node rolling restarts. |
| `work/sprints/active-2026-q2-topology-operation-workflow-residual-closure.md` | `stabilization` / `scenario-release-gate` | active | Orders the `rebalancer_handoff` residual split, `workflow_progress` successor, and representative rerun before startup readiness can be promoted. |


## Owner Boundaries

- `startup_active_gate_owner / snapshot_coverage_budget`
- `startup_active_gate_owner / snapshot_coverage`
- `topology_publication_owner / publication_convergence`
- `topology_publication_owner / publication_truth_projection_gate`
- `topology_publication_owner / remote_handoff_ack_closure_gate`
- `topology_publication_owner / publication_projection_cohort`
- `startup_readiness_owner / startup_support_evidence`
- `diagnostics_owner / causal_analysis_framework`
- `operation_workflow_owner / workflow_progress`
- `operation_workflow_owner / rebalancer_handoff`

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

When the rolling-restart gate is resumed, run one baseline probe as an
experiment and route the artifact through canonical extractors before any new
runtime owner-boundary slice starts.

## Exit Condition

This track can close when the representative release gate is green, or when all
remaining topology residuals are explicitly migrated to narrower tracks with
canonical owner-boundary evidence.

## Next Package

Active continuation:
`work/packages/done-20260525-priority-recovery-operation-workflow-rebalancer-handoff-residual-split.md`.
It proves or splits the four
`operation_workflow_owner / rebalancer_handoff` witnesses before the queued
`operation_workflow_owner / workflow_progress` successor can activate. Do not
promote `startup_readiness_owner / startup_support_evidence` until
operation-workflow backpressure clears or fresh canonical route evidence makes
startup readiness the first frontier.
