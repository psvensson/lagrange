---
epicContractVersion: 2
id: split-merge-transition-integrity
roadmapRow: null
graduatesTo: null
---

# Epic: Split/merge transition integrity

## Intent (why now)

The verified split/merge audit (2026-08-04) confirmed that merge is a working
template and split systematically lacks its safeguards: a split never reaches a
terminal state (every table's first split poisons it forever), workflow
ownership is process-local, the replay cursor is volatile RAM, and restart
mid-transition silently disables mirroring. Tier 1 is committed (`8cd59ab70`:
mirror identity, joinable flush, catch-up ordering, partition-key UPDATE
rejection, epoch-write effect assertions, orphan-child cleanup). This epic
holds the remaining structural items as a dependency-ordered ladder; the
critical constraint is that the terminal-lifecycle quest must land sibling
carry-forward in the same change, or fixing the stuck-table wedge arms the
latent sibling-stranding P0.

## The ladder

1. `split-terminal-lifecycle` — SPLIT_SOURCE_DISSOLVING → completed phases,
   `promoteSiblingPartitionVersion` port, `partition_count = oldCount + 1`,
   `pending_partition_version` cleared on FAILED, SPLIT_COMPLETED emitted at
   terminal. Must ship sibling carry-forward in the same change (audit
   findings F9 + F1 + F21 + F18).
2. `workflow-fencing-wiring` — connect the existing
   `claimDurableWorkflow`/`assertTransitionFence` into both coordinators, route
   source acks to the claimed owner, participant transition graph, sibling
   promotion after/into the epoch flip (F4 + F19 + F13).
3. `durable-replay-cursor` — persist snapshot barrier index + replay
   watermark, replay from the Raft log not the volatile array, bound the queue
   in the interim, start-or-resume the worker on recovery (F2 + F10 + F16).
4. `write-path-epoch-fencing` — carry `expectedPartitionVersion` in the QUERY
   payload, reject on mismatch in `handleRemoteQuery`; missing descriptor-epoch
   evidence defers (pre-cutover) or fails closed (post-cutover) (F6 + F15).

Independent: `managed-split-shutdown-timer-leak` (F17, already authored)
covers shutdown ownership; Tier 3 leftovers (F12 comparator, F14 dissolution
proof, F18 abort/teardown, F22 batched merge backfill, F23 overlap guard, F24
dead `setThresholds`) are sequenced after the ladder.

## Decision log

- 2026-08-04 — Epic authored from the verified split/merge audit. Tier 1
  committed as `8cd59ab70`. The audit's key sequencing discovery: F9 masks F1
  (a second split is always refused `TABLE_SPLIT_ALREADY_IN_PROGRESS` today),
  so terminal lifecycle and sibling carry-forward are one quest, not two.
- 2026-08-04 — Merge is the ready-made template for every split fix: sibling
  carry-forward, flush-before-ack ordering, queue guard on cutover-active
  mirroring, typed failure acks with fail-safe abort, target teardown on
  source failure, terminal transition clearing. Tier 2 quests port, not
  invent.
- 2026-08-05 — `managed-split-shutdown-timer-leak` (F17) EXHAUSTED on a
  refuted frame: its measured matrix proved the account-summary runner hang
  is caused by untorn-down request/call cell Workers (3 MessagePorts,
  reproducible with NO split; split-without-deploy exits cleanly), not by
  split timers — every split-merge timer is unref'd and none survive
  shutdown. The F17 shutdown-ownership goal landed through the successor
  quest `node-shutdown-cell-worker-teardown` (`bc975b558`): a stop-all chain
  (bootstrap seed/join cleanup → `ServiceRuntimeLifecycle.shutdown` →
  `WasmComponentDriver.shutdown` → `WasiComponentCellRuntime.shutdown` →
  `worker.terminate`) replaces the absent per-replica stop path at node
  teardown, and the runner's bounded-exit workaround is deleted — the runner
  exits naturally in ~24s after a forced managed split plus deployed cells.
- 2026-08-06 — Ladder COMPLETE: all four rungs landed with subagent-verified
  approvals and deterministic receipts. Rung 1 `split-terminal-lifecycle`
  (`9f9beecd7`): SPLIT_SOURCE_DISSOLVING dissolution + sibling carry-forward
  inside the serialized owner lane + terminal SPLIT_COMPLETED emission. Rung 2
  `workflow-fencing-wiring` (`9fe64a795`): both coordinators claim durable
  ownership through the existing claimDurableWorkflow/assertTransitionFence
  machinery (CAS claim triple in transition metadata), fenced source acks
  with typed STALE_FENCE rejection, explicit participant transition graphs,
  R1 abort/cutover race closed by same-owner same-fence resync-from-durable.
  Rung 3 `durable-replay-cursor` (`1792f8867`): snapshot barrier + replay
  watermark persisted via the source ack checkpoint seam, catch-up replay
  from the durable Raft log behind the watermark (never the volatile
  pendingEntries array), bounded mirror delta queues with typed
  backpressure, and leader-activation worker start-or-resume (reconstruction
  without resumption is not recovery). Rung 4 `write-path-epoch-fencing`
  (`f854dd1a5`): QUERY payload carries expectedPartitionVersion,
  handleRemoteQuery rejects stale epochs with a typed STALE_PARTITION_EPOCH
  outcome, and descriptor-epoch evidence gaps defer pre-cutover / fail
  closed post-cutover — fail-open on missing evidence is gone. Tier 3
  leftovers (F12, F14, F18, F22, F23, F24) remain sequenced after the
  ladder as their own quests.
- 2026-08-06 — Tier 3 leftovers authored as six quests:
  `split-key-comparator-typing` (F12: typed comparator owns split-key
  comparison; mixed-type key spaces rejected, never coerced),
  `split-dissolution-durable-proof` (F14: dissolution recorded only
  against a persisted partitions-row witness; owner-recorded dissolution
  acks fence-stamped), `split-abort-fence-parity` (F18 residual: the
  split abort transition persists through the fenced write path — the
  last unfenced owner-lane write),
  `merge-backfill-batching` (F22: merge snapshot backfill batches rows
  like routeSplitSnapshotBatch instead of per-row routed writes),
  `split-merge-overlap-guard` (F23: overlapping in-flight transitions
  refused durably at registration, not by the process-local handle
  check), and `dead-setthresholds-removal` (F24: the caller-less
  setThresholds mutator is deleted or wired into the configuration
  authority — exactly one threshold owner).
- 2026-08-06 — All six Tier-3 leftovers landed, each with an
  independent subagent terminal review and red-on-revert proof:
  `split-key-comparator-typing` (F12, `b3359f785`),
  `dead-setthresholds-removal` (F24, `cf6886624`),
  `merge-backfill-batching` (F22, `d27d77774`),
  `split-merge-overlap-guard` (F23, `833c2f33d`),
  `split-dissolution-durable-proof` (F14, `8bb94bd64`),
  `split-abort-fence-parity` (F18, `a712af2de`). F23 required two
  ratchet repairs en route (complexity extraction into the guard
  module, file-size rebalancing across the workflow mixins) — the
  landed shape keeps every ratchet at baseline (28/28 oversized
  source files, scoped complexity strictly improved). The epic's
  entire remaining ladder is now closed.
