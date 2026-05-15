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

## Local Divergence

Current representative evidence can show publication ACK completion while active
projection remains incomplete.

Latest current handoff state:

- `publicationStatus=PUBLISHED`
- `pendingAckCount=0`
- `active=0/5`
- `publishedActive` remains incomplete through publication diagnostics
- `missingPublishedCount=4`
- `snapshotCoverageNodeCount=2`
- `expectedNodeCount=5`
- first frontier is now `publication_ack_convergence`
- owner boundary is now `topology_publication_owner / publication_convergence`
- priority recovery remains a non-frontier tail

## Target Invariant

Active-gate readiness is derived from one owner-truth snapshot and one bounded
projection contract.

A gate may pass only when durable publication truth, active node projection,
snapshot coverage, and expected node cohort are from compatible epochs or the
owner emits a narrower canonical blocker.

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
  `work/packages/active-20260514-topology-publication-convergence-final-blocker.md`
- Artifact:
  `test-output/reports/topology-ship-gate-final-rolling-restart.report.json`
- Current package-local owner boundary:
  `topology_publication_owner / publication_convergence`
- Representative owner boundary:
  `topology_publication_owner / publication_convergence`
- Extractor summary:
  `publication_ack_convergence` is the first frontier with dominant reason
  `missing_published_nodes_present`. Current evidence has
  `publicationStatus=PUBLISHED`, `pendingAckCount=0`, `missingPublishedCount=4`,
  `snapshotCoverageNodeCount=2`, and `expectedNodeCount=5`.
- Priority recovery residuals:
  two `operation_workflow_owner / workflow_progress` witnesses remain in the
  tail, but canonical evidence keeps them subordinate to publication
  convergence.

## Codebase Analysis Notes

The implementation is broader than the initial file list. Publication
convergence spans the runtime publication owner, the staged membership
publication coordinator modules, active-node projection, admin control-snapshot
projection, and distributed harness evidence replay.

Diagnostics are also part of the track surface. The current artifact is
classified through topology convergence graph, causal model, failure-bundle, and
publication-evidence replay code rather than by the runtime owner alone.

## Sprint Membership

| Sprint | Sprint kind | Status | Notes |
| --- | --- | --- | --- |
| `work/sprints/active-2026-q2-topology-convergence-residual-closure.md` | `bugfix` / `stabilization` | active | Current package is `topology_publication_owner / publication_convergence`. |

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

Continue with the current active package. Do not open a second active package on
this boundary while the active package remains unresolved.

## Exit Condition

This track can close when the representative release gate is green, or when all
remaining topology residuals are explicitly migrated to narrower tracks with
canonical owner-boundary evidence.

## Next Package

Current package:

```text
work/packages/active-20260514-topology-publication-convergence-final-blocker.md
```
