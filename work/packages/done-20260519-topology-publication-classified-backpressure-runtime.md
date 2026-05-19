# Topology Publication Classified Backpressure Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence after this package reduced the classified-backpressure shape: operation workflow is satisfied, priority recovery residual witnesses are 0, missingPublishedCount is 0, and publication_ack_convergence still blocks on publication_pending because the publication-to-active-gate reconcile contract is absent.",
  "nextAction": "Close this package as reduced, then open a bounded topology_publication_owner / publication_convergence successor for publication_ack_to_active_gate_reconcile_missing.",
  "proof": [
    "npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-owner-stream.test.js",
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-owner-stream.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
    "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md",
    "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-evidence.js",
    "src/control-plane/publication-active-gate-handoff-contract.js",
    "src/control-plane/membership-publication-coordinator-class-stage-2.js",
    "src/control-plane/active-node-projection.js",
    "test/control-plane/publication-recovery-evidence.test.js",
    "test/control-plane/membership-publication-coordinator-main-stage-2.js",
    "test/control-plane/publication-active-gate-handoff-contract.test.js",
    "test/control-plane/publication-owner-stream.test.js"
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
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "This package reduced the prior classified-backpressure shape and selected a bounded successor for publication_ack_to_active_gate_reconcile_missing.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a bounded publication-convergence successor for publication_ack_to_active_gate_reconcile_missing."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence is the local runtime owner for the fresh classified-backpressure shape: publication_ack_convergence is still the failed invariant, and operation workflow is a bounded backpressure witness rather than the next patch target.",
    "stopConditionCheck": "Focused proof passed, and the fresh representative rerun at test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json reduced the old operation-workflow backpressure shape. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json`, route-after-rerun, and the handoff probe now select publication_ack_to_active_gate_reconcile_missing under the same topology_publication_owner / publication_convergence boundary.",
    "expectedCausalModelChange": "Achieved reduction: priority recovery residual witnesses are 0, operation workflow is satisfied, and missingPublishedCount is 0. The remaining causal debt is a publication-owned active-gate reconcile contract, not the prior operation-workflow handoff leg.",
    "representativeOutcome": "reduced",
    "causalDebt": "Fresh artifact has publicationStatus=unknown, publicationPending=true, pendingAckCount=0, missingPublishedCount=0, priority recovery satisfied, activeGateState=timed_out, snapshotCoverageNodeCount=0/5, and handoffContract.state=absent with resultClassification=publication_ack_to_active_gate_reconcile_missing.",
    "crossBoundaryReview": "Open the publication-convergence successor for the missing publication-to-active-gate reconcile contract before editing operation workflow, startup active-gate, readiness, admission, or timeout runtime."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication/workflow backpressure diagnostic gate",
    "phaseChain": [
      "selected-source retry migrated to operation workflow progress",
      "operation workflow proof passed locally but representative stayed same-frontier",
      "diagnostic gate classified operation workflow as backpressure",
      "publication_ack_convergence remains the failed invariant and selected runtime successor"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json.",
    "knownDownstreamBlockers": [
      "priority recovery is satisfied with zero residual witnesses",
      "active-gate snapshot coverage is blocked by selected_snapshot_source_timeout",
      "publication-active-gate handoff contract is absent and runtimePromotionAllowed=false",
      "startup readiness inherits active-gate snapshot timeout evidence"
    ],
    "missingCausalEdge": "Publication convergence must emit a structured publication-to-active-gate reconcile contract for the publication_pending/unpublished-observation shape now that operation workflow backpressure is drained.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe",
    "boundedProgressProof": "This package proved the publication-owned operation workflow handoff reconcile/advance slice and moved the representative shape to publication_ack_to_active_gate_reconcile_missing.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md and test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json",
    "expectedObservableTransition": "priority recovery satisfied, residual witness count reduced to 0, missingPublishedCount reduced to 0, and successor selected for the absent publication-active-gate reconcile contract",
    "maxProgressBound": "one topology_publication_owner / publication_convergence runtime slice",
    "sameFrontierFallback": "If focused proof passes but representative rerun returns unchanged publication_pending with no metric reduction, stop for architecture or human escalation instead of another local publication patch.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence / publication_ack_to_active_gate_reconcile_missing until fresh evidence proves otherwise",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md / operation_workflow_owner / workflow_progress / same-frontier",
      "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "Allowed only because the predecessor diagnostic architecture gate selected publication-convergence-successor from fresh classified-backpressure evidence.",
    "handoffInvariant": "Operation workflow is satisfied in the fresh artifact; active-gate runtime promotion remains false until the publication-owned reconcile contract exists."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "predecessor diagnostic gate selected publication-convergence-successor",
      "fresh scenario route keeps publication_ack_convergence first",
      "causal model classifies priority recovery as backpressure",
      "same-frontier operation workflow proof did not reduce the residual witness",
      "fresh representative rerun after this package reduced priority recovery residuals to 0 and selected publication_ack_to_active_gate_reconcile_missing"
    ],
    "choices": [
      {
        "id": "publication-convergence-successor",
        "summary": "Open one bounded topology_publication_owner / publication_convergence runtime slice for publication_ack_to_active_gate_reconcile_missing.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop local runtime patching if the focused probe cannot name a publication-owned progress or defer mechanism.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "publication-convergence-successor",
    "nextAction": "Close this package as reduced and open the bounded publication-active-gate reconcile successor."
  },
  "predecessor": "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md",
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260519-topology-publication-active-gate-reconcile-runtime.md"
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
- Inputs/signals: test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json; test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json; npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe.
- State model or invariant: The topology_publication_owner / publication_convergence decision table maps publication_pending plus classified operation-workflow backpressure to a publication-owned handoff outcome; the representative rerun reduces the shape and selects the missing active-gate reconcile contract as the successor.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Close this package as reduced and open the publication-active-gate reconcile successor. | Priority recovery satisfied, residual witnesses reduced to 0, missingPublishedCount reduced to 0, and publication_ack_to_active_gate_reconcile_missing selected for the successor. | npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Success metrics: Priority recovery residual witnesses reduce to 0, missingPublishedCount reduces to 0, owner boundary migrates, or rolling-restart turns green; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Expected delta: Reduced the prior classified-backpressure shape; fresh representative proof at `test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json` selects publication_ack_to_active_gate_reconcile_missing for the successor.
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

1. Focused package-owned edit.

## Out Of Scope

1. Runtime ownership changes.

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/active-node-projection.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-owner-stream.test.js`
- Forbidden files: operation workflow, startup active-gate, readiness, admission, handoff, and timeout runtime unless fresh evidence reselects them.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-owner-stream.test.js`, `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: context loaded; parent action: accepted; evidence: `npm run work:subagent-prompt -- --role review --package work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md`, active package, predecessor, sprint, and current-blocker files read; next: package doctor for active package.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review falsification checkpoint: status: validated; last checkpoint: wrong-slice check prepared; parent action: accepted; wrong-slice evidence would be route owner/boundary/dominant reason changing away from `topology_publication_owner / publication_convergence / publication_pending`, predecessor proof failing, or sprint/current-blocker selecting a different next action; evidence: generated review prompt and package metadata identify `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json` as the routing artifact; next: run capped review commands.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: active package doctor complete; parent action: accepted; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md` failed because Subagent Sequencing Ledger is required; next: review-fixed-metadata-only sequencing ledger repair.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: predecessor package doctor complete; parent action: accepted; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md` passed with classification-only fast path and selected architecture gate guidance; next: scenario-route verification.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: scenario route complete; parent action: accepted; evidence: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence` passed with route `topology_publication_owner / publication_convergence / publication_pending`, causal outcome `accept_classified_backpressure`, and `witnessCount=1`; next: metadata-only sprint snapshot consistency repair.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: metadata-only sprint snapshot repair complete; parent action: accepted; evidence: `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md` now marks the older Current Blocker Snapshot and Sprint Architecture Decision Gate as historical/superseded by the current edge card, and records candidate runtime files as none recorded; next: pre-implementation validation.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: pre-implementation validation attempted; parent action: accepted; evidence: `npm run work:validate -- --pre-impl work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md` failed because Subagent Sequencing Ledger needed checked review/fix labels; next: review-fixed-metadata-only sequencing ledger shape repair.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: pre-implementation validation retried; parent action: accepted; evidence: `npm run work:validate -- --pre-impl work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md` failed until the review result was recorded as `fixes-required` to match the review-fixed-metadata-only fix; next: final validation.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: `npm run work:validate -- --pre-impl work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md` passed; next: final handoff for implementation subagent.
- [x] Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) review checkpoint: status: validated; last checkpoint: final metadata consistency repair; parent action: revalidated; evidence: `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md` now labels the stale blocker snapshot as historical; next: final handoff for implementation subagent.
- [x] Agent Pauli (019e3f45-e7e0-72a2-8e61-74f4eab0a0d2) implementation checkpoint: status: validated; last checkpoint: context and implementation prompt loaded; parent action: accepted; evidence: `npm run work:context`, compact LLM steering pack, `npm run work:llm-start`, `npm run work:model-ledger -- summary`, and `npm run work:subagent-prompt -- --role implementation --package work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md`; next: wrong-slice focused probes.
- [x] Agent Pauli (019e3f45-e7e0-72a2-8e61-74f4eab0a0d2) implementation falsification checkpoint: status: validated; last checkpoint: wrong-slice check complete; parent action: accepted; wrong-slice evidence would be route owner/boundary/dominant reason changing away from `topology_publication_owner / publication_convergence / publication_pending`, the handoff probe selecting active-gate or operation workflow as the runtime owner instead of publication-owned structured defer/contract output, or required edits outside the package write scope; evidence: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence` passed with route unchanged and causal outcome `accept_classified_backpressure`; `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe` reported `publication_operation_workflow_handoff_leg_missing`, `requiredProgressMechanism=advance`, and `runtimePromotionAllowed=false`; `npm run analyze:owner-files -- topology_publication_owner publication_convergence` completed; next: implement the bounded publication-convergence contract slice.
- [x] Agent Pauli (019e3f45-e7e0-72a2-8e61-74f4eab0a0d2) implementation checkpoint: status: partial-unvalidated; last checkpoint: runtime patch present after worker shutdown; parent action: pending; evidence: worker was closed after touching `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-recovery-evidence.test.js`, package ledger, and sprint handoff without final validation handoff; next: parent review and focused proof before any commit.
- [x] Agent Pauli (019e3f45-e7e0-72a2-8e61-74f4eab0a0d2) implementation checkpoint: status: validated; last checkpoint: parent focused proof revalidated after partial shutdown; parent action: revalidated; evidence: `npm test -- test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-recovery-evidence.test.js`, `node scripts/check-guideline-literals.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js`, `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js`, and `npm run audit:runtime-grammar:file -- src/control-plane/publication-active-gate-handoff-contract.js src/control-plane/publication-recovery-evidence.js` passed; next: complete package proof and record implementation sequencing.
- [x] Agent Noether (536d3b6a-dc48-49c9-8aad-444b26a6704b) implementation checkpoint: status: superseded; last checkpoint: publication-convergence contract slice implemented and focused tests passing under a superseded worker identity; parent action: superseded; evidence: parent retained Pauli as the implementation proof, reran focused TAP and static guardrails locally, and recorded Pauli validated above; next: package and runtime guardrail validation.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) reviewed work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: review-fixed-metadata-only by Agent Feynman (019e3ef2-5028-7d61-8fd1-c653a7f83285) for work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md; scope: metadata-only package/sprint/tracker/handoff edits.
- [x] Implementation subagent recorded: Agent Pauli (019e3f45-e7e0-72a2-8e61-74f4eab0a0d2) implemented work/packages/done-20260519-topology-publication-classified-backpressure-runtime.md; parent revalidated focused proof: yes.

## Validation

1. npm test -- test/control-plane/publication-recovery-evidence.test.js test/control-plane/membership-publication-coordinator-main-stage-2.js test/control-plane/publication-active-gate-handoff-contract.test.js test/control-plane/publication-owner-stream.test.js
2. npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-workflow-handoff-20260519T083006Z.report.json

## Commit And Push Ledger

- [x] Focused package commit: `efebc03f`
- [x] Pushed to: `origin/codex/pending-ack-eligibility-filter`
- [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes
