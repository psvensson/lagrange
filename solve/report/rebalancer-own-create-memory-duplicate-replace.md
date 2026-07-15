# Solve report: rebalancer-own-create-memory-duplicate-replace

**Goal:** A planned rebalance move is executed by at most one creator cluster-wide: run-23 proved the duplicate-REPLACE class is CROSS-COORDINATOR, not only same-coordinator — two different nodes (6a365921 and fe93cde6) created REPLACEs for sql_transactions-p1 97ms apart executing ONE logical planned move (one via another entity-instance rebalancer, one via the partition scheduler), and the twins mutually blocked each other source-removal (Quorum check failed: concurrent partition operation is active) for ~30s before self-resolving; run-22 separately showed the same-coordinator flavor (a coordinator re-creating 400ms after giving up persisting its first create, dedupe blind while the ledger row was unreadable). The fix makes move execution idempotent across creators — creation keyed by the move identity (movePartitionId + source/target), a single-executor lease per move, or own-create memory extended cluster-wide via the existing dedupe layers — WITHOUT blanket fail-closed admission when the ledger is unwritable (REFUTED as anti-convergent: it would have blocked run-22 healing move ca191926) and without weakening the CL-008 dedupe layers. Proven by a deterministic in-process test racing two creators for one logical move (red on the current head), then by the standard suites.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-01-00-131Z.report.json

**Attempts:** 1

## Links
- parent quest: movielens-affinity-placement-demo

## Scope Pressure
- Changed files: 11
- Change bytes: 44412
- Owner areas: architecture, scripts/run-rebalancer-own-create-memory-duplicate-replace-scenarios.js, src/rebalancer, test/rebalancer
- Categories: docs, other, runtime
- Action: split by owner area before the next attempt (11 files)
- Action: land or separate 4 owner areas: architecture, scripts/run-rebalancer-own-create-memory-duplicate-replace-scenarios.js, src/rebalancer, test/rebalancer
- Split plan:
  - src/rebalancer: 8 file(s)
  - architecture: 1 file(s)
  - scripts/run-rebalancer-own-create-memory-duplicate-replace-scenarios.js: 1 file(s)
  - test/rebalancer: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **rebalancer-own-create-memory-duplicate-replace-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **rebalancer-own-create-memory-duplicate-replace-main**: A permanent deterministic operation ID derived only from REPLACE entity/source/target is unsafe: replica_operations retains terminal rows and the existing coordinator contract explicitly permits a fresh recovery create after terminal intent visibility, so the next same-generation move would collide with the terminal primary key. A correct deterministic design therefore needs a shared attempt generation (or a terminal-collision generation chain), while preserving exact-ID reuse only for non-terminal/lost-outcome collisions. (rules out: Permanent generation-free operationIntentId derived only from entity/source/target) [test/rebalancer/coordinator-dedup-gap.test.js]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T14-58-44-526Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T14-58-44-526Z.report.json]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-00-56-733Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-00-56-733Z.report.json]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-01-00-131Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-01-00-131Z.report.json]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-01-00-131Z.report.json. Metric: unknown -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-01-00-131Z.report.json]
- **rebalancer-own-create-memory-duplicate-replace-main**: Independent verification approved exact attempt 1: deterministic versioned REPLACE identity, collision reuse/repair, successor cycle refusal, explicit-ID preservation, regressions, and static guards pass. [subagent:duplicate_replace_attempt1_verify]
- **rebalancer-own-create-memory-duplicate-replace-main**: Independent verification approved the aggregate ten-path source/test/script delta; it matches the Solver fingerprint and has no textual overlap with main a1bf6f74. [subagent:duplicate_replace_attempt1_verify]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-04-01-920Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-04-01-920Z.report.json]
- **rebalancer-own-create-memory-duplicate-replace-main**: Ingested evidence from rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-04-01-920Z.report.json. Metric: 0 -> 0. Verdict: PASS. Root cause: none. Dominant reason: none. Owner: none. Ingestion outcome: changed. [test-output/reports/rebalancer-own-create-memory-duplicate-replace-2026-07-15T15-04-01-920Z.report.json]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-15T15:01:33.347Z | rebalancer-own-create-memory-duplicate-replace-main | observe | 0 -> 0 | flat | solved |  | diff:solve/changes/rebalancer-own-create-memory-duplicate-replace/attempt-1.diff.json |
