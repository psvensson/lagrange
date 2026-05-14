# Topology Stale Publication Durable Truth Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "write-ack-visibility",
  "artifact": "test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_truth_projection_gate",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Observed gate result: write-ack-visibility failed after 125041ms with an Admin API timeout while canonical topology evidence identified topology_publication_owner / publication_convergence as the first frontier. pendingAckCount=0, publicationStatus=PUBLISHED, missingPublishedCount=2, publicationPending=true, activeGateState=ready, snapshotCoverageNodeCount=2/3, and priority recovery residual witnesses=0.",
  "nextAction": "Close this package as classification-only observability and activate the next remaining failure-gate package; do not fix rolling-restart runtime behavior in this package without explicit re-scope.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-stale-publication-durable-truth-gate.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md",
    "work/packages/done-20260514-topology-missed-handoff-ack-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/admin/admin-control-snapshot.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
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
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_truth_projection_gate proof should reduce, migrate, or classify stale_publication_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "expectedCausalModelChange": "stale_publication_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "classification-only",
    "causalDebt": "The stale-publication gate artifact is red and confirms publication truth/projection debt: pendingAckCount=0 with PUBLISHED status still leaves missingPublishedCount=2 and publicationPending=true. This package records the release-gate observation only; runtime rolling-restart fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "write-ack-visibility / topology_publication_owner / publication_truth_projection_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_publication_owner / publication_truth_projection_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local topology_publication_owner / publication_truth_projection_gate classified through canonical topology_publication_owner / publication_convergence with missing_published_nodes_present in test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_publication_owner / publication_truth_projection_gate causal edge for stale_publication_release_gate_unproven",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-stale-publication-durable-truth-gate.report.json --verbose",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_publication_owner / publication_truth_projection_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-stale-publication-durable-truth-gate.report.json",
    "expectedObservableTransition": "stale_publication_release_gate_unproven is now a red classification artifact: durable publication status is PUBLISHED with pendingAckCount=0, but missingPublishedCount=2 and publicationPending=true remain visible.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_publication_owner / publication_truth_projection_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "next remaining failure-gate package unless a narrower canonical blocker is explicitly activated",
    "resultClassification": "classification-only",
    "stopCondition": "classification-only-stop"
  },
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260514-topology-killed-join-gate.md"
}
-->

## Why

The failure-gate matrix names stale publication with durable truth ahead, but no
release artifact proves that durable acknowledged truth outranks stale cache
projection. The representative rolling-restart failure already shows the shape
of this risk: publication status appears complete while active projection is
missing nodes.

This package owns the stale publication release gate for
`topology_publication_owner / publication_truth_projection_gate`.

## Scope Basis

AGPL topology convergence item: cache publication must not be equivalent to
durable convergence. Publication projection must reconcile against owner truth
or emit a degraded reason.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named scenario gate with
  bounded publication evidence/admin snapshot candidate files.
- Escalation trigger to a heavier lane: stale projection requires changing
  membership epoch, active-gate cohort semantics, or durable storage/ACK
  contracts beyond publication truth projection.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Execute `write-ack-visibility` as the stale-publication durable truth gate.
2. Verify durable acknowledged writes/publications outrank cache projection.
3. Verify stale projection schedules reconciliation with exact owner key rather
   than local fallback repair.
4. Verify admin/control snapshots expose durable truth, projection freshness,
   and degraded reason distinctly.
5. Record artifact and split target if durable truth or projection freshness is
   not observable.

## Out Of Scope

1. cache-publication-as-authority
2. local-hot-path-repair
3. Missed ACK retry behavior unless the stale publication gate proves ACK state
   is the blocker.
4. Active-gate cohort fixes beyond consuming publication truth correctly.

## Entry Evidence

1. The gate matrix requires stale publication coverage.
2. Publication focused proof exists but stale durable truth is not release
   proven.
3. Rolling-restart evidence suggests publication status and durable active
   projection can disagree.

## Owner Contract To Prove

`topology_publication_owner` must expose publication truth in layers:

1. Durable acknowledged owner truth.
2. Cache/projection version and freshness.
3. Reconcile intent when projection lags durable truth.
4. Exact affected nodes, partitions, or message groups.
5. Bounded retry state for projection repair.
6. Terminal degraded reason when projection cannot catch up.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-recovery-evidence.js`, `src/admin/admin-control-snapshot-class-part-3.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/admin/admin-control-snapshot.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-stale-publication-durable-truth-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-stale-publication-durable-truth-gate-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-stale-publication-durable-truth-gate-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-stale-publication-durable-truth-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `cache-publication-as-authority`, `local-hot-path-repair`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-stale-publication-durable-truth-gate.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-stale-publication-durable-truth-gate.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
3. node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-stale-publication-durable-truth-gate.report.json --verbose
4. npm run work:evidence-summary -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/topology-stale-publication-durable-truth-gate.report.json
6. npm run analyze:topology-convergence -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json
7. npm --silent run analyze:causal-model -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json
8. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-stale-publication-durable-truth-gate.report.json --markdown
9. node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js test/control-plane/publication-recovery-evidence.test.js test/admin/admin-control-snapshot.test.js
10. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js test/control-plane/publication-recovery-evidence.test.js test/admin/admin-control-snapshot.test.js
11. npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-evidence.js src/admin/admin-control-snapshot-class-part-3.js test/control-plane/publication-recovery-evidence.test.js test/admin/admin-control-snapshot.test.js
12. npm run work:validate -- --entry work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
13. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
14. npm run work:validate -- --closure work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md
15. git diff --check -- work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
16. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If durable truth is correct but admin projection is stale, split to
   publication projection reconciliation.
2. If ACK visibility is the source of stale truth, activate the missed handoff
   ACK gate.
3. If active-gate consumes stale cache despite correct publication evidence,
   split to active-gate owner cohort.
4. If topology epoch is needed to fence stale publication, split an epoch
   contract package.

## Acceptance Criteria

1. Gate artifact proves durable publication truth outranks stale projection.
2. Publication evidence/admin snapshots distinguish durable state from cache
   projection.
3. Stale projection creates exact owner-key reconcile work, not local fallback
   repair.

## Observed Gate Result

`write-ack-visibility` failed after `125041ms` with an Admin API query timeout.
Canonical evidence again showed publication status ahead of complete active
projection: `publicationStatus=PUBLISHED`, `pendingAckCount=0`,
`missingPublishedCount=2`, `publicationPending=true`, and
`publishedActiveNodeIds=1`.

The topology convergence extractor selected
`topology_publication_owner / publication_convergence` with
`missing_published_nodes_present` as the first frontier. Active gate evidence
was `ready` with snapshot coverage `2/3`; priority recovery residual extraction
reported `Witnesses: 0` and `Split required: false`.

This is classification-only release-gate observability. It does not prove the
stale publication gate green, and it deliberately does not change
`rolling-restart` runtime behavior.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 5e33ccd45cb82b787475bc0fd6b354bf28fd4d5d.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
