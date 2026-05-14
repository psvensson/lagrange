# Topology Ship Gate Final Confirmation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
  "playback": "none",
  "owner": "distributed_test_harness",
  "boundary": "rolling_restart_and_failure_gate_closure",
  "dominantReason": "ship_criteria_unproven",
  "currentState": "Final rolling-restart confirmation ran and failed in 114789ms. Ship criteria are not met: active=0/5, snapshotCoverage=2/5, publication=PUBLISHED, pendingAck=0, missingPublished=4, and the canonical first frontier is topology_publication_owner / publication_convergence with missing_published_nodes_present. Priority recovery also reappeared as a non-frontier operation_workflow_owner / workflow_progress tail with two spread_satisfied_in_flight witnesses.",
  "nextAction": "Close this package as migrated red confirmation and activate the publication convergence final blocker. Do not fix rolling-restart runtime behavior in this package.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-ship-gate-final-rolling-restart.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-ship-gate-final-rolling-restart.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-ship-gate-final-confirmation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-failure-gate-execution-harness.md",
    "work/packages/done-20260514-topology-contract-integration-reconciliation.md",
    "work/packages/done-20260514-topology-priority-recovery-residual-drain.md",
    "work/packages/todo-20260514-topology-publication-convergence-final-blocker.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260514-topology-ship-gate-final-confirmation.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "hypothesis": "distributed_test_harness / rolling_restart_and_failure_gate_closure proof should reduce, migrate, or classify ship_criteria_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "expectedCausalModelChange": "ship_criteria_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "Final confirmation is red and migrates the sprint to topology_publication_owner / publication_convergence. Runtime fixes remain out of scope until explicitly re-scoped.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / distributed_test_harness / rolling_restart_and_failure_gate_closure",
    "phaseChain": [
      "canonical evidence extraction",
      "distributed_test_harness / rolling_restart_and_failure_gate_closure focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier distributed_test_harness / rolling_restart_and_failure_gate_closure; sprint representative frontier remains topology_publication_owner / publication_convergence until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative publication convergence remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "final confirmation proved ship_criteria_unproven and selected topology_publication_owner / publication_convergence as the next owner boundary",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-ship-gate-final-rolling-restart.report.json --verbose",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for distributed_test_harness / rolling_restart_and_failure_gate_closure.",
    "boundedProgressProofArtifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "expectedObservableTransition": "ship_criteria_unproven migrated to topology_publication_owner / publication_convergence with fresh final-gate evidence.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "not used; final confirmation selected a narrower successor blocker and did not claim ship proof",
    "expectedNextFrontier": "work/packages/todo-20260514-topology-publication-convergence-final-blocker.md",
    "resultClassification": "migrated",
    "stopCondition": "continue-local-fix"
  },
  "representativeResidual": {
    "status": "live-red",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/topology-ship-gate-final-rolling-restart.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Activate the publication convergence final blocker; no runtime fix is part of this package."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "distributed_test_harness",
    "fromBoundary": "rolling_restart_and_failure_gate_closure",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "Final confirmation failed and canonical evidence selected publication_ack_convergence as the first frontier.",
    "evidence": "npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json and npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json report firstFrontierEdgeId=publication_ack_convergence, owner=topology_publication_owner, boundary=publication_convergence, dominantReason=missing_published_nodes_present, pendingAckCount=0, missingPublishedCount=4."
  }
}
-->

## Why

This successor sprint exists because the prior sprint closed without
representative ship proof. The final package must therefore be strict:
focused tests, package queues, coverage matrices, and green local owner
contracts are insufficient. The sprint can close only when representative
rolling-restart and required topology failure gates prove durable convergence
or when a narrower canonical blocker is made active.

This package owns final confirmation and closure discipline.

## Final Confirmation Result

Result: `migrated`.

`rolling-restart` failed in `114789ms`. The final gate did not meet ship
criteria: `active=0/5`, `snapshotCoverage=2/5`, `publication=PUBLISHED`,
`pendingAck=0`, and `missingPublished=4`. Canonical evidence selects
`topology_publication_owner / publication_convergence` as the first frontier
with `missing_published_nodes_present`.

Priority recovery is not the first frontier, but the final artifact also
contains two non-frontier `operation_workflow_owner / workflow_progress`
witnesses in `spread_satisfied_in_flight` for
`control_plane_publications-p1` and `sql_transaction_participants-p1`.
This package records the red final confirmation and splits to a publication
convergence blocker; it does not fix runtime behavior.

## Scope Basis

AGPL topology convergence release-gate closure. This package runs the final
representative rolling-restart gate and verifies promoted failure gates from the
successor sprint.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package executes closure gates and updates
  sprint/current-blocker state. It does not implement runtime fixes.
- Escalation trigger to a heavier lane: any final gate is red, ambiguous,
  missing durable assertions, or requires runtime owner changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Run final representative rolling-restart with fresh artifact.
2. Run canonical evidence summary, topology convergence, priority recovery
   residual, causal model, and distributed failure analyzers on the final
   rolling-restart artifact.
3. Verify failure-gate execution harness package has run or mapped every
   required failure gate to a passed artifact or active narrower blocker.
4. Confirm final rolling-restart ship criteria exactly:
   `active=5/5`, `snapshotCoverage=5/5`, `missingPublished=0`, and no
   `priority_recovery_event_driven_wait`.
5. Update active sprint and `current-blocker` generated files to either close
   the sprint or point at the exact red owner-boundary package.

## Out Of Scope

1. closure-on-focused-proof-only
2. closure-on-coverage-matrix-only
3. harness-timeout-stretching-without-owner-proof
4. Runtime fixes discovered by final gates.
5. Waiving failure gates without recording a precise split/blocker.

## Entry Conditions

Activation evidence:

1. Residual evidence inventory is complete.
2. Active-gate budget and owner cohort blockers are closed or split to a newer
   active blocker.
3. Publication projection and operation workflow residues are closed, split, or
   classified without claiming ship proof.
4. Failure-gate execution harness is complete.
5. Contract integration reconciliation records classification-only evidence:
   focused contracts exist, but release readiness remains blocked until final
   confirmation records green evidence or a fresh narrower blocker.

## Ship Criteria

The sprint can close only when final evidence proves:

1. Rolling restart is green.
2. `active=5/5`.
3. `snapshotCoverage=5/5`.
4. `missingPublished=0`.
5. No critical `priority_recovery_event_driven_wait`.
6. No unbounded critical owner budget.
7. No publication cache authority masquerading as durable convergence.
8. Required failure gates are green, or each red/missing gate has a narrower
   active package with owner, boundary, artifact, and next action.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-ship-gate-final-confirmation.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. `candidateRuntimeFiles` is empty; any new runtime or harness write requires a narrower package or an explicit metadata update before implementation.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-ship-gate-final-rolling-restart.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

1. [x] Review subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-ship-gate-final-review
2. [x] Fix subagent recorded or explicitly not needed:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-ship-gate-final-fix
3. [x] Implementation subagent recorded:
   blocked-by-environment-policy reason:
   subagent-spawn-requires-explicit-user-request-for-ship-gate-final-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-ship-gate-final-confirmation.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `closure-on-focused-proof-only`, `closure-on-coverage-matrix-only`, `harness-timeout-stretching-without-owner-proof`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-ship-gate-final-rolling-restart.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-ship-gate-final-rolling-restart.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-ship-gate-final-confirmation.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-ship-gate-final-confirmation.md
3. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/topology-ship-gate-final-rolling-restart.report.json --verbose
4. npm run work:evidence-summary -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
5. npm run analyze:topology-convergence -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
6. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json --markdown
7. npm --silent run analyze:causal-model -- test-output/reports/topology-ship-gate-final-rolling-restart.report.json
8. npm run analyze:distributed-failure -- --report test-output/reports/topology-ship-gate-final-rolling-restart.report.json
9. npm run work:validate -- --entry work/packages/active-20260514-topology-ship-gate-final-confirmation.md
10. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-ship-gate-final-confirmation.md
11. npm run work:validate -- --closure work/packages/active-20260514-topology-ship-gate-final-confirmation.md
12. git diff --check -- work/packages/active-20260514-topology-ship-gate-final-confirmation.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json
13. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If rolling-restart is red, do not close the sprint; activate or create the
   package matching the first owner/boundary frontier.
2. If rolling-restart is green but a required failure gate is red or unexecuted,
   keep the sprint active and select that gate package.
3. If evidence is ambiguous or missing durable assertions, split to harness or
   diagnostics rather than treating the run as green.
4. If all ship criteria pass, close this sprint with artifact paths and commit
   proof.

## Acceptance Criteria

1. Final package records exact final rolling-restart artifact and analyzer
   outputs.
2. Active sprint records ship criteria as satisfied or points to a narrower
   active blocker.
3. `work:sprints/current-blocker.*` reflects the live state after final
   confirmation.
4. No closure wording relies on focused proof only or coverage matrix presence.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
