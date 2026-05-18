# Topology Publication Owner Publishing Visibility

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "The predecessor classifier selected a bounded same-owner publication runtime successor. The representative artifact remains red with publicationStatus=OPEN, publicationEpoch=1, publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, and unavailable publication owner ack/revision evidence; active-gate and operation workflow remain frozen.",
  "nextAction": "Run required review/fix sequencing, then implement one bounded topology publication owner slice for OPEN epoch-1 publishing visibility and missing published active nodes.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-owner-publishing-visibility.md",
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
    "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md",
    "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md",
    "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json"
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
    "work/packages/active-20260518-topology-publication-owner-publishing-visibility.md",
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
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "outputProfile": "medium",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Run required review/fix sequencing, then implement the bounded publication owner publishing-visibility slice."
  },
  "causalGovernance": {
    "hypothesis": "The selected local blocker is now the same-owner topology publication runtime path: OPEN epoch-1 publication has publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, and unavailable owner ack/revision evidence after stale zero-gap priority-spread debt was reduced.",
    "stopConditionCheck": "Before implementation, rerun scenario-route, evidence-summary, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files, package doctor, and required subagent sequencing. Runtime edits must stay inside the declared topology publication owner files.",
    "expectedCausalModelChange": "Focused publication owner proof should reduce OPEN publishing/missingPublished evidence, migrate from fresh canonical evidence, classify a narrower publication owner stop, or escalate without reopening active-gate, operation workflow, readiness, admission, handoff architecture, or timeout budgets.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative remains red at active=0/5 and snapshotCoverage=3/5. Publication is OPEN at epoch 1 with publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, publicationOwnerAckState=unavailable, publicationOwnerRevisionState=unavailable, and publicationOwnerStreamOutcome=publishing. Active-gate consumer evidence is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false; priority residual extraction reports four rebalancer_handoff witnesses with splitRequired=false.",
    "crossBoundaryReview": "Required before implementation because this runtime successor follows a causal-escalation classifier and adjacent publication-active-gate handoff work."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication owner publishing visibility after same-owner classifier",
    "phaseChain": [
      "same-frontier publication-active-gate handoff proof closed with missingEdge=null",
      "zero-gap priority-spread publication slice reduced downstream evidence",
      "classifier selected bounded same-owner publication runtime successor",
      "active-gate runtimePromotionAllowed remains false",
      "priority residual extraction reports rebalancer_handoff witnesses with splitRequired=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json.",
    "knownDownstreamBlockers": [
      "representative failed 0/1 at active=0/5 and snapshotCoverage=3/5",
      "publicationStatus is OPEN at publicationEpoch=1 with publishedActive=1/5 and four missing published nodes",
      "publication owner ack and revision evidence are unavailable while owner stream outcome is publishing",
      "active-gate snapshot coverage is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false",
      "priority residual extraction reports four operation_workflow_owner / rebalancer_handoff retry-scheduled witnesses with splitRequired=false"
    ],
    "missingCausalEdge": "Determine why the publication owner remains OPEN/publishing with missing published active nodes and unavailable owner ack/revision evidence after stale priority-spread debt was reduced.",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- topology_publication_owner publication_convergence",
    "boundedProgressProof": "The predecessor classifier bounded this as a same-owner publication runtime successor and kept active-gate, operation workflow, readiness, admission, handoff architecture, and timeout budgets frozen.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md plus test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "expectedObservableTransition": "Focused owner proof should reduce missingPublishedCount, change publication owner ack/revision availability, migrate from fresh canonical evidence, or stop with a narrower publication owner reason.",
    "maxProgressBound": "one bounded topology_publication_owner / publication_convergence runtime slice",
    "sameFrontierFallback": "If the focused proof cannot reduce OPEN publishing, missingPublishedCount=4, prioritySpreadPending=true, or unavailable owner ack/revision evidence, stop as same-frontier or human escalation instead of patching active-gate, operation workflow, readiness, admission, handoff architecture, or timeout budgets.",
    "expectedNextFrontier": "publication owner publishing visibility reduced, migrated, narrowed, or representative-green",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md / topology_publication_owner / publication_convergence / same-frontier"
    ],
    "oscillationCheck": "Causal-escalation remains active because repeated publication-frontier packages have not produced representative green; this package must reduce or narrow the same-owner runtime path before any boundary migration.",
    "handoffInvariant": "Active-gate consumer runtime, operation workflow, startup readiness, active-gate admission, handoff architecture, and timeout budgets stay frozen unless canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "watching",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "frontier returned to a recently closed related boundary",
      "classifier selected same-owner publication runtime successor",
      "active-gate and operation workflow evidence remain frozen"
    ],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "Watch for another same-frontier result; present a gate only if this bounded runtime slice cannot reduce, migrate, or narrow the publication owner blocker."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md"
}
-->

## Why

The predecessor classifier selected a bounded same-owner runtime successor.
This package owns the publication owner path for OPEN epoch-1 publishing
visibility, missing published active nodes, and unavailable owner
ack/revision evidence. It must not reopen active-gate, operation workflow,
readiness, admission, handoff architecture, or timeout budgets from the same
artifact.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: topology publication owner emits a single outcome for
  OPEN epoch-1 publishing visibility and missing published active nodes:
  reduced, migrated, narrowed same-frontier, architecture/human escalation, or
  representative-green.
- Inputs/signals: representative artifact
  `test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`;
  scenario-route; evidence-summary; handoff-probe; causal-model; priority
  residual extraction; owner-files; focused publication owner tests.
- State model or invariant: collect publication status, epoch, published
  active membership, missing published nodes, owner ack/revision/stream
  availability, priority spread, and deferred handoff state into one normalized
  publication snapshot before selecting one outcome and reason set.
- Non-goals and forbidden interpretations: do not treat deferred active-gate
  consumer evidence, subordinate rebalancer_handoff witnesses, readiness
  stalls, admission, handoff architecture, or timeout budgets as authority for
  this package.
- Proof mapping: focused owner tests must prove the selected publication
  decision boundary; static guardrails apply to touched runtime files; fresh
  representative or canonical extractor proof must record reduced, migrated,
  narrowed, same-frontier, architecture/human escalation, or green.
- Wrong-slice trigger: stop or split if proof requires files outside the
  declared topology publication owner scope or cannot distinguish producer
  publication debt from deferred consumer evidence.

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

1. work/packages/active-20260518-topology-publication-owner-publishing-visibility.md
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
5. timeout budgets
6. handoff architecture

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-topology-publication-owner-publishing-visibility.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this causal-escalation package may edit
topology publication owner runtime and test files.

- [ ] Review subagent recorded: pending-before-review.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation-starts.

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [ ] Review role pending: evidence: not-run; next: assign fresh review subagent before implementation.
- [ ] Fix role pending: evidence: not-run; next: run only if review finds fixes.
- [ ] Implementation role pending: evidence: not-run; next: run after review/fix proof is clean.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
