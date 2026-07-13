# Solve report: partition-class-ladder-migration-control-plane-final

**Goal:** Bounded Option-5 rung-5 control-plane migration successor: the nine censused partition-class decisions in src/control-plane consume classifySystemPartition(...).priorityControlPlane or classifySystemPartition(...).systemTable instead of calling or receiving the legacy priority and system-table predicates. Behavior remains truth-table identical for every existing input shape and short-circuit point. doneWhen: solve/oracle/partition-class-ladder-migration-control-plane-final.json reports metric at most 105, ownerCheck passed, and all gates green. NOT in scope: bootstrap, node, partition, query, raft, rebalancer, table parsing, predicate removal, admission subclasses beyond consuming the base owner, numeric budgets, or behavior change.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-migration-control-plane-final.json

**Attempts:** 1

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-migration-control-plane
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 9
- Change bytes: 11445
- Owner areas: src/control-plane
- Categories: runtime
- Split plan:
  - src/control-plane: 9 file(s)
- Signals: none

## Frontiers
- **partition-class-ladder-migration-control-plane-final-main** [solved] rung 0, attempts 1, metric 114 -> 105

## Findings
- **partition-class-ladder-migration-control-plane-final-main**: Independent verification passed: exact before/after blobs match the patch, all nine substitutions preserve inputs and short-circuit semantics, a 22-case differential has zero mismatches including opaque-row fallback, the census moves 114 to 105, 702 focused assertions pass, and scoped guards report no new violations. [subagent:verify_control_plane_partition_class]
- **partition-class-ladder-migration-control-plane-final-main**: Independent aggregate verification passed: the aggregate contains exactly one approved source attempt, no pending, rejected, superseded, or problematic source bytes, the same nine source paths, and all live blobs match. [subagent:verify_control_plane_partition_class]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T18:12:43.507Z | partition-class-ladder-migration-control-plane-final-main | observe | 114 -> 105 | progress | no_evidence |  | diff:solve/changes/partition-class-ladder-migration-control-plane-final/attempt-1.diff |
