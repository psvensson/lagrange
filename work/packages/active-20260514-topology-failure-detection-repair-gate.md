# Topology Failure Detection Repair Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/topology-failure-detection-repair-gate.report.json",
  "playback": "none",
  "owner": "failure_detector",
  "boundary": "durable_repair_intent_release_gate",
  "dominantReason": "failure_detection_repair_intent_not_release_proven",
  "currentState": "Migrated evidence: focused failure-detector tests pass, but the rolling-restart observe/classify gate did not reach the failure_detector boundary. Canonical first frontier is topology_publication_owner / publication_convergence with reason publication_pending.",
  "nextAction": "Close this package as migrated and activate a publication-owner gate package; do not fix rolling-restart runtime behavior in this package without explicit re-scope.",
  "proof": [
    "node test/node/failure-repair-intent-contract.test.js",
    "node test/node/failure-detector.test.js",
    "node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario rolling-restart --output test-output/reports/topology-failure-detection-repair-gate.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-failure-detection-repair-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-failure-detection-repair-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-failure-detection-repair-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-failure-detection-repair-gate.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/active-20260514-topology-failure-detection-repair-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-failure-repair-intents.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/node/failure-detector.js",
    "src/node/failure-repair-intent-contract.js",
    "test/node/failure-detector.test.js",
    "test/node/failure-repair-intent-contract.test.js"
  ],
  "commitScope": [
    "work/packages/active-20260514-topology-failure-detection-repair-gate.md",
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
    "hypothesis": "failure_detector / durable_repair_intent_release_gate proof should reduce, migrate, or classify failure_detection_repair_intent_not_release_proven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-failure-detection-repair-gate.report.json",
    "expectedCausalModelChange": "failure_detection_repair_intent_not_release_proven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "The failure-detection gate artifact is red, but canonical evidence does not implicate failure_detector / durable_repair_intent_release_gate. The first frontier migrated to topology_publication_owner / publication_convergence with publication_pending; runtime rolling-restart fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart / failure_detector / durable_repair_intent_release_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "failure_detector / durable_repair_intent_release_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "migrated frontier topology_publication_owner / publication_convergence with publication_pending in test-output/reports/topology-failure-detection-repair-gate.report.json",
    "knownDownstreamBlockers": [
      "rolling-restart representative publication/snapshot coverage remains red until green or migrated by a later runtime package",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven failure_detector / durable_repair_intent_release_gate causal edge for failure_detection_repair_intent_not_release_proven",
    "missingCausalEdgeProbe": "npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for failure_detector / durable_repair_intent_release_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-failure-detection-repair-gate.report.json",
    "expectedObservableTransition": "failure_detection_repair_intent_not_release_proven resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop without runtime repair in this package.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep failure_detector / durable_repair_intent_release_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "publication owner gate package selected by canonical evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "failure_detector",
    "fromBoundary": "durable_repair_intent_release_gate",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "fresh rolling-restart gate first frontier is publication_ack_convergence / publication_pending before failure-detector release-gate evidence can be evaluated",
    "evidence": "test-output/reports/topology-failure-detection-repair-gate.report.json"
  }
}
-->

## Why

Failure detection currently has focused proof that it can name durable repair
intents, but the release concern is stronger: when a node or service is marked
failed in a distributed scenario, repair work must be durably enqueued and
consumed by the relevant owner. Emitting events and updating local node/service
state is necessary but not sufficient.

This package owns the release gate that proves failure detection transitions
from observation to durable owner-key repair work under rolling restart or
node-failure conditions.

## Scope Basis

AGPL topology convergence item: make failure detection enqueue durable repair
work. Prior focused proof is
`work/packages/done-20260513-topology-failure-repair-intents.md`; this package
promotes that contract to scenario evidence.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: it pairs focused failure-detector tests with a
  distributed release gate and splits any red runtime gap to the owning repair
  intent boundary.
- Escalation trigger to a heavier lane: failure repair intent schema, topology
  epoch fencing, or anti-entropy ownership must change beyond the named
  candidate runtime files.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Confirm focused tests still prove failure detector repair-intent creation.
2. Execute the distributed failure-detection gate and capture artifact path.
3. Verify every failure observation names affected node, service, partition or
   replica operation where applicable, owner key, repair intent type, retry
   budget, and consumer owner.
4. Classify or split any path where failure detection only emits events or
   mutates local state without durable repair intent consumption; runtime fixes
   require a later explicit owner package.
5. Record gate outcome and owner-boundary next action in this package and the
   active sprint.

## Out Of Scope

1. event-only-repair-continuation
2. local-fallback-repair-mutation
3. Broad anti-entropy repairs not triggered by the failure detector gate.
4. Active-gate cohort fixes unless the gate proves failure repair is the active
   coverage blocker.
5. rolling-restart-runtime-fixes-without-explicit-re-scope

## Entry Evidence

1. Focused repair-intent tests exist.
2. No executed release-gate artifact currently proves failure detection repair
   under distributed restart/failure.
3. Sprint ship criteria require durable convergence, not event emission.

## Owner Contract To Prove

`failure_detector` must convert failure observations into durable repair intents
that are consumed by the correct owner. The release gate must prove:

1. Observation carries membership/topology epoch.
2. Repair intent names affected node/service/partition/operation.
3. Durable owner key is written before event wakeup is considered sufficient.
4. Consumer owner acknowledges or retries with bounded next attempt.
5. Terminal degraded reason exists when repair cannot complete.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-failure-detection-repair-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Treat candidate runtime files as read-only for this observe/classify pass.
   Promote a runtime candidate into `writeScope` and `commitScope` only if the
   user explicitly re-scopes this package from evidence classification to
   runtime repair.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-failure-detection-repair-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-detection-repair-gate-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-detection-repair-gate-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-failure-detection-repair-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260514-topology-failure-detection-repair-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `event-only-repair-continuation`, `local-fallback-repair-mutation`, `rolling-restart-runtime-fixes-without-explicit-re-scope`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/node/failure-repair-intent-contract.test.js`, `node test/node/failure-detector.test.js`, `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario rolling-restart --output test-output/reports/topology-failure-detection-repair-gate.report.json --verbose`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/active-20260514-topology-failure-detection-repair-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/active-20260514-topology-failure-detection-repair-gate.md
3. node test/node/failure-repair-intent-contract.test.js
4. node test/node/failure-detector.test.js
5. node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario rolling-restart --output test-output/reports/topology-failure-detection-repair-gate.report.json --verbose
6. npm run work:evidence-summary -- test-output/reports/topology-failure-detection-repair-gate.report.json
7. npm run analyze:topology-convergence -- test-output/reports/topology-failure-detection-repair-gate.report.json
8. npm --silent run analyze:causal-model -- test-output/reports/topology-failure-detection-repair-gate.report.json
9. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-failure-detection-repair-gate.report.json --markdown
10. node scripts/check-guideline-literals.js work/packages/active-20260514-topology-failure-detection-repair-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
11. node scripts/check-guideline-decision-boundaries.js work/packages/active-20260514-topology-failure-detection-repair-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
12. npm run work:validate -- --entry work/packages/active-20260514-topology-failure-detection-repair-gate.md
13. npm run work:validate -- --pre-impl work/packages/active-20260514-topology-failure-detection-repair-gate.md
14. npm run work:validate -- --closure work/packages/active-20260514-topology-failure-detection-repair-gate.md
15. git diff --check -- work/packages/active-20260514-topology-failure-detection-repair-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
16. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If repair intent is missing, split to failure detector runtime owner.
2. If intent exists but owner does not consume it, split to the relevant repair
   consumer owner.
3. If stale epoch observations race with repair, split to membership epoch
   fencing.
4. If gate failure is purely harness injection/observation, split to harness
   execution package.

## Acceptance Criteria

1. Gate artifact proves durable repair intent creation and consumption.
2. No final critical state relies only on event delivery.
3. Distributed analysis is green for this gate or records a narrower
   owner-boundary blocker.
4. Package records exact artifact, owner, boundary, and residual if any.

## Evidence Proof

- Focused tests:
  `node test/node/failure-repair-intent-contract.test.js` passed `8/8`;
  `node test/node/failure-detector.test.js` passed `66/66`.
- Historical package command caveat:
  `npx tap test/node/failure-repair-intent-contract.test.js test/node/failure-detector.test.js`
  exited `0` but reported `skip/no tests found`; the package proof now uses
  direct node execution for these tap ESM tests.
- Gate artifact:
  `node test/distributed/run.js --config test/distributed/config/local-three-node.json --scenario rolling-restart --output test-output/reports/topology-failure-detection-repair-gate.report.json --verbose`
  produced `0/1` passed, `1` failed after `55.8s`.
- Canonical classification:
  `work:evidence-summary`, `analyze:topology-convergence`, and
  `analyze:causal-model` all select `publication_ack_convergence` as the first
  frontier with owner `topology_publication_owner`, boundary
  `publication_convergence`, and dominant reason `publication_pending`.
- Priority recovery check:
  `analyze:priority-recovery-residuals --markdown` reports `0` witnesses and
  `splitRequired=false` for this artifact.
- Result classification: `migrated`. The failure-detection gate did not reach
  the failure-detector owner boundary; the next active blocker should be a
  publication-owner gate/package. No runtime code was changed.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
