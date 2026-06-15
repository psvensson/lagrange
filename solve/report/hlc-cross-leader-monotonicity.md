# Solve report: hlc-cross-leader-monotonicity

**Goal:** The partition HLC is monotonic across leadership change and process restart: applying any committed Raft entry advances the applying replica's HLC to at least that entry's HLC, and a restarted node never emits an HLC below one it previously committed, so a causally-later write for any key always receives a strictly higher HLC than an earlier write even across leader handoff. Proven by deterministic tests plus a green suite.

**Class:** product · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/hlc-cross-leader-monotonicity.json

**Attempts:** 1

## Current Blocker
- Frontier: hlc-cross-leader-monotonicity-main
- Owner: unknown
- Boundary: unknown
- Dominant reason: unknown
- Mechanism: unknown
- Movement: no evidence recorded
- Latest evidence: none
- Selected theory: none
- Next move: continue supervised step for hlc-cross-leader-monotonicity-main

## Continuation
- Status: allowed
- Next action: No open frontier remains; inspect solve report.
- Blocker: none

## Scope Pressure
- Changed files: 5
- Owner areas: src/hlc, src/partition, test/hlc, test/partition
- Categories: runtime, test
- Action: land or separate 4 owner areas: src/hlc, src/partition, test/hlc, test/partition
- Split plan:
  - src/partition: 2 file(s)
  - src/hlc: 1 file(s)
  - test/hlc: 1 file(s)
  - test/partition: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **hlc-cross-leader-monotonicity-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **hlc-cross-leader-monotonicity-main**: Fix 1 (witnessCommandHlc at top of applyCommittedEntry) + Fix 2 (warmHlcFromCommittedLog on init) implemented; deterministic tests pass (4/4), negative controls confirm each test fails without its fix; full test/partition+test/raft (2249) and test/cdc (1336) suites green; lint clean. Independent adversarial subagent verified CORRECT AND COMPLETE for the live PartitionService apply seam (no bypass path; partition-replication-handler.js parallel apply is production-dead). Only a doc comment was corrected. [subagent:a421e292298096c7f]
- **hlc-cross-leader-monotonicity-main**: Post-attempt subagent verification of the recorded source change: independent adversarial reviewer confirmed Fix 1 (witnessCommandHlc covers every committed entry on leader+follower, no bypass path) and Fix 2 (warm-from-committed-log on init) are CORRECT AND COMPLETE for the live PartitionService apply seam; one doc comment corrected. Negative controls confirm each test fails without its fix; partition+raft (2249) and cdc (1336) suites green; lint clean. [subagent:a421e292298096c7f]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-06-15T14:15:21.699Z | hlc-cross-leader-monotonicity-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/hlc-cross-leader-monotonicity/implementation.diff |
