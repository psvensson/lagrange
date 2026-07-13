# Solve report: voter-readiness-owner-migration-partition-raft-aliases

**Goal:** Bounded child of voter-readiness-visibility-single-owner-table (scope-pressure split, batch 3: partition + raft owner areas; sibling of voter-readiness-owner-migration-raft-node-admin and voter-readiness-owner-migration-rebalancer-batch2). Adversarial verification of batches 1-2 (TRUSTED-WITH-NOTES) found that PARTITION_RAFT_ROLE and RaftRole are enum ALIASES of RAFT_ROLE, so nine learner-membership comparisons in the partition/raft layer evaded both the census and the migration. SEALED RESULT: those sites consume the owner table src/raft/replica-voter-readiness.js — in partition-service-learner-promotion-methods: isLearnerServiceRowForPromotion, resolveOperationScopedLearnerCountForPromotion, resolveLearnerPromotionCounts, resolveActiveLearnerNodeIdsForPromotion, and checkLearnerPromotion use isCatchupLearnerRaftRole, and isActiveVoterServiceRowForPromotion drops its redundant learner clause (ACTIVE_VOTER_ROLES.has already excludes learner); reassertDurableRaftRole (metadata-delivery) uses isVoterRaftRole; isJoiningLearner (raft-init-base) and raft-replica-base checkLearnerPromotion use isCatchupLearnerRaftRole; the stale VOTER_RAFT_ROLES home comments in operation-ledger-quorum-concentration and partition-service-shared are re-pointed. Behavior preserved exactly on the enum-constrained tracked-role domain. doneWhen: scripts/check-voter-readiness-single-owner.js --oracle --oracle-file solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json --done-at 0 --with-gates reports census metric 0 (under the alias-aware detector) with lint + targeted suites green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json

**Attempts:** 2

## Links
- parent quest: voter-readiness-visibility-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 14
- Change bytes: 17862
- Owner areas: src/control-plane, src/partition, src/raft, src/rebalancer
- Categories: runtime
- Action: split by owner area before the next attempt (14 files)
- Action: land or separate 4 owner areas: src/control-plane, src/partition, src/raft, src/rebalancer
- Split plan:
  - src/rebalancer: 5 file(s)
  - src/control-plane: 4 file(s)
  - src/partition: 4 file(s)
  - src/raft: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **voter-readiness-owner-migration-partition-raft-aliases-main** [solved] rung 2, attempts 2, metric 0 -> 0

## Findings
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Ingested evidence from voter-readiness-owner-migration-partition-raft-aliases.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json]
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Independent adversarial verification passed: TRUSTED. Diff artifact byte-identical to working-tree change; exhaustive this.role assignment census proves the four-value lowercase enum domain (constructor FOLLOWER, init FOLLOWER/LEARNER, promotion FOLLOWER, leadership events LEADER/FOLLOWER/CANDIDATE); all 9 migrated predicates truth-table identical on that domain (reassertDurableRaftRole: CANDIDATE passes under both old and new, queueRoleUpdate projection unchanged; only unreachable non-enum strings diverge, fail-closed = safer); dropped clause proven redundant; no remaining alias comparisons repo-wide; eslint 0; 2 suites 97A green. [subagent:afd2b26b7b4cfcee4]
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Ingested evidence from voter-readiness-owner-migration-partition-raft-aliases.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json]
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Independent adversarial verification of the FINAL tree state passed: TRUSTED (subagent afd2b26b, two runs) + TRUSTED-WITH-NOTES (subagent a3ffbc4b, batches 1-2). Coverage: producer funneling census (all raft_role writers emit enum values), truth-table equivalence per migrated site, deleted names zero-consumer, published-role map differential-identical, partition-set single home reference-identical (===) via all consumer chains, zero import cycles (51-module BFS), analyzer detectors validated positive+negative, cl-035/durable-voter suites live-green. [subagent:afd2b26b7b4cfcee4]
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Sealed symptom does NOT reproduce on HEAD: the alias-aware census (scripts/check-voter-readiness-single-owner.js) reports metric 0 with empty countedSites — zero PARTITION_RAFT_ROLE/RaftRole learner-membership comparisons remain outside the owner module; independently confirmed by verifier subagent afd2b26b (zero .LEARNER member-access comparisons and zero 'learner' literal comparisons in src/ outside the owner and enum definitions). [solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json]
- **voter-readiness-owner-migration-partition-raft-aliases-main**: Ingested evidence from voter-readiness-owner-migration-partition-raft-aliases.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/voter-readiness-owner-migration-partition-raft-aliases.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T11:02:02.800Z | voter-readiness-owner-migration-partition-raft-aliases-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/voter-readiness-owner-migration-partition-raft-aliases/attempt-1-enum-alias-sites.diff |
| 2026-07-13T11:27:39.705Z | voter-readiness-owner-migration-partition-raft-aliases-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/voter-readiness-owner-migration-partition-raft-aliases/attempt-2-current-state.diff |
