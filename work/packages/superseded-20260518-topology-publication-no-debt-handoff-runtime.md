# Topology Publication No Debt Handoff Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "superseded",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
  "supersededByArtifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Metadata-only supersession: the old no-debt handoff artifact was superseded by fresh representative test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json.",
  "nextAction": "Do not perform runtime work in this superseded package; use the fresh pressure-stability representative artifact for successor routing.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --handoff-probe",
    "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json"
  ],
  "writeScope": [
    "work/packages/superseded-20260518-topology-publication-no-debt-handoff-runtime.md"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
    "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md",
    "work/packages/done-20260518-topology-publication-pending-owner-reconcile-runtime.md",
    "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/superseded-20260518-topology-publication-no-debt-handoff-runtime.md"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-handoff-gate/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a runtime patch becomes justified",
      "fresh evidence migrates owner boundary",
      "the handoff probe contradicts route-after-rerun"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --handoff-probe",
      "npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json"
    ],
    "decisionRecord": "Classify the fresh no-debt publication_pending route before any runtime owner-boundary patch because frontier oscillation has returned to the same publication boundary.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Close or migrate the no-debt publication_pending artifact: publicationConvergence is ready locally with missingPublished=0, pendingAck=0, active-gate disagreementNodes=0, but route evidence still marks publication_pending and the handoff probe reports publication_ack_to_active_gate_reconcile_missing.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The fresh no-debt publication_pending route is an oscillation/handoff decision, not an immediate runtime patch: producer debt is zero, active-gate disagreement is zero, and the handoff probe now detects publication_ack_to_active_gate_reconcile_missing.",
    "stopConditionCheck": "Use npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json with route-after-rerun, handoff probe, distributed failure summary, and evidence summary before any runtime edits.",
    "expectedCausalModelChange": "Classify whether publication_pending is stale no-debt owner state, a missing handoff fixture/contract gap, or migrated downstream active-gate snapshot coverage pressure.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Old no-debt artifact reports active=4/5, snapshotCoverage=0/5, publicationConvergence ready in the scenario error, pendingAckCount=0, missingPublishedCount=0, active-gate disagreementNodes=0, pendingReconcileCount=0, and handoff probe result publication_ack_to_active_gate_reconcile_missing while route-after-rerun still selects topology_publication_owner / publication_convergence / publication_pending. It was superseded by fresh representative test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json.",
    "crossBoundaryReview": "Not required in this superseded package because closure is metadata-only and runtime work is out of scope."
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Classify the no-debt publication_pending route and missing publication-to-active-gate reconcile edge before opening runtime implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart no-debt publication_pending handoff gate",
    "phaseChain": [
      "predecessor runtime package projected owner-reconcile narrowing into priorityRecoveryObservation",
      "fresh representative rerun reduced pending ACK, missing-published, pending-reconcile, and active-gate disagreement debt to zero",
      "route-after-rerun still selects publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending",
      "handoff probe detects publication_ack_to_active_gate_reconcile_missing and active-gate snapshot coverage blocked at 0/5"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage is blocked at 0/5 with authoritative_control_snapshot_query_pressure",
      "seed node 7493b0ab-a054-5fad-a91b-5e331db29304 times out readiness",
      "operation workflow priority residual witnesses remain zero"
    ],
    "missingCausalEdge": "Determine whether no-debt publicationPending=true is stale owner evidence, a missing publication-to-active-gate reconcile fixture/contract edge, or a downstream active-gate owner migration.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --handoff-probe",
    "boundedProgressProof": "Causal-escalation reconcile proof only; runtime files remain candidateRuntimeFiles until this package selects the next bounded progress mechanism.",
    "boundedProgressProofArtifact": "work/packages/superseded-20260518-topology-publication-no-debt-handoff-runtime.md and test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json",
    "expectedObservableTransition": "Classify as runtime successor, migrated owner boundary, architecture-gap, same-frontier stop, or representative-green after fresh proof.",
    "maxProgressBound": "one causal-escalation handoff gate before runtime owner-boundary implementation resumes",
    "sameFrontierFallback": "If proof keeps publication_pending unchanged with no concrete route decision, stop for architecture or human escalation instead of another local runtime patch.",
    "expectedNextFrontier": "runtime successor, migrated owner boundary, architecture-gap, human escalation, or representative green",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Frontier returned to a recently closed publication boundary after concrete reduction, so this package must prove the producer-consumer edge before another local runtime patch.",
    "handoffInvariant": "Do not edit publication runtime, startup active-gate runtime, operation workflow runtime, readiness, admission, handoff architecture, or timeout budgets unless this causal gate selects that route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun keeps topology_publication_owner / publication_convergence / publication_pending",
      "handoff probe detects publication_ack_to_active_gate_reconcile_missing",
      "publication debt is zero after predecessor reduction",
      "active-gate snapshot coverage is blocked downstream at 0/5"
    ],
    "choices": [
      {
        "id": "causal-handoff-gate",
        "summary": "Prove the producer-consumer edge and select runtime, migration, architecture-gap, or human route before implementation.",
        "route": "architecture-package",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json"
        ]
      }
    ],
    "selectedChoice": "causal-handoff-gate",
    "nextAction": "Run the causal proof ladder before adding runtime write scope."
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true
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
- Inputs/signals: test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Triage publication_ack_convergence with combined scenario evidence before runtime edits. | Close or migrate the no-debt publication_pending artifact: publicationConvergence is ready locally with missingPublished=0, pendingAck=0, active-gate disagreementNodes=0, but route evidence still marks publication_pending and the handoff probe reports publication_ack_to_active_gate_reconcile_missing. | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`
- Success metrics: Close or migrate the no-debt publication_pending artifact: publicationConvergence is ready locally with missingPublished=0, pendingAck=0, active-gate disagreementNodes=0, but route evidence still marks publication_pending and the handoff probe reports publication_ack_to_active_gate_reconcile_missing.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`
- Expected delta: Close or migrate the no-debt publication_pending artifact: publicationConvergence is ready locally with missingPublished=0, pendingAck=0, active-gate disagreementNodes=0, but route evidence still marks publication_pending and the handoff probe reports publication_ack_to_active_gate_reconcile_missing.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`
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

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

Subagent sequencing is not required for this causal-escalation pure
classification fast path. No checked subagent proof is used for closure.

- [x] Agent Codex GPT-5 (`codex-gpt-5-20260519`) reviewed metadata-only supersession; status: validated; last checkpoint: package-only metadata repair; parent action: accepted; evidence: old no-debt artifact `test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json` is superseded by fresh representative `test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`, representative outcome is `same-frontier`, and no runtime/test/sprint/current-blocker/model-ledger files are in scope; next: parent adds Commit And Push Ledger after focused commit.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --markdown
4. `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` - pass; old no-debt route selected local publication_convergence with zero priority residual witnesses.
5. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json --handoff-probe` - pass; old artifact detected `publication_ack_to_active_gate_reconcile_missing`.
6. `npm run analyze:distributed-failure -- --report test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json` - pass; old artifact failed at active=4/5 and snapshotCoverage=0/5.
7. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-priority-observation-narrowing-20260518T184535Z.report.json` - pass; old artifact classified a local publication ACK blocker.

Supersession note: this package's no-debt handoff artifact is no longer the
latest representative evidence. The pressure-stability rerun
`test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
returned a different same-frontier publication_convergence shape with
publication `OPEN`, missingPublished `4`, owner_reconcile_pending `4`, and four
`operation_workflow_owner / rebalancer_handoff` retry-scheduled witnesses. Use a
fresh causal architecture package from that artifact before another local
runtime patch.
