# Topology Publication Owner Recovery Queue Drain Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The causal gate selected the accepted owner recovery queue drain/retry edge as the bounded local runtime successor. Fresh rolling-restart evidence keeps publication_ack_convergence first with write_deferred#enqueued=true, pendingReconcileCount=2, activeGateOwnerCohortMissingPublishedCount=2, ownerQueue=unknown, and priority residual witnesses=3 with splitRequired=false.",
  "nextAction": "Implement one bounded owner recovery queue drain/retry runtime slice: prove an accepted write_deferred owner recovery queue item either drains to owner reconcile progress or preserves structured retry state after a retryable distributed participant failure, without patching downstream active-gate, readiness, operation-workflow, admission, or timeout paths.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-owner-recovery-queue-drain-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md",
    "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-admission-runtime.md",
    "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-owner-recovery-queue-drain-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "modelFit": {
    "packageClass": "runtime-owner-boundary",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "bounded-owner-runtime/current-frontier",
    "outputProfile": "medium",
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
  "causalGovernance": {
    "hypothesis": "Accepted owner recovery queue admission is observable, but the accepted owner-key item may not drain or preserve retry state after retryable distributed participant failures; the stalled wait evidence still reports ownerQueue=unknown while publication handoff remains pending.",
    "stopConditionCheck": "Before runtime edits, run npm run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json and confirm canonical route remains topology_publication_owner / publication_convergence / publication_pending, priority residual splitRequired=false, and the handoff probe still requires reconcile_owner_membership_publication. Focused proof must show the accepted queue item drains or retains structured retry state after a retryable drain failure.",
    "expectedCausalModelChange": "Accepted owner recovery queue drain either reduces pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount, or replaces ownerQueue=unknown with a structured retryable drain outcome that keeps publication owner retry state explicit.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json remains red at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending with write_deferred#enqueued=true, snapshotCoverageNodeCount=3/5, pendingReconcileCount=2, activeGateOwnerCohortMissingPublishedCount=2, ownerQueue=unknown in the stalled wait evidence, and priority residual witnesses=3 with splitRequired=false.",
    "crossBoundaryReview": "The causal gate selected this package as the bounded local runtime successor after the predecessor reduced wake queue admission. Startup active-gate, startup readiness, operation workflow, admission, and timeout paths remain frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after accepted owner recovery wake queue admission",
    "phaseChain": [
      "multi-node owner reconcile runtime reduced pendingReconcileCount from 4 to 1",
      "owner recovery wake queue admission runtime moved membershipPublicationHandoffOutcomeEnqueued=false to write_deferred#enqueued=true",
      "queue drain causal gate selected a local runtime-owner-boundary successor",
      "fresh representative evidence stays red with pendingReconcileCount=2 and ownerQueue=unknown"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=3/5",
      "publicationActiveGateHandoffPendingReconcileCount=2",
      "activeGateOwnerCohortMissingPublishedCount=2",
      "membershipPublicationHandoffOutcomeState=write_deferred",
      "membershipPublicationHandoffOutcomeEnqueued=true",
      "ownerQueue=unknown",
      "runtimePromotionAllowed=false",
      "priority recovery residual witnesses=3 with splitRequired=false"
    ],
    "missingCausalEdge": "Prove whether an accepted owner recovery queue item drains to owner reconcile progress or remains retryable after retryable distributed participant failures instead of disappearing behind ownerQueue=unknown.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused runtime proof must show accepted owner recovery queue drain success or structured retry preservation for retryable drain failure.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
    "expectedObservableTransition": "pendingReconcileCount or activeGateOwnerCohortMissingPublishedCount reduces, ownerQueue=unknown becomes a structured retryable owner queue drain outcome, the owner boundary migrates, representative evidence turns green, or architecture/human stop is recorded.",
    "maxProgressBound": "one bounded runtime-owner-boundary package before rerun or renewed causal escalation",
    "sameFrontierFallback": "If focused proof cannot show queue drain or structured retry preservation for the accepted owner recovery item, stop instead of patching downstream active-gate symptoms.",
    "expectedNextFrontier": "representative green, reduced publication drain frontier, migrated owner boundary, or architecture/human stop",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md / topology_publication_owner / publication_convergence / selected-runtime-successor",
      "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-admission-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "This runtime package is allowed because the causal-escalation gate selected the accepted owner recovery queue drain edge after the predecessor moved the admission signal.",
    "handoffInvariant": "Operation workflow, startup active-gate runtime, startup readiness, admission, and timeout budgets remain frozen unless fresh representative evidence migrates ownership."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "queue drain causal gate selected this local runtime successor",
      "scenario route remains topology_publication_owner / publication_convergence / publication_pending with continue_local_fix",
      "handoff probe keeps requiredAction=reconcile_owner_membership_publication and runtimePromotionAllowed=false",
      "priority residual witnesses=3 with splitRequired=false"
    ],
    "choices": [
      {
        "id": "owner-recovery-queue-drain-runtime-successor",
        "summary": "Implement the bounded accepted owner recovery queue drain/retry path inside the publication owner boundary.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Stop for human direction if focused proof cannot distinguish queue drain, owner-boundary migration, or architecture contract debt.",
        "route": "human-escalation",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
        ]
      }
    ],
    "selectedChoice": "owner-recovery-queue-drain-runtime-successor",
    "nextAction": "Run required review/fix/implementation sequencing, then implement the bounded owner recovery queue drain/retry runtime slice."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Accepted owner recovery queue admission remains observable and the drain path either reduces pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount, emits a structured retryable owner queue drain outcome instead of ownerQueue=unknown, migrates the owner boundary, turns rolling-restart green, or records architecture/human stop.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

The predecessor made accepted owner recovery queue admission observable, and
the causal gate selected the next local publication-owner edge. This package
owns the bounded runtime proof that an accepted owner-key item either drains or
stays explicitly retryable after retryable distributed participant failure.

## Scope Basis

AGPL rolling-restart release-gate closure work. Runtime changes stay limited
to the publication owner recovery queue drain/retry path and focused queue
tests.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Implement one bounded owner recovery queue drain/retry runtime slice: prove an accepted write_deferred owner recovery queue item either drains to owner reconcile progress or preserves structured retry state after a retryable distributed participant failure, without patching downstream active-gate, readiness, operation-workflow, admission, or timeout paths. | Accepted owner recovery queue admission remains observable and the drain path either reduces pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount, emits a structured retryable owner queue drain outcome instead of ownerQueue=unknown, migrates the owner boundary, turns rolling-restart green, or records architecture/human stop. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence |
| scope boundary | src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Success metrics: Accepted owner recovery queue admission remains observable and the drain path either reduces pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount, emits a structured retryable owner queue drain outcome instead of ownerQueue=unknown, migrates the owner boundary, turns rolling-restart green, or records architecture/human stop.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json`
- Expected delta: Accepted owner recovery queue admission remains observable and the drain path either reduces pendingReconcileCount and activeGateOwnerCohortMissingPublishedCount, emits a structured retryable owner queue drain outcome instead of ownerQueue=unknown, migrates the owner boundary, turns rolling-restart green, or records architecture/human stop.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
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
- Runtime promotion rule: When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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
3. If this package only changes package, sprint, tracker, or ledger files, the next pass must run representative evidence, close as classification-only, open a concrete bug package, or present a human gate.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.
5. For bounded experiments, move quickly inside the inherited owner boundary, but do not merge without the stated focused proof and canonical evidence movement.

## In Scope

1. work/packages/active-20260519-topology-publication-owner-recovery-queue-drain-runtime.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/membership-publication-coordinator-class-stage-3.js
7. src/workflow/owner-key-reconcile-queue.js
8. test/control-plane/membership-publication-coordinator-main-stage-2.js
9. test/workflow/owner-key-reconcile-queue.test.js

## Out Of Scope

1. src/rebalancer/operation-workflow-owner.js
2. startup-active-gate-runtime
3. startup-readiness-runtime
4. admission-runtime
5. timeout-runtime

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-topology-publication-owner-recovery-queue-drain-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/membership-publication-coordinator-class-stage-3.js`, `src/workflow/owner-key-reconcile-queue.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/workflow/owner-key-reconcile-queue.test.js`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown`
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

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json
4. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json
5. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown
