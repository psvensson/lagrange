# Rolling Restart Wait Owner Recovery Selected Source Timeout Contract

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-23",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof, static guardrails, verifier-fixer, and a fresh rolling-restart rerun validated the wait_owner_recovery selected-source timeout progress contract. The representative remains red on startup_active_gate_owner / snapshot_coverage, but the key metric reduced from snapshotCoverageNodeCount=0/5 to 1/5 while runtimePromotionAllowed remains false.",
  "nextAction": "Close this package as reduced and activate the wait_owner_recovery owner queue drain successor for pendingRecoveryCount=1 and selectedControlPlaneOwnerQueuePendingWrites=1.",
  "stabilityCredit": "representative-reduced",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "This advances the active sprint goal of getting rolling-restart to succeed at the current first frontier active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage. The prior runtime package reduced pendingReconcileCount to 0 and exposed the next named handoff action: wait_owner_recovery with pendingRecoveryCount=1, selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry, and runtimePromotionAllowed=false.",
  "proof": [
    "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected-source wait-owner-recovery fixture and affected consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json --fast-local --verbose"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json",
    "test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-7-class-5.js",
    "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js",
    "test/distributed/harness/__tests__/cluster.test-part-4.js",
    "work/packages/active-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single owner-boundary execution after higher-model route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond the declared lower-model lane",
      "proof requires forbidden scope, cross-owner reasoning, or architecture route selection",
      "the implementation needs to decide system behavior instead of executing a named local mechanism"
    ],
    "childPackageCandidates": [
      "Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.",
      "Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.",
      "Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.",
      "Keep cross-file owner runtime integration in this package unless it contracts to one runtime file."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected-source wait-owner-recovery fixture and affected consumer proof",
      "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js",
      "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Observed: wait_owner_recovery bounded progress increased snapshotCoverageNodeCount from 0/5 to 1/5 while selected timeout/repair-deferred evidence and runtimePromotionAllowed=false remained. Successor must drain or explicitly defer selectedControlPlaneOwnerQueuePendingWrites=1, increase snapshotCoverageNodeCount beyond 1/5, migrate owner/boundary, or pass rolling-restart.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate the wait_owner_recovery owner queue drain successor."
  },
  "causalGovernance": {
    "hypothesis": "The selected source timeout path already knows the active-gate owner handoff is wait_owner_recovery for one pending recovery node, but terminal timeout evidence collapses observed snapshot coverage to 0/5 instead of exposing bounded owner-recovery progress.",
    "stopConditionCheck": "Run the focused wait_owner_recovery fixture, affected consumer proof, static guardrails, npm run analyze:causal-model on the fresh representative, and a fresh rolling-restart rerun before closure.",
    "expectedCausalModelChange": "Observed bounded wait_owner_recovery progress: snapshotCoverageNodeCount moved from 0/5 to 1/5. The representative still selects startup_active_gate_owner / snapshot_coverage with selected timeout, repair-deferred retryAfterMs=100, pendingRecoveryCount=1, and selectedControlPlaneOwnerQueuePendingWrites=1.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh evidence has snapshotCoverageNodeCount=1/5, activeNodeCount=4/5, selectedSnapshotNodeId=11601fe0-72d6-5853-8590-ec2881853e72, selectedSnapshotError after 100ms, selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry, pendingRecoveryCount=1, pendingReconcileCount=0, selectedControlPlaneOwnerQueuePendingWrites=1, membershipPublicationHandoffOutcome=write_deferred, and active_gate_timeout exhausted.",
    "crossBoundaryReview": "Keep reconcile-owner membership publication, publication convergence, priority recovery, readiness support semantics, runtime promotion safety, and product/scenario timeout ceilings frozen; this child only changes selected-source wait_owner_recovery progress visibility."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate_snapshot_coverage after causal-escalation selected wait_owner_recovery child route",
    "phaseChain": [
      "selected-source retry floor proof passed",
      "reconcile_owner_membership_publication reduced pendingReconcileCount from 1 to 0",
      "publication convergence is ready",
      "active-gate handoff now reports wait_owner_recovery with pendingRecoveryCount=1",
      "selected snapshot source times out after 100ms and repair is deferred"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "wait_owner_recovery terminal selected-source timeout must expose bounded recovery progress or explicit defer for the pending recovery node without reporting readiness.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected-source wait-owner-recovery fixture and affected consumer proof",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected-source wait-owner-recovery fixture and affected consumer proof",
    "boundedProgressProof": "Focused proof must show selected-source wait_owner_recovery reports bounded progress, retry/defer, or a frozen non-promotion state for pendingRecoveryCount=1.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json",
    "expectedObservableTransition": "Observed snapshotCoverageNodeCount moved above 0/5 to 1/5. Successor should drain/defer owner queue, increase coverage beyond 1/5, migrate owner/boundary, or pass while runtimePromotionAllowed remains false until coverage completes.",
    "maxProgressBound": "one selected wait_owner_recovery runtime contract; no timeout widening and no runtime promotion while coverage is incomplete",
    "sameFrontierFallback": "If fresh evidence remains same-frontier with no metric movement, stop for architecture-gap instead of another adjacent runtime patch.",
    "expectedNextFrontier": "startup_active_gate_owner / snapshot_coverage / wait_owner_recovery owner queue drain",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-runtime / causal-escalation / selected continue-local-proof",
      "done-20260523-rolling-restart-reconcile-owner-membership-publication-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-snapshot-coverage-owner-reconcile-membership-publication / causal-escalation / selected continue-local-proof"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor was causal-escalation and selected this concrete child route.",
    "handoffInvariant": "wait_owner_recovery evidence may not imply startup readiness or runtime promotion until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "The causal-escalation predecessor selected continue-local-proof for wait_owner_recovery selected-source timeout progress.",
      "The child has one pending recovery node and runtimePromotionAllowed=false.",
      "Canonical evidence reports selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected wait_owner_recovery bounded progress contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js # focused selected-source wait-owner-recovery fixture and affected consumer proof"
        ]
      },
      {
        "id": "open-architecture-package",
        "summary": "Use only if focused proof contradicts the selected child route or fresh representative evidence shows no metric movement.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json"
        ]
      }
    ],
    "nextAction": "Implement the selected local proof."
  },
  "observablePrediction": {
    "metric": "pendingRecoveryCount, snapshotCoverageNodeCount, selectedSnapshotObservation mode/state/nextAction, selectedControlPlaneOwnerQueuePendingWrites, runtimePromotionAllowed, route owner/boundary, and rolling-restart result",
    "predicted": "Focused proof will expose bounded wait_owner_recovery progress or explicit defer for pendingRecoveryCount=1; fresh representative will increase snapshotCoverageNodeCount above 0/5, reduce selected timeout/repair-deferred evidence, migrate owner/boundary, or pass.",
    "observed": "snapshotCoverageNodeCount increased from 0/5 to 1/5; pendingRecoveryCount=1, selectedControlPlaneOwnerQueuePendingWrites=1, selectedSnapshotObservation=repair_deferred/deferred_refresh/deferred/deferred/retry, runtimePromotionAllowed=false, owner/boundary unchanged, and rolling-restart still failed.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json",
    "metricDelta": 1
  }
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: startup_active_gate_owner / snapshot_coverage emits the package outcome for active_gate_timed_out.
- Inputs/signals: test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown.
- State model or invariant: The startup_active_gate_owner / snapshot_coverage decision table in the Causal Decision Contract maps active_gate_timed_out and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the startup_active_gate_owner / snapshot_coverage invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | startup_active_gate_owner / snapshot_coverage / active_gate_timed_out | startup_active_gate_owner owns this decision before downstream consumers reinterpret it | Triage active_gate_snapshot_coverage with combined scenario evidence before runtime edits. | Make wait_owner_recovery bounded progress or explicit retry/defer for pendingRecoveryCount=1, reduce selected snapshot timeout/repair-deferred evidence, increase snapshotCoverageNodeCount above 0/5, migrate owner/boundary, or pass rolling-restart. | npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies startup_active_gate_owner / snapshot_coverage directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json`
- Competing explanations: At minimum compare active_gate_timed_out against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or an autonomous architecture experiment before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or select/open an autonomous architecture experiment before another local patch.

## Decision Experiment Gate

- Decision question: Does startup_active_gate_owner / snapshot_coverage still own active_gate_timed_out, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an autonomous architecture experiment, or a human-only route caused by contradictory or blocked evidence.
- Competing hypotheses: active_gate_timed_out is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json`
- Success metrics: Make wait_owner_recovery bounded progress or explicit retry/defer for pendingRecoveryCount=1, reduce selected snapshot timeout/repair-deferred evidence, increase snapshotCoverageNodeCount above 0/5, migrate owner/boundary, or pass rolling-restart.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --owner startup_active_gate_owner --boundary snapshot_coverage --dominant-reason active_gate_timed_out`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for an autonomous architecture experiment instead of opening another local patch; use human escalation only for contradictory or blocked evidence.



## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json`
- Expected delta: Make wait_owner_recovery bounded progress or explicit retry/defer for pendingRecoveryCount=1, reduce selected snapshot timeout/repair-deferred evidence, increase snapshotCoverageNodeCount above 0/5, migrate owner/boundary, or pass rolling-restart.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction opens/selects an autonomous architecture experiment instead of another local patch; human escalation is only for contradictory or blocked evidence.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json`
- Route owner: `startup_active_gate_owner`
- Route boundary: `snapshot_coverage`
- Route dominant reason: `active_gate_timed_out`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them. If the representative route is same-frontier with no reduction or an architecture gap, open an autonomous architecture experiment before more local runtime work.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer `npm run work:scenario-route -- <artifact>` for representative routing, one focused test or extractor, and validation. Add static guardrails only when implementation files changed.
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or open/select an autonomous architecture experiment. Human gates are only for blocked/contradictory evidence.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: single owner-boundary execution after higher-model route selection
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Split mechanical cleanup into mechanical-maintenance / gpt-5.3-codex-spark.
2. Split focused tests or fixtures into test-only-proof / gpt-5.3-codex-spark.
3. Split one same-owner hypothesis into bounded-experiment / gpt-5.3-codex-spark.
4. Keep cross-file owner runtime integration in this package unless it contracts to one runtime file.

## Execution Evidence

Preferred closure evidence for new packages. One executor owns implementation end to end; one separate verifier-fixer validates the last package work and may fix in-scope problems directly.
Agent identity is optional provenance. Use legacy subagent ledgers only when a reopened historical package already uses them.

- [x] implementation: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` passed (39/39); static guardrails passed; representative rerun `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json --fast-local --verbose` failed but reduced snapshotCoverageNodeCount from 0/5 to 1/5; parent revalidated focused proof: yes; next: closure and successor action.
- [x] verification-fix falsification: status: validated; wrong-slice evidence would be owner/boundary migration away from startup_active_gate_owner/snapshot_coverage, or required edits outside write scope; evidence: `npm run work:package:doctor -- --suggest work/packages/active-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract.md` (validation ok), `npm run work:validate -- --pre-impl work/packages/active-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract.md` (ok), focused proof and static guardrails passed; changed files: none; parent revalidated focused proof: yes; next: validated verification-fix evidence.
- [x] verification-fix: status: validated; evidence: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` passed (39/39), `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` passed (0 new), `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js` passed, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js` passed; canonical movement check: `npm run work:evidence-summary -- test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json` keeps the same frontier while `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-wait-owner-recovery-selected-source-timeout-contract-20260523T012036Z.report.json --handoff-probe` shows reduced `snapshotCoverageNodeCount=1` and `selectedSnapshotObservationRetryAfterMs=100`; changed files: `work/packages/active-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract.md`; parent revalidated focused proof: yes; next: parent reruns focused proof and decides closure/successor action.
- [x] verification-fix: status: validated; evidence: follow-up delta verified for tolerance-based retryAfter assertions in `test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js`; `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js test/distributed/harness/__tests__/cluster.test-part-4.js` passed (39/39), `npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-7-class-5.js ./test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-test-cases.js ./test/distributed/harness/__tests__/cluster.test-part-4.js` passed, `npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-7-class-5.js` passed, `npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-7-class-5.js` passed; changed files: `work/packages/active-20260523-rolling-restart-wait-owner-recovery-selected-source-timeout-contract.md`; parent revalidated focused proof: yes; next: closure/successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card for active successor `work/packages/active-20260523-rolling-restart-wait-owner-recovery-queue-drain-runtime.md`; next: closure validation.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-reconcile-owner-membership-publication-runtime-20260523T010000Z.report.json --markdown
