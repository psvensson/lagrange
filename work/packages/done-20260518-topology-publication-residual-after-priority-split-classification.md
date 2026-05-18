# Topology Publication Residual After Priority Split Classification

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Implementation classification complete: canonical evidence still selects publication_ack_convergence / topology_publication_owner / publication_convergence as the local blocker. The result is a bounded same-owner publication runtime successor; active-gate, operation workflow, readiness, admission, handoff architecture, and timeout-budget files remain frozen.",
  "nextAction": "Parent should close this diagnostic classifier and open a bounded topology_publication_owner / publication_convergence runtime successor focused on OPEN epoch-1 publishing state, missingPublishedCount=4, prioritySpreadPending=true, and unavailable publication owner ack/revision/stream evidence.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md",
    "work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md",
    "work/sprints/current-blocker.md",
    "work/sprints/current-blocker.json",
    "work/model-ledger.jsonl"
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
    "status": "bounded-publication-owner-runtime-successor",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Open a bounded topology_publication_owner / publication_convergence runtime successor; keep all runtime files candidate-only in this classifier."
  },
  "causalGovernance": {
    "hypothesis": "Confirmed. Scenario route, evidence summary, scenario triage, and causal model still select publication_ack_convergence / topology_publication_owner / publication_convergence first. The four operation_workflow_owner / rebalancer_handoff witnesses are subordinate because splitRequired=false and topology/causal evidence keeps priority recovery classified or satisfied.",
    "stopConditionCheck": "Runtime files stayed candidate-only in this classifier after scenario-route, evidence-summary, handoff-probe, npm run analyze:causal-model, priority residual extraction, and owner-files. The next action is a bounded same-owner publication runtime successor; active-gate, operation workflow, readiness, admission, handoff architecture, and timeout-budget files remain frozen unless fresh evidence reselects them.",
    "expectedCausalModelChange": "Classified as bounded publication owner runtime successor: not representative-green, not classification-only stop, not owner migration, and not architecture or human escalation.",
    "representativeOutcome": "same-frontier",
    "causalDebt": "The representative remains red at active=0/5 and snapshotCoverage=3/5. Publication is OPEN at epoch 1 with publishedActive=1/5, missingPublishedCount=4, prioritySpreadPending=true, publicationOwnerAckState=unavailable, publicationOwnerRevisionState=unavailable, and publicationOwnerStreamOutcome=publishing; active-gate consumer evidence is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false; priority residual extraction reports four rebalancer_handoff witnesses with splitRequired=false.",
    "crossBoundaryReview": "Required before implementation because this causal-escalation successor follows a publication runtime reduction and may otherwise reopen adjacent active-gate or operation workflow boundaries."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication residual after zero-gap priority-spread reduction",
    "phaseChain": [
      "same-frontier publication-active-gate handoff proof closed with missingEdge=null",
      "predecessor implemented bounded publication owner zero-gap priority-spread reduction",
      "representative rerun reduced snapshotCoverage 2/5 to 3/5 and active-gate pending reconcile 3 to 2",
      "fresh route still selects publication_ack_convergence first",
      "priority residual extraction reports four rebalancer_handoff witnesses with splitRequired=false",
      "implementation classification selects a bounded publication owner runtime successor and keeps runtime files candidate-only"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json.",
    "knownDownstreamBlockers": [
      "representative failed 0/1 at active=0/5 and snapshotCoverage=3/5",
      "publicationStatus is OPEN at publicationEpoch=1 with publishedActive=1/5 and four missing published nodes",
      "active-gate snapshot coverage is deferred with two pending owner_reconcile_pending nodes and runtimePromotionAllowed=false",
      "priority residual extraction reports four operation_workflow_owner / rebalancer_handoff retry-scheduled witnesses with splitRequired=false"
    ],
    "missingCausalEdge": "The next concrete action is a bounded publication owner runtime successor for OPEN epoch-1 publishing state with missingPublishedCount=4, prioritySpreadPending=true, and unavailable owner ack/revision/stream evidence after stale priority-spread debt was reduced.",
    "missingCausalEdgeProbe": "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "boundedProgressProof": "Predecessor focused tests and representative rerun prove a bounded zero-gap priority-spread publication slice reduced downstream evidence without moving the first frontier; this classifier bounded the next publication-owner runtime successor without promoting runtime files.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md plus test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "expectedObservableTransition": "Open a bounded publication owner runtime successor; its focused proof should reduce the OPEN publishing/missingPublished frontier, migrate from fresh canonical evidence, or stop with a narrower publication owner reason.",
    "maxProgressBound": "one bounded topology_publication_owner / publication_convergence successor before reconsidering owner migration or architecture/human escalation",
    "sameFrontierFallback": "If the successor cannot narrow OPEN publishing, missingPublishedCount=4, prioritySpreadPending=true, or unavailable owner ack/revision/stream evidence, stop as same-frontier or human escalation instead of patching active-gate, operation workflow, readiness, admission, handoff architecture, or timeout budgets.",
    "expectedNextFrontier": "bounded topology_publication_owner / publication_convergence runtime successor focused on publication owner publishing visibility and missing published active nodes",
    "resultClassification": "same-frontier",
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
    "nextAction": "No gate is presented by this classifier. Continue with a bounded same-owner publication runtime successor unless fresh canonical evidence contradicts the owner boundary."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-convergence-after-active-gate-handoff-oscillation.md",
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md"
}
-->

## Why

The predecessor reduced stale zero-gap priority-spread debt in the publication
owner path, but representative evidence still selects publication first. This
package owns the diagnostic handoff that decides the next concrete publication
action, stop condition, or migration before any more runtime code changes.

Implementation classification selected the bounded same-owner publication
runtime successor. Scenario route, evidence summary, triage, and causal model
keep `publication_ack_convergence / topology_publication_owner /
publication_convergence` first; the handoff probe reports `missingEdge=null`
and `runtimePromotionAllowed=false`; priority residual extraction reports four
subordinate `operation_workflow_owner / rebalancer_handoff` witnesses with
`splitRequired=false`.

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

1. work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md
2. work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md
3. work/sprints/current-blocker.md
4. work/sprints/current-blocker.json
5. work/model-ledger.jsonl

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
- Owned files: `work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this is a causal-escalation package.
Review returned `fixes-required`; this fix role repaired metadata, tracker, and
sprint handoff files only. Implementation classification is complete.

- [x] Review subagent recorded: Agent Mencius (019e3ac0-56cf-7661-a241-e7f166adda9e) reviewed work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fixed work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md.
- [x] Implementation subagent recorded: Agent Vega (92ef527f-044f-42d5-b3dc-bc50ecbc8ea5) implemented work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md.

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [x] Agent Mencius (019e3ac0-56cf-7661-a241-e7f166adda9e) review complete: successor package and predecessor classification reviewed; evidence: scenario-route, evidence-summary, scenario-triage, handoff-probe, causal-model, priority residual extraction, package doctor, and entry validation; next: fix subagent for metadata, tracker, and sprint repairs.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix context loaded: scope and blocker confirmed; evidence: `npm run work:context`, package file, sprint file, and current-blocker files read; next: run package doctor and entry validation.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix probe complete: stale current-blocker and missing Subagent Sequencing Ledger confirmed; evidence: `npm run work:llm-start`, `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md`, and `npm run work:validate -- --entry`; next: edit metadata, tracker, and sprint references.
- [x] Agent Raman (019e3ac3-0a8f-7483-932e-d94d0fdab835) fix validation complete: package proof refreshed; evidence: `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md` validation ok and `npm run work:validate -- --entry` OK; next: final handoff.
- [x] Agent Vega (92ef527f-044f-42d5-b3dc-bc50ecbc8ea5) implementation context loaded: current blocker, package scope, sprint handoff, package doctor, model ledger, schema, and subagent prompt reviewed; evidence: `npm run work:context`, `npm run work:llm-start`, `npm run work:model-ledger -- summary`, `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md`, `npm run work:advance -- --check`, and `npm run work:subagent-prompt -- --role implementation --package work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md`; next: run canonical evidence classification commands.
- [x] Agent Vega (92ef527f-044f-42d5-b3dc-bc50ecbc8ea5) implementation classification complete: bounded same-owner publication runtime successor selected; evidence: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown`, and `npm run analyze:owner-files -- topology_publication_owner publication_convergence`; next: update package, sprint, and generated current-blocker handoff files.
- [x] Agent Vega (92ef527f-044f-42d5-b3dc-bc50ecbc8ea5) implementation validation complete: package, sprint, and generated current-blocker handoff files updated; evidence: `npm run work:current-blocker`, `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md` validation ok, `npm run work:validate -- --entry` OK, `npm run work:validate -- --pre-impl` OK, and `npm run work:validate -- --closure` OK; next: parent workflow commit and push focused package slice or open the bounded successor after closure.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
   - Result: `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`; causal outcome `continue_local_fix`.
2. npm run work:scenario-triage -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
   - Result: same frontier; priority residual witnesses `4`, owner-boundary groups `1`, `splitRequired=false`.
3. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
   - Result: route owner `topology_publication_owner`, boundary `publication_convergence`, causal stop `classified_local_blocker`.
4. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe
   - Result: `missingEdge=null`, `runtimePromotionAllowed=false`, nextOwnerPath deferred to startup active-gate but not promotable from this classifier.
5. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json
   - Result: dominant failure class `publication_ack_blocked`, stop condition `classified_local_blocker`, outcome `continue_local_fix`.
6. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown
   - Result: four `operation_workflow_owner / rebalancer_handoff` witnesses, `splitRequired=false`.
7. npm run analyze:owner-files -- topology_publication_owner publication_convergence
   - Result: owner-file index available; no runtime file was promoted by this classifier.
8. npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md
   - Result: validation ok, proof ladder compact `5/5`.
9. npm run work:validate -- --entry
   - Result: OK for 2 files.
10. npm run work:validate -- --pre-impl
   - Result: OK for 2 files.
11. npm run work:validate -- --closure
   - Result: OK for 2 files.

## Commit And Push Ledger

1. Focused package commit: `d473f858`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
