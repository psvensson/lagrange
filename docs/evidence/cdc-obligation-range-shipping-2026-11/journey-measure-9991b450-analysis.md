---
audience: evidence
recorded: 2026-11-14
quest: cdc-obligation-range-shipping
---

(Typographic dashes in this report were replaced by ASCII hyphens for the documentation audit; nothing else was changed.)

# Measurement: range shipping + lifecycle row integrity (measure head 9991b450d), compared with ed708dfd

This is a measurement only. It makes no acceptance judgement and changes no product code.

## Route

| item | value |
|---|---|
| integration branch | `integration/foundation-stability-20261114` = `589c1e2f70c1910026367d4ab4461e67e81b5d52`. It is `--no-ff` merge of `5778ba12e` onto `596ca79c0`. The merge had no conflict and contains no diagnostics. |
| measurement branch | `measure/foundation-stability-20261114` = `9991b450db37529ba1a25e993c99d6d441e8c89e`. It is one diagnostic commit on top of the integration head. It is throwaway and never merged. |
| worktree | `/mnt/data/peter/projects/lagrange-integration-20261114`. It currently has the measurement branch checked out. |
| sanity job | `593f921e-fee6-44aa-9d50-03e0b8ba6d6a`, tv-dator: COMPLETE, exit 0, 32.8 s. 4/4 files and 151 assertions passed. Evidence in `journey/sanity-9991b450/`. |
| journey job | `4216bd0b-3da9-4bcb-b796-f52953fd2dba`, tv-dator: FAILED, exit 1, 232.1 s, scenario duration 164.2 s. Evidence is COMPLETE in `journey/measure-9991b450/`. Console output is in `journey/measure-9991b450.console.txt`. |
| scripts and outputs | `journey/analysis/`: `report.py`, `census.py`, `lane.py`, `slot.py`, `episodes.py`, `recipients.py`, `partialrow.py`, `roleregress.py`, `heldgrowth.py`, `warnings.py`, plus their `.txt` outputs. Decompressed node logs are in `analysis/logs/`. |

Not checked: the lifecycle candidate adds three new test files, but the range-shipping candidate's `test/shards/*` classes and impact-graph seal were generated without them. The merge did not conflict, so I did not regenerate anything. Whoever lands the composition should check the shard/seal generators.

Nodes: seed `df007a99` (it led every system partition all run, so it was the only CDC sender), `77047968` (n770) and `cffe6937` (ncff). T0 = first `source-drive` = 10:11:16.991Z.

## What the diagnostics observe

These are ported from `fdac33abe`/`5eda223eb`/`229e8859e`/`ed708dfd0`. The receiver and cache code applied unchanged. The lane and slot observations were re-placed in the new code.

- **Lane** (`partition-cdc-obligation-delivery.js`):
  - `source-drive` is logged once per presented vector. It records the table, rows, first/last `(logIndex, ordinal)`, the composition cut (`captured_tail` / `row_not_ready` + whether the next row is pending / `byte_bound` / `ship_window`), whether the cell's range was presented again, whether the first entry was above the window, the window before the wave, owed and READY rows after the cut (bounded read of 1024 rows), the oldest member's event timestamp, every member's `[logIndex, ordinal, hlcMs]`, and wall time.
  - `subscriber-answer` is logged per branch: coverage state, answer fields, window.
  - `source-shipped` records covered/provisional, rows acknowledged, and the window before and after.
  - `source-held` records the error chain, the retry disposition, and the window before and after.
  - `source-ack-backpressure` is logged when acknowledgement backpressure stops the lane.
  - The cut is read from a measurement-only `WeakMap` beside the composed range in `partition-cdc-obligation-range.js`.
- **Slot** (`cdc-group-propagation-durable-delivery.js`):
  - `propagation-admitted` / `refused` / `released` carry the vector fields, the full queue, `queuedSinceMs` and `admittedAtMs`.
  - The new `propagation-leaf` records each leaf's start/end, whether it is the source or a target, the target node and the answer.
- **Scope:** lane and slot stages cover every table. Receiver and cache stages stay on `services` and `replica_operations` to bound log volume. Cache rows now also carry `raft_role` and whether it is present.
- **Observation only:** every observer catches its own failure and its return value is never read.

## Scenario and predicates (ed708dfd → this run)

| | ed708dfd | 9991b450 |
|---|---|---|
| outcome / verdict | failed / BLOCK_EVIDENCE_INCOMPLETE (log_window_coverage_incomplete) | same |
| duration | 234.9 s | 164.2 s |
| a-f, observation-integrity | met | met |
| g (boundMs 1000) | **5 persistent**, all priority_spread | **2 persistent**: 1 ledger_in_flight, 1 priority_spread |

g episodes in this run:

1. **ledger_in_flight**
   - Observer: n770.
   - Row: replica_operations REMOVE `2be67b81`. The authority has it `failed` at log index 52; the observer still held `removing`.
   - Timing: firstSeen +46.6 s, longest span 2416 ms. There is no projection exclusion.
   - Chain: idx 52 was committed (HLC) at +47 551 and driven 139 ms later. The slot refused it 15 times over 3.05 s. Occupants rotated services → nodes → control_plane_publications, with the FIFO queue 2-4 tables deep. It was admitted at +50 742.
   - Repair: observation reconciliation installed `failed` at +50 020, and the CDC event arrived at +50 852.
   - Separately, the REMOVE itself failed ("Message not acknowledged", seed 10:12:04.700).
2. **priority_spread**
   - Observer: ncff.
   - Row: schema_operations-p1 / `schema_operations-p1-r5`. The observer has it `syncing` with role null; the authority has it `active` / `follower` at idx 391.
   - Timing: longest span 1218 ms. Exclusion: `status_syncing`.
   - Chain: services idx 386 (the r5 `creating` row) was committed at +88 264 and driven 54 ms later. The slot refused it 19 times over 4.73 s (occupants replica_operations, nodes, control_plane_publications, storage_reservations). It was admitted at +93 048.
   - idx 391 (`active`, committed +90 997) sat behind 386 in the lane. It shipped in the next vector, 387..393, at +93 335, and arrived on ncff at +93 546.
   - Reconciliation at +89 646 (authority idx 388) only brought the row to `syncing`.

Neither episode has a lane backlog in it: commit → first drive was 54 and 139 ms. Both are waits for the node-wide slot.

## Lane

| metric (seed lane) | ed708dfd | 9991b450 |
|---|---|---|
| services events / vectors shipped | 136 / 136 waves (1 event each) | 128 / 67 vectors (129 rows; sizes 1×39, 2×14, 3×3, 4×5, 5×3, 6×3) |
| services commit → first drive p50 / p90 / max | 10 614 / 22 182 / 32 750 ms | **602 / 2 838 / 11 341 ms** |
| services commit → lane answer p50 / p90 / max | - | 1 950 / 4 011 / 8 013 |
| services commit → remote receiver-entry p50 / max | 11 267 / 33 377 | **n770 1 669 / 7 868; ncff 1 775 / 7 947** (p90 3.8 / 3.9 s) |
| services drive attempts per event p50 / p90 / max; events with more than 1 | 1 / 10 / 33; 31 | 1 / 12 / 28; 36 |
| replica_operations sender | seed for 5 events, then de5a | seed for the whole run |
| replica_operations commit → first drive p50 / max | 1 932 / 18 123 (de5a) | 611 / 6 561 |
| replica_operations commit → remote receipt p50 / max | - | 1 094-1 339 / 7 685 |
| replica_operations vectors | 197 waves | 92 vectors carrying 200 rows (max 11) |

- **Window:** it opens slowly and never halves.
  - services: 1 → 2 (+1.8 s) → 4 (+14.3 s) → 8 (+21.7 s).
  - replica_operations: 1 → 16 (+72.5 s).
  - nodes reached at most 4, control_plane_publications 8, storage_reservations 4.
  - All 1 186 held drives are typed backpressure (`cdc_committed_acceptance_backpressure`, slot busy). That disposition never narrows the window, so there were 0 halvings.
- **Which bound cut:**
  - 1 487 of 1 507 presented vectors were cut at `captured_tail`, and 20 at `ship_window`.
  - No vector was cut by the byte bound, by a not-READY row or by acknowledgement backpressure, and there were 0 `source-ack-backpressure` records.
- **Owed depth:** after the first 10 s the maximum number of READY rows past the cut, per 10 s bucket, was 1-6 for services and 3-10 for replica_operations. The initial 278 services rows were hydrated and acknowledged without delivery. The lane is no longer backlogged.
- **New finding: a vector does not grow while its lane waits for the slot.**
  - 742 of 1 507 drives were cut at the scan's captured tail while 1-10 READY rows (p50 2) were already owed past it.
  - After a refused run (p50 10 refusals), the vector finally admitted had p50 1 row. The backlog follows in a second wave.
  - In both episodes that second wave was admitted at once, because services still held the slice. So the cost was small, but the batching that range shipping should give under contention is mostly lost.

## Slot (cause 2, unrepaired)

| | ed708dfd | 9991b450 |
|---|---|---|
| waves (all tables) | instrumented tables only | 292 waves carrying 503 rows |
| wave p50 / p90 / max | 460 / 796 / 1 295 (services) | 350 / 665 / 1 342; services 351 |
| wave by vector size (p50) | - | 1 row 314, 2 rows 412, 3 rows 442, 4 rows 427, 5 rows 662, 6+ rows 452. Least squares: **328 ms + 42 ms/row**, so a 6-row wave costs about 1.4× a 1-row wave. |
| per-leaf legs (p50 / p90) | source apply 94/209, then a038 54/69, then de5a 151/277, tail 129 (receiver-side method) | source apply 72/199, target n770 98/255, target ncff 154/365, last leaf → release 2/5, admission → first leaf 1/2. Order is source, n770, ncff in 261 waves; 0 waves had a re-sent leaf. |
| refusals | 376 (two instrumented lanes) | 1 215 (all `busy`) |
| occupants at refusal | nodes 143, cpp 119, storage_res 51 … | replica_operations 310, services 295, cpp 179, nodes 173, storage_res 121, service_endpoints 27 …; idle (yield hold) 35 |
| queue length at refusal p50 / max | - | 3 / 6 |
| services lane: in wave / waiting for slot | 66.9 s / 89.3 s | **26.8 s / 61.6 s** |
| slot wait per admitted vector (first refusal → admission) p90 / max | - | services 2 991 / 7 644; replica_ops 2 161 / 5 562; nodes 3 203 / 8 208; storage_res 4 528 / 7 903; all tables sum 287 s |
| slot utilisation | not measurable | **82.5 %** of 141.6 s. 81-96 % per 10 s bucket from +10 s to +140 s. |

The slot is saturated, and every table on the seed queues behind it. In each wait the lane is refused about every 100-300 ms until its turn in the rotation of 3-5 tables.

## Recipients

- **Order:** 0 inversions in first occurrence on every node, for both observed tables (previous run: 0).
- **Missing live receipts:**
  - replica_operations: none on any node.
  - services: n770 is missing 284-290 and ncff 284-296. All of these come before each node's first live receipt (n770 291, ncff 297) and are covered by its first catch-up (authority idx 295 and 298). This is join timing, not a drop, as before.
  - services idx 3: driven once at +48 ms, refused, never re-driven. Then 4-283 were acknowledged as hydrated. This is the same benign anomaly as ed708dfd.
- **Multi-member vectors:** apply spans on the receivers were p50 0-1 ms, max 2 ms. The members of a vector apply together.
- **Duplicate-flagged entries:** services 6/6/2 per node, replica_operations 0.

## Partial-row cause (cause 3)

- `raft_role_missing` appears 0 times in the logs and the report (previous run: episode 1).
- There were 12 `authoritative_service_lifecycle_reconciliation` services writes. Every one ends with the same `raft_role` as the authority row with the same `updated_at` (null while `syncing`, and `follower` for the schema-job row).
- New visibility (not a predicate cause), on n770 `sql_transactions-p1-r5` (+97.6 s) and ncff `schema_operations-p1-r4` (+63.7 s):
  - A local role-only `cdc_merge` (no source index) sets `follower` ahead of the authority.
  - A CDC event with the same `updated_at` and role null then resets it.
  - The next event (+0.4 s / +0.2 s) restores `follower`. It is a transient flap of at most about 0.4 s.

## Errors and warnings that are not backpressure

- **Seed:**
  - 4 REMOVE "Message not acknowledged" operation failures, all targeting the seed (previous run: 1 "Replica removal failed"). One of them is episode 1's row.
  - 1 event-loop gap of 2013 ms, at startup before T0. The previous run also had a 1381 ms gap mid-run; this run had none.
  - 1 router delivery-ACK wait spent (595 / 499 ms).
  - Unchanged from before: 1 "Raft CDC command failed" (partitions, pre-join), 1 "Out-of-order CDC event" (pre-join), 4 "Bootstrap snapshot diverged" (previously 7), 3 WebSocket/reconnect errors (previously 9).
- **Followers:**
  - "Wait bound spent" 18/17 (previously 28/22). These are mostly `REPLICA_OPERATION_READ_RETRY_TIMEOUT_MS` and dynamic-config startup reads.
  - "Skipping ACK-timeout quarantine" 1/1 (previously 16/2).
  - "Invalid state transition" (same-state) 6/4.
  - 1 "CDC catch-up hydration table read failed" on n770 (replica_operations, "complete authoritative observation did not advance cache truth").
  - Shutdown noise.
- **CPU:** the logs carry only heap/RSS samples (seed RSS 157 → 472 MB) and the event-loop watchdog. There is no direct CPU measure.

## Cause attribution

| remaining failure | cause |
|---|---|
| g episode 1 (ledger_in_flight, n770, replica_operations idx 52) | **Slot (cause 2).** 3.05 s refused behind a 3-4 table rotation. The trigger, a REMOVE failing with "Message not acknowledged", is a separate product behaviour; it explains why the row changed, not the lag. |
| g episode 2 (priority_spread, ncff, services idx 386 → 391) | **Slot (cause 2).** 4.73 s refused, plus head-of-line blocking of 391 behind 386 in the lane. |
| verdict reason `log_window_coverage_incomplete` | Same as the previous run. Not analysed here. |
| vector does not grow while held | **Newly shown in this run.** It is a property of the range-shipping candidate (the scan tail is captured once per scan). It does not cause either episode by itself. |
| 4 REMOVE "Message not acknowledged" failures | Unexplained. More than before (1). |

Causes 1 (lane backlog) and 3 (partial row) do not appear in this run.

## What one more measurement would settle

Both episodes only just exceed the bound (1.2 s and 2.4 s against 1.0 s). Each is one slot wait in a slot that is about 90 % busy. Two runs would settle the question:

- **A repeat on 9991b450.** One run of the same head with the same diagnostics shows whether this residual is stable (episode count, slot utilisation, wait distribution) or whether this run was lucky.
- **The decisive one, once a slot repair candidate exists.** Compose it the same way and run the identical journey. With slot waits gone, the predicted commit → receipt is about 0.4-1 s (one wave of 328 + 42·rows ms). If g still fails then, the remainder belongs to the reconciliation cadence or to something new.

The same run should also check whether re-capturing the scan tail on a slot retry makes the vector carry the backlog.
