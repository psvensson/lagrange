# Solve report: split-snapshot-transfer-pacing

**Goal:** Managed split snapshot backfill preserves foreground availability by transferring immutable source rows in bounded child proposals instead of one Raft/network proposal per row, yielding between bounded batches and refreshing descriptor-epoch evidence before each child dispatch. Snapshot-copy writes are explicitly identified as physical transfer and emit no logical CDC, while queued and live source mutations retain the existing CDC path. Deterministic guards prove one unchanged-budget foreground write completes from one client submission while a 65-row backfill runs, every snapshot row lands exactly once on its routed child, and a genuinely stuck child proposal fails without retrying or extending either budget.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/split-snapshot-transfer-pacing-2026-07-19T13-56-58-789Z.report.json

**Attempts:** 2

## Links
- parent quest: movielens-three-way-affinity-demo

## Scope Pressure
- Changed files: 9
- Change bytes: 25767
- Owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, test/partition
- Categories: other, runtime, test
- Action: land or separate 3 owner areas: scripts/run-placement-affinity-scenarios.js, src/partition, test/partition
- Split plan:
  - src/partition: 5 file(s)
  - test/partition: 3 file(s)
  - scripts/run-placement-affinity-scenarios.js: 1 file(s)
- Signal: broad-source-scope severity=medium

## Frontiers
- **split-snapshot-transfer-pacing-main** [solved] rung 2, attempts 2, metric 0 -> 0 — exact terminal source attempt was rejected

## Findings
- **split-snapshot-transfer-pacing-main**: DT red-on-revert proven for test/partition/split-backfill-internal-pacing.test.js [dt:solve/changes/dt-prove/split-backfill-internal-pacing.test.js-2026-07-19T13-47-44-704Z.json]
- **split-snapshot-transfer-pacing-main**: The archived MovieLens run binds the current failure to split snapshot transfer: 67 complete 500-row source batches committed, split replication began, then the next unchanged 15000ms single-submit foreground batch timed out while the old path completed only about 13 one-row child proposals under sustained near-1.0 event-loop utilization. (rules out: Do not change the demo batch, client retry behavior, query timeout, placement planner, or ratings split policy.) [solve/changes/write-path-internal-pacing/live-2026-07-19-ratings-split-load-timeout.md]
- **split-snapshot-transfer-pacing-main**: Adversarial checklist review passed locally: the composed guard binds real source/child stores and real CDC subscribers to the live first-yield ordering; snapshot transfer is explicitly non-logical CDC, live mirrors remain visible, upsert replay is idempotent, descriptor evidence refreshes per child, and failures retain the existing processed query outcome and budget. (rules out: Do not interpret raw transport acknowledgement as processing success or add an unbounded backfill retry.) [solve/changes/split-snapshot-transfer-pacing/verification.md]
- **split-snapshot-transfer-pacing-main**: Independent verification found that the 64-row batch could exceed SQLite's 32766 bind-variable limit for valid wide schemas (for example 64 x 512 = 32768); cap every proposal by the bind budget and prove the wide-table case. [subagent:verify_split_backfill_pacing]
- **split-snapshot-transfer-pacing-main**: DT red-on-revert proven for test/partition/split-backfill-internal-pacing.test.js [dt:solve/changes/dt-prove/split-backfill-internal-pacing.test.js-2026-07-19T13-56-29-860Z.json]
- **split-snapshot-transfer-pacing-main**: Replacement attempt caps rows twice: the accessor chooses min(configured rows, floor(32766/columnCount)) so cooperative yield cadence is safe, and the routing owner re-chunks each child group defensively. A real 512-column x 64-row SQLite test dispatches 32256 and 512 binds and commits all 64 rows. (rules out: Do not assume the configured row batch alone bounds SQL statement size; every multi-row proposal must also respect the bind-variable budget.) [solve/changes/split-snapshot-transfer-pacing/verification.md]
- **split-snapshot-transfer-pacing-main**: Independent verification approved replacement attempt 2: exact current diff, same-base superset of rejected attempt 1, real 512-column bind-budget transfer, accessor [63,1] batching, CDC/foreground/routing/fencing/bounded-failure contracts, lint, file-size, and focused regressions all passed. [subagent:verify_split_backfill_pacing]

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-19T13:49:24.578Z | split-snapshot-transfer-pacing-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/split-snapshot-transfer-pacing/attempt-1.diff |
| 2026-07-19T13:56:58.842Z | split-snapshot-transfer-pacing-main | local-fix | 0 -> 0 | flat | solved |  | diff:solve/changes/split-snapshot-transfer-pacing/attempt-2.diff |
