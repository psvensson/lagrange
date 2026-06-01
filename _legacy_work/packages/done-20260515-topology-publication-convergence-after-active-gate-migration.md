# Topology Publication Convergence After Active Gate Migration

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-15",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused owner-stream repair now treats pending unpublished revision evidence as publishing / waiting_for_publication instead of no_revision / not_started. Focused owner tests and guardrails pass. The fresh representative rerun test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json remains red but publication_ack_convergence is satisfied and the first frontier migrated to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverage=2/5, repair_deferred stale_usable selected snapshot evidence, active=4/5, pendingAck=0, and missingPublished=4.",
  "nextAction": "Close this publication-convergence package as migrated and continue in work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md. Do not reopen topology_publication_owner / publication_convergence unless fresh canonical evidence promotes publication_ack_convergence back to the first frontier.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown",
    "node test/control-plane/publication-owner-stream.test.js",
    "node test/control-plane/publication-recovery-gate.test.js",
    "npx eslint src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js",
    "node scripts/check-guideline-literals.js src/control-plane/publication-owner-decision.js",
    "node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-decision.js",
    "npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-decision.js",
    "npm run guard:guideline:constant-names:file -- src/control-plane/publication-owner-decision.js",
    "npm run guard:guideline:constant-names:file -- test/control-plane/publication-owner-stream.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md",
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-owner-state.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/membership-publication-planning.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js"
  ],
  "commitScope": [
    "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md",
    "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened",
      "fresh evidence promotes publication convergence back to first frontier"
    ]
  },
  "representativeResidual": {
    "status": "live-red-migrated",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Continue with startup_active_gate_owner / snapshot_coverage from the successor package. Publication ACK convergence is satisfied in canonical evidence; active gate remains blocked with snapshotCoverage=2/5, repair_deferred stale_usable selected snapshot evidence, and active=4/5."
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / publication_convergence must classify pending unpublished revision evidence as publishing / waiting_for_publication instead of prematurely no_revision / not_started so active-gate coverage can own the next producer-consumer edge.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "expectedCausalModelChange": "publication_ack_convergence becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "Focused owner-stream proof is green and the fresh representative artifact has publication_ack_convergence satisfied with publicationStatus=PUBLISHED, pendingAck=0, and recovery steady_published. The live residual migrated to startup_active_gate_owner / snapshot_coverage: active_gate_snapshot_coverage is blocked by active_gate_timed_out, snapshot_coverage_incomplete, and snapshot_repair_deferred.",
    "crossBoundaryReview": "Review, fix, and implementation subagent proof are recorded for this causal-escalation package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / topology_publication_owner / publication_convergence after active-gate migration",
    "phaseChain": [
      "active-gate bounded retry proof",
      "publication convergence extraction",
      "publication owner-stream focused repair",
      "representative rerun classification",
      "successor active-gate snapshot coverage handoff"
    ],
    "currentFirstFrontier": "fresh representative rerun first frontier moved to active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with active_gate_timed_out, snapshotCoverage=2/5, and selected snapshot repair_deferred / stale_usable / pending / idle / wait evidence",
    "knownDownstreamBlockers": [
      "readiness_startup_support is deferred as inherited_active_gate_no_progress",
      "scenario_duration and active_gate_timeout budgets are exhausted in the fresh representative artifact",
      "workflow_step_timeout is exhausted for a non-frontier operation_workflow_owner / workflow_progress wait"
    ],
    "missingCausalEdge": "Publication owner pending unpublished evidence no longer collapses to no_revision; the next missing edge is active-gate selected snapshot repair deferred/stale usable coverage not advancing from 2/5 before active-gate timeout.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
    "boundedProgressProof": "Focused owner-stream regression proves pending unpublished revision evidence emits publishing / waiting_for_publication instead of no_revision / not_started, preserving a bounded publication advance state. Fresh representative proof migrates the first frontier to active_gate_snapshot_coverage while publication_ack_convergence and priority_recovery_partition_progress are satisfied.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
    "expectedObservableTransition": "Observed: publication_pending no longer fronts the representative artifact; publication_ack_convergence is satisfied and active_gate_snapshot_coverage is now first frontier.",
    "maxProgressBound": "one focused publication-convergence package slice with canonical extractors, owner-file proof, focused validation, representative rerun, and successor owner-boundary migration",
    "sameFrontierFallback": "not used; publication_ack_convergence is no longer the representative first frontier in the fresh artifact.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary",
    "recentFrontierHistory": [
      "work/packages/done-20260514-topology-publication-convergence-final-blocker.md / topology_publication_owner / publication_convergence / migrated",
      "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md / topology_publication_owner / publication_convergence / migrated"
    ],
    "oscillationCheck": "The frontier returned to active_gate_snapshot_coverage after publication owner-stream repair, so the successor remains causal-escalation and must not assume active-gate-only closure until the selected snapshot repair-deferred evidence is explained.",
    "handoffInvariant": "Do not reopen publication owner runtime unless fresh canonical extraction promotes publication_ack_convergence back to the first frontier."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_publication_owner",
    "fromBoundary": "publication_convergence",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage",
    "reason": "The publication owner-stream decision repair stopped treating pending unpublished evidence as no_revision/not_started. The fresh representative rerun now marks publication_ack_convergence satisfied and selects active_gate_snapshot_coverage as the first frontier with active_gate_timed_out and snapshot_repair_deferred.",
    "evidence": [
      "node test/control-plane/publication-owner-stream.test.js",
      "node test/control-plane/publication-recovery-gate.test.js",
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --verbose",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json"
    ]
  },
  "predecessor": "work/packages/done-20260515-topology-active-gate-snapshot-coverage-after-publication-consumer-lag.md",
  "closed": "2026-05-15",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md"
}
-->

## Why

The predecessor active-gate package migrated the representative residual to
publication convergence. This package repaired the narrow publication owner
stream classification bug: pending unpublished revision evidence now remains
`publishing / waiting_for_publication` instead of being collapsed to
`no_revision / not_started`.

The fresh representative run is still red, but it is a useful migration: the
publication ACK edge is now satisfied, and the first actionable frontier has
returned to active-gate snapshot coverage with better evidence.

## Scope Basis

AGPL topology convergence release-gate closure. The sprint ship criteria still
require `active=5/5`, `snapshotCoverage=5/5`, and `missingPublished=0`. This
package is bounded to the publication owner stream decision and the canonical
representative migration proof listed in the metadata.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the frontier has oscillated between
  publication convergence and active-gate snapshot coverage, and this package
  proves the producer-side publication edge before handing back to active gate.
- Escalation trigger to a heavier lane: publication convergence becomes first
  frontier again or the selected snapshot repair-deferred edge spans more than
  active-gate snapshot coverage.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md
2. work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md
3. work/sprints/active-2026-q2-topology-convergence-residual-closure.md
4. work/model-ledger.jsonl
5. src/control-plane/publication-owner-decision.js
6. test/control-plane/publication-owner-stream.test.js

## Out Of Scope

1. startup_active_gate_owner runtime changes in this package
2. operation_workflow_owner/runtime
3. scenario_timeout_defaults

## Subagent Sequencing Ledger

Required before implementation because this is a runtime owner-boundary
package.

- [x] Review subagent recorded:
      Agent Raman (019e2a69-d7c7-79e0-84a6-7c235fa43a19) reviewed work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md; result fixes-required
- [x] Fix subagent recorded or explicitly not needed:
      Agent Mencius (019e2a6c-0251-71c2-931c-78d9db26f551) fixed work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md
- [x] Implementation subagent recorded:
      Agent Codex (019e2a76-52df-78d1-8f2d-2e02e6d534b4) implemented work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Owned files: `work/packages/done-20260515-topology-publication-convergence-after-active-gate-migration.md`, `work/packages/active-20260515-topology-active-gate-snapshot-coverage-after-publication-owner-stream-fix.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-decision.js`, `test/control-plane/publication-owner-stream.test.js`
- Forbidden files: `startup_active_gate_owner/runtime`, `operation_workflow_owner/runtime`, `scenario_timeout_defaults`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/control-plane/publication-owner-stream.test.js`, `node test/control-plane/publication-recovery-gate.test.js`, `npx eslint src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js`, static owner guardrails for `src/control-plane/publication-owner-decision.js`, and representative migration proof on `test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json --explain publication_ack_convergence
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-persistent-repair-20260515-codex.report.json
4. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
5. node test/control-plane/publication-owner-stream.test.js
6. node test/control-plane/publication-recovery-gate.test.js
7. npx eslint src/control-plane/publication-owner-decision.js test/control-plane/publication-owner-stream.test.js
8. node scripts/check-guideline-literals.js src/control-plane/publication-owner-decision.js
9. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-decision.js
10. npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-decision.js
11. npm run guard:guideline:constant-names:file -- src/control-plane/publication-owner-decision.js
12. npm run guard:guideline:constant-names:file -- test/control-plane/publication-owner-stream.test.js
13. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --verbose
14. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
15. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json --explain active_gate_snapshot_coverage
16. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
17. npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-publication-owner-publishing-fence-20260515-codex.report.json
18. npm run analyze:owner-files -- startup_active_gate_owner snapshot_coverage --markdown

## Commit And Push Ledger

1. Focused package commit: `c6d502689c9d5c32a7187a0536b092d4c1f04f23`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
