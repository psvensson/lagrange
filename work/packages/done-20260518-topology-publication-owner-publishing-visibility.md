# Topology Publication Owner Publishing Visibility

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-18",
  "lane": "causal-escalation",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Focused implementation reduced the local OPEN epoch publishing visibility blocker: observed/desired revision evidence now reports revisionState=advancing while preserving ackState=unavailable, freshnessFence=publishing, recoveryOutcome=waiting_for_publication, and streamOutcome=publishing. Fresh representative rerun stayed red on publication_ack_convergence / topology_publication_owner / publication_convergence, but the shape narrowed: dominantReason=missing_published_nodes_present, priority residual witnesses=0, producer publicationStatus=unknown, missingPublishedCount=5, and active-gate evidence is deferred on selected_snapshot_source_timeout.",
  "nextAction": "Commit and push this focused reduced slice, close it as reduced, then open or continue a diagnostic classification successor on the fresh artifact for topology_publication_owner / publication_convergence / missing_published_nodes_present. Keep active-gate, operation workflow, readiness, admission, handoff architecture, and timeout budgets frozen unless a new gate selects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md",
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
    "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md",
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
    "status": "reduced",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Close this focused reduced slice after commit/push and open or continue a diagnostic classification successor on the fresh missing-published-nodes artifact."
  },
  "causalGovernance": {
    "hypothesis": "The selected local blocker narrowed from OPEN epoch-1 publishing visibility to the same topology publication owner boundary with missing published nodes and no priority residual witnesses. The focused runtime change remains valid for the OPEN publishing path, but the fresh representative now stops earlier with producer publicationStatus=unknown and selected_snapshot_source_timeout deferred downstream.",
    "stopConditionCheck": "Before implementation, rerun scenario-route, evidence-summary, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files, package doctor, and required subagent sequencing. Runtime edits must stay inside the declared topology publication owner files.",
    "expectedCausalModelChange": "Representative rerun reduced the package target by moving off the OPEN epoch-1 priority-spread shape and removing priority residual witnesses, while keeping the first frontier on topology_publication_owner / publication_convergence for missing published nodes.",
    "representativeOutcome": "reduced",
    "causalDebt": "The fresh representative remains red at active=0/5 and snapshotCoverage=0/5. Publication evidence is now deferred with publicationStatus=unknown, publicationEpoch=0, missingPublishedCount=5, prioritySpreadPending=false, publicationOwnerAckState=unavailable, publicationOwnerRevisionState=unavailable, and publicationOwnerStreamOutcome=publishing. Focused local proof still changes the OPEN epoch publishing owner stream to revisionState=advancing when observed/desired revision evidence exists. Active-gate consumer evidence is deferred on selected_snapshot_source_timeout with runtimePromotionAllowed=false, and priority residual extraction reports zero witnesses.",
    "crossBoundaryReview": "Required before implementation because this runtime successor follows a causal-escalation classifier and adjacent publication-active-gate handoff work."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication owner publishing visibility after same-owner classifier",
    "phaseChain": [
      "same-frontier publication-active-gate handoff proof closed with missingEdge=null",
      "zero-gap priority-spread publication slice reduced downstream evidence",
      "classifier selected bounded same-owner publication runtime successor",
      "active-gate runtimePromotionAllowed remains false",
      "fresh priority residual extraction reports zero witnesses with splitRequired=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present in test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json.",
    "knownDownstreamBlockers": [
      "fresh representative failed 0/1 at active=0/5 and snapshotCoverage=0/5",
      "publicationStatus is unknown at publicationEpoch=0 with missingPublishedCount=5 and no published active nodes",
      "source artifact has publication owner ack and revision evidence unavailable while owner stream outcome is publishing; focused implementation still narrows revision evidence to advancing for OPEN epoch publishing when observed/desired revision evidence exists",
      "active-gate snapshot coverage is deferred on selected_snapshot_source_timeout with runtimePromotionAllowed=false",
      "priority residual extraction reports zero operation workflow witnesses"
    ],
    "missingCausalEdge": "Classify why the publication owner evidence is now missing published nodes with publicationStatus=unknown after the focused OPEN publishing revision-visibility slice.",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- topology_publication_owner publication_convergence",
    "boundedProgressProof": "The predecessor classifier bounded this as a same-owner publication runtime successor and kept active-gate, operation workflow, readiness, admission, handoff architecture, and timeout budgets frozen.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md plus test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json",
    "expectedObservableTransition": "Observed: focused owner proof changes publication owner revision availability from unavailable to advancing for OPEN epoch publishing, and fresh representative evidence narrows to missing_published_nodes_present with priority residual witnesses=0.",
    "maxProgressBound": "one bounded topology_publication_owner / publication_convergence runtime slice",
    "sameFrontierFallback": "If the focused proof cannot reduce OPEN publishing, missingPublishedCount=4, prioritySpreadPending=true, or unavailable owner ack/revision evidence, stop as same-frontier or human escalation instead of patching active-gate, operation workflow, readiness, admission, handoff architecture, or timeout budgets.",
    "expectedNextFrontier": "diagnostic classification successor for missing_published_nodes_present on topology_publication_owner / publication_convergence, migrated, or representative-green",
    "resultClassification": "reduced",
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
    "nextAction": "Close this reduced slice and continue with a diagnostic classifier on the fresh missing-published-nodes evidence; present a gate only if that successor cannot narrow or migrate the publication owner blocker."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md",
  "closed": "2026-05-18",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/active-20260518-topology-publication-missing-published-nodes-classification.md"
}
-->

## Why

The predecessor classifier selected a bounded same-owner runtime successor.
This package owns the publication owner path for OPEN epoch-1 publishing
visibility, missing published active nodes, and unavailable owner
ack/revision evidence. Focused implementation reduced the revision side of
that blocker: OPEN epoch publishing now reports observed/desired revision
availability as advancing while preserving the publishing wait. It must not
reopen active-gate, operation workflow, readiness, admission, handoff
architecture, or timeout budgets from the same artifact. The representative
rerun did not go green, but it narrowed the evidence away from the OPEN
epoch-1 priority-spread shape: priority residual witnesses are now zero and
the remaining publication owner blocker is missing published nodes with
`publicationStatus=unknown`.

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

1. work/packages/done-20260518-topology-publication-owner-publishing-visibility.md
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
- Owned files: `work/packages/done-20260518-topology-publication-owner-publishing-visibility.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this causal-escalation package may edit
topology publication owner runtime and test files.

- [x] Review subagent recorded: Agent Russell (019e3ad9-2244-7e92-b19a-3742fdab11c9) reviewed `work/packages/done-20260518-topology-publication-owner-publishing-visibility.md`; result fixes-required.
- [x] Fix subagent recorded or explicitly not needed: Agent Mill (019e3adc-98fc-7773-9e29-f423b5d2a3a9) fixed `work/packages/done-20260518-topology-publication-owner-publishing-visibility.md`.
- [x] Implementation subagent recorded: Agent Nietzsche (019e3ae1-0e1f-7220-9b83-93297adfe951) implemented `work/packages/done-20260518-topology-publication-owner-publishing-visibility.md`; result reduced.

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one checked update after every completed subtask; the Sequencing Ledger remains the role-completion proof.

- [x] Agent Russell (019e3ad9-2244-7e92-b19a-3742fdab11c9) completed review subtask: identified stale sprint successor/classifier wording and missing review/fix ledger proof; evidence: review result fixes-required for `work/packages/done-20260518-topology-publication-owner-publishing-visibility.md`; next: fix subagent repairs package and sprint handoff text.
- [x] Agent Mill (019e3adc-98fc-7773-9e29-f423b5d2a3a9) completed fix subtask: recorded review/fix proof and corrected successor/classifier wording without runtime or test edits; evidence: package and sprint files patched; next: run package doctor, entry validation, pre-implementation validation, and diff check.
- [x] Agent Nietzsche (019e3ae1-0e1f-7220-9b83-93297adfe951) implementation evidence triage: canonical evidence and package gates agree on `publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending`; evidence: `npm run work:context`, `npm run work:llm-start`, package doctor, evidence-summary, scenario-route, handoff-probe, causal-model, priority residuals, owner-files, subagent prompt, work:advance -- --check, entry validation, and pre-impl validation all completed; next: implement the smallest publication owner runtime/test slice for OPEN epoch-1 publishing visibility.
- [x] Agent Nietzsche (019e3ae1-0e1f-7220-9b83-93297adfe951) implementation runtime slice: OPEN epoch publishing revision visibility now reports `revisionState=advancing` from observed/desired epoch evidence while retaining `ackState=unavailable` and `streamOutcome=publishing`; evidence: `src/control-plane/publication-owner-decision.js` and `test/control-plane/publication-owner-stream.test.js`, with the focused test failing before the runtime change and passing after it; next: run recovery consumer tests and static guardrails.
- [x] Agent Nietzsche (019e3ae1-0e1f-7220-9b83-93297adfe951) implementation validation subtask: focused owner and recovery consumer tests plus static guardrails are green; evidence: `node test/control-plane/publication-owner-stream.test.js`, `node test/control-plane/publication-recovery-gate.test.js`, `node test/control-plane/publication-recovery-evidence.test.js`, `node scripts/check-guideline-literals.js ...`, `node scripts/check-guideline-decision-boundaries.js ...`, and `npm run audit:runtime-grammar:file -- ...`; next: record model ledger, regenerate blocker handoff, run package validation, and diff check.
- [x] Agent Nietzsche (019e3ae1-0e1f-7220-9b83-93297adfe951) implementation closure-handoff subtask: package validation and handoff checks are green; evidence: model ledger record added, `npm run work:current-blocker` regenerated current blocker, package doctor ok, closure validation ok, scoped `git diff --check` ok, and scoped status shows only package-owned files changed; next: parent reruns representative rolling-restart before package closure/commit.

## Validation

Focused result: `reduced`. The local owner
fixture for OPEN epoch publishing failed before the runtime edit with
`revisionState=unavailable` and passes after the edit with
`revisionState=advancing`, while `ackState=unavailable`,
`freshnessFence=publishing`, `recoveryOutcome=waiting_for_publication`, and
`streamOutcome=publishing` remain unchanged. Fresh representative rerun stayed
red but narrowed away from the package's OPEN epoch-1 priority-spread shape:
`publication_ack_convergence` is still the first frontier, the dominant reason
is now `missing_published_nodes_present`, priority residual witnesses are `0`,
and the producer evidence reports `publicationStatus=unknown`.

1. `npm run work:context` - pass.
2. `npm run work:llm-start` - pass.
3. `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-owner-publishing-visibility.md` - pass.
4. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json` - pass; first frontier remains `publication_ack_convergence`.
5. `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown` - pass.
6. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --handoff-probe` - pass; producer remains OPEN/publishing and active-gate promotion remains false.
7. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json` - pass; outcome `continue_local_fix`.
8. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-zero-gap-priority-spread-20260518T104305Z.report.json --markdown` - pass; `splitRequired=false`.
9. `npm run analyze:owner-files -- topology_publication_owner publication_convergence` - pass.
10. `npm run work:subagent-prompt -- --role implementation --package work/packages/done-20260518-topology-publication-owner-publishing-visibility.md` - pass.
11. `npm run work:advance -- --check` - pass.
12. `npm run work:validate -- --entry` - pass.
13. `npm run work:validate -- --pre-impl` - pass.
14. `node test/control-plane/publication-owner-stream.test.js` - failed before runtime edit on the new focused revision-state assertion; pass after runtime edit.
15. `node test/control-plane/publication-recovery-gate.test.js` - pass.
16. `node test/control-plane/publication-recovery-evidence.test.js` - pass.
17. `node scripts/check-guideline-literals.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js` - pass.
18. `node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js` - pass.
19. `npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js` - pass.
20. `npm run work:model-ledger -- record ...` - pass; recorded focused implementation evidence with representative rerun pending.
21. `npm run work:current-blocker` - pass after correcting package result fields to tracker-approved enums; regenerated `work/sprints/current-blocker.md` and `work/sprints/current-blocker.json`.
22. `npm run work:package:doctor -- --suggest work/packages/done-20260518-topology-publication-owner-publishing-visibility.md` - pass.
23. `npm run work:validate -- --closure` - pass.
24. `git diff --check -- work/packages/done-20260518-topology-publication-owner-publishing-visibility.md work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md work/sprints/current-blocker.md work/sprints/current-blocker.json work/model-ledger.jsonl src/control-plane/publication-owner-evidence.js src/control-plane/publication-owner-decision.js src/control-plane/publication-recovery-gate.js src/control-plane/publication-recovery-evidence.js test/control-plane/publication-owner-stream.test.js test/control-plane/publication-recovery-gate.test.js test/control-plane/publication-recovery-evidence.test.js` - pass.
25. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --verbose` - fail as expected for the release gate; writes fresh representative evidence.
26. `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json` - pass; first frontier remains `publication_ack_convergence`, dominant reason is `missing_published_nodes_present`.
27. `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown` - pass.
28. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe` - pass; `missingEdge=null`, producer `publicationStatus=unknown`, runtime promotion remains false.
29. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json` - pass; outcome `continue_local_fix`.
30. `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown` - pass; witnesses `0`, `splitRequired=false`.
31. `npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --package work/packages/done-20260518-topology-publication-owner-publishing-visibility.md --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence` - pass; suggests diagnostic-classification successor.

## Commit And Push Ledger

1. Focused package commit: `e9b119bd`
2. Pushed to: `origin/codex/pending-ack-eligibility-filter`
3. Commit contains only package-owned files/package-status/allowed sprint handoff: yes
