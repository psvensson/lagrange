# Topology Publication Residual After Priority Split Classification

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
  "currentState": "The predecessor reduced stale zero-gap priority-spread publication debt, but the representative rerun remains red with publication_ack_convergence first, snapshotCoverage=3/5, active-gate pending reconcile=2, and four subordinate operation_workflow_owner / rebalancer_handoff witnesses with splitRequired=false.",
  "nextAction": "Classify the remaining publication_pending frontier before runtime edits: choose a bounded publication owner successor, classification-only stop, or fresh owner migration from canonical evidence.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
  ],
  "handoffFiles": [
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
    "work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json"
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
    "nextAction": "Classify whether the remaining publication_pending frontier is a bounded topology publication owner runtime slice, classification-only stop, or fresh owner migration."
  },
  "causalGovernance": {
    "hypothesis": "The predecessor reduced stale zero-gap priority-spread debt, but canonical route, triage, evidence summary, and causal model still select publication_ack_convergence / topology_publication_owner / publication_convergence first. The four operation_workflow_owner / rebalancer_handoff witnesses are subordinate unless fresh evidence changes splitRequired or reselects that owner boundary.",
    "stopConditionCheck": "Use scenario-route, evidence-summary, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files, package doctor, and subagent sequencing before runtime edits. Runtime files stay candidate-only until the diagnostic classification selects a bounded publication owner action.",
    "expectedCausalModelChange": "This package should classify the reduced same-owner frontier into a bounded publication owner runtime successor, classification-only stop, migrated owner boundary, architecture-gap, human escalation, or representative green.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "The representative remains red at active=0/5 and snapshotCoverage=3/5. Publication is OPEN at epoch 1 with one published active node and four missing published nodes; active-gate consumer evidence is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false; priority residual extraction reports four rebalancer_handoff retry-scheduled witnesses with splitRequired=false.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation successor follows a publication runtime reduction and may otherwise reopen adjacent active-gate or operation workflow boundaries."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication residual after zero-gap priority-spread reduction",
    "phaseChain": [
      "same-frontier publication-active-gate handoff proof closed with missingEdge=null",
      "predecessor implemented bounded publication owner zero-gap priority-spread reduction",
      "representative rerun reduced snapshotCoverage 2/5 to 3/5 and active-gate pending reconcile 3 to 2",
      "fresh route still selects publication_ack_convergence first",
      "priority residual extraction reports four rebalancer_handoff witnesses with splitRequired=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json.",
    "knownDownstreamBlockers": [
      "representative failed 0/1 at active=0/5 and snapshotCoverage=3/5",
      "publicationStatus is OPEN at publicationEpoch=1 with publishedActive=1/5 and four missing published nodes",
      "active-gate snapshot coverage is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false",
      "priority residual extraction reports four operation_workflow_owner / rebalancer_handoff retry-scheduled witnesses with splitRequired=false"
    ],
    "missingCausalEdge": "Determine the next concrete publication owner action after stale priority-spread debt was reduced and rebalancer_handoff witnesses remained subordinate.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "boundedProgressProof": "Predecessor focused tests and representative rerun prove a bounded zero-gap priority-spread publication slice reduced downstream evidence without moving the first frontier.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md plus test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "expectedObservableTransition": "A diagnostic classification should select a concrete publication owner runtime successor, classification-only stop, migrated owner boundary, architecture gap, human escalation, or representative green before more runtime edits.",
    "maxProgressBound": "one diagnostic classification pass before promoting exact runtime files",
    "sameFrontierFallback": "If the classification cannot name a narrower publication owner action or changed owner boundary, stop as same-frontier or human escalation instead of patching active-gate, operation workflow, readiness, admission, handoff architecture, or timeout budgets.",
    "expectedNextFrontier": "bounded topology publication owner action or explicit non-publication migration selected by fresh canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-rolling-restart-publication-active-gate-handoff-oscillation-after-fresh-evidence.md / topology_publication_owner / publication_convergence / same-frontier",
      "work/packages/done-20260518-startup-readiness-snapshot-timeout-after-fresh-evidence.md / startup_readiness_owner / startup_support_evidence / migrated"
    ],
    "oscillationCheck": "Causal-escalation is active because the publication frontier returned after related publication and startup-readiness closures; no runtime patch may start until this package rechecks the handoff and residual split.",
    "handoffInvariant": "Active-gate consumer runtime, operation workflow, startup readiness, active-gate admission, handoff architecture, and timeout budgets stay frozen unless canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "watching",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "frontier returned to a recently closed related boundary",
      "same publication owner boundary remains first after a reduced predecessor",
      "priority residual witnesses are visible but splitRequired=false"
    ],
    "choices": [],
    "selectedChoice": null,
    "nextAction": "Watch for repeated frontier oscillation; present a gate only if the diagnostic classification cannot reduce, migrate, or classify the edge."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md"
}
-->

## Why

The predecessor reduced stale zero-gap priority-spread debt in the publication
owner path, but representative evidence still selects publication first. This
package owns the diagnostic handoff that decides the next concrete publication
action, stop condition, or migration before any more runtime code changes.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `causal-escalation`
- Why this lane is sufficient: owner, boundary, core logic brief, and proof ladder are bounded to this package.
- Escalation trigger to a heavier lane: runtime ownership, shared contract, or representative scenario evidence changes.

## Core Logic Brief

- Canonical outcome: one classification for the remaining
  `publication_pending` frontier: bounded publication owner runtime successor,
  classification-only stop, owner migration, same-frontier, architecture-gap,
  human escalation, or representative-green.
- Inputs/signals: representative artifact
  `test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`;
  scenario-route; evidence-summary; handoff-probe; causal-model; priority
  residual extraction; owner-files; predecessor package proof.
- State model or invariant: normalize the publication frontier, active-gate
  deferred handoff state, and priority residual split into one snapshot before
  selecting a single next action.
- Non-goals and forbidden interpretations: do not treat subordinate
  `rebalancer_handoff` witnesses, deferred active-gate evidence, readiness
  stalls, admission, handoff architecture, or timeout budgets as editable until
  canonical evidence reselects them.
- Proof mapping: canonical extractors must agree on the selected owner,
  boundary, and next action; if runtime work is promoted, required subagent
  sequencing and focused tests must be refreshed first.
- Wrong-slice trigger: stop or escalate if the evidence cannot distinguish a
  publication owner action from deferred consumer evidence or requires files
  outside the promoted scope.

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

1. work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json

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
- Owned files: `work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation package.
Review returned `fixes-required`; this fix role repaired metadata, tracker, and
sprint handoff files only. Implementation remains pending.

- [x] Review subagent recorded: Agent Mencius (019e3ac0-56cf-7661-a241-e7f166adda9e) reviewed work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fixed work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md.
- [ ] Implementation subagent recorded:
      pending-before-implementation-starts

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [x] Agent Mencius (019e3ac0-56cf-7661-a241-e7f166adda9e) review complete: successor package and predecessor classification reviewed; evidence: scenario-route, evidence-summary, scenario-triage, handoff-probe, causal-model, priority residual extraction, package doctor, and entry validation; next: fix subagent for metadata, tracker, and sprint repairs.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix context loaded: scope and blocker confirmed; evidence: `npm run work:context`, package file, sprint file, and current-blocker files read; next: run package doctor and entry validation.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix probe complete: stale current-blocker and missing Subagent Sequencing Ledger confirmed; evidence: `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md`, and `npm run work:validate -- --entry`; next: edit metadata, tracker, and sprint references.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix validation complete: package proof refreshed; evidence: `npm run work:package:doctor -- --suggest work/packages/active-20260518-topology-publication-residual-after-priority-split-classification.md` validation ok and `npm run work:validate -- --entry` OK; next: final handoff.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
3. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
