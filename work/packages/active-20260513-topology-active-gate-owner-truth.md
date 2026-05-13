# Topology Active Gate Owner Truth

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "active",
  "opened": "2026-05-13",
  "lane": "runtime-owner-boundary",
  "scenario": "rolling-restart",
  "artifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
  "playback": "none",
  "owner": "startup_active_gate_owner",
  "boundary": "snapshot_coverage",
  "dominantReason": "snapshot_coverage_incomplete",
  "currentState": "Focused runtime checks have passed, and the representative rerun is red/migrated: active_gate_snapshot_coverage remains first frontier with snapshot_coverage_incomplete, snapshotCoverage=2/5, publishedActive=1/5, missingPublished=4, and canonical causal outcome migrate_owner_boundary to startup_readiness_owner / startup_support_evidence.",
  "nextAction": "Migrate the next package boundary to startup_readiness_owner / startup_support_evidence while preserving this active-gate owner-truth proof.",
  "proof": [
    "node --test test/bootstrap/node-joining-service.test.js",
    "npx tap test/bootstrap/bootstrap-api.test-part-5.js",
    "npx tap test/bootstrap/connect-websocket-phase.test.js",
    "node scripts/check-guideline-literals.js src/bootstrap/bootstrap-api.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/connect-websocket-phase.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js test/distributed/harness/cluster-segment-4.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js test/bootstrap/connect-websocket-phase.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/node-joining-service.test.js",
    "node scripts/check-guideline-decision-boundaries.js src/bootstrap/bootstrap-api.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/connect-websocket-phase.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js test/distributed/harness/cluster-segment-4.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js test/bootstrap/connect-websocket-phase.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/node-joining-service.test.js",
    "npm run audit:runtime-grammar:file -- src/bootstrap/bootstrap-api.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/connect-websocket-phase.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js test/distributed/harness/cluster-segment-4.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js test/bootstrap/connect-websocket-phase.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/node-joining-service.test.js",
    "git diff --check -- src/bootstrap/bootstrap-api.js src/bootstrap/bootstrap-api-runtime-methods.js src/bootstrap/bootstrap-service-runtime-methods.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/node-joining-service-segment-5.js src/bootstrap/owners/bootstrap-request-owner.js src/bootstrap/owners/move-replica-assignment-owner.js src/bootstrap/phases/connect-websocket-phase.js src/bootstrap/phases/contact-seed-phase.js src/bootstrap/phases/create-message-group-phase.js test/distributed/harness/cluster-segment-4.js test/distributed/harness/cluster-segment-7-class-4.js test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js test/bootstrap/connect-websocket-phase.test.js test/bootstrap/dynamic-partition-cdc-subscription.test.js test/bootstrap/move-replica-assignment-token.test.js test/bootstrap/node-joining-service.test.js",
    "npm run work:package:doctor -- work/packages/active-20260513-topology-active-gate-owner-truth.md",
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --fast-local --verbose",
    "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --explain active_gate_snapshot_coverage",
    "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json"
  ],
  "writeScope": [
    "work/packages/active-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-remote-handoff-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/join-readiness-evaluator-tail-methods.js",
    "src/bootstrap/node-joining-service-segment-1.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/connect-websocket-phase.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js",
    "test/bootstrap/connect-websocket-phase.test.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "handoffFiles": [
    "test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json"
  ],
  "generatedFiles": [],
  "candidateRuntimeFiles": [
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/join-readiness-evaluator-tail-methods.js",
    "src/bootstrap/node-joining-service-segment-1.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/connect-websocket-phase.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js"
  ],
  "commitScope": [
    "work/packages/active-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260513-topology-remote-handoff-convergence.md",
    "work/sprints/active-2026-q2-topology-convergence-ship-shape.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md",
    "src/bootstrap/bootstrap-api.js",
    "src/bootstrap/bootstrap-api-runtime-methods.js",
    "src/bootstrap/bootstrap-service-runtime-methods.js",
    "src/bootstrap/join-readiness-evaluator-tail-methods.js",
    "src/bootstrap/node-joining-service-segment-1.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/node-joining-service-segment-5.js",
    "src/bootstrap/owners/bootstrap-request-owner.js",
    "src/bootstrap/owners/move-replica-assignment-owner.js",
    "src/bootstrap/phases/connect-websocket-phase.js",
    "src/bootstrap/phases/contact-seed-phase.js",
    "src/bootstrap/phases/create-message-group-phase.js",
    "test/distributed/harness/cluster-segment-4.js",
    "test/distributed/harness/cluster-segment-7-class-4.js",
    "test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js",
    "test/bootstrap/connect-websocket-phase.test.js",
    "test/bootstrap/dynamic-partition-cdc-subscription.test.js",
    "test/bootstrap/move-replica-assignment-token.test.js",
    "test/bootstrap/node-joining-service.test.js"
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
    "hypothesis": "If startup_active_gate_owner / snapshot_coverage owns the current local blocker, active-gate convergence must be derived from owner truth and topology epoch instead of presentation publication alone.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
    "expectedCausalModelChange": "active_gate_snapshot_coverage either converges, reduces to a bounded startup_active_gate_owner sub-boundary, or migrates to startup_readiness_owner / startup_support_evidence after focused owner proof.",
    "representativeOutcome": "migrated",
    "causalDebt": "The focused active-gate owner-truth proof is green, priority recovery has zero witnesses, and the representative rerun is red/migrated: active_gate_snapshot_coverage remains first frontier with snapshot_coverage_incomplete, snapshotCoverage=2/5, publishedActive=1/5, missingPublished=4; canonical causal outcome is migrate_owner_boundary to startup_readiness_owner / startup_support_evidence.",
    "crossBoundaryReview": "Review subagent Dewey (019e22ce-cf29-7d43-b6db-9481bc1c4d5c) found predecessor metadata fixes; fix subagent Volta (019e22d4-34e7-75a2-8090-e3ffcdea50af) repaired the predecessor handoff and active package evidence before implementation."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "rolling-restart representative report after active-gate owner-truth proof",
    "phaseChain": [
      "startup active-gate snapshot coverage",
      "startup readiness support evidence"
    ],
    "currentFirstFrontier": "active_gate_snapshot_coverage under startup_active_gate_owner / snapshot_coverage with dominant reason snapshot_coverage_incomplete",
    "knownDownstreamBlockers": [
      "startup_readiness_owner / startup_support_evidence is the canonical owner-boundary migration target after active-gate owner-truth proof"
    ],
    "missingCausalEdge": "Active-gate coverage must explain expected nodes, ready leased nodes, published active nodes, missing nodes, pending repair operations, and evaluated topology epoch from owner truth.",
    "missingCausalEdgeProbe": "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
    "boundedProgressProof": "Focused active-gate timer, reconcile, and bounded progress runtime checks passed; the representative rerun records owner-truth coverage instead of letting PUBLISHED mask incomplete active coverage.",
    "boundedProgressProofArtifact": "test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
    "expectedObservableTransition": "active gate now exposes snapshotCoverage=2/5, publishedActive=1/5, missingPublished=4, and migrates the next boundary to startup_readiness_owner / startup_support_evidence.",
    "maxProgressBound": "one required review subagent, optional fix subagent if review finds fixes, one implementation subagent, focused owner proof, and representative rerun",
    "sameFrontierFallback": "not used; the representative rerun records canonical migrate_owner_boundary after active-gate owner-truth proof.",
    "expectedNextFrontier": "startup_readiness_owner / startup_support_evidence",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "startup_active_gate_owner",
    "fromBoundary": "snapshot_coverage",
    "toOwner": "startup_readiness_owner",
    "toBoundary": "startup_support_evidence",
    "reason": "After focused active-gate owner-truth runtime proof, the representative rerun records active_gate_snapshot_coverage with snapshot_coverage_incomplete, snapshotCoverage=2/5, publishedActive=1/5, missingPublished=4, and canonical causal outcome migrate_owner_boundary.",
    "evidence": [
      "node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --fast-local --verbose",
      "npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json",
      "npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json"
    ]
  }
}
-->

## Why

The current representative rolling-restart artifact has zero priority-recovery
witnesses and now records the active-gate owner-truth proof as red/migrated.
`active_gate_snapshot_coverage` remains visible with
`snapshot_coverage_incomplete`, `snapshotCoverage=2/5`, `publishedActive=1/5`,
and `missingPublished=4`, so the canonical next boundary is
`startup_readiness_owner / startup_support_evidence`.

## Scope Basis

Roadmap Phase `0.1 - Internal Coherence`: topology workflow stabilization,
failure simulations, and production guarantees. This package belongs to
`work/sprints/todo-2026-q2-topology-convergence-ship-shape.md`.

## Workflow Lane

- Selected lane: `runtime-owner-boundary`
- Why this lane is sufficient: the package targets one runtime owner boundary
  and its direct convergence consumers.
- Escalation trigger to a heavier lane: runtime ownership, shared contract,
  timeout policy, or representative scenario evidence changes.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Make active-gate convergence consume canonical owner truth instead of
   treating publication presentation as durable convergence.
2. Update this package metadata before activation with exact write scope,
   candidate runtime files, commit scope, and required subagent proof.
3. Start from the current representative artifact where priority recovery is
   satisfied, active-gate owner truth is exposed, and the causal outcome
   migrates to startup readiness support evidence.
4. Keep active-gate forced snapshot repair bounded to repairable coverage-gap
   owner observations; do not increase scenario timeouts.

## Subagent Sequencing Ledger

- [x] Review subagent recorded:
      `Agent Dewey (019e22ce-cf29-7d43-b6db-9481bc1c4d5c) reviewed
      work/packages/done-20260513-topology-remote-handoff-convergence.md;
      result fixes-required`.
- [x] Fix subagent recorded or explicitly not needed:
      `Agent Volta (019e22d4-34e7-75a2-8090-e3ffcdea50af) fixed
      work/packages/done-20260513-topology-remote-handoff-convergence.md`.
- [x] Implementation subagent recorded:
      `Agent Nietzsche (019e22db-2b29-78a0-ba9f-fbb8740cab13) implemented
      work/packages/active-20260513-topology-active-gate-owner-truth.md`.

## Out Of Scope

1. Priority-recovery remote handoff fixes.
2. Membership epoch implementation unless explicitly split into this package.
3. Pro or Enterprise behavior.

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/active-20260513-topology-active-gate-owner-truth.md`, `work/packages/done-20260513-topology-remote-handoff-convergence.md`, `work/sprints/active-2026-q2-topology-convergence-ship-shape.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`, `src/bootstrap/bootstrap-api.js`, `src/bootstrap/bootstrap-api-runtime-methods.js`, `src/bootstrap/bootstrap-service-runtime-methods.js`, `src/bootstrap/join-readiness-evaluator-tail-methods.js`, `src/bootstrap/node-joining-service-segment-1.js`, `src/bootstrap/node-joining-service-segment-2.js`, `src/bootstrap/node-joining-service-segment-5.js`, `src/bootstrap/owners/bootstrap-request-owner.js`, `src/bootstrap/owners/move-replica-assignment-owner.js`, `src/bootstrap/phases/connect-websocket-phase.js`, `src/bootstrap/phases/contact-seed-phase.js`, `src/bootstrap/phases/create-message-group-phase.js`, `test/distributed/harness/cluster-segment-4.js`, `test/distributed/harness/cluster-segment-7-class-4.js`, `test/distributed/harness/__tests__/node-handle-control-snapshot-fallback.test.js`, `test/bootstrap/connect-websocket-phase.test.js`, `test/bootstrap/dynamic-partition-cdc-subscription.test.js`, `test/bootstrap/move-replica-assignment-token.test.js`, `test/bootstrap/node-joining-service.test.js`
- Forbidden files: harness timeout increases, priority-recovery runtime changes without fresh first-frontier evidence, publication-convergence implementation without fresh first-frontier evidence, Pro behavior, Enterprise behavior.
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node --test test/bootstrap/node-joining-service.test.js`, `npx tap test/bootstrap/bootstrap-api.test-part-5.js`, `npx tap test/bootstrap/connect-websocket-phase.test.js`, `node scripts/check-guideline-literals.js ...` for the 19 package JS files, `node scripts/check-guideline-decision-boundaries.js ...` for the 19 package JS files, `npm run audit:runtime-grammar:file -- ...` for the 19 package JS files, `git diff --check -- ...` for the 19 package JS files, `npm run work:package:doctor -- work/packages/active-20260513-topology-active-gate-owner-truth.md`, and representative rerun `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --fast-local --verbose` with red/migrated outcome.
- Model ledger advisory: `escalate`

## Validation

1. `node --test test/bootstrap/node-joining-service.test.js` - passed.
2. `npx tap test/bootstrap/bootstrap-api.test-part-5.js` - passed.
3. `npx tap test/bootstrap/connect-websocket-phase.test.js` - passed.
4. `node scripts/check-guideline-literals.js ...` for the 19 package JS files - passed.
5. `node scripts/check-guideline-decision-boundaries.js ...` for the 19 package JS files - passed.
6. `npm run audit:runtime-grammar:file -- ...` for the 19 package JS files - passed.
7. `git diff --check -- ...` for the 19 package JS files - passed.
8. `npm run work:package:doctor -- work/packages/active-20260513-topology-active-gate-owner-truth.md` - passed.
9. `node test/distributed/run.js --config test/distributed/config/local.json --scenario rolling-restart --output test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --fast-local --verbose` - report red/migrated: `active_gate_snapshot_coverage`, `snapshot_coverage_incomplete`, `snapshotCoverage=2/5`, `publishedActive=1/5`, `missingPublished=4`, canonical causal outcome `migrate_owner_boundary` to `startup_readiness_owner / startup_support_evidence`.
10. `npm run work:evidence-summary -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json` - passed; causal outcome `migrate_owner_boundary`.
11. `npm run analyze:topology-convergence -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json --explain active_gate_snapshot_coverage` - passed; first frontier remains `active_gate_snapshot_coverage`.
12. `npm --silent run analyze:causal-model -- test-output/reports/rolling-restart-green-gate-after-active-gate-owner-truth.report.json` - passed; stop decision `owner_boundary_migration / migrate_owner_boundary`.
