# Solve report: partition-class-ladder-migration-query-domain

**Goal:** Bounded Option-5 rung-5 query-domain migration: all 10 censused decisions under src/query consume classifySystemPartition(...).priorityControlPlane through the canonical owner with the identical partitionId and partitionRow input shapes. Query routing, canonical-leader retention, attempt budgets, bootstrap recovery, retry decisions, transaction delivery, and metadata overlay behavior remain truth-table identical. doneWhen: solve/oracle/partition-class-ladder-migration-query-domain.json reports metric at most 75, ownerCheck passed, and all gates green. NOT in scope: rebalancer sites, parsing, predicate removal, numeric budgets, timing, retry policy, routing policy, or behavior changes.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-migration-query-domain.json

**Attempts:** 1

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 8
- Change bytes: 11375
- Owner areas: src/query
- Categories: runtime
- Split plan:
  - src/query: 8 file(s)
- Signals: none

## Frontiers
- **partition-class-ladder-migration-query-domain-main** [solved] rung 0, attempts 1, metric 85 -> 75

## Findings
- **partition-class-ladder-migration-query-domain-main**: inherited from partition-class-ladder-single-owner-table: Independent review REJECTED fingerprint sha256:24330bc99f984aaf223ff8c0718da793c8d2cb367890800a231a9247fa79c6e1: raw-edge counting missed alias laundering, did not reconcile 125 edges to the epic 119 decisions, trusted owner-path exclusion without structural proof, under-tested CLI/oracle behavior, ignored gate failures in exit status, and allowed --done-at to weaken the sealed parent target. Attempt 3 replaces this measurement contract with canonical decision-site grouping, alias propagation, owner structural validation, fail-closed exit semantics, target hardening, and adversarial tests. (rules out: Do not approve or reuse attempt-2 fingerprint 24330bc99f984aaf223ff8c0718da793c8d2cb367890800a231a9247fa79c6e1 as a trustworthy census ratchet.) [subagent:verify_rung5_census]
- **partition-class-ladder-migration-query-domain-main**: Independent verifier confirmed exact artifact/postimage identity, identical partitionId and partitionRow inputs, unchanged short-circuit ordering and query behavior, zero remaining src/query sites, metric 85 to 75, 550 focused assertions, and green structural gates. [subagent:verify_node_partition_class]
- **partition-class-ladder-migration-query-domain-main**: Independent verifier confirmed the canonical aggregate fingerprint, exact eight-path equality with the trusted attempt, matching live postimages, no extra source paths, correct event binding, and zero pending attempts. [subagent:verify_node_partition_class]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T20:44:03.611Z | partition-class-ladder-migration-query-domain-main | observe | 85 -> 75 | progress | no_evidence |  | diff:solve/changes/partition-class-ladder-migration-query-domain/attempt-1.diff |
