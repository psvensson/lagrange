# Topology Publication Owner Recovery Queue Drain Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Causal proof selected the accepted owner recovery queue drain/retry edge as the bounded local runtime successor while keeping topology_publication_owner / publication_convergence first.",
  "nextAction": "Close this causal gate as classification-only and hand off to work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-runtime.md for required runtime-owner-boundary review/fix/implementation sequencing.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-admission-runtime.md",
    "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
    "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/workflow/owner-key-reconcile-queue.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/workflow/owner-key-reconcile-queue.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "architecture-gap-analysis",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "scenario-causal-escalation",
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
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a bounded runtime-owner-boundary successor for the accepted owner recovery queue drain/retry edge, then run required review/fix/implementation sequencing before runtime edits."
  },
  "causalGovernance": {
    "hypothesis": "Accepted owner recovery queue admission is now observable, but the accepted owner-key item may not drain or preserve retry state after retryable distributed participant failures; the stalled wait evidence still reports ownerQueue=unknown while publication handoff remains pending.",
    "stopConditionCheck": "Before runtime edits, run npm run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json and confirm canonical route remains topology_publication_owner / publication_convergence / publication_pending, priority residual splitRequired=false, and the handoff probe still requires reconcile_owner_membership_publication. After the gate, only open a runtime child if focused proof can show the accepted queue item drains or retains structured retry state after a retryable drain failure.",
    "expectedCausalModelChange": "Selected the accepted owner recovery queue drain/retry edge as the bounded runtime successor candidate while keeping runtime files candidate-only in this gate.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json remains red at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending with write_deferred#enqueued=true, snapshotCoverageNodeCount=3/5, pendingReconcileCount=2, activeGateOwnerCohortMissingPublishedCount=2, ownerQueue=unknown in the stalled wait evidence, and priority residual witnesses=3 with splitRequired=false.",
    "crossBoundaryReview": "The predecessor reduced the wake queue admission edge and proved accepted merge/admission is visible. This package must stay on the publication owner recovery queue drain/retry path; startup active-gate, startup readiness, operation workflow, admission, and timeout paths remain frozen."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after accepted owner recovery wake queue admission",
    "phaseChain": [
      "multi-node owner reconcile runtime reduced pendingReconcileCount from 4 to 1",
      "remaining-node runtime package found stage-2 already reaches write_deferred",
      "owner recovery wake queue admission runtime moved membershipPublicationHandoffOutcomeEnqueued=false to write_deferred#enqueued=true",
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
    "missingCausalEdge": "Selected edge: an accepted owner recovery queue item must drain to owner reconcile progress or remain retryable after retryable distributed participant failures instead of disappearing behind ownerQueue=unknown.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused causal proof selects a runtime-owner-boundary successor for accepted owner recovery queue drain success or structured retry preservation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
    "expectedObservableTransition": "Open a bounded runtime-owner-boundary successor that can prove pendingReconcileCount or activeGateOwnerCohortMissingPublishedCount reduces, ownerQueue=unknown becomes a structured retryable owner queue drain outcome, the owner boundary migrates, representative evidence turns green, or architecture/human stop is recorded.",
    "maxProgressBound": "one bounded causal-escalation gate before selecting a child package, migration, architecture stop, or human stop",
    "sameFrontierFallback": "If focused proof cannot show queue drain or structured retry preservation for the accepted owner recovery item, stop instead of patching downstream active-gate symptoms.",
    "expectedNextFrontier": "runtime successor package for owner recovery queue drain/retry",
    "resultClassification": "classification-only",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-remaining-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / architecture-gap",
      "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md / topology_publication_owner / publication_convergence / selected-runtime-successor",
      "work/packages/done-20260519-topology-publication-owner-recovery-wake-queue-admission-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "This package is allowed because fresh representative evidence moved the predecessor admission signal, but stayed on the same owner boundary with a new accepted-queue drain/retry edge.",
    "handoffInvariant": "Operation workflow, startup active-gate runtime, startup readiness, admission, and timeout budgets remain frozen unless fresh representative evidence migrates ownership."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When this causal gate selects local proof, open a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
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
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-runtime.md"
}
-->

## Why

The predecessor made accepted owner recovery queue admission observable, but
fresh `rolling-restart` evidence still stalls with the accepted handoff pending.
This package owns the next bounded publication-owner edge: the accepted queue
item must drain to owner reconcile progress or remain explicitly retryable after
a retryable drain failure.

## Scope Basis

AGPL rolling-restart release-gate closure work. Runtime changes stay limited
to the publication owner recovery queue drain/retry path and focused owner
queue tests.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: the repeated publication frontier must be routed before another runtime patch; this package selects the next child, migration, architecture stop, or human stop.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run a causal gate for the accepted owner recovery queue drain edge before selecting runtime work. | Accepted owner recovery queue admission remains observable and the gate selects a bounded drain child, owner-boundary migration, architecture stop, or human stop. | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe |
| scope boundary | src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe`
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
- Runtime promotion rule: When this causal gate selects local proof, open a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them.

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

1. work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. src/rebalancer/operation-workflow-owner.js
2. startup-active-gate-runtime
3. startup-readiness-runtime
4. admission-runtime
5. timeout-runtime

## Model Fit

- Package class: `architecture-gap-analysis`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `scenario-causal-escalation`
- Output profile: `medium`
- Owned files: `work/packages/done-20260519-topology-publication-owner-recovery-queue-drain-causal-gate.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. route evidence, frontier history, and forbidden scope stay as declared
2. the gate selects a child, migration, architecture stop, or human stop before runtime edits
3. the first focused proof gives a clear pass, fail, or escalation signal
- Split or escalate when:
1. runtime or test behavior changes are needed
2. proof requires forbidden scope or cross-owner implementation
3. the route changes owner, boundary, stop condition, or human decision point
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-wake-queue-admission-20260519T135719Z.report.json

## Commit And Push Ledger

1. Focused package commit: e411d4ae5af983c193c3bfa40852ff2f623517d3
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
