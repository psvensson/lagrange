# Topology Publication Same Frontier Architecture Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Architecture gate selected a bounded runtime successor: canonical routing remains topology_publication_owner / publication_convergence / publication_pending, publication is OPEN with publishedActive=1/5 and missingPublished=4, active-gate owner_reconcile_pending is downstream with runtimePromotionAllowed=false, and rebalancer_handoff retry witnesses remain residual evidence rather than the first frontier.",
  "nextAction": "Close this architecture gate and open a runtime-owner-boundary successor focused on the topology publication OPEN publishing to owner-reconcile path.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "work/packages/done-20260518-topology-publication-pressure-stability-runtime.md",
    "work/packages/superseded-20260518-topology-publication-no-debt-handoff-runtime.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "cross-boundary-architecture-gate/fresh-frontier",
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
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json"
    ],
    "decisionRecord": "Fresh same-frontier evidence after pressure proof received its architecture gate; route-after-rerun and handoff proof select one bounded same-owner runtime successor while keeping active-gate and operation-workflow runtime frozen.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open one bounded topology publication owner runtime successor for the OPEN publishing to owner-reconcile path; representative proof should then reduce missingPublished/owner_reconcile_pending, migrate, green, or trigger renewed architecture/human escalation.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The fresh pressure-stability rerun is not solved by pressure grammar alone. The architecture gate classifies the first frontier as topology_publication_owner / publication_convergence / publication_pending; active-gate owner reconcile and rebalancer_handoff retry witnesses are downstream/residual until publication owner OPEN publishing advances the owner-reconcile path.",
    "stopConditionCheck": "Use npm run analyze:causal-model -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json with route-after-rerun, handoff probe, priority residual extraction, evidence summary, and distributed failure summary before adding runtime write scope.",
    "expectedCausalModelChange": "Select one next owner route and prevent another same-frontier local publication patch without cross-boundary proof.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Focused pressure proof passed, but representative routing stayed at publication_convergence / publication_pending with publication OPEN, missingPublished=4, active-gate owner_reconcile_pending=4, snapshotCoverage=2/5, active=0/5, and four operation_workflow_owner / rebalancer_handoff retry-scheduled witnesses.",
    "crossBoundaryReview": "Compare publication owner producer state, active-gate owner reconcile state, operation workflow residuals, and stale instrumentation before selecting runtime ownership."
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a bounded runtime-owner-boundary successor for topology_publication_owner / publication_convergence / publication_pending focused on OPEN publication feeding owner reconcile."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart fresh same-frontier architecture gate",
    "phaseChain": [
      "pressure-stability package added focused pressure_deferred owner/gate grammar",
      "fresh representative rerun did not surface pressure_deferred as the representative route",
      "publication_convergence remained first frontier with OPEN publication and missingPublished=4",
      "active-gate owner reconcile and rebalancer_handoff residuals are both visible downstream"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage deferred at 2/5",
      "active-gate owner_reconcile_pending for four publication nodes",
      "operation_workflow_owner / rebalancer_handoff has four retry_scheduled witnesses"
    ],
    "missingCausalEdge": "Selected edge: OPEN publication/missingPublished=4 remains the producer owner route; active-gate owner reconcile and operation-workflow rebalancer handoff remain downstream/residual on this artifact.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe",
    "boundedProgressProof": "Causal architecture proof selected a same-owner runtime successor for the OPEN publication to owner-reconcile progress mechanism; runtime files stay out of this package writeScope and move only into the successor package.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-same-frontier-architecture-gate.md and test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json",
    "expectedObservableTransition": "Close this package as successor-selection and open one runtime-owner-boundary successor.",
    "maxProgressBound": "one causal architecture package before runtime owner-boundary implementation resumes",
    "sameFrontierFallback": "If this architecture proof cannot select one owner route from fresh evidence, stop for human escalation instead of local patching.",
    "expectedNextFrontier": "bounded same-owner runtime successor",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-pressure-stability-runtime.md / topology_publication_owner / publication_pressure_stability / same-frontier",
      "work/packages/superseded-20260518-topology-publication-no-debt-handoff-runtime.md / topology_publication_owner / publication_convergence / superseded",
      "work/packages/done-20260518-topology-publication-remaining-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Triggered after pressure-stability focused proof did not move representative routing.",
    "handoffInvariant": "Do not edit publication, active-gate, operation-workflow, readiness, admission, or timeout runtime until this architecture gate chooses one bounded route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun on the fresh artifact keeps publication_convergence / publication_pending",
      "handoff probe reports contract present but active-gate owner_reconcile_pending=4 with runtimePromotionAllowed=false",
      "priority residual extraction reports four operation_workflow_owner / rebalancer_handoff retry_scheduled witnesses",
      "pressure_deferred focused proof did not reduce or migrate representative routing"
    ],
    "choices": [
      {
        "id": "bounded-publication-owner-runtime-successor",
        "summary": "Use the fresh artifact to keep topology_publication_owner / publication_convergence as the first frontier and open a bounded runtime successor for OPEN publishing to owner reconcile while keeping active-gate and operation workflow frozen.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe",
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json"
        ]
      }
    ],
    "selectedChoice": "bounded-publication-owner-runtime-successor",
    "nextAction": "Close this architecture gate and open the bounded runtime-owner-boundary successor before runtime implementation starts."
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true
}
-->

## Why

Fresh representative evidence returned the same publication convergence
frontier after the pressure-stability package. This package owns the
cross-boundary architecture decision before runtime work resumes and selects a
bounded same-owner runtime successor.

## Scope Basis

AGPL rolling-restart release-gate closure work. No product-edition feature
scope changes.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json; npm run work:scenario-triage -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --markdown; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --markdown.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending, OPEN publication, downstream active-gate owner reconcile, and residual operation workflow witnesses to one emitted outcome: bounded-publication-owner-runtime-successor.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: none beyond lane and package scope.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner remains first frontier; active-gate and operation workflow are downstream on this artifact | bounded-publication-owner-runtime-successor | successor reduces missingPublished/owner_reconcile_pending, migrates, greens, or triggers renewed architecture/human escalation | npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json |
| scope boundary | lane and package scope only | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Selected local owner-boundary route: publication owner OPEN publishing to owner-reconcile path. Active-gate and operation-workflow runtime remain frozen unless fresh evidence reselects them.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
- Success metrics: The successor should reduce missingPublished=4, reduce active-gate owner_reconcile_pending=4, migrate the first frontier, or green representative rolling-restart; unchanged same-frontier triggers renewed architecture/human escalation.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
- Expected delta: Open one bounded topology publication owner runtime successor for the OPEN publishing to owner-reconcile path.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
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

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-architecture-gate/fresh-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [x] Agent Mill Explorer (019e3eb9-7296-7a52-9405-370c056cbf40) architecture checkpoint: status: `validated`; last checkpoint: architecture route exploration complete; parent action: `accepted`; evidence: explorer found the bounded runtime successor should stay on `topology_publication_owner / publication_convergence`, focused on OPEN publishing to owner-reconcile while active-gate and operation-workflow remain downstream for this artifact; next: close this gate and open the runtime successor.

## Validation

1. `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
2. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json --handoff-probe`
3. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-pressure-stability-20260519T050912Z.report.json`
