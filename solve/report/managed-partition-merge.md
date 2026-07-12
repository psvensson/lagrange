# Solve report: managed-partition-merge

**Goal:** Adjacent under-threshold partitions actually merge in production: a ManagedMergeWorkflow mirroring the split workflow drains two source partitions into one target via CDC fan-in catch-up, applies a durable epoch cutover that collapses the two key ranges in the authoritative topology, dissolves the retired raft group, and is wired as executeMergeCandidate in runtime composition with admission gating; guard tests prove lifecycle progression, data completeness, and post-merge routing.

**Class:** product · **Closure:** MEASURED

**Outcome:** SOLVED (MEASURED) — evidence: test-output/reports/managed-partition-merge-2026-07-12T17-58-32-900Z.report.json

**Attempts:** 1

## Scope Pressure
- Changed files: 25
- Change bytes: 255685
- Owner areas: src/entrypoint-runtime-admin-composition.js, src/partition, test/partition
- Categories: runtime, test
- Action: split by owner area before the next attempt (25 files)
- Action: land or separate 3 owner areas: src/entrypoint-runtime-admin-composition.js, src/partition, test/partition
- Split plan:
  - src/partition: 19 file(s)
  - test/partition: 5 file(s)
  - src/entrypoint-runtime-admin-composition.js: 1 file(s)
- Signal: broad-source-scope severity=medium
- Signal: large-diff-stack severity=medium

## Frontiers
- **managed-partition-merge-main** [solved] rung 1, attempts 1, metric 0 -> 0

## Findings
- **managed-partition-merge-main**: Subagent verifier approved after FOUR adversarial rounds (final verdict APPROVE), each earlier round REJECTED with runnable production-code repros that were then fixed: r1 found sibling-blackhole cutover (non-participating partitions unroutable after epoch promotion), fail-unsafe cutover on stale CATCHUP_READY (failure acks never emitted, acked writes lost), terminal transition lock, ack-before-flush staleness, and replay reorder; r2 found the abort/cutover interleave promoting the epoch onto a torn-down target (fixed with a FIFO owner lane plus in-step status re-validation); r3 found FIFO slots being swallowed by the coalescing lane shared with execute (fixed with a distinct slot lane key and execute's mutating phase routed through the same FIFO); r4 re-ran all seven repros green and probed the final structure with no new defect. Data-integrity properties all verified; guards grew to 259 assertions across four files with 3-partition and failing-source fixtures [subagent:aacfee0b85a70ab2d]
- **managed-partition-merge-main**: Live multi-node validation required before trusting merge under churn (deterministic in-proc guards cannot cover these, per verifier): per-process FIFO lane means dual-owner-instance concurrency serializes only via durable last-writer-wins (includes the overlapping-pair concurrent-admission race from two owner nodes); CDC apply ordering of sibling-promotion vs epoch writes can transiently blip sibling-range routing at cutover; REMOVE_REPLICA teardown vs retry re-provision race on the reused target id; source raft leader failover mid-merge has no mirror resume path (relies on failure acks plus the 2-minute cutover-wait timeout); ack-propagation latencies under cache-visibility waits. Also advisory: a DISSOLUTION_FAILED source needs a re-delivered SOURCE_MIRROR_REMOVED ack or operator action to retry dissolution (no periodic re-driver by design, data-safe); settleMergeOwnerLaneForWorkflow must never be called from inside a FIFO slot

## Theories
_(none recorded)_

## Selected Theories
_(none selected)_

## Theory Results
_(none recorded)_

## Attempt log
| ts | frontier | rung | metric | result | blocker movement | theory | change |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-07-12T17:58:46.058Z | managed-partition-merge-main | observe | 0 -> 0 | flat | no_evidence |  | diff:solve/changes/managed-partition-merge/attempt-1.diff |
