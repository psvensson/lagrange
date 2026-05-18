# Topology Publication Unknown No Debt Pending Runtime

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-18",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "publication_convergence",
  "dominantReason": "publication_pending",
  "currentState": "Focused predecessor work reduced missingPublishedCount from 5 to 0, but fresh representative evidence still reports publicationPending=true for publicationStatus=unknown, publicationEpoch=0, pendingAckCount=0, missingPublishedCount=0, publicationOwnerAckState=not_required, publicationOwnerRevisionState=unavailable, and publicationOwnerStreamOutcome=not_started.",
  "nextAction": "Run required review/fix/implementation sequencing, then implement one focused topology_publication_owner / publication_convergence slice for the unknown/no-debt publication_pending shape. Keep active-gate, operation workflow, readiness, admission, handoff architecture, and timeout budgets frozen unless fresh evidence reselects them.",
  "proof": [
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
    "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --handoff-probe",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260518-topology-publication-unknown-no-debt-pending-runtime.md",
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
    "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md",
    "test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json"
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
    "work/packages/active-20260518-topology-publication-unknown-no-debt-pending-runtime.md",
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
      "representative scenario evidence contradicts the publication_pending route"
    ]
  },
  "representativeResidual": {
    "status": "pending-before-probe",
    "scenario": "rolling-restart",
    "artifact": "test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
    "frontier": "publication_ack_convergence",
    "owner": "topology_publication_owner",
    "boundary": "publication_convergence",
    "dominantReason": "publication_pending",
    "nextAction": "Run review/fix/implementation sequencing, then implement one bounded publication-owner runtime slice for unknown/no-debt publication_pending."
  },
  "causalGovernance": {
    "hypothesis": "The fresh representative is still blocked inside topology publication ownership: publication evidence is unknown at epoch 0 and publicationPending=true even though pendingAckCount=0, missingPublishedCount=0, priority residual witnesses are absent, and active-gate selected-source timeout is downstream rather than authoritative.",
    "stopConditionCheck": "Before runtime edits, use package doctor, required subagent review/fix sequencing, scenario-route, handoff-probe, npm run analyze:causal-model, priority residual extraction, owner-files or focused owner tests, and validation to confirm the same owner and boundary.",
    "expectedCausalModelChange": "The runtime slice should close or reduce the remaining owner-local publication_pending edge by preventing unknown/no-debt not_started publication evidence from reopening publication pending.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Fresh representative proof records active=4/5, snapshotCoverage=0/5, publicationStatus=unknown, publicationEpoch=0, pendingAckCount=0, missingPublishedCount=0, publicationPending=true, prioritySpreadPending=false, publicationOwnerAckState=not_required, publicationOwnerFreshnessFence=no_revision, publicationOwnerRecoveryOutcome=not_started, publicationOwnerRevisionState=unavailable, publicationOwnerStreamOutcome=not_started, no priority residual witnesses, and active-gate runtimePromotionAllowed=false.",
    "crossBoundaryReview": "Required if implementation needs files outside topology publication owner runtime or if fresh proof reselects active-gate, operation workflow, readiness, admission, handoff architecture, or timeout ownership."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart publication pending after unknown missing-published reduction",
    "phaseChain": [
      "predecessor runtime slice reduced missingPublishedCount from 5 to 0",
      "fresh representative remains on publication_ack_convergence / topology_publication_owner / publication_convergence",
      "fresh dominant reason is publication_pending",
      "priority residual witnesses are zero",
      "active-gate selected_snapshot_source_timeout remains downstream and runtimePromotionAllowed=false"
    ],
    "currentFirstFrontier": "publication_ack_convergence / topology_publication_owner / publication_convergence / publication_pending in test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json.",
    "knownDownstreamBlockers": [
      "fresh representative failed 0/1 at active=4/5 and snapshotCoverage=0/5",
      "publicationStatus is unknown at publicationEpoch=0 with publicationPending=true despite pendingAckCount=0 and missingPublishedCount=0",
      "active-gate snapshot coverage is deferred on selected_snapshot_source_timeout with runtimePromotionAllowed=false",
      "priority residual extraction reports zero operation workflow witnesses"
    ],
    "missingCausalEdge": "The publication owner path still reports publication pending for an unknown/no-debt not_started owner stream.",
    "missingCausalEdgeProbe": "npm run analyze:owner-files -- topology_publication_owner publication_convergence plus focused owner runtime tests over publication owner evidence, decision, recovery gate, and recovery evidence",
    "boundedProgressProof": "Predecessor focused owner runtime tests and representative proof drained the missing-published-node debt, moving the dominant reason from missing_published_nodes_present to publication_pending without selecting active-gate, operation workflow, readiness, handoff architecture, or timeout ownership.",
    "boundedProgressProofArtifact": "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md plus test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
    "expectedObservableTransition": "Focused owner tests should prove the unknown/no-debt not_started owner outcome, and the next representative run should close publication_pending, reduce to a later publication-owner cause, migrate, or trigger an architecture/human gate.",
    "maxProgressBound": "one bounded runtime owner slice before another representative rerun or architecture/human gate",
    "sameFrontierFallback": "If implementation cannot change the publication owner outcome without widening beyond declared owner files, stop for architecture or human escalation instead of adding another local symptom patch.",
    "expectedNextFrontier": "closed publication_pending evidence, migrated owner boundary, representative green, or explicit architecture/human gate",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix",
    "recentFrontierHistory": [
      "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md / topology_publication_owner / publication_convergence / reduced",
      "work/packages/done-20260518-topology-publication-missing-published-nodes-classification.md / topology_publication_owner / publication_convergence / bounded-same-owner-successor",
      "work/packages/done-20260518-topology-publication-owner-publishing-visibility.md / topology_publication_owner / publication_convergence / reduced"
    ],
    "oscillationCheck": "Causal-escalation watch remains active; if this runtime slice cannot reduce or migrate the representative frontier, stop for an architecture or human decision gate.",
    "handoffInvariant": "Active-gate consumer runtime, operation workflow, startup readiness, active-gate admission, handoff architecture, and timeout budgets stay frozen unless fresh canonical evidence reselects them."
  },
  "architectureDecisionGate": {
    "status": "selected",
    "trigger": "frontier-oscillation",
    "triggerEvidence": [
      "fresh representative remains publication_ack_convergence after a reduced predecessor",
      "predecessor runtime slice reduced missingPublishedCount from 5 to 0",
      "priority residual witnesses are zero",
      "active-gate selected-source timeout remains downstream"
    ],
    "choices": [
      {
        "id": "bounded-same-owner-runtime-successor",
        "summary": "Run normal review/fix/implementation sequencing for a focused topology publication owner runtime slice.",
        "route": "continue-local-proof",
        "proof": [
          "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
          "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
          "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --handoff-probe"
        ]
      }
    ],
    "selectedChoice": "bounded-same-owner-runtime-successor",
    "nextAction": "Run review subagent first, fix if required, then implementation subagent for this runtime successor."
  },
  "classificationEfficiency": {
    "defaultMode": "inline-gate-default",
    "separatePackageReason": "successor-selection",
    "artifactBudget": "one-artifact",
    "proofCommandBudget": "two-or-three-canonical-commands",
    "commands": [
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
      "npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown",
      "npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --markdown"
    ],
    "decisionRecord": "The predecessor runtime package recorded the reduced result; this package is the runtime-owner-boundary successor for stable topology_publication_owner / publication_convergence evidence.",
    "successorAction": "open-runtime-owner-boundary",
    "runtimePromotionRule": "This package is the runtime-owner-boundary successor for stable topology_publication_owner / publication_convergence evidence."
  },
  "rerunDecision": {
    "sourceArtifact": "test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json",
    "routeOwner": "topology_publication_owner",
    "routeBoundary": "publication_convergence",
    "routeDominantReason": "publication_pending",
    "routeCausalOutcome": "continue_local_fix",
    "stopMode": "classified_local_blocker",
    "nextLane": "runtime-owner-boundary",
    "expectedDelta": "Implement one focused topology publication owner runtime slice so UNKNOWN/no-debt not_started publication evidence no longer reports publication_pending; representative proof should then reduce, migrate, close, or trigger an architecture/human gate.",
    "requiredRefreshCommands": [
      "npm run work:package:route-after-rerun -- --artifact test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending",
      "Update Sprint Strategy Brief and Current Edge Card from the route result.",
      "npm run work:current-blocker -- --write",
      "npm run work:validate -- --entry",
      "npm run work:validate -- --pre-impl after review/fix proof is clean"
    ]
  },
  "predecessor": "work/packages/done-20260518-topology-publication-unknown-missing-published-nodes-runtime.md"
}
-->

## Why

The predecessor runtime slice drained the count-only missing-published-node
shape, but the representative gate still reports
`publication_ack_convergence / topology_publication_owner /
publication_convergence / publication_pending`. The remaining owner evidence is
now narrower: publication status is `unknown`, epoch is `0`, pending ACK count
is `0`, missing published count is `0`, owner stream outcome is `not_started`,
and priority residual witnesses are absent.

This package owns one focused runtime slice for that unknown/no-debt
publication-pending shape. It does not reopen startup active-gate, operation
workflow, readiness, admission, handoff architecture, or timeout ownership
unless fresh canonical evidence reselects those boundaries.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: rolling-restart topology workflow
stabilization and production guarantees for the AGPL runtime.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: canonical post-rerun route still selects
  `topology_publication_owner / publication_convergence`, and the selected
  architecture gate allows one bounded same-owner runtime successor.
- Escalation trigger to a heavier lane: the runtime slice needs files outside
  the declared topology publication owner boundary or fresh representative
  evidence contradicts the selected route.

## Core Logic Brief

- Canonical outcome: unknown/no-debt publication owner evidence must not keep
  `publication_pending` open solely because publication status is `unknown`
  when pending ACK count and missing published count are both zero.
- Inputs/signals: fresh representative artifact
  `test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json`;
  publication status and epoch; pending ACK count and node IDs; missing
  published count and node IDs; owner ack, revision, freshness, recovery, and
  stream states; priority residual extraction; active-gate handoff probe;
  causal model; focused owner tests.
- State model or invariant: collect publication evidence into one normalized
  owner snapshot before deciding. If the owner stream is `not_started`,
  recovery is `not_started`, ACK state is `not_required`, pending ACK count is
  zero, missing published count is zero, and no priority spread debt is
  present, the publication recovery gate must emit the closed/deferred
  owner-local outcome rather than reopening publication pending.
- Non-goals and forbidden interpretations: do not treat selected-source
  timeout, empty active-gate coverage, absent priority witnesses, readiness
  lag, admission state, or timeout expiry as authority to patch
  non-publication owners inside this package.
- Proof mapping: review/fix subagents must confirm the selected owner
  boundary; implementation must change only the declared publication owner
  runtime or focused tests; local tests and static guardrails must prove the
  owner outcome; representative or route-after-rerun proof must classify the
  scenario after the slice.
- Wrong-slice trigger: stop, split, or escalate if the focused probe requires
  startup active-gate, operation workflow, readiness, admission, handoff
  architecture, timeout-budget, or broad publication architecture edits.

## Expected Representative Delta

- Baseline artifact: `test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json`
- Expected delta: focused owner proof should make UNKNOWN/no-debt
  `not_started` publication evidence stop reporting `publication_pending`.
- Local proof class: focused topology publication owner runtime tests plus
  static guardrails for touched runtime files.
- Representative proof class: fresh rolling-restart rerun or canonical
  route-after-rerun result.
- Stop if unchanged: if the same frontier and publication-pending shape persist
  without a concrete metric, state, or boundary reduction, stop for
  architecture or human escalation instead of opening another local runtime
  patch.

## Rerun Decision Gate

- Source artifact: `test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json`
- Route owner: `topology_publication_owner`
- Route boundary: `publication_convergence`
- Route dominant reason: `publication_pending`
- Route causal outcome: `continue_local_fix`
- Stop mode: `classified_local_blocker`
- Next lane: `runtime-owner-boundary`
- Required after rerun: route-after-rerun, Sprint Strategy Brief and Current
  Edge Card update, current-blocker refresh, and phase-appropriate validation.

## Classification Efficiency

- Default mode: `inline-gate-default`
- Separate package reason: `successor-selection`
- Evidence budget: `one-artifact`; `two-or-three-canonical-commands`
- Decision record: the predecessor package recorded the reduced result; this
  package is the runtime successor and must update the current package rather
  than open another classifier for the same unchanged artifact.
- Successor action: `update-current-package`
- Runtime promotion rule: this package is the `runtime-owner-boundary`
  successor for stable `topology_publication_owner / publication_convergence`
  evidence.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc
`jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest
   <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`,
   `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus
   any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role>
   --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which
canonical extractor was tried and why it was insufficient.

## Workflow Acceleration Contract

1. Use `npm run work:advance -- --check` before adding more package prose; it
   combines doctor, subagent-next, and entry/pre-implementation validation.
2. Keep the durable proof ladder to 3-5 commands by default: prefer
   `npm run work:scenario-route -- <artifact>` for representative routing, one
   focused test or extractor, and validation. Add static guardrails only when
   implementation files changed.
3. If the focused probe cannot identify an owner-local runtime edit, stop for
   architecture or human escalation instead of widening the package.
4. Once an architecture gate has a selected route, do not open another gate
   unless fresh canonical evidence contradicts the selected route.

## In Scope

1. work/packages/active-20260518-topology-publication-unknown-no-debt-pending-runtime.md
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
- Owned files: `work/packages/active-20260518-topology-publication-unknown-no-debt-pending-runtime.md`, `work/sprints/active-2026-q2-topology-rolling-restart-green-gate-closure.md`, `work/sprints/current-blocker.md`, `work/sprints/current-blocker.json`, `work/model-ledger.jsonl`, `src/control-plane/publication-owner-evidence.js`, `src/control-plane/publication-owner-decision.js`, `src/control-plane/publication-recovery-gate.js`, `src/control-plane/publication-recovery-evidence.js`, `test/control-plane/publication-owner-stream.test.js`, `test/control-plane/publication-recovery-gate.test.js`, `test/control-plane/publication-recovery-evidence.test.js`
- Forbidden files: `startup active-gate runtime`, `operation workflow / rebalancer_handoff runtime`, `startup readiness runtime`, `active-gate admission`, `timeout budgets`, `handoff architecture`
- Frozen decisions: active-gate, operation-workflow, readiness, admission,
  handoff architecture, and timeout ownership remain out of scope unless fresh
  canonical evidence reselects them.
- Escalation triggers: owned files expand beyond this package, runtime
  ownership changes, or representative scenario evidence contradicts the
  selected route.
- Focused proof: `npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json`, `npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown`, `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --handoff-probe`, `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json`, `npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --markdown`
- Model ledger advisory: `escalate`

## Subagent Sequencing Ledger

Required before implementation because this runtime-owner-boundary package may
edit topology publication owner runtime and focused test files.

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

1. npm run work:evidence-summary -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json
2. npm run work:scenario-route -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --owner topology_publication_owner --boundary publication_convergence --dominant-reason publication_pending --explain publication_ack_convergence --markdown
3. npm run analyze:topology-convergence -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --handoff-probe
4. npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json
5. npm run analyze:priority-recovery-residuals -- test-output/reports/rolling-restart-after-unknown-missing-published-runtime-20260518T133616Z.report.json --markdown
