# Solve report: partition-class-ladder-owner-implementation

**Goal:** Bounded Option-5 rung-5 owner slice: src/bootstrap/system-partition-classification.js declares and exports the exact frozen bootstrap-critical, priority-control-plane, and default vocabulary, one frozen ordered row table, and classifySystemPartition with partition-row precedence and frozen overlap facts; legacy isSystemTablePartition and isPriorityControlPlanePartition delegate to those facts without behavior change. A decision-table-v1 JSON exhaustively pins bootstrap-critical precedence over priority overlap, and focused runtime tests pin all classes, overlapping facts, row precedence, immutability, and legacy equivalence. doneWhen: bounded evidence reports metric at most 119, the owner check passed, and every gate green. NOT in scope: migrating any consumer, changing table-id parsing, critical-transport classification, admission subclasses, numeric budgets, or behavior.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-owner-contract.json

**Attempts:** 1

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-census-proof-final
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 3
- Change bytes: 11951
- Owner areas: docs, src/bootstrap, test/bootstrap
- Categories: docs, runtime
- Action: land or separate 3 owner areas: docs, src/bootstrap, test/bootstrap
- Split plan:
  - docs: 1 file(s)
  - src/bootstrap: 1 file(s)
  - test/bootstrap: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **partition-class-ladder-owner-implementation-main** [open] rung 1, attempts 1, metric 119 -> 119 — exact terminal source attempt was rejected

## Findings
- **partition-class-ladder-owner-implementation-main**: Independent verifier found that reconstructing resolver inputs from the row-preferred partitionId loses the legacy top-level fallback when a partition row carries a nonempty but unparsable ID; the self-referential legacy equivalence test did not detect it. [subagent:verify_rung5_census]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T17:19:52.596Z | partition-class-ladder-owner-implementation-main | observe | 119 -> 119 | flat | no_evidence |  | diff:solve/changes/partition-class-ladder-owner-implementation/attempt-1.diff |
