# Topology Active Gate Owner Cohort Convergence

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Latest representative active gate is stalled with snapshotCoverage=2/5 expectedNodeCount=5 publicationStatus=PUBLISHED pendingAckCount=0 publishedActive=1/5 and missingPublished=4.",
  "nextAction": "Complete active-gate owner-truth convergence so expected nodes ready leased nodes published active nodes missing nodes pending repairs and topology epoch produce active=5/5 snapshotCoverage=5/5 missingPublished=0 or a narrower canonical blocker.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-active-gate-snapshot-coverage-after-workflow-progress.md",
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js",
    "src/control-plane/active-node-projection.js",
    "src/bootstrap/bootstrap-api.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "snapshot_coverage_incomplete",
    "nextAction": "Complete active-gate owner-truth cohort convergence now that active-gate budget accounting is terminally classified."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage proof should reduce, migrate, or classify snapshot_coverage_incomplete without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedCausalModelChange": "snapshot_coverage_incomplete becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "The active-gate owner cohort snapshot now exposes the missing published cohort explicitly. The sprint representative rolling-restart residual stays open and moves to topology_publication_owner / publication_projection_cohort for publication projection repair.",
    "crossBoundaryReview": "Required before closure through the runtime-owner-boundary subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage",
    "phaseChain": [
      "canonical evidence extraction",
      "startup_active_gate_owner / snapshot_coverage focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier startup_active_gate_owner / snapshot_coverage; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven startup_active_gate_owner / snapshot_coverage causal edge for snapshot_coverage_incomplete",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for startup_active_gate_owner / snapshot_coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json",
    "expectedObservableTransition": "snapshot_coverage_incomplete resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "topology_publication_owner / publication_projection_cohort",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_projection_cohort",
    "reason": "The active-gate owner snapshot now exposes expected, ready-leased, published, missing, pending, epoch, and budget dimensions. Focused proof shows PUBLISHED status still coexists with missing published active nodes, so the remaining canonical blocker is publication projection.",
    "evidence": [
      "node --test test/admin/admin-control-snapshot.test.js",
      "baseline HEAD export produced the same 8 unrelated priority-recovery admin snapshot failures",
      "test/distributed/harness/cluster-segment-7-class-5.js still computes snapshot coverage from observed top-level snapshot nodes, so this package is classification evidence rather than representative green proof"
    ]
  },
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260514-topology-publication-projection-reconciliation.md"
}
-->

## Why

The current representative failure has active-gate snapshot coverage at `2/5`
while the expected cohort is `5`, publication is reported as `PUBLISHED`,
pending ACK count is `0`, published active nodes are `1/5`, and four nodes are
missing from the published active set. That means active-gate convergence is not
being derived from a coherent owner-truth cohort.

This package owns the `startup_active_gate_owner / snapshot_coverage` boundary.
It must make active admission depend on canonical owner state: expected nodes,
ready leased nodes, published active nodes, missing nodes, pending owner work,
topology epoch, and typed degraded reason.

## Scope Basis

AGPL topology convergence item: make active-gate convergence owner-truth based.
Prior focused packages added active-gate snapshot coverage and publication
owner truth, but representative rolling-restart still proves the composed
system does not converge.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the first frontier is a single active-gate owner
  boundary with known candidate files and focused extractor coverage.
- Escalation trigger to a heavier lane: cohort truth requires changing
  membership epoch, publication owner authority, repair intent consumption, or
  distributed harness semantics.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Reconstruct the active-gate decision snapshot from canonical extractor
   output and candidate owner files.
2. Ensure the active gate compares the same cohort dimensions in one normalized
   snapshot: expected nodes, readiness leases, published active projection,
   missing published nodes, pending repairs, and topology epoch.
3. Prevent cache publication status from satisfying durable active convergence.
4. Add or adjust focused tests around admin active snapshot/projection if the
   owner snapshot currently omits a needed field.
5. Record the exact post-fix expected convergence condition in the active
   sprint and this package.

## Out Of Scope

1. priority-recovery-runtime-changes-without-frontier-evidence
2. harness-timeout-increases
3. Publication owner projection repair except where an active-gate snapshot must
   stop treating publication cache status as durable truth.
4. Failure-gate execution; this package only closes the rolling-restart active
   cohort frontier.

## Entry Evidence

1. `snapshotCoverageNodeCount=2`.
2. `expectedNodeCount=5`.
3. `publicationStatus=PUBLISHED`.
4. `pendingAckCount=0`.
5. `publishedActive=1/5`.
6. `missingPublishedCount=4`.

## Owner Contract To Prove

`startup_active_gate_owner` may mark active convergence only when the durable
owner cohort is complete or when it emits a precise degraded reason. The owner
snapshot must be the authority and must include:

1. Expected membership cohort and topology epoch.
2. Ready leased nodes with lease freshness.
3. Published active nodes derived from publication owner truth.
4. Missing nodes and exact reason per node.
5. Pending repair/reconcile work that can still affect active coverage.
6. Bounded budget state from the active-gate budget package.

## Activation Contract

Required before implementation continues in this active package:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `src/admin/admin-control-snapshot-class-part-5.js`, `src/control-plane/active-node-projection.js`, `src/bootstrap/bootstrap-api.js`, `test/admin/admin-control-snapshot.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a runtime owner-boundary
package.

1. [x] Review subagent recorded: Agent Codex (019e2672-0488-71c3-b2b5-6244c3b5515e) reviewed work/packages/done-20260514-topology-active-gate-budget-closure.md; result fixes-required.
2. [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e2675-a55f-7101-94ab-4b2af3bdb06f) fixed work/packages/done-20260514-topology-active-gate-budget-closure.md.
3. [x] Implementation subagent recorded: Agent Codex (019e2684-8e3c-7281-80ba-cf7886e62ea3) implemented work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `src/admin/admin-control-snapshot-class-part-1.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `test/admin/admin-control-snapshot.test.js`
- Forbidden files: `priority-recovery-runtime-changes-without-frontier-evidence`, `harness-timeout-increases`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
3. npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-priority-recovery-workflow-progress-after-snapshot-coverage.report.json --explain active_gate_snapshot_coverage
5. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown
6. node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/active-node-projection.js src/bootstrap/bootstrap-api.js test/admin/admin-control-snapshot.test.js
7. node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/active-node-projection.js src/bootstrap/bootstrap-api.js test/admin/admin-control-snapshot.test.js
8. npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js src/admin/admin-control-snapshot-class-part-5.js src/control-plane/active-node-projection.js src/bootstrap/bootstrap-api.js test/admin/admin-control-snapshot.test.js
9. npm run work:validate -- --entry work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
10. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
11. npm run work:validate -- --closure work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md
12. git diff --check -- work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md
13. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If missing nodes are caused by stale publication projection, split or
   activate `active-20260514-topology-publication-projection-reconciliation.md`.
2. If readiness lease truth is stale or fenced by a topology epoch mismatch,
   split a membership/topology epoch package instead of expanding active-gate
   logic.
3. If coordinator-created operation residue blocks active coverage, hand off to
   `done-20260514-topology-priority-recovery-residual-drain.md`.

## Acceptance Criteria

1. Active-gate decision snapshot names expected, ready leased, published active,
   missing, pending, epoch, budget, and reason fields in one owner snapshot.
2. Focused tests prove `PUBLISHED` alone cannot satisfy active-gate convergence
   when published active coverage is incomplete.
3. Rolling-restart reaches `active=5/5`, `snapshotCoverage=5/5`, and
   `missingPublished=0`, or this package records a narrower canonical blocker
   with exact owner/boundary evidence.

## Implementation Notes

The active-gate owner cohort is now emitted as
`controlPlaneDiagnostics.activeGateOwnerCohort` from the admin control snapshot.
The snapshot is intentionally separate from `activeNodeViews` so existing exact
published/projected node-view contracts remain stable while LLMs and harness
triage get one normalized owner-cohort record.

The snapshot records schema version, state, reason code, topology epoch,
expected node IDs/count, ready lease node IDs/count, published active node
IDs/count, missing published node IDs/count, pending recovery node IDs/count,
pending reconcile node IDs/count, and a bounded `activeGateBudget` record. When
publication status is `PUBLISHED` but published active coverage is incomplete,
the snapshot reports `degraded` with
`published_active_coverage_incomplete` instead of allowing publication status
alone to imply durable active convergence.

Focused proof did not claim representative green. The distributed harness still
computes active-gate snapshot coverage from top-level observed snapshot nodes,
and the new owner-cohort diagnostic makes the remaining blocker sharper:
`topology_publication_owner / publication_projection_cohort` must reconcile why
`PUBLISHED` coexists with `publishedActive=1/5` and four missing published active
nodes.

## Validation Notes

1. `node --test test/admin/admin-control-snapshot.test.js` - new owner-cohort
   assertions passed; full file remains red with the same 8 pre-existing
   priority-recovery assertion failures as a clean `HEAD` export in
   `/tmp/something-baseline-head-585bece0`.
2. `node scripts/check-guideline-literals.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js test/admin/admin-control-snapshot.test.js` - passed.
3. `node scripts/check-guideline-decision-boundaries.js src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js test/admin/admin-control-snapshot.test.js` - passed.
4. `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js test/admin/admin-control-snapshot.test.js` - passed.
5. `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md` - passed.
6. `git diff --check -- src/admin/admin-control-snapshot-class-part-1.js src/admin/admin-control-snapshot-class-part-3.js test/admin/admin-control-snapshot.test.js work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md` - passed.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: d73e56d156b4a0d5a0bf2b82ba6559eaed6e2f7d.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
