# Solve report: partition-class-ladder-migration-rebalancer-repository-policy

**Goal:** Bounded Option-5 rung-5 rebalancer repository/policy migration: all 19 censused decisions in repository composition, move-planner state, provisioning admission, priority-publication safety/handoff, superseded-target recovery, and operation liveness consume classifySystemPartition outcome fields with identical option objects and preserved system-table versus priority truth tables. Lane, visibility, row, planner admission, provisioning availability, readiness, handoff, recovery, and timeout behavior remain unchanged. doneWhen: solve/oracle/partition-class-ladder-migration-rebalancer-repository-policy.json reports metric at most 56, ownerCheck passed, and all gates green. NOT in scope: remaining unified-rebalancer, coordinator, or owner-execution sites; parsing; predicate removal; numeric budgets; timing; retry policy; admission policy; or behavior changes.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-migration-rebalancer-repository-policy.json

**Attempts:** 2

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 15
- Change bytes: 49171
- Owner areas: src/rebalancer, test/rebalancer
- Categories: runtime
- Action: split by owner area before the next attempt (15 files)
- Split plan:
  - src/rebalancer: 13 file(s)
  - test/rebalancer: 2 file(s)
- Signal: large-diff-stack severity=medium

## Frontiers
- **partition-class-ladder-migration-rebalancer-repository-policy-main** [solved] rung 1, attempts 2, metric 75 -> 56 — exact terminal source attempt was rejected

## Findings
- **partition-class-ladder-migration-rebalancer-repository-policy-main**: Attempt 1 dropped the provider's entity-type and returned-boolean semantics in MovePlanner.isCriticalAdmissionEntity; a message-group entity with a system-looking ID changed from non-critical to critical. Replacement must reuse the provider's existing system-partition entity decision rather than reconstructing it from entityId. [subagent:verify_node_partition_class]
- **partition-class-ladder-migration-rebalancer-repository-policy-main**: Ingested evidence from partition-class-ladder-migration-rebalancer-repository-policy.json. Metric: 56 -> 56. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/partition-class-ladder-migration-rebalancer-repository-policy.json]
- **partition-class-ladder-migration-rebalancer-repository-policy-main**: Independent verifier confirmed exact 15-path artifact/postimages, closure of the message-group system-looking-ID regression through the provider-owned boolean, all 19 sites absent at metric 56, focused admission/provisioning coverage, and green structural gates. [subagent:verify_node_partition_class]
- **partition-class-ladder-migration-rebalancer-repository-policy-main**: Independent verifier confirmed the canonical aggregate is byte-identical to the trusted replacement, contains exactly the same 15 paths and postimages, excludes the rejected planner blob, and binds the rejection/replacement approvals correctly with no pending attempt. [subagent:verify_node_partition_class]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T21:02:54.396Z | partition-class-ladder-migration-rebalancer-repository-policy-main | observe | 75 -> 56 | progress | no_evidence |  | diff:solve/changes/partition-class-ladder-migration-rebalancer-repository-policy/attempt-1.diff |
| 2026-07-13T21:08:22.209Z | partition-class-ladder-migration-rebalancer-repository-policy-main | observe | 56 -> 56 | flat | solved |  | diff:solve/changes/partition-class-ladder-migration-rebalancer-repository-policy/attempt-2.diff |
