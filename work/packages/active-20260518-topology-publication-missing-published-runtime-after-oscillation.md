# Topology Publication Missing Published Runtime After Oscillation

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Human direction selected the canonical continue_local_fix route after the causal oscillation gate; the fresh artifact keeps publication_ack_convergence / topology_publication_owner / publication_convergence first with missing_published_nodes_present, priority witnesses zero, and active-gate runtimePromotionAllowed=false.",
  "nextAction": "Run required review, fix if needed, and implementation subagent sequencing for one bounded topology publication owner runtime slice; keep startup active-gate, operation workflow, readiness, admission, handoff architecture, and timeout ownership frozen unless fresh canonical evidence reselects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-missing-published-runtime-after-oscillation.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
  ],
  "handoffFiles": [
    "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md",
    "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md",
    "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
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
    "work/packages/active-20260518-topology-publication-missing-published-runtime-after-oscillation.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-recovery-gate.js",
    "src/control-plane/publication-recovery-evidence.js",
    "test/control-plane/publication-owner-stream.test.js",
    "test/control-plane/publication-recovery-gate.test.js",
    "test/control-plane/publication-recovery-evidence.test.js"
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
  "representativeResidual": {
    "status": "same-frontier",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Run one bounded topology publication owner runtime successor selected by route-after-rerun after human direction."
  },
  "causalGovernance": {
    "hypothesis": "The fresh artifact still blocks inside topology publication ownership: publication evidence is unknown at epoch 0, pendingAckCount is 0, missingPublishedCount is 5, priority residual witnesses are 0, and active-gate runtime promotion is false. Human direction selected the canonical continue_local_fix route after the causal gate.",
    "stopConditionCheck": "Before runtime edits, use route-after-rerun, evidence-summary, scenario-route, npm run analyze:causal-model, priority residual extraction, owner-files, review/fix sequencing, and focused owner tests to confirm the same owner and boundary.",
    "expectedCausalModelChange": "The runtime slice should reduce or classify the owner-local missing_published_nodes_present publication edge without reinterpreting downstream active-gate, operation workflow, readiness, admission, handoff architecture, or timeout evidence.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json reports active=0/5, snapshotCoverage=0/5, pendingAckCount=0, missingPublishedCount=5, priority residual witnesses=0, active-gate runtimePromotionAllowed=false, and first frontier publication_ack_convergence / topology_publication_owner / publication_convergence.",
    "crossBoundaryReview": "Required before implementation; review subagent must check the closed oscillation gate, predecessor runtime proof, current route evidence, and frozen non-publication boundaries."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart missing-published publication frontier after human-directed oscillation gate",
    "phaseChain": [
      "predecessor UNKNOWN/no-debt runtime slice passed focused owner proof",
      "post-implementation representative returned to missingPublishedCount=5",
      "causal oscillation gate stopped local runtime patching",
      "human direction selected the canonical route-after-rerun continue_local_fix successor",
      "priority residual witnesses remain zero and active-gate runtime promotion remains false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present in test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains deferred on selected_snapshot_source_timeout",
      "operation workflow priority residual witnesses are zero",
      "startup readiness inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "The package must determine the owner-local publication decision that leaves all five active nodes missing from published visibility after the prior UNKNOWN/no-debt publication slice.",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- topology_publication_owner publication_convergence plus focused owner runtime tests over publication owner evidence, decision, recovery gate, and recovery evidence",
    "boundedProgressProof": "Bounded progress mechanism is one runtime-owner-boundary package with required review/fix/implementation subagent sequencing, parent-focused validation, and representative route proof after implementation.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "expectedObservableTransition": "Focused owner proof should change the owner-local missing-published outcome; representative proof should reduce missingPublishedCount or publication convergence state, migrate, close green, or trigger a renewed architecture/human gate.",
    "maxProgressBound": "one bounded runtime owner slice before another representative rerun or architecture/human gate",
    "sameFrontierFallback": "If the same missing-published frontier persists without concrete metric or state reduction, stop for architecture or human escalation instead of opening another local runtime patch.",
    "expectedNextFrontier": "reduced publication frontier, migrated owner boundary, representative green, or renewed architecture/human gate",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md / topology_publication_owner / publication_convergence / human-directed-runtime-successor",
      "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Runtime work is allowed only because human direction selected the canonical continue_local_fix route after the same-frontier oscillation gate.",
    "handoffInvariant": "Startup active-gate runtime, operation workflow, startup readiness, active-gate admission, handoff architecture, and timeout budgets stay frozen unless fresh canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "route-after-rerun keeps topology_publication_owner / publication_convergence selected",
      "dominant reason is missing_published_nodes_present",
      "priority residual witnesses are zero",
      "active-gate runtimePromotionAllowed=false",
      "human direction selected continuing the sprint through a bounded runtime successor"
    ],
    "choices": [
      {
        "id": "human-directed-runtime-successor",
        "summary": "Run one bounded topology publication owner runtime successor under normal runtime-owner-boundary sequencing.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
        ]
      }
    ],
    "selectedChoice": "human-directed-runtime-successor",
    "nextAction": "Run review subagent first, fix if required, then implementation subagent for this runtime successor."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "missing_published_nodes_present",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "One bounded topology publication owner runtime slice should reduce missingPublishedCount or publication convergence state, migrate to a new owner boundary, reach representative green, or trigger a renewed architecture/human gate with concrete evidence.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "predecessor": "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md"
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

- Canonical outcome: topology_publication_owner / publication_convergence emits the package outcome for missing_published_nodes_present.
- Inputs/signals: test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown; npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json; npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown.
- State model or invariant: Collect evidence, normalize one topology_publication_owner / publication_convergence snapshot, then use one explicit state model, decision table, or invariant to emit one canonical outcome and reasons.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: startup active-gate runtime; operation workflow / rebalancer_handoff runtime; startup readiness runtime; active-gate admission; handoff architecture; timeout budgets.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`
- Expected delta: One bounded topology publication owner runtime slice should reduce missingPublishedCount or publication convergence state, migrate to a new owner boundary, reach representative green, or trigger a renewed architecture/human gate with concrete evidence.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `missing_published_nodes_present`
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

1. work/packages/active-20260518-topology-publication-missing-published-runtime-after-oscillation.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl
6. src/control-plane/publication-owner-evidence.js
7. src/control-plane/publication-owner-decision.js
8. src/control-plane/publication-recovery-gate.js
9. src/control-plane/publication-recovery-evidence.js
10. test/control-plane/publication-owner-stream.test.js
11. test/control-plane/publication-recovery-gate.test.js
12. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. startup active-gate runtime
2. operation workflow / rebalancer_handoff runtime
3. startup readiness runtime
4. active-gate admission
5. handoff architecture
6. timeout budgets

## Model Fit

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-topology-publication-missing-published-runtime-after-oscillation.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `handoff architecture`, `timeout budgets`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [ ] Agent <name> (<agent-id>) <role> context loaded: scope and blocker confirmed; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> probe complete: state/cause confirmed or contradicted; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> validation complete: package proof refreshed; evidence: commands and results; next: final handoff or successor action.

## Subagent Attempt Ledger

Required when subagent sequencing is required. Each real subagent records attempt status, last checkpoint, parent action, evidence, and next step. Interrupted or partial-unvalidated attempts must be followed by a superseded/discarded/revalidated checked line before closure.

- [ ] Agent <name> (<agent-id>) <role> attempt: status: <started|running|interrupted|partial-unvalidated|validated|superseded>; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> attempt: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown
3. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json
4. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-no-debt-pending-runtime-20260518T141836Z.report.json --markdown
