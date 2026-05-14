# Topology Killed Rejoin Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "todo",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "seed-restart-under-load",
  "artifact": "none",
  "playback": "none",
  "owner": "topology_rejoin_owner",
  "boundary": "post_restore_reconciliation_gate",
  "dominantReason": "killed_rejoin_release_gate_unproven",
  "currentState": "Post-rejoin reconciliation gates active admission in focused proof but killed-rejoin distributed convergence has not been executed as a release gate.",
  "nextAction": "Execute the killed-rejoin gate and close gaps in local service reconciliation remote operation rearm repair intent consumption and active admission fencing.",
  "proof": [
    "npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario seed-restart-under-load --output test-output/reports/topology-killed-rejoin-gate.report.json --verbose"
  ],
  "writeScope": [
    "work/packages/todo-20260514-topology-killed-rejoin-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-post-rejoin-reconciliation.md",
    "work/packages/done-20260513-topology-failure-repair-intents.md"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/control-plane/rejoin-reconciliation-contract.js",
    "src/node/node-reintegration-service.js",
    "src/node/node-constants.js",
    "test/control-plane/rejoin-reconciliation-contract.test.js",
    "test/node/node-reintegration-service.test.js"
  ],
  "commitScope": [
    "work/packages/todo-20260514-topology-killed-rejoin-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md"
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
    "hypothesis": "topology_rejoin_owner / post_restore_reconciliation_gate proof should reduce, migrate, or classify killed_rejoin_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-killed-rejoin-gate.report.json",
    "expectedCausalModelChange": "killed_rejoin_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "pending-before-rerun",
    "causalDebt": "Until topology_rejoin_owner / post_restore_reconciliation_gate is proven, the sprint representative rolling-restart residual stays open at startup_active_gate_owner / snapshot_coverage.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "seed-restart-under-load / topology_rejoin_owner / post_restore_reconciliation_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_rejoin_owner / post_restore_reconciliation_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "package-local frontier topology_rejoin_owner / post_restore_reconciliation_gate; sprint representative frontier remains startup_active_gate_owner / snapshot_coverage until fresh evidence changes it",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_rejoin_owner / post_restore_reconciliation_gate causal edge for killed_rejoin_release_gate_unproven",
    "missingCausalEdgeProbe": "npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_rejoin_owner / post_restore_reconciliation_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-killed-rejoin-gate.report.json",
    "expectedObservableTransition": "killed_rejoin_release_gate_unproven resolves to green evidence, a reduced residual, same-frontier evidence, migrated owner-boundary proof, or classification-only stop.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_rejoin_owner / post_restore_reconciliation_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "representative green evidence or a narrower owner-boundary blocker selected by canonical evidence",
    "resultClassification": "pending-before-probe",
    "stopCondition": "continue-local-fix"
  }
}
-->

## Why

Post-rejoin reconciliation has focused proof, but a node killed during rejoin
can leave local partition services, remote operation rearm, repair intents, and
active placement admission out of sync. The sprint intent requires rejoin to
restore local services and reconcile with durable truth before the node is fully
active for placement.

This package owns the killed-rejoin release gate for
`topology_rejoin_owner / post_restore_reconciliation_gate`.

## Scope Basis

AGPL topology convergence item: add mandatory post-rejoin reconciliation and
promote node killed during rejoin to a release gate. It builds on the prior
post-rejoin reconciliation and failure repair intent packages.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named distributed scenario gate
  with bounded rejoin/reintegration candidate files.
- Escalation trigger to a heavier lane: rejoin requires redesigning partition
  service ownership, operation workflow ownership, or placement admission
  beyond post-restore reconciliation.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Confirm focused rejoin reconciliation tests still prove local gating.
2. Execute `seed-restart-under-load` as the killed-rejoin gate.
3. Verify local restored partition services are compared against the durable
   partition map.
4. Verify replica operations assigned to or coordinated by the rejoining node
   are reconciled and rearmed.
5. Verify repair intent consumption occurs before the node is fully active for
   placement.
6. Fix or split any gap in active admission fencing, local service repair, or
   remote operation rearm.

## Out Of Scope

1. placement-target-before-reconciliation
2. local-fallback-repair-mutation
3. Join admission before a node has durable rejoin identity.
4. Broad anti-entropy repair outside rejoin-owned reconciliation.

## Entry Evidence

1. Focused post-rejoin reconciliation proof exists.
2. Focused failure repair intent proof exists.
3. No distributed killed-rejoin gate artifact currently proves convergence.

## Owner Contract To Prove

`topology_rejoin_owner` must make post-restore reconciliation mandatory before
placement-active admission. The gate must prove:

1. Local restored services are compared to durable partition map.
2. Missing local service state is repaired through durable owner-key work.
3. Replica operations assigned to or coordinated by the node are reconciled.
4. Coordinator-created handoffs are rearmed.
5. Node active state is fenced until reconciliation is complete or degraded
   with a precise reason.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260514-topology-killed-rejoin-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/control-plane/rejoin-reconciliation-contract.js`, `src/node/node-reintegration-service.js`, `src/node/node-constants.js`, `test/control-plane/rejoin-reconciliation-contract.test.js`, `test/node/node-reintegration-service.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-killed-rejoin-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

1. [ ] Review subagent recorded: pending until package activation.
2. [ ] Fix subagent recorded or explicitly not needed: pending until review
   result.
3. [ ] Implementation subagent recorded: pending until pre-implementation proof
   is clean.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/todo-20260514-topology-killed-rejoin-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`
- Forbidden files: `placement-target-before-reconciliation`, `local-fallback-repair-mutation`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js`, `node test/distributed/run.js --config test/distributed/config/local.json --scenario seed-restart-under-load --output test-output/reports/topology-killed-rejoin-gate.report.json --verbose`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/todo-20260514-topology-killed-rejoin-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/todo-20260514-topology-killed-rejoin-gate.md
3. npx tap test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js
4. node test/distributed/run.js --config test/distributed/config/local.json --scenario seed-restart-under-load --output test-output/reports/topology-killed-rejoin-gate.report.json --verbose
5. node scripts/check-guideline-literals.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js
6. node scripts/check-guideline-decision-boundaries.js src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js
7. npm run audit:runtime-grammar:file -- src/control-plane/rejoin-reconciliation-contract.js src/node/node-reintegration-service.js src/node/node-constants.js test/control-plane/rejoin-reconciliation-contract.test.js test/node/node-reintegration-service.test.js
8. npm run work:validate -- --entry work/packages/todo-20260514-topology-killed-rejoin-gate.md
9. npm run work:validate -- --pre-impl work/packages/todo-20260514-topology-killed-rejoin-gate.md
10. npm run work:validate -- --closure work/packages/todo-20260514-topology-killed-rejoin-gate.md
11. git diff --check -- work/packages/todo-20260514-topology-killed-rejoin-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md
12. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If local service repair is missing, split to rejoin reconciliation runtime.
2. If replica operations are not rearmed, split to operation workflow owner.
3. If failure repair intent is not consumed, split to failure repair owner.
4. If active admission ignores reconciliation state, split to active-gate owner.

## Acceptance Criteria

1. Gate artifact proves node killed during rejoin converges or produces a
   precise degraded owner reason.
2. Focused tests prove active placement admission is impossible before
   reconciliation.
3. Distributed analysis reports no local fallback repair mutation as final
   topology recovery.

## Commit And Push Ledger

Required at closure.

1. [ ] Focused package commit: pending.
2. [ ] Pushed to: pending.
3. [ ] Commit contains only package-owned files/package-status/allowed sprint
   handoff: pending.
