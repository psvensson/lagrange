# Solve report: partition-class-ladder-migration-partition-domain

**Goal:** Bounded Option-5 rung-5 partition-domain migration: all 14 censused decisions under src/partition consume classifySystemPartition outcome fields or the exact owner-derived bootstrap-critical ID predicate; managed split/merge topology seams are renamed away from the legacy predicate and bind directly to the canonical owner. Existing partition-ID truth tables, promotion timing, retry/admission behavior, split/merge safety, and public runtime outcomes remain unchanged. doneWhen: solve/oracle/partition-class-ladder-migration-partition-domain.json reports metric at most 85, ownerCheck passed, and all gates green. NOT in scope: query or rebalancer sites, parsing, predicate removal, numeric budgets, timing, retry policy, admission policy, or behavior changes.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/partition-class-ladder-migration-partition-domain.json

**Attempts:** 2

## Links
- spec: solve/epics/self-hosting-circularity-generic-treatment.md
- parent quest: partition-class-ladder-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 13
- Change bytes: 38225
- Owner areas: src/partition, test/partition
- Categories: runtime, test
- Action: split by owner area before the next attempt (13 files)
- Split plan:
  - src/partition: 9 file(s)
  - test/partition: 4 file(s)
- Signal: large-diff-stack severity=medium

## Frontiers
- **partition-class-ladder-migration-partition-domain-main** [solved] rung 1, attempts 2, metric 99 -> 85 — exact terminal source attempt was rejected

## Findings
- **partition-class-ladder-migration-partition-domain-main**: inherited from partition-class-ladder-single-owner-table: Independent review REJECTED fingerprint sha256:24330bc99f984aaf223ff8c0718da793c8d2cb367890800a231a9247fa79c6e1: raw-edge counting missed alias laundering, did not reconcile 125 edges to the epic 119 decisions, trusted owner-path exclusion without structural proof, under-tested CLI/oracle behavior, ignored gate failures in exit status, and allowed --done-at to weaken the sealed parent target. Attempt 3 replaces this measurement contract with canonical decision-site grouping, alias propagation, owner structural validation, fail-closed exit semantics, target hardening, and adversarial tests. (rules out: Do not approve or reuse attempt-2 fingerprint 24330bc99f984aaf223ff8c0718da793c8d2cb367890800a231a9247fa79c6e1 as a trustworthy census ratchet.) [subagent:verify_rung5_census]
- **partition-class-ladder-migration-partition-domain-main**: attempt 1 narrows managed split/merge protection from every normalized system-table partition to exact bootstrap-critical IDs and changes missing-coordinator behavior; replacement must consume canonical systemTable classification while preserving the coordinator availability guard [subagent:verify_node_partition_class]
- **partition-class-ladder-migration-partition-domain-main**: independent verification passed: replacement preserves all system-table and coordinator-availability semantics, all 13 postimages match, 490 focused assertions and dependency/formation checks are green [subagent:verify_node_partition_class]
- **partition-class-ladder-migration-partition-domain-main**: aggregate verification passed: attempt 2 covers all 13 rejected paths, all trusted postimages match, and no rejected topology blob survives [subagent:verify_node_partition_class]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T20:27:22.930Z | partition-class-ladder-migration-partition-domain-main | observe | 99 -> 85 | progress | no_evidence |  | diff:solve/changes/partition-class-ladder-migration-partition-domain/attempt-1.diff |
| 2026-07-13T20:32:45.971Z | partition-class-ladder-migration-partition-domain-main | observe | 85 -> 85 | flat | no_evidence |  | diff:solve/changes/partition-class-ladder-migration-partition-domain/attempt-2.diff |
