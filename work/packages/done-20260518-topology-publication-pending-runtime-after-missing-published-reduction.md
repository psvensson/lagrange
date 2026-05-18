# Topology Publication Pending Runtime After Missing Published Reduction

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence reduced the missing_published_nodes_present package but returned to a recently closed same-owner publication_pending frontier; package doctor flags this as frontier oscillation before another local runtime patch.",
  "nextAction": "Causal gate selects the route-after-rerun local runtime path; close this gate and open a bounded runtime-owner-boundary successor for topology_publication_owner / publication_convergence / publication_pending.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json"
  ],
  "writeScope": [
    "work/packages/done-20260518-topology-publication-pending-runtime-after-missing-published-reduction.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-topology-publication-missing-published-runtime-after-oscillation.md",
    "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md",
    "test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260518-topology-publication-pending-runtime-after-missing-published-reduction.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
  ],
  "modelFit": {
    "packageClass": "causal-escalation-owner-handoff",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Classify the publication_pending oscillation before another local runtime patch."
  },
  "causalGovernance": {
    "hypothesis": "The sprint reduced the stale count-only missing-published artifact shape, but the fresh representative frontier returned to topology_publication_owner / publication_convergence / publication_pending, a recently closed same-owner frontier. The next decision is whether this is expected bounded progress toward publication reconcile or another oscillation that needs architecture or human escalation.",
    "stopConditionCheck": "Use route-after-rerun, evidence-summary, scenario-route, npm run analyze:causal-model, priority residual extraction, and recent package history before selecting another runtime implementation package.",
    "expectedCausalModelChange": "This package should not change runtime; it should classify whether the returned publication_pending frontier has a concrete reduced shape that permits one more bounded runtime successor or requires architecture/human escalation.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json reports publicationStatus=OPEN, publicationEpoch=1, publishedActive=1/5, snapshotCoverage=3/5, priority residual witnesses=0, active-gate runtimePromotionAllowed=false, and handoff pending owner reconcile for two nodes.",
    "crossBoundaryReview": "Required before any new runtime-owner-boundary implementation package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication_pending after missing-published reduction",
    "phaseChain": [
      "focused missing-published normalization passed local owner tests",
      "representative rerun reduced the stale count-only missing-published shape",
      "fresh artifact returned to publication_pending inside the same owner and boundary",
      "priority residual witnesses remain zero",
      "active-gate runtime promotion remains false and owner reconcile is pending"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains deferred on snapshot_coverage_incomplete and snapshot_repair_deferred",
      "operation workflow priority residual witnesses are zero",
      "startup readiness inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "The sprint needs to decide whether returned publication_pending with owner reconcile pending is bounded publication progress or an oscillating same-owner frontier that should not receive another local runtime patch.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --handoff-probe",
    "boundedProgressProof": "Bounded progress mechanism is stopped runtime patching after the reduced representative rerun and running this causal gate before another implementation package.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-missing-published-runtime-after-oscillation.md and test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
    "expectedObservableTransition": "This package should select human/architecture escalation, rerun-needed, or explicitly approve a bounded same-owner runtime successor with a concrete expected delta.",
    "maxProgressBound": "one causal-escalation package before any runtime successor",
    "sameFrontierFallback": "If no concrete reduction or selected route is recorded, do not open another local runtime package.",
    "expectedNextFrontier": "selected human/architecture route, rerun-needed decision, or explicitly approved bounded runtime successor",
    "resultClassification": "same-frontier",
    "stopCondition": "human-escalation",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md / topology_publication_owner / publication_convergence / human-directed-runtime-successor",
      "work/packages/done-20260518-topology-publication-missing-published-runtime-after-oscillation.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Fresh representative proof reduced the current package shape but returned to a recently closed publication_pending frontier.",
    "handoffInvariant": "No startup active-gate, operation workflow, readiness, admission, handoff architecture, timeout, or publication runtime edit may start from this package without an explicit selected route."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "package doctor flags the publication_pending successor as frontier oscillation",
      "fresh route remains topology_publication_owner / publication_convergence",
      "priority residual witnesses are zero",
      "active-gate runtimePromotionAllowed=false",
      "owner reconcile remains pending for two nodes"
    ],
    "choices": [
      {
        "id": "human-directed-runtime-successor",
        "summary": "Use the route-after-rerun local fix result and user direction to open one bounded runtime-owner-boundary successor while keeping non-publication owners frozen.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json"
        ]
      }
    ],
    "selectedChoice": "human-directed-runtime-successor",
    "nextAction": "Close this causal gate and open the bounded runtime-owner-boundary successor before runtime implementation starts."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json"
    ],
    "decisionRecord": "A separate causal package is allowed because the fresh representative result returned to a recently closed owner/boundary frontier.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "Runtime files stay in candidateRuntimeFiles until the bounded runtime-owner-boundary successor activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Classify returned publication_pending as bounded progress, rerun-needed, architecture/human escalation, or explicitly approved runtime successor.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260518-topology-publication-pending-owner-reconcile-runtime.md"
}
-->

## Why

State the focused concern and why this package owns it.

## Scope Basis

Approved maintenance scope or roadmap row.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for publication_pending.
- Inputs/signals: test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json.
- State model or invariant: The topology_publication_owner / publication_convergence decision table maps publicationStatus=OPEN, publicationEpoch=1, publishedActive=1/5, priority residual witnesses=0, runtimePromotionAllowed=false, and pending owner reconcile for two nodes to one emitted outcome: human-directed-runtime-successor.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: startup active-gate runtime; operation workflow / rebalancer_handoff runtime; startup readiness runtime; active-gate admission; handoff architecture; timeout budgets.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route-after-rerun owner boundary | topology_publication_owner / publication_convergence / publication_pending | publication owner remains first frontier; active-gate and operation workflow are downstream | human-directed-runtime-successor | successor reduces publication_pending, migrates, greens, or triggers architecture/human gate | npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown |
| handoff probe | missingEdge=null; runtimePromotionAllowed=false; pending reconcile count=2 | existing handoff contract is present and downstream runtime edits remain forbidden | keep startup active-gate and operation workflow frozen until publication owner changes | no active-gate or workflow runtime promotion from this package | npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --handoff-probe |

- Anti-symptom rationale: This package does not patch downstream symptoms; it classifies the returned publication_pending same-owner frontier and opens one bounded successor because route-after-rerun selected continue_local_fix.
- Falsifying focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --handoff-probe`
- Competing explanations: H1 publication reconcile is still the real producer frontier; H2 startup active-gate is only reflecting downstream snapshot coverage; H3 the artifact is stale or instrumentation is under-reporting publication acknowledgements; H4 the owner boundary should migrate only if fresh route-after-rerun leaves topology_publication_owner.
- Systemic interaction scan: Check publication producer state, acknowledgement consumer convergence, startup active-gate promotion, operation workflow priority residuals, and report-generation freshness before assigning another owner slice.
- Ping-pong stop rule: Do not bounce from publication to active-gate or workflow on the unchanged artifact; require a fresh representative rerun, concrete publication metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: Because this is a returned same-frontier publication oscillation, the successor must stop if the next representative run leaves publication_pending without concrete metric or state reduction.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json`
- Expected delta: Reduce publication_pending or owner reconcile debt, migrate owner boundary, reach representative green, or trigger a renewed architecture/human gate with concrete evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json`
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

1. work/packages/done-20260518-topology-publication-pending-runtime-after-missing-published-reduction.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

## Out Of Scope

1. startup active-gate runtime
2. operation workflow / rebalancer_handoff runtime
3. startup readiness runtime
4. active-gate admission
5. handoff architecture
6. timeout budgets

## Model Fit

- Package class: `causal-escalation-owner-handoff`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/done-20260518-topology-publication-pending-runtime-after-missing-published-reduction.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `handoff architecture`, `timeout budgets`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json`
- Model ledger advisory: `escalate`

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-missing-published-normalization-20260518T155705Z.report.json

## Commit And Push Ledger

1. Focused package commit: 0000000
2. Pushed to: origin/codex/pending-ack-eligibility-filter
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
