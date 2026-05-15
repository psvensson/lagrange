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

Current representative evidence oscillates between publication convergence and
active-gate snapshot coverage. The active sprint now treats that as one
producer-consumer handoff problem rather than independent single-owner
residuals.

Latest current handoff state:

- artifact:
  `test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`
- first frontier: `publication_ack_convergence`
- owner boundary: `topology_publication_owner / publication_convergence`
- dominant reason: `publication_pending`
- downstream active-gate snapshot coverage remains blocked with
  `snapshotCoverage=0/5` and forced authoritative snapshot repair error
- priority recovery remains classified as satisfied and subordinate

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

- Active sprint:
  `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Active package:
  `work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md`
- Artifact:
  `test-output/reports/rolling-restart-after-forced-snapshot-refresh-debt-fallback-20260515-codex.report.json`
- Current package-local owner boundary:
  `topology_publication_owner / publication_convergence`
- Representative owner boundary:
  `topology_publication_owner / publication_convergence`
- Extractor summary:
  `publication_ack_convergence` is the first frontier with dominant reason
  `publication_pending`. Downstream active-gate snapshot coverage remains
  blocked at `0/5`; the active package must build a replayable
  publication-to-active-gate missing-edge probe before runtime file promotion.
- Priority recovery residuals:
  classified as satisfied and subordinate to the publication-to-active-gate
  handoff residual.

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
| `work/sprints/active-2026-q2-topology-convergence-residual-closure.md` | `bugfix` / `stabilization` | active | Current package is the publication-to-active-gate handoff oscillation; publication and active-gate evidence are treated as one causal handoff. |

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

Continue with the current active handoff package. Do not open a second active
package on topology convergence while the publication-to-active-gate probe
remains unresolved.

## Exit Condition

This track can close when the representative release gate is green, or when all
remaining topology residuals are explicitly migrated to narrower tracks with
canonical owner-boundary evidence.

## Next Package

Current package:

```text
work/packages/active-20260515-topology-publication-active-gate-handoff-oscillation.md
```
