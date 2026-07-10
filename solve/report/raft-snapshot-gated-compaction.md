# Solve report: raft-snapshot-gated-compaction

**Goal:** No production-usable Raft adapter physically removes a committed prefix until the protocol implements snapshot transfer/install and lagging-follower recovery; attempted compaction returns a typed unsupported result, commit index never moves backward, and conflict truncation cannot invoke compaction.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/raft-snapshot-gated-compaction-2026-07-10T17-11-33-975Z.report.json

**Attempts:** 1

## Links
- spec: solve/specs/owner-boundary-hardening-and-unification/implementation-plan.md#W4
- plan: solve/epics/owner-boundary-hardening-and-unification.md

## Scope Pressure
- Changed files: 13
- Owner areas: architecture, scripts/run-raft-snapshot-gated-compaction-scenarios.js, src/partition, src/raft, test/raft
- Categories: docs, other, runtime, test
- Action: split by owner area before the next attempt (13 files)
- Action: land or separate 5 owner areas: architecture, scripts/run-raft-snapshot-gated-compaction-scenarios.js, src/partition, src/raft, test/raft
- Split plan:
  - src/raft: 5 file(s)
  - test/raft: 4 file(s)
  - architecture: 2 file(s)
  - scripts/run-raft-snapshot-gated-compaction-scenarios.js: 1 file(s)
  - src/partition: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **raft-snapshot-gated-compaction-main** [solved] rung 0, attempts 1, metric 3 -> 0

## Findings
- **raft-snapshot-gated-compaction-main**: Independent verifier approved W4 after confirming single _raft_log mutation ownership, monotonic committed-index aliases, strict truncation ingress validation, real 1005-entry follower catch-up on both adapters, file-size compliance, adjacent tests, and static audits. [subagent:/root/w4_snapshot_compaction_verify]
- **raft-snapshot-gated-compaction-main**: The 2026-07-10T17:11:33Z scenario run exercised real two-node LifeRaft leader/follower message handlers with both in-memory and SQLite adapters; the observable was follower log index, committed index, retained row count, and oldest retained entry after recovering 1005 entries over multiple batches. [test-output/reports/raft-snapshot-gated-compaction-2026-07-10T17-11-33-975Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-10T17:15:57.566Z | raft-snapshot-gated-compaction-main | observe | 3 -> 0 | progress | no_evidence |  | diff:solve/changes/raft-snapshot-gated-compaction/attempt-1.diff |
