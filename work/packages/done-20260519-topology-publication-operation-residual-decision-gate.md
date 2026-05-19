# Topology Publication Operation Residual Decision Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-19",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative proof after the owner visibility retry stayed at publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending. Route-after-rerun and causal-model still select a local publication owner blocker, but priority recovery residual extraction now reports three operation_workflow_owner / rebalancer_handoff witnesses. This package is the metadata-only architecture decision gate required before another runtime patch.",
  "nextAction": "Close this gate and open one runtime-owner-boundary successor for continued topology_publication_owner / publication_convergence work; keep operation workflow residuals frozen as non-splitting residual evidence unless fresh canonical routing reselects them.",
  "proof": [
    "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260519-topology-publication-operation-residual-decision-gate.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
    "work/packages/done-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/done-20260519-topology-publication-operation-residual-decision-gate.md",
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
    "separatePackageReason": "architecture-or-human-stop",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json"
    ],
    "decisionRecord": "Fresh same-frontier evidence after a focused publication owner retry produced a contradiction: canonical route remains topology_publication_owner / publication_convergence, while priority residual extraction reports three operation_workflow_owner / rebalancer_handoff witnesses. Record the architecture decision before selecting another runtime package.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Runtime files remain out of this gate's writeScope and move only into the selected runtime-owner-boundary successor."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Open one bounded topology_publication_owner / publication_convergence runtime successor; representative proof should reduce missingPublished/pendingReconcileCount, migrate, green, or trigger architecture/human stop.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open one runtime-owner-boundary successor for topology_publication_owner / publication_convergence; keep operation workflow frozen unless fresh routing reselects it."
  },
  "causalGovernance": {
    "hypothesis": "The first frontier is still publication_ack_convergence / topology_publication_owner / publication_convergence, but the same-frontier result after focused proof and the reappearing operation workflow witnesses mean the next move must be selected by architecture evidence rather than another automatic publication patch.",
    "stopConditionCheck": "Use route-after-rerun, topology handoff probe, priority residual extraction, and npm run analyze:causal-model on the fresh artifact before selecting a successor.",
    "expectedCausalModelChange": "Select continued publication owner work from stable route evidence; do not change runtime in this package.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Focused owner visibility retry proof passed, but representative rolling-restart stayed red with publicationStatus=OPEN, publicationEpoch=2, missingPublishedCount=4, publishedActiveNodeIds=1/5, snapshotCoverageNodeCount=2/5, handoffOutcome=write_deferred, pendingReconcileCount=4, and three operation_workflow_owner / rebalancer_handoff priority residual witnesses.",
    "crossBoundaryReview": "Compare publication producer debt, active-gate runtimePromotionAllowed=false consumer state, operation workflow recovering_in_flight residuals, and stale-evidence possibilities before assigning successor files."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart same-frontier after owner visibility retry",
    "phaseChain": [
      "owner visibility retry package added a bounded second owner write/visibility read and focused proof passed",
      "fresh representative rerun stayed at publication_ack_convergence / publication_pending",
      "handoff probe reports active-gate runtimePromotionAllowed=false with four pending owner reconcile nodes",
      "priority residual extractor reports three operation_workflow_owner / rebalancer_handoff recovering_in_flight witnesses"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains deferred at 2/5",
      "publication-active-gate handoff pendingReconcileCount=4",
      "operation_workflow_owner / rebalancer_handoff has three recovering_in_flight retry_scheduled witnesses"
    ],
    "missingCausalEdge": "The sprint must decide whether publication convergence still owns the multi-node OPEN/write_deferred shape, whether operation workflow progress is the hidden producer needed for publication, or whether the boundary between the two owners needs an architecture contract.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
    "boundedProgressProof": "Bounded architecture decision proof; runtime files stay out of this package writeScope until the gate selects a concrete wake, retry, reconcile, drain, dispatch, delivery, timer, advance, or other bounded progress mechanism in a successor.",
    "boundedProgressProofArtifact": "work/packages/done-20260519-topology-publication-operation-residual-decision-gate.md and test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
    "expectedObservableTransition": "Close this gate with a selected successor route and open exactly one next package.",
    "maxProgressBound": "one causal architecture package before runtime implementation resumes",
    "sameFrontierFallback": "If the gate cannot select one route from the fresh artifact, escalate to architecture/human stop instead of local runtime patching.",
    "expectedNextFrontier": "selected successor package or architecture stop",
    "resultClassification": "same-frontier",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260519-topology-publication-open-handoff-write-deferred-runtime.md / topology_publication_owner / publication_convergence / reduced-focused-proof",
      "work/packages/done-20260519-topology-publication-owner-reconcile-write-deferred-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json / operation_workflow_owner / rebalancer_handoff / residual-witnesses=3"
    ],
    "oscillationCheck": "Triggered by same-frontier after a focused publication owner proof and changed priority residual evidence.",
    "handoffInvariant": "Do not edit publication, active-gate, operation-workflow, readiness, admission, or timeout runtime until this architecture gate chooses one bounded route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun keeps topology_publication_owner / publication_convergence / publication_pending",
      "handoff probe reports write_deferred owner_reconcile_pending with runtimePromotionAllowed=false and pendingReconcileCount=4",
      "priority residual extraction reports three operation_workflow_owner / rebalancer_handoff recovering_in_flight witnesses",
      "focused owner visibility retry proof passed but representative rerun did not reduce, migrate, or green"
    ],
    "choices": [
      {
        "id": "continue-publication-owner-runtime",
        "summary": "Open one more bounded topology publication owner runtime package only if the fresh cross-boundary evidence proves the operation workflow residuals are downstream or diagnostic.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe"
        ]
      },
      {
        "id": "migrate-operation-workflow-runtime",
        "summary": "Open an operation_workflow_owner / rebalancer_handoff scenario package if the priority residuals prove operation progress is the missing producer for publication convergence.",
        "route": "owner-boundary-migration",
        "proof": [
          "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
          "npm run analyze:owner-files -- operation_workflow_owner rebalancer_handoff"
        ]
      },
      {
        "id": "cross-owner-contract-package",
        "summary": "Open an architecture package if publication and operation workflow evidence are both true and the missing contract is between owner progress and publication visibility.",
        "route": "architecture-package",
        "proof": [
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence"
        ]
      }
    ],
    "selectedChoice": "continue-publication-owner-runtime",
    "nextAction": "Close this architecture gate and open the bounded runtime-owner-boundary successor before runtime implementation starts."
  },
  "closed": "2026-05-19",
  "commitAndPushLedgerRequired": true
}
-->

## Why

The previous runtime package passed focused proof, but fresh representative
`rolling-restart` stayed on the same publication frontier and the priority
residual extractor now reports operation workflow witnesses again. This package
owns the architecture decision before any further runtime files are edited and
selects a bounded publication-owner successor because canonical route and
causal evidence still keep publication as the first local blocker.

## Scope Basis

AGPL rolling-restart release-gate closure work. No product-edition feature
scope changes.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: select the next route for the fresh `rolling-restart` residual. From this artifact, the selected route is continued publication owner runtime.
- Inputs/signals: `route-after-rerun`, `analyze:topology-convergence -- --handoff-probe`, `analyze:priority-recovery-residuals`, and `analyze:causal-model` over `test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`.
- State model or invariant: route owner/boundary stays publication first, handoff runtime promotion remains false, and priority residuals are present with `splitRequired=false`. Because causal-model keeps `publication_ack_blocked` as the dominant local blocker and priority recovery is classified in the topology handoff probe, emit `continue-publication-owner-runtime`.
- Non-goals and forbidden interpretations: do not edit runtime, tests, report code, timeout budgets, readiness, active-gate admission, or operation workflow from this package. Do not treat active-gate snapshot coverage as owner-selected while runtime promotion is false.
- Proof mapping: canonical extractors must support the selected route; closure proof is package validation plus current-blocker refresh, not representative green.
- Wrong-slice trigger: if a fresh artifact reselects `operation_workflow_owner / rebalancer_handoff`, reports priority residual `splitRequired=true`, or moves runtime promotion to active-gate, stop this route and migrate instead of patching publication.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | publication remains the canonical first frontier | keep publication as candidate route | successor must reduce publication pending, migrate, green, or stop | `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending` |
| handoff contract | runtimePromotionAllowed=false; pendingReconcileCount=4 | active-gate remains downstream while owner reconcile is pending | freeze active-gate runtime | no active-gate runtime promotion from this gate | `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe` |
| priority residuals | 3 operation_workflow_owner / rebalancer_handoff witnesses | operation workflow may be a producer dependency despite publication first frontier | compare migration vs downstream residual | selected successor names whether operation workflow is owner or frozen residual | `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json` |
| focused proof history | owner retry proof passed, representative same-frontier | another automatic local patch violates the stop rule | architecture decision gate | selected route before runtime edit | `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json` |

- Anti-symptom rationale: This package selects the semantic owner before any code changes; it does not patch downstream active-gate, readiness, timeout, or operation workflow symptoms while publication remains first.
- Falsifying focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`
- Competing explanations: publication owner debt; operation workflow producer debt hidden behind publication; cross-owner contract gap; stale report projection.
- Systemic interaction scan: Check publication producer, operation workflow progress, active-gate consumer promotion, retry/lifecycle, and evidence projection before assigning the successor owner.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Required; this package must choose local owner-boundary work, owner-boundary migration, cross-owner architecture work, or stop.
- Competing hypotheses: publication_pending is broader publication owner debt; operation workflow recovering_in_flight is the missing producer; both are true and require a shared contract; stale evidence is mixing satisfied topology with residual operation details.
- Pre-edit focused probe: `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`
- Success metrics: close this gate and open one runtime-owner-boundary successor; the successor must reduce `missingPublishedCount=4`, reduce `pendingReconcileCount=4`, migrate, green, or stop.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`
- Expected delta: open one bounded topology publication owner runtime successor; no runtime delta is claimed by this package.
- Local proof class: causal architecture proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and pre-implementation validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `architecture-or-human-stop`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: Same-frontier after focused proof plus reappearing priority residual witnesses required an explicit architecture gate; the gate selects continued publication owner runtime because route-after-rerun and causal-model keep publication first and priority residuals do not split.
- Successor action: `open-runtime-owner-boundary`
- Runtime promotion rule: Runtime files remain out of this gate and move only into the selected runtime-owner-boundary successor.

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

1. Package, sprint, current-blocker, and model-ledger edits needed to record the architecture decision.
2. Canonical extractor proof over the fresh representative artifact.
3. One selected successor package route: `topology_publication_owner / publication_convergence`.

## Out Of Scope

1. Runtime, test, script, report, timeout, readiness, active-gate, and operation workflow code changes.
2. Representative-green claims.
3. Operation workflow runtime edits from this gate; they require fresh route migration or `splitRequired=true`.

## Model Fit

- Package class: `causal-escalation`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `cross-boundary-architecture-gate/fresh-frontier`
- Output profile: `medium`
- Owned files: `work/packages/<this-package>.md`
- Forbidden files: `src/`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json --handoff-probe
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-owner-reconcile-write-deferred-20260519T100837Z.report.json

## Commit And Push Ledger

1. Focused package commit: e63211b9
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
