# Topology Publication Remaining Owner Reconcile Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Fresh representative evidence keeps publication_ack_convergence first on topology_publication_owner / publication_convergence / publication_pending with OPEN epoch 1, missingPublishedCount=4, pendingReconcileCount=2, active-gate disagreementNodes=1, and runtimePromotionAllowed=false.",
  "nextAction": "Run required review/fix/implementation sequencing, then isolate and reduce the remaining producer/active-gate publication mismatch without editing downstream owners.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe",
    "npm test -- test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js",
    "npm run test:static"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-remaining-owner-reconcile-runtime.md",
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
    "work/packages/done-20260518-topology-publication-pending-owner-reconcile-runtime.md",
    "work/packages/done-20260518-topology-publication-missing-published-runtime-after-oscillation.md",
    "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md",
    "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md",
    "test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "candidateRuntimeFiles": [],
  "commitScope": [
    "work/packages/active-20260518-topology-publication-remaining-owner-reconcile-runtime.md",
    "work/packages/done-20260518-topology-publication-pending-owner-reconcile-runtime.md",
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
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
      "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe",
      "npm test -- test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js"
    ],
    "decisionRecord": "Record classification in the current package or sprint edge card; open a separate classifier only for material route, owner, boundary, stop-condition, tracker-truth, or successor-selection changes.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "When canonical owner and boundary are stable, prefer a runtime-owner-boundary successor and keep runtime files in candidateRuntimeFiles until that package activates them."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Reduce pending reconcile nodes, missingPublishedCount, or active-gate disagreementNodes; migrate owner boundary; or turn representative rolling-restart green. Same-frontier without concrete reduction stops for architecture or human escalation.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "update Sprint Strategy Brief and Current Edge Card from the route result",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --pre-impl"
    ]
  },
  "causalGovernance": {
    "hypothesis": "The active successor owns one bounded topology_publication_owner / publication_convergence slice because route-after-rerun keeps the first frontier on publication_pending while downstream active-gate, workflow, readiness, admission, handoff architecture, and timeout evidence remains frozen.",
    "stopConditionCheck": "Use npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json plus the handoff probe, distributed failure extractor, and focused owner tests before successor runtime edits.",
    "expectedCausalModelChange": "Focused implementation should reduce the remaining producer/active-gate publication mismatch before active-gate or workflow consumers can be selected.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh artifact reports topology_publication_owner / publication_convergence / publication_pending first frontier, publicationStatus=OPEN, publicationEpoch=1, publishedActive=1/5, missingPublishedCount=4, priority residual witnesses=0, active-gate runtimePromotionAllowed=false, active-gate disagreementNodes=1, and owner reconcile pending for nodes 11601fe0-72d6-5853-8590-ec2881853e72 and 35a891b8-c1a0-5064-9c6e-2acfba61c2a7.",
    "crossBoundaryReview": "Required before implementation: review must confirm non-publication owner files remain forbidden and the active route is still the human-directed runtime successor."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart remaining publication_pending owner reconcile runtime successor",
    "phaseChain": [
      "the predecessor reduced active-gate disagreementNodes from 3 to 1",
      "fresh route evidence keeps publication_ack_convergence first",
      "handoff probe reports no missing edge and active-gate runtimePromotionAllowed=false",
      "priority residual witnesses remain zero",
      "this runtime package is limited to the remaining publication owner producer/active-gate mismatch"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json.",
    "knownDownstreamBlockers": [
      "startup active-gate snapshot coverage remains deferred on owner_reconcile_pending and snapshot repair",
      "operation workflow priority residual witnesses are zero",
      "startup readiness inherits active-gate no-progress evidence"
    ],
    "missingCausalEdge": "Determine whether publication owner reconcile can advance or close the remaining OPEN epoch-1 publication_pending producer/active-gate mismatch for the two pending reconcile nodes.",
    "missingCausalEdgeProbe": "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe",
    "boundedProgressProof": "Bounded reconcile progress is one publication-owner runtime slice with focused owner tests before any representative rerun.",
    "boundedProgressProofArtifact": "work/packages/active-20260518-topology-publication-remaining-owner-reconcile-runtime.md and test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json",
    "expectedObservableTransition": "Successor proof must reduce pending reconcile nodes, reduce missingPublishedCount, reduce active-gate disagreementNodes, migrate owner boundary, or turn representative rolling-restart green.",
    "maxProgressBound": "one runtime-owner-boundary package before architecture or human escalation if publication_pending is unchanged",
    "sameFrontierFallback": "If fresh representative evidence returns publication_pending without concrete metric or state reduction, stop for architecture or human escalation instead of opening another local runtime patch.",
    "expectedNextFrontier": "reduced publication_pending, migrated owner boundary, representative green, or architecture/human escalation",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-no-debt-pending-runtime.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-missing-published-oscillation-gate.md / topology_publication_owner / publication_convergence / human-directed-runtime-successor",
      "work/packages/done-20260518-topology-publication-missing-published-runtime-after-oscillation.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-pending-owner-reconcile-runtime.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "This runtime successor is allowed only because the closed causal gate selected the continue-local-proof route and the predecessor produced concrete metric reduction.",
    "handoffInvariant": "Do not edit startup active-gate, operation workflow, readiness, admission, handoff architecture, or timeout files unless fresh canonical evidence migrates the owner boundary."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "closed causal gate selected human-directed-runtime-successor",
      "predecessor runtime slice reduced active-gate disagreementNodes from 3 to 1",
      "route-after-rerun keeps topology_publication_owner / publication_convergence / publication_pending",
      "priority residual witnesses are zero",
      "active-gate runtimePromotionAllowed=false",
      "owner reconcile remains pending for two publication nodes"
    ],
    "choices": [
      {
        "id": "human-directed-runtime-successor",
        "summary": "Execute one bounded remaining publication-owner runtime slice while keeping non-publication owners frozen.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json"
        ]
      }
    ],
    "selectedChoice": "human-directed-runtime-successor",
    "nextAction": "Run required review/fix/implementation sequencing before runtime edits."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-pending-owner-reconcile-runtime.md"
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
- Inputs/signals: test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json; npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown; npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe; npm test -- test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js; npm run test:static.
- State model or invariant: The topology_publication_owner / publication_convergence decision table in the Causal Decision Contract maps publication_pending and route evidence to one emitted outcome: continue_local_fix.
- Non-goals and forbidden interpretations: Do not reinterpret downstream evidence, widen forbidden boundaries, or patch symptoms outside this package. Forbidden scope: startup active-gate runtime; operation workflow / rebalancer_handoff runtime; startup readiness runtime; active-gate admission; handoff architecture; timeout budgets.
- Proof mapping: Implementation and tests must prove the topology_publication_owner / publication_convergence invariant before representative or closure proof is accepted.
- Wrong-slice trigger: Stop or split if the canonical outcome changes owner, boundary, required action, or needs files outside the declared scope.

## Causal Decision Contract

| Signal | Normalized value | Owner interpretation | Emitted outcome | Expected delta | Disproof probe |
| --- | --- | --- | --- | --- | --- |
| route owner/boundary | topology_publication_owner / publication_convergence / publication_pending | topology_publication_owner owns this decision before downstream consumers reinterpret it | Run required review/fix/implementation sequencing, then isolate and reduce the remaining producer/active-gate publication mismatch without editing downstream owners. | Reduce pending reconcile nodes, missingPublishedCount, or active-gate disagreementNodes; migrate owner boundary; or turn representative rolling-restart green. Same-frontier without concrete reduction stops for architecture or human escalation. | npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown |
| scope boundary | startup active-gate runtime; operation workflow / rebalancer_handoff runtime; startup readiness runtime; active-gate admission; handoff architecture; timeout budgets | proof that needs forbidden scope means this package is the wrong slice | stop, split, or migrate owner boundary | no widened runtime scope inside this package | npm run work:advance -- --check |

- Anti-symptom rationale: This package changes or classifies topology_publication_owner / publication_convergence directly; it does not patch downstream symptoms or widen forbidden scope.
- Falsifying focused probe: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`
- Competing explanations: At minimum compare publication_pending against downstream symptom lag, stale instrumentation, and wrong-owner routing before implementation.
- Systemic interaction scan: Check producer, consumer, admission/gating, retry/lifecycle, and evidence-generation effects before assigning the next owner slice.
- Ping-pong stop rule: Do not bounce between adjacent owners on the same unchanged artifact; require fresh representative evidence, a concrete metric reduction, owner/boundary migration proof, or architecture/human stop before another local patch.
- Oscillation guard: If fresh representative evidence returns the same frontier or another symptom-shaped result, the next package must show concrete reduction, migration, green, or an architecture/human stop before another local patch.

## Decision Experiment Gate

- Decision question: Does topology_publication_owner / publication_convergence still own publication_pending, and what exact producer, consumer, or contract fact must move before implementation is justified?
- Architecture review: Before runtime edits, confirm whether this is still a local owner-boundary route, an owner-boundary migration, an architecture/contract gap, or a human route.
- Competing hypotheses: publication_pending is real owner debt; the visible symptom is downstream lag; instrumentation or stale evidence is misleading; a different owner boundary owns the next move.
- Pre-edit focused probe: `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe`
- Success metrics: Reduce pending reconcile nodes, missingPublishedCount, or active-gate disagreementNodes; migrate owner boundary; or turn representative rolling-restart green. Same-frontier without concrete reduction stops for architecture or human escalation.; at least one concrete metric, count, frontier, migration, or representative-green condition must move.
- Representative rerun: `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending`
- Kill rule: If fresh representative evidence returns the same frontier and dominant reason with no concrete metric reduction, stop for architecture or human escalation instead of opening another local patch.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json`
- Expected delta: Reduce pending reconcile nodes, missingPublishedCount, or active-gate disagreementNodes; migrate owner boundary; or turn representative rolling-restart green. Same-frontier without concrete reduction stops for architecture or human escalation.
- Local proof class: focused owner or diagnostic proof only; it is not representative-green proof.
- Representative proof class: fresh representative rerun or canonical route-after-rerun result.
- Stop if unchanged: same-frontier with no concrete metric or shape reduction triggers architecture or human escalation instead of another local patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json`
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

1. work/packages/active-20260518-topology-publication-remaining-owner-reconcile-runtime.md
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
- Owned files: `work/packages/active-20260518-topology-publication-remaining-owner-reconcile-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `handoff architecture`, `timeout budgets`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe`, `npm test -- test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js`, `npm run test:static`
- Model ledger advisory: `escalate`

## Subagent Progress And Attempt Ledger

Required when subagent sequencing is required. Each real subagent appends one checked checkpoint after every completed subtask; this combined ledger satisfies both Progress and Attempt proof when the item includes status, last checkpoint, parent action, evidence, and next or blocker.
Review agents may directly fix metadata-only package, sprint, tracker, current-blocker, ledger, or handoff findings and record `review-fixed-metadata-only`; runtime, test, script, report, or non-metadata fixes still require a separate fix subagent.

- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: started; last checkpoint: context loaded; parent action: pending; evidence: package, sprint, and handoff files read; next: first focused probe.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: running; last checkpoint: probe complete; parent action: pending; evidence: command and result; next: edit, validate, or blocker handoff.
- [ ] Agent <name> (<agent-id>) <role> checkpoint: status: validated; last checkpoint: package proof refreshed; parent action: revalidated; evidence: commands and results; next: final handoff or successor action.
- [ ] Agent <name> (<agent-id>) <role> recovery: status: superseded; last checkpoint: replaced interrupted or partial-unvalidated attempt; parent action: superseded; evidence: superseding proof; next: continue from clean checkpoint.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
2. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-owner-reconcile-narrowing-20260518T171916Z.report.json --handoff-probe
3. npm test -- test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js
4. npm run test:static
