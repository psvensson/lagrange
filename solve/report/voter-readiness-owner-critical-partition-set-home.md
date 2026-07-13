# Solve report: voter-readiness-owner-critical-partition-set-home

**Goal:** Bounded child of voter-readiness-visibility-single-owner-table (scope-pressure split, batch 4: the scoping column). The parent's sealed result requires the voter-readiness rows' scoping to key on the declared partition-class taxonomy, deleting the three local CRITICAL_SYSTEM_PARTITION_IDS re-derivations (replica-handler-transition-policy, partition-service-shared, partition-service-row-owner — three identical hand-written first-partition sets that could silently drift). SEALED RESULT: CRITICAL_SYSTEM_PARTITION_IDS is declared ONCE in src/bootstrap/system-partition-classification.js (with the deliberate -p1 first-partition scoping documented against isSystemTablePartition drift) and the three former re-derivation sites import it; the census analyzer gains a critical_partition_set_local_declaration detector so any future local re-derivation is counted, and the census stays 0 under the extended detector. doneWhen: scripts/check-voter-readiness-single-owner.js --oracle --oracle-file solve/oracle/voter-readiness-owner-critical-partition-set-home.json --done-at 0 --with-gates reports metric 0 with lint + targeted suites green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/voter-readiness-owner-critical-partition-set-home.json

**Attempts:** 1

## Links
- parent quest: voter-readiness-visibility-single-owner-table
- plan: solve/epics/self-hosting-circularity-generic-treatment.md

## Scope Pressure
- Changed files: 5
- Change bytes: 20851
- Owner areas: scripts/check-voter-readiness-single-owner.js, src/bootstrap, src/node, src/partition
- Categories: other, runtime
- Action: land or separate 4 owner areas: scripts/check-voter-readiness-single-owner.js, src/bootstrap, src/node, src/partition
- Split plan:
  - src/partition: 2 file(s)
  - scripts/check-voter-readiness-single-owner.js: 1 file(s)
  - src/bootstrap: 1 file(s)
  - src/node: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **voter-readiness-owner-critical-partition-set-home-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **voter-readiness-owner-critical-partition-set-home-main**: Independent adversarial verification of the FINAL tree state passed: TRUSTED (subagent afd2b26b, two runs) + TRUSTED-WITH-NOTES (subagent a3ffbc4b, batches 1-2). Coverage: producer funneling census (all raft_role writers emit enum values), truth-table equivalence per migrated site, deleted names zero-consumer, published-role map differential-identical, partition-set single home reference-identical (===) via all consumer chains, zero import cycles (51-module BFS), analyzer detectors validated positive+negative, cl-035/durable-voter suites live-green. [subagent:afd2b26b7b4cfcee4]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-13T11:15:43.721Z | voter-readiness-owner-critical-partition-set-home-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/voter-readiness-owner-critical-partition-set-home/attempt-1-partition-set-home.diff |
