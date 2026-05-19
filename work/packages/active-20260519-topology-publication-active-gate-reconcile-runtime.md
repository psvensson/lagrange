# Topology Publication Active Gate Reconcile Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence after this package reduced the absent-contract shape: the publication-active-gate handoff contract is present, active-gate observes owner_reconcile_pending for node 35a891b8-c1a0-5064-9c6e-2acfba61c2a7, snapshot coverage improved to 2/5, and publication_ack_convergence now remains blocked by an OPEN epoch-2 write_deferred owner-reconcile shape.",
  "nextAction": "Close this package as reduced, then open a bounded topology_publication_owner / publication_convergence successor for the OPEN epoch-2 handoff write_deferred publication_pending shape.",
  "proof": [
    "npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-owner-stream.test.js",
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md",
    "test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
    "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js"
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "This package reduced the absent publication-active-gate contract edge and selected a bounded successor for the OPEN epoch-2 handoff write_deferred publication_pending shape.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a bounded publication-convergence successor for the OPEN epoch-2 handoff write_deferred publication_pending shape."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence was the local runtime owner for the missing active-gate reconcile contract, and the fresh run proves that edge now exists while the next publication_pending shape remains in the same owner boundary.",
    "stopConditionCheck": "Focused proof passed, and the fresh representative rerun at test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json reduced the absent-contract edge. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe` now reports a handoff contract with state pending, owner_reconcile_pending, nextAction reconcile_owner_membership_publication, pendingReconcileCount=1, and pendingReconcileNodeIds=35a891b8-c1a0-5064-9c6e-2acfba61c2a7. `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json` keeps the route on continue_local_fix for topology_publication_owner / publication_convergence.",
    "expectedCausalModelChange": "Achieved reduction: publication_ack_to_active_gate_reconcile_missing cleared, active-gate snapshot timeout moved from timed_out to stalled/deferred repair, snapshot coverage improved from 0/5 to 2/5, and a concrete owner reconcile handoff outcome is visible.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh artifact has publicationStatus=OPEN, publicationEpoch=2, publicationPending=true, missingPublishedCount=4, publishedActiveNodeIds=1/5, snapshotCoverageNodeCount=2/5, handoffOutcome=write_deferred, handoffContract.state=pending, pendingReconcileCount=1, and priority recovery residual witnesses remain 0.",
    "crossBoundaryReview": "Open the same-owner publication-convergence successor for the OPEN/write_deferred handoff shape before editing operation workflow, startup active-gate, readiness, admission, or timeout runtime."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication workflow handoff reduction",
    "phaseChain": [
      "operation workflow residual drained to zero witnesses",
      "publication_ack_convergence remains the visible first frontier",
      "this package emits the missing publication-active-gate reconcile contract",
      "fresh evidence moves downstream active-gate evidence from timed_out/absent-contract to stalled/deferred owner_reconcile_pending with concrete pendingReconcileNodeIds"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json.",
    "knownDownstreamBlockers": [
      "activeGateState=stalled",
      "snapshotCoverageNodeCount=2/5",
      "snapshot_repair_deferred",
      "handoffContract.state=pending",
      "handoffOutcome=write_deferred"
    ],
    "missingCausalEdge": "The absent publication-active-gate reconcile contract is closed; the remaining causal edge is owner reconciliation for the OPEN epoch-2 write_deferred handoff.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json --handoff-probe",
    "boundedProgressProof": "Bounded publication reconcile proof emitted the contract and moved the consumer to a concrete owner_reconcile_pending handoff with one pending reconcile node.",
    "boundedProgressProofArtifact": "work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md and test-output/reports/rolling-restart-after-active-gate-reconcile-20260519T091127Z.report.json",
    "expectedObservableTransition": "absent handoff contract cleared, snapshot coverage improved to 2/5, and successor selected for OPEN epoch-2 write_deferred owner reconcile.",
    "maxProgressBound": "one topology_publication_owner / publication_convergence runtime slice",
    "sameFrontierFallback": "If the successor focused proof passes but the next representative rerun returns unchanged OPEN/write_deferred publication_pending with no metric reduction, stop for architecture escalation.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence until fresh evidence proves migration to startup_active_gate_owner / snapshot_coverage.",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md / topology_publication_owner / publication_convergence / classification-only",
      "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md / operation_workflow_owner / workflow_progress / same-frontier"
    ],
    "oscillationCheck": "Allowed because the immediate predecessor reduced the operation-workflow residual and fresh evidence named a new publication-owned missing reconcile contract.",
    "handoffInvariant": "Operation workflow stays satisfied/frozen and active-gate runtime promotion stays downstream until publication emits the reconcile contract or fresh evidence migrates ownership."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "immediate predecessor reduced the operation-workflow backpressure shape",
      "fresh route keeps topology_publication_owner / publication_convergence first",
      "handoff probe reports publication_ack_to_active_gate_reconcile_missing",
      "causal model reports continue_local_fix with classified_local_blocker"
    ],
    "choices": [
      {
        "id": "publication-active-gate-reconcile-runtime",
        "summary": "Execute one bounded publication-convergence runtime slice for the missing active-gate reconcile contract.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "architecture-contract-gap-stop",
        "summary": "Stop local runtime patching if focused proof cannot target a publication-owned reconcile contract.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "publication-active-gate-reconcile-runtime",
    "nextAction": "Run required review/fix/implementation subagent sequencing before runtime edits."
  },
  "predecessor": "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md"
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe; npm run analyze:owner-files -- topology_publication_owner publication_convergence; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run required review/fix/implementation subagent sequencing, then implement one bounded publication-owned reconcile contract for publication_ack_to_active_gate_reconcile_missing. | Emit a publication-owned active-gate reconcile contract, reduce publication_pending or active-gate snapshot timeout, migrate owner boundary, or turn rolling-restart green. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence |
| scope boundary | src/rebalancer/operation-workflow-owner.js; startup-active-gate-runtime; startup-readiness-runtime; admission-runtime; timeout-runtime | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Success metrics: Emit a publication-owned active-gate reconcile contract, reduce publication_pending or active-gate snapshot timeout, migrate owner boundary, or turn rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json`
- Expected delta: Emit a publication-owned active-gate reconcile contract, reduce publication_pending or active-gate snapshot timeout, migrate owner boundary, or turn rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json`
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

## In Scope

1. work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-active-gate-handoff-contract.js
7. src/control-plane/publication-recovery-evidence.js
8. src/control-plane/publication-owner-decision.js
9. src/control-plane/membership-publication-coordinator-class-stage-2.js
10. src/control-plane/active-node-projection.js
11. test/control-plane/publication-active-gate-handoff-contract.test.js
12. test/control-plane/publication-recovery-evidence.test.js
13. test/control-plane/publication-owner-stream.test.js
14. test/control-plane/membership-publication-coordinator-main-stage-2.js

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
- Owned files: `work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/active-node-projection.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`
- Forbidden files: `src/rebalancer/operation-workflow-owner.js`, `startup-active-gate-runtime`, `startup-readiness-runtime`, `admission-runtime`, `timeout-runtime`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [x] Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) review checkpoint: status: validated; last checkpoint: context loaded and metadata read; parent action: accepted; evidence: `npm run work:context`, compact steering, active package, predecessor package, sprint, and current-blocker files read; next: capped review probes.
- [x] Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) review checkpoint: status: validated; last checkpoint: package doctor complete; parent action: accepted; evidence: `npm run work:package:doctor -- --suggest work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md` failed only because Subagent Sequencing, Progress, and Attempt ledger proof was missing; next: route and blocker consistency check.
- [x] Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) review falsification checkpoint: status: validated; last checkpoint: wrong-slice check complete; parent action: accepted; wrong-slice evidence would be route owner/boundary/dominant reason changing away from `topology_publication_owner / publication_convergence / publication_pending`, the handoff probe not reporting `publication_ack_to_active_gate_reconcile_missing`, operation workflow residual witnesses reopening, or current-blocker selecting the predecessor package; evidence: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence` passed with route unchanged and priority residual witness count `0`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe` passed with `publication_ack_to_active_gate_reconcile_missing`, operation workflow `satisfied`, and `runtimePromotionAllowed=false`; next: metadata-only blocker and sprint refresh.
- [x] Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) review checkpoint: status: validated; last checkpoint: metadata-only blocker refresh complete; parent action: accepted; evidence: `npm run work:current-blocker -- --write` updated `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, and the sprint Current Edge Card to the active reconcile package and fresh artifact; next: pre-implementation validation.
- [x] Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) review checkpoint: status: validated; last checkpoint: pre-implementation validation complete; parent action: accepted; evidence: `npm run work:package:doctor -- --suggest work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md` passed after metadata-only repairs, and `npm run work:validate -- --pre-impl work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md` passed; next: final handoff for implementation subagent.
- [x] Agent Chandrasekhar (019e3f6e-3053-7120-8972-80807674a181) implementation checkpoint: status: partial-unvalidated; last checkpoint: context, package, compact steering, source map, required pre-edit probes, and runtime patch present after worker shutdown; parent action: pending; evidence: worker edited `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, and this package without final handoff; next: parent focused proof before commit.
- [x] Agent Chandrasekhar (019e3f6e-3053-7120-8972-80807674a181) implementation checkpoint: status: validated; last checkpoint: parent focused proof revalidated partial patch; parent action: revalidated; evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-recovery-evidence.test.js`, `npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-owner-stream.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js`, and `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js` passed; next: package validation and representative rerun.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) reviewed work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: review-fixed-metadata-only by Agent ReviewSubagent (019e3f68-f6c9-7f42-b399-a2545a82c4ab) for work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md; scope: metadata-only package/sprint/tracker/handoff edits.
- [x] Implementation subagent recorded: Agent Chandrasekhar (019e3f6e-3053-7120-8972-80807674a181) implemented work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md; parent revalidated focused proof: yes.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json
4. npm run analyze:owner-files -- topology_publication_owner publication_convergence
