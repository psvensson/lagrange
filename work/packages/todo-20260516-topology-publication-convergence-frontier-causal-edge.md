# Topology Publication Convergence Frontier Causal Edge

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-16",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_ack_blocked",
  "currentState": "The active-gate owner-reconcile package reduced its original blocker: latest context says pendingReconcileCount is drained and owner_reconcile_service_unavailable no longer dominates. The latest representative artifact now selects publication_ack_convergence / topology_publication_owner / publication_convergence with publication_ack_blocked and seed readiness timeout evidence.",
  "nextAction": "Classify the current publication_ack_convergence frontier from the latest rolling-restart artifact before any follow-on runtime change.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown"
  ],
  "writeScope": [],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json",
    "work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/admin/admin-control-snapshot-class-part-1.js",
    "src/admin/admin-control-snapshot-class-part-2.js",
    "src/admin/admin-control-snapshot-class-part-6.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/cluster-segment-7-class-5.js"
  ],
  "commitScope": [],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  }
}
-->

## Why

This is the immediate successor package after the current active-gate
owner-reconcile slice closes or migrates. The active handoff path is no longer
the first frontier in current context; the representative gate moved to
`publication_ack_convergence` under `topology_publication_owner /
publication_convergence`.

This package exists to prevent the next runtime change from guessing. It first
classifies whether the new publication frontier is truly an ACK-convergence
owner issue, a seed readiness or owner-recovery issue, or a priority-recovery
handoff that should migrate back to `operation_workflow_owner`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`, especially topology workflow
stabilization, failure simulations, and production guarantees. Edition matrix
scope remains Community / AGPL repo.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: this package starts from a live red
  release-gate artifact and may choose between adjacent runtime owners before
  implementation.
- Escalation trigger to a heavier lane: the causal model reports
  contradictory frontier evidence, the successor needs more than one runtime
  owner, or the active package has not been cleanly closed/migrated.

## Active Sprint Isolation

- Active package/sprint used only as handoff context:
  `work/packages/done-20260515-startup-active-gate-snapshot-coverage-owner-reconcile-remaining-targets.md`
  and
  `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`.
- Evidence that may be read but not mutated:
  `test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`.
- Files explicitly forbidden before activation: all runtime and test files in
  `candidateRuntimeFiles`.
- Runtime architecture ideas captured as contract/backlog items: the pattern
  packages in
  `work/sprints/todo-2026-q2-topology-convergence-systems-pattern-hardening.md`.
- Activation rule before runtime implementation: the active package must close
  or migrate, `work:current-blocker` must name this owner/boundary, and the
  first extractor pass must still select `publication_ack_convergence` or
  explicitly migrate to `operation_workflow_owner / rebalancer_handoff`.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run canonical evidence summary, topology convergence, causal model,
   priority residuals, distributed-failure, and owner-files extraction against
   the latest artifact.
2. Fill a causal edge table with these columns: durable publication row,
   required ACK set, observed ACK set, owner recovery outcome, seed readiness
   state, active-gate handoff state, and priority-recovery witness state.
3. Decide exactly one next owner:
   `topology_publication_owner / publication_convergence`,
   `startup_readiness_owner / startup_support_evidence`, or
   `operation_workflow_owner / rebalancer_handoff`.
4. If runtime implementation proceeds, promote only the files owned by the
   selected row in the causal edge table.
5. Update current-blocker handoff after classification so later agents do not
   continue treating the drained owner-reconcile path as active.

## Out Of Scope

1. Returning to `startup_active_gate_owner / snapshot_coverage` unless fresh
   canonical evidence makes it the first frontier again.
2. Timeout increases, active-gate admission relaxation, or diagnostics-only
   success.
3. Runtime edits before the owner migration decision is recorded.
4. Pro or Enterprise behavior.

## Borrowed Pattern Hook

- TiKV/PD pattern: scheduling operators are followed by later heartbeat
  evidence. Local analogue: do not call the publication frontier solved until
  a later control snapshot or publication row proves the requested ACK/recovery
  step completed.
- FoundationDB pattern: use a replayable missing-edge fixture before another
  broad rerun. Local analogue: if the extractor cannot distinguish ACK block
  from readiness support, create a focused artifact replay before patching
  runtime.

## Acceptance

1. The package records one selected owner/boundary and explains why the other
   candidate boundaries were not selected.
2. If it stays on publication convergence, the next action names one missing
   causal edge: ACK delivery, owner recovery wake, durable publication
   visibility, or readiness support.
3. If it migrates, the successor package command is recorded with the exact
   owner, boundary, dominant reason, and artifact.
4. The original rolling-restart gate remains represented by the same artifact
   until a fresh representative run is intentionally produced.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: this package file until activation; candidate runtime files may
  be promoted only after the causal edge table selects a single owner.
- Forbidden files: non-candidate runtime files, timeout budgets, active-gate
  admission relaxation, and Pro or Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-admin-owner-readiness-handoff-20260516.report.json --markdown
5. npm run analyze:owner-files -- topology_publication_owner publication_convergence --markdown
