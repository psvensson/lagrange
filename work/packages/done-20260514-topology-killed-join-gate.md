# Topology Killed Join Gate

<!-- work-package
{
  "schema": "work-package-v1",
  "status": "done",
  "opened": "2026-05-14",
  "lane": "scenario-release-gate",
  "scenario": "node-join-under-load",
  "artifact": "test-output/reports/topology-killed-join-gate.report.json",
  "playback": "none",
  "owner": "topology_join_owner",
  "boundary": "join_admission_rebalance_gate",
  "dominantReason": "missing_published_nodes_present",
  "currentState": "Observed gate result: node-join-under-load failed after 108325ms waiting for benchmark_events partition visibility. Canonical topology evidence did not reach topology_join_owner / join_admission_rebalance_gate; the first frontier is topology_publication_owner / publication_convergence with missingPublishedCount=4, publicationPending=true, activeGateState=timed_out, snapshotCoverageNodeCount=1/5, and priority recovery residual witnesses=0.",
  "nextAction": "Close this package as migrated and activate the next remaining failure-gate package; do not fix rolling-restart runtime behavior in this package without explicit re-scope.",
  "proof": [
    "node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/topology-killed-join-gate.report.json --verbose",
    "npm run work:evidence-summary -- test-output/reports/topology-killed-join-gate.report.json",
    "npm run analyze:distributed-failure -- --report test-output/reports/topology-killed-join-gate.report.json",
    "npm run analyze:topology-convergence -- test-output/reports/topology-killed-join-gate.report.json",
    "npm --silent run analyze:causal-model -- test-output/reports/topology-killed-join-gate.report.json",
    "npm run analyze:priority-recovery-residuals -- test-output/reports/topology-killed-join-gate.report.json --markdown"
  ],
  "writeScope": [
    "work/packages/done-20260514-topology-killed-join-gate.md",
    "work/sprints/active-2026-q2-topology-convergence-residual-closure.md",
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "handoffFiles": [
    "work/packages/done-20260513-topology-membership-epoch-fencing.md",
    "work/packages/done-20260513-topology-active-gate-owner-truth.md",
    "work/packages/done-20260514-topology-stale-publication-durable-truth-gate.md"
  ],
  "generatedFiles": [
    "work/sprints/current-blocker.json",
    "work/sprints/current-blocker.md"
  ],
  "candidateRuntimeFiles": [
    "src/bootstrap/node-joining-service-segment-1.js",
    "src/bootstrap/node-joining-service-segment-2.js",
    "src/bootstrap/join-readiness-evaluator-tail-methods.js",
    "src/control-plane/membership-epoch-contract.js",
    "test/bootstrap/node-joining-service.test.js"
  ],
  "commitScope": [
    "work/packages/done-20260514-topology-killed-join-gate.md",
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
    "hypothesis": "topology_join_owner / join_admission_rebalance_gate proof should reduce, migrate, or classify killed_join_release_gate_unproven without hiding the sprint representative residual.",
    "stopConditionCheck": "npm --silent run analyze:causal-model -- test-output/reports/topology-killed-join-gate.report.json",
    "expectedCausalModelChange": "killed_join_release_gate_unproven becomes representative-green, reduced, same-frontier, migrated, or classification-only with a named owner-boundary reason.",
    "representativeOutcome": "migrated",
    "causalDebt": "The killed-join gate artifact is red, but canonical evidence does not implicate topology_join_owner / join_admission_rebalance_gate. The first frontier migrated to topology_publication_owner / publication_convergence with missing_published_nodes_present; runtime rolling-restart fixes remain out of scope.",
    "crossBoundaryReview": "Required before closure through the scenario-release-gate subagent ledger or an allowed waiver recorded in this package."
  },
  "scenarioCausalClosure": {
    "referenceScenarioOrProbe": "node-join-under-load / topology_join_owner / join_admission_rebalance_gate",
    "phaseChain": [
      "canonical evidence extraction",
      "topology_join_owner / join_admission_rebalance_gate focused proof",
      "representative or gate rerun classification"
    ],
    "currentFirstFrontier": "migrated frontier topology_publication_owner / publication_convergence with missing_published_nodes_present in test-output/reports/topology-killed-join-gate.report.json",
    "knownDownstreamBlockers": [
      "rolling-restart representative active-gate snapshot coverage remains red until green or migrated",
      "runtime or harness fixes discovered outside this owner boundary require a narrower successor package"
    ],
    "missingCausalEdge": "unproven topology_join_owner / join_admission_rebalance_gate causal edge for killed_join_release_gate_unproven",
    "missingCausalEdgeProbe": "node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/topology-killed-join-gate.report.json --verbose",
    "boundedProgressProof": "Focused proof must show bounded wake, retry, timeout, reconcile, drain, dispatch, delivery, timer, or advance for topology_join_owner / join_admission_rebalance_gate.",
    "boundedProgressProofArtifact": "test-output/reports/topology-killed-join-gate.report.json",
    "expectedObservableTransition": "killed_join_release_gate_unproven migrated before the join owner boundary: publicationStatus=PUBLISHED with pendingAckCount=0, missingPublishedCount=4, publicationPending=true, and activeGateState=timed_out.",
    "maxProgressBound": "one activation cycle: package doctor, extractor/probe, owner-file proof, focused validation, and result classification",
    "sameFrontierFallback": "keep topology_join_owner / join_admission_rebalance_gate active and do not broaden the package or claim ship proof",
    "expectedNextFrontier": "next remaining failure-gate package unless a narrower canonical blocker is explicitly activated",
    "resultClassification": "migrated",
    "stopCondition": "migrate-owner-boundary"
  },
  "ownerBoundaryMigrationProof": {
    "fromOwner": "topology_join_owner",
    "fromBoundary": "join_admission_rebalance_gate",
    "toOwner": "topology_publication_owner",
    "toBoundary": "publication_convergence",
    "reason": "fresh node-join-under-load gate first frontier is publication_ack_convergence / missing_published_nodes_present before killed-join release-gate evidence can be evaluated",
    "evidence": "test-output/reports/topology-killed-join-gate.report.json"
  },
  "closed": "2026-05-14",
  "commitAndPushLedgerRequired": true,
  "successor": "work/packages/done-20260514-topology-killed-rejoin-gate.md"
}
-->

## Why

Join admission and membership epoch fencing have focused proof, but the release
risk is a node dying while joining under load. Stale join observations can race
with placement, publication, and active-gate admission unless the durable join
intent and topology epoch fence the entire path.

This package owns the killed-join release gate for `topology_join_owner /
join_admission_rebalance_gate`.

## Scope Basis

AGPL topology convergence item: add a membership/topology epoch and promote
node-killed-during-join to a release gate. It builds on focused membership epoch
and active-gate owner-truth packages.

## Workflow Lane

- Selected lane: `scenario-release-gate`
- Why this lane is sufficient: the package is a named distributed scenario gate
  with candidate join and membership epoch files.
- Escalation trigger to a heavier lane: the gate requires new cluster
  membership semantics, placement-owner changes, or active-gate admission
  changes beyond killed-join convergence.

## LLM Tool-First Contract

Before raw JSON, raw logs, broad file search, oversized segment files, or ad hoc `jq`, use the canonical workflow command that owns the question:

1. Package metadata or ledger edits: `npm run work:package:doctor -- --suggest <package>`, `npm run work:package:doctor -- --fix-dry-run <package>`, `npm run work:package:schema`, or `npm run work:package:new -- ...`.
2. Representative evidence: `npm run work:evidence-summary -- <artifact>` plus any focused extractor for this failure class.
3. Owner discovery: `npm run analyze:owner-files -- <owner> [boundary]`.
4. Subagent sequencing: `npm run work:subagent-prompt -- --role <role> --package <package>`.
5. Large-file cleanup: `npm run work:oversized-next -- --markdown`.

If a fallback to raw JSON, raw logs, or ad hoc `jq` is needed, record which canonical extractor was tried and why it was insufficient.

## In Scope

1. Execute `node-join-under-load` as the killed-join gate.
2. Verify durable join intent state before and after the joining node dies.
3. Verify topology epoch is carried through boot, join, admission, rebalance,
   publication, and active-gate checks.
4. Verify stale join/rejoin observations cannot win after a newer topology
   generation.
5. Fix or split any gap in join admission, rebalance repair, or active
   admission after the killed join.

## Out Of Scope

1. pro-or-enterprise-behavior
2. admission-success-from-degraded-evidence
3. Rejoin recovery; killed rejoin has its own package.
4. Broad placement capacity policy unless the killed-join gate proves it is the
   failing owner boundary.

## Entry Evidence

1. Focused membership epoch fencing exists.
2. Focused active-gate owner truth exists.
3. No release artifact currently proves killed join convergence under load.

## Owner Contract To Prove

`topology_join_owner` must make join admission durable and epoch-fenced. The
gate must prove:

1. Join intent is durable and names node, epoch, and expected placement effect.
2. Killing the joining node either cancels or terminally classifies that intent
   with a precise reason.
3. Rebalance/repair work is enqueued durably for affected partitions and
   message groups.
4. Active admission ignores stale join observations from older epochs.
5. Final topology converges or reports a degraded placement reason.

## Activation Contract

Required before this package moves from `todo` to `active`:

1. Run `npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-killed-join-gate.md` and keep `causalGovernance`, `scenarioCausalClosure`, Model Fit, and scope fields concrete before implementation starts.
2. Promote only these proven candidates into `writeScope` and `commitScope` after owner-file proof: `src/bootstrap/node-joining-service-segment-1.js`, `src/bootstrap/node-joining-service-segment-2.js`, `src/bootstrap/join-readiness-evaluator-tail-methods.js`, `src/control-plane/membership-epoch-contract.js`, `test/bootstrap/node-joining-service.test.js`.
3. Replace the Subagent Sequencing Ledger placeholders with real review/fix/implementation proof, or an allowed waiver, before pre-implementation and closure validation.
4. Preserve the package artifact path `test-output/reports/topology-killed-join-gate.report.json`; if fresh evidence changes owner, boundary, or dominant reason, classify as `migrated`, `same-frontier`, or split instead of widening scope.
5. Add static guardrails for every touched runtime, diagnostics, harness, tracker, or test file before closure: guideline literal check, decision-boundary check, runtime grammar audit where applicable, and the exact `git diff --check -- ...` command from this package Validation Ladder.
6. Record a final deep-dive proof that compares package-local evidence with the sprint representative residual and classifies the result as `representative-green`, `reduced`, `same-frontier`, `migrated`, or `classification-only`.
7. Same-frontier fallback keeps this exact owner/boundary active; do not close the package as ship proof while the sprint representative residual remains red.

## Subagent Sequencing Ledger

Required when this package is activated because it is a scenario-release-gate
package.

- [x] Review subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-killed-join-gate-review
- [x] Fix subagent recorded or explicitly not needed:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-killed-join-gate-fix
- [x] Implementation subagent recorded:
      blocked-by-environment-policy reason: subagent-spawn-requires-explicit-user-request-for-killed-join-gate-implementation

## Model Fit

- Package class: `representative-frontier-closure`
- Intended minimum model: `gpt-5.3-codex`
- Scope shape: `owner-boundary-contraction/current-frontier`
- Owned files: `work/packages/done-20260514-topology-killed-join-gate.md`, `work/sprints/active-2026-q2-topology-convergence-residual-closure.md`, `work/sprints/current-blocker.json`, `work/sprints/current-blocker.md`
- Forbidden files: `pro-or-enterprise-behavior`, `admission-success-from-degraded-evidence`
- Frozen decisions: package scope and lane stay bounded unless explicitly escalated.
- Escalation triggers: owned files expand beyond this package, runtime ownership changes, or representative scenario evidence changes.
- Focused proof: `node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/topology-killed-join-gate.report.json --verbose`, `npm run work:evidence-summary -- test-output/reports/topology-killed-join-gate.report.json`, `npm run analyze:distributed-failure -- --report test-output/reports/topology-killed-join-gate.report.json`
- Model ledger advisory: `escalate`

## Validation Ladder

1. npm run work:package:doctor -- --suggest work/packages/done-20260514-topology-killed-join-gate.md
2. npm run work:package:doctor -- --fix-dry-run work/packages/done-20260514-topology-killed-join-gate.md
3. node test/distributed/run.js --config test/distributed/config/local.json --scenario node-join-under-load --output test-output/reports/topology-killed-join-gate.report.json --verbose
4. npm run work:evidence-summary -- test-output/reports/topology-killed-join-gate.report.json
5. npm run analyze:distributed-failure -- --report test-output/reports/topology-killed-join-gate.report.json
6. npm run analyze:topology-convergence -- test-output/reports/topology-killed-join-gate.report.json
7. npm --silent run analyze:causal-model -- test-output/reports/topology-killed-join-gate.report.json
8. npm run analyze:priority-recovery-residuals -- test-output/reports/topology-killed-join-gate.report.json --markdown
9. node scripts/check-guideline-literals.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/control-plane/membership-epoch-contract.js test/bootstrap/node-joining-service.test.js
10. node scripts/check-guideline-decision-boundaries.js src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/control-plane/membership-epoch-contract.js test/bootstrap/node-joining-service.test.js
11. npm run audit:runtime-grammar:file -- src/bootstrap/node-joining-service-segment-1.js src/bootstrap/node-joining-service-segment-2.js src/bootstrap/join-readiness-evaluator-tail-methods.js src/control-plane/membership-epoch-contract.js test/bootstrap/node-joining-service.test.js
12. npm run work:validate -- --entry work/packages/done-20260514-topology-killed-join-gate.md
13. npm run work:validate -- --pre-impl work/packages/done-20260514-topology-killed-join-gate.md
14. npm run work:validate -- --closure work/packages/done-20260514-topology-killed-join-gate.md
15. git diff --check -- work/packages/done-20260514-topology-killed-join-gate.md work/sprints/active-2026-q2-topology-convergence-residual-closure.md work/sprints/current-blocker.json work/sprints/current-blocker.md
16. Final deep-dive proof: rerun the package extractor/probe, compare against the sprint representative residual, and record the result classification before closure.

## Split Rules

1. If stale epoch wins, split to membership epoch fencing.
2. If join intent is not durable, split to join owner runtime boundary.
3. If placement repair is missing, split to topology rebalance/placement owner.
4. If active gate admits prematurely, split to active-gate owner cohort.

## Acceptance Criteria

1. Gate artifact plus analyzer prove killed-join durable convergence.
2. Join owner diagnostics include node, epoch, durable intent, repair work,
   next-attempt, and terminal/degraded reason.
3. No admission success is inferred from degraded or stale evidence.

## Observed Gate Result

`node-join-under-load` failed after `108325ms` while waiting for
`benchmark_events` table partition visibility. The last create error was an
Admin API query timeout on node
`7493b0ab-a054-5fad-a91b-5e331db29304`.

Canonical topology evidence did not reach the killed-join owner boundary. The
first frontier is `topology_publication_owner / publication_convergence` with
`missing_published_nodes_present`, `publicationStatus=PUBLISHED`,
`pendingAckCount=0`, `missingPublishedCount=4`, and `publicationPending=true`.
The next expected frontier is active-gate snapshot coverage, blocked with
`activeGateState=timed_out` and snapshot coverage `1/5`.

Priority recovery residual extraction reported `Witnesses: 0` and
`Split required: false`. This package is therefore migrated rather than widened
into a join-owner or rolling-restart runtime repair.

## Commit And Push Ledger

Required at closure.

1. [x] Focused package commit: 9b0f9705225680465d9a7d2e18badc2b711812ae.
2. [x] Pushed to: origin/codex/pending-ack-eligibility-filter.
3. [x] Commit contains only package-owned files/package-status/allowed sprint handoff: yes.
