# Solve report: voter-readiness-owner-migration-raft-node-admin

**Goal:** Bounded child of voter-readiness-visibility-single-owner-table (scope-pressure split; parent keeps the sealed census doneWhen at 0). SEALED RESULT (batch 1: raft/node/partition/admin owner areas + the test-harness copy): the owner module src/raft/replica-voter-readiness.js exists declaring VOTER_READINESS_SEMANTIC named rows (quorum_voter incl. candidate, load_routable excl. candidate, repair_only, catchup_learner) as one frozen table with fail-closed predicates, and these batch-1 re-derivations consume it: VOTER_RAFT_ROLES declaration moved out of src/raft/constants.js (importers re-pointed: replica-inventory, operation-ledger-quorum-concentration, partition-service-shared); duplicate ESTABLISHED_VOTER_ROLES (replica-handler-transition-policy) DELETED with its consumers renamed to VOTER_RAFT_ROLES; REPLICA_RAFT_ROLE_LOAD_READY_STATES + REPLICA_RAFT_ROLE_REPAIR_ONLY_STATES arrays (replica-state-machine-constants) DELETED with isLoadReadyReplicaRaftRole/isRepairOnlyReplicaRaftRole consuming owner predicates; admin LOAD_LANE_VOTER_READY_REPLICA_ROLES replaced by owner LOAD_ROUTABLE_RAFT_ROLES (api-shared + load-lane-admission + the test/distributed/harness/cluster-base-layer.js copy); the CL-035 seed (seedLocalReplicaVoterRaftRole) and isReplicaVoterReady inline learner comparisons replaced by isVoterRaftRole; normalizePublishedRaftRole rewritten as the PUBLISHED_RAFT_ROLE_BY_TRACKED_ROLE projection map. Behavior preserved (fail-closed predicate equivalence on the enum-constrained role domain); CL-035 guard suite stays green. doneWhen: scripts/check-voter-readiness-single-owner.js --oracle --oracle-file solve/oracle/voter-readiness-owner-migration-raft-node-admin.json --done-at 7 --with-gates reports metric <= 7 (census after batch 1; parent baseline 15) with lint + targeted suites green. NOT in scope: the remaining rebalancer/control-plane learner sites (batch 2 sibling), package.json script registration (parent handoff).

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/voter-readiness-owner-migration-raft-node-admin.json

**Attempts:** 1

## Links
- parent quest: voter-readiness-visibility-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 14
- Change bytes: 15983
- Owner areas: src/admin, src/node, src/partition, src/raft, src/rebalancer, test/distributed/harness
- Categories: runtime
- Action: split by owner area before the next attempt (14 files)
- Action: land or separate 6 owner areas: src/admin, src/node, src/partition, src/raft, src/rebalancer, test/distributed/harness
- Split plan:
  - src/node: 6 file(s)
  - src/admin: 2 file(s)
  - src/raft: 2 file(s)
  - src/rebalancer: 2 file(s)
  - src/partition: 1 file(s)
  - test/distributed/harness: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium
- Signal: mixed-runtime-and-harness severity=medium

## Frontiers
- **voter-readiness-owner-migration-raft-node-admin-main** [solved] rung 1, attempts 1, metric 7 -> 0

## Findings
- **voter-readiness-owner-migration-raft-node-admin-main**: Independent adversarial verification passed (TRUSTED-WITH-NOTES): batch-1 files covered by claims 1/3/4/5/6 — all raft_role producers funnel through normalizePublishedRaftRole or the enum-typed tracker (16 assignment sites); deleted names (VOTER_RAFT_ROLES from constants, ESTABLISHED_VOTER_ROLES, REPLICA_RAFT_ROLE_* arrays, LOAD_LANE_VOTER_READY_REPLICA_ROLES) have zero remaining consumers; published-role map rewrite differential-identical over 120 cases; mixin dep rename sole-caller-verified; harness copy byte-identical membership. [subagent:a3ffbc4b4acdfbd7a]
- **voter-readiness-owner-migration-raft-node-admin-main**: Independent adversarial verification of the FINAL tree state passed: TRUSTED (subagent afd2b26b, two runs) + TRUSTED-WITH-NOTES (subagent a3ffbc4b, batches 1-2). Coverage: producer funneling census (all raft_role writers emit enum values), truth-table equivalence per migrated site, deleted names zero-consumer, published-role map differential-identical, partition-set single home reference-identical (===) via all consumer chains, zero import cycles (51-module BFS), analyzer detectors validated positive+negative, cl-035/durable-voter suites live-green. [subagent:afd2b26b7b4cfcee4]
- **voter-readiness-owner-migration-raft-node-admin-main**: Ingested evidence from voter-readiness-owner-migration-raft-node-admin.json. Metric: 7 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/voter-readiness-owner-migration-raft-node-admin.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T10:38:06.270Z | voter-readiness-owner-migration-raft-node-admin-main | observe | 7 -> 7 | flat | no_evidence |  | diff:solve/changes/voter-readiness-owner-migration-raft-node-admin/attempt-1-batch1-migration.diff |
