# Solve report: solver-snapshot-scope-accounting

**Goal:** Canonical full-source attempt snapshots from one Git base are charged once for overlapping effective scope, so a same-base full-path rejected-attempt replacement can be recorded and checkpointed without an incremental artifact. Genuinely disjoint cumulative scope and any live snapshot beyond the unchanged 25-file, 6-owner, or 256-KiB limits still fail closed. doneWhen: solve/oracle/solver-snapshot-scope-accounting.json is done only when focused scope-pressure, verification, checkpoint, lint, and static tests are green.

**Class:** process · **Closure:** DECISION

**Outcome:** SOLVED (DECISION) — evidence: solve/oracle/solver-snapshot-scope-accounting.json

**Attempts:** 3

## Links
- spec: docs/steering/workflow-guidelines/solver-quests.md

## Scope Pressure
- Changed files: 8
- Change bytes: 22808
- Owner areas: scripts/solve, test/solve
- Categories: workflow
- Split plan:
  - scripts/solve: 5 file(s)
  - test/solve: 3 file(s)
- Signals: none

## Frontiers
- **solver-snapshot-scope-accounting-main** [solved] rung 1, attempts 3, metric 1 -> 0 — fresh measured evidence no longer satisfies frontier

## Findings
- **solver-snapshot-scope-accounting-main**: Exact attempt can hide an older oversized same-base snapshot behind a smaller covering replacement, violating the unchanged 256 KiB hard limit. [subagent:verify_snapshot_scope_attempt]
- **solver-snapshot-scope-accounting-main**: Ingested evidence from solver-snapshot-scope-accounting.json. Metric: 0 -> 0. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-snapshot-scope-accounting.json]
- **solver-snapshot-scope-accounting-main**: Independent exact verification passed: same-base overlap is deduplicated, disjoint and malformed-base scope remains cumulative, and an oversized covered snapshot remains terminal. [subagent:verify_snapshot_scope_attempt_2]
- **solver-snapshot-scope-accounting-main**: Live OCI checkpoint still rechecked approved incremental attempt 5 after exact-approved canonical attempt 6 covered the same frontier, base, and paths; checkpoint must let the newest exact-approved complete superset supersede older approved same-base receipts without weakening disjoint receipt checks. [command:oci-checkpoint-attempt-6]
- **solver-snapshot-scope-accounting-main**: Ingested evidence from solver-snapshot-scope-accounting.json. Metric: 0 -> 1. Verdict: unknown. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [solve/oracle/solver-snapshot-scope-accounting.json]
- **solver-snapshot-scope-accounting-main**: Independent exact verification passed: canonical snapshot admission and scope bounds remain fail-closed, while only a later exact-approved same-frontier, same-base full path superset may own checkpoint identity; live OCI attempt 5 to 6 now has no checkpoint problems. [subagent:verify_snapshot_scope_attempt_3]
- **solver-snapshot-scope-accounting-main**: Independent terminal aggregate verification passed: the complete eight-path canonical Solver delta matches exact attempt 3 and all bounded negative checkpoint-supersession cases fail closed. [subagent:verify_snapshot_scope_attempt_3]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T04:37:57.853Z | solver-snapshot-scope-accounting-main | observe | 1 -> 0 | progress | no_evidence |  | diff:solve/changes/solver-snapshot-scope-accounting/attempt-1.diff |
| 2026-07-15T04:44:27.057Z | solver-snapshot-scope-accounting-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/solver-snapshot-scope-accounting/attempt-2.diff |
| 2026-07-15T04:57:22.755Z | solver-snapshot-scope-accounting-main | local-fix | 1 -> 0 | progress | narrowed |  | diff:solve/changes/solver-snapshot-scope-accounting/attempt-3.diff |
