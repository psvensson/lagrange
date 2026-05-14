# Topology Missed Handoff ACK Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "write-ack-visibility",
  "artifact": "test-output/reports/topology-missed-handoff-ack-gate.report.json",
  "playback": "none",
  "owner": "topology_publication_owner",
  "boundary": "remote_handoff_ack_closure_gate",
  "dominantReason": "missed_handoff_ack_release_gate_unproven",
  "currentState": "Fresh failure-detection gate observation migrated to topology_publication_owner / publication_convergence with publication_pending before the failure-detector boundary could be evaluated. Publication-owner gate evidence is needed next.",
  "nextAction": "Execute and classify the missed-ACK publication-owner gate evidence only. If the gate is red, record the owner-boundary split; do not fix rolling-restart runtime behavior in this package without explicit re-scope.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-missed-handoff-ack-gate.report.json --verbose",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-missed-handoff-ack-gate.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-missed-handoff-ack-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260514-topology-publication-convergence-after-active-gate-owner-truth.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/control-plane/publication-owner-decision.js",
    "src/control-plane/publication-owner-evidence.js",
    "src/control-plane/publication-recovery-gate.js",
    "test/control-plane/publication-recovery-gate.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-missed-handoff-ack-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "modelFit": {
    "packageClass": "representative-frontier-closure",
    "intendedMinimumModel": "gpt-5.3-codex",
    "scopeShape": "owner-boundary-contraction/current-frontier",
    "escalationTriggers": [
      "owned files expand beyond this package",
      "a frozen decision must be reopened"
    ]
  },
  "causalGovernance": {
    "hypothesis": "topology_publication_owner / remote_handoff_ack_closure_gate proof should reduce, migrate, or classify missed_handoff_ack_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-missed-handoff-ack-gate.report.json",
    "expectedCausalModelChange": "missed_handoff_ack_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until topology_publication_owner / remote_handoff_ack_closure_gate is proven, the sprint representative rolling-restart residual stays open. Runtime rolling-restart fixes are out of scope for this observe/classify package.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "write-ack-visibility / topology_publication_owner / remote_handoff_ack_closure_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_publication_owner / remote_handoff_ack_closure_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier topology_publication_owner / remote_handoff_ack_closure_gate; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative publication/snapshot coverage remains red until green or migrated by a later runtime package",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_publication_owner / remote_handoff_ack_closure_gate causal edge for missed_handoff_ack_release_gate_unproven",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-missed-handoff-ack-gate.report.json --verbose",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_publication_owner / remote_handoff_ack_closure_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-missed-handoff-ack-gate.report.json",
    "expectedObservableTransition": "missed_handoff_ack_release_gate_unproven resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_publication_owner / remote_handoff_ack_closure_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Publication and remote handoff ACK closure have focused proof, but the release
gate has not proven what happens when a remote handoff ACK is missed. The
publication owner must not treat ACK absence as convergence; it must schedule a
bounded retry, verify durable progress, or terminally degrade with a precise
reason before publication closes.

This package owns the missed ACK release gate for
`topology_publication_owner / remote_handoff_ack_closure_gate`.

## Scope Basis

AGPL topology convergence item: incomplete remote handoffs and publication ACK
closure must be durable, bounded, and owner-truth based. It builds on the prior
publication convergence package.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named scenario gate with
  bounded publication owner candidate files.
- Escalation trigger to a heavier lane: the gate requires changing operation
  workflow remote handoff semantics, transport delivery semantics, or topology
  publication authority beyond ACK closure.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Execute `write-ack-visibility` as the missed handoff ACK gate.
2. Verify publication owner diagnostics distinguish ACK delivered, ACK missing
   but retryable, ACK stale beyond budget, and terminal degraded outcomes.
3. Verify ACK absence cannot close publication or active-gate publication
   projection.
4. Classify or split a missing publication-owner state; runtime fixes require
   a later explicit owner package.
5. Record gate artifact, durable owner result, and split target if red.

## Out Of Scope

1. treating-ack-absence-as-success
2. harness-timeout-increases
3. Remote coordinator handoff replay unless the gate shows ACK absence is
   caused by operation workflow owner state.
4. Active-gate cohort changes unrelated to ACK visibility.
5. rolling-restart-runtime-fixes-without-explicit-re-scope

## Entry Evidence

1. Focused publication convergence proof exists.
2. No missed ACK release-gate artifact currently proves retry-before-close.
3. Final ship evidence requires no missing publication or event-only handoff
   wait.

## Owner Contract To Prove

`topology_publication_owner` must treat handoff ACKs as durable owner state, not
best-effort events. The gate must prove:

1. ACK expectation names publication, node, partition/message group or operation
   if applicable.
2. Missing ACK schedules bounded retry with next-attempt timestamp.
3. Attempt count and stale budget are recorded.
4. Publication close checks ACK state from durable owner truth.
5. Terminal degraded reason is explicit when ACK cannot be recovered.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-missed-handoff-ack-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Treat candidate runtime files as read-only for this observe/classify pass.
   Promote a runtime candidate into `writeScope` and `commitScope` only if the
   user explicitly re-scopes this package from evidence classification to
   runtime repair.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-missed-handoff-ack-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-missed-handoff-ack-gate-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-missed-handoff-ack-gate-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-missed-handoff-ack-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-missed-handoff-ack-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `treating-ack-absence-as-success`, `harness-timeout-increases`, `rolling-restart-runtime-fixes-without-explicit-re-scope`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-missed-handoff-ack-gate.report.json --verbose`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-missed-handoff-ack-gate.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-missed-handoff-ack-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-missed-handoff-ack-gate.md
3. node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario write-ack-visibility --output test-output/reports/topology-missed-handoff-ack-gate.report.json --verbose
4. npm run analyze:distributed-failure -- --report test-output/reports/topology-missed-handoff-ack-gate.report.json
5. node scripts/check-guideline-literals.js src/control-plane/publication-owner-decision.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js
6. node scripts/check-guideline-decision-boundaries.js src/control-plane/publication-owner-decision.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js
7. npm run audit:runtime-grammar:file -- src/control-plane/publication-owner-decision.js src/control-plane/publication-owner-evidence.js src/control-plane/publication-recovery-gate.js test/control-plane/publication-recovery-gate.test.js
8. npm run work:validate -- --entry work/packages/active-20260514-topology-missed-handoff-ack-gate.md
9. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-missed-handoff-ack-gate.md
10. npm run work:validate -- --closure work/packages/active-20260514-topology-missed-handoff-ack-gate.md
11. git diff --check -- work/packages/active-20260514-topology-missed-handoff-ack-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
12. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If publication owner treats ACK absence as success, fix this package's owner
   boundary.
2. If operation workflow owner never records expected ACK, split to remote
   coordinator handoff.
3. If transport observation is unavailable but durable owner state is correct,
   split a harness/diagnostics package.
4. If stale projection remains after ACK state is correct, activate the stale
   publication durable truth gate.

## Acceptance Criteria

1. Gate artifact proves missed ACK retries, progresses, or terminally degrades
   before publication close.
2. Distributed analysis records durable convergence or a narrower
   owner-boundary blocker.
3. Publication owner evidence includes ACK state, next-attempt, attempt count,
   stale budget, and degraded reason.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
