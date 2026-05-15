# Topology Active Gate Snapshot Coverage After Publication Consumer Lag

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused active-gate work made forced snapshot repair sustained after the no-progress threshold and preserved selected snapshot owner-observation evidence in active-gate progress/topology diagnostics. Focused tests pass. Representative rerun test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json remains red but migrated the first frontier from active_gate_snapshot_coverage to publication_ack_convergence with publication_pending; active gate is now downstream/next with snapshotCoverage=0/5 and a forced-repair snapshot error from the publication/startup failure path.",
  "nextAction": "Treat this package result as migrated, not same-frontier. Start a successor focused package for topology_publication_owner / publication_convergence using test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json; do not keep editing active-gate snapshot coverage in this package unless fresh canonical evidence promotes it back to first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "node scripts/check-guideline-literals.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js",
    "node scripts/check-guideline-decision-boundaries.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js",
    "npm run audit:runtime-grammar:file -- ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js",
    "git diff --check -- work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md work/sprints/current-blocker.md work/sprints/current-blocker.json test/distributed/harness/cluster-segment-7.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-3.js test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js test/distributed/harness/__tests__/cluster.test-part-5.js src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js"
  ],
  "writeScope": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/diagnostics/topology-convergence-graph.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-final-blocker.md",
    "work/packages/done-20260514-topology-active-gate-owner-cohort-convergence.md",
    "work/packages/done-20260514-topology-active-gate-budget-closure.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-7-class-2.js",
    "test/distributed/harness/cluster-segment-6.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-3.js",
    "src/admin/admin-control-snapshot-class-part-5.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "test/distributed/harness/cluster-segment-7.js",
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/cluster-segment-3.js",
    "test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-5.js",
    "src/diagnostics/topology-convergence-graph.js",
    "test/diagnostics/topology-convergence-graph.test.js"
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
    "status": "live-red-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a successor publication-convergence package. The active-gate change exposed publication_pending as first frontier; active-gate snapshot coverage remains a downstream blocked edge with snapshotCoverage=0/5 and selected snapshot repair failure."
  },
  "causalGovernance": {
    "hypothesis": "startup_active_gate_owner / snapshot_coverage work should reduce, migrate, or classify active_gate_timed_out without reopening publication convergence when the owner stream is current and fenced by consumer_lag.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "Sustained active-gate forced repair and selected snapshot observation projection removed the stale/deferred-snapshot ambiguity, but the representative rerun now fails first at topology_publication_owner / publication_convergence with publication_pending. Active-gate remains blocked downstream by a forced-repair snapshot error and 0/5 coverage.",
    "crossBoundaryReview": "Review and fix subagent proof are supplied by the parent workflow for this repair pass. Leave final implementation subagent proof pending until the parent records real agent names and ids after all roles complete."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / startup_active_gate_owner / snapshot_coverage after publication consumer-lag classification",
    "phaseChain": [
      "publication consumer-lag classification",
      "active-gate snapshot coverage extraction",
      "startup active-gate owner analysis",
      "representative rerun classification"
    ],
    "currentFirstFrontier": "representative rerun first frontier moved to publication_ack_convergence under topology_publication_owner / publication_convergence with publication_pending",
    "knownDownstreamBlockers": [
      "active_gate_snapshot_coverage remains blocked downstream with activeGate=timed_out, snapshotCoverage=0/5, and selected snapshot forced-repair error",
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted in the representative rerun"
    ],
    "missingCausalEdge": "publication convergence did not publish/ack a usable owner stream before active-gate forced repair selected the snapshot source.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence",
    "boundedProgressProof": "Focused active-gate proof shows sustained bounded retry/advance behavior through forced repair after the wait threshold and richer selected snapshot owner-observation diagnostics. Representative proof migrated to publication_pending rather than resolving green.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "expectedObservableTransition": "active_gate_timed_out resolves to green evidence, reduced residual, same-frontier proof, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one focused active-gate package slice with canonical extractors, owner-file proof, focused validation, and representative result classification",
    "sameFrontierFallback": "keep startup_active_gate_owner / snapshot_coverage active and do not absorb publication convergence, operation workflow, or generic harness timeout changes without canonical promotion.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "The active-gate package changed the wait loop from one-shot forced repair to sustained bounded retry after the no-progress threshold and preserved selected snapshot owner-observation evidence. The representative rerun no longer shows stale/deferred selected-snapshot evidence as first frontier; canonical evidence now stops earlier at publication_ack_convergence / publication_pending.",
    "evidence": [
      "node test/distributed/harness/__tests__/cluster.test-part-5.js",
      "node test/distributed/harness/__tests__/cluster.test-part-6.js",
      "node --test test/diagnostics/topology-convergence-graph.test.js",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --fast-local --verbose",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence"
    ]
  }
}
-->

## Why

The publication-convergence package now classifies the current representative
artifact as producer-side publication satisfied: the publication owner stream
is current and acknowledged, and the remaining missing-published signal is
fenced as consumer lag. The first actionable frontier is therefore active-gate
snapshot coverage.

This package owns the next blocker: active gate timed out with
`inactive_nodes=3` and `snapshotCoverage=2/5`.

## Scope Basis

AGPL topology convergence release-gate closure. Ship criteria still require
`active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the canonical first frontier is one owner
  boundary, `startup_active_gate_owner / snapshot_coverage`.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Maintain package, sprint, current-blocker, and model-ledger handoff.
2. Analyze active-gate snapshot coverage from canonical extractors before raw
   logs.
3. Promote focused runtime and diagnostic projection files only after
   owner-file proof and package scope update.

## Out Of Scope

1. Reopening `topology_publication_owner / publication_convergence` without
   fresh canonical evidence.
2. Operation workflow runtime fixes.
3. Generic harness timeout stretching.
4. Pro or Enterprise behavior.

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary
package.

- [x] Review subagent recorded:
      Agent Nietzsche (019e2a5b-e9d5-7273-a6f2-dae250b9711b) reviewed work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Archimedes (019e2a5f-8cac-7373-9cc8-7b4049b8ae71) fixed work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md
- [x] Implementation subagent recorded:
      Agent Copernicus (019e2a63-33b5-7093-9935-6d5d7fd03e67) implemented work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`, `test/distributed/harness/cluster-segment-7.js`, `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/cluster-segment-3.js`, `test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js`, `test/distributed/harness/__tests__/cluster.test-part-5.js`, `src/diagnostics/topology-convergence-graph.js`, `test/diagnostics/topology-convergence-graph.test.js`
- Forbidden files: `src/admin/`, operation workflow runtime, publication owner runtime, scenario timeout defaults
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated; do not reopen publication convergence or stretch generic timeouts.
- Escalation triggers: owned files expand beyond active-gate wait cadence, active-gate progress evidence, or topology explain projection; runtime ownership changes; representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json`, `npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage`, `node test/distributed/harness/__tests__/cluster.test-part-5.js`, `node test/distributed/harness/__tests__/cluster.test-part-6.js`, `node --test test/diagnostics/topology-convergence-graph.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --fast-local --verbose`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain active_gate_snapshot_coverage`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json`, `node scripts/check-guideline-literals.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js`, `node scripts/check-guideline-decision-boundaries.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js`, `npm run audit:runtime-grammar:file -- ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js`, `git diff --check -- work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md work/sprints/current-blocker.md work/sprints/current-blocker.json test/distributed/harness/cluster-segment-7.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-3.js test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js test/distributed/harness/__tests__/cluster.test-part-5.js src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
2. npm run analyze:topology-convergence -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
3. npm --silent run analyze:causal-model -- test-output/reports/topology-publication-convergence-final-blocker-after-authoritative-refresh-repair.report.json
4. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage
5. node test/distributed/harness/__tests__/cluster.test-part-5.js
6. node test/distributed/harness/__tests__/cluster.test-part-6.js
7. node --test test/diagnostics/topology-convergence-graph.test.js
8. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --fast-local --verbose - failed as migrated evidence: first frontier `publication_ack_convergence` / `publication_pending`; active gate downstream with `snapshotCoverage=0/5` and selected snapshot forced-repair error.
9. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
10. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence
11. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain active_gate_snapshot_coverage
12. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
13. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
14. node scripts/check-guideline-literals.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js
15. node scripts/check-guideline-decision-boundaries.js ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js
16. npm run audit:runtime-grammar:file -- ./test/distributed/harness/cluster-segment-7.js ./test/distributed/harness/cluster-segment-2.js ./test/distributed/harness/cluster-segment-3.js src/diagnostics/topology-convergence-graph.js
17. git diff --check -- work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md work/sprints/current-blocker.md work/sprints/current-blocker.json test/distributed/harness/cluster-segment-7.js test/distributed/harness/cluster-segment-2.js test/distributed/harness/cluster-segment-3.js test/distributed/harness/__tests__/cluster-part-6-core-01-test-cases.js test/distributed/harness/__tests__/cluster.test-part-5.js src/diagnostics/topology-convergence-graph.js test/diagnostics/topology-convergence-graph.test.js

## Commit And Push Ledger

1. Focused package commit: `303bc562144929f42bcfab06c7cd7add176d8aae`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
