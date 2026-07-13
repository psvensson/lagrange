# Solve report: voter-readiness-owner-migration-rebalancer-batch2

**Goal:** Bounded child of voter-readiness-visibility-single-owner-table (scope-pressure split, batch 2: rebalancer + control-plane owner areas; sibling of voter-readiness-owner-migration-raft-node-admin; supersedes voter-readiness-owner-migration-rebalancer-control-plane, unrecordable due to a scope-classifier keyword in its sealed text). SEALED RESULT: the remaining censused voter-readiness re-derivations consume the owner table src/raft/replica-voter-readiness.js — isVoterReadyReplicaTopology (priority-publication-safety-topology), normalizeObservedReplicaLifecycle (replica-operation-repository-observation-methods), getHealthyReplicas (unified-rebalancer-budget-planning), and resolvePriorityRecoveryTargetServiceRowVisibilityState (priority-recovery-snapshot-rebalancer) use isVoterRaftRole (their truthy-plus-non-learner shape); the learner-exclusion sites (membership-publication-priority-partition-summary, priority-recovery-snapshot-burndown, the unified-rebalancer control-plane readiness trim) use isCatchupLearnerRaftRole preserving their exact fail-open-on-absent-role behavior; the two laundered learner scalar aliases (PRIORITY_RECOVERY_RAFT_ROLE_LEARNER in the priority-recovery snapshot constants module, CONTROL_PLANE_PUBLICATION_TRIM_RAFT_LEARNER in the readiness methods module) are DELETED. The owner module carries a red-on-revert guard test (test/raft/replica-voter-readiness.test.js, dt:prove PROVEN) pinning the named-row memberships (quorum_voter includes candidate, load_routable excludes it, fail-closed predicates). Known fixture correction: three test files used the out-of-domain role string 'voter' which only passed under the old fail-open comparisons; fixtures aligned to 'follower' (production writes only RAFT_ROLE enum values via normalizePublishedRaftRole). doneWhen: scripts/check-voter-readiness-single-owner.js --oracle --oracle-file solve/oracle/voter-readiness-owner-migration-rebalancer-batch2.json --done-at 0 --with-gates reports census metric 0 with lint + targeted suites green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/voter-readiness-owner-migration-rebalancer-batch2.json

**Attempts:** 1

## Links
- parent quest: voter-readiness-visibility-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 12
- Change bytes: 15705
- Owner areas: src/control-plane, src/rebalancer, test/control-plane, test/raft, test/rebalancer
- Categories: runtime, test
- Action: split by owner area before the next attempt (12 files)
- Action: land or separate 5 owner areas: src/control-plane, src/rebalancer, test/control-plane, test/raft, test/rebalancer
- Split plan:
  - src/control-plane: 4 file(s)
  - src/rebalancer: 4 file(s)
  - test/control-plane: 2 file(s)
  - test/raft: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **voter-readiness-owner-migration-rebalancer-batch2-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **voter-readiness-owner-migration-rebalancer-batch2-main**: Independent adversarial verification passed (TRUSTED-WITH-NOTES): batch-2 files covered by claims 1/2/3 — fail-closed shifts safe (every producer of raft_role read at the migrated sites writes enum values; non-string inputs type-guarded upstream); exact-preservation sites (!isCatchupLearnerRaftRole) truth-table identical over the lowercased-string domain; deleted learner scalar aliases have zero remaining consumers. Residuals recorded on the parent (operator-injected garbage rows now fail-closed = safer direction; historical non-enum durable rows rated low). [subagent:a3ffbc4b4acdfbd7a]
- **voter-readiness-owner-migration-rebalancer-batch2-main**: Independent adversarial verification of the FINAL tree state passed: TRUSTED (subagent afd2b26b, two runs) + TRUSTED-WITH-NOTES (subagent a3ffbc4b, batches 1-2). Coverage: producer funneling census (all raft_role writers emit enum values), truth-table equivalence per migrated site, deleted names zero-consumer, published-role map differential-identical, partition-set single home reference-identical (===) via all consumer chains, zero import cycles (51-module BFS), analyzer detectors validated positive+negative, cl-035/durable-voter suites live-green. [subagent:afd2b26b7b4cfcee4]
- **voter-readiness-owner-migration-rebalancer-batch2-main**: Ingested evidence from voter-readiness-owner-migration-rebalancer-batch2.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/voter-readiness-owner-migration-rebalancer-batch2.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T10:47:38.003Z | voter-readiness-owner-migration-rebalancer-batch2-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/voter-readiness-owner-migration-rebalancer-batch2/attempt-1-batch2-migration.diff |
