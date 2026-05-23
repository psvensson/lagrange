# Rolling Restart Active Gate Publication Blocker Projection

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-23",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "publication_gate_blocker_projection_contract",
  "dominantReason": "active_gate_timed_out",
  "currentState": "Focused proof and fresh rolling-restart evidence validated the active-gate publication blocker projection. The stale publication_gate blocker family disappeared after complete publication active-gate handoff coverage, while the representative still fails at active_gate_snapshot_coverage with snapshotCoverage=1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, and wait_owner_recovery evidence.",
  "nextAction": "Close this package as reduced and activate a startup_active_gate_owner / snapshot_coverage successor for the remaining selected snapshot source timeout and repair-deferred owner recovery path.",
  "stabilityCredit": "representative-reduced",
  "representativeRerunCadence": "scheduled-rerun-command",
  "whyHighestLeverageNow": "The returned frontier is a recently closed startup_active_gate_owner / snapshot_coverage boundary, so the workflow requires causal escalation before another local patch. The canonical handoff probe isolates one producer-consumer mismatch: publication is satisfied upstream, while the active-gate consumer reopens publication_gate blockers from missing selected publication convergence fields.",
  "theoryLedgerRefs": [
    "theory-20260522-snapshot-watch-handoff-contract"
  ],
  "proof": [
    "npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js # focused publication blocker projection fixture and affected active-gate consumer proof",
    "npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-2.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-2.js",
    "npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-2.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json"
  ],
  "writeScope": [
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json",
    "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js"
  ],
  "commitScope": [
    "test/distributed/harness/cluster-segment-2.js",
    "test/distributed/harness/__tests__/active-gate-closure-classification.test.js",
    "work/packages/active-20260523-rolling-restart-active-gate-publication-blocker-projection.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
    "ambiguityScore": 3,
    "escalationTriggers": [
      "owned files expand beyond this package",
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single selected producer-consumer contract after causal route selection",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared",
      "the executor does not reopen runtime promotion or publication ownership",
      "focused proof shows stale publication_gate blockers disappear only under complete handoff coverage"
    ],
    "splitTriggers": [
      "write scope expands beyond the active-gate projection consumer",
      "focused proof needs src/ or runtime ownership changes",
      "fresh representative evidence returns unchanged with stale publication_gate blockers"
    ],
    "childPackageCandidates": [
      "Split a package-only architecture experiment if focused proof cannot distinguish handoff coverage from real publication debt.",
      "Keep the selected active-gate consumer projection in this package while it remains two harness files."
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json --handoff-probe",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json --explain active_gate_snapshot_coverage"
    ],
    "decisionRecord": "Record the causal-escalation selection in this package; implementation is allowed only for the named publication_gate_blocker_projection_contract.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Complete handoff publication coverage may clear stale publication_gate blockers in this runtime-owner-boundary successor, but must not imply startup readiness or runtime promotion."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "publication_gate_blocker_projection_contract",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Focused proof should remove stale publication_gate blockers under complete handoff publication coverage; fresh rolling-restart should drop publication_gate blockers, increase coverage/active counts, migrate owner/boundary, or pass.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --owner startup_active_gate_owner --boundary publication_gate_blocker_projection_contract --dominant-reason active_gate_timed_out",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair # current-blocker refresh",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Activate a startup_active_gate_owner / snapshot_coverage successor for the selected snapshot source timeout and repair-deferred owner recovery path."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "publication_gate_blocker_projection_contract",
    "reason": "The canonical frontier remains active_gate_snapshot_coverage, but the handoff probe shows a narrower producer-consumer mismatch: publication is satisfied upstream while the active-gate consumer carries stale publication_gate blockers.",
    "evidence": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json --handoff-probe"
  },
  "causalGovernance": {
    "hypothesis": "The active-gate consumer is blocked partly by stale publication_gate reasons because load publication convergence only reads selected snapshot publication convergence, even though selectedPublicationActiveGateHandoff names all expected published active nodes and zero missing nodes.",
    "stopConditionCheck": "Run the focused active-gate publication blocker projection proof, static guardrails, npm run analyze:causal-model on the fresh representative, a fresh rolling-restart representative rerun, and canonical evidence summary before closure.",
    "expectedCausalModelChange": "Focused proof should make load publication convergence ready and active-wait blockers free of publication_gate reasons when complete handoff coverage is present. Fresh representative should drop stale publication_gate blockers, move counts, migrate owner/boundary, or pass.",
    "representativeOutcome": "reduced",
    "causalDebt": "Closed for this selected contract: fresh artifact test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json keeps publication_ack_convergence satisfied with missingPublishedCount=0 and drops active-gate publication_gate blockers. Remaining debt is startup active-gate snapshot coverage with selected_snapshot_source_timeout, snapshot_repair_deferred, wait_owner_recovery, and runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Keep topology publication ownership, startup readiness support, selected-source retry, owner recovery, and runtime promotion frozen. This package only changes the active-gate consumer projection and focused harness proof."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart active_gate publication blocker projection after publication handoff migration",
    "phaseChain": [
      "publication handoff selected coverage projection focused proof passed",
      "fresh representative moved past publication_ack_convergence",
      "canonical producer publication_ack_convergence is satisfied with missingPublishedCount=0",
      "active-gate consumer emitted stale publication_gate blockers",
      "focused projection proof suppressed stale publication_gate blockers under complete handoff coverage",
      "fresh representative removed publication_gate blockers but remained on startup active-gate snapshot coverage"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage / active_gate_timed_out",
    "knownDownstreamBlockers": [
      "startup readiness support remains inherited from active-gate no progress",
      "runtime promotion remains unsafe while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Complete publication active-gate handoff coverage must suppress stale active-gate publication_gate blockers without declaring readiness or runtime promotion.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js # focused publication blocker projection fixture and affected active-gate consumer proof",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js # focused publication blocker projection fixture and affected active-gate consumer proof",
    "boundedProgressProof": "Focused proof must show bounded active-gate projection progress: evaluateLoadPublishedConvergence and buildActiveWaitProgressSnapshot do not emit publication_gate blockers when the publication handoff covers all expected nodes with zero missing and no pending ACK.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json",
    "expectedObservableTransition": "Observed: fresh representative removed stale publication_gate blockers while runtimePromotionAllowed remained false. The first frontier stayed active_gate_snapshot_coverage with snapshotCoverage=1/5, selected_snapshot_source_timeout, snapshot_repair_deferred, and wait_owner_recovery evidence.",
    "maxProgressBound": "one causal-escalation implementation package before representative rerun",
    "sameFrontierFallback": "If fresh representative remains same-frontier with publication_gate blockers unchanged, stop for an architecture experiment instead of another local projection patch.",
    "expectedNextFrontier": "publication_gate blocker removal, count movement, owner/boundary migration, or rolling-restart green",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260523-rolling-restart-wait-owner-recovery-reconcile-drain-runtime / startup_active_gate_owner / snapshot_coverage / reduced",
      "done-20260523-rolling-restart-startup-active-gate-owner-snapshot-coverage / startup_active_gate_owner / snapshot_coverage / migrated",
      "done-20260523-rolling-restart-selected-snapshot-timeout-owner-recovery-projection-contract / startup_active_gate_owner / selected_snapshot_timeout_owner_recovery_projection_contract / same-frontier"
    ],
    "oscillationCheck": "Allowed only because this package selects a narrower producer-consumer blocker projection contract from the returned same-frontier evidence; it is not another same-frontier symptom patch because the selected delta is stale publication_gate blocker removal after producer publication closure.",
    "handoffInvariant": "Complete handoff publication coverage can clear stale publication_gate blockers, but wait_owner_recovery and repair_deferred evidence must keep runtimePromotionAllowed=false until snapshot coverage completes."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "Doctor detected a return to recently closed startup_active_gate_owner / snapshot_coverage work.",
      "Handoff probe reports producer publication_ack_convergence satisfied with all five published active nodes and zero missing.",
      "The active-gate consumer still carries publication_gate blockers sourced from absent selected publication convergence."
    ],
    "selectedChoice": "continue-local-proof",
    "choices": [
      {
        "id": "continue-local-proof",
        "summary": "Implement the selected active-gate publication blocker projection contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js # focused publication blocker projection fixture and affected active-gate consumer proof"
        ]
      },
      {
        "id": "architecture-package",
        "summary": "Use if focused proof cannot separate complete handoff coverage from real publication debt.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Use only for contradictory canonical evidence or blocked tooling.",
        "route": "human-escalation",
        "proof": [
          "blocked or contradictory tool evidence"
        ]
      }
    ],
    "nextAction": "Run the focused proof, then implement only the selected active-gate consumer projection."
  },
    "observablePrediction": {
    "metric": "active-gate publication_gate blocker count and publication convergence readiness",
    "predicted": "Focused proof will remove publication_convergence_missing, publication_missing_active_node, and publication_not_published blockers under complete handoff coverage; fresh representative will drop stale publication_gate blockers, move counts, migrate owner/boundary, or pass.",
    "observed": "Focused proof made load publication convergence ready with no publication_gate blockers; fresh representative reports blockers=inactive_nodes=5,snapshot_coverage=1/5,snapshot_error and no publication_gate blockers.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json",
    "metricDelta": 7
  }
}
-->

## Why

The selected projection is complete: publication is closed upstream and the active-gate consumer no longer emits stale publication_gate blockers after complete handoff coverage. The remaining first frontier is startup active-gate snapshot coverage with selected snapshot timeout and repair-deferred owner recovery evidence.

## Scope Basis

AGPL rolling-restart stability work in the active sprint. This package is bounded to harness active-gate consumer projection and its focused proof.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the validator detected returned same-frontier work, and the package records a selected producer-consumer contract before implementation.
- Escalation trigger to a heavier lane: focused proof requires src/, topology publication ownership changes, runtime promotion changes, or another same-frontier representative with unchanged publication_gate blockers.

## Core Logic Brief

- Canonical outcome: `startup_active_gate_owner / publication_gate_blocker_projection_contract` emits one outcome for complete handoff coverage: stale publication_gate blockers are suppressed, readiness remains blocked by snapshot coverage.
- Inputs/signals: complete `selectedPublicationActiveGateHandoff.publishedActiveNodeIds`, zero `missingPublishedNodeIds`, zero `pendingAckNodeIds`, absent selected publication convergence, and active-gate blocker output.
- State model or invariant: handoff coverage can close publication blocker projection only when it covers all expected nodes and has zero missing publication debt; it cannot set runtime promotion or snapshot readiness.
- Non-goals and forbidden interpretations: no src/ edits, no timeout widening, no publication owner reinterpretation, and no runtime promotion while snapshot coverage is incomplete.
- Proof mapping: focused test first reproduces stale `publication_gate` blockers, then implementation makes convergence ready and blockers publication-free under complete handoff coverage.
- Wrong-slice trigger: if focused proof shows real missing publication debt or requires publication owner state changes, stop and migrate owner boundary.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| producer publication ACK | satisfied, all expected published active nodes, missingPublishedCount=0 | upstream publication debt is closed | do not reopen publication_gate blockers in active-gate consumer | blocker count for publication_gate reasons becomes 0 under complete handoff | `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js` |
| snapshot coverage | incomplete, repair_deferred, wait_owner_recovery | startup active-gate still owns readiness/snapshot coverage | keep active gate blocked on snapshot coverage | runtimePromotionAllowed remains false | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json --handoff-probe` |

- Anti-symptom rationale: this removes duplicate stale publication blocker projection at the active-gate consumer; it does not patch readiness, timeout, or promotion symptoms.
- Falsifying focused probe: `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Competing explanations: real publication debt, stale selected snapshot convergence only, startup snapshot coverage debt, readiness-support inheritance, and owner recovery queue defer.
- Systemic interaction scan: producer is satisfied, operation workflow has no priority residuals, consumer snapshot coverage remains blocked, and readiness support is downstream inherited evidence.
- Ping-pong stop rule: unchanged same-frontier evidence with publication_gate blockers after this fix opens an architecture experiment rather than another local projection patch.
- Oscillation guard: selected boundary is the publication_gate blocker projection contract, not generic snapshot_coverage; this is not another same-frontier symptom patch because it removes a named stale producer-consumer blocker after upstream publication closure.

## Decision Experiment Gate

- Decision question: Does the active-gate consumer own stale publication_gate blockers after complete publication handoff coverage?
- Architecture review: selected `continue-local-proof` route for owner `startup_active_gate_owner`, boundary `publication_gate_blocker_projection_contract`, contract `active-gate publication blocker projection`; no source runtime ownership change is allowed.
- Competing hypotheses: stale active-gate blocker projection; real publication debt; selected snapshot convergence absence should remain blocking; startup readiness/snapshot coverage is the only remaining blocker.
- Pre-edit focused probe: `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Success metrics: focused proof removes publication_gate blockers under complete handoff coverage; fresh representative drops stale publication_gate blockers, moves counts, migrates owner/boundary, or passes.
- Representative rerun: `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --fast-local --verbose`
- Kill rule: unchanged publication_gate blockers in fresh representative require an architecture experiment before more local runtime work.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-publication-handoff-selected-coverage-projection-20260523T045847Z.report.json`
- Expected delta: publication_gate blockers disappear, counts move, owner/boundary migrates, or rolling-restart passes.
- Local proof class: focused consumer projection proof.
- Representative proof class: fresh rolling-restart rerun plus canonical summary.
- Stop if unchanged: open architecture experiment for unchanged publication_gate blocker projection.

## In Scope

1. `test/distributed/harness/cluster-segment-2.js`
2. `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`

## Out Of Scope

1. `src/`
2. Runtime ownership changes.
3. Timeout widening.
4. Runtime promotion changes.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `test/distributed/harness/cluster-segment-2.js`, `test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Forbidden files: `src/`
- Frozen decisions: publication ownership, startup readiness ownership, selected-source retry policy, timeout budgets, and runtime promotion remain unchanged.
- Escalation triggers: owned files expand beyond this package, focused proof requires runtime ownership changes, or representative evidence returns unchanged with stale publication_gate blockers.
- Focused proof: `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js`
- Model ledger advisory: `escalate`

## Execution Evidence

- [x] implementation: status: validated; evidence: pre-edit `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js` failed on the new publication blocker projection assertion, then `test/distributed/harness/cluster-segment-2.js` and `test/distributed/harness/__tests__/active-gate-closure-classification.test.js` implemented complete handoff coverage consumption; parent revalidated focused proof: yes, `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js` passed 6/6 plus literals, decision-boundaries, runtime grammar, and `git diff --check`; representative evidence `test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json` removed publication_gate blockers and left snapshot_coverage=1/5; next: verifier-fixer closure.
- [x] verification-fix: status: validated; evidence: Lovelace `019e51f8-0cf1-7d72-b608-fb8908a36604` ran `npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js` (PASS 6/6), literals audit (PASS 0), decision-boundaries audit (PASS 0), runtime grammar audit (PASS 0), and `git diff --check -- test/distributed/harness/cluster-segment-2.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js` (PASS); changed files: none; parent revalidated focused proof: yes; next: closure and successor action.
- [x] repair: status: validated; evidence: `npm run work:repair` refreshed generated current-blocker and Current Edge Card when needed; next: validation.

## Validation

1. npm test -- test/distributed/harness/__tests__/active-gate-closure-classification.test.js
2. npm run audit:guideline:literals -- test/distributed/harness/cluster-segment-2.js test/distributed/harness/__tests__/active-gate-closure-classification.test.js
3. npm run audit:guideline:decision-boundaries -- test/distributed/harness/cluster-segment-2.js
4. npm run audit:runtime-grammar:file -- test/distributed/harness/cluster-segment-2.js
5. node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json --fast-local --verbose
6. npm run work:evidence-summary -- test-output/reports/rolling-restart-active-gate-publication-blocker-projection-20260523T054500Z.report.json
