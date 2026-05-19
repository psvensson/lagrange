# Topology Publication Classified Backpressure Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-19",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The predecessor diagnostic gate selected topology_publication_owner / publication_convergence as the bounded runtime successor. Fresh representative evidence keeps publication_ack_convergence first with publication_pending, while the operation_workflow_owner / workflow_progress residual is classified backpressure rather than the next local patch target.",
  "nextAction": "Run required review/fix/implementation subagent sequencing, then implement one bounded publication-convergence runtime slice for the classified-backpressure publication_pending shape.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/active-20260519-topology-publication-classified-backpressure-runtime.md",
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
    "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md",
    "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260519-topology-publication-classified-backpressure-runtime.md",
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
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe",
      "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "accept_classified_backpressure",
    "stopMode": "classified_backpressure",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Resolve or correctly defer publication_ack_convergence while priority recovery is classified backpressure; reduce publication_pending/missingPublished, migrate owner boundary, or turn rolling-restart green.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Resolve or correctly defer publication_pending while priority recovery is classified backpressure."
  },
  "causalGovernance": {
    "hypothesis": "Publication convergence is the local runtime owner for the fresh classified-backpressure shape: publication_ack_convergence is still the failed invariant, and operation workflow is a bounded backpressure witness rather than the next patch target.",
    "stopConditionCheck": "Use `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, handoff probe, focused owner tests, static guardrails, representative rerun, and `npm run analyze:causal-model -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json` before closure.",
    "expectedCausalModelChange": "Reduce publication_pending or missingPublished, migrate owner boundary, or turn rolling-restart green while keeping priority recovery backpressure classified instead of reopening operation workflow.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact has publicationStatus=OPEN, pendingAckCount=0, missingPublishedCount=4, one operation_workflow_owner / workflow_progress event-driven persisted_not_dispatched witness, and active-gate owner_reconcile_pending with runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Do not edit operation workflow, startup active-gate, readiness, admission, handoff, or timeout runtime unless fresh proof reselects those owners."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart after publication/workflow backpressure diagnostic gate",
    "phaseChain": [
      "selected-source retry migrated to operation workflow progress",
      "operation workflow proof passed locally but representative stayed same-frontier",
      "diagnostic gate classified operation workflow as backpressure",
      "publication_ack_convergence remains the failed invariant and selected runtime successor"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json.",
    "knownDownstreamBlockers": [
      "operation_workflow_owner / workflow_progress persisted_not_dispatched witness is classified backpressure",
      "active-gate owner_reconcile_pending has runtimePromotionAllowed=false",
      "startup readiness inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "Publication convergence must either resolve the OPEN/missingPublished publication_pending shape or emit a structured defer/contract outcome that keeps classified operation workflow backpressure from reopening as the local owner.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe",
    "boundedProgressProof": "Bounded publication convergence proof should move the reconcile/defer/advance mechanism for the classified-backpressure publication_pending shape.",
    "boundedProgressProofArtifact": "work/packages/active-20260519-topology-publication-classified-backpressure-runtime.md and test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json",
    "expectedObservableTransition": "publication_pending or missingPublished reduces, owner boundary migrates, or rolling-restart turns green",
    "maxProgressBound": "one topology_publication_owner / publication_convergence runtime slice",
    "sameFrontierFallback": "If focused proof passes but representative rerun returns unchanged publication_pending with no metric reduction, stop for architecture or human escalation instead of another local publication patch.",
    "expectedNextFrontier": "topology_publication_owner / publication_convergence until fresh evidence proves otherwise",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-startup-active-gate-selected-snapshot-source-timeout-runtime.md / startup_active_gate_owner / snapshot_coverage / migrated",
      "work/packages/done-20260519-operation-workflow-progress-advance-existing-operation-runtime.md / operation_workflow_owner / workflow_progress / same-frontier",
      "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md / topology_publication_owner / publication_convergence / classification-only"
    ],
    "oscillationCheck": "Allowed only because the predecessor diagnostic architecture gate selected publication-convergence-successor from fresh classified-backpressure evidence.",
    "handoffInvariant": "Operation workflow remains classified backpressure and active-gate runtime promotion remains false unless fresh evidence changes owner or required action."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "predecessor diagnostic gate selected publication-convergence-successor",
      "fresh scenario route keeps publication_ack_convergence first",
      "causal model classifies priority recovery as backpressure",
      "same-frontier operation workflow proof did not reduce the residual witness"
    ],
    "choices": [
      {
        "id": "publication-convergence-successor",
        "summary": "Execute one bounded topology_publication_owner / publication_convergence runtime slice for the classified-backpressure publication_pending shape.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "architecture-gap-stop",
        "summary": "Stop local runtime patching if the focused probe cannot name a publication-owned progress or defer mechanism.",
        "route": "architecture-package",
        "proof": [
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "publication-convergence-successor",
    "nextAction": "Run required review/fix/implementation subagent sequencing before runtime edits."
  },
  "predecessor": "work/packages/done-20260519-topology-publication-workflow-backpressure-architecture-gate.md"
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
- Inputs/signals: test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe; npm run analyze:owner-files -- topology_publication_owner publication_convergence.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: accept_classified_backpressure.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run required review/fix/implementation subagent sequencing, then implement one bounded publication-convergence runtime slice for the classified-backpressure publication_pending shape. | Resolve or correctly defer publication_ack_convergence while priority recovery is classified backpressure; reduce publication_pending/missingPublished, migrate owner boundary, or turn rolling-restart green. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`
- Success metrics: Resolve or correctly defer publication_ack_convergence while priority recovery is classified backpressure; reduce publication_pending/missingPublished, migrate owner boundary, or turn rolling-restart green.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Expected delta: Resolve or correctly defer publication_ack_convergence while priority recovery is classified backpressure; reduce publication_pending/missingPublished, migrate owner boundary, or turn rolling-restart green.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `accept_classified_backpressure`
- Stop mode: `classified_backpressure`
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
- Owned files: `work/packages/active-20260519-topology-publication-classified-backpressure-runtime.md`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-evidence.js`, `src/control-plane/publication-active-gate-handoff-contract.js`, `src/control-plane/membership-publication-coordinator-class-stage-2.js`, `src/control-plane/active-node-projection.js`, `test/control-plane/publication-recovery-evidence.test.js`, `test/control-plane/membership-publication-coordinator-main-stage-2.js`, `test/control-plane/publication-active-gate-handoff-contract.test.js`, `test/control-plane/publication-owner-stream.test.js`
- Forbidden files: operation workflow, startup active-gate, readiness, admission, handoff, and timeout runtime unless fresh evidence reselects them.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-workflow-progress-proof-20260519T073539Z.report.json --handoff-probe
3. npm run analyze:owner-files -- topology_publication_owner publication_convergence
