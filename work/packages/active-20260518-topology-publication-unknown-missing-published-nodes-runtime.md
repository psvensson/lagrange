# Topology Publication Unknown Missing Published Nodes Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Predecessor classifier selected a bounded same-owner topology publication runtime successor. Fresh representative evidence reports publicationStatus=unknown, publicationEpoch=0, missingPublishedCount=5, priority residual witnesses=0, and active-gate selected_snapshot_source_timeout downstream with runtimePromotionAllowed=false.",
  "nextAction": "Run required review/fix/implementation sequencing, then implement one focused topology_publication_owner / publication_convergence runtime slice for unknown publication status plus missing published nodes. Keep active-gate, operation workflow, readiness, admission, handoff architecture, and timeout budgets frozen unless fresh evidence reselects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-unknown-missing-published-nodes-runtime.md",
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
    "work/packages/done-20260518-topology-publication-missing-published-nodes-classification.md",
    "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json"
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
    "work/packages/active-20260518-topology-publication-unknown-missing-published-nodes-runtime.md",
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
      "owned files expand beyond topology publication owner runtime and focused tests",
      "canonical evidence reselects startup active-gate, operation workflow, readiness, admission, handoff architecture, or timeout ownership",
      "representative scenario evidence contradicts the missing_published_nodes_present route"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "missing_published_nodes_present",
    "nextAction": "Run review/fix/implementation sequencing, then implement one bounded publication-owner runtime slice for unknown status plus missing published nodes."
  },
  "causalGovernance": {
    "hypothesis": "The fresh representative is still blocked inside topology publication ownership: publication evidence is unknown at epoch 0 while all five active nodes remain missing from published visibility, priority residuals are absent, and active-gate selected-source timeout is downstream rather than authoritative.",
    "stopConditionCheck": "Before runtime edits, use package doctor, required subagent review/fix sequencing, scenario-route, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files or focused owner tests, and validation to confirm the same owner and boundary.",
    "expectedCausalModelChange": "The runtime slice should reduce or close the missing published nodes publication edge by making the owner either publish active nodes or emit a structured owner-local deferred outcome that explains why publication remains unavailable.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative proof records active=0/5, snapshotCoverage=0/5, publicationStatus=unknown, publicationEpoch=0, missingPublishedCount=5, prioritySpreadPending=false, publicationOwnerAckState=unavailable, publicationOwnerRevisionState=unavailable, publicationOwnerStreamOutcome=publishing, no priority residual witnesses, and active-gate runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Required if implementation needs files outside topology publication owner runtime or if fresh proof reselects active-gate, operation workflow, readiness, admission, handoff architecture, or timeout ownership."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication missing published nodes after owner publishing visibility reduction",
    "phaseChain": [
      "predecessor runtime slice reduced OPEN epoch publishing revision visibility",
      "fresh representative remains on publication_ack_convergence / topology_publication_owner / publication_convergence",
      "classifier selected bounded-same-owner-successor for missing_published_nodes_present",
      "priority residual witnesses are zero",
      "active-gate selected_snapshot_source_timeout remains downstream and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / missing_published_nodes_present in test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json.",
    "knownDownstreamBlockers": [
      "fresh representative failed 0/1 at active=0/5 and snapshotCoverage=0/5",
      "publicationStatus is unknown at publicationEpoch=0 with missingPublishedCount=5 and no published active nodes",
      "active-gate snapshot coverage is deferred on selected_snapshot_source_timeout with runtimePromotionAllowed=false",
      "priority residual extraction reports zero operation workflow witnesses"
    ],
    "missingCausalEdge": "The publication owner path does not yet provide a decisive publication convergence outcome for unknown publication status plus missing published nodes.",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- topology_publication_owner publication_convergence plus focused owner runtime tests over publication owner evidence, decision, recovery gate, and recovery evidence",
    "boundedProgressProof": "Predecessor diagnostic classifier selected a bounded same-owner runtime successor after canonical route, causal-model, handoff-probe, and priority residual extraction stayed on topology_publication_owner / publication_convergence.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-missing-published-nodes-classification.md plus test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "expectedObservableTransition": "Focused owner tests should prove the chosen publication-owner outcome, and the next representative run should reduce missingPublishedCount, move to a later publication-owner cause, migrate, or close the scenario.",
    "maxProgressBound": "one bounded runtime owner slice before another representative rerun or architecture/human gate",
    "sameFrontierFallback": "If implementation cannot change the publication owner outcome without widening beyond declared owner files, stop for architecture or human escalation instead of adding another local symptom patch.",
    "expectedNextFrontier": "reduced missing-published-node evidence, migrated owner boundary, representative green, or explicit architecture/human gate",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-missing-published-nodes-classification.md / topology_publication_owner / publication_convergence / bounded-same-owner-successor",
      "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-residual-after-priority-split-classification.md / topology_publication_owner / publication_convergence / same-frontier"
    ],
    "oscillationCheck": "Causal-escalation watch remains active; if this runtime slice cannot reduce or migrate the representative frontier, stop for an architecture or human decision gate.",
    "handoffInvariant": "Active-gate consumer runtime, operation workflow, startup readiness, active-gate admission, handoff architecture, and timeout budgets stay frozen unless fresh canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative remains publication_ack_convergence after a reduced predecessor",
      "predecessor classifier selected bounded same-owner successor",
      "priority residual witnesses are zero",
      "active-gate selected-source timeout remains downstream"
    ],
    "choices": [
      {
        "id": "bounded-same-owner-runtime-successor",
        "summary": "Run normal review/fix/implementation sequencing for a focused topology publication owner runtime slice.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "bounded-same-owner-runtime-successor",
    "nextAction": "Run review subagent first, fix if required, then implementation subagent for this runtime successor."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "missing_published_nodes_present",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Implement one focused topology publication owner runtime slice for unknown publication status plus missing published nodes; representative proof should then reduce, migrate, close, or trigger an architecture/human gate.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present",
      "Update Sprint Strategy Brief and Current Edge Card from the route result.",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl after review/fix proof is clean"
    ]
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown",
      "npm run work:validate -- --entry"
    ],
    "decisionRecord": "The predecessor classifier recorded the separate classification; this runtime package keeps the classification gate inline and must update the current package rather than open another classifier for the same unchanged artifact.",
    "successorAction": "update-current-package",
    "runtimePromotionRule": "This package is the runtime-owner-boundary successor for stable topology_publication_owner / publication_convergence evidence."
  },
  "predecessor": "work/packages/done-20260518-topology-publication-missing-published-nodes-classification.md"
}
-->

## Why

The predecessor classifier closed without runtime edits and selected a bounded
same-owner successor. The current representative artifact still routes to
`publication_ack_convergence / topology_publication_owner /
publication_convergence`, but the observable blocker is now
`missing_published_nodes_present`: publication status is `unknown`,
publication epoch is `0`, all five active nodes are missing from published
visibility, and the focused priority residual extractor reports zero
operation-workflow witnesses.

This package owns the next focused runtime slice inside the topology
publication owner boundary. It does not reopen startup active-gate,
operation-workflow, readiness, admission, handoff architecture, or timeout
ownership unless fresh canonical evidence reselects those boundaries.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: repeated publication-frontier residuals already passed through a causal classifier, and the selected architecture gate now activates a bounded same-owner runtime route.
- Escalation trigger to a heavier lane: the runtime slice needs files outside the declared topology publication owner boundary or fresh representative evidence contradicts the selected route.

## Core Logic Brief

- Canonical outcome: the topology publication owner must produce one
  publication convergence outcome for the unknown-status plus missing-published
  nodes shape, either by advancing published active-node visibility or by
  emitting an explicit owner-local deferred outcome with reasons.
- Inputs/signals: fresh representative artifact
  `test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`;
  publication status and epoch; missing published active-node count; published
  active-node coverage; owner ack, revision, and stream states; desired and
  observed revision evidence; priority residual extraction; active-gate
  handoff probe; causal model; focused owner tests.
- State model or invariant: collect publication evidence into one normalized
  owner snapshot before deciding. If publication evidence cannot prove active
  nodes are published while priority residual witnesses are absent and
  active-gate runtime promotion is disallowed, the owner-local publication
  path must either advance the publication state or emit the single canonical
  deferred publication outcome and reasons.
- Non-goals and forbidden interpretations: do not treat selected-source
  timeout, empty active-gate coverage, absent priority witnesses, readiness
  lag, admission state, or timeout expiry as authority to patch non-publication
  owners inside this package.
- Proof mapping: review/fix subagents must confirm the selected owner
  boundary; implementation must change only the declared publication owner
  runtime or focused tests; local tests and static guardrails must prove the
  owner outcome; representative or route-after-rerun proof must classify the
  scenario after the slice.
- Wrong-slice trigger: stop, split, or escalate if the focused probe requires
  startup active-gate, operation workflow, readiness, admission, handoff
  architecture, timeout-budget, or broad publication architecture edits.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`
- Expected delta: after one bounded owner-runtime slice, representative proof should reduce missing published nodes, migrate to a newly selected owner boundary, reach representative green, or trigger an architecture/human gate with concrete evidence.
- Local proof class: focused topology publication owner runtime tests plus static guardrails for touched runtime files.
- Representative proof class: fresh rolling-restart rerun or canonical route-after-rerun result.
- Stop if unchanged: if the same frontier and missing-published-nodes shape persist without a concrete metric, state, or boundary reduction, stop for architecture or human escalation instead of opening another local runtime patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `missing_published_nodes_present`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current Edge Card update, current-blocker refresh, and phase-appropriate validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: the predecessor classifier recorded the separate classification; this runtime package keeps the classification gate inline and must update the current package rather than open another classifier for the same unchanged artifact.
- Successor action: `update-current-package`
- Runtime promotion rule: this package is the `runtime-owner-boundary` successor for stable `topology_publication_owner / publication_convergence` evidence.

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
3. If the focused probe cannot identify an owner-local runtime edit, stop for architecture or human escalation instead of widening the package.
4. Once an architecture gate has a selected route, do not open another gate unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-topology-publication-unknown-missing-published-nodes-runtime.md
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

- Package class: `runtime-owner-boundary`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `bounded-owner-runtime/current-frontier`
- Output profile: `medium`
- Owned files: `work/packages/active-20260518-topology-publication-unknown-missing-published-nodes-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: active-gate, operation-workflow, readiness, admission, handoff architecture, and timeout ownership remain out of scope unless fresh canonical evidence reselects them.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence contradicts the selected route.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this runtime-owner-boundary package may edit
topology publication owner runtime and focused test files.

- [ ] Review subagent recorded: pending-before-review.
- [ ] Fix subagent recorded or explicitly not needed: pending-before-review.
- [ ] Implementation subagent recorded: pending-before-implementation-starts.

## Subagent Progress Ledger

Required when subagent sequencing is required. Each real subagent appends one
checked update after every completed subtask; the Sequencing Ledger remains the
role-completion proof.

- [ ] Review role pending: evidence: not-run; next: assign fresh review subagent before implementation.
- [ ] Fix role pending: evidence: not-run; next: run only if review finds fixes.
- [ ] Implementation role pending: evidence: not-run; next: run after review/fix proof is clean.

## Validation

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason missing_published_nodes_present --explain publication_ack_convergence --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-publication-owner-publishing-visibility-20260518T114956Z.report.json --markdown
