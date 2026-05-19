# Topology Publication Owner Recovery Wake Queue Causal Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Scaffolded from representative evidence for publication_ack_convergence.",
  "nextAction": "Run a causal escalation gate for the remaining active-gate publication handoff write_deferred enqueue=false edge, proving whether src/control-plane/membership-publication-coordinator-class-stage-3.js should enter a successor runtime package.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/active-20260519-topology-publication-remaining-node-reconcile-runtime.md",
    "work/packages/done-20260519-topology-publication-remaining-node-causal-gate.md",
    "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md",
    "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/membership-publication-coordinator-class-stage-3.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "allowedDecisionDepth": "planning and route selection; split executable children before implementation",
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
      "Use this package for route selection, owner/boundary decisions, and stop rules.",
      "Create Spark-safe mechanical or test-only children once execution is unambiguous.",
      "Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected."
    ]
  },
  "representativeResidual": {
    "status": "classification-only",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "frontier": "topology_publication_owner / publication_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Run a causal escalation gate for the remaining active-gate publication handoff write_deferred enqueue=false edge, proving whether src/control-plane/membership-publication-coordinator-class-stage-3.js should enter a successor runtime package."
  },
  "causalGovernance": {
    "hypothesis": "The remaining enqueue=false write_deferred handoff is no longer proven to be package-owned stage-2 publication writer debt; it may be the owner recovery wake queue admission or merge contract that decides whether the retry is accepted.",
    "stopConditionCheck": "Before any runtime patch, run npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json and prove whether the stage-3 owner recovery wake queue path is the next bounded successor, an owner-boundary migration, an architecture gap, or a human stop. Runtime files stay in candidateRuntimeFiles until this gate selects them.",
    "expectedCausalModelChange": "Select a concrete successor route for membershipPublicationHandoffOutcomeEnqueued=false, or record architecture/human stop before another local runtime package.",
    "representativeOutcome": "classification-only",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json remains red at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending with pendingReconcileCount=1, activeGateOwnerCohortMissingPublishedCount=1, runtimePromotionAllowed=false, and priority residual witnesses=0.",
    "crossBoundaryReview": "The predecessor runtime package exhausted its declared write scope: stage-2 already attempts bounded visible writes and returns write_deferred, while the remaining failed edge points at the stage-3 owner recovery wake queue admission/merge path. Frontier oscillation validation requires this causal-escalation gate before another local runtime patch."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart remaining one-node publication target after owner reconcile runtime handoff",
    "phaseChain": [
      "multi-node owner reconcile runtime reduced pendingReconcileCount from 4 to 1",
      "remaining-node causal gate selected one bounded topology publication owner runtime successor",
      "remaining-node runtime package found package-owned stage-2 code already reaches write_deferred",
      "the next unproven edge is owner recovery wake queue admission/merge visibility for membershipPublicationHandoffOutcomeEnqueued=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=2/5",
      "publicationActiveGateHandoffPendingReconcileCount=1",
      "activeGateOwnerCohortMissingPublishedCount=1",
      "membershipPublicationHandoffOutcomeState=write_deferred",
      "membershipPublicationHandoffOutcomeEnqueued=false",
      "runtimePromotionAllowed=false",
      "priority recovery residual witnesses=0 with splitRequired=false"
    ],
    "missingCausalEdge": "Prove whether the owner recovery wake queue admission/merge path accepts the write_deferred publication handoff retry, rejects it under pressure, or requires an architecture/human stop.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe",
    "boundedProgressProof": "Focused proof must select stage-3 owner recovery wake queue admission as a runtime successor, migrate ownership, or stop before implementation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "expectedObservableTransition": "A successor route is selected for membershipPublicationHandoffOutcomeEnqueued=false, an owner-boundary migration is recorded, or architecture/human stop is recorded.",
    "maxProgressBound": "one causal-escalation gate before another local runtime patch",
    "sameFrontierFallback": "Do not open another local runtime package on the same unchanged artifact until this gate records the selected route.",
    "expectedNextFrontier": "runtime successor package for owner recovery wake queue admission, owner-boundary migration, or architecture/human stop",
    "resultClassification": "classification-only",
    "stopCondition": "architecture-gap-stop",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260519-topology-publication-operation-residual-decision-gate.md / topology_publication_owner / publication_convergence / successor-selected",
      "work/packages/done-20260519-topology-publication-open-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-multi-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-remaining-node-causal-gate.md / topology_publication_owner / publication_convergence / selected-runtime-successor",
      "work/packages/active-20260519-topology-publication-remaining-node-reconcile-runtime.md / topology_publication_owner / publication_convergence / scope-exhausted"
    ],
    "oscillationCheck": "The previous runtime package did not change representative metrics and identified a required file outside its write scope; this package is a causal gate, not another local runtime patch.",
    "handoffInvariant": "Operation workflow, startup active-gate runtime, startup readiness, admission, and timeout budgets remain frozen unless this gate records a supported owner-boundary migration."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "architecture-gap",
    "triggerEvidence": [
      "remaining-node runtime package exhausted its write scope without runtime edits",
      "handoff probe keeps membershipPublicationHandoffOutcomeState=write_deferred and membershipPublicationHandoffOutcomeEnqueued=false",
      "candidate owner recovery wake queue file is outside the predecessor package write scope",
      "frontier oscillation validation requires a causal-escalation gate before another local runtime patch"
    ],
    "choices": [
      {
        "id": "owner-recovery-wake-queue-causal-proof",
        "summary": "Use this causal-escalation package to prove whether the stage-3 owner recovery wake queue admission/merge path is the next runtime successor.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
        ]
      },
      {
        "id": "owner-recovery-wake-queue-runtime-successor",
        "summary": "Open a bounded runtime successor only if the causal proof selects membership-publication stage-3 owner recovery wake queue admission as the next owned mechanism.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "human-escalation",
        "summary": "Stop for human direction if causal proof cannot distinguish queue admission, owner-boundary migration, or architecture contract debt.",
        "route": "human-escalation",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json"
        ]
      }
    ],
    "selectedChoice": "owner-recovery-wake-queue-causal-proof",
    "nextAction": "Run the selected causal proof, keep runtime files in candidateRuntimeFiles, and only open a runtime successor if the proof selects that path."
  },
  "classificationEfficiency": {
    "defaultMode": "separate-package-approved",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
      "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Select whether the remaining owner recovery wake queue admission path is a valid bounded successor, an owner-boundary migration, an architecture gap, or human stop before any new local runtime patch.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  }
}
-->

## Why

The remaining package-owned runtime slice stopped at a write_deferred handoff
with `membershipPublicationHandoffOutcomeEnqueued=false`. This package owns the
causal decision before `membership-publication-coordinator-class-stage-3.js`
can become runtime write scope.

## Scope Basis

AGPL rolling-restart release-gate closure work. Runtime files are candidate
scope only until this causal gate selects a successor route.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run a causal escalation gate for the remaining active-gate publication handoff write_deferred enqueue=false edge, proving whether src/control-plane/membership-publication-coordinator-class-stage-3.js should enter a successor runtime package. | Select whether the remaining owner recovery wake queue admission path is a valid bounded successor, an owner-boundary migration, an architecture gap, or human stop before any new local runtime patch. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json |
| scope boundary | src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Success metrics: Select whether the remaining owner recovery wake queue admission path is a valid bounded successor, an owner-boundary migration, an architecture gap, or human stop before any new local runtime patch.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.


## Classification-Only Fast Path

- Runtime, test, script, and report paths stay out of `writeScope` and `commitScope` until fresh evidence promotes implementation.
- Keep possible implementation files in `candidateRuntimeFiles` only.
- Subagent sequencing is optional while the package remains classification-only and no implementation write scope is present.
- Use 2-3 canonical proof commands, then close and rerun evidence instead of adding more package ceremony.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Expected delta: Select whether the remaining owner recovery wake queue admission path is a valid bounded successor, an owner-boundary migration, an architecture gap, or human stop before any new local runtime patch.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `separate-package-approved`
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

1. work/packages/active-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md
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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260519-topology-publication-owner-recovery-wake-queue-causal-gate.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Model-Fit Split

- Target executor: `gpt-5.3-codex`
- Allowed decision depth: planning and route selection; split executable children before implementation
- Safe to execute when:
1. owner, boundary, write scope, forbidden scope, proof, and kill rule stay as declared
2. the executor does not need to choose architecture, migrate ownership, or reinterpret representative evidence
3. the first focused proof gives a clear pass, fail, or escalate signal
- Split or escalate when:
1. write scope expands beyond the declared lower-model lane
2. proof requires forbidden scope, cross-owner reasoning, or architecture route selection
3. the implementation needs to decide system behavior instead of executing a named local mechanism
- Candidate lower-model child packages:
1. Use this package for route selection, owner/boundary decisions, and stop rules.
2. Create Spark-safe mechanical or test-only children once execution is unambiguous.
3. Create a gpt-5.4 single-file-runtime child only after the runtime owner file is selected.

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-multi-node-reconcile-20260519T105449Z.report.json --markdown
