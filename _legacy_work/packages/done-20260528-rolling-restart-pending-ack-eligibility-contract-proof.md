# Rolling Restart Pending ACK Eligibility Contract Proof

<!-- work-package
{
  "schema": "work-package-v2",
  "status": "done",
  "intent": {
    "opened": "2026-05-28",
    "lane": "bounded-experiment",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "playback": "none",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_pending_ack_eligibility_contract",
    "dominantReason": "snapshot_coverage_incomplete",
    "currentState": "The latest package filtered pending ACK and pending recovery node ids out of active snapshot eligibility, but the theory still needs a focused source/test contract proof before another representative rerun can decide whether the eligibility gap was the active blocker.",
    "nextAction": "Add or adjust the focused snapshot coverage fixture so pending ACK and pending recovery node ids are excluded from locally eligible, projected serving, effective active, and projected active snapshot candidates; then rerun the representative rolling-restart route.",
    "predecessor": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md",
    "closed": "2026-05-28"
  },
  "scope": {
    "writeScope": [
      "src/admin/admin-control-snapshot-class-part-3.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "scripts/work-theory-loop.js",
      "test/scripts/work-theory-loop.test.js",
      "work/README.md",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md"
    ],
    "handoffFiles": [
      "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md",
      "test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json"
    ],
    "generatedFiles": [
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ],
    "candidateRuntimeFiles": [
      "src/admin/admin-control-snapshot-publication-convergence-diagnostics.js",
      "src/admin/admin-control-snapshot-publication-handoff.js",
      "test/distributed/harness/failure-bundle-diagnostics-artifact-builder.js"
    ],
    "commitScope": [
      "src/admin/admin-control-snapshot-class-part-3.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
      "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json",
      "scripts/work-theory-loop.js",
      "test/scripts/work-theory-loop.test.js",
      "work/README.md",
      "work/RULES.md",
      "work/templates/sprint-strategy-brief.md"
    ]
  },
  "gates": {
    "stabilityCredit": "local-proof-only",
    "whyHighestLeverageNow": "The predecessor changed runtime eligibility filtering without a dedicated contract proof. The cheapest next executable concern is to make that theory falsifiable in the selected-source snapshot repair fixture before spending another representative rolling-restart run.",
    "representativeRerunCadence": "scheduled-rerun-command"
  },
  "modelFit": {
    "packageClass": "bounded-experiment",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "single-owner source/test contract proof",
    "outputProfile": "medium",
    "ambiguityScore": 1,
    "escalationTriggers": [
      "proof requires selected-source ordering, admin API, transport, table bootstrap, startup readiness, or generic timeout edits",
      "focused proof shows pending ACK and pending recovery ids are already excluded before this package's code path",
      "fresh representative route repeats active_gate_snapshot_coverage with unchanged coverage and no eligibility metric movement"
    ]
  },
  "execution": {
    "theoryLedgerRefs": [
      "theory-20260522-snapshot-watch-handoff-contract",
      "theory-20260526-rolling-restart-active-gate-evidence-capture-gap"
    ],
    "theoryLedger": "no-ledger-update",
    "proof": {
      "commands": [
        "falsifier: pending ACK/recovery ids must be removed from local snapshot eligibility vectors after package source/test edits: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "regression: active package remains structurally valid after source/test proof is recorded: npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
        "supporting: runtime grammar for the snapshot eligibility source path: npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-3.js",
        "supporting: fresh representative route after focused source/test proof: bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-pending-ack-eligibility-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output \"$REPORT\" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact \"$REPORT\" --package work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md'",
        "supporting: whitespace proof for package-owned files: git diff --check -- src/admin/admin-control-snapshot-class-part-3.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md"
      ]
    },
    "implementation": {
      "parentRevalidatedFocusedProof": true,
      "filesChanged": [
        "src/admin/admin-control-snapshot-class-part-3.js",
        "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
        "work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
        "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
        "work/sprints/current-blocker.md",
        "work/sprints/current-blocker.json"
      ]
    },
    "verificationFix": {
      "parentRevalidatedFocusedProof": true
    },
    "repair": {
      "validationCommand": "npm run work:repair"
    }
  },
  "progressContract": {
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage_pending_ack_eligibility_contract",
    "state": "pending_ack_eligibility_filter",
    "reason": "snapshot_coverage_incomplete",
    "nextAction": "exclude_pending_ack_and_recovery_nodes_from_snapshot_candidates",
    "wakeSource": "active-gate",
    "retryAfterMs": 100,
    "terminalState": "eligible_snapshot_ack_cohort",
    "evidencePath": "failureBundle.publicationConvergence.activeGate.progress",
    "blockingDependency": "pending_ack_or_recovery_node_included_in_snapshot_candidate_vectors"
  },
  "mechanismCard": {
    "failureMechanism": "contract_gap",
    "stableFacts": "rolling-restart still routes through startup_active_gate_owner / snapshot_coverage; the predecessor selected pending ACK eligibility as the current local mechanism; active-gate coverage remains incomplete until unavailable or recovering nodes stop being treated as viable snapshot candidates.",
    "changedFacts": "src/admin/admin-control-snapshot-class-part-3.js now attempts to remove pendingAckNodeIds and pendingRecoveryNodeIds from locally eligible, projected serving, effective active, and projected active node vectors.",
    "rejectedAlternatives": "budget_gap is rejected because extra time cannot make a recovering node respond; selected-source ordering remains out of scope because this package first proves the candidate set; observation_gap is rejected for this package because the predecessor found the pending ACK and recovery ids in diagnostics; ownership_gap is not selected unless focused proof needs forbidden scope.",
    "ownerWhoDecides": "startup_active_gate_owner",
    "currentAction": "Active-gate snapshot coverage builds owner-truth active node vectors, then selected-source proof and representative routing consume those vectors.",
    "missingTransitionOrObservation": "The source/test contract must prove that nodes reported as pending ACK or pending recovery cannot remain in local snapshot candidate vectors.",
    "smallestFalsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "expectedMovement": "Focused proof fails if pending ACK or pending recovery ids remain eligible, and passes only when those ids are excluded; the representative rerun then passes, moves snapshot coverage, migrates owner boundary, or provides a fresh same-frontier stop.",
    "negativeResultMeans": "If the focused proof cannot distinguish eligibility movement inside declared scope, this package stops as evidence-incomplete or ownership-gap instead of patching selected-source behavior.",
    "escalationRule": "If the representative rerun repeats active_gate_snapshot_coverage with unchanged coverage after the focused contract proof passes, update the sprint option set before any further local runtime package."
  },
  "boundedExperiment": {
    "hypothesis": "Rolling-restart remains red because pending ACK or recovering nodes can still be included in active snapshot candidate vectors; proving and enforcing exclusion should either move the representative route or falsify this mechanism.",
    "hypothesisDiscriminator": "H1 is supported if the focused fixture shows pending ACK/recovery nodes were eligible before the source/test change and excluded after it; H1 is falsified if those nodes were already excluded or representative evidence remains unchanged with no eligibility movement.",
    "expectedMetric": "The focused fixture observes zero pending ACK or pending recovery node ids in locallyEligibleNodeIds, projectedServingNodeIds, effectiveActiveNodeIds, and projectedActiveNodeIds; representative routing then passes, reduces snapshot coverage residuals, or names the next owner boundary.",
    "inheritsFrom": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md",
    "timebox": "24h",
    "mergeRequirement": "entry validation, pre-implementation validation, source/test modification, focused falsifier, runtime grammar, representative route-after-rerun, current-blocker repair, and closure validation",
    "killRule": "Do not add selected-source, timeout, startup readiness, transport, admin API, or table-bootstrap changes unless the focused proof or fresh route selects that owner boundary."
  },
  "experimentOutcome": {
    "distinguishedHypothesis": "H1",
    "decision": "open-runtime-owner-boundary",
    "nextOwner": "startup_active_gate_owner",
    "nextBoundary": "snapshot_coverage_pending_ack_eligibility_contract",
    "evidence": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md"
  },
  "validationTier": "release-gate",
  "representativeResidual": {
    "status": "same-frontier-h1-falsified",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "frontier": "active_gate_snapshot_coverage",
    "owner": "startup_active_gate_owner",
    "boundary": "snapshot_coverage",
    "dominantReason": "active_gate_timed_out",
    "nextAction": "Update the sprint option set and select an architecture or owner-migration discriminator before another local runtime package."
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_active_gate_owner",
    "toBoundary": "snapshot_coverage_pending_ack_eligibility_contract",
    "reason": "The predecessor narrowed the current local mechanism to active snapshot eligibility vectors containing nodes that cannot satisfy ACK or recovery obligations.",
    "evidence": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md"
  },
  "causalGovernance": {
    "hypothesis": "The first actionable edge is an eligibility contract: pending ACK or recovering nodes must be removed before active-gate snapshot coverage can pick a viable candidate cohort.",
    "stopConditionCheck": "npm run analyze:causal-model -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json",
    "expectedCausalModelChange": "After the focused contract proof, fresh representative routing should pass, reduce snapshot coverage residuals, migrate the owner boundary, or record same-frontier with H1 falsified.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The predecessor changed source filtering without a dedicated fixture that proves every local eligibility vector excludes pending ACK and pending recovery ids.",
    "crossBoundaryReview": "Selected-source ordering, generic timeout budgets, startup readiness, admin API, transport, table bootstrap, and promotion gates are forbidden unless fresh route evidence selects them."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart pending ACK eligibility contract proof",
    "phaseChain": [
      "owner-reconcile admission work moved the sprint to active-gate snapshot coverage",
      "pending ACK eligibility filtering was added as the latest local mechanism",
      "this package makes that mechanism falsifiable before another representative rerun"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage / startup_active_gate_owner / snapshot_coverage_pending_ack_eligibility_contract / snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "selected-source timeout remains downstream until the viable candidate set is proven",
      "startup readiness remains downstream while active-gate snapshot coverage is incomplete",
      "benchmark table bootstrap remains downstream while snapshot coverage is incomplete"
    ],
    "missingCausalEdge": "Pending ACK and pending recovery node ids must be excluded from local active snapshot candidate vectors before coverage attempts select snapshot sources.",
    "missingCausalEdgeProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "falsifyingProbe": "npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
    "boundedProgressProof": "Focused source/test proof must fail when a pending ACK or pending recovery node remains in locally eligible, projected serving, effective active, or projected active candidates before the active-gate retry and reconcile path advances.",
    "boundedProgressProofArtifact": "work/packages/done-20260528-rolling-restart-pending-ack-eligibility-filter.md",
    "expectedObservableTransition": "candidate vectors exclude pending ACK/recovery ids; representative rerun passes, reduces snapshot coverage residuals, migrates owner boundary, or records H1 falsified same-frontier.",
    "maxProgressBound": "one source/test contract package and one representative rerun before revising the theory option set",
    "sameFrontierFallback": "Update the sprint option set and select a new promoted theory before opening another local runtime package.",
    "expectedNextFrontier": "representative-green, snapshot coverage movement, selected next owner boundary, or H1 falsified same-frontier",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "done-20260528-rolling-restart-owner-reconcile-admission-runtime.md / startup_active_gate_owner / snapshot_coverage_owner_reconcile_admission_contract / reduced",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage.md / startup_active_gate_owner / snapshot_coverage / classified",
      "done-20260528-rolling-restart-startup-active-gate-owner-snapshot-coverage-v2.md / startup_active_gate_owner / snapshot_coverage / classified",
      "done-20260528-rolling-restart-pending-ack-eligibility-filter.md / startup_active_gate_owner / snapshot_coverage / local-filter-applied"
    ],
    "oscillationCheck": "This package is not another classifier; it requires source/test modification and a falsifying proof for the promoted eligibility theory.",
    "handoffInvariant": "Do not treat local proof as representative green; route fresh rolling-restart evidence after the focused contract proof."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "the focused pending ACK/recovery eligibility proof passed",
      "fresh representative evidence kept active_gate_snapshot_coverage at snapshotCoverage=1/5 with owner_reconcile_pending and write_deferred",
      "artifact comparison recommends owner migration or an architecture gate before another local runtime patch"
    ],
    "selectedChoice": "snapshot-coverage-architecture-experiment",
    "choices": [
      {
        "id": "snapshot-coverage-architecture-experiment",
        "summary": "Open or select an autonomous architecture experiment before another local snapshot coverage runtime patch.",
        "route": "architecture-package",
        "proof": [
          "npm run work:artifact-compare -- test-output/reports/rolling-restart-active-gate-owner-reconcile-retry-20260528T040351Z.report.json test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json"
        ]
      },
      {
        "id": "another-local-runtime-patch",
        "summary": "Continue local startup active-gate runtime patching from unchanged same-frontier coverage evidence.",
        "route": "continue-local-proof",
        "proof": [
          "Rejected until the architecture experiment names a concrete owner contract or boundary migration."
        ]
      }
    ],
    "nextAction": "Select the architecture experiment or owner-migration package before any further local runtime patch."
  },
  "requiredPreImplProbe": {
    "command": "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
    "artifact": "work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
    "reason": "Confirms the theory-loop package has owner, boundary, write scope, falsifier, regression proof, stop rule, and explicit source/test modification before implementation continues."
  },
  "observablePrediction": {
    "metric": "pending ACK/recovery ids in active snapshot candidate vectors",
    "predicted": "0 pending ACK or pending recovery node ids remain in locallyEligibleNodeIds, projectedServingNodeIds, effectiveActiveNodeIds, and projectedActiveNodeIds after the package-owned source/test change.",
    "observed": "Focused fixture observed zero pending ACK or pending recovery ids in candidate vectors; representative rerun reported pendingAck=0 and publication_ack_closed but stayed red at snapshotCoverage=1/5.",
    "accuracy": "partial",
    "evidence": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "metricDelta": 0
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json",
    "routeOwner": "startup_active_gate_owner",
    "routeBoundary": "snapshot_coverage",
    "routeDominantReason": "active_gate_timed_out",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "causal-escalation",
    "expectedDelta": "H1 is falsified as the active blocker; select an architecture or owner-migration discriminator before another local runtime package.",
    "requiredRefreshCommands": [
      "bash -lc 'RUN_ID=$(date -u +%Y%m%dT%H%M%SZ); REPORT=test-output/reports/rolling-restart-pending-ack-eligibility-${RUN_ID}.report.json; timeout 1800s node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output \"$REPORT\" --fast-local --verbose; npm run work:package:route-after-rerun -- --artifact \"$REPORT\" --package work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md'",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:repair",
      "npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
      "npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md"
    ]
  },
  "modelFitSplit": {
    "targetExecutionModel": "gpt-5.3-codex",
    "allowedDecisionDepth": "single promoted theory with source/test contract proof inside startup_active_gate_owner",
    "safeToExecuteWhen": [
      "owner, boundary, write scope, do-not-edit scope, falsifier, regression proof, and kill rule stay as declared",
      "the executor modifies only the declared source/test contract proof rather than selecting a new architecture route",
      "the first focused proof gives a clear pass, fail, or escalate signal"
    ],
    "splitTriggers": [
      "write scope expands beyond declared source/test files",
      "proof requires selected-source ordering, admin API, transport, table bootstrap, startup readiness, promotion gates, or generic timeout policy edits",
      "implementation needs to choose a new owner boundary instead of proving the selected eligibility contract"
    ],
    "childPackageCandidates": [
      "Use test-only-proof only if runtime source behavior remains untouched.",
      "Use runtime-owner-boundary if the eligibility filter expands into shared owner contract behavior.",
      "Use causal-escalation if representative route stays same-frontier with no eligibility movement after focused proof."
    ]
  },
  "theoryLedger": "no-ledger-update",
  "implementation": {
    "parentRevalidatedFocusedProof": true,
    "filesChanged": [
      "src/admin/admin-control-snapshot-class-part-3.js",
      "test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js",
      "work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md",
      "work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md",
      "work/sprints/current-blocker.md",
      "work/sprints/current-blocker.json"
    ]
  },
  "verificationFix": {
    "parentRevalidatedFocusedProof": true
  },
  "repair": {
    "validationCommand": "npm run work:repair"
  },
  "commitAndPushLedgerRequired": true
}
-->

## Why

The predecessor package changed the snapshot eligibility source path, but the sprint now requires every theory-loop package to test a promoted theory through source/test modification and a falsifying proof. This package makes the pending ACK eligibility theory executable and falsifiable before spending another representative `rolling-restart` run.

## Promoted Theory

H1: `rolling-restart` remains red because pending ACK or pending recovery nodes can stay inside active snapshot candidate vectors. The package must prove those ids are excluded from `locallyEligibleNodeIds`, `projectedServingNodeIds`, `effectiveActiveNodeIds`, and `projectedActiveNodeIds`.

## Required Modification

1. Keep runtime edits inside [src/admin/admin-control-snapshot-class-part-3.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/src/admin/admin-control-snapshot-class-part-3.js).
2. Add or adjust the focused falsifier in [cluster-control-snapshot-timeout-repair-selected-source-test-cases.js](/media/peter/4509da27-4751-4dee-b366-f3983d077725/peter/projects/something/test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js).
3. Do not edit selected-source ordering, generic timeout budgets, startup readiness, admin API, transport, table bootstrap, or promotion gates.

## Test-Run Rule

Run workflow validation, package doctor, source inspection, and canonical evidence extractors before implementation as needed. Run `npm test` only after this package modifies source or test code; after that modification, the falsifier and regression proof are mandatory closure evidence.

## Mechanism Card

- Failure mechanism: `contract_gap`.
- Owner who decides: `startup_active_gate_owner`.
- Missing transition or observation: pending ACK and pending recovery ids must be excluded from every active snapshot candidate vector.
- Smallest falsifier: `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
- Expected movement: focused proof observes zero pending ACK or recovery ids in the candidate vectors; representative route passes, reduces, migrates, or records H1 falsified same-frontier.
- Negative result means: revise the theory option set instead of opening another local runtime package from unchanged evidence.

## Runbook

1. Run `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md`.
2. Run `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md`.
3. Modify the source/test scope named above to make the pending ACK eligibility contract falsifiable.
4. Run `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`.
5. Run `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-3.js`.
6. Run the representative route command from metadata with a fresh timestamped report path.
7. Run `npm run work:repair`, then closure validation and `npm run work:close` when evidence is recorded.

## In Scope

1. Pending ACK and pending recovery eligibility filtering in the declared source path.
2. Focused fixture assertions that fail if any pending ACK or recovery id remains in candidate vectors.
3. Fresh representative routing after the focused source/test proof.
4. Sprint/current-blocker updates caused by this active package.

## Out Of Scope

1. Selected-source ordering.
2. Generic timeout budgets.
3. Startup readiness ownership.
4. Admin API, transport, table bootstrap, or promotion gates.
5. Additional local runtime packages from unchanged same-frontier evidence.

## Theory Loop Results

- [x] theory: H1; result: falsified; evidence: Focused candidate-vector proof passed and representative rerun test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json reported pendingAck=0/publication_ack_closed, but rolling-restart stayed red at active_gate_snapshot_coverage with snapshotCoverage=1/5, owner_reconcile_pending, write_deferred, and active_gate_timed_out.; files: src/admin/admin-control-snapshot-class-part-3.js; test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; validation: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --package work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md; next: Update the sprint option set and select an architecture/migration discriminator before any further local runtime package..

## Execution Evidence

- [x] action: implementation; owner: startup_active_gate_owner; files-changed: src/admin/admin-control-snapshot-class-part-3.js, test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js; validation: npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js passed 12/12 and npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-3.js found 0 violations; outcome: validated.
- [x] action: representative-rerun; owner: startup_active_gate_owner; files-changed: test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json; validation: npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-pending-ack-eligibility-20260528T090300Z.report.json --package work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md classified startup_active_gate_owner/snapshot_coverage active_gate_timed_out; outcome: H1-falsified-same-frontier.
- [x] action: verification-fix; owner: startup_active_gate_owner; files-changed: none; validation: npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md passed and git diff --check passed for package-owned files; outcome: validated.

## Validation

1. `npm run work:validate -- --entry work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md`
2. `npm run work:validate -- --pre-impl work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md`
3. `npm test -- test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js`
4. `npm run audit:runtime-grammar:file -- src/admin/admin-control-snapshot-class-part-3.js`
5. `git diff --check -- src/admin/admin-control-snapshot-class-part-3.js test/distributed/harness/__tests__/cluster-control-snapshot-timeout-repair-selected-source-test-cases.js work/packages/active-20260528-rolling-restart-pending-ack-eligibility-contract-proof.md work/sprints/active-2026-q2-rolling-restart-mechanism-first-recovery.md`

## Commit And Push Ledger

1. Focused package commit: 6f9f1b41834579dcee6e308da1dd63e92cfee6fb
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
