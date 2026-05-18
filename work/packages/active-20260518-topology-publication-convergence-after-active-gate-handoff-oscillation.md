# Topology Publication Convergence After Active Gate Handoff Oscillation

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
  "currentState": "Focused implementation selected a bounded publication owner reduction and the representative rerun remained red but reduced the residual. The latest artifact failed 0/1 at active=0/5 and snapshotCoverage=3/5. Canonical route still selects publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending, while active-gate pending reconcile reduced from three nodes to two and priority residual extraction now exposes four operation_workflow_owner / rebalancer_handoff witnesses.",
  "nextAction": "Classify the post-rerun split between the topology publication first frontier and the four rebalancer_handoff priority residual witnesses before further runtime edits. Keep active-gate consumer runtime, operation workflow, readiness, active-gate admission, handoff architecture, and timeout budgets frozen unless fresh canonical evidence selects them through a bounded successor.",
  "proof": [
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown",
    "npm run analyze:owner-files -- topology_publication_owner publication_convergence"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md",
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
    "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md",
    "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md",
    "test-output/reports/rolling-restart-after-active-gate-handoff-classification-20260518T094315Z.report.json",
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
    "work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md",
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
      "runtime ownership changes",
      "representative scenario evidence changes"
    ]
  },
  "representativeResidual": {
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Classify the reduced same-owner publication frontier with newly exposed operation_workflow_owner / rebalancer_handoff priority residual witnesses."
  },
  "causalGovernance": {
    "hypothesis": "After the same-frontier handoff proof, the selected local blocker is producer-side topology publication convergence. Focused publication owner proof should reduce publication_pending, classify the remaining OPEN epoch-1 evidence, migrate to a concrete successor, or stop as same-frontier without reopening active-gate, operation workflow, readiness, admission, or timeout-budget work.",
    "stopConditionCheck": "Use scenario-route, evidence-summary, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files, package doctor, and subagent sequencing before runtime edits. Runtime edits must stay inside the declared publication owner files.",
    "expectedCausalModelChange": "Observed reduced but same-owner result: focused owner proof removed stale zero-gap priority-spread debt, snapshotCoverage moved 2/5 to 3/5, active-gate pending reconcile moved 3 to 2, and priority residual extraction now exposes four rebalancer_handoff witnesses while topology route remains publication_ack_convergence first.",
    "representativeOutcome": "reduced",
    "causalDebt": "The representative remains red at active=0/5 and snapshotCoverage=3/5. Publication is still OPEN at epoch 1 with one published active node and four missing published nodes in canonical topology evidence. Active-gate remains deferred with two pending reconcile nodes and runtimePromotionAllowed=false. Priority residual extraction now reports four operation_workflow_owner / rebalancer_handoff witnesses.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation package may edit runtime publication owner files after a cross-boundary handoff proof."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication convergence after same-frontier publication-active-gate handoff classification",
    "phaseChain": [
      "publication count-only UNKNOWN evidence reduced to concrete OPEN epoch-1 evidence",
      "rebalancer_handoff retry witnesses classified as bounded",
      "publication-active-gate handoff probe recorded missingEdge=null and an existing contract edge",
      "fresh active-gate handoff classification rerun reselected publication_ack_convergence",
      "same-frontier handoff package closed without runtime or test edits"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json.",
    "knownDownstreamBlockers": [
      "post-implementation rerun failed 0/1 at active=0/5 and snapshotCoverage=3/5",
      "publicationStatus is OPEN at publicationEpoch=1",
      "publishedActiveNodeIds contains one node while four expected nodes remain missing from publication",
      "priority residual extraction reports four operation_workflow_owner / rebalancer_handoff witnesses",
      "active-gate snapshot coverage is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false"
    ],
    "missingCausalEdge": "Determine whether the newly exposed rebalancer_handoff witnesses are a publication-convergence successor, a priority-recovery migration, or bounded backpressure while topology route still reports publication_ack_convergence first.",
    "missingCausalEdgeProbe": "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown",
    "boundedProgressProof": "Bounded focused tests prove zero-gap priority partition summaries close stale priority_spread pending in publication recovery gate and canonical publication convergence, even when an older owner stream retained prioritySpreadPending=true.",
    "boundedProgressProofArtifact": "focused publication recovery tests plus test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "expectedObservableTransition": "Observed reduced but still red: snapshotCoverage 2/5 -> 3/5, active-gate pending reconcile 3 -> 2, priority residual witnesses 0 -> 4, and topology first frontier stayed publication_ack_convergence.",
    "maxProgressBound": "one focused topology_publication_owner / publication_convergence slice",
    "sameFrontierFallback": "If focused publication proof cannot reduce missingPublishedCount, change the required action, or select a narrower owner, stop as same-frontier or escalate instead of patching active-gate, readiness, operation workflow, admission, or timeout budgets.",
    "expectedNextFrontier": "diagnostic split between same-owner publication_pending and operation_workflow_owner / rebalancer_handoff priority residual witnesses",
    "resultClassification": "reduced",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-startup-active-gate-snapshot-coverage-after-publication-handoff-classification.md / startup_active_gate_owner / snapshot_coverage / classification-only"
    ],
    "oscillationCheck": "Allowed because the prior package resolved the handoff oscillation as same-frontier and selected a concrete publication-convergence successor.",
    "handoffInvariant": "Active-gate consumer runtime, operation workflow, startup readiness, active-gate admission, and timeout budgets remain frozen unless fresh canonical evidence selects them."
  },
  "architectureDecisionGate": {
    "status": "not-required",
    "trigger": "none",
    "triggerEvidence": [
      "The prior package selected same-frontier and the handoff probe reported missingEdge=null."
    ],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "No new architecture gate is required before the bounded publication-convergence proof."
  },
  "predecessor": "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md"
}
-->

## Why

The preceding handoff package proved that the publication-active-gate handoff
contract is present and that active-gate consumer evidence is still deferred.
Canonical evidence still selects `publication_ack_convergence`, so this package
owns the concrete publication-convergence slice for the OPEN epoch-1 state with
one published active node and four missing published nodes. The focused
implementation reduced the stale priority-spread part of that slice. The
representative rerun remained red but reduced downstream evidence and exposed a
new priority-residual split that must be classified before more runtime edits.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: one topology publication outcome for
  `publication_pending`: reduced, migrated, classification-only,
  same-frontier, architecture-gap, or representative-green.
- Inputs/signals: fresh representative artifact
  `test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`;
  scenario-route; evidence-summary; handoff-probe; causal-model; priority
  residual extraction; owner-files; focused publication owner tests.
- State model or invariant: normalize publication status, epoch,
  published-active membership, missing-published count, priority spread, and
  handoff/deferred consumer state into one snapshot before selecting a single
  publication outcome and reasons.
- Non-goals and forbidden interpretations: do not treat deferred active-gate
  consumer evidence as permission to patch active-gate runtime; do not reopen
  operation workflow, startup readiness, active-gate admission, timeout
  budgets, or handoff architecture unless fresh canonical evidence selects
  them.
- Proof mapping: focused tests prove zero-gap priority partition summaries no
  longer retain stale priority-spread debt in the publication owner gate or
  canonical publication convergence; the representative rerun proves a reduced
  red state and exposes the next priority-residual split.
- Wrong-slice trigger: stop, split, or escalate if the proof requires files
  outside the declared publication owner scope or cannot distinguish producer
  debt from deferred consumer handoff evidence.

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

1. src/control-plane/publication-owner-evidence.js
2. src/control-plane/publication-owner-decision.js
3. src/control-plane/publication-recovery-gate.js
4. src/control-plane/publication-recovery-evidence.js
5. test/control-plane/publication-owner-stream.test.js
6. test/control-plane/publication-recovery-gate.test.js
7. test/control-plane/publication-recovery-evidence.test.js

## Out Of Scope

1. startup active-gate runtime
2. operation workflow / rebalancer_handoff runtime
3. startup readiness runtime
4. active-gate admission relaxation
5. harness timeout increases or timeout budget policy
6. handoff architecture changes without fresh architecture-gate evidence

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Output profile: `medium`
- Owned files: `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`, `npm run analyze:owner-files -- topology_publication_owner publication_convergence`, `node test/control-plane/publication-recovery-gate.test.js`, `node test/control-plane/publication-recovery-evidence.test.js`
- Model ledger advisory: `escalate`

## Implementation Result

- Result: reduced representative rerun; still red.
- Runtime slice: zero-gap priority partition summaries now close stale
  `prioritySpreadPending` in `publication-recovery-gate` and canonical
  `publication-recovery-evidence`, even when an older owner stream retained
  priority-spread pending.
- Focused observable delta: artifact-shaped owner proof changes
  `prioritySpreadPending=true` with
  `reasonCodes=[publication_epoch_pending, priority_partitions_not_spread]` to
  `prioritySpreadPending=false` with
  `reasonCodes=[publication_epoch_pending]`; publication remains
  OPEN/publishing/waiting_for_publication.
- Representative observable delta: rerun artifact
  `test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`
  stayed on `publication_ack_convergence` but moved `snapshotCoverage=2/5` to
  `3/5`, active-gate pending reconcile `3` to `2`, and priority residual
  witnesses `0` to `4` under `operation_workflow_owner / rebalancer_handoff`.
- Raw-field fallback reason: canonical extractors showed zero priority
  residual witnesses while publication evidence retained priority-spread
  pending; a focused Node probe of the report fields was used only after those
  extractors to confirm the stale zero-gap priority summary that feeds the
  owner decision.
- Focused validation: publication recovery gate/evidence tests, literal
  guardrail, decision-boundary guardrail, runtime-grammar audit, package
  doctor, work-advance check, entry/pre-impl validation, and diff check are
  green.

## Validation

1. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
2. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
6. npm run analyze:owner-files -- topology_publication_owner publication_convergence
7. node test/control-plane/publication-recovery-gate.test.js
8. node test/control-plane/publication-recovery-evidence.test.js
9. node scripts/check-guideline-literals.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
10. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
11. npm run audit:runtime-grammar:file -- src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js
12. npm run work:validate -- --entry
13. npm run work:validate -- --pre-impl
14. git diff --check -- work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js

## Subagent Sequencing Requirement

Required before implementation because this causal-escalation package may edit
publication owner runtime and test files.

## Subagent Sequencing Ledger

- [x] Review subagent recorded: Agent Codex (019e3a96-1094-7243-9536-173be02722ff) reviewed work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Codex (019e3a99-1173-7901-9c62-7d03560f8c1a) fixed work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md.
- [x] Implementation subagent recorded: Agent Codex (019e3a9d-2c09-7cd3-9e0e-a28399c5bbc7) implemented work/packages/active-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md; result reduced stale zero-gap priority spread in publication recovery gate and canonical publication convergence, representative rerun pending.

## Subagent Progress Ledger

- [x] Agent Codex (019e3a96-1094-7243-9536-173be02722ff) review probe complete: scope and blocker confirmed; evidence: package, sprint, artifact, and predecessor handoff reviewed; next: fix subagent for ledger and blocker-state repairs.
- [x] Agent Codex (019e3a99-1173-7901-9c62-7d03560f8c1a) fix validation complete: package setup and current-blocker handoff repaired; evidence: transition commit c65fcd7c and clean subagent-next handoff; next: implementation subagent.
- [x] Agent Codex (019e3a9d-2c09-7cd3-9e0e-a28399c5bbc7) implementation validation complete: stale zero-gap priority-spread runtime slice implemented and focused validation passed; evidence: publication recovery gate/evidence tests, static guardrails, package doctor, work-advance check, and diff check; next: representative rerun.
- Representative rerun complete: `test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`; result red reduced; evidence: `active=0/5`, `snapshotCoverage=3/5`, priority residual witnesses `4`, active-gate pending reconcile `2`; next: classify same-owner publication frontier versus rebalancer_handoff residual split.
